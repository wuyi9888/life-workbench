/* ============================================================
 * store.js — 数据模型与本地存储层
 * 负责：状态读写、默认种子数据、日期/周工具、导入导出
 * 所有数据保存在浏览器 localStorage，按设备/浏览器隔离。
 * ============================================================ */
(function (global) {
  'use strict';

  const STORE_KEY = 'life_workbench_v1';

  /* ---------- 工具函数 ---------- */
  function uid() {
    return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function todayStr(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return todayStr(d);
  }
  // 返回 ISO 周键：YYYY-Www（周一为一周开始）
  function isoWeek(dateStr) {
    const d = new Date((dateStr || todayStr()) + 'T00:00:00');
    const day = (d.getDay() + 6) % 7; // 周一=0
    d.setDate(d.getDate() - day + 3); // 移到本周周四
    const firstThursday = new Date(d.getFullYear(), 0, 4);
    const week = 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
    return d.getFullYear() + '-W' + pad(week);
  }
  // 周一日期（某周的第一天）
  function mondayOf(dateStr) {
    const d = new Date((dateStr || todayStr()) + 'T00:00:00');
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
    return todayStr(d);
  }
  function weekdayName(dateStr) {
    const names = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    const d = new Date((dateStr || todayStr()) + 'T00:00:00');
    return names[(d.getDay() + 6) % 7];
  }
  function isThursday(dateStr) { return weekdayName(dateStr) === '周四'; }

  /* ---------- 默认种子数据 ---------- */
  function defaultState() {
    const t = todayStr();
    return {
      meta: { version: 1, createdAt: t },
      goals: { // 旧「书单/周计划/书架」已于 2026-09-06 下线，保留空结构仅为兼容历史备份
        books: [],
        weeklyPlan: {}
      },
      // —— 主题阅读营（30天问题式主题阅读）——
      camp: {
        current: null, // { round,title,question,started,ended,subQs:[{id,label}],books:[...],weekly:{},summary:'' }
        history: [],     // 已结束的期次归档
        candidates: []   // 候选期次（周度体检「主题阅读建议」存来）：{ id,topic,question,why,date,reportId }
      },
      favorites: {
        items: []
      },
      gratitude: { entries: [] },
      quotes: [],
      reviews: { entries: [], weeklyReports: [] }, // weeklyReports: [{ id,date,rangeStart,rangeEnd,createdAt,findings:[{kind,title,evidence,fix,habitPlan}],problems:[] }]
      wishlist: { items: [] }, // 愿望清单：{ id, text, category, status:'许愿中'|'已实现'|'已放下', date, createdAt, statusDate }
      journals: { entries: [] }, // 每日随笔：{ id, date, createdAt, updatedAt, content, mood }
      habits: {
        // period: 'morning' | 'noon' | 'night' | ''（空=其他）
        // group : 同组的小动作排在同一行（'' 或不同值=各自单独一行）
        definitions: [
          { id: uid(), name: '淘宝打卡', type: 'daily', period: 'morning', group: 'm1' },
          { id: uid(), name: '人民日报早班车', type: 'daily', period: 'morning', group: 'm1' },
          { id: uid(), name: '早上拉伸', type: 'daily', period: 'morning', group: 'm2' },
          { id: uid(), name: '读书', type: 'daily', period: 'morning', group: 'm2' },
          { id: uid(), name: '吃早饭', type: 'daily', period: 'morning', group: 'm3' },
          { id: uid(), name: '瘦脸', type: 'daily', period: 'morning', group: 'm3' },
          { id: uid(), name: '敲八经', type: 'daily', period: 'noon', group: 'n1' },
          { id: uid(), name: '午睡', type: 'daily', period: 'noon', group: 'n1' },
          { id: uid(), name: '臀桥', type: 'daily', period: 'night', group: 'e1' },
          { id: uid(), name: '练背', type: 'daily', period: 'night', group: 'e1' },
          { id: uid(), name: '平板支撑', type: 'daily', period: 'night', group: 'e1' },
          { id: uid(), name: '晚间拉伸', type: 'daily', period: 'night', group: 'e2' },
          { id: uid(), name: '复盘反思', type: 'daily', period: 'night', group: 'e2' }
        ],
        records: {} // { '2026-07-27': { habitId: true | { s:'done'|'partial', note:'' } } }
      },
      media: {
        positioning: {
          direction: '',
          audience: '',
          tone: '',
          pillars: []
        },
        ideas: [],
        generated: [],
        // —— 内容工作流（升级）——
        materials: [], // 素材池：{ id, date, text, source, refUrl, used }
        topics: [],    // 选题库：{ id, title, angle, status, scheduledDate, note }
        publishes: []  // 发布记录：{ id, date, title, platform, link, stats:{likes,collects,comments,views}, note }
      },
      reports: [], // 洞察报告历史：{ id, type:'week'|'month', period, copy, createdAt }
      aiQuotes: {}, // 专属每日寄语缓存 { '2026-08-03': { text, src, from } }
      todos: [], // 待办清单：{ id, text, note, done, createdAt }
      settings: {
        theme: 'light',
        apiBase: 'https://api.deepseek.com/v1/chat/completions',
        apiKey: '',
        model: 'deepseek-v4-pro', // DeepSeek 平台当前仅支持 v4 系列（v4-pro / v4-flash）
        avatar: '' // 自定义头像 dataURL，空则用默认 🪴
      },
      // —— 运动计划（定制）——
      workout: {
        bodyInfo: {
          height: 168,       // cm
          weight: 52,        // kg（104 斤）
          goals: ['增肌', '改善骨盆前倾'],
          limits: '气血偏虚，需温和循序', // 说明
          minutesPerDay: 35,  // 每天 30-40 分钟
          daysPerWeek: 5      // 一周 5 次
        },
        period: {
          enabled: true,
          cycleDays: 28,     // 月经周期
          lastStart: ''      // 最近一次月经开始日期 YYYY-MM-DD（可选，用于自动阶段提示）
        },
        plan: [ // 周一~周日 七天模板；trained=false 表示休息日
          { dow: 1, name: '背 + 臀基础', trained: true, focus: '练背10min + 臀桥/臀推', items: ['热身 3min', '弹力带划船 4×12', '超人式 3×12', '臀桥 4×15', '死虫式 3×10', '拉伸 5min'], note: '练背日，臀腿同日' },
          { dow: 2, name: '核心 + 骨盆前倾', trained: true, focus: '腰腹 12min + 骨盆前倾矫正', items: ['热身 3min', '鸟狗式 3×10', '臀桥（发力找感觉）4×12', '侧卧抬腿 3×12', '平板支撑 3×20s', '髂腰肌拉伸 2min'], note: '腰腹可每日做' },
          { dow: 3, name: '低强度恢复', trained: false, focus: '休息或散步/八段锦', items: ['快走 20-30min 或 八段锦一套', '睡前拉伸 5min'], note: '肌肉需要 24-48h 恢复，今天让背臀休息' },
          { dow: 4, name: '背 + 肩颈', trained: true, focus: '练背10min + 圆肩改善', items: ['热身 3min', '弹力带划船 3×12', '面拉 3×12', '墙壁天使 3×10', '耸肩环绕 20次', '拉伸 5min'], note: '背隔天练，可加入圆肩矫正' },
          { dow: 5, name: '臀腿力量', trained: true, focus: '臀腿 15min + 短HIIT 10min', items: ['热身 3min', '深蹲（无负重/椅蹲）4×12', '臀桥 4×15', '臀腿后摆 3×12', '高抬腿 20s×4', '拉伸 5min'], note: '臀每周 2-3 次足够，不要天天练' },
          { dow: 6, name: '全身温和', trained: true, focus: '全身激活 25min', items: ['猫牛式 10次', '臀桥 3×12', '半程深蹲 3×12', '平板支撑 3×20s', '全身拉伸 5min'], note: '周末温和日，找发力的感觉' },
          { dow: 7, name: '休息日', trained: false, focus: '完全休息 / 散步', items: ['散步 15-20min（可选）', '放松按摩'], note: '一周 5 练已达标，今天休息' }
        ],
        records: {} // 运动完成记录 { '2026-08-02': { dow: true } }
      }
    };
  }

  /* ---------- 读写 ---------- */
  let state = null;

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        state = JSON.parse(raw);
        // 简单兼容：确保必要字段存在
        const def = defaultState();
        state.meta = state.meta || def.meta;
        state.goals = state.goals || def.goals;
        state.favorites = state.favorites || def.favorites;
        state.gratitude = state.gratitude || def.gratitude;
        state.quotes = state.quotes || def.quotes;
        state.reviews = state.reviews || def.reviews;
        state.habits = state.habits || def.habits;
        state.media = state.media || def.media;
        state.habits.definitions = Array.isArray(state.habits.definitions) ? state.habits.definitions : def.habits.definitions;
        state.habits.records = state.habits.records || {};
        // 升级：习惯按时段（早/中/晚）分组（旧数据没有这两个字段 → 归入「其他」）
        state.habits.definitions.forEach(h => {
          if (typeof h.period !== 'string') h.period = '';
          if (typeof h.group !== 'string') h.group = '';
        });
        state.goals.books = Array.isArray(state.goals.books) ? state.goals.books : [];
        state.goals.weeklyPlan = state.goals.weeklyPlan || {};
        // 升级：主题阅读营（旧备份没有）
        state.camp = state.camp && typeof state.camp === 'object' ? state.camp : { current: null, history: [], candidates: [] };
        state.camp.history = Array.isArray(state.camp.history) ? state.camp.history : [];
        state.camp.current = state.camp.current || null;
        // 升级：候选期次（周度体检的「主题阅读建议」一键存入，供开新营带入）
        state.camp.candidates = Array.isArray(state.camp.candidates) ? state.camp.candidates : [];
        state.favorites.items = Array.isArray(state.favorites.items) ? state.favorites.items : [];
        state.gratitude.entries = Array.isArray(state.gratitude.entries) ? state.gratitude.entries : [];
        state.reviews.entries = Array.isArray(state.reviews.entries) ? state.reviews.entries : [];
        // 升级：周度思考体检（旧备份没有）
        state.reviews.weeklyReports = Array.isArray(state.reviews.weeklyReports) ? state.reviews.weeklyReports : [];
        // 升级：愿望清单（旧备份没有）
        state.wishlist = state.wishlist && typeof state.wishlist === 'object' ? state.wishlist : { items: [] };
        state.wishlist.items = Array.isArray(state.wishlist.items) ? state.wishlist.items : [];
        // 升级：每日随笔（旧备份没有）
        state.journals = state.journals && typeof state.journals === 'object' ? state.journals : { entries: [] };
        state.journals.entries = Array.isArray(state.journals.entries) ? state.journals.entries : [];
        // 升级：媒体内部字段补全（防旧数据缺失导致渲染崩溃）
        state.media.positioning = Object.assign({ direction: '', audience: '', tone: '', pillars: [] }, state.media.positioning || {});
        state.media.ideas = Array.isArray(state.media.ideas) ? state.media.ideas : [];
        state.media.generated = Array.isArray(state.media.generated) ? state.media.generated : [];
        // 升级：内容工作流字段（旧备份没有）
        state.media.materials = Array.isArray(state.media.materials) ? state.media.materials : [];
        state.media.topics = Array.isArray(state.media.topics) ? state.media.topics : [];
        state.media.publishes = Array.isArray(state.media.publishes) ? state.media.publishes : [];
        // 升级：洞察报告
        state.reports = state.reports || [];
        // 升级：专属寄语缓存
        state.aiQuotes = state.aiQuotes || {};
        // 升级：待办清单
        state.todos = Array.isArray(state.todos) ? state.todos : [];
        // 升级：运动计划（旧备份没有 / 缺字段）
        state.workout = state.workout || def.workout;
        state.workout.bodyInfo = Object.assign(def.workout.bodyInfo, state.workout.bodyInfo || {});
        state.workout.period = Object.assign(def.workout.period, state.workout.period || {});
        state.workout.plan = state.workout.plan && state.workout.plan.length === 7 ? state.workout.plan : def.workout.plan;
        state.workout.records = state.workout.records || {};
        state.workout.adjust = state.workout.adjust || '';
        const oldApi = (state.settings && state.settings.apiBase) || '';
        const oldModel = (state.settings && state.settings.model) || '';
        // 用新对象合并，避免污染 def.settings（否则旧值覆盖默认值且无法升级）
        state.settings = Object.assign({}, def.settings, state.settings || {});
        // 旧默认值/常见简写自动升级为 DeepSeek v4-pro；用户手动改过的其他模型名保留
        if (!oldApi || oldApi === 'https://api.openai.com/v1/chat/completions') state.settings.apiBase = def.settings.apiBase;
        if (!oldModel || oldModel === 'gpt-4o-mini' || oldModel === 'deepseek-chat' || oldModel === 'deepseek') state.settings.model = def.settings.model;
        // 升级：旧打卡记录 true → {s:'done'}（柔性打卡）
        Object.keys(state.habits.records || {}).forEach(d => {
          const day = state.habits.records[d];
          Object.keys(day).forEach(hid => {
            if (day[hid] === true) day[hid] = { s: 'done', note: '' };
          });
        });
        return state;
      }
    } catch (e) {
      console.warn('读取本地数据失败，使用默认数据', e);
    }
    state = defaultState();
    save();
    return state;
  }

  function save() {
    // 每次保存盖上本地时间戳：供「打开页面时比较本机/云端哪个新」用
    if (state) {
      if (!state.meta || typeof state.meta !== 'object') state.meta = {};
      state.meta.updatedAt = new Date().toISOString();
    }
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('保存失败', e);
      // 抛出供调用方捕获处理（不再弹 alert 阻塞 UI）
      throw e;
    }
    // 云端同步：任何本地保存后，触发防抖推送（配置未开启则自动跳过）
    if (global.Sync) { try { global.Sync.schedulePush(state); } catch (e) { console.warn('同步推送失败', e); } }
  }

  // 判断某份状态是否「几乎全空」（全新默认数据，还没有任何真实内容）
  // 用于：换新网址/新设备首开时，判定应不应该用云端数据自动恢复本机
  function isEmptyish(st) {
    if (!st) return true;
    const empty = a => !Array.isArray(a) || a.length === 0;
    if (!empty(st.todos)) return false;
    if (!empty(st.quotes)) return false;
    if (!empty(st.reports)) return false;
    if (!(st.reviews && empty(st.reviews.entries))) return false;
    if (!(st.gratitude && empty(st.gratitude.entries))) return false;
    if (!(st.favorites && empty(st.favorites.items))) return false;
    if (!(st.wishlist && empty(st.wishlist.items))) return false;
    if (!(st.journals && empty(st.journals.entries))) return false;
    const m = st.media;
    if (!m) return false;
    if (!(empty(m.ideas) && empty(m.generated) && empty(m.materials) && empty(m.topics) && empty(m.publishes))) return false;
    if (!(st.camp && !st.camp.current && empty(st.camp.history) && empty(st.camp.candidates))) return false;
    if (!(st.habits && empty(st.habits.records))) return false;
    if (!(st.workout && empty(st.workout.records))) return false;
    return true;
  }

  // 用云端拉取到的数据整体替换内存状态（拉取成功后调用）
  function replaceState(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('无效的状态数据');
    state = obj;
    save(); // 同时写回 localStorage 作为缓存/离线兜底
  }

  function get() { return state || (state = load()); }
  function reset() { state = defaultState(); save(); }

  /* ---------- 导入导出 ---------- */
  function exportJSON() {
    return JSON.stringify(state, null, 2);
  }
  function importJSON(text) {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') throw new Error('格式不正确');
    state = parsed;
    save();
  }

  global.Store = {
    uid, pad, todayStr, addDays, isoWeek, mondayOf, weekdayName, isThursday,
    load, save, get, reset, replaceState, exportJSON, importJSON, defaultState, isEmptyish
  };
})(window);
