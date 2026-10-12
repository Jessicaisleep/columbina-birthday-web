// 第 11 轮验收 —— 四项改动（2026-10-12，用户 m13727 / m13810 / m13877）
//
//   任务1：11 封邀请函的信纸上方画对应人物的 Q 版简笔画（`venue/public/assets/letters/*.png`），
//          图案与正文不重合（信纸拉长）
//   任务2：委托/任务的交互点在「接委托前隐藏 → 接委托后出现 → 委托完成后隐藏」
//   任务3：互动键 E → F（含左上角 HUD 提示、对话框推进、信纸推进）
//   任务4：青水浅滩的下方出生点（从星船草甸进来时的落点）改为 v3 标注的右下角格 (17,23)
//
// 跑法（必须在 venue/ 目录下，vite 要在 5173 就绪）：
//   node _verify_round11.mjs
import fs from 'node:fs';
import puppeteer from 'puppeteer';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 64;

const fail = [];
const ok = (cond, msg) => {
  console.log(`${cond ? '✅' : '❌'} ${msg}`);
  if (!cond) fail.push(msg);
};

// ===========================================================================
// E：源码级断言（不需要浏览器）
// ===========================================================================
const src = (rel) => fs.readFileSync(new URL(`./${rel}`, import.meta.url), 'utf8');

{
  const quests = src('src/quests.js');
  const scene = src('src/VenueScene.js');
  const dialog = src('src/DialogSystem.js');
  const letter = src('src/LetterSystem.js');
  const html = src('venue.html');
  const status = src('public/状态.html');

  ok(!/按 E/.test(quests), 'E1 quests.js 里已无「按 E」提示语（现在全是「按 F」）');
  ok((quests.match(/按 F/g) || []).length >= 20,
    `E2 quests.js 的「按 F」提示语 >= 20 处（实测 ${(quests.match(/按 F/g) || []).length}）`);
  ok(/this\.input\.keyboard\.addKey\('F'\)/.test(scene), "E3 VenueScene 互动键绑定到 addKey('F')");
  ok(/F 交互 \/ 对话/.test(scene), 'E4 左上角 HUD 文案已改成「F 交互 / 对话」');
  ok(!/按 E 对话|按 E 互动/.test(scene), 'E5 VenueScene 里已无「按 E 对话/互动」');
  ok(/keyInteract/.test(scene) && !/this\.keyE\b/.test(scene),
    'E6 字段名跟着按键改名（keyE → keyInteract），不留误导性旧名');
  ok(/toLowerCase\(\) === 'f'/.test(dialog), "E7 DialogSystem 推进键含 'f'");
  ok(/e\.key === 'f' \|\| e\.key === 'F'/.test(letter), "E8 LetterSystem 推进键含 'f'/'F'");
  ok(!/按 E \/ 点击/.test(letter) && !/按 E \/ 点击/.test(html), 'E9 信纸提示「按 F / 点击 继续」');
  ok(!/按 E/.test(status), 'E10 public/状态.html 帮助页已改「按 F」');

  const sh = src('src/scenes.js').match(/id: 'shallows'[\s\S]*?\n  \},/);
  ok(!!sh, 'E11 能在 scenes.js 里定位到 shallows 条目');
}

{
  const scenes = src('src/scenes.js');
  const block = scenes.match(/id: 'shallows'[\s\S]*?\n  \},/);
  const text = block ? block[0] : '';
  ok(/spawn: \{ tileX: 20, tileY: 9 \}/.test(text),
    'E12 浅滩上方出生点仍是 (20,9)（用户要求「上方不变」）');
  ok(/to: 'starship'[^}]*toTileX: 17, toTileY: 23/.test(text),
    'E13 浅滩→星船草甸那格的到达点改成了 v3 的右下角 (17,23)');
}

{
  const ip = src('src/InteractPoints.js');
  ok(/isQuestDone\(p\)\) \{[\s\S]{0,220}?setVisible\(false\)/.test(ip),
    'E14 委托完成后整个点位隐藏');
  ok(/isQuestAccepted\(p\)\) \{[\s\S]{0,260}?setVisible\(false\)/.test(ip),
    'E15 委托未接时整个点位隐藏（含暗斑）');
}

// 11 张信纸涂鸦都在
{
  const ids = ['ainuo', 'arlecchino', 'furina', 'ineffa', 'lawuma', 'nefer',
    'neuvillette', 'philins', 'sandrone', 'traveler', 'triplets'];
  const missing = [];
  let total = 0;
  for (const id of ids) {
    const f = new URL(`./public/assets/letters/letter-${id}.png`, import.meta.url);
    if (!fs.existsSync(f)) { missing.push(id); continue; }
    const size = fs.statSync(f).size;
    total += size;
    if (size < 40000) missing.push(`${id}(仅 ${size}B)`);
  }
  ok(missing.length === 0, `E16 11 张信纸涂鸦齐备且非空（缺失/过小：${missing.join(',') || '无'}）`);
  ok(total > 800 * 1024, `E17 涂鸦总体积 ${(total / 1024).toFixed(0)} KB > 800 KB`);
}

// ===========================================================================
// 浏览器部分
// ===========================================================================
const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], protocolTimeout: 300000 });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 720 });
await p.goto('http://localhost:5173/venue.html', { waitUntil: 'networkidle2', timeout: 90000 });
await sleep(3500);
await p.evaluate(() => localStorage.clear());
await p.reload({ waitUntil: 'networkidle2', timeout: 90000 });
await sleep(6500);

// 直接敲键盘：handleInteract() 第一句就是 JustDown(keyInteract)，
// 直接函数调用什么都不会发生。返回交互键按下前后我们要看的状态。
const pressKey = async (code) => {
  await p.keyboard.down(code);
  await sleep(160);
  await p.keyboard.up(code);
  await sleep(900);
};

// -------------------------------------------------------------------- A 任务1
{
  const dup = await p.evaluate(async () => {
    const s = window.__venueScene;
    const { GUESTS } = await import('/src/StorySystem.js');
    s.letter.open(GUESTS[0], { index: 0, total: 11 });
    await new Promise((r) => setTimeout(r, 3000));
    const img = document.querySelector('#letter-doodle img');
    const dd = document.getElementById('letter-doodle').getBoundingClientRect();
    const rc = document.getElementById('letter-recipient').getBoundingClientRect();
    const paper = document.getElementById('letter-paper').getBoundingClientRect();
    return {
      letterId: GUESTS[0].id,
      hasImg: !!img,
      src: img && img.getAttribute('src'),
      naturalW: img ? img.naturalWidth : 0,
      complete: img ? img.complete : false,
      doodleH: dd.height,
      doodleBottom: dd.bottom,
      recipientTop: rc.top,
      paperH: paper.height,
    };
  });
  ok(dup.hasImg && dup.naturalW > 0 && dup.complete,
    `A1 桑多涅的信：涂鸦图已加载（${dup.src} ${dup.naturalW}px 宽）`);
  ok(dup.doodleBottom <= dup.recipientTop + 1,
    `A2 涂鸦与正文不重合（涂鸦下沿 ${dup.doodleBottom.toFixed(1)} <= 收信人行上沿 ${dup.recipientTop.toFixed(1)}）`);
  ok(dup.doodleH > 60 && dup.doodleH < 220,
    `A3 涂鸦高度 ${dup.doodleH.toFixed(1)}px 落在合理区间（60~220）`);
  ok(dup.paperH > 400, `A4 信纸高度 ${dup.paperH.toFixed(0)}px（拉长后仍在一屏内）`);
}

{
  const tri = await p.evaluate(async () => {
    const s = window.__venueScene;
    const { GUESTS } = await import('/src/StorySystem.js');
    s.letter.close();
    await new Promise((r) => setTimeout(r, 500));
    const g = GUESTS.find((x) => x.id === 'letter-triplets');
    s.letter.open(g, { index: 2, total: 11 });
    await new Promise((r) => setTimeout(r, 3600));
    const img = document.querySelector('#letter-doodle img');
    return { src: img && img.getAttribute('src'), w: img ? img.naturalWidth : 0 };
  });
  ok(tri.src === 'assets/letters/letter-triplets.png' && tri.w > 0,
    `A5 三人信（林尼/琳妮特/菲米尼）用的是三人合影涂鸦（${tri.src}）`);
}

// --------------------------------------------------- B 任务2 / C 任务3（grove）
{
  const r = await p.evaluate(async () => {
    const s = window.__venueScene;
    s.letter.close();
    await new Promise((r) => setTimeout(r, 600));
    s.scenes.load('grove', { tileX: 23, tileY: 17 }, true);
    await new Promise((r) => setTimeout(r, 2400));
    s.player.x = 23 * 64 + 32;
    s.player.y = 17 * 64 + 32;
    for (let i = 0; i < 16; i++) await new Promise((res) => requestAnimationFrame(res));
    const rose = s.interactPoints.points.filter((x) => x.questId === 'q-lyney-rose');
    return {
      total: s.interactPoints.points.length,
      totalVisible: s.interactPoints.points.filter((x) => x.marker.visible).length,
      roseTotal: rose.length,
      roseVisible: rose.filter((x) => x.marker.visible).length,
      roseIconVisible: rose.filter((x) => x.icon && x.icon.visible).length,
      state: s.quests.getStateById('q-lyney-rose'),
      activePoint: s.activePoint && s.activePoint.id,
    };
  });

  ok(r.roseTotal === 3, `B1 虹彩蔷薇共 3 个交互点（实测 ${r.roseTotal}）`);
  ok(r.roseVisible === 0 && r.roseIconVisible === 0,
    `B2 任务2：未接委托时 3 个蔷薇点全部隐藏（可见 ${r.roseVisible}/图标 ${r.roseIconVisible}）`);
  ok(r.state === 'available', `B3 此时委托状态是 available（实测 ${r.state}）`);
}

{
  const r = await p.evaluate(async () => {
    const s = window.__venueScene;
    const { QUESTS } = await import('/src/quests.js');
    s.quests.accept(QUESTS.find((x) => x.id === 'q-lyney-rose'));
    for (let i = 0; i < 4; i++) await new Promise((res) => requestAnimationFrame(res));
    const rose = s.interactPoints.points.filter((x) => x.questId === 'q-lyney-rose');
    return {
      roseVisible: rose.filter((x) => x.marker.visible).length,
      ids: rose.filter((x) => x.marker.visible).map((x) => x.id).sort(),
      state: s.quests.getStateById('q-lyney-rose'),
      activePoint: s.activePoint && s.activePoint.id,
    };
  });
  ok(r.roseVisible === 3,
    `B4 任务2：接委托后 3 个蔷薇点立刻出现（只等 4 帧，无需重进场景）`);
  ok(JSON.stringify(r.ids) === JSON.stringify(['ip-grove-rose', 'ip-grove-rose-2', 'ip-grove-rose-3']),
    `B5 出现的正是这 3 个 id（实测 ${JSON.stringify(r.ids)}）`);
  ok(r.activePoint === 'ip-grove-rose', `B6 站在第 1 个点上是 activePoint=ip-grove-rose（实测 ${r.activePoint}）`);
}

// C：E 无效 / F 有效
{
  const before = await p.evaluate(() => {
    const s = window.__venueScene;
    return { counter: s.quests.getCounter('q-lyney-rose'), active: s.activePoint && s.activePoint.id };
  });
  await pressKey('KeyE');
  const afterE = await p.evaluate(() => {
    const s = window.__venueScene;
    return { counter: s.quests.getCounter('q-lyney-rose') };
  });
  await pressKey('KeyF');
  const afterF = await p.evaluate(() => {
    const s = window.__venueScene;
    return { counter: s.quests.getCounter('q-lyney-rose'), state: s.quests.getStateById('q-lyney-rose') };
  });
  ok(afterE.counter === before.counter,
    `C1 任务3：按 E 不再有任何反应（计数 ${before.counter} → ${afterE.counter}）`);
  ok(afterF.counter === before.counter + 1,
    `C2 任务3：按 F 正常采集（计数 ${before.counter} → ${afterF.counter}）`);
}

// 任务2 第三态：交完 → 隐藏
{
  const r = await p.evaluate(async () => {
    const s = window.__venueScene;
    const { QUESTS } = await import('/src/quests.js');
    const q = QUESTS.find((x) => x.id === 'q-lyney-rose');
    s.quests.data.states[q.id] = 'completed';
    s.quests.save();
    for (let i = 0; i < 4; i++) await new Promise((res) => requestAnimationFrame(res));
    const rose = s.interactPoints.points.filter((x) => x.questId === 'q-lyney-rose');
    return {
      roseVisible: rose.filter((x) => x.marker.visible).length,
      roseIconVisible: rose.filter((x) => x.icon && x.icon.visible).length,
      state: s.quests.getStateById(q.id),
    };
  });
  ok(r.roseVisible === 0 && r.roseIconVisible === 0,
    `B7 任务2：委托完成后 3 个蔷薇点再次隐藏（可见 ${r.roseVisible}/图标 ${r.roseIconVisible}）`);
}

// 无 questId 的点（书桌/信箱）不受任务2影响
{
  const r = await p.evaluate(async () => {
    const s = window.__venueScene;
    s.scenes.load('home', { tileX: 20, tileY: 12 }, true);
    await new Promise((r) => setTimeout(r, 2400));
    for (let i = 0; i < 8; i++) await new Promise((res) => requestAnimationFrame(res));
    const noQ = s.interactPoints.points.filter((x) => !x.questId);
    return {
      total: s.interactPoints.points.length,
      noQ: noQ.map((x) => ({ id: x.id, visible: x.marker.visible })),
    };
  });
  const desk = r.noQ.find((x) => x.id === 'ip-desk');
  ok(r.noQ.length > 0, `B8 home 场景有 ${r.noQ.length} 个不带 questId 的点（书桌/信箱/蛋糕）`);
  ok(!!desk && desk.visible,
    `B9 任务2 不影响不带 questId 的点：书桌点仍可见（${JSON.stringify(r.noQ)}）`);
}

// -------------------------------------------------------------------- D 任务4
{
  const r = await p.evaluate(async () => {
    const s = window.__venueScene;
    const { SCENES } = await import('/src/scenes.js');
    const sh = SCENES.find((x) => x.id === 'shallows');
    // ★ 采集成功会弹一句 okText 对话（doCollectItem 里 dialog.open），
    //   对话框开着时 VenueScene.update() 在 1518 行直接 return，出口检测根本不会跑 ——
    //   这里必须先关掉，否则测出来的是「玩家没关对话框」，不是落点错。
    s.dialog.close();
    window.__venuePaused = false;
    await new Promise((r) => setTimeout(r, 400));
    // ★ 不要直接落在出口光圈上：那样手动挪位置会把已落好的浅滩坐标覆盖掉（第 11 轮踩过）
    s.scenes.load('starship', { tileX: 25, tileY: 18 }, true);
    await new Promise((r) => setTimeout(r, 1200));
    s.player.x = 25 * 64 + 32;
    s.player.y = 22 * 64 + 32;
    for (let i = 0; i < 12; i++) await new Promise((res) => requestAnimationFrame(res));
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 100));
      if (s.scenes.current && s.scenes.current.id === 'shallows') break;
      // 如果还站在草甸上，每 5 拍重新压一次坐标（防止物理步把角色推离光圈）
      if (i % 5 === 4 && s.scenes.current.id === 'starship') {
        s.player.x = 25 * 64 + 32;
        s.player.y = 22 * 64 + 32;
      }
    }
    await new Promise((r) => setTimeout(r, 900));
    for (let i = 0; i < 10; i++) await new Promise((res) => requestAnimationFrame(res));
    const back = (sh.exits || []).find((e) => e.to === 'starship');
    return {
      scene: s.scenes.current && s.scenes.current.id,
      tile: [Math.floor(s.player.x / 64), Math.floor(s.player.y / 64)],
      spawn: sh.spawn,
      backExit: { toTileX: back.toTileX, toTileY: back.toTileY },
      // 诊断：出口检测被跳过的常见原因
      diag: {
        paused: !!window.__venuePaused,
        dialogOpen: s.dialog.isOpen(),
        letterOpen: !!(s.letter && s.letter.isOpen()),
        switching: !!s.scenes.switching,
        overlay: !!s.overlay,
        hitExit: (() => {
          const e = s.scenes.checkExits(s.player.x, s.player.y);
          return e ? e.to : null;
        })(),
      },
    };
  });
  ok(r.scene === 'shallows', `D1 从星船草甸走到出口能进浅滩（实测 scene=${r.scene} ${JSON.stringify(r.diag)}）`);
  ok(r.tile[0] === 17 && r.tile[1] === 23,
    `D2 任务4：落点 = v3 下方红框右下角 (17,23)（实测 ${JSON.stringify(r.tile)}）`);
  ok(r.spawn.tileX === 20 && r.spawn.tileY === 9,
    `D3 上方出生点未动，仍是 (20,9)（实测 ${JSON.stringify(r.spawn)}）`);
}

await b.close();

console.log('');
console.log(`通过 ${(fail.length === 0 ? '全部' : '部分')} / 失败 ${fail.length}`);
if (fail.length) {
  console.log('失败项：');
  for (const f of fail) console.log('  · ' + f);
}
process.exit(fail.length ? 1 : 0);
