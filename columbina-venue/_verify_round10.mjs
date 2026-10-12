// 第 10 轮验收 —— 《文案总表》委托文案落地 + 新委托机制
//
// 对应改动（2026-10-12）：
//   · quests.js    ：5 条老委托改文案、新增 9 条委托 + 16 个交互点
//   · QuestSystem  ：新增点位级采集登记 takenPoints（修「同 collectId 多点位只能捡 1 个」）
//   · VenueScene   ：doCollectItem 去重按需求数量 + 点位级；handleQuestVisit 传 tx/ty；
//                    buildDialogLines 支持 offerLine / progressLine / deliverLine
//
// 跑法（必须在 venue/ 目录下，vite 要在 5173 就绪）：
//   node _verify_round10.mjs
import puppeteer from 'puppeteer';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], protocolTimeout: 300000 });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 720 });
await p.goto('http://localhost:5173/venue.html', { waitUntil: 'networkidle2', timeout: 90000 });
await sleep(3500);
await p.evaluate(() => localStorage.clear());
await p.reload({ waitUntil: 'networkidle2', timeout: 90000 });
await sleep(6000);

const fail = [];
const ok = (cond, msg) => {
  console.log(`${cond ? '✅' : '❌'} ${msg}`);
  if (!cond) fail.push(msg);
};

const r = await p.evaluate(async () => {
  const s = window.__venueScene;
  const { QUESTS, INTERACT_POINTS } = await import('/src/quests.js');
  const { NPCS } = await import('/src/config.js');
  const out = {};

  const waitActive = async (id, ms = 5000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (s.interactPoints.active && s.interactPoints.active.id === id) return true;
      await new Promise((res) => setTimeout(res, 100));
    }
    return false;
  };

  const setQuest = (qid, state, counter = 0, clearItems = true) => {
    s.quests.data.states[qid] = state;
    s.quests.data.counters[qid] = counter;
    s.quests.save();
    if (clearItems) s.clearItems();
  };

  // ---------------------------------------------------------------- A
  const npcQuests = QUESTS.filter((q) => q.giverNpcId);
  out.A = {
    total: QUESTS.length,
    main: QUESTS.filter((q) => !q.giverNpcId && !q.afterParty).map((q) => q.id),
    npc: npcQuests.map((q) => q.id),
    afterParty: QUESTS.filter((q) => q.afterParty).map((q) => q.id),
    withOffer: npcQuests.filter((q) => q.offerLine).map((q) => q.id),
    withProgress: npcQuests.filter((q) => q.progressLine).map((q) => q.id),
    withDeliver: npcQuests.filter((q) => q.deliverLine).map((q) => q.id),
    points: INTERACT_POINTS.length,
    // 每个采集类委托，点位数必须正好等于需求量 ——
    // doCollectItem 一次只 +1，点少了就永远采不满（q-lyney-rose 第一版只有 1 个点、
    // 却要 3 朵，就是被这条抓出来的）。
    pointsMismatch: npcQuests
      .filter((q) => q.target && q.target.type === 'collect')
      .map((q) => ({
        id: q.id,
        need: q.target.count || 1,
        points: INTERACT_POINTS.filter((x) => x.questId === q.id).length,
      }))
      .filter((x) => x.need !== x.points)
      .map((x) => `${x.id} need=${x.need} points=${x.points}`),
  };

  // ---------------------------------------------------------------- B
  // talk 委托：和林尼说一句话
  {
    const QID = 'q-arlecchino-check';
    const q = QUESTS.find((x) => x.id === QID);
    setQuest(QID, 'active', 0);
    const lyney = NPCS.find((x) => x.id === 'npc-lyney');
    const before = { state: s.quests.getState(q), counter: s.quests.getCounter(QID) };

    s.startDialog(lyney);
    await new Promise((res) => setTimeout(res, 250));
    const openedWith = s.dialog.currentNpc && s.dialog.currentNpc.id;
    s.dialog.close();
    await new Promise((res) => setTimeout(res, 250));

    out.B = {
      before,
      openedWith,
      after: { state: s.quests.getState(q), counter: s.quests.getCounter(QID) },
    };
  }

  // ---------------------------------------------------------------- C
  // visit 委托：站到夜路尽头
  {
    const QID = 'q-traveler-far';
    const q = QUESTS.find((x) => x.id === QID);
    const t = q.target;
    setQuest(QID, 'active', 0);

    s.scenes.load(t.scene, null, true);
    await new Promise((res) => setTimeout(res, 1400));

    s.player.x = t.tileX * 64 + 32;
    s.player.y = t.tileY * 64 + 32;
    await new Promise((res) => setTimeout(res, 250));

    const before = { state: s.quests.getState(q), counter: s.quests.getCounter(QID) };
    s.handleQuestVisit();
    await new Promise((res) => setTimeout(res, 300));
    const after = { state: s.quests.getState(q), counter: s.quests.getCounter(QID) };

    // 站远一点不该误判
    setQuest(QID, 'active', 0);
    s.player.x = (t.tileX + 6) * 64 + 32;
    s.player.y = (t.tileY + 6) * 64 + 32;
    s.handleQuestVisit();
    await new Promise((res) => setTimeout(res, 250));
    const far = { state: s.quests.getState(q), counter: s.quests.getCounter(QID) };

    out.C = { before, after, far, tile: [t.tileX, t.tileY, t.radius] };
  }

  // ---------------------------------------------------------------- D
  // 多点位共用 collectId：5 个 litter 点必须都能捡
  {
    const QID = 'q-ineffa-cleanup';
    const q = QUESTS.find((x) => x.id === QID);
    const need = q.target.count;
    setQuest(QID, 'active', 0);

    const steps = [];
    const ids = INTERACT_POINTS.filter((x) => x.questId === QID).map((x) => x.id);
    for (const pid of ids) {
      const ip = INTERACT_POINTS.find((x) => x.id === pid);
      s.scenes.load(ip.scene, null, true);
      await new Promise((res) => setTimeout(res, 1100));
      const pt = s.interactPoints.points.find((x) => x.id === pid);
      if (!pt) { steps.push({ id: pid, missing: true }); continue; }
      s.player.x = pt.x;
      s.player.y = pt.y + 40;
      const near = await waitActive(pid);
      s.triggerPoint(pt);
      await new Promise((res) => setTimeout(res, 300));
      steps.push({
        id: pid, near,
        counter: s.quests.getCounter(QID),
        state: s.quests.getState(q),
        items: s.getItems(),
      });
    }
    out.D = { need, ids, steps };

    // moon-lamp ×3 / rainbow-rose ×3 同一机制，抽查一遍
    for (const QID2 of ['q-furina-lamp', 'q-lyney-rose']) {
      const q2 = QUESTS.find((x) => x.id === QID2);
      setQuest(QID2, 'active', 0);
      const ids2 = INTERACT_POINTS.filter((x) => x.questId === QID2).map((x) => x.id);
      const cc = [];
      for (const pid of ids2) {
        const ip = INTERACT_POINTS.find((x) => x.id === pid);
        s.scenes.load(ip.scene, null, true);
        await new Promise((res) => setTimeout(res, 1100));
        const pt = s.interactPoints.points.find((x) => x.id === pid);
        if (!pt) { cc.push(-1); continue; }
        s.player.x = pt.x;
        s.player.y = pt.y + 40;
        await waitActive(pid);
        s.triggerPoint(pt);
        await new Promise((res) => setTimeout(res, 300));
        cc.push(s.quests.getCounter(QID2));
      }
      out.D[QID2] = { need: q2.target.count, counters: cc, state: s.quests.getState(q2) };
    }
  }

  // ---------------------------------------------------------------- E
  // offerLine / progressLine / deliverLine 真的进了对话
  {
    const lyney = NPCS.find((x) => x.id === 'npc-lyney');
    const q = QUESTS.find((x) => x.id === 'q-lyney-rose');

    setQuest('q-lyney-rose', 'available', 0);
    const avail = s.buildDialogLines(lyney).map((l) => l.text);

    setQuest('q-lyney-rose', 'active', 0);
    const active = s.buildDialogLines(lyney).map((l) => l.text);

    setQuest('q-lyney-rose', 'ready', 3);
    const ready = s.buildDialogLines(lyney).map((l) => l.text);

    out.E = { avail, active, ready, q: { offer: q.offerLine, progress: q.progressLine, deliver: q.deliverLine } };
  }

  // ---------------------------------------------------------------- F
  // 10 个委托道具的贴图都加载了
  {
    const props = QUESTS.filter((q) => q.propReward).map((q) => q.propReward.id);
    out.F = {
      ids: props,
      missing: props.filter((id) => !s.textures.exists('prop-' + id)),
      // 只有完成才摆到会场
      spawnedNow: (s.propSprites || []).length,
    };
  }

  return out;
});

// ===========================================================================
console.log('\n===== A. 委托清单 =====');
console.log(`   总任务 ${r.A.total} 条；主线 ${r.A.main.join(', ')}`);
console.log(`   NPC 委托 ${r.A.npc.length} 条：${r.A.npc.join(', ')}`);
console.log(`   结局外挂 ${r.A.afterParty.join(', ')}；交互点 ${r.A.points} 个`);
ok(r.A.npc.length === 14, `NPC 委托共 14 条（5 条老 + 9 条新），实际 ${r.A.npc.length}`);
ok(r.A.points === 24, `交互点共 24 个（8 老 + 16 新），实际 ${r.A.points}`);
// 每个采集类委托，点位数必须正好等于需求量（详见 evaluate 里 pointsMismatch 的注释）
ok(r.A.pointsMismatch.length === 0,
   `每个采集委托的「点位数 = 需求量」（异常：${r.A.pointsMismatch.join('；') || '无'}）`);
ok(r.A.withOffer.length === r.A.npc.length,
   `14 条委托全部带 offerLine（人设开场白），实际 ${r.A.withOffer.length}`);
ok(r.A.withProgress.length === r.A.npc.length,
   `14 条委托全部带 progressLine，实际 ${r.A.withProgress.length}`);
ok(r.A.withDeliver.length === r.A.npc.length,
   `14 条委托全部带 deliverLine，实际 ${r.A.withDeliver.length}`);

console.log('\n===== B. talk 委托（林尼：说一句话就完成）=====');
console.log(`   ${JSON.stringify(r.B.before)} → 对话框对着 ${r.B.openedWith} → ${JSON.stringify(r.B.after)}`);
ok(r.B.openedWith === 'npc-lyney', 'startDialog(林尼) 打开的对话框属主是 npc-lyney');
ok(r.B.after.counter === 1 && r.B.after.state === 'ready',
   '和林尼说完话，talk 委托计数 +1 并转 ready（talk 类型零代码改动）');

console.log('\n===== C. visit 委托（替我看一眼终点）=====');
console.log(`   目标格 ${JSON.stringify(r.C.tile)}`);
console.log(`   站在目标格 ${JSON.stringify(r.C.before)} → ${JSON.stringify(r.C.after)}`);
console.log(`   站在 6 格外 ${JSON.stringify(r.C.far)}`);
ok(r.C.after.counter === 1 && r.C.after.state === 'ready',
   '站在 moonpath 目标格上自动完成 → ready（修好 markVisit 传参）');
ok(r.C.far.counter === 0,
   '站在 6 格开外不会误判完成（原来 markVisit(q.id) 传的是字符串 → NaN 永远不成立）');

console.log('\n===== D. 多点位共用 collectId =====');
console.log(`   q-ineffa-cleanup 需要 ${r.D.need} 件，共 ${r.D.ids.length} 个点位`);
for (const st of r.D.steps) {
  console.log(`     ${st.id.padEnd(20)} near=${st.near} → counter=${st.counter} state=${st.state} items=${JSON.stringify(st.items)}`);
}
ok(r.D.steps.every((x) => !x.missing), '5 个 litter 点位全部生成');
ok(r.D.steps.length === r.D.need, `${r.D.need} 个 litter 点对 ${r.D.need} 件需求`);
ok(r.D.steps[1] && r.D.steps[1].counter === 2,
   '捡第 2 件时计数到 2（旧代码在这里就被 alreadyHas 挡回去了）');
ok(r.D.steps[r.D.steps.length - 1].counter === r.D.need
   && r.D.steps[r.D.steps.length - 1].state === 'ready',
   `${r.D.need} 件全部捡齐，委托转 ready`);

for (const QID of ['q-furina-lamp', 'q-lyney-rose']) {
  const d = r.D[QID];
  console.log(`   ${QID}: 需要 ${d.need}，逐点计数 ${JSON.stringify(d.counters)} state=${d.state}`);
  ok(d.counters[d.counters.length - 1] === d.need && d.state === 'ready',
     `${QID} 的 ${d.need} 个点位能逐个采满`);
}

console.log('\n===== E. offerLine / progressLine / deliverLine 进了对话 =====');
console.log(`   available 首句: ${JSON.stringify((r.E.avail[0] || '').slice(0, 40))}`);
console.log(`   offerLine 原文: ${JSON.stringify((r.E.q.offer || '').slice(0, 40))}`);
const has = (lines, v) => {
  const arr = Array.isArray(v) ? v : [v];
  return arr.some((x) => x && lines.includes(x));
};

ok(has(r.E.avail, r.E.q.offer), 'available 对话里出现委托自己的 offerLine 原话');
ok(!r.E.avail.some((t) => t && t.startsWith('对了，有件事想请你帮忙。')),
   '有 offerLine 时不再出现通用旁白「对了，有件事想请你帮忙。」');
ok(r.E.avail.some((t) => t && t.includes('【委托】帽子里的礼物')),
   '接取卡（标题 + 描述 + 奖励）仍然保留');
ok(has(r.E.active, r.E.q.progress), 'active 对话里出现 progressLine');
ok(has(r.E.ready, r.E.q.deliver), 'ready 对话里出现 deliverLine');

console.log('\n===== F. 10 个委托道具贴图 =====');
console.log(`   ${r.F.ids.join(', ')}`);
ok(r.F.missing.length === 0, `全部贴图已加载（缺：${r.F.missing.join(', ') || '无'}）`);

console.log(`\n${fail.length === 0 ? '✅ 全部通过' : `❌ 失败 ${fail.length} 项`}`);
await b.close();
process.exit(fail.length === 0 ? 0 : 1);
