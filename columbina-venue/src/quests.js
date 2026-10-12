/**
 * 任务配置
 *
 * 设计原则：
 *   任务由 NPC 发放（NPC 分散在 10 张地图上），内容是筹备林间生日会所需的物资。
 *   因为主会场是林地，没有现成的派对用品，所以任务都是「去别处收集」。
 *
 * 剧情顺序：
 *   主线：在书桌写 11 封邀请函 → 收起来 → 投信箱 → 13 位客人前来
 *     ↓
 *   委托：每位客人一条任务，为主题筹备物资
 *     ↓
 *   结局：所有委托做完 → 围桌庆功宴 → 切蛋糕
 *
 * 任务目标类型：
 *   talk      和指定 NPC 对话
 *   visit     走到指定场景的指定格子
 *   collect   收集 N 个物品（由场景里的交互点触发）
 *   openGame  打开小游戏
 *   interact  由交互点直接置满（切蛋糕用）
 *
 * ★ 2026-10-12 按《哥伦比娅生日会_文案总表》第二/三/六部分全面修订：
 *   · 原有 5 条委托的 desc / needLabel / reward 全部重写（人设核对后的版本）；
 *   · 新增 9 条委托（9 位原本没有委托的 NPC 每人一条）；
 *   · 每条委托可选地带 offerLine / progressLine / deliverLine 三个字段 ——
 *     由 NPC 自己开口说的话。不填就沿用通用模板（见 VenueScene.buildDialogLines）。
 *
 * ★ 为什么 offerLine 是数组而不是一句话：
 *   第一部分的 8 条新委托，接取台词是 4~5 句连着的独白（比如林尼的魔术预告）。
 *   一句一句推进才有人物感；挤成一行会变成一段没有人称的说明书。
 */

export const QUESTS = [
  // =========================================================================
  // 主线：写邀请函 & 投递
  // 这两个任务不由 NPC 发放，而是推进剧情用的
  //
  // ★ 流程改版（2026-10-04）：写信环节回来了，而且升级成一段过场
  //   旧：　　　　　　　　　　　　　　 收起 → 投递
  //   新：书桌前按 F 写一封（信纸逐行展开 → 收归信封）→ 桌上累积
  //       → 收起 → 投递
  //   正文来自《生日会邀请函.docx》，一共 11 封（见 StorySystem.js 的 GUESTS）。
  // =========================================================================
  {
    id: 'main-write',
    // title 里的 id 保持 main-write 不变 —— 存档、验收脚本都按这个 id 找任务，
    // 改 id 会让老存档和新脚本都对不上。只改给人看的文案。
    title: '【主线】写邀请函',
    desc: '走到窗前的书桌，把邀请函一封一封写好',
    scene: 'home',
    // 特殊标记：不是 NPC 派发，而是场景交互推进
    special: 'write',
    // count 要和 StorySystem.js 的 GUESTS.length 一致（11 封）
    target: { type: 'writeLetters', count: 11 },
    reward: null,
    autoAccept: true,
  },
  {
    id: 'main-deliver',
    title: '【主线】投递邀请函',
    desc: '把写好的邀请函投进林间信箱',
    scene: 'mailbox',
    special: 'deliver',
    target: { type: 'deliverLetters', count: 1 },
    reward: null,
    autoAccept: true,
  },

  // =========================================================================
  // 委托：原有 5 条（文案总表第二部分 · 修订稿）
  // =========================================================================

  // —— 爱诺（小孩，活泼）→ 去池塘捉鱼 ——
  {
    id: 'q-ainuo-fish',
    scene: 'venue',
    title: '【委托】池塘捉鱼',
    // ★ 原稿是「爱诺说想吃鱼。去池塘边捉几条回来吧」—— 第三人称转述 + 祈使句，
    //   两个问题：不是她自己在说话；而且她是**为了她的发明**跑腿，不是嘴馋。
    desc: '我发明了一台『咕嘟咕嘟自动烤鱼机』，可它现在还差一样东西——鱼。\n'
        + '去池塘边替我捉条最大的回来！报酬是一整碟白灵蛋卷，我请客！\n'
        + '……什么，伊涅芙不让我吃那么多？嘘——只要伊涅芙没发现就是没吃。',
    giverNpcId: 'npc-ainuo',
    deliverNpcId: 'npc-ainuo',
    // 接任务时 / 进行中 / 交付时，她自己开口说的那句
    offerLine: '欸——等一下！你是来陪我玩的吗？',
    progressLine: '鱼呢？……嘿嘿，那我先把蛋卷烤上。伊涅芙不在这边！',
    deliverLine: ['哇——！真的抓到了！', '那、那分你一半。就一半哦，不能再多了。'],
    // 交付后会在会场出现的道具（和任务一一对应）
    //
    // ★ 坐标来源：场景网格图/林间空地委托完成后道具点位.png
    //   用户在图上用红框标了 10 个可放道具的格子，
    //   下面 5 个道具各占其中一个，互不重复。
    //   （红框=1 格；按 64px/格 最小二乘拟合，误差为 0）
    propReward: { id: 'fish-basket', name: '鱼篓', tileX: 5, tileY: 22, h: 92 },
    target: {
      // 改成采集类：由场景里的交互点触发（原来走到就算完成，没过程感）
      type: 'collect',
      itemId: 'fish',
      count: 1,
      needLabel: '去池塘边，捉最大的那种鱼',
    },
    // 原：爱诺的星星糖 ×3。改「白灵蛋卷」的依据：她官方语音亲口说
    // 「这个世界上所有的甜食我都喜欢，其中最喜欢的是白灵蛋卷！」
    reward: '白灵蛋卷 ×3',
  },

  // —— 奈芙尔（秘闻馆老板，商人式）→ 去池塘打水 ——
  {
    id: 'q-nefer-water',
    scene: 'venue',
    title: '【委托】打一桶清水',
    desc: '煮茶、洗果子，都要用水。\n'
        + '桶给你，池塘在东边。打水的时候别太依赖眼睛——井底看着浅，未必真的浅。',
    giverNpcId: 'npc-nefer',
    deliverNpcId: 'npc-nefer',
    offerLine: '嗯…差不多是时候了。有件小事，你去办。',
    progressLine: '桶还空着。不急……我这的茶，泡好了放着也不会跑。',
    // 交付那句直接把官方语音「你也多喝点水，对身体好」搬来当谢礼 ——
    // 符合她「谢礼就是一句话」的做派；然后在她自己追问「为什么是水」的时候
    // 第一次不说下去（官方语音里她也是说到「不那么愉快的过去」就停了）。
    deliverLine: ['成交。……你也多喝点水，对身体好。', '为什么是水？只是个不值一提的习惯。别问了。'],
    // 交付后会在会场出现的道具（和任务一一对应）
    propReward: { id: 'water-bucket', name: '水桶', tileX: 9, tileY: 22, h: 86 },
    // 接任务时先给一个空桶 —— 没有它到池塘也打不了水
    onAcceptGive: { id: 'bucket-empty', name: '空桶' },
    target: {
      // 不再用「走到某处」，改成「拿到装满水的桶」
      type: 'collect',
      itemId: 'water-full',
      count: 1,
      needLabel: '去池塘，把桶打满',
    },
    reward: '秘闻馆的私藏茶 ×1',
  },

  // —— 菲林斯（执灯人，古雅）→ 采野花做装饰 ——
  {
    id: 'q-philins-flower',
    scene: 'venue',
    title: '【委托】采集野花',
    desc: '这块空地很好，只是少了一样东西……一处值得被记住的颜色。\n'
        + '您若愿意，替我去秘境采几朵野花回来。\n'
        + '不用挑最艳的，挑开得最坦然的……它们开在无人处。',
    giverNpcId: 'npc-philins',
    deliverNpcId: 'npc-philins',
    // 接取句把「帮忙」写成对等交换（我掌灯／你采花）—— 这是他一贯的体面
    offerLine: '有件小事，本不该劳烦您——夜快深了，我为您掌灯，您为我采花，如何？',
    progressLine: '花不急于一时。花开在那里，本就是为着被看见。',
    // 交付第二句挪用他的官方生日语音，把「为你庆生」的说法反用在哥伦比娅的花上
    deliverLine: [
      '很好。……我替这些花谢谢您。它们本该开在无人处。',
      '为了庆祝人来到世上，爱他的人为他举办生日宴会，献上歌声与祝福。今晚这束花，算我们一同献上的。',
    ],
    // 交付后会在会场出现的道具（和任务一一对应）
    propReward: { id: 'flower-vase', name: '花瓶', tileX: 12, tileY: 22, h: 96 },
    target: {
      // 改成采集类：由场景里的交互点触发（原来走到就算完成，没过程感）
      type: 'collect',
      itemId: 'flower',
      count: 1,
      needLabel: '去秘境，采几朵野花',
    },
    reward: '提灯主人的旧灯罩 ×1',
  },

  // —— 桑多涅（木偶，爱玩）→ 采发光蘑菇当灯 ——
  {
    id: 'q-sandrone-mushroom',
    scene: 'venue',
    title: '【委托】会发光的蘑菇',
    // ★ 原稿动机是「天黑看不见」—— 那是怕黑，不像她。
    //   改成**茶会**（官方她真的在张罗茶会，生日语音里点名
    //   「我已经叫上了阿蕾奇诺和哥伦比娅」），再用最后一句把动机藏回去 ——
    //   她永远不承认自己是用心的。
    desc: '哈。就这儿？黑得连影子都懒得跟人走。\n'
        + '秘境里有种会发光的蘑菇——采两朵回来。\n'
        + '别问我为什么是两朵。……茶会上总要有点光源，仅此而已。',
    giverNpcId: 'npc-sandrone',
    deliverNpcId: 'npc-sandrone',
    offerLine: '哦，是你。正好——差不多该约一次茶会了吧？缺两样东西。',
    progressLine: '还没弄好？……啧。我又不是真的着急，只是这里太暗了。',
    // 说完软话立刻自我否认 —— 这是她最标志性的动作
    deliverLine: ['嗯，还行。放那边吧。', '……才、才不是因为好看。是因为实用。', '茶会上总要有点光源，仅此而已。'],
    // 交付后会在会场出现的道具（和任务一一对应）
    propReward: { id: 'mushroom-lamp', name: '蘑菇灯', tileX: 28, tileY: 22, h: 90 },
    target: {
      // 改成采集类：由场景里的交互点触发（原来走到就算完成，没过程感）
      type: 'collect',
      itemId: 'mushroom',
      count: 1,
      needLabel: '去秘境，采两朵会发光的蘑菇',
    },
    reward: '茶会多重奏 ×1',
  },

  // —— 菈乌玛（慈爱，从不命令只邀请）→ 收集干柴生火 ——
  {
    id: 'q-lawuma-firewood',
    scene: 'venue',
    title: '【委托】拾取干柴',
    // ★ 改动的重点：把生火的理由从「取暖」改成**留一处光源**，
    //   与桑多涅那句「茶会上总要有点光源」形成对照 —— 一个藏、一个明说。
    //   第二句直接化用她官方的句式「即使不在夜晚，即使看不到天空，（月光）也从未消散」。
    desc: '夜里我想生一堆火。\n'
        + '即使不在夜晚，即使看不到天空，火也从来不曾消散过。\n'
        + '我只是想让它亮在大家都看得见的地方。\n'
        + '秘境周围的枯枝就很好，麻烦您替我拾一捆回来。',
    giverNpcId: 'npc-lawuma',
    deliverNpcId: 'npc-lawuma',
    // 照搬官方「今晚的月光很平静。要一起去树林里走走吗？」再补半句委托
    offerLine: '今晚的月光很平静。要一起去树林里走走吗？……顺便，帮我拾一捆枯枝。',
    progressLine: '不急。火等得起。',
    deliverLine: ['谢谢您。今晚，会有一处地方是暖的。', '若您愿意，也可以坐下来，火边正好还空着。'],
    // 交付后会在会场出现的道具（和任务一一对应）
    propReward: { id: 'firewood-pile', name: '柴堆', tileX: 32, tileY: 22, h: 74 },
    target: {
      // 改成采集类：由场景里的交互点触发（原来走到就算完成，没过程感）
      type: 'collect',
      itemId: 'firewood',
      count: 1,
      needLabel: '去秘境周围，拾一捆枯枝',
    },
    reward: '天光的纺琴 ×1',
  },

  // =========================================================================
  // 委托：新增 9 条（文案总表第一部分）
  //
  // 能力边界（2026-10-11 逐行复核源码后的结论）：
  //   talk    系统已支持，零改动
  //   visit   框架已支持，只需修 VenueScene.js:2499 的一行 bug
  //   所以这 9 条里没有一条需要新增系统能力。
  // =========================================================================

  // —— 新委托 1 ｜ 阿蕾奇诺 〈赏罚皆自我出〉——
  //
  // 唯一一条 talk 委托：她把「孩子过得好不好」说成一句工作汇报。
  // ★ 不需要任何代码改动 ——
  //   QuestSystem.js:138 按 q.target.npcId 过滤，
  //   VenueScene.js:2253 在每次对话结束时无条件调用 markTalked(npc.id)。
  {
    id: 'q-arlecchino-check',
    scene: 'venue',
    title: '【委托】赏罚皆自我出',
    // ★ 总表没有给这条的【委托词 desc】（直接列了接取台词），这一句是按她的
    //   接取台词第 2 句缩写的 —— 汇报里已标明是自拟。
    desc: '父亲说，出门在外，人要点清，东西也要。',
    giverNpcId: 'npc-arlecchino',
    deliverNpcId: 'npc-arlecchino',
    offerLine: [
      '月亮上的路，比我想象中好找。',
      '按壁炉之家的规矩，出门在外，人要点清。',
      '林尼在会场那头。去看看孩子们的情况。',
      '这是我的责任。',
    ],
    progressLine: '还没见到人？',
    deliverLine: ['在笑。那就好。', '今晚不谈公事。去切蛋糕吧。'],
    target: {
      type: 'talk',
      npcId: 'npc-lyney',
      count: 1,
      needLabel: '去和林尼说一句话',
    },
    reward: '厄月缎带 ×1',
  },

  // —— 新委托 2 ｜ 林尼 〈帽子里的礼物〉——
  {
    id: 'q-lyney-rose',
    scene: 'venue',
    title: '【委托】帽子里的礼物',
    desc: '节目早就定了：《从帽子里变出礼物》。可帽子现在是空的。',
    giverNpcId: 'npc-lyney',
    deliverNpcId: 'npc-lyney',
    offerLine: [
      '噢——终于有人来了！听好，我今晚需要一位观众，也需要一双手。',
      '是这样的：节目早就定了，叫《从帽子里变出礼物》。可帽子现在是空的。',
      '秘境里有种花，颜色好得像假的，叫虹彩蔷薇。正好三朵。',
      '采回来，我教你怎么把它变没。看好了哦——千万不要眨眼。',
    ],
    progressLine: '还差几朵。别急——魔术师最擅长的就是等。',
    deliverLine: [
      '三朵。一朵不多，一朵不少。',
      '看仔细咯——三、二、一……《惊喜礼花》！',
      '如何？我的帽子里装着很多很多人的期待，现在又多装了三朵花。',
      '（小声说：刚才那一下，我在袖子里练了好几遍。这句可别记进节目单。）',
    ],
    propReward: { id: 'magic-box', name: '魔术箱', tileX: 7, tileY: 22, h: 88 },
    target: {
      type: 'collect',
      itemId: 'rainbow-rose',
      count: 3,
      needLabel: '去秘境，采三朵虹彩蔷薇',
    },
    reward: '方块戏法 ×1',
  },

  // —— 新委托 3 ｜ 琳妮特 〈茶。十二杯。〉——
  {
    id: 'q-lynette-tea',
    scene: 'venue',
    title: '【委托】茶。十二杯。',
    // 全篇她只说一句完整的话，而且是把官方原句拆成前后两半接到一起 ——
    // 这是她能给出的、最长的善意。
    desc: '纸条上写着：茶。十二杯。谢谢。翻过来还有一行小字——茶叶没了。',
    giverNpcId: 'npc-lynette',
    deliverNpcId: 'npc-lynette',
    offerLine: [
      '……',
      '（她看了你一眼，从袖子里抽出一张纸条。）',
      '（纸条上写着：茶。十二杯。谢谢。）',
      '（翻过来还有一行小字：茶叶没了。）',
    ],
    progressLine: '（她把空杯子往你这边推了推，又收回去了。）',
    deliverLine: [
      '……好。',
      '我习惯工作之前喝一杯茶。今天这一杯，算工作之前，也算之后。',
      '（她替你斟了第一杯，然后在对面坐了下来。）',
    ],
    target: {
      type: 'collect',
      itemId: 'tea-leaf',
      count: 1,
      needLabel: '去秘境，采几片野茶叶',
    },
    reward: '午后闲茶 ×1',
  },

  // —— 新委托 4 ｜ 菲米尼 〈水下的灯〉——
  {
    id: 'q-freminet-lamp',
    scene: 'venue',
    title: '【委托】水下的灯',
    desc: '浅滩底下沉着一样东西。他说，不敢一个人去。',
    giverNpcId: 'npc-freminet',
    deliverNpcId: 'npc-freminet',
    // 最后一句直接用了他的官方原句（「只要那盏炉火亮着，我就有家可归」）——
    // 这是全篇唯一一次他说得流畅的地方：因为这句是背下来的，不是临场想的。
    offerLine: [
      '那个…我、我不是很会说这种话…',
      '浅滩底下…有一盏灯。是以前系在船舷上的那种…沉了很久了。',
      '如果可以的话…能不能帮我把它捞上来。工具我带了，只是…我一个人不太敢去。',
      '无论我在何处漂流，只要那盏炉火亮着，我就有家可归…今天晚上，我想让它在桌上亮一次。',
    ],
    progressLine: '应该…还在水底吧。',
    deliverLine: [
      '真的…捞上来了。',
      '谢谢你。这样，今晚就有一盏是『从水底回来』的灯了。',
      '…要是你答应不看我，我可以在这里，再坐一会儿吗。',
    ],
    propReward: { id: 'sunken-lamp', name: '沉船灯盏', tileX: 11, tileY: 22, h: 86 },
    target: {
      type: 'collect',
      itemId: 'sunken-lamp',
      count: 1,
      needLabel: '去青水浅滩，把那盏灯捞上来',
    },
    reward: '海鸟的驻足 ×1',
  },

  // —— 新委托 5 ｜ 那维莱特 〈雨檐之下的一滴水〉——
  {
    id: 'q-neuvillette-water',
    scene: 'venue',
    title: '【委托】雨檐之下的一滴水',
    desc: '今晚没有雨。他说，那就去尝一尝另一处的水。',
    giverNpcId: 'npc-neuvillette',
    deliverNpcId: 'npc-neuvillette',
    // 首句把官方生日语音里的「我会想想办法的」落成实际行动：
    // 雨来不了，那就去把水找回来 —— 这是他表达在意的方式。
    offerLine: [
      '今晚没有雨。我查过记录——这片天空近七日都无降水概率。这是个遗憾，也是一个机会。',
      '叨扰了。我是那维莱特。',
      '此地的月泉最为洁净，我尚未品尝过。可否代我取一瓶来？',
      '我想知道，月亮上的水，和提瓦特的水有什么不同。',
    ],
    progressLine: '样本尚未取得。我只是……有些期待。',
    deliverLine: [
      '多谢。',
      '……比雨更静，比雨更冷。',
      '如潮水会记住每一道岸线，我亦会记住今晚。这一滴水，我会单独记下。',
      '今晚这场宴席，我本以为自己只是来观礼的。……你也要多喝热水。水会治愈一切。',
    ],
    propReward: { id: 'moon-spring-bottle', name: '月泉水晶瓶', tileX: 34, tileY: 22, h: 84 },
    target: {
      type: 'collect',
      itemId: 'moon-spring-water',
      count: 1,
      needLabel: '去冰原的月泉，取一瓶净水',
    },
    reward: '缥雨一滴 ×1',
  },

  // —— 新委托 6 ｜ 芙宁娜 〈导演的第一条指示：灯〉——
  {
    id: 'q-furina-lamp',
    scene: 'venue',
    title: '【委托】导演的第一条指示：灯',
    desc: '导演的第一条指示：灯。三盏。要软的那种。',
    giverNpcId: 'npc-furina',
    deliverNpcId: 'npc-furina',
    // 首句照录官方初次见面开场白，「大明星」的自我介绍一字未改
    offerLine: [
      '呆站在那里做什么？该不会是因为过于激动，说不出话了吧？'
        + '没错，站在你面前的就是枫丹人人皆知的大明星——芙宁娜哦。',
      '月亮上的光线太『真诚』了，缺乏戏剧性！一个合格的舞台需要三盏灯：'
        + '一盏照脸，一盏照影，还有一盏，用来骗过所有人的眼睛。',
      '去彩池那边，替我点亮三盏月灵灯。要像剧场第二排洒下来的那种。',
      '我在枫丹见过一种叫幽光星星的生物——在无人注视的地方也能发出自己的光亮。那才是真正的明星。',
    ],
    progressLine: '灯还没亮全呢。别急，好戏都是要等的。',
    // 第三句把她自己生日语音里那部歌剧《欢乐日》让给了哥伦比娅 ——
    // 官方《欢乐日》的本意就是「为某个重要的人做庆贺」。
    deliverLine: [
      '……嗯，就是这个味道。',
      '掌声我收下了。不过先说好——刚才那句是真心，还是场面话？',
      '今晚这一出，就叫《欢乐日》吧。内容嘛——很多人聚在一起，为某个重要的人做庆贺。',
      '生日快乐！下一幕的主角，永远是你。',
    ],
    propReward: { id: 'moon-lamp-stand', name: '月灵灯架', tileX: 30, tileY: 22, h: 90 },
    target: {
      type: 'collect',
      itemId: 'moon-lamp',
      count: 3,
      needLabel: '去彩池，点亮三盏月灵灯',
    },
    reward: '美味的泡泡舒芙蕾 ×1',
  },

  // —— 新委托 7 ｜ 伊涅芙 〈清扫程序·会场版〉——
  {
    id: 'q-ineffa-cleanup',
    scene: 'venue',
    title: '【委托】清扫程序·会场版',
    desc: '清扫程序已启动。会场内有五件细小物件等待回收。',
    giverNpcId: 'npc-ineffa',
    deliverNpcId: 'npc-ineffa',
    // 接取首句与交付第三句照录官方原文（清扫提醒 / 特别日服务）；
    // 「（第一次）」「（第二次）」是故意给「重复三次」埋的计数梗 ——
    // 第三次她说不出口，就变成了生日快乐。
    offerLine: [
      '正在执行清扫程序…根据已记录数据，格外提醒：请不要遗落摩拉、螺丝、齿轮、矿石、玩具、'
        + '软糖、零食、发圈、袜子、拖鞋等细小物件。',
      '（第一次提醒）检测到会场散落了五件细小物件。分类：摩拉、螺丝、齿轮、软糖、发圈。',
      '本提醒重复三次后我将进入超级生气模式，届时将不再处理你的需求…很可怕哦。',
      '请将它们交还给我。这是今晚最优先的任务。',
    ],
    progressLine: '（第二次提醒）正在检索…清扫进度未满。对策：继续检测。',
    deliverLine: [
      '清扫程序执行完毕。会场洁净度：合格。',
      '顺带生成报告一份。其中包含一条额外结论：把东西捡起来的时候，'
        + '情感模块会产生正反馈…类似你们说的『快乐』。',
      '伊涅芙特别日服务已开启。请你挑选合适的位置坐下小憩片刻，我会布置彩带、气球和鲜花，'
        + '然后根据已记录的数据，准备你喜欢的菜肴和蛋糕。',
      '让我们度过特别的一天吧，生日快乐。',
    ],
    target: {
      type: 'collect',
      itemId: 'litter',
      count: 5,
      needLabel: '在会场里捡回五件小物件',
    },
    reward: '伊涅芙的清扫报告 ×1',
  },

  // —— 新委托 8 ｜ 旅行者（荧）〈替我看一眼终点〉——
  //
  // ★ 唯一一条 visit 委托。目标格子 (4,12) 同时是 ip-moonpath-far 的位置。
  //   落地依赖 VenueScene.js:2499 那一行修复（markVisit(q.id) → markVisit(tx, ty)）。
  // ★ 双人格式：荧说一句 → 括号里接一句派蒙。
  //   旅行者的 BWIKI 语音页是空壳（0 条），抓不到官方逐字台词；
  //   括号里的派蒙台词由本作撰写（无官方原文可引）—— 这一点在总表里已诚实标注。
  {
    id: 'q-traveler-far',
    scene: 'venue',
    title: '【委托】替我看一眼终点',
    // ★ 总表没有给这条的【委托词 desc】，这一句是按接取台词第 4 句缩写 ——
    //   汇报里已标明是自拟。
    desc: '夜路的尽头，是从前她一个人常站的地方。去替她看一眼。',
    giverNpcId: 'npc-traveler',
    deliverNpcId: 'npc-traveler',
    offerLine: [
      '你果然在这里。',
      '（派蒙：喂——找了你好久！她一直站在这里看那边的天空哦。）',
      '旅途还长。但今天，我可以停下来。',
      '夜路尽头那边，是从前我一个人的时候常站的地方。我走后，还没人替我去看过。',
      '去看看，然后回来告诉我：那边的月亮，是不是比这边亮。',
    ],
    progressLine: ['路还长。慢慢走。', '（派蒙：她嘴上这么说，刚才已经朝那边看了三回啦！）'],
    // 结尾她选择不回答，是因为那个问题她其实早就知道答案了
    deliverLine: [
      '……你去了。',
      '那你说，哪边的更亮？',
      '（她没等你回答，先把杯子举了起来。）',
      '（派蒙：欸——你怎么不接话呀！到底哪边更亮嘛！）',
      '……不用答。',
      '（派蒙：唔……我好像懂了，又好像没懂。）',
    ],
    target: {
      type: 'visit',
      scene: 'moonpath',
      tileX: 4,
      tileY: 12,
      radius: 1,
      needLabel: '走到夜路的尽头',
    },
    reward: '旅途的星尘 ×1',
  },

  // —— 新委托 9 ｜ 空 〈派蒙的蛋糕〉——
  {
    id: 'q-aether-cake',
    scene: 'venue',
    title: '【委托】派蒙的蛋糕',
    desc: '派蒙从进门起就盯着那块蛋糕。他说，他已经说过三次『等切了再拿』。',
    giverNpcId: 'npc-aether',
    deliverNpcId: 'npc-aether',
    // 「一次／第五遍／第三遍」这个数字错乱是故意留的：三个人各数各的，
    // 说明这一小块蛋糕从头到尾就没被认真计数过 —— 派蒙的心思全在蛋糕上。
    offerLine: [
      '派蒙从进门起就盯着那块蛋糕。我已经说了三次『等切了再拿』。',
      '（派蒙：一次！你明明只说过一次！）',
      '不过——寿星切蛋糕是压轴，之前那段空档有点长。你先替她切一小块出来，堵住那张嘴就行。',
      '（派蒙：第五遍了！我已经数到第五遍了！）',
      '放心，账我记着。',
    ],
    progressLine: ['她还在数。……已经数到第三遍了。', '（派蒙：第三遍怎么了！第三遍也是我数的！）'],
    deliverLine: [
      '……总算安静了。',
      '谢谢你。今晚的月亮，我们都看见了。',
      '（派蒙：唔唔唔……好、好吃！）',
      '（派蒙：……那个，哥伦比娅，生日快乐哦。）',
    ],
    propReward: { id: 'cake-stand', name: '派蒙的小蛋糕架', tileX: 6, tileY: 22, h: 80 },
    target: {
      type: 'collect',
      itemId: 'cake-slice',
      count: 1,
      needLabel: '去会场，替她切一小块蛋糕',
    },
    reward: '派蒙的谢礼 ×1',
  },

  // =========================================================================
  // 结局：庆功宴上的「切蛋糕」
  //
  // ★ 这条任务【不是开局就有的】。它带 afterParty 标记：
  //     · QuestSystem.snapshot() 在庆功宴开起来之前完全不把它列进任务列表；
  //     · celebration.isPartyTime() 也把带这个标记的任务排除在
  //       「是不是所有委托都完成了」的判定之外 ——
  //       否则它自己会把那个条件顶掉，围桌永远开不起来。
  //   围桌一开，任务列表里就自动多出这一条（用户原话：「任务列表刷新新任务：切蛋糕」）。
  // =========================================================================
  {
    id: 'q-party-cake',
    scene: 'venue',
    title: '【结局】切蛋糕',
    desc: '大家都到齐了。走到主位，为这场生日会切下第一块蛋糕',
    afterParty: true,
    // 出现即「进行中」—— 不需要找谁去接
    autoAccept: true,
    // 进度由交互点直接置满（见 QuestSystem.completeById），
    // 这里写个占位目标只是让任务列表有进度条可画
    target: { type: 'interact', count: 1 },
    reward: null,
  },
];

// ---------------------------------------------------------------------------
// 场景里的可交互点
// ---------------------------------------------------------------------------
// 这些是「走到附近按 F 触发」的功能点。
//
// 邀请函流程（当前版本）：
//   书桌写 → 从桌上拿 → 去信箱投递
//
// 为什么分「写」和「拿」两步：
//   直接写好就自动收进包里没有实感。
//   分成两步后，玩家能明确看到「桌上多了东西 → 我拿走了」，
//   以后要加"坐下来写字的动画"时，也是在「写」这一步插。
//
// id        : 唯一标识
// scene     : 所在场景
// tileX/Y   : 位置（格子）
// shape     : 头顶图标（见 InteractPoints.js 的 ICON_TEXT，只能用已有的那几种）
// label     : 名称
// hint      : 走近时的提示
// action    : 触发动作
//   'writeLetter'   写一封（放在桌上）
//   'takeLetters'   从桌上拿走写好的
//   'deliver'       投递
//   'collectItem'   采集（同一 collectId 可以有多处点位，各自只能采一次）
//   'cake'          切蛋糕
//   'none'          只是看看
// requires  : 触发前提
//
// ★ 2026-10-12（用户任务2）带 questId 的点位改成「三态」：
//     委托还没接 → 整个点不出现（以前会留一个压暗到 0.06 的暗斑，
//                  等于提前把「哪张图上有什么可以捡」剧透给玩家）
//     委托进行中 → 正常显示（和发布人同地图时，接完立刻出现，不必重进场景）
//     委托已完成 → 消失
//   没有 questId 的点（ip-desk / ip-mailbox）不受影响，仍旧只看 requires。
//   实现见 InteractPoints.js 的 update()。
//
// ★ shape 只能用 InteractPoints.js:206 makeIcon 里已有分支的形状，
//    没有的会退化成菱形：drop / fish / flower / mushroom / wood /
//    letter / mailbox / pen / cake
// ---------------------------------------------------------------------------
export const INTERACT_POINTS = [
  // ===== 书桌场景 =====
  //
  // ★ 流程改版（2026-10-04 第二版）：写信 → 投递，中间不再有「收起来」
  //
  //   书桌只剩一件事：还没写完就按 F 写下一封（信纸逐行展开 → 收归信封的过场）。
  //   信纸过场的收尾就是「折起来 → 收进信封 → 封口 → 飞走」，那一刻这封信
  //   已经进了哥伦比娅怀里（StorySystem 直接记 carried），所以没有
  //   「先堆在桌上、再回来按 F 收进怀里」这一步了。
  //
  //   为什么删掉那一步：
  //     它没有任何任务在指引（main-write 写满第 11 封就自动完成，主线立刻把玩家
  //     指向「投递邀请函 → 前往信箱」），玩家走到信箱却发现 requires 不满足、
  //     没提示也没反应，直接卡死（用户 2026-10-04 反馈的问题4）。
  //
  //   label / hint / shape / requires 都可以写成 (story) => ... 的函数，
  //   InteractPoints 会用当期剧情求值（见 InteractPoints.js 的 resolve()）。
  {
    id: 'ip-desk',
    scene: 'home',
    tileX: 15, tileY: 5,
    shape: 'pen',
    label: '窗前的书桌',
    hint: (s) => `按 F 写邀请函（${s.writtenCount}/${s.totalCount}）`,
    action: 'writeOrTake',
    // 11 封都写完了，这个点就【整个消失】（连幽灵图标都不留，见 InteractPoints.rebuild）
    requires: (s) => !s.allWritten,
    hideWhenUnavailable: true,
  },

  // ===== 信箱场景 =====
  {
    id: 'ip-mailbox',
    scene: 'mailbox',
    tileX: 21, tileY: 13,
    shape: 'mailbox',
    label: '林间信箱',
    hint: '按 F 投递邀请函',
    action: 'deliver',
    // 11 封都写好、还没投出去 → 信箱可用（信在 carried 里，见 StorySystem.writeLetter）
    requires: 'allWrittenNotDelivered',
  },

  // ===== 池塘：任务目标点 =====
  {
    id: 'ip-pond-fish',
    questId: 'q-ainuo-fish',
    scene: 'pond',
    tileX: 14, tileY: 11,
    shape: 'fish',
    label: '水边',
    hint: '能看到鱼影',
    // 采集：按 F 拿到任务物品（itemId 要和任务目标的 itemId 对上）
    action: 'collectItem',
    collectId: 'fish',
    okText: '你卷起裤脚，在浅水里捞了一阵。\n还真抓到了一条肥鱼。',
  },
  {
    id: 'ip-pond-water',
    questId: 'q-nefer-water',
    scene: 'pond',
    tileX: 27, tileY: 5,
    shape: 'drop',
    label: '取水处',
    hint: '按 F 打水',
    // 通用换物：需要空桶 -> 给装满水的桶
    //
    // 为什么这么做：
    //   原来的打水任务是「走到水边就算完成」，没有过程感。
    //   改成携带空桶来装水，玩家能明确看到「桶空了 -> 桶满了」。
    action: 'exchangeItem',
    needItem: 'bucket-empty',
    needHint: '你没有能装水的东西。先去会场找奈芙尔接下打水的委托，她会给你一个空桶。',
    giveItem: 'water-full',
    giveName: '装满水的桶',
    doneItem: 'water-full',
    doneHint: '桶已经装满了，赶紧送回去吧。',
    okText: '你蹲在池边，把桶按进水里。\n水很凉，一下子就满了。',
    collectId: 'water-full',
  },

  // ===== 秘境：任务目标点 =====
  {
    id: 'ip-grove-flower',
    questId: 'q-philins-flower',
    scene: 'grove',
    tileX: 27, tileY: 11,
    shape: 'flower',
    label: '花丛',
    hint: '开得正好的野花',
    // 采集：按 F 拿到任务物品（itemId 要和任务目标的 itemId 对上）
    action: 'collectItem',
    collectId: 'flower',
    okText: '你挑了几朵开得最好的野花，\n小心地连茎折下来。',
  },
  {
    id: 'ip-grove-mushroom',
    questId: 'q-sandrone-mushroom',
    scene: 'grove',
    tileX: 7, tileY: 10,
    shape: 'mushroom',
    label: '发光蘑菇',
    hint: '泛着微光',
    // 采集：按 F 拿到任务物品（itemId 要和任务目标的 itemId 对上）
    action: 'collectItem',
    collectId: 'mushroom',
    okText: '这种蘑菇在暗处泛着淡淡的蓝光。\n你采下两朵。',
  },
  {
    id: 'ip-grove-wood',
    questId: 'q-lawuma-firewood',
    scene: 'grove',
    tileX: 18, tileY: 20,
    shape: 'wood',
    label: '干柴堆',
    hint: '一些枯枝',
    // 采集：按 F 拿到任务物品（itemId 要和任务目标的 itemId 对上）
    action: 'collectItem',
    collectId: 'firewood',
    okText: '你捡了一捆干燥的枯枝，\n用草绳捆好。',
  },

  // ===== 主会场：庆功宴主位（切蛋糕） =====
  //
  // 位置就是哥伦比娅在围桌场景里站的那个「主位口袋」(19,9) ——
  // 左边两位旅行者、右边桑多涅。庆典一开她人就在这个点上，
  // 所以玩家站在那儿按 F 就能切。
  {
    id: 'ip-party-cake',
    questId: 'q-party-cake',
    scene: 'venue',
    tileX: 19, tileY: 9,
    shape: 'cake',
    label: '切蛋糕',
    hint: '按 F 切开生日蛋糕',
    action: 'cake',
    // 只有庆功宴开了才存在；没开的时候【连这个点都不建】
    // （hideWhenUnavailable + requires，见 InteractPoints.rebuild）
    requires: 'partyTime',
    hideWhenUnavailable: true,
    // ★ 这个点落在桌子前沿上：图标和文字要抬到**桌面之上**，否则会被大桌子盖住。
    //
    //   桌子精灵： banquet-table.png，世界包围盒 x 555~2005 / y 512~968，depth 450
    //   主位坐标： tile (19,9) → 世界 (1248, 608)
    //   主角盒子： origin(0.5,0.85)、displayHeight 192 → y 445~637
    //
    //   走过的弯路（2026-10-09 记）：
    //     v1 只改 iconDy=-34 / labelDy=-66，图标落到世界 y≈573 —— **仍在桌子包围盒里**，
    //        全局 INTERACT_ICON_DEPTH=420 < 450，照样被压住。
    //     v2 把这一条点的图层单独提到 460（>桌子 450、>围坐主角 430）—— 看得见了，
    //        但它也高过了围坐的主角，破坏了全项目统一的
    //        「互动点在地图之上、哥伦比娅之下」规则（_verify_round7 会红）。
    //     v3（现行）：图层保持全局默认 420，改成把**位置**抬出桌子包围盒 ——
    //        图标世界 y = 608-190 = 418（< 桌子顶边 512，也 < 主角盒子顶边 445），
    //        名牌 y = 608-222 = 386。
    //        既不会被桌子盖住，也仍然在主角之下，两条规则同时成立。
    iconDy: -190,
    labelDy: -222,
  },

  // =========================================================================
  // 新增交互点（文案总表第六部分，对应新增的 9 条委托）
  //
  // id 命名沿用 ip-<场景>-<主题>；collectId 必须与对应委托 target.itemId 完全一致。
  // 坐标已逐个用 _maps.txt 核对过是 '.'，且避开了 NPC 的 3×3 模型禁行区。
  // =========================================================================

  // —— 伊涅芙〈清扫程序·会场版〉：会场内 5 处小物件 ——
  //
  // ★ 5 个点共用 collectId='litter'、委托 count=5。
  //   同一 collectId 的多点位各自只能采一次 —— 靠 QuestSystem 的点位登记
  //   （isPointTaken / markPointTaken）区分，否则第 2 个点会被
  //   doCollectItem 的「已经拿到了」挡回去，5 个点只能捡到 1 个。
  {
    id: 'ip-venue-litter-1',
    questId: 'q-ineffa-cleanup',
    scene: 'venue',
    tileX: 8, tileY: 6,
    shape: 'dot',
    label: '散落的小物件',
    hint: '按 F 捡起来',
    action: 'collectItem',
    collectId: 'litter',
    okText: '你弯腰捡起地上的东西。\n不知道是谁掉的，先收着吧。',
  },
  {
    id: 'ip-venue-litter-2',
    questId: 'q-ineffa-cleanup',
    scene: 'venue',
    tileX: 13, tileY: 7,
    shape: 'dot',
    label: '散落的小物件',
    hint: '按 F 捡起来',
    action: 'collectItem',
    collectId: 'litter',
    okText: '你弯腰捡起地上的东西。\n不知道是谁掉的，先收着吧。',
  },
  {
    id: 'ip-venue-litter-3',
    questId: 'q-ineffa-cleanup',
    scene: 'venue',
    tileX: 27, tileY: 7,
    shape: 'dot',
    label: '散落的小物件',
    hint: '按 F 捡起来',
    action: 'collectItem',
    collectId: 'litter',
    okText: '你弯腰捡起地上的东西。\n不知道是谁掉的，先收着吧。',
  },
  {
    id: 'ip-venue-litter-4',
    questId: 'q-ineffa-cleanup',
    scene: 'venue',
    tileX: 32, tileY: 6,
    shape: 'dot',
    label: '散落的小物件',
    hint: '按 F 捡起来',
    action: 'collectItem',
    collectId: 'litter',
    okText: '你弯腰捡起地上的东西。\n不知道是谁掉的，先收着吧。',
  },
  {
    id: 'ip-venue-litter-5',
    questId: 'q-ineffa-cleanup',
    scene: 'venue',
    tileX: 20, tileY: 18,
    shape: 'dot',
    label: '散落的小物件',
    hint: '按 F 捡起来',
    action: 'collectItem',
    collectId: 'litter',
    okText: '你弯腰捡起地上的东西。\n不知道是谁掉的，先收着吧。',
  },

  // —— 空〈派蒙的蛋糕〉：会场主位旁的蛋糕 ——
  //
  // ★ 和 ip-party-cake 都在主位附近，但两者时间上互斥，不冲突：
  //   本点带 questId，交付后即被 isQuestDone 隐藏（必须在庆功宴前交掉）；
  //   ip-party-cake 带 requires:'partyTime'，只在 14 条委托全做完之后才生成。
  {
    id: 'ip-venue-cakeslice',
    questId: 'q-aether-cake',
    scene: 'venue',
    tileX: 19, tileY: 11,
    shape: 'cake',
    label: '生日蛋糕',
    hint: '按 F 切一小块',
    action: 'collectItem',
    collectId: 'cake-slice',
    okText: '你切下小小的一块，\n用纸垫着托在手上。',
  },

  // —— 芙宁娜〈导演的第一条指示：灯〉：彩池三处灯座 ——
  {
    id: 'ip-pool-lamp-1',
    questId: 'q-furina-lamp',
    scene: 'pools',
    tileX: 25, tileY: 5,
    shape: 'flower',
    label: '月灵灯',
    hint: '按 F 点亮',
    action: 'collectItem',
    collectId: 'moon-lamp',
    okText: '灯芯亮起来，\n一圈很软的光落在桌面上。',
  },
  {
    id: 'ip-pool-lamp-2',
    questId: 'q-furina-lamp',
    scene: 'pools',
    tileX: 20, tileY: 8,
    shape: 'flower',
    label: '月灵灯',
    hint: '按 F 点亮',
    action: 'collectItem',
    collectId: 'moon-lamp',
    okText: '灯芯亮起来，\n一圈很软的光落在桌面上。',
  },
  {
    id: 'ip-pool-lamp-3',
    questId: 'q-furina-lamp',
    scene: 'pools',
    tileX: 23, tileY: 15,
    shape: 'flower',
    label: '月灵灯',
    hint: '按 F 点亮',
    action: 'collectItem',
    collectId: 'moon-lamp',
    okText: '灯芯亮起来，\n一圈很软的光落在桌面上。',
  },

  // —— 菲米尼〈水下的灯〉：青水浅滩水边 ——
  {
    id: 'ip-shallows-lamp',
    questId: 'q-freminet-lamp',
    scene: 'shallows',
    tileX: 20, tileY: 8,
    shape: 'drop',
    label: '水下的一点光',
    hint: '按 F 打捞',
    action: 'collectItem',
    collectId: 'sunken-lamp',
    okText: '你把绳子放下去，又慢慢收回来。\n一盏小灯挂在绳头上，还滴着水。',
  },

  // —— 那维莱特〈雨檐之下的一滴水〉：冰原月泉 ——
  {
    id: 'ip-icefield-spring',
    questId: 'q-neuvillette-water',
    scene: 'icefield',
    tileX: 28, tileY: 20,
    shape: 'drop',
    label: '月泉',
    hint: '按 F 取一滴水',
    action: 'collectItem',
    collectId: 'moon-spring-water',
    okText: '泉水平得不像话。\n你用瓶口轻轻一碰，就取到了。',
  },

  // —— 琳妮特〈茶。十二杯。〉：秘境野茶丛 ——
  {
    id: 'ip-grove-tea',
    questId: 'q-lynette-tea',
    scene: 'grove',
    tileX: 19, tileY: 13,
    shape: 'flower',
    label: '野茶丛',
    hint: '按 F 采几片',
    action: 'collectItem',
    collectId: 'tea-leaf',
    okText: '你摘了几片新叶，\n指头上留了一点青味。',
  },

  // —— 林尼〈帽子里的礼物〉：秘境虹彩蔷薇（三株） ——
  //
  // ★ 为什么不能复用 ip-grove-flower：
  //   那个点绑死了 questId:'q-philins-flower' + collectId:'flower'，
  //   而 InteractPoints.trigger() 只按 collectId 记账，
  //   林尼要的 'rainbow-rose' 挂不上去。两名 NPC 都用「花」当借口
  //   本来就是这套委托的趣味所在，挤在同一个点上反而串味。
  //
  // ★ 为什么是三个点而不是一个点 count=3：
  //   doCollectItem 一次只 markCollect(collectId, 1)，
  //   一个点永远只能 +1 —— 想凑齐 3 朵就必须有三株可采的花。
  //   秘境那片空地够宽，三株沿同一条横线隔开摆，走过去正好一朵一朵摘。
  {
    id: 'ip-grove-rose',
    questId: 'q-lyney-rose',
    scene: 'grove',
    tileX: 23, tileY: 17,
    shape: 'flower',
    label: '虹彩蔷薇',
    hint: '开得正好，颜色像假的',
    action: 'collectItem',
    collectId: 'rainbow-rose',
    okText: '你挑了一朵开得最像假的花，\n小心地连茎折下来。',
  },
  {
    id: 'ip-grove-rose-2',
    questId: 'q-lyney-rose',
    scene: 'grove',
    tileX: 19, tileY: 17,
    shape: 'flower',
    label: '虹彩蔷薇',
    hint: '花色随角度变',
    action: 'collectItem',
    collectId: 'rainbow-rose',
    okText: '光照过去，花瓣从紫转成了蓝。\n你把它折了下来。',
  },
  {
    id: 'ip-grove-rose-3',
    questId: 'q-lyney-rose',
    scene: 'grove',
    tileX: 26, tileY: 17,
    shape: 'flower',
    label: '虹彩蔷薇',
    hint: '最后一朵',
    action: 'collectItem',
    collectId: 'rainbow-rose',
    okText: '三朵凑齐了。\n三朵花摆在一起，颜色竟然对不上。',
  },

  // —— 旅行者（荧）〈替我看一眼终点〉：月面夜路尽头 ——
  //
  // ★ 这条委托的目标类型是 visit，格子 (4,12) 由 VenueScene.handleQuestVisit()
  //   每帧比对（走过去就自动完成）。这个点只是「到了之后能按一下 E 看一句旁白」：
  //   刻意**不给 collectId**，于是 doCollectItem 会跳过给道具与计数，只弹 okText；
  //   交付后本点随 isQuestDone 一起隐藏，也不会留下任何孤儿图标。
  {
    id: 'ip-moonpath-far',
    questId: 'q-traveler-far',
    scene: 'moonpath',
    tileX: 4, tileY: 12,
    shape: 'dot',
    label: '夜路的尽头',
    hint: '按 F 站一会儿',
    action: 'collectItem',
    okText: '风从很远的地方过来。\n你在这儿站了一会儿。',
  },
];
