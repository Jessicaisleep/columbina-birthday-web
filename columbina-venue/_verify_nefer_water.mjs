// 奈芙尔「打一桶清水」委托 —— 交付链路验收
//
// 用户 2026-10-09 反馈：
//   「奈芙尔委托，打水无法完成。我去池塘互动点，提示打好了水可以交了，
//     但是回奈芙尔那里还是让我去打水」
//
// 根因（见 VenueScene.doExchangeItem 的注释）：
//   背包存在 localStorage['venue-items-v1']，【没有按天分桶】；
//   任务状态存在 localStorage['venue-quests-v2']，【按天分桶，跨天自动重置】。
//   于是跨天之后：身上的「装满水的桶」还在，但任务被重置回 active / 计数 0。
//   再去池塘取水处，doExchangeItem 第一句
//       if (p.doneItem && this.hasItem(p.doneItem)) { toast(doneHint); return; }
//   就提前 return 了 —— 提示「桶已经装满了，赶紧送回去吧」，但
//   markCollect() 从来没被调用，计数永远是 0，委托永远到不了 ready。
//   → 死锁。
//
//   doCollectItem()（采花/采蘑菇/捡柴/捉鱼）在 2026-10-05 已经修过同一类死锁，
//   doExchangeItem() 当时漏掉了。
//
// 跑法（必须在 venue/ 目录下）：
//   node _verify_nefer_water.mjs
import puppeteer from 'puppeteer';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], protocolTimeout: 300000 });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 720 });
await p.goto('http://localhost:5173/venue.html', { waitUntil: 'networkidle2', timeout: 90000 });
await sleep(3500);

// 干净开局
await p.evaluate(() => localStorage.clear());
await p.reload({ waitUntil: 'networkidle2', timeout: 90000 });
await sleep(6500);

// 把主线推到「邀请函全写完并已投递」—— 受邀客人这时才出现
await p.evaluate(() => {
  const s = window.__venueScene;
  s.story.data.lettersWritten = s.story.snapshot().letters.map((l) => l.id);
  s.story.data.delivered = true;
  s.story.save();
});

const fail = [];
const ok = (cond, msg) => {
  console.log(`${cond ? '✅' : '❌'} ${msg}`);
  if (!cond) fail.push(msg);
};

// ===========================================================================
// 在池塘场景里按真实路径点「取水处」
// ===========================================================================
const r = await p.evaluate(async () => {
  const s = window.__venueScene;
  const { QUESTS } = await import('/src/quests.js');
  const QID = 'q-nefer-water';
  const q = QUESTS.find((x) => x.id === QID);
  const steps = {};

  const snap = () => ({
    state: s.quests.getState(q),
    counter: s.quests.getCounter(QID),
    items: s.getItems(),
  });

  // 重置这条委托 + 清空背包，进入确定状态
  const resetQuest = (state) => {
    s.quests.data.states[QID] = state;
    s.quests.data.counters[QID] = 0;
    s.quests.save();
    s.clearItems();
  };

  // 切到池塘
  s.scenes.load('pond', null, true);
  await new Promise((res) => setTimeout(res, 1200));

  // ★ triggerPoint(point) 其实【不吃参数】—— 它内部是
  //   `this.interactPoints.trigger()`，用的是游戏主循环在 handleProximity()
  //   里设好的 `interactPoints.active`。所以按 E 之前必须等它真的认出脚下这个点。
  const waitActive = async (id, ms = 4000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (s.interactPoints.active && s.interactPoints.active.id === id) return true;
      await new Promise((res) => setTimeout(res, 100));
    }
    return false;
  };

  const pt = s.interactPoints.points.find((x) => x.id === 'ip-pond-water');
  if (!pt) {
    return { missing: true, points: s.interactPoints.points.map((x) => x.id) };
  }
  steps.pointExists = true;
  steps.point = { x: pt.x, y: pt.y, action: pt.action, needItem: pt.needItem, giveItem: pt.giveItem, doneItem: pt.doneItem, collectId: pt.collectId };

  // 站到取水处旁边（触发半径内）
  s.player.x = pt.x;
  s.player.y = pt.y + 40;
  steps.nearWater = await waitActive('ip-pond-water');

  // ---- A. 没接委托：点位整个不存在，按 E 也不给东西 ----
  resetQuest('available');
  const beforeA = snap();
  // ★ 任务2（2026-10-12）：没接委托时这个点位整个不存在（连暗斑都没有）
  await new Promise((res) => setTimeout(res, 400));
  steps.A = { before: beforeA };
  steps.A.markerVisible = pt.marker.visible;
  steps.A.near = await waitActive('ip-pond-water', 600);
  s.triggerPoint(pt);
  await new Promise((res) => setTimeout(res, 300));
  const afterA = snap();
  steps.A.after = afterA;
  steps.A.stillAvailable = afterA.state === 'available' && !afterA.items['water-full'];

  // ---- B. 正常流程：接委托 → 拿空桶 → 打水 ----
  resetQuest('available');
  s.handleQuestAction('accept', QID);
  const afterAccept = snap();
  steps.B = { afterAccept };
  steps.B.gotBucket = !!afterAccept.items['bucket-empty'];
  steps.B.stateActive = afterAccept.state === 'active';

  // ★ 任务2 之后必须多等一帧：接完委托点位才出现，
  //   而 handleProximity() 要下一帧才把它写进 interactPoints.active。
  steps.B.nearAfterAccept = await waitActive('ip-pond-water');
  s.triggerPoint(pt);
  await new Promise((res) => setTimeout(res, 300));
  const afterB = snap();
  steps.B.afterFill = afterB;
  steps.B.gotWater = !!afterB.items['water-full'];
  steps.B.bucketConsumed = !afterB.items['bucket-empty'];
  steps.B.stateReady = afterB.state === 'ready';
  steps.B.counter = afterB.counter;

  // 装满之后再按一次：应该只是提示，不该重复发水
  const waterCountBefore = afterB.items['water-full'] || 0;
  s.triggerPoint(pt);
  await new Promise((res) => setTimeout(res, 300));
  const afterB2 = snap();
  steps.B.repeatCountSame = (afterB2.items['water-full'] || 0) === waterCountBefore;
  steps.B.stillReady = afterB2.state === 'ready';

  // ---- C. 交付：委托变 completed ----
  s.handleQuestAction('deliver', QID);
  const afterC = snap();
  steps.C = { afterC };
  steps.C.completed = afterC.state === 'completed';

  // ---- D. ★ 死锁复现：跨天之后「物品还在、任务被重置」 ----
  //    模拟 localStorage['venue-items-v1'] 保留、['venue-quests-v2'] 跨天重置
  resetQuest('active');
  s.giveItem('water-full', '装满水的桶');   // 身上有成品
  s.player.x = pt.x;
  s.player.y = pt.y + 40;
  const nearD = await waitActive('ip-pond-water');
  const beforeD = snap();
  s.triggerPoint(pt);
  await new Promise((res) => setTimeout(res, 300));
  const afterD = snap();
  steps.D = { before: beforeD, after: afterD, near: nearD };
  steps.D.counterHealed = afterD.counter >= 1;
  steps.D.stateReady = afterD.state === 'ready';
  // 修好之后不该重复发一瓶水
  steps.D.noDuplicate = (afterD.items['water-full'] || 0) === (beforeD.items['water-full'] || 0);

  // ---- E. 修好之后，奈芙尔的对话里要出现「交付委托」 ----
  const { NPCS } = await import('/src/config.js');
  const nefer = NPCS.find((x) => x.id === 'npc-nefer');
  steps.nefer = { id: nefer && nefer.id, scene: nefer && nefer.scene, name: nefer && nefer.name };

  const lines = s.buildDialogLines(nefer);
  steps.dialogLinks = lines.filter((l) => l.link).map((l) => l.link.label);
  steps.hasDeliverLink = steps.dialogLinks.includes('交付委托');

  // ---- F. 采集类委托的「跨天重置」死锁逐个验一遍 ----
  //    打水走 doExchangeItem，其余走 doCollectItem —— 两条路都得能自愈。
  //
  //    ★ 2026-10-12 更新：文案总表落地后委托从 5 条变 14 条，其中
  //      · talk（q-arlecchino-check）由 markTalked 完成，没有采集点；
  //      · visit（q-traveler-far）由 handleQuestVisit 完成，点位不给 collectId；
  //      · 多条委托 count > 1（虹彩蔷薇 ×3 / 月灵灯 ×3 / 小物件 ×5）。
  //      所以这里只验 collect 类，且按各自 need 判断「按一次 E 之后」的期望值。
  const { INTERACT_POINTS } = await import('/src/quests.js');
  const side = QUESTS.filter((x) => x.giverNpcId && x.target && x.target.type === 'collect');
  steps.F = [];
  for (const q of side) {
    const ip = INTERACT_POINTS.find((x) => x.questId === q.id);
    if (!ip) { steps.F.push({ id: q.id, ok: false, why: '没有配互动点' }); continue; }

    s.scenes.load(ip.scene, null, true);
    await new Promise((res) => setTimeout(res, 1200));

    const pt2 = s.interactPoints.points.find((x) => x.id === ip.id);
    if (!pt2) { steps.F.push({ id: q.id, ok: false, why: '点位没生成' }); continue; }

    // 跨天：任务重置、物品保留
    s.quests.data.states[q.id] = 'active';
    s.quests.data.counters[q.id] = 0;
    if (s.quests.data.takenPoints) s.quests.data.takenPoints = {};
    s.quests.save();
    s.clearItems();

    const itemId = ip.collectId || (q.target && q.target.itemId);
    s.giveItem(itemId, '测试道具');

    const need = q.target.count || 1;
    const b4 = { state: s.quests.getState(q), counter: s.quests.getCounter(q.id), need };
    s.player.x = pt2.x;
    s.player.y = pt2.y + 40;
    const near = await waitActive(ip.id);
    s.triggerPoint(pt2);
    await new Promise((res) => setTimeout(res, 350));
    const af = { state: s.quests.getState(q), counter: s.quests.getCounter(q.id) };

    // 按一次 E 之后：计数必须补上 1 点；只有 need=1 的才该直接 ready
    const wantState = need === 1 ? 'ready' : 'active';
    steps.F.push({
      id: q.id, ip: ip.id, scene: ip.scene, action: ip.action, itemId, need, near,
      before: b4, after: af,
      ok: near && af.counter === 1 && af.state === wantState,
    });
  }

  return { steps };
});

if (r.missing) {
  console.log('❌ 池塘里找不到 ip-pond-water 交互点。现有：' + r.points.join(', '));
  fail.push('ip-pond-water 缺失');
} else {
  const s = r.steps;

  console.log('\n===== A. 没接委托 =====');
  console.log(`   before  state=${s.A.before.state} items=${JSON.stringify(s.A.before.items)}`);
  console.log(`   after   state=${s.A.after.state} items=${JSON.stringify(s.A.after.items)}`);
  ok(s.A.stillAvailable, '没接委托时按 E 不产出「装满水的桶」，委托保持 available');
  ok(s.A.markerVisible === false && s.A.near === false,
    '任务2：没接委托时取水点的光圈整块不存在（看不到、也认不出脚下有点位）');

  console.log('\n===== B. 正常流程：接委托 → 打水 =====');
  console.log(`   接委托后  state=${s.B.afterAccept.state} counter=${s.B.afterAccept.counter} items=${JSON.stringify(s.B.afterAccept.items)}`);
  console.log(`   打水后    state=${s.B.afterFill.state} counter=${s.B.afterFill.counter} items=${JSON.stringify(s.B.afterFill.items)}`);
  ok(s.B.stateActive, '接委托后状态 = active');
  ok(s.B.gotBucket, '接委托时拿到「空桶」');
  ok(s.B.gotWater, '在取水处拿到「装满水的桶」');
  ok(s.B.bucketConsumed, '空桶被消耗掉');
  ok(s.B.stateReady && s.B.counter === 1, '目标达成 → 委托变 ready，计数 1');
  ok(s.B.repeatCountSame && s.B.stillReady, '装满后再按一次不会重复发水，仍是 ready');

  console.log('\n===== C. 交付 =====');
  ok(s.C.completed, '交付后委托 = completed');

  console.log('\n===== D. ★ 死锁场景：物品还在、任务被跨天重置 =====');
  console.log(`   before  state=${s.D.before.state} counter=${s.D.before.counter} items=${JSON.stringify(s.D.before.items)}`);
  console.log(`   after   state=${s.D.after.state} counter=${s.D.after.counter} items=${JSON.stringify(s.D.after.items)}`);
  ok(s.D.counterHealed, '身上已有成品但计数是 0 时，按 E 会把计数补上（不再死锁）');
  ok(s.D.stateReady, '补计数后委托变 ready，可以交付');
  ok(s.D.noDuplicate, '补计数时不重复发「装满水的桶」');

  console.log('\n===== E. 奈芙尔对话 =====');
  console.log(`   ${s.nefer.name} (${s.nefer.id}) 在 ${s.nefer.scene}`);
  console.log(`   对话里的功能入口: ${JSON.stringify(s.dialogLinks)}`);
  ok(s.hasDeliverLink, '委托 ready 时，奈芙尔对话里出现「交付委托」按钮');

  console.log('\n===== F. 采集类委托的「跨天重置」自愈 =====');
  for (const f of s.F) {
    if (f.why) { ok(false, `${f.id} —— ${f.why}`); continue; }
    console.log(`   ${f.id.padEnd(22)} ${f.scene.padEnd(8)} ${String(f.action).padEnd(12)} need=${f.need} ${f.before.state}/${f.before.counter} → ${f.after.state}/${f.after.counter}`);
    ok(f.ok, `${f.id}（need=${f.need}）：物品还在但计数为 0 时，按 E 补计数${f.need === 1 ? '并转 ready' : '（未集满仍 active）'}`);
  }
}

console.log(`\n${fail.length === 0 ? '✅ 全部通过' : `❌ 失败 ${fail.length} 项`}`);
await b.close();
process.exit(fail.length === 0 ? 0 : 1);
