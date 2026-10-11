// 琳妮特换装实拍：池塘场景的站姿 / 庆功宴坐姿
//
//   跑法（必须在 venue/ 目录下）：node _shot_lynette.mjs
//   产物：_lyn_stand_ingame.png / _lyn_party_ingame.png
import puppeteer from 'puppeteer';

const OUT = 'D:\\DSH工作区\\哥伦比娅生日会\\venue';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], protocolTimeout: 300000 });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
await p.goto('http://localhost:5173/venue.html', { waitUntil: 'networkidle2', timeout: 90000 });
await sleep(3500);
await p.evaluate(() => localStorage.clear());
await p.reload({ waitUntil: 'networkidle2', timeout: 90000 });
await sleep(6500);

// ---- A：池塘场景，走到琳妮特身边（站姿） ----
const standInfo = await p.evaluate(async () => {
  const s = window.__venueScene;
  const { NPCS } = await import('/src/config.js');
  const def = NPCS.find((n) => n.id === 'npc-lynette');
  // 客人要到齐才会出现在场景里：先把邀请函状态补齐
  s.story.data.lettersWritten = s.story.snapshot().letters.map((l) => l.id);
  s.story.data.delivered = true;
  s.story.save();
  s.quests.reset();
  await new Promise((r) => setTimeout(r, 500));
  s.scenes.load(def.scene, { tileX: def.tileX, tileY: def.tileY + 2 }, true);
  await new Promise((r) => setTimeout(r, 1800));
  const n = s.npcs.find((x) => x.id === 'npc-lynette');
  if (!n) return { err: 'standing lynette not found', ids: s.npcs.map((x) => x.id) };
  s.player.x = n.rect.left - 30;
  s.player.y = n.rect.bottom + 26;
  for (let i = 0; i < 40; i++) await new Promise((r) => requestAnimationFrame(r));
  s.handleProximity();
  for (let i = 0; i < 12; i++) await new Promise((r) => requestAnimationFrame(r));
  const tex = s.textures.get(n.info.key).getSourceImage();
  return {
    scene: n.scene, tile: [n.tileX, n.tileY],
    rect: [Math.round(n.rect.left), Math.round(n.rect.top), Math.round(n.rect.right), Math.round(n.rect.bottom)],
    boxW: Math.round(n.rect.right - n.rect.left), boxH: Math.round(n.rect.bottom - n.rect.top),
    texKey: n.info.key, texSize: [tex.width, tex.height],
    cam: [Math.round(s.cameras.main.scrollX), Math.round(s.cameras.main.scrollY)],
  };
});
console.log('STAND ' + JSON.stringify(standInfo));
await sleep(900);
await p.screenshot({ path: `${OUT}\\_lyn_stand_ingame.png` });

// ---- B：庆功宴里的坐姿 ----
const partyInfo = await p.evaluate(async () => {
  const s = window.__venueScene;
  const { QUESTS } = await import('/src/quests.js');
  s.scenes.load('venue', { tileX: 20, tileY: 18 }, true);
  await new Promise((r) => setTimeout(r, 1400));
  s.story.data.lettersWritten = s.story.snapshot().letters.map((l) => l.id);
  s.story.data.delivered = true;
  s.story.save();
  s.quests.reset();
  await new Promise((r) => setTimeout(r, 400));
  QUESTS.filter((q) => q.id !== 'q-party-cake').forEach((q) => { s.quests.data.states[q.id] = 'completed'; });
  s.quests.save();
  s.maybeStartParty();
  await new Promise((r) => setTimeout(r, 3200));
  const seat = s.seatedNpcs.find((n) => n.id === 'npc-lynette');
  if (!seat) return { err: 'seated lynette not found', ids: s.seatedNpcs.map((n) => n.id) };
  s.player.x = seat.rect.left - 34;
  s.player.y = seat.rect.top - 30;
  for (let i = 0; i < 40; i++) await new Promise((r) => requestAnimationFrame(r));
  s.handleProximity();
  for (let i = 0; i < 12; i++) await new Promise((r) => requestAnimationFrame(r));
  return {
    id: seat.id,
    rect: [Math.round(seat.rect.left), Math.round(seat.rect.top), Math.round(seat.rect.right), Math.round(seat.rect.bottom)],
    boxW: Math.round(seat.rect.right - seat.rect.left), boxH: Math.round(seat.rect.bottom - seat.rect.top),
    texKey: seat.sprite && seat.sprite.texture ? seat.sprite.texture.key : null,
    activeNpc: s.activeNpc ? s.activeNpc.id : null,
  };
});
console.log('PARTY ' + JSON.stringify(partyInfo));
await sleep(900);
await p.screenshot({ path: `${OUT}\\_lyn_party_ingame.png` });

// ---- C：切蛋糕结局过场（新的大合影） ----
await p.evaluate(async () => {
  const s = window.__venueScene;
  s.placeHeroAtPartySpot();
  for (let i = 0; i < 20; i++) await new Promise((r) => requestAnimationFrame(r));
  s.showCakeCutscene();
  for (let i = 0; i < 16; i++) await new Promise((r) => requestAnimationFrame(r));
});
await sleep(900);
await p.screenshot({ path: `${OUT}\\_lyn_cake_ingame.png` });

console.log('shots done');
await b.close();
