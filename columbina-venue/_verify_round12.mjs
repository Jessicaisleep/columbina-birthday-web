/**
 * 第 12 轮验收：动态背景视频层（B 方案）
 *
 * ⚠ 三个写这个脚本时踩到的坑，改脚本前先看：
 *
 * 1) 必须 `localStorage.clear()` + `reload()` 再测。
 *    headless + swiftshader 下首帧建视频纹理会报
 *    "Framebuffer status: Framebuffer Unsupported" 并丢 WebGL context，
 *    于是 window.__venueScene 变 undefined。reload 之后就正常了。
 *
 * 2) 不能用 `children.list.filter(o => o.type === 'Video')` 数视频个数。
 *    Video 对象是故意缓存复用的（来回切场景不重复解码），
 *    旧的会一直留在 display list 里，只是 setVisible(false)+setActive(false)。
 *    所以数量会一路涨到 10，断言要数「可见的」而不是「存在的」，
 *    而且要用 s.sceneVideo.current 拿当前那一个。
 *
 * 3) 不能用 setDisplaySize() 设视频尺寸。
 *    构造时 Video 先 setSize(256,256)（Video.js:529），纹理还没建；
 *    VIDEO_TEXTURE 事件（Video.js:873）又早于 setSizeToFrame()（886）。
 *    任何一处在对象尺寸还是 256x256 时算 scale，都会留下 scale=10，
 *    帧就位后渲染成 25600x15360（10 倍大）。SceneVideo.js 里已改用
 *    setScale(SCENE_W/videoWidth, SCENE_H/videoHeight)。
 *
 * 用法：cd venue && node _verify_round12.mjs
 */
import puppeteer from 'puppeteer';

const URL = 'http://localhost:5173/venue.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0;
const fails = [];
function ck(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fails.push(name); console.log(`  ❌ ${name}  ${detail === undefined ? '' : JSON.stringify(detail)}`); }
}

const b = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required',
    '--window-size=1280,760'],
  defaultViewport: { width: 1280, height: 760 },
});
const p = await b.newPage();
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));

await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.evaluate(() => { try { localStorage.clear(); } catch {} });
await p.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(3000);

// 统一的场景探针：只看「当前挂着的那个」
const probe = (id, waitMs = 1500) => p.evaluate(async (sid, w) => {
  const s = window.__venueScene;
  s.scenes.load(sid, null, true);
  await new Promise((r) => setTimeout(r, w));
  const v = s.sceneVideo.current;
  const el = v ? v.video : null;
  const visibleVids = s.children.list.filter((o) => o.type === 'Video' && o.visible).length;
  return {
    scene: s.scenes.current.id,
    hasCurrent: !!v,
    visibleVids,
    totalVids: s.children.list.filter((o) => o.type === 'Video').length,
    depth: v ? v.depth : null,
    active: v ? v.active : null,
    frameReady: v ? v.frameReady : null,
    dw: v ? Math.round(v.displayWidth) : null,
    dh: v ? Math.round(v.displayHeight) : null,
    scaleX: v ? Number(v.scaleX.toFixed(4)) : null,
    src: el ? el.getAttribute('src') : null,
    paused: el ? el.paused : null,
    muted: el ? el.muted : null,
    loop: el ? el.loop : null,
    vw: el ? el.videoWidth : null,
    vh: el ? el.videoHeight : null,
    t: el ? el.currentTime : null,
    err: el && el.error ? el.error.code : null,
  };
}, id, waitMs);

// ---------- A. 接入 ----------
console.log('\n[A] 接入');
const a = await p.evaluate(() => {
  const s = window.__venueScene;
  return {
    hasSceneVideo: !!s.sceneVideo,
    injected: s.scenes.video === s.sceneVideo,
    depth0: s.children.list.filter((o) => o.depth === 0 && o.type === 'Image').length,
    scene: s.scenes.current.id,
  };
});
ck('A1 SceneVideo 实例存在', a.hasSceneVideo, a);
ck('A2 已注入 SceneManager', a.injected, a);
ck('A3 静态底图仍在（depth 0 的 Image >= 1）', a.depth0 >= 1, a);

const a2 = await probe('home');
ck('A4 home 挂上了当前视频', a2.hasCurrent && a2.scene === 'home', a2);

// ---------- B. 逐场景 ----------
console.log('\n[B] 逐场景挂载 / 尺寸 / 播放');
const SCENES = ['home', 'mailbox', 'venue', 'icefield', 'pools',
  'moonpath', 'starship', 'shallows', 'pond', 'grove'];
for (const sc of SCENES) {
  const r = await probe(sc);
  ck(`B-${sc} 当前视频存在`, r.hasCurrent, r);
  ck(`B-${sc} 可见 Video 恰好 1 个`, r.visibleVids === 1, r);
  ck(`B-${sc} depth === 1（底图0 与 光圈标记2 之间）`, r.depth === 1, r);
  ck(`B-${sc} 纹理已建`, r.frameReady === true, r);
  ck(`B-${sc} 尺寸正好 2560x1536`, r.dw === 2560 && r.dh === 1536, r);
  ck(`B-${sc} scale ≈ 1.0（原生就是 2560x1536，不放大）`, Math.abs(r.scaleX - 1) < 0.01, r);
  ck(`B-${sc} 源指向 scenes-video/${sc}.mp4`,
    (r.src || '').endsWith(`scenes-video/${sc}.mp4`), r);
  ck(`B-${sc} muted（noAudio 生效）`, r.muted === true, r);
  ck(`B-${sc} loop=true`, r.loop === true, r);
  ck(`B-${sc} 正在播`, r.paused === false, r);
  ck(`B-${sc} 原生 2560x1536（与静态底图逐像素同尺寸）`, r.vw === 2560 && r.vh === 1536, r);
  ck(`B-${sc} currentTime 在走`, r.t > 0.05, r);
  ck(`B-${sc} 无解码错误`, r.err === null || r.err === undefined, r);
}

// ---------- C. 播放推进 ----------
console.log('\n[C] 播放推进');
await p.evaluate(() => { window.__venueScene.scenes.load('shallows', { tileX: 20, tileY: 9 }, true); });
await sleep(1300);
const c = await p.evaluate(async () => {
  const el = window.__venueScene.sceneVideo.current.video;
  const t0 = el.currentTime;
  await new Promise((r) => setTimeout(r, 1500));
  return { t0, t1: el.currentTime };
});
ck('C1 1.5s 内 currentTime 前进 0.9~2.1s',
  c.t1 - c.t0 > 0.9 && c.t1 - c.t0 < 2.1, c);

// ---------- D. 切场景：旧的收好、元素复用 ----------
console.log('\n[D] 切场景');
const d = await p.evaluate(async () => {
  const s = window.__venueScene;
  const snap = () => {
    const vids = s.children.list.filter((o) => o.type === 'Video');
    const cur = s.sceneVideo.current;
    return {
      total: vids.length,
      visible: vids.filter((o) => o.visible).length,
      activeVisible: vids.filter((o) => o.visible && o.active).length,
      currentIsVisible: cur ? cur.visible && cur.active : false,
      curSrc: cur && cur.video ? cur.video.getAttribute('src') : null,
    };
  };
  const out = {};

  s.scenes.load('pond', null, true);
  await new Promise((r) => setTimeout(r, 1300));
  out.afterPond = snap();
  const pondV = s.sceneVideo.cache.get('pond');

  const ts = [];
  for (let i = 0; i < 3; i++) {
    s.scenes.load('venue', null, true);
    await new Promise((r) => setTimeout(r, 800));
    s.scenes.load('pond', null, true);
    await new Promise((r) => setTimeout(r, 800));
    ts.push(Number(pondV.video.currentTime.toFixed(2)));
  }
  out.pondTimes = ts;
  out.sameObj = s.sceneVideo.cache.get('pond') === pondV;
  out.cacheSize = s.sceneVideo.cache.size;
  out.afterLoop = snap();
  return out;
});
ck('D1 切到 pond 后可见 Video 恰好 1 个', d.afterPond.visible === 1, d.afterPond);
ck('D2 pond 的 Video 可见且 active', d.afterPond.currentIsVisible === true, d.afterPond);
ck('D3 当前视频源正确',
  (d.afterPond.curSrc || '').endsWith('scenes-video/pond.mp4'), d.afterPond);
ck('D4 来回切 3 次复用同一个 Video 对象', d.sameObj === true, d);
// cache 恰好是 B 段预热过的 10 个场景；来回切不再增长（复用而非重新解码）
ck('D5 cache 停留在 B 段预热的 10 个，不增长', d.cacheSize === 10, d);
ck('D6 来回切后可见 Video 仍恰好 1 个', d.afterLoop.visible === 1, d.afterLoop);
ck('D7 没有残留的 active Video（同深度不会打架）',
  d.afterLoop.activeVisible === 1, d.afterLoop);
ck('D8 currentTime 没被重置（没有重新解码）',
  d.pondTimes[2] > d.pondTimes[0] && d.pondTimes[1] > 0.05, d.pondTimes);

// ---------- E. 兜底：?bgv=off ----------
console.log('\n[E] ?bgv=off 退回静态图');
const p2 = await b.newPage();
const errs2 = [];
p2.on('pageerror', (e) => errs2.push('PAGEERROR ' + e.message));
await p2.goto(URL + '?bgv=off', { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(3000);
const e = await p2.evaluate(() => {
  const s = window.__venueScene;
  return {
    vids: s.children.list.filter((o) => o.type === 'Video').length,
    depth0: s.children.list.filter((o) => o.depth === 0 && o.type === 'Image').length,
    hasPond: s.sceneVideo.has('pond'),
    cacheSize: s.sceneVideo.cache.size,
  };
});
ck('E1 关闭时一个 Video 都不创建', e.vids === 0, e);
ck('E2 关闭时静态底图照常', e.depth0 >= 1, e);
ck('E3 has() 返回 false', e.hasPond === false, e);
ck('E4 cache 为空', e.cacheSize === 0, e);
ck('E5 关闭时不报错', errs2.length === 0, errs2);
await p2.close();

// ---------- F. 循环 ----------
// ⚠ 这里只验「循环/时长/播放状态」这类可从 DOM 直接读到的属性。
//   「画面是否真的在动、正放倒放是否镜像」不要在这里断言：
//   headless + swiftshader 下 `canvas.drawImage(video)` 会画出全空图，
//   逐像素差恒为 0，所有判据失效（第一版就是这么误判的）。
//   那两项交给 `python tools/cmp-video-pingpong.py` 从文件侧用 ffmpeg 验证。
console.log('\n[F] 循环 / 时长');
await p.evaluate(() => { window.__venueScene.scenes.load('moonpath', null, true); });
await sleep(1600);
const f = await p.evaluate(async () => {
  const el = window.__venueScene.sceneVideo.current.video;
  const t0 = el.currentTime;
  await new Promise((r) => setTimeout(r, 1200));
  const t1 = el.currentTime;
  const seg = [];
  for (const want of [2.0, 4.5, 7.0, 9.5]) {
    el.currentTime = want;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    seg.push(el.currentTime);
  }
  el.play();
  return {
    dur: Number(el.duration.toFixed(3)),
    advanced: t1 - t0,
    seekable: seg.every((x, i) => Math.abs(x - [2.0, 4.5, 7.0, 9.5][i]) < 0.35),
    seg,
  };
});
ck('F1 时长 ≈10.08s（5.04 正放 + 5.04 倒放）', Math.abs(f.dur - 10.08) < 0.3, f);
ck('F2 仍在推进', f.advanced > 0.5, f);
ck('F3 全片长可 seek（首尾两段都在）', f.seekable === true, f);
ck('F4 循环后仍是播放态', await p.evaluate(
  () => window.__venueScene.sceneVideo.current.video.paused === false));

// ---------- G. 帧率 ----------
console.log('\n[G] 帧率（swiftshader 软渲染，仅作不死机下限）');
await p.evaluate(() => { window.__venueScene.scenes.load('grove', null, true); });
await sleep(1500);
const g = await p.evaluate(async () => {
  const out = [];
  let last = performance.now(); let n = 0;
  await new Promise((done) => {
    const tick = () => {
      const now = performance.now(); n++;
      if (now - last >= 700) { out.push(Math.round((n * 1000) / (now - last))); n = 0; last = now; }
      if (out.length < 4) requestAnimationFrame(tick); else done();
    };
    requestAnimationFrame(tick);
  });
  return out;
});
console.log(`  采样: ${JSON.stringify(g)}`);
ck('G1 软渲染下没崩（>15fps）', g[0] > 15, g);

// ---------- 汇总 ----------
console.log('\n=== 控制台错误 ===');
if (errs.length === 0) console.log('  （无）');
else errs.slice(0, 12).forEach((x) => console.log('  ⚠️ ' + x));

console.log(`\n=== 结果: ${pass} ✅ / ${fails.length} ❌ ===`);
if (fails.length) { fails.forEach((x) => console.log('  ❌ ' + x)); process.exitCode = 1; }
await b.close();
