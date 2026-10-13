/**
 * A 方案：动态壁纸覆盖层
 *
 * 为什么不用 shader（实测踩过的三个坑，都记在这里省得以后再试）：
 *   1. Phaser 的 add.shader() 只接受「已在 shader cache 里的 key」，
 *      而 cache 只能由 load.shader(key, url) 网络请求填充；
 *      直接把 fragment 源码字符串传进去 → setShader() 提前 return，
 *      program 恒为 null（实测 gl.getError()=1282 GL_INVALID_OPERATION）。
 *   2. 改成传 { vertexSrc, fragmentSrc } 配置对象 → 真的创建了 Shader 对象，
 *      结果 headless Chrome + swiftshader 直接
 *      "WebGL Context lost → Renderer disabled"，整个游戏白屏。
 *      真机（用户浏览器）没试，但不能拿真机赌。
 *   3. 所以最终方案是：**离线预渲染 N 帧波光 RGBA 图**（tools/make-livebg-water.py），
 *      游戏里几张全屏 image 交叉淡入淡出。一样是逐像素重算的观感，
 *      但完全不碰 Shader 对象、也不依赖 GPU 特性支持。
 *
 * 分三层：
 *   water  预渲染波光帧序列（只覆盖水面，遮罩按场景背景图自动算）
 *   motes  上浮的光点（Phaser 粒子）
 *   decor  星星 + 湿沙反光（Graphics + tween）
 *
 * ★ 本文件现在【整层默认关闭】，因为 B 方案（SceneVideo 的整幅视频背景）
 *   已经接管了这件事：
 *     - 视频层是 depth=1 的不透明全屏图，会把本文件所有 0.4~0.7 的装饰
 *       全部盖死 —— 开着纯属白烧 CPU（粒子、graphics、tween 每帧都在跑，
 *       一帧画面都露不出来）。
 *     - 本来想靠「把装饰层抬到视频上面」来保留，但那等于在视频上再叠一层
 *       假光效，反而盖掉 AI 画出来的真实水光和星光，还多一份全屏合成开销。
 *     - WATER_SCENES 也是空的：水面波光早就由视频本身提供了。
 *   保留本文件是因为它记录了一整套「为什么放弃 shader」的实测结论
 *   （见文件头第 4~15 行），以后想再加 GPU 特效时不用从头踩一遍。
 *   需要临时打开做对比时：?lb=decor / ?lb=motes / ?lb=all（并确保 ?bgv=off）。
 *
 * 用 URL 参数控制，方便一次跑一个组合：
 *   ?lb=off        全部关（等于原版，也是现在的默认值）
 *   ?lb=water      只开水面
 *   ?lb=motes      只开光点
 *   ?lb=decor      只开星星+湿沙
 *   ?lb=all        全部开
 */

export const TILE = 64;
export const COLS = 40;
export const ROWS = 24;
export const W = COLS * TILE;
export const H = ROWS * TILE;

// 波光帧数要和 tools/make-livebg-water.py 的 --frames 一致
export const WATER_FRAMES = 6;
// 一轮波光的时长（毫秒）。帧数固定，越长每帧间隔越大、越容易看出卡顿感
export const WATER_PERIOD = 9000;
// 生成帧时的输出分辨率（见 make-livebg-water.py 的 --out）。
// 1280x768 和游戏画布 2560x1536 同比例（都是 5:3），所以直接 setDisplaySize 拉伸即可
export const WATER_OUT = { w: 1280, h: 768 };
// 哪些场景启用水面波光（只启有水的，别的场景开了也是浪费）
export const WATER_SCENES = new Set([]);

function flags() {
  const q = new URLSearchParams(location.search);
  const v = q.get('lb');
  // ★ 默认全关：视频背景（SceneVideo）已经覆盖了这三层的职责，见文件头说明。
  if (!v) return { water: false, motes: false, decor: false };
  return {
    water: v === 'water' || v === 'all',
    motes: v === 'motes' || v === 'all',
    decor: v === 'decor' || v === 'all',
  };
}

/**
 * 预加载波光帧。
 *
 * 为什么单独一个函数：Phaser 的 load.image 是异步流程，
 * 而 createLiveBackground 在 create() 里同步调用，那时纹理还没解码好。
 * 所以在 VenueScene.preload() 里对可能用到的场景全部排队，
 * 用到哪个读哪个（纹理不存在就不创建那层，静默降级）。
 */
export function loadWaterFrames(scene) {
  for (const sceneId of WATER_SCENES) {
    for (let k = 1; k <= WATER_FRAMES; k++) {
      const key = `livebg-water-${sceneId}-${k}`;
      if (!scene.textures.exists(key)) {
        scene.load.image(key, `assets/livebg/water-${sceneId}-${String(k).padStart(2, '0')}.png`);
      }
    }
  }
}

/**
 * 创建动态壁纸层。
 * @returns {{flags:object, active:boolean, waterFrames:number, update:function, destroy:function}}
 */
export function createLiveBackground(scene, sceneId) {
  const f = flags();
  if (!WATER_SCENES.has(sceneId) && !f.decor && !f.motes) {
    return { update() {}, destroy() {}, flags: f, sceneId, active: false, waterFrames: 0 };
  }

  const objs = [];
  const tweens = [];
  let waterFrames = [];
  let waterIdx = 0;
  let waterTimer = 0;

  // ---- 1. 水面波光（预渲染帧交叉淡入淡出）----
  //
  // 为什么不用 tileSprite 滚动：那是「整张图整体平移」，
  // 观感是背景在抽动而不是水面在荡漾，而且滚一格就露一次边。
  // 预渲染帧 + 交叉淡入淡出更接近动态壁纸；代价是 N 张全屏 RGBA 的显存
  //（1280x768x4B x 6 ≈ 23 MB，可接受）。
  if (f.water && WATER_SCENES.has(sceneId)) {
    for (let k = 1; k <= WATER_FRAMES; k++) {
      const key = `livebg-water-${sceneId}-${k}`;
      if (!scene.textures.exists(key)) break;
      const img = scene.add.image(0, 0, key);
      img.setOrigin(0, 0);
      img.setDepth(0.5);
      img.setDisplaySize(W, H);
      img.setAlpha(k === 1 ? 1 : 0);
      // ★ 只有当前帧是可见的，其余 setVisible(false)。
      //   6 张全屏 RGBA 每帧全画一遍，光栅化开销在 swiftshader 上直接把 FPS 从 60 打到 38；
      //   藏掉不画的之后只剩 1 张要合成。（真机 GPU 上没这么夸张，但白省的开销没有不省的道理）
      img.setVisible(k === 1);
      objs.push(img);
      waterFrames.push(img);
    }
  }

  // ---- 2. 光点 ----
  if (f.motes) {
    if (!scene.textures.exists('livebg-mote')) {
      const g2 = scene.make.graphics({ x: 0, y: 0 }, false);
      g2.fillStyle(0xffffff, 1);
      g2.fillCircle(8, 8, 7);
      g2.fillStyle(0xffffff, 0.35);
      g2.fillCircle(8, 8, 8);
      g2.generateTexture('livebg-mote', 16, 16);
      g2.destroy();
    }
    const motes = scene.add.particles(0, 0, 'livebg-mote', {
      x: { min: 0, max: W },
      y: { min: H * 0.45, max: H * 0.95 },
      lifespan: { min: 11000, max: 20000 },
      speedY: { min: -7, max: -2 },
      speedX: { min: -4, max: 4 },
      scale: { min: 0.5, max: 1.6 },
      alpha: { start: 0.0, end: 0.0 },
      quantity: 1,
      frequency: 620,
      blendMode: 'ADD',
    });
    motes.setDepth(0.7);
    motes.setAlpha(0.55);
    objs.push(motes);
  }

  // ---- 3. 星星 + 湿沙 ----
  if (f.decor) {
    let seed = 20261013;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const stars = scene.add.graphics().setDepth(0.4);
    for (let i = 0; i < 80; i++) {
      stars.fillStyle(0xffffff, 0.22 + rnd() * 0.5);
      stars.fillCircle(rnd() * W, rnd() * H * 0.30, 0.7 + rnd() * 1.3);
    }
    objs.push(stars);
    tweens.push(scene.tweens.add({
      targets: stars, alpha: { from: 0.45, to: 1 }, duration: 3200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    }));

    const rim = scene.add.graphics().setDepth(0.45);
    rim.fillStyle(0xffffff, 0.045);
    rim.fillEllipse(W * 0.5, H * 0.62, 2100, 130);
    rim.fillEllipse(W * 0.5, H * 0.78, 1750, 110);
    objs.push(rim);
    tweens.push(scene.tweens.add({
      targets: rim, alpha: { from: 0.5, to: 1 }, duration: 6100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    }));
  }

  const n = waterFrames.length;
  return {
    flags: f,
    sceneId,
    active: n > 0,
    waterFrames: n,
    update(time, delta) {
      if (!n) return;
      const step = WATER_PERIOD / n;
      waterTimer += delta;
      // 用 while 而不是 if：掉帧时一次要补好几帧，不能丢
      while (waterTimer >= step) {
        waterTimer -= step;
        const prev = waterFrames[waterIdx];
        waterIdx = (waterIdx + 1) % n;
        const next = waterFrames[waterIdx];
        prev.setAlpha(0);
        prev.setVisible(false);
        next.setAlpha(1);
        next.setVisible(true);
      }
    },
    destroy() {
      tweens.forEach((t) => t.remove());
      tweens.length = 0;
      objs.forEach((o) => { if (o && o.destroy) o.destroy(); });
      objs.length = 0;
      waterFrames = [];
    },
  };
}
