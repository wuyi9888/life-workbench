/* ============================================================
 * ai.js — AI 辅助：prompt 构造 + 可选一键调用
 * 设计原则：默认“复制即用”，不强制联网；配置了 API 可一键调用。
 * 隐私：数据仅在用户点击“生成/调用”时离开浏览器，且由用户掌控发送内容。
 * ============================================================ */
(function (global) {
  'use strict';

  /* ---------- 复盘：根因/本质问题 + 方案 + 跟踪 ---------- */
  function buildRootCausePrompt(problemText, recentReviews) {
    const ctx = (recentReviews || []).map(r =>
      `【${r.date}】${r.content || ''}` +
      (r.problems && r.problems.length ? '\n  已记录问题：' + r.problems.map(p => p.text).join('；') : '')
    ).join('\n');
    return `你是一位擅长认知拆解与行为改变的心理教练/人生教练。请基于下面这位用户的「当日复盘问题」以及「近期背景」，帮他做三件事：

1) 表层问题归纳：用一句话重述他表面在纠结什么。
2) 底层/本质问题挖掘：推测 2-4 个他自己可能没意识到的根因（认知偏差、需求未被满足、习惯/环境、情绪模式等），每条给出简要依据。
3) 可执行方案：针对每个本质问题，给 1-2 个具体、低门槛、可坚持的行动建议（最好是本周就能开始的微习惯）。
4) 跟踪指标：给出 1-2 个可观察的“改善信号”，方便他日后回看时判断是否真的变好了。

要求：语气像靠谱的朋友，不鸡汤、不评判；用分点，中文输出。

===== 当日复盘问题 =====
${problemText || '（用户未填写具体问题）'}

===== 近期背景（供你推断本质，可忽略无关项） =====
${ctx || '（暂无历史记录）'}`;
  }

  /* ---------- 自媒体：基于每日输入生成内容方向 ---------- */
  function buildContentPrompt(media, recentInputs) {
    const pos = media.positioning || {};
    const inputs = (recentInputs || []).map(i => `【${i.date}·${i.kind}】${i.text}`).join('\n');
    const ideas = (media.ideas || []).slice(0, 12).map(i => `- ${i.text}${i.refUrl ? '（参考：' + i.refUrl + '）' : ''}`).join('\n');
    return `你是一位自媒体内容策略助手。用户做自媒体的定位如下：
- 方向/定位：${pos.direction || '（待补充）'}
- 目标受众：${pos.audience || '（待补充）'}
- 内容调性：${pos.tone || '（待补充）'}
- 内容支柱：${(pos.pillars || []).join('、') || '（待补充）'}

请结合用户「最近的生活输入」（感恩日记、每日复盘、生活打卡、收藏、灵感），从其中挑出 3-5 个最贴合上述定位、最有内容价值的角度，为每个角度产出：
1) 选题标题（吸引但不过度标题党）
2) 内容方向/核心观点（2-3 句）
3) 建议形式（图文/短视频/长文等）
4) 与定位的契合点
5) 可引用的“素材线索”（来自用户输入的原句或事件）

要求：只挑选真正贴合定位的内容，不硬凑；中文输出，分点清晰。

===== 最近的生活输入 =====
${inputs || '（暂无输入）'}

===== 用户已记录的灵感/参考 =====
${ideas || '（暂无）'}`;
  }

  /* ---------- 洞察报告：周报/月报（个人分析优先） ---------- */
  // 聚合某时间区间内的全部数据，供 AI 分析“人”而非只是“事”
  function collectInsightData(state, type) {
    const t = state ? (function () { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })() : '';
    const since = type === 'month'
      ? t.slice(0, 7) + '-01'
      : (function () { const d = new Date(t + 'T00:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return Store.todayStr(d); })();
    const inRange = (date) => date >= since && date <= t;
    const s = state || Store.get();

    // 打卡统计
    const habits = s.habits.definitions;
    const rec = s.habits.records || {};
    const days = Object.keys(rec).filter(inRange).sort();
    let doneCount = 0, partialCount = 0, totalSlots = 0;
    const perHabit = {};
    habits.forEach(h => { perHabit[h.name] = { done: 0, partial: 0, total: 0 }; });
    days.forEach(d => {
      habits.forEach(h => {
        const r = rec[d] && rec[d][h.id];
        if (r === true || (r && r.s === 'done')) { doneCount++; perHabit[h.name].done++; }
        else if (r && r.s === 'partial') { partialCount++; perHabit[h.name].partial++; }
        totalSlots++;
      });
    });

    // 复盘与问题
    const reviews = s.reviews.entries.filter(e => inRange(e.date));
    const allProblems = [];
    reviews.forEach(e => (e.problems || []).forEach(p => allProblems.push(Object.assign({ d: e.date }, p))));
    // 周度体检转追踪的卡点也计入（d 取报告日期）
    (s.reviews.weeklyReports || []).forEach(r => { if (inRange(r.date)) (r.problems || []).forEach(p => allProblems.push(Object.assign({ d: r.date }, p))); });
    const solved = allProblems.filter(p => p.status === '已改善').length;
    const pending = allProblems.filter(p => p.status !== '已改善');

    // 感恩与心情
    const grat = s.gratitude.entries.filter(e => inRange(e.date));
    const moods = {};
    grat.forEach(e => { if (e.mood) moods[e.mood] = (moods[e.mood] || 0) + 1; });

    // 收藏
    const favs = s.favorites.items.filter(i => inRange(i.date));
    const favCats = {};
    favs.forEach(f => { favCats[f.category] = (favCats[f.category] || 0) + 1; });

    const quotes = s.quotes.filter(q => inRange(q.date));
    const booksReading = s.goals.books.filter(b => b.status === '在读').map(b => b.title);
    const booksDone = s.goals.books.filter(b => b.status === '读完' && inRange(b.finishedAt)).map(b => b.title);
    const notes = [];
    s.goals.books.forEach(b => (b.readingNotes || []).forEach(n => { if (inRange(n.date)) notes.push('《' + b.title + '》：' + n.text); }));

    // 自媒体
    const ideas = s.media.ideas.filter(i => inRange(i.date));
    const materials = s.media.materials.filter(m => inRange(m.date));
    const topics = s.media.topics.filter(x => inRange(x.scheduledDate || x.createdAt));
    const publishes = s.media.publishes.filter(p => inRange(p.date));

    // 每日三件事
    const dailyNotes = Object.keys(s.daily || {}).filter(inRange).map(d => '【' + d + '】' + s.daily[d]);

    return {
      range: since + ' ~ ' + t, type, since, t,
      habits: { days: days.length, doneCount, partialCount, totalSlots, perHabit },
      reviews: { count: reviews.length, list: reviews.slice(0, 10).map(e => ({ d: e.date, content: e.content, problems: (e.problems || []).map(p => p.text) })) },
      problems: { total: allProblems.length, solved, pending: pending.slice(0, 8).map(p => p.text), pendingList: pending.slice(0, 5).map(p => p.d + ' ' + p.text) },
      gratitude: { count: grat.length, moods, sample: grat.slice(0, 8).map(e => (e.mood ? '[' + e.mood + '] ' : '') + (e.items || []).join('；')) },
      favorites: { count: favs.length, cats: favCats, sample: favs.slice(0, 8).map(f => '[' + f.category + '] ' + f.content) },
      quotes: quotes.length,
      books: { reading: booksReading, done: booksDone },
      notes: notes.slice(0, 8),
      media: { ideas: ideas.length, materials: materials.length, topics: topics.length, publishes: publishes.length },
      daily: dailyNotes.slice(0, 7)
    };
  }

  function buildInsightPrompt(state, type) {
    const d = collectInsightData(state, type);
    const label = type === 'month' ? '月报' : '周报';
    const habitRows = Object.keys(d.habits.perHabit).map(name => {
      const h = d.habits.perHabit[name];
      return `- ${name}：完成 ${h.done} 次${h.partial ? '，部分完成 ' + h.partial + ' 次' : ''}`;
    }).join('\n');
    return `你是一位兼具心理学素养与教练技术的个人成长分析师。请基于以下这位用户过去一期的真实记录数据，写一份「${label} · 个人深度分析报告」。

⚠️ 核心要求：这不是工作总结，而是对“人”的分析。请把注意力放在他的【行为模式、性格特质、心理状态、优缺点的动态变化】上，透过数据看到背后的“人”，并给出真诚、具体、不鸡汤的建议。

请严格按以下结构输出（中文）：

## 一、数据概览（客观事实，不超过 8 行）
用简洁清单列出本期关键数据：打卡完成率、复盘次数、问题总数/已解决数、感恩次数、心情分布、收藏/语录/灵感数量、读书进度、自媒体进展。

## 二、行为模式分析（本期最重要的部分）
从打卡完成度、作息习惯（早起拉伸/晚上运动/复盘）、阅读执行情况中，推断他的实际行为模式：
- 哪些习惯稳定执行、哪些经常中断？
- 执行力的高低点出现在什么时候（白天 vs 晚上、周中 vs 周末）？
- 是否存在“启动困难”或“半途而废”的具体证据？

## 三、心理与情绪状态分析
结合感恩心情分布、复盘正文与问题文本，推断：
- 情绪基调与波动（积极为主还是消耗为主）？
- 反复出现哪些困扰（拖延、精力、自我要求过高、关系、工作压力等）？
- 心理能量是上升还是下降趋势？

## 四、性格特质与优势
从记录的行为中提炼 3-4 个真实可见的优势特质（要给出数据或事例作为依据，不要空泛夸奖）。

## 五、短板与潜在盲点
指出 2-3 个他可能自己没意识到的模式（如：计划过载导致破窗、用"记录"代替"行动"、完美主义拖延等），每条给出依据。

## 六、跨维度关联洞察（本期新增 · 重要）
这是最有价值的部分——不要孤立地看每块数据，要找到它们之间的关联。请从以下角度深入分析，每条都要有具体数据依据：
- 打卡 vs 心情关联：打卡完成率高的那天，心情更好吗？哪些习惯最容易在心情低落时中断？
- 感恩 vs 问题关联：感恩记录的频率和复盘问题数量之间有关系吗？心怀感恩的日子问题是否更少？
- 收藏 vs 发布关联：收藏最多的类目转化成了选题和发布吗？有没有"收藏了很多但从未行动"的领域？
- 读书 vs 复盘关联：在读的书和复盘中的问题有关联吗？（比如读了一本心理学的书后，对自己行为模式的认识更深了）
- 习惯 vs 自媒体关联：打卡习惯的执行是否影响了自媒体内容的产出节奏？

## 七、针对性建议（3-5 条）
每条建议要：具体、低门槛、下期就能开始，并且说明"为什么这条适合他的模式"。

## 八、下期期待信号
给出 2-3 个可观察的"改善信号"，方便他下期对照检查自己是否真的在变好。

风格要求：像一位真正了解他的朋友兼教练，不评判、不鸡汤、措辞温暖而清醒。

===== 本期数据 =====
【统计区间】${d.range}
【打卡】区间 ${d.habits.days} 天，完成 ${d.habits.doneCount} 项次，部分完成 ${d.habits.partialCount} 项次
${habitRows || '（无习惯数据）'}
【复盘】${d.reviews.count} 次${d.reviews.list.length ? '\n' + d.reviews.list.map(r => `- ${r.d}：${r.content || ''}${r.problems.length ? '｜问题：' + r.problems.join('；') : ''}`).join('\n') : ''}
【问题解决】共 ${d.problems.total} 个，已改善 ${d.problems.solved} 个${d.problems.pendingList.length ? '\n未解决：' + d.problems.pendingList.join('；') : ''}
【感恩】${d.gratitude.count} 条，心情分布：${Object.keys(d.gratitude.moods).length ? Object.entries(d.gratitude.moods).map(([k, v]) => k + '×' + v).join('，') : '（无）'}${d.gratitude.sample.length ? '\n摘录：' + d.gratitude.sample.join(' | ') : ''}
【收藏】${d.favorites.count} 条${Object.keys(d.favorites.cats).length ? '，分类：' + Object.entries(d.favorites.cats).map(([k, v]) => k + '×' + v).join('，') : ''}${d.favorites.sample.length ? '\n摘录：' + d.favorites.sample.join(' | ') : ''}
【语录】${d.quotes} 条
【读书】在读：${d.books.reading.length ? d.books.reading.join('、') : '（无）'}；本期读完：${d.books.done.length ? d.books.done.join('、') : '（无）'}${d.notes.length ? '\n读书笔记：' + d.notes.join('\n') : ''}
【自媒体】灵感 ${d.media.ideas} 条，素材 ${d.media.materials} 条，选题 ${d.media.topics} 个，发布 ${d.media.publishes} 条
${d.daily.length ? '【每日三件事】' + d.daily.join('\n') : ''}`;
  }

  /* ---------- 第二层：专属每日寄语 ---------- */
  function buildDailyQuotePrompt(todayData) {
    return `你是一位温暖、懂人心的生活陪伴者。请根据这位用户「今天」的真实记录，写一句专属于她的今日寄语（一句话，15-35 字，不要超过 40 字）。

要求：
- 结合她今天的情绪/状态（若心情低落就温柔鼓励，若充实就肯定，若疲惫就安抚）
- 不鸡汤、不说教、不空泛，要像懂她的朋友说的话
- 只输出一句话，不要引号、不要署名

===== 她今天的记录 =====
${todayData || '（今天还没有记录）'}`;
  }

  /* ---------- 第二层：收藏 AI 自动分类 ---------- */
  function buildFavClassifyPrompt(items) {
    const list = items.map(i => `${i.id}|${i.content || '(无内容)'}`).join('\n');
    return `你是内容整理助手。请给下面每条收藏内容归类，分类只能从这 5 个里选一个：温暖治愈、AI、运动健身、好物、其它。

规则：
- 涉及 AI/工具/科技/效率 → AI
- 治愈/励志/情感/温柔 → 温暖治愈
- 运动/健身/拉伸 → 运动健身
- 值得买/用品/生活好物 → 好物
- 其他 → 其它

输出格式：每行一个，格式为「ID|分类」，不要输出其他文字。

===== 待分类内容 =====
${list || '（空）'}`;
  }

  /* ---------- 第二层：复盘 → 明日行动建议 ---------- */
  function buildActionPlanPrompt(reviewContent, problems) {
    return `你是行动教练。请基于用户今天的复盘，把里面的问题/卡点转化成「明天就能做」的具体行动建议。

要求：
- 最多 3 条，每条一句话，具体、低门槛、可执行（不要"坚持/努力/加油"这类空话）
- 每条用「· 」开头
- 只输出行动清单，不要解释

===== 今日复盘 =====
${reviewContent || '（无正文）'}

===== 记录的问题 =====
${problems.map(p => '- ' + p).join('\n') || '（无）'}`;
  }

  /* ---------- 第二层：运动计划动态微调 ---------- */
  function buildWorkoutAdjustPrompt(body, phase, recentDone, weekRate) {
    return `你是健身教练。用户的运动计划是：${body.height}cm/${body.weight}kg，目标${(body.goals || []).join('、')}，${body.limits || ''}；每天约${body.minutesPerDay || 35}分钟，一周${body.daysPerWeek || 5}练。

请结合下面信息，给出「本周运动微调建议」（最多 4 条，每条一句话，具体到动作或节奏）：
- 当前月经周期阶段：${phase ? phase.label + '（强度建议 ' + phase.intensity + '）' : '未设置经期日期'}
- 近期打卡完成情况：${recentDone || '暂无记录'}
- 本周整体完成率：${weekRate}%

要求：只输出建议列表，每条用「· 」开头，不鸡汤。`;
  }

  /* ---------- 第三层：批量导入 AI 整理 ---------- */
  function buildOrganizePrompt(rawText) {
    return `你是内容整理助手。下面是用户手机随手记的原始内容（可能是口语、流水账、带表情符号）。请整理成工作台「批量导入」格式：

格式规则（每行一条，用行首标记指定版块）：
- #语录 句子/金句
- #灵感 想法/灵感
- #收藏 收藏的内容（含有价值的信息/资源/工具）
- #感恩 值得感恩的事（每条一行）
- #复盘 对今天的总结/反思
- #素材 可作自媒体素材的内容
- 同一版块的内容连续放在该标记后面；标记之间留空行

要求：
- 归类合理：句子/美句→语录；想法→灵感；信息/资源→收藏；情感温暖→感恩；反思总结→复盘；选题向→素材
- 保留原文意思，去掉口水话和重复
- 只输出整理后的文本，不要解释

===== 原始内容 =====
${rawText || '（空）'}`;
  }

  /* ---------- 第三层：素材 → 选题 ---------- */
  function buildTopicsPrompt(materials, positioning) {
    const pos = positioning || {};
    const list = (materials || []).slice(0, 30).map(m => `- ${m.text}`).join('\n');
    return `你是自媒体内容策略师。基于用户素材池里的内容（可能有零散片段），结合定位，提炼 3-5 个值得做的选题。

定位：${pos.direction || '（未设置）'}；受众：${pos.audience || ''}；调性：${pos.tone || ''}

输出格式：每个选题一行，格式「选题标题｜核心观点一句话」；只输出选题列表，不要解释。

===== 素材 =====
${list || '（素材池为空）'}`;
  }

  /* ---------- 第三层：问答式数据洞察 ---------- */
  function buildQAPrompt(question, insight) {
    const d = insight || {};
    return `你是用户的个人数据助手。请基于下面的真实记录数据，回答用户的问题。回答要具体、有数据依据、不说空话；如果数据里没有答案，就如实说"数据里没有这方面的记录"。

===== 用户的问题 =====
${question}

===== 工作台数据概览 =====
【区间】${d.range || ''}
【打卡】完成 ${d.habits ? d.habits.doneCount : 0} 项次${d.habits && d.habits.partialCount ? '，部分完成 ' + d.habits.partialCount : ''}${d.habits && d.habits.days ? '，共 ' + d.habits.days + ' 天' : ''}
【习惯明细】${d.habits && d.habits.perHabit ? Object.entries(d.habits.perHabit).map(([k, h]) => k + '（完成' + h.done + '）').join('；') : '（无）'}
【复盘】${d.reviews && d.reviews.count ? d.reviews.count + ' 次' : '0 次'}${d.reviews && d.reviews.list && d.reviews.list.length ? '；最近：' + d.reviews.list.slice(0, 3).map(r => r.content || '').join('｜') : ''}
【问题解决】共 ${d.problems ? d.problems.total : 0} 个，已改善 ${d.problems ? d.problems.solved : 0} 个
【感恩】${d.gratitude ? d.gratitude.count : 0} 条，心情分布 ${d.gratitude && d.gratitude.moods ? JSON.stringify(d.gratitude.moods) : '{}'}
【收藏】${d.favorites ? d.favorites.count : 0} 条${d.favorites && d.favorites.cats ? '，分类 ' + JSON.stringify(d.favorites.cats) : ''}
【语录】${d.quotes || 0} 条
【读书】在读 ${d.books ? d.books.reading.join('、') : ''}；读完 ${d.books ? d.books.done.join('、') : ''}
【自媒体】灵感 ${d.media ? d.media.ideas : 0} · 素材 ${d.media ? d.media.materials : 0} · 选题 ${d.media ? d.media.topics : 0} · 发布 ${d.media ? d.media.publishes : 0}`;
  }

  /* ---------- 通用：调用 OpenAI 兼容接口 ---------- */
  async function callAI(prompt, settings, timeoutMs) {
    if (!settings || !settings.apiKey) throw new Error('NO_KEY');
    const body = {
      model: settings.model || 'deepseek-v4-pro',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7
    };
    // 超时保护：默认 20s，防止慢请求挂住页面
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs || 20000);
    try {
      const res = await fetch(settings.apiBase || 'https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + settings.apiKey
        },
        body: JSON.stringify(body),
        signal: ctrl.signal
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error('调用失败 ' + res.status + '：' + txt.slice(0, 200));
      }
      const data = await res.json();
      return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    } finally {
      clearTimeout(timer);
    }
  }

  /* ---------- 多轮对话调用（传入完整 messages 数组） ---------- */
  async function callAIChat(messages, settings, timeoutMs) {
    if (!settings || !settings.apiKey) throw new Error('NO_KEY');
    if (!Array.isArray(messages) || !messages.length) throw new Error('消息为空');
    const body = {
      model: settings.model || 'deepseek-v4-pro',
      messages: messages,
      temperature: 0.7
    };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs || 30000);
    try {
      const res = await fetch(settings.apiBase || 'https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + settings.apiKey
        },
        body: JSON.stringify(body),
        signal: ctrl.signal
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error('调用失败 ' + res.status + '：' + txt.slice(0, 200));
      }
      const data = await res.json();
      return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    } finally {
      clearTimeout(timer);
    }
  }

  /* ---------- 流式调用：SSE 逐字输出 ---------- */
  // promptOrMessages: string（单次prompt）或 messages 数组（多轮）
  // onChunk(delta, fullText) 每收到一个 chunk 调用一次
  // 返回完整文本
  async function callAIStream(promptOrMessages, settings, onChunk, timeoutMs) {
    if (!settings || !settings.apiKey) throw new Error('NO_KEY');
    var messages;
    if (typeof promptOrMessages === 'string') {
      messages = [{ role: 'user', content: promptOrMessages }];
    } else if (Array.isArray(promptOrMessages)) {
      messages = promptOrMessages;
    } else {
      throw new Error('参数类型错误：需要 string 或 messages 数组');
    }
    var body = {
      model: settings.model || 'deepseek-v4-pro',
      messages: messages,
      temperature: 0.7,
      stream: true
    };
    var ctrl = new AbortController();
    var timer = setTimeout(function() { ctrl.abort(); }, timeoutMs || 60000);
    var fullText = '';
    try {
      var res = await fetch(settings.apiBase || 'https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + settings.apiKey
        },
        body: JSON.stringify(body),
        signal: ctrl.signal
      });
      if (!res.ok) {
        var errTxt = await res.text().catch(function() { return ''; });
        throw new Error('调用失败 ' + res.status + '：' + errTxt.slice(0, 200));
      }
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';
      while (true) {
        var chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        var lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i];
          if (line.startsWith('data: ')) {
            var dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') continue;
            try {
              var json = JSON.parse(dataStr);
              var delta = json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content;
              if (delta) {
                fullText += delta;
                if (onChunk) onChunk(delta, fullText);
              }
            } catch (e) { /* 跳过解析错误的行 */ }
          }
        }
      }
      return fullText;
    } finally {
      clearTimeout(timer);
    }
  }

  /* ---------- 智能复盘教练：多轮对话 system prompt ---------- */
  function buildCoachSystemPrompt(problemText, recentReviews) {
    const ctx = (recentReviews || []).slice(0, 8).map(r =>
      '【' + r.date + '】' + (r.content || '') +
      (r.problems && r.problems.length ? '\n  问题：' + r.problems.map(p => p.text).join('；') : '')
    ).join('\n');
    return '你是一位经验丰富的认知教练，擅长通过提问帮助人自己找到问题的根源。你的风格：温和但犀利，不急着给答案，先帮对方看清楚。\n\n## 当前问题\n' + (problemText || '（未知）') + '\n\n## 近期背景\n' + (ctx || '（暂无历史记录）') + '\n\n## 你的任务\n第 1 轮（现在）：先做初步分析——用 3-5 句话指出用户可能的核心卡点，然后提出 1-2 个追问，引导他深入思考。\n后续轮次：基于用户的回答继续追问，每次都往下挖一层。不要一次性给完所有建议，保持对话节奏。\n当用户说"够了""就这些""嗯我明白了"等收尾信号时，最后输出「总结」：用 3-5 条简洁的行动建议收尾。\n\n要求：中文，像朋友聊天，不说教。每次回复控制在 150 字以内，方便手机阅读。';
  }

  /* ---------- 智能内容生成：选题 → 初稿 ---------- */
  function buildContentDraftPrompt(topic, materials, positioning, quotes) {
    var pos = positioning || {};
    var matList = (materials || []).slice(0, 15).map(function(m) { return '- ' + m.text; }).join('\n');
    var styleSamples = (quotes || []).slice(0, 10).map(function(q) { return q.content; }).join('\n');
    return '你是一位自媒体内容创作者。请根据下面的选题，写一篇可直接发布的小红书/公众号风格的内容初稿。\n\n## 你的定位\n- 方向：' + (pos.direction || '个人成长与学习') + '\n- 受众：' + (pos.audience || '想自我提升的年轻人') + '\n- 调性：' + (pos.tone || '温暖、真诚、有干货') + '\n\n## 选题\n标题：' + (topic.title || '') + '\n角度：' + (topic.angle || '') + '\n\n## 可用素材（来自用户的素材池，仅供参考，不必全用）\n' + (matList || '（素材池为空）') + '\n\n## 用户个人语录风格参考（模仿她的表达方式）\n' + (styleSamples || '（无语录参考）') + '\n\n## 要求\n1. 字数 300-600 字，适合手机阅读\n2. 开头要有吸引力（故事/提问/反常识）\n3. 中间给出 2-3 个具体观点或方法\n4. 结尾有温暖的收束或互动引导\n5. 语气模仿用户语录的风格（如果提供了语录）\n6. 分段清晰，适当使用 emoji 分隔（但不要过度）\n7. 底部附 2-3 个推荐标题备选\n\n只输出正文和备选标题，不要写"好的/以下是"等客套话。';
  }

  /* ---------- 复盘提交后自动分析：提取问题 + 行动建议 ---------- */
  function buildReviewAutoAnalyze(reviewContent) {
    return '你是一位高效的个人教练。请分析用户今天的复盘内容，识别其中隐含的卡点（想改掉的毛病/反复出现的困扰）。\n\n1. 提取潜在问题：从复盘文字中识别 1-3 个隐含的问题/卡点，每条一句话。如果文字里没有明确的问题，就写"本期未发现具体问题"。\n\n输出格式（严格按此格式，方便程序解析）：\n---PROBLEMS---\n问题一内容\n问题二内容\n\n要求：不要输出行动建议、不要解释，直接输出以上格式。如果复盘内容是空的，problems 输出"无"。\n\n===== 复盘内容 =====\n' + (reviewContent || '（空）');
  }

  /* ---------- 周度思考体检：从一周随笔+复盘里挖隐藏模式（9类+根源+主题阅读建议） ---------- */
  function buildWeeklyDeepDive(materialText, rangeLabel) {
    return '你是一位兼具心理学素养与行为科学视角的"自我观察教练"。下面是这位用户最近一周的「随笔 + 复盘」原始记录（随笔=情绪与生活流，复盘=对当天的小结）。\n\n你的任务不是写总结，而是做一次"思考体检"：像侦探一样通读整周文字，从以下 9 个方向找她自己都未必意识到的【隐藏模式】——\n1. 惯性：反复出现的同类行为/拖延/逃避（如每晚刷手机、计划总在启动前放弃）\n2. 思维漏洞：反复出现的认知偏差或归因习惯（如把一切不顺都归因自己、把偶尔一次当成"我永远如此"、只记坏事不记好事）\n3. 隐藏的思考：被随笔一带而过、但细看很有价值的念头/矛盾/未被明说的需求\n4. 情绪暗流：反复出现的情绪触发点，或"写在别的事上"的真情绪（如对 A 生气其实是在担心 B）、一周里一直没被处理的情绪\n5. 内在标准：完美主义、应该思维、对自己苛刻、讨好别人 vs 真实意愿之间的拉扯\n6. 关系边界：与特定的人/场合反复出现摩擦、回避、不敢表达、过度付出的模式\n7. 目标偏离：时间与精力实际流向和她嘴上在意的目标/愿望不一致（如愿望清单、想成为的样子 vs 每天被琐事填满）\n8. 能力盲区：反复卡在同一类事上，本质是"不会/没方法"而非不努力（值得去学，而不是靠意志力硬扛）\n9. 身体信号：随笔里暴露的睡眠、疲惫、食欲、状态起伏等身体线索（不诊断疾病，只做生活观察）\n\n严格规则：\n- 每条发现必须能在原文里找到 2 次以上出现、或 1 处非常扎眼的证据；宁缺毋滥，最多 6 条，找不到就输出空数组\n- 单条文字性困扰（只出现一次、不成模式）不要列入\n- 先判断：这周多个发现背后，有没有一个更深的共同根源？如有，用一句话写进 rootCause；不要为了凑数硬写，没有就留空\n- 再判断：如果存在这个根源，它是不是"需要系统知识/方法论才能解决"（而不是靠提醒和意志力）？如果是，给出一个值得开 30 天主题阅读的主题建议；不确定就留空。注意贴近她的阅读路线：精力营养（进行中）、人心/人性、金钱与经济、历史、哲学、读懂毛选（思维与方法）等\n- 用中文，直呼用户为"你"\n- 只输出一个 JSON 对象，不要输出任何其他文字、不要用 markdown 代码块包裹\n\nJSON 对象格式（每个 key 都必须存在，无内容填空字符串）：\n{"findings":[{"kind":"上述 9 类之一","title":"给这个模式起一句名字（≤20字，陈述句）","evidence":"引用原文 1-2 句并注明大概日期，证明这不是偶然","fix":"破解办法：针对这个模式的具体做法（环境调整/流程/心态框架/该补的知识方向，可执行、不说教）","habitPlan":"习惯培养方案：一周内可开始的培养计划，含频率、可观察的改善信号（≤80字）"}],"rootCause":"多个发现的共同根源假设，一句话（没有则空）","rootEvidence":"支撑该根源的线索摘要：哪几条发现如何指向它（没有则空）","readTopic":"建议主题阅读的主题名，6字以内（没有则空）","readQuestion":"围绕这个主题想解决的真问题，一句话（没有则空）","readWhy":"为什么值得开这一期：它卡住了她哪类长期困扰（最多2句，没有则空）"}\n\n===== ' + (rangeLabel || '最近一周') + ' 的记录 =====\n' + (materialText || '（无记录）');
  }

  /* ---------- 收藏夹智能清理建议 ---------- */
  function buildFavCleanupPrompt(items) {
    var list = (items || []).slice(0, 40).map(function(i, idx) {
      return (idx + 1) + '. [' + (i.category || '其它') + '] ' + (i.content || '').slice(0, 80);
    }).join('\n');
    return '你是内容整理助手。扫描下面这些收藏条目，对每条给出操作建议：\n\n可选操作：\n- KEEP：有价值，保留\n- DELETE：重复、过时、低质量，建议删除\n- MATERIAL：可转为自媒体素材（同时给一句选题建议）\n- MERGE：与另一条相似可合并（注明与哪条合并）\n\n输出格式：每行一条，"序号|操作|建议内容"。只输出建议列表，不解释。\n\n===== 收藏列表 =====\n' + (list || '（空）');
  }

  /* ---------- 发布数据智能解读 ---------- */
  function buildPublishInsightPrompt(publishes, positioning) {
    var list = (publishes || []).slice(0, 30).map(function(p) {
      var st = p.stats || {};
      return '- ' + p.title + ' | ' + (p.platform || '未知') + ' | ' + (p.date || '') + ' | 赞' + (st.likes || 0) + ' 藏' + (st.collects || 0) + ' 评' + (st.comments || 0) + ' 看' + (st.views || 0);
    }).join('\n');
    return '你是自媒体数据分析师。用户发布了一些内容，以下是近期数据。请分析并提出策略建议：\n\n定位：' + ((positioning || {}).direction || '未设置') + '\n受众：' + ((positioning || {}).audience || '未设置') + '\n\n1. 找出表现最好的 2-3 条（综合赞藏评看），分析为什么好（选题/标题/形式/时机？）\n2. 找出表现最差的 1-2 条，分析原因\n3. 给出 3 条下期发布策略建议（具体、可执行）\n4. 总结用户的内容优势（从数据中提炼）\n\n要求：中文，分点清晰，每条建议要有数据依据。不超过 300 字。\n\n===== 发布数据 =====\n' + (list || '（无发布记录）');
  }

  /* ---------- 个人知识图谱：跨版块关联 ---------- */
  function buildKnowledgeGraphPrompt(state) {
    var s = state || {};
    var books = (s.goals && s.goals.books || []).map(function(b) { return '《' + b.title + '》(' + b.category + ')' + (b.note ? '——' + b.note : ''); }).join('\n');
    var quotes = (s.quotes || []).slice(0, 30).map(function(q) { return '【' + (q.platform || '') + '】' + q.content; }).join('\n');
    var favs = (s.favorites && s.favorites.items || []).slice(0, 30).map(function(f) { return '[' + f.category + '] ' + (f.content || ''); }).join('\n');
    var topics = (s.media && s.media.topics || []).slice(0, 20).map(function(t) { return '选题：' + t.title; }).join('\n');
    var reviews = (s.reviews && s.reviews.entries || []).slice(0, 10).map(function(r) { return '复盘 ' + r.date + '：' + (r.content || '').slice(0, 80); }).join('\n');
    var habits = (s.habits && s.habits.definitions || []).map(function(h) { return h.name; }).join('、');

    return '你是数据关联分析师。请扫描用户工作台中的全部数据，找出跨版块的隐藏关联。\n\n## 数据源\n**书单：**\n' + (books || '（无）') + '\n\n**语录：**\n' + (quotes || '（无）') + '\n\n**收藏：**\n' + (favs || '（无）') + '\n\n**选题：**\n' + (topics || '（无）') + '\n\n**复盘：**\n' + (reviews || '（无）') + '\n\n**习惯：**' + (habits || '（无）') + '\n\n## 任务\n找出 5-8 条跨版块关联，每条包含：\n1. 关联类型（如"语录↔书籍""收藏↔选题""复盘↔习惯"）\n2. 具体关联内容（引用实际数据）\n3. 行动启发（这条关联能帮用户做什么）\n\n输出格式：每条一行，用"｜"分隔类型、内容、启发。不要解释。';
  }

  /* ---------- 年度回顾报告 ---------- */
  function buildYearlyReportPrompt(state) {
    var d = collectInsightData(state, 'month');
    // 收集全年数据摘要
    return '你是一位个人成长记录师。请基于用户工作台一年的数据，写一份真诚温暖的「年度个人成长报告」。\n\n## 数据概览\n' +
      '打卡总天数：' + (d.habits ? d.habits.days : 0) + '天\n' +
      '复盘总次数：' + (d.reviews ? d.reviews.count : 0) + '次\n' +
      '感恩总次数：' + (d.gratitude ? d.gratitude.count : 0) + '次\n' +
      '读完书籍：' + (d.books && d.books.done ? d.books.done.join('、') : '（无）') + '\n' +
      '自媒体发布：' + (d.media ? d.media.publishes : 0) + '条\n' +
      '语录收藏：' + (d.quotes || 0) + '条\n\n' +
      '## 要求\n' +
      '请按以下结构写一份年度回顾（中文，温暖真诚，像为一位朋友写的年度总结）：\n' +
      '1. 年度关键词（3 个词概括这一年）\n' +
      '2. 最值得铭记的 5 个时刻/事件\n' +
      '3. 最大的 3 个改变/成长\n' +
      '4. 仍然在努力的事（诚实面对还未解决的课题）\n' +
      '5. 新年寄语（一句温暖有力的话）\n' +
      '不超过 500 字。';
  }

  global.AI = { buildRootCausePrompt, buildContentPrompt, buildInsightPrompt, collectInsightData, buildDailyQuotePrompt, buildFavClassifyPrompt, buildActionPlanPrompt, buildWorkoutAdjustPrompt, buildOrganizePrompt, buildTopicsPrompt, buildQAPrompt, buildCoachSystemPrompt, buildContentDraftPrompt, buildReviewAutoAnalyze, buildWeeklyDeepDive, buildFavCleanupPrompt, buildPublishInsightPrompt, buildKnowledgeGraphPrompt, buildYearlyReportPrompt, callAI, callAIChat, callAIStream };
})(window);
