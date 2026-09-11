/* ============================================================
 * app.js — 路由 + 全部模块 UI 与交互
 * ============================================================ */
(function () {
  'use strict';

  const S = () => Store.get();
  const T = Store.todayStr;

  /* ---------- 小工具 ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.from((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function cat(c) { return `<span class="badge b-${esc(c)}">${esc(c)}</span>`; }
  function cleanQuote(t) {
    return String(t == null ? '' : t)
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map(l => l.replace(/^\s+|\s+$/g, ''))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\n+|\n+$/g, '');
  }
  // 完整时间戳：YYYY-MM-DD HH:MM（记录时生成，之后永不改变）
  function fmtStamp(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + Store.pad(d.getMonth() + 1) + '-' + Store.pad(d.getDate()) + ' ' + Store.pad(d.getHours()) + ':' + Store.pad(d.getMinutes());
  }
  // 展示历史条目的记录时间：优先 createdAt（锁定），否则用 date
  function stampOf(e) {
    if (e && e.createdAt) return e.createdAt;
    return (e && e.date) ? e.date + ' 00:00' : '';
  }

  /* ---------- 书架封面（按分类生成确定性颜色） ---------- */
  const COVER_PALETTE = {
    '经济': ['#2563eb','#1d4ed8','#3b82f6','#60a5fa'],
    '历史': ['#b45309','#c2410c','#d97706','#f59e0b'],
    '心理': ['#7c3aed','#8b5cf6','#a78bfa','#c084fc'],
    '哲学': ['#059669','#10b981','#34d399','#6ee7b7'],
    '其他': ['#4b5563','#6b7280','#9ca3af','#d1d5db']
  };
  const COVER_EMOJI = { '经济':'📈', '历史':'🏛', '心理':'🧠', '哲学':'🔮', '其他':'📖' };
  function bookCoverColor(book) {
    const palette = COVER_PALETTE[book.category] || COVER_PALETTE['其他'];
    let h = 0; for (let i = 0; i < book.title.length; i++) { h = ((h << 5) - h + book.title.charCodeAt(i)) | 0; }
    return palette[Math.abs(h) % palette.length];
  }
  function ensureBookMeta(b) {
    if (!b.coverColor) b.coverColor = bookCoverColor(b);
    if (!b.coverEmoji) b.coverEmoji = COVER_EMOJI[b.category] || '📖';
    if (b.status === '读完' && !b.finishedAt) b.finishedAt = T();
    if (!b.readingNotes) b.readingNotes = [];
  }
  let toastTimer;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
  }
  // —— 删除撤销：只记最近一次删除，toast 内提供「撤销」按钮 ——
  let _undo = null;
  function undoDelete(arr, i, item, label) {
    _undo = { arr: arr, i: i, item: item, label: label };
    const t = $('#toast');
    if (t) {
      t.innerHTML = '已删除' + (label ? ' · ' + label : '') + '　<button class="btn sm" data-action="undo-last" style="margin-left:2px;background:var(--good);color:#fff">↩ 撤销</button>';
      t.classList.add('show');
      clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 5000);
    }
  }
  function applyUndo() {
    if (!_undo) return;
    const u = _undo; _undo = null;
    u.arr.splice(Math.min(u.i, u.arr.length), 0, u.item);
    Store.save(); render();
    const t = $('#toast');
    if (t) { t.textContent = '已恢复' + (u.label ? ' · ' + u.label : ''); t.classList.add('show');
      clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2000); }
  }
  function copyText(txt) {
    if (navigator.clipboard) { navigator.clipboard.writeText(txt).then(() => toast('已复制'), () => fallbackCopy(txt)); }
    else fallbackCopy(txt);
  }
  function fallbackCopy(txt) {
    const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta);
    ta.select(); try { document.execCommand('copy'); toast('已复制'); } catch (e) { toast('复制失败，请手动选择'); }
    document.body.removeChild(ta);
  }

  /* ---------- 导航 ---------- */
  const SECTIONS = [
    { id: 'overview', label: '总览', ico: '🏠' },
    { id: 'goals', label: '主题读书', ico: '📚' },
    { id: 'favorites', label: '收藏清理', ico: '🧹' },
    { id: 'quotes', label: '语录整理', ico: '💬' },
    { id: 'gratitude', label: '感恩日记', ico: '🌿' },
    { id: 'wishlist', label: '愿望清单', ico: '✨' },
    { id: 'review', label: '每日复盘', ico: '🪞' },
    { id: 'insight', label: '洞察报告', ico: '📊' },
    { id: 'habits', label: '生活打卡', ico: '✅' },
    { id: 'media', label: '自媒体', ico: '🚀' },
    { id: 'todos', label: '待办清单', ico: '📝' },
    { id: 'settings', label: '设置', ico: '⚙️' }
  ];
  const TITLES = { overview: '今日 · 寄语', goals: '主题阅读营', favorites: '收藏夹清理', quotes: '语录整理', gratitude: '感恩日记', wishlist: '愿望清单', review: '复盘 · 随笔 · 体检', insight: '洞察 · 周报/月报', habits: '生活打卡 · 秩序', media: '自媒体 · 内容', todos: '待办清单', settings: '设置 · 数据', more: '全部板块' };

  let current = 'overview';
  const ui = { week: Store.isoWeek(), favFilter: 'pending', reviewTab: 'list', quoteFilter: 'all', quoteExpanded: null, quoteEditing: null, shelfView: 'covers', shelfExpanded: null, insightType: 'week', insightExpanded: null, mediaTab: 'idea', posOpen: false, onlineQuote: null, catOpen: {}, quoteLoading: false, quoteFailed: false, apiConfigOpen: false, coachSessions: {}, syncStatusText: '同步未开始', todoFilter: 'all', campBookOpen: null, campHistoryOpen: false, journalEdit: null };

  // 图片字段解析：'img://img_xxx' 引用 → IndexedDB dataURL；旧 dataURL 原样返回
  function resolveImg(v) {
    if (!v) return '';
    if (typeof v === 'string' && v.startsWith('img://')) {
      const id = v.slice(6);
      return (ImgStore && ImgStore.cache && ImgStore.cache.get(id)) || '';
    }
    return v; // 旧 dataURL 或外链
  }

  // 手机（≤820px）底部导航只保留 6 个高频入口，其余收进「更多」宫格；桌面侧栏保持全量
  const MOBILE_BOTTOM = ['overview', 'habits', 'review', 'media', 'todos', 'more'];
  function isMobileNav() { try { return window.matchMedia && window.matchMedia('(max-width: 820px)').matches; } catch (e) { return false; } }
  function navSections() {
    if (!isMobileNav()) return SECTIONS;
    return MOBILE_BOTTOM.map(id => id === 'more' ? { id: 'more', label: '更多', ico: '🧭' } : SECTIONS.find(x => x.id === id));
  }
  function renderNav() {
    const nav = $('#nav'), bn = $('#bottomnav');
    const list = navSections();
    const items = list.map(s =>
      `<div class="nav-item ${s.id === current ? 'active' : ''}" data-action="nav" data-sec="${s.id}"><span class="ico">${s.ico}</span><span>${s.label}</span></div>`
    ).join('');
    const items2 = list.map(s =>
      `<div class="nav-item ${s.id === current ? 'active' : ''}" data-action="nav" data-sec="${s.id}"><span class="ico">${s.ico}</span><span class="label">${s.label}</span></div>`
    ).join('');
    if (nav) nav.innerHTML = items;
    if (bn) bn.innerHTML = items2;
  }

  const RENDERERS = {
    overview: renderOverview, goals: renderGoals, favorites: renderFavorites, quotes: renderQuotes,
    gratitude: renderGratitude, review: renderReview, insight: renderInsight,
    habits: renderHabits, media: renderMedia, todos: renderTodos, wishlist: renderWishlist, settings: renderSettings,
    more: renderMoreGrid
  };

  function render() {
    // 预加载当前所有语录用到的图片引用到内存缓存
    try { if (typeof ImgStore !== 'undefined') { const ids = S().quotes.filter(q => typeof q.image === 'string' && q.image.startsWith('img://')).map(q => q.image.slice(6)); if (ids.length) ImgStore.preload(ids); } } catch (e) { console.warn('preload fail', e); }
    try { renderNav(); } catch (e) { console.warn('renderNav fail', e); }
    try { renderBrand(); } catch (e) { console.warn('renderBrand fail', e); }
    // 顶栏标题：总览页显示每日一句寄语（点击查看当日寄语），其余页面显示页面名
    const titleEl = $('#viewTitle');
    if (current === 'overview') {
      const q = todayQuote();
      // 已有专属寄语缓存则优先
      const cached = S().aiQuotes && S().aiQuotes[T()];
      const showQ = cached ? { text: cached.text, src: cached.src || 'AI 专属寄语' } : q;
      titleEl.innerHTML = `<span class="title-quote" data-action="show-quote" title="点击查看当日寄语">💬 ${esc(showQ.text)}</span>`;
      // 配置了 API、今天还没生成过、且不在请求中/未失败 → 生成专属（只触发一次，避免重复请求卡页面）
      if (!cached && S().settings.apiKey && !ui.quoteLoading && !ui.quoteFailed) {
        ui.quoteLoading = true;
        generateDailyQuote(titleEl).catch(() => {}).finally(() => { ui.quoteLoading = false; });
      } else if (!cached && !S().quotes.length && !ui.quoteLoading) {
        // 无 API 且无语录时，网络名言增强（失败保留当前句）
        ui.quoteLoading = true;
        fetchOnlineQuote(4000).then(nq => {
          if (nq) {
            const span = titleEl.querySelector('.title-quote');
            if (span) {
              ui.onlineQuote = nq;
              span.innerHTML = `💬 ${esc(nq.text)}`;
            }
          }
        }).catch(() => {}).finally(() => { ui.quoteLoading = false; });
      }
    } else {
      titleEl.innerHTML = esc(TITLES[current] || '工作台');
    }
    $('#viewMeta').textContent = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    try {
      $('#view').innerHTML = RENDERERS[current]();
    } catch (err) {
      console.error('渲染出错:', err);
      $('#view').innerHTML = '<div class="card"><h2>⚠️ 页面渲染出错</h2><div class="note" style="white-space:pre-wrap">' + esc(err && err.message ? err.message : String(err)) + '</div><button class="btn sm" data-action="reload">🔄 重新加载</button></div>';
    }
    // 编辑语录后滚回该语录位置，避免跳到顶部
    if (ui.quoteEditing) {
      setTimeout(() => {
        const el = document.querySelector('.quote-edit-panel');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 60);
    } else {
      // 页面内交互（展开/打卡/切换等）保持原滚动位置，不再跳顶；进入页面时 scrollY 为 0 则自然留在顶部
      const sy = window.scrollY || 0;
      if (sy > 0) requestAnimationFrame(() => {
        const maxY = (document.documentElement.scrollHeight || 0) - (window.innerHeight || 0);
        window.scrollTo(0, Math.max(0, Math.min(sy, maxY)));
      });
    }
  }
  function go(sec) { if (sec === 'more' || SECTIONS.some(x => x.id === sec)) { current = sec; window.scrollTo(0, 0); render(); } }
  // 手机「更多」宫格：收纳低频板块（桌面侧栏仍全量直达）
  function renderMoreGrid() {
    const kept = MOBILE_BOTTOM.slice(0, 5);
    const brief = { goals: '目标追踪 · 周计划 · 书架笔记', favorites: '收藏清理 · 转素材 · AI 清理', quotes: '金句收藏 · 置顶 · 配图', gratitude: '每日感恩 1–3 件小事', insight: '周报/月报 · 问答洞察', settings: '云端同步 · AI · 导入 · 备份' };
    const more = SECTIONS.filter(x => !kept.includes(x.id)).map(x => `
      <div class="more-card" data-action="nav" data-sec="${x.id}">
        <div class="more-ico">${x.ico}</div>
        <div class="more-name">${x.label}</div>
        <div class="more-sub">${brief[x.id] || ''}</div>
      </div>`).join('');
    return `
    <div class="card">
      <h2>🧭 更多板块</h2>
      <div class="note">手机上常用入口固定在底部，其余低频板块收在这里；电脑上左侧边栏仍可直接到达全部板块。</div>
      <div class="more-grid">${more}</div>
    </div>`;
  }

  // 收集今天的数据 → 生成专属寄语（存缓存，一天一次）
  async function generateDailyQuote(titleEl) {
    try {
      const s = S(); const t = T();
      const pieces = [];
      const g = s.gratitude.entries.find(e => e.date === t);
      if (g) pieces.push('感恩：' + (g.items || []).join('；') + (g.mood ? '（心情 ' + g.mood + '）' : ''));
      const r = s.reviews.entries.find(e => e.date === t);
      if (r) pieces.push('复盘：' + (r.content || '').slice(0, 120) + ((r.problems || []).length ? '；问题：' + r.problems.map(p => p.text).join('、') : ''));
      const rec = s.habits.records[t] || {};
      const doneN = s.habits.definitions.filter(d => habitState(rec, d.id).s === 'done').map(d => d.name);
      if (doneN.length) pieces.push('打卡完成：' + doneN.join('、'));
      const prompt = AI.buildDailyQuotePrompt(pieces.join('\n'));
      const txt = await AI.callAI(prompt, s.settings);
      const q = txt.trim().replace(/^["“]+|["”]+$/g, '');
      if (!q) return;
      s.aiQuotes = s.aiQuotes || {};
      s.aiQuotes[t] = { text: q, src: 'AI 专属寄语' };
      Store.save();
      if (titleEl) {
        const span = titleEl.querySelector('.title-quote');
        if (span) span.innerHTML = `💬 ${esc(q)}`;
      }
    } catch (e) {
      // 失败标记：当天不再自动重试（避免切换页面反复请求卡顿）
      ui.quoteFailed = true;
    }
  }

  // 顶栏寄语弹层：查看当日完整寄语
  function showQuoteModal() {
    const q = (ui.onlineQuote && !S().quotes.length) ? ui.onlineQuote : todayQuote();
    const overlay = document.createElement('div');
    overlay.className = 'quote-modal';
    overlay.innerHTML = `
      <button class="quote-modal-close" data-action="close-quote-modal">✕</button>
      <div class="quote-modal-mark">“</div>
      <div class="quote-modal-text">${esc(q.text)}</div>
      <div class="quote-modal-src">—— ${esc(q.src || '')}</div>
      <div class="quote-modal-foot">今日寄语 · 每日更新 · 点击空白处关闭</div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  }

  // 侧边栏品牌区（头像 + 两行标题）
  function renderBrand() {
    const logo = $('#brandLogo');
    if (!logo) return;
    const av = S().settings.avatar;
    if (av) logo.innerHTML = `<img src="${av}" alt="头像">`;
    else logo.innerHTML = '🪴';
  }

  /* ============================================================
   * 总览 / 今日
   * ============================================================ */
  function renderOverview() {
    const s = S();

    // 主题阅读营进度（旧的"周计划读书安排"已于 2026-09-06 下线，替换为读书营状态卡）
    const cc = s.camp && s.camp.current;
    const campLine = cc ? (() => {
      const done = cc.books.filter(b => b.status === '读完').length;
      const nts = cc.books.reduce((n, b) => n + (b.notes || []).length, 0);
      return `<div class="item"><div class="grow"><div class="title">第${cc.round} 期 · ${esc(cc.title)}</div><div class="sub">${done}/${cc.books.length} 本读完 · 已记 ${nts} 条想法${cc.ended ? ' · ' + esc(cc.ended) + ' 前做期末整合' : ''}</div></div><button class="btn sm" data-action="nav" data-sec="goals">去读书</button></div>`;
    })() : '<div class="empty"><div class="big">📚</div>主题阅读营还没开跑<br><button class="btn sm primary" data-action="nav" data-sec="goals">🚀 开跑第一期</button></div>';

    // 最近动态
    const lastG = s.gratitude.entries[0];
    const lastR = s.reviews.entries[0];

    return `
    <div class="card">
      <h2>🗓 年度日历</h2>
      ${renderYearCalendar()}
    </div>

    <div class="card">
      <h2>📆 本周进度</h2>
      ${renderWeekStrip()}
    </div>

    <div class="card">
      <h2>🔥 主题阅读营</h2>
      ${campLine}
    </div>

    ${renderWishCard()}

    ${renderActionTodayCard()}

    <div class="card">
      <h2>⚡ 快捷记录</h2>
      <div class="grid grid-2">
        <button class="btn" data-action="go-journal">📖 写随笔</button>
        <button class="btn" data-action="go-review">🪞 写复盘</button>
        <button class="btn" data-action="nav" data-sec="gratitude">🌿 写感恩</button>
        <button class="btn" data-action="nav" data-sec="favorites">🧹 加收藏</button>
        <button class="btn" data-action="nav" data-sec="media">💡 记灵感</button>
        <button class="btn" data-action="nav" data-sec="wishlist">✨ 许个愿</button>
      </div>
      <h3>最近动态</h3>
      <div class="item"><div class="grow"><div class="title">感恩日记</div><div class="sub">${lastG ? esc(lastG.date) + ' · ' + (lastG.items[0] || '') : '还没有记录'}</div></div></div>
      <div class="item"><div class="grow"><div class="title">每日复盘</div><div class="sub">${lastR ? esc(lastR.date) + ' · 有 ' + (lastR.problems || []).length + ' 个卡点在跟踪' : '还没有记录'}</div></div></div>
      <div class="item"><div class="grow"><div class="title">自媒体灵感</div><div class="sub">${s.media.ideas.length} 条 · 已用 ${s.media.ideas.filter(i => i.used).length} 条</div></div></div>
    </div>`;
  }
  function greeting() {
    const h = new Date().getHours();
    return h < 6 ? '夜深了' : h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : h < 22 ? '晚上好' : '夜深了';
  }

  /* ============================================================
   * 今日寄语 / 年度日历 / 本周进度
   * ============================================================ */
  const BUILTIN_QUOTES = [
    '慢慢来，比较快。',
    '今天也是值得认真对待的一天。',
    '你的坚持，终将美好。',
    '把日子过成自己喜欢的样子。',
    '先完成，再完美。',
    '种一棵树最好的时间是十年前，其次是现在。',
    '温柔地对待自己，像对待最好的朋友。',
    '每一天都是新的开始。',
    '自律即自由。',
    '微小积累，持续改变。',
    '你的能量，超乎你想象。',
    '少即是多，慢即是快。',
    '生活的答案，藏在你每天的行动里。',
    '先取悦自己，再取悦世界。',
    '成长不是等来的，是干出来的。'
  ];
  // 基于日期 seed 的稳定索引（每日轮换）
  function seedIndex(arrLen, seedStr) {
    let h = 0;
    for (let i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) >>> 0;
    return h % arrLen;
  }
  // 今日寄语：优先语录（每日轮换）→ 内置名言；网络名言由 asyncQuoteFetch 增强
  function todayQuote() {
    const s = S();
    const quotes = s.quotes.map(q => ({ text: q.content, src: '我的语录 · ' + (q.platform || '') }));
    const pool = quotes.length ? quotes : BUILTIN_QUOTES.map(t => ({ text: t, src: quotes.length ? '' : '每日名言' }));
    const item = pool[seedIndex(pool.length, T())];
    return { text: item.text, src: item.src || (quotes.length ? '' : '每日名言') };
  }
  // 网络每日名言（一言），失败返回 null
  async function fetchOnlineQuote(timeoutMs) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs || 3000);
      const res = await fetch('https://v1.hitokoto.cn/', { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) return null;
      const d = await res.json();
      if (!d || !d.hitokoto) return null;
      return { text: d.hitokoto, src: (d.from ? '每日名言 · ' + d.from : '每日名言') };
    } catch (e) { return null; }
  }
  // 一年第几天（1 起）
  function dayOfYear(dt) {
    const start = new Date(dt.getFullYear(), 0, 0);
    return Math.floor((dt - start) / 86400000);
  }
  // 年度日历：12 月横向进度条（清爽版，不逐天数字）
  function renderYearCalendar() {
    const now = new Date();
    const y = now.getFullYear();
    const today = now.getDate();
    const curMonth = now.getMonth();
    const doy = dayOfYear(now);
    const daysInYear = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365;
    const pct = Math.round(doy / daysInYear * 100);

    // 12 个月：每月的已过比例 → 色块（本月=主色填充，过去月=全满，未来月=空）
    const months = Array.from({ length: 12 }, (_, mi) => {
      const days = new Date(y, mi + 1, 0).getDate();
      const isCur = mi === curMonth;
      const mDone = isCur ? today : (mi < curMonth ? days : 0);
      const mPct = isCur ? Math.round(mDone / days * 100) : (mi < curMonth ? 100 : 0);
      const state = mi < curMonth ? 'done' : (isCur ? 'cur' : 'todo');
      const todayInMonth = isCur ? `<span class="cal-today-dot" title="今天">${today}日</span>` : '';
      return `<div class="cal-m ${state}">
        <div class="cal-m-name">${mi + 1}月</div>
        <div class="cal-m-track"><span class="cal-m-fill" style="width:${mPct}%"></span></div>
        <div class="cal-m-num">${mi < curMonth ? '✓' : (isCur ? mPct + '%' : '')}</div>
        ${todayInMonth}
      </div>`;
    });

    return `
    <div class="year-head">
      <div>
        <div class="year-title">${y} 年 · 已过 <b>${doy}</b> / ${daysInYear} 天</div>
        <div class="year-sub">今天 ${now.getMonth() + 1}月${today}日 · 还剩 ${daysInYear - doy} 天</div>
      </div>
      <div class="year-progress"><span style="width:${pct}%"></span></div>
    </div>
    <div class="year-months">${months.join('')}</div>
    <div class="year-legend"><span class="lg past">已完成月</span><span class="lg today">当前月</span><span class="lg">未来</span></div>`;
  }
  // 本周进度：7 天分段进度条 + 每日完成状态点
  function renderWeekStrip() {
    const s = S(); const now = new Date();
    const monday = Store.mondayOf(T());
    const todayIdx = (now.getDay() + 6) % 7; // 周一=0
    const days = Array.from({ length: 7 }, (_, i) => {
      const dateStr = Store.addDays(monday, i);
      const d = new Date(dateStr + 'T00:00:00');
      const rec = s.habits.records[dateStr] || {};
      const defs = s.habits.definitions.filter(x => x.type === 'daily' || (x.type === 'weekly-thu' && Store.isThursday(dateStr)));
      const doneN = defs.filter(x => habitState(rec, x.id).s === 'done').length;
      const partN = defs.filter(x => habitState(rec, x.id).s === 'partial').length;
      const rate = defs.length ? Math.round((doneN + partN * 0.5) / defs.length * 100) : 0;
      const isToday = i === todayIdx;
      const isFuture = i > todayIdx;
      const dotCls = rate === 100 && defs.length ? 'full' : (rate > 0 ? 'part' : (isFuture ? '' : 'miss'));
      return `<div class="wk-day ${isToday ? 'today' : ''} ${isFuture ? 'future' : ''}">
        <div class="wk-name">${['一','二','三','四','五','六','日'][i]}</div>
        <div class="wk-dot ${dotCls}">${isToday ? '<span class="wk-now">今</span>' : (rate ? Math.round(rate) + '%' : (isFuture ? '·' : ''))}</div>
        <div class="wk-date">${d.getMonth() + 1}/${d.getDate()}</div>
        <div class="wk-bar"><span style="width:${rate}%"></span></div>
      </div>`;
    });
    // 本周整体完成率 = 已过天平均
    return `<div class="week-strip">${days.join('')}</div>
    <div class="week-foot">本周进行到 <b>${todayIdx + 1}</b> / 7 天 · 每格为该日打卡完成率（部分完成计 50%）</div>`;
  }

  /* ============================================================
   * 目标 · 书单
   * ============================================================ */
  /* ---------- 精选推荐书单（按大类→细分，好读优先） ---------- */
  const RECOMMENDED = [
    // 经济：从全景入门 → 中国视角 → 行为/应用 → 宏观风险 → 投资 → 经典
    { title: '经济学原理', author: '曼昆', category: '经济', note: '[入门·全景] 最系统的经济学通识，先建立全局框架' },
    { title: '斯坦福极简经济学', author: '蒂莫西·泰勒', category: '经济', note: '[入门·极简] 一本书搞懂核心概念' },
    { title: '薛兆丰经济学讲义', author: '薛兆丰', category: '经济', note: '[入门·通俗] 用日常案例讲经济学思维' },
    { title: '置身事内', author: '兰小欢', category: '经济', note: '[中国视角] 理解中国地方政府与经济运转' },
    { title: '解读中国经济', author: '张军', category: '经济', note: '[中国视角] 改革开放以来的经济脉络' },
    { title: '怪诞行为经济学', author: '理查德·塞勒', category: '经济', note: '[行为经济] 人为什么不理性，最贴近生活' },
    { title: '魔鬼经济学', author: '列维特', category: '经济', note: '[应用·有趣] 用数据拆解反常现象' },
    { title: '思考，快与慢', author: '卡尼曼', category: '经济', note: '[决策·交叉] 思维偏差，经济与心理的桥' },
    { title: '黑天鹅', author: '塔勒布', category: '经济', note: '[风险·进阶] 小概率大影响的事件' },
    { title: '反脆弱', author: '塔勒布', category: '经济', note: '[风险·进阶] 从不确定性中获益' },
    { title: '漫步华尔街', author: '马尔基尔', category: '经济', note: '[投资] 普通人怎么投资' },
    { title: '聪明的投资者', author: '格雷厄姆', category: '经济', note: '[投资·进阶] 价值投资圣经' },
    { title: '国富论', author: '亚当·斯密', category: '经济', note: '[经典·进阶] 经济学奠基，有框架后再读' },
    // 历史：大历史 → 世界史 → 中国史 → 专题
    { title: '人类简史', author: '尤瓦尔·赫拉利', category: '历史', note: '[大历史·入门] 从认知革命到今天的全局视角' },
    { title: '今日简史', author: '尤瓦尔·赫拉利', category: '历史', note: '[当代·入门] 当下与未来议题' },
    { title: '枪炮、病菌与钢铁', author: '戴蒙德', category: '历史', note: '[大历史] 为何文明格局如此' },
    { title: '全球通史', author: '斯塔夫里阿诺斯', category: '历史', note: '[世界史·全景] 系统通史' },
    { title: '万历十五年', author: '黄仁宇', category: '历史', note: '[中国·微观] 一个年份看明朝制度' },
    { title: '中国历代政治得失', author: '钱穆', category: '历史', note: '[中国·简] 短小讲制度变迁' },
    { title: '明朝那些事儿', author: '当年明月', category: '历史', note: '[中国·通俗] 好读，建立明代脉络' },
    { title: '乡土中国', author: '费孝通', category: '历史', note: '[中国社会] 理解中国基层社会结构' },
    { title: '中国近代史', author: '蒋廷黻', category: '历史', note: '[中国近现代] 简明近代史框架' },
    { title: '罗马人的故事', author: '盐野七生', category: '历史', note: '[世界·通俗] 罗马兴衰，好读' },
    { title: '丝绸之路', author: '弗兰科潘', category: '历史', note: '[世界·专题] 欧亚文明交流史' },
    // 心理：成长型思维优先、好读
    { title: '终身成长', author: '卡罗尔·德韦克', category: '心理', note: '[成长型思维] 能力可培养，必读' },
    { title: '被讨厌的勇气', author: '岸见一郎', category: '心理', note: '[阿德勒·入门] 课题分离，自我解放' },
    { title: '认知觉醒', author: '周岭', category: '心理', note: '[自我成长·中文] 认知+习惯，很接地气' },
    { title: '认知驱动', author: '周岭', category: '心理', note: '[自我成长·中文] 从认知到行动' },
    { title: '心流', author: '米哈里', category: '心理', note: '[专注·幸福] 最优体验心理学' },
    { title: '自控力', author: '凯利·麦格尼格尔', category: '心理', note: '[习惯·意志] 意志力科学' },
    { title: '原子习惯', author: '詹姆斯·克利尔', category: '心理', note: '[习惯] 微习惯复利，配合你的打卡' },
    { title: '刻意练习', author: '艾利克森', category: '心理', note: '[学习·成长] 高手怎么练出来' },
    { title: '非暴力沟通', author: '马歇尔·卢森堡', category: '心理', note: '[关系·沟通] 实用沟通法' },
    { title: '活出生命的意义', author: '弗兰克尔', category: '心理', note: '[意义·存在] 苦难中的意义感' },
    { title: '社会性动物', author: '阿伦森', category: '心理', note: '[社会心理·经典] 社会心理学入门' },
    { title: '影响力', author: '西奥迪尼', category: '心理', note: '[说服·实用] 理解被影响与影响他人' },
    // 哲学：好读优先
    { title: '中国哲学简史', author: '冯友兰', category: '哲学', note: '[中国哲学·全景] 最短篇幅通览' },
    { title: '苏菲的世界', author: '乔斯坦·贾德', category: '哲学', note: '[入门·小说体] 用故事讲哲学史，最好读' },
    { title: '哲学的故事', author: '杜兰特', category: '哲学', note: '[入门·通俗] 大哲学家的故事' },
    { title: '沉思录', author: '马可·奥勒留', category: '哲学', note: '[斯多葛·短] 自我对话，安顿内心' },
    { title: '传习录', author: '王阳明', category: '哲学', note: '[中国·心学] 知行合一，成长向' },
    { title: '西西弗神话', author: '加缪', category: '哲学', note: '[存在主义] 荒诞与反抗' },
    { title: '西方哲学史', author: '罗素', category: '哲学', note: '[全景·进阶] 系统但偏厚，框架后读' },
    { title: '宽容', author: '房龙', category: '哲学', note: '[思想史·通俗] 偏见与宽容' },
    // 其他：个人成长 / 社科 / 思维 / 中文当代（避开外国经典文学）
    { title: '穷查理宝典', author: '查理·芒格', category: '其他', note: '[思维模型] 多元思维模型，必读' },
    { title: '高效能人士的七个习惯', author: '柯维', category: '其他', note: '[成长·经典] 原则式自我管理' },
    { title: '纳瓦尔宝典', author: '纳瓦尔', category: '其他', note: '[财富·幸福] 现代人的财富与幸福观' },
    { title: '原则', author: '瑞·达利欧', category: '其他', note: '[工作·生活] 可复制的原则系统' },
    { title: '穷爸爸富爸爸', author: '清崎', category: '其他', note: '[财商·入门] 资产与负债思维' },
    { title: '金字塔原理', author: '芭芭拉·明托', category: '其他', note: '[思维·表达] 结构化思考与写作' },
    { title: '系统思考', author: '丹尼斯·舍伍德', category: '其他', note: '[系统·思维] 见树又见林' },
    { title: '命运', author: '蔡崇达', category: '其他', note: '[中文当代·成长] 闽南阿太的一生' },
    { title: '皮囊', author: '蔡崇达', category: '其他', note: '[中文当代] 故乡与亲人' },
    { title: '活着', author: '余华', category: '其他', note: '[中文当代] 苦难与坚韧，好读' },
    { title: '你当像鸟飞往你的山', author: '塔拉·韦斯特弗', category: '其他', note: '[成长·回忆录] 教育改变命运（现代纪实）' }
  ];

  /* ============================================================
   * 主题阅读营（30 天 · 问题式主题阅读）
   * ============================================================ */
  const CAMP_SUBS = [
    { id: 'Q1', label: '分辨自己', hint: '我的"累"可能是哪些原因：缺营养 / 血糖 / 睡眠 / 压力？' },
    { id: 'Q2', label: '怎么吃', hint: '日常怎么吃，把状态吃回来：补微量元素 · 稳血糖' },
    { id: 'Q3', label: '睡与动', hint: '睡眠与运动的性价比，最小可行方案' },
    { id: 'Q4', label: '管理精力', hint: '精力像肌肉一样被管理，不靠意志硬扛' }
  ];
  const CAMP_QCOLOR = { Q1: '#E24B4A', Q2: '#1D9E75', Q3: '#378ADD', Q4: '#BA7517', 视野: '#7C7A72' };
  const CAMP_MODE = { 精读: '#C0392B', 略读: '#2C6E9E', 查阅: '#777' };

  // 第一期书池：第1期 · 精力与营养（2026-09-07 ~ 2026-10-06）
  const CAMP_ROUND1 = {
    round: 1,
    title: '身体：我为什么总觉得没精力？',
    question: '我总觉得自己是"低精力体质"——这到底是真的，还是身体缺了什么（营养 / 微量元素 / 睡眠 / 血糖）？怎样把它找回来？',
    started: '2026-09-07',
    ended: '2026-10-06',
    plan: '每周主线：第1周《你是你吃出来的》→ 第2周《我们为什么要睡觉》→ 第3周《运动改造大脑》→ 第4周《精力管理》。其余按子问题挑着读、当工具书翻。',
    books: [
      { t: '你是你吃出来的', a: '夏萌', m: '精读', q: ['Q1', 'Q2'], tm: '约 6 小时', tp: '当周主线：拆 5~6 天×每天约 1h。先读"营养素平衡/细胞修复"总纲章，临床案例扫读别细看；凡讲疲劳/犯困/情绪的部分重点读 + 记想法。', w: '先建立"没劲/亚健康→可能缺什么→往哪调"的临床直觉——正是你"是不是缺镁缺锌"那个困惑的起点。', d: '讲七大营养素平衡与"细胞修复"逻辑，用大量临床案例拆解慢病和亚健康与吃的关系，并给出"四分法"餐盘等具体吃法。', bg: '神经内科出身、曾任北京安贞医院营养科主任，北京卫视《养生堂》嘉宾；自己曾因肾病/三高靠调整饮食康复，"半路出家"做临床营养（已核对）。', how: '第 1 周主线精读。凡提到疲劳/没劲/犯困/情绪的地方，折角 + 记一条想法。' },
      { t: '吃的营养科学观', a: '阿德勒·戴维斯', m: '查阅', q: ['Q1'], tm: '按需查', tp: '词典性质别通读。出现"缺镁缺锌缺B族"的疑似症状时，查对应章节的症状表与食物来源，一次 10 分钟。', w: '把缺镁、缺锌、缺 B 族等"缺乏症状"写得最具体的经典，直接当对照表查。', d: '按营养素讲缺乏表现与食物来源，回答"我是不是缺了什么"。' },
      { t: '营养圣经', a: '帕特里克·霍尔福德', m: '查阅', q: ['Q1'], tm: '按需查', tp: '工具书随翻随查"缺X会怎样 / 吃啥补"，需要才打开，不算阅读进度。', w: '维生素矿物质"词典"，随翻随查。', bg: '英国最佳营养研究所创始人，功能医学先驱之一。' },
      { t: '饮食的迷思', a: '蒂姆·斯佩克特', m: '略读', q: ['Q1'], tm: '约 1.5 小时', tp: '读序言 + 每章小结 + 与你相关的迷思（补剂/轻断食这类），文献细节跳过。', w: '"刹车书"：拆流行饮食迷思，防止你被各种"补这个补那个"收割。', bg: '伦敦国王学院遗传流行病学教授、肠道菌群研究负责人。' },
      { t: '每个人的战争', a: '大卫·塞尔旺-施莱伯', m: '略读', q: ['Q1'], tm: '约 1 小时', tp: '只读"炎症 + 饮食"两章的结论与可操作建议；治疗叙事快翻。时间紧可直接跳过。', w: '精神科医生患癌后研究身体的自我防御（炎症/饮食/环境）；时间紧可跳过。' },
      { t: '控糖革命', a: '杰西·安佐斯佩', m: '略读', q: ['Q2'], tm: '约 1.5 小时', tp: '先读序言（血糖波动→犯困的关系），再直接翻 10 个小窍门章节，挑 1~2 个明天就试；原理重复处跳过。', w: '血糖过山车 = 午后犯困、没力气、嘴馋的隐形推手；10 个不节食小窍门，可直接用。', d: '核心是"改变吃的顺序比节食更有效"：先吃蔬菜→再吃肉→最后主食甜点。', bg: '法国生物化学家，因意外受伤开始研究血糖，人称"控糖女神"（已核对中文版 2024 出版）。' },
      { t: '肠子的小心思', a: '朱莉娅·恩德斯', m: '略读', q: ['Q2'], tm: '约 1.5 小时', tp: '调剂书轻松翻，只留意"肠道如何影响情绪与能量"的部分，读不完不焦虑。', w: '轻松搞懂肠道与能量、情绪的关系，当调剂读。', bg: '德国医学博士，科普畅销书作家。' },
      { t: '吃出自愈力', a: '威廉·李', m: '略读', q: ['Q2'], tm: '约 1.5 小时', tp: '读序言 + 五大修复系统概览章 + "该吃什么"清单；机制深挖跳过，只带走能照做的吃法。', w: '食物如何调动身体五大修复系统，打开"食物=信号"的眼界。', bg: '哈佛系血管生成研究专家。' },
      { t: '我们为什么会发胖', a: '加里·陶布斯', m: '略读', q: ['Q2'], tm: '约 2 小时', tp: '观点型对照书：读序言 + 核心假说章 + 结论即可，不必同意全部论证（它常有争议）。', w: '挑战"卡路里理论"，反思碳水吃法；对照观点，不必全信。' },
      { t: '中国居民膳食指南（2022）', a: '中国营养学会', m: '查阅', q: ['Q2'], tm: '按需查', tp: '官方基准：只看"膳食宝塔"与份量标准两节，需要确认"吃多少/怎么搭"时翻。', w: '官方膳食基准，防止所有书跑偏；查"该吃多少、怎么搭"。' },
      { t: '我们为什么要睡觉', a: '马修·沃克', m: '精读', q: ['Q3'], pod: { ep: 'EP14', when: '第2周必听', must: true, note: '携隐说"读过最完整最成体系的睡眠书"，听完"惊出冷汗立刻去睡"' }, tm: '约 4 小时', tp: '🔊 EP14 约 2.5h 听完 → 书速读约 1.5h：翻"缺觉→疲惫/情绪"的章节补播客没讲的，其余不细读。', w: '睡眠是精力第一大变量；缺觉会伪装成"懒、没劲、情绪差"——会改掉你对"累"的归因顺序。', d: '从神经科学讲睡眠如何影响记忆、情绪、免疫与精力，并给改善睡眠的方法。', bg: '加州大学伯克利分校神经科学教授，睡眠领域权威科普者（已核对）。', how: '第 2 周主线精读。顺手记录一周的睡眠感受（几点睡/醒、醒来状态）。' },
      { t: '睡眠革命', a: '尼克·利特尔黑尔斯', m: '略读', q: ['Q3'], tm: '约 1 小时', tp: '只读"R90 周期法"核心章，挑 1~2 条今晚就能用的（如固定起床点）；案例跳过。', w: '给曼联、C罗做睡眠教练的人写的 "R90 周期法"，全是落地小技巧。' },
      { t: '运动改造大脑', a: '约翰·瑞迪', m: '精读', q: ['Q3'], tm: '约 4 小时', tp: '当周主线：拆 4~5 天×每天约 1h。先读"运动供能/改善情绪"的机制章，研究与病例扫读；读毕给自己定一个最小运动方案。', w: '运动不是消耗而是"发电"，对精力与情绪的性价比最高。', d: '大量研究与案例证明运动会提升能量、改善情绪与专注，而不是越动越累。', bg: '哈佛医学院精神病学副教授，运动与大脑关系研究的知名作者。', how: '第 3 周主线精读。给自己定一个最小运动方案（先别贪）。' },
      { t: '精力管理', a: '吉姆·洛尔 & 托尼·施瓦茨', m: '精读', q: ['Q4'], pod: { ep: 'EP13', when: '第4周必听', must: true, note: '播客封神期"如何从无法抹去的疲惫感中彻底恢复？"，其爆发起点' }, tm: '约 4 小时', tp: '🔊 EP13 约 3h 听完（封神期）→ 书扫读约 1h：重点看"四账户模型 + 劳逸交替"的操作框架，找能落进你精力方案的条目。', w: '主框架书：精力不是时间问题，而是"体能+情感+思维+意志"四个账户；像训练运动员一样管理能量，而不是死撑。', d: '提出精力管理的四账户模型与"劳逸交替"节奏，教人系统提升而不是靠意志硬扛。', bg: '美国心理学家吉姆·洛尔与畅销书作者托尼·施瓦茨合著（The Power of Full Engagement）。', how: '第 4 周主线精读。把前三周发现汇总成你自己的"精力方案"。' },
      { t: '掌控习惯', a: '詹姆斯·克利尔', m: '略读', q: ['Q4'], tm: '约 2 小时', tp: '先读"四大定律"总框架，每个定律挑一个马上能用的方法记下；案例与故事速读。', w: '把"好好吃、睡、动"变成无痛习惯的方法，是实践清单的执行器。' },
      { t: '超越百岁', a: '彼得·阿提亚 & 比尔·吉福德', m: '略读', q: ['视野'], pod: { ep: 'EP41', when: '可听', must: false, note: '听解读即可，书本身略过' }, tm: '听 1 小时', tp: '直接听 🔊 EP41（约 1h）就够，书不必读。', w: '"医学3.0"与代谢健康：体检正常 ≠ 状态正常，把"精力"放进更长的时间轴。', d: '中文版《超越百岁：长寿的科学与艺术》2024 年出版；讲运动、营养、睡眠、情绪如何长期维护身体与认知。' },
      { t: '救命饮食', a: '柯林·坎贝尔', m: '略读', q: ['视野'], tm: '约 1 小时', tp: '只读核心结论与数据摘要，当"植物性饮食"这一极的参照；因观点激进，不必细读论证。', w: '植物性饮食的对照派代表，数据丰富但观点激进——当"另一极"参照，不盲从。' },
      { t: '逆龄大脑', a: '桑贾伊·古普塔', m: '略读', q: ['视野'], tm: '约 1.5 小时', tp: '跳读"护脑五支柱"（吃/睡/动/社交/认知训练）各章，每支柱取一句可执行建议。', w: '大脑保养角度（吃、睡、动、社交护脑），拓宽视野。' },
      { t: '人体简史', a: '比尔·布莱森', m: '略读', q: ['视野'], tm: '约 2 小时', tp: '纯调剂书随手翻，哪个器官有趣读哪节，随时可停，不列进度。', w: '趣味人体通识，看懂身体的"出厂设置"，调剂放松读。' },
      { t: '四千周', a: '奥利弗·伯克曼', m: '略读', q: ['视野'], tm: '约 1.5 小时', tp: '读序言 + 结论章即可，核心就一句："人生时间有限，焦虑做不完最耗能"——心态刹车。', w: '心态刹车：人生时间有限，"做不完、没别人精力好"的焦虑本身最耗能，学会接受与聚焦。' }
    ]
  };

  // 30 天排期表（书名 → 档期文案：哪些天读 / 怎么拆）。静态排期，渲染时现查，不入 localStorage。
  // 时间窗 2026-09-07 ~ 10-06：W1 吃(9/7~13) W2 睡(9/14~20) W3 动(9/21~27) W4 管(9/28~10/4) 期末(10/5~6)
  const CAMP_SCHED = {
    '你是你吃出来的': '9/7~9/13 主线 · 每天约 1h（读 5~6 天）',
    '吃的营养科学观': '按需查 · 出现疑似缺镁缺锌缺B族症状时翻',
    '营养圣经': '按需查 · 随翻随查，不算进度',
    '饮食的迷思': '9/9~9/13 碎片 · 20~30min×2 次即可',
    '每个人的战争': '任选周 · 有空才读，跳过不影响',
    '控糖革命': '9/10~9/12 碎片 · 20~30min×2 次',
    '肠子的小心思': '9/12~9/13 碎片 · 调剂放松读',
    '吃出自愈力': '9/14~9/20 碎片 · 任选 2 个碎片天',
    '我们为什么会发胖': '9/14~9/20 碎片 · 任选 2 个碎片天',
    '中国居民膳食指南（2022）': '按需查 · 确认"吃多少/怎么搭"时翻',
    '我们为什么要睡觉': '9/14~9/20 主线 · 🔊EP14 先听(约2.5h)再速读',
    '睡眠革命': '9/14~9/20 碎片 · 1 个碎片天读核心章',
    '运动改造大脑': '9/21~9/27 主线 · 每天约 1h（读 4~5 天）',
    '精力管理': '9/28~10/4 主线 · 🔊EP13 先听(约3h)再扫读',
    '掌控习惯': '9/28~10/4 碎片 · 挑 2 个碎片天读四大定律',
    '超越百岁': '随时听 🔊EP41(约1h) · 听完即完成',
    '救命饮食': '9/21~9/27 碎片 · 1 个碎片天读结论',
    '逆龄大脑': '9/21~9/27 碎片 · 1 个碎片天跳读',
    '人体简史': '9/21~9/27 碎片 · 调剂随手翻',
    '四千周': '9/28~10/4 碎片 · 读序言+结论即可'
  };

  // 数据兜底：确保主题营各字段齐全（兼容旧数据）
  function ensureCamp() {
    const s = S();
    // 兜底：旧备份里可能没有 camp 块（防止 s.camp.current 抛 undefined）
    if (!s.camp || typeof s.camp !== 'object') {
      s.camp = { current: null, history: [], candidates: [] };
    } else if (!Array.isArray(s.camp.history)) {
      s.camp.history = [];
    }
    const c = s.camp;
    if (!Array.isArray(c.candidates)) { c.candidates = []; }
    if (!c.current) return c;
    const cur = c.current;
    // 只有"完全没有 subQs 字段"（老数据/R1 模板期）才用默认子问题；显式空数组 = 候选开营未配，保留空
    cur.subQs = Array.isArray(cur.subQs) ? cur.subQs : CAMP_SUBS.map(x => ({ id: x.id, label: x.label, hint: x.hint }));
    cur.books = Array.isArray(cur.books) ? cur.books : [];
    let dirty = false; // 记录本次是否发生了字段迁移/补全，是则落盘一次（修干净后不再触发）
    cur.books.forEach(b => {
      if (!b.id) { b.id = Store.uid(); dirty = true; }
      if (!b.status) { b.status = '未读'; dirty = true; }
      if (!Array.isArray(b.q)) { b.q = []; dirty = true; }
      if (!Array.isArray(b.notes)) { b.notes = []; dirty = true; }
      // 字段迁移（旧版用全名 title/author/mode/why）——必须放在默认值之前！
      // mode 强制对齐：旧数据只有 mode 没有 m，且早期版本曾把 m 误设成默认'略读'（2026-09-06 三次bugfix），需强掰回来
      if (!b.t && b.title) { b.t = b.title; dirty = true; }
      if (!b.a && b.author) { b.a = b.author; dirty = true; }
      if (b.mode && b.m !== b.mode) { b.m = b.mode; dirty = true; }
      if (!b.w && b.why) { b.w = b.why; dirty = true; }
      // 配套播客回查（CAMP_ROUND1 新增 pod 字段；用户已开跑的书对象是开跑时快照，没有 pod，按书名回查 seed 补上）
      if (!b.pod) {
        const seed = (CAMP_ROUND1.books || []).find(s => s.t === b.t && s.pod);
        if (seed) { b.pod = seed.pod; dirty = true; }
      }
      // 建议阅读时间回查（tm=行内徽标，tp=展开详文；已开跑的旧快照没有，从 seed 补，不动已改过的值）
      if (!b.tm || !b.tp) {
        const seed = (CAMP_ROUND1.books || []).find(s => s.t === b.t && s.tm);
        if (seed) {
          if (!b.tm) { b.tm = seed.tm; dirty = true; }
          if (!b.tp) { b.tp = seed.tp; dirty = true; }
        }
      }
      // 默认值（最后兜底）
      if (!b.m) { b.m = '略读'; dirty = true; }
    });
    cur.weekly = cur.weekly || {};
    cur.summary = cur.summary || '';
    // 迁移/补全过才写回一次（避免每次渲染都触发云端推送）
    if (dirty) { try { Store.save(); } catch (e) { console.warn('主题营数据落盘失败', e); } }
    return c;
  }
  function campDays() {
    const cur = ensureCamp().current;
    if (!cur) return '';
    const start = new Date(cur.started + 'T00:00:00');
    const end = new Date(cur.ended + 'T00:00:00');
    const now = new Date();
    if (now < start) return '还没开跑';
    const total = Math.round((end - start) / 86400000) + 1;
    const gone = Math.min(Math.max(Math.round((now - start) / 86400000) + 1, 1), total);
    return '第 ' + gone + ' / ' + total + ' 天';
  }
  function qLabel(id) { const f = CAMP_SUBS.find(x => x.id === id); return f ? f.label : (id === '视野' ? '广角' : id); }
  function qChip(id) {
    const color = CAMP_QCOLOR[id] || '#888';
    return `<span class="qchip" style="background:${color}22;color:${color};border:1px solid ${color}55">${id === '视野' ? '广角' : id + '·' + qLabel(id)}</span>`;
  }

  function renderCamp() {
    const s = S();
    // 兜底：与 ensureCamp 同款防御，确保旧 state 也能正常渲染（2026-09-06 bugfix）
    if (!s.camp || typeof s.camp !== 'object') s.camp = { current: null, history: [], candidates: [] };
    ensureCamp(); // 必须真正跑一次字段迁移/补全（否则旧版 title/author 不会变成 t/a），2026-09-06 二次bugfix
    const c = s.camp;
    if (!c.current) {
      const hasHistory = (c.history || []).length > 0;
      return `
      <div class="card">
        <h2>🔥 主题阅读营 <span class="sub" style="font-size:12px;color:var(--muted)">· 30 天 · 一个问题 · 一套书池 · 一个出口</span></h2>
        <div class="note">玩法：围绕一个<strong>真问题</strong>定主题 → 精读 4 本主线 + 略读其余、查阅工具书 → 每本书都绑定一个子问题当"出口"，随时记想法 → 每周日 15 分钟轻复盘 → 期末一键 AI 汇总成「新认识 + 可实践清单」。</div>
        <div class="note" style="margin-top:6px">不按"每天读几页"打卡；书池是选择空间不是任务量。</div>
        ${hasHistory
          ? '<div class="note" style="margin-top:6px">上一期已归档 🎉 新一轮可以：从下面「候选期次」一键开营（周度体检攒的主题），或直接把想读的主题告诉 AI 出一份开营包。</div>'
          : '<button class="btn primary" data-action="camp-start">🚀 开跑第一期 · 精力与营养</button>'}
        ${renderCampCandidates()}
        ${renderCampHistory()}
      </div>`;
    }
    const cur = c.current;
    const openId = ui.campBookOpen;
    const total = cur.books.length;
    const finished = cur.books.filter(b => b.status === '读完').length;
    const notesTotal = cur.books.reduce((n, b) => n + (b.notes || []).length, 0);
    const weekKey = Store.isoWeek();
    const weekVal = cur.weekly[weekKey] || { text: '' };

    const bookRows = cur.books.map(b => {
      const open = openId === b.id;
      const modeColor = CAMP_MODE[b.m] || '#888';
      const subs = (b.q || []).map(qChip).join(' ');
      const noteCount = (b.notes || []).length;
      const pod = b.pod ? `<span class="pod-tag" title="${esc(b.pod.note || '')}" style="cursor:help;color:${b.pod.must ? '#ff7043' : '#90a4ae'};border:1px solid ${b.pod.must ? '#ff704355' : '#90a4ae55'};background:${b.pod.must ? '#ff704318' : '#90a4ae18'}">🔊 ${esc(b.pod.ep)}·${esc(b.pod.when)}</span>` : '';
      return `
      <div class="camp-book" style="border-left:3px solid ${modeColor}">
        <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap">
          <div class="grow">
            <div class="title" style="cursor:pointer" data-action="camp-toggle-book" data-id="${b.id}">《${esc(b.t || b.title || '未知')}》 <span class="sub">${esc(b.a || b.author || '')}</span></div>
            ${CAMP_SCHED[b.t] ? `<div class="sub camp-sched" style="margin-top:2px"><span>📅 ${esc(CAMP_SCHED[b.t])}</span></div>` : ''}
            <div class="sub" style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px;align-items:center">
              <span class="mode-tag" style="color:${modeColor};border:1px solid ${modeColor}66;background:${modeColor}18">${esc(b.m || b.mode || '')}</span>
              ${subs || ''}
              ${pod}
              <span style="color:var(--muted)">· 已记 ${noteCount} 条想法</span>
            </div>
          </div>
          <select data-change="camp-book-status" data-id="${b.id}" style="width:auto;padding:2px 6px">
            ${['未读', '在读', '读完'].map(st => `<option ${b.status === st ? 'selected' : ''}>${st}</option>`).join('')}
          </select>
          <button class="btn sm" data-action="camp-toggle-book" data-id="${b.id}">${open ? '收起' : ((b.w || b.why) ? '👁 简介卡' : '查看')}</button>
        </div>
        ${open ? `
        <div class="camp-book-detail">
          ${b.tp || b.tm ? `<div class="camp-tip"><b>⏱ 建议投入${b.tm ? '（' + esc(b.tm) + '）' : ''}：</b> ${esc(b.tp || '')}</div>` : ''}
          <div class="sub" style="margin-bottom:6px"><b>为什么读它 / 能解哪个疑问：</b>${esc(b.w || b.why || '')}</div>
          ${b.d ? `<div class="sub" style="margin-bottom:4px"><b>这本书讲什么：</b>${esc(b.d)}</div>` : ''}
          ${b.bg ? `<div class="sub" style="margin-bottom:4px"><b>作者与背景：</b>${esc(b.bg)}</div>` : ''}
          ${b.how ? `<div class="sub" style="margin-bottom:8px"><b>读法建议：</b>${esc(b.how)}</div>` : ''}
          <h4 style="margin:8px 0 6px;font-size:13px">✍ 想法 / 挖矿（${noteCount}）</h4>
          <form data-form="camp-add-note" data-bid="${b.id}" style="margin-bottom:8px">
            <textarea name="text" placeholder="读到的、想到的、能回答哪个子问题的…直接写，别管文笔" style="min-height:56px"></textarea>
            <div class="row" style="margin-top:6px;align-items:center">
              <select name="sub" style="width:auto">
                <option value="">不限子问题</option>
                ${CAMP_SUBS.map(x => `<option value="${x.id}">${x.id}·${x.label}</option>`).join('')}
              </select>
              <button class="btn sm primary">+ 记想法</button>
            </div>
          </form>
          ${(b.notes || []).map((n, i) => `
            <div class="camp-note">
              <div class="sub" style="color:var(--muted)">${n.sub ? qChip(n.sub) : '<span class="qchip" style="background:#eee;color:#666;border:1px solid #ccc">随手</span>'} ${esc(n.date)} #${i + 1}
                <button class="icon-btn sm" data-action="camp-del-note" data-bid="${b.id}" data-i="${i}" style="float:right">🗑</button>
              </div>
              <div style="white-space:pre-wrap;line-height:1.7">${esc(n.text)}</div>
            </div>`).join('') || '<div class="sub" style="color:var(--muted)">还没有想法，写下第一笔吧</div>'}
        </div>` : ''}
      </div>`;
    }).join('');

    return `
    <div class="card">
      <h2>🔥 主题阅读营 · 第${cur.round}期 <span class="sub" style="font-size:12px;color:var(--muted)">· ${campDays()}</span>
        <span style="margin-left:auto;display:flex;gap:4px;font-size:13px;font-weight:500">
          <button class="btn sm danger" data-action="camp-end" title="归档本期，开始下一期前可随时回看">结束本期</button>
        </span>
      </h2>
      <div class="note">${esc(cur.ended)} 前完成期末整合即可，不必赶；<b>${esc(cur.question)}</b></div>
      <div class="camp-subq">
        ${cur.subQs.map(x => `<span class="qchip" style="background:${(CAMP_QCOLOR[x.id] || '#888')}22;color:${CAMP_QCOLOR[x.id] || '#888'};border:1px solid ${(CAMP_QCOLOR[x.id] || '#888')}55" title="${esc(x.hint || '')}">${x.id}·${esc(x.label)}</span>`).join('')}
      </div>
      <div class="sub" style="color:var(--muted);margin:6px 0">📋 ${total} 本 · 读完 ${finished} · 共记 ${notesTotal} 条想法</div>
      ${cur.plan ? `<div class="note" style="font-size:12px">${esc(cur.plan)}</div>` : ''}
      <h3 style="margin:12px 0 8px">📚 书池（点书名/简介卡展开）</h3>
      ${bookRows}
      ${cur.books && cur.books.length ? '' : '<div class="note" style="color:var(--muted);margin-top:6px">这一期由体检候选开营，书池还没配。把主题发给 AI（如"为《' + esc(cur.title || '') + '》出 30 天开营包"），排好书池、子问题后即可在这里边读边记。</div>'}
      ${renderCampWeekly()}
      ${renderCampSummary()}
      ${renderCampCandidates()}
      ${renderCampHistory()}
    </div>`;
  }

  function renderCampWeekly() {
    const cur = ensureCamp().current;
    if (!cur) return '';
    const weekKey = Store.isoWeek();
    const val = cur.weekly[weekKey] || { text: '' };
    const past = Object.keys(cur.weekly).filter(k => k !== weekKey).sort().reverse();
    return `
    <h3 style="margin:16px 0 8px">🪞 轻复盘（本周 ${weekKey} · 周日 15 分钟）</h3>
    <form data-form="camp-weekly">
      <div class="note" style="font-size:12px;margin-bottom:6px">只答三问：① 这周哪个子问题往前走了一步？② 有什么是"我以前不知道 / 以前想错了"的？③ 下周想试的一个小改变？</div>
      <textarea name="text" placeholder="随便写，三行也行…" style="min-height:72px">${esc(val.text || '')}</textarea>
      <button class="btn sm primary" style="margin-top:6px">保存本周轻复盘</button>
    </form>
    ${past.length ? `<h4 style="margin:12px 0 6px;font-size:13px">历史轻复盘</h4>` : ''}
    ${past.map(k => {
      const v = cur.weekly[k];
      return `<details class="camp-hist"><summary>${k} · ${esc((v.at || '').slice(0, 16))}</summary><div style="white-space:pre-wrap;line-height:1.7;padding:6px 0">${esc(v.text || '')}</div></details>`;
    }).join('')}`;
  }

  function renderCampSummary() {
    const cur = ensureCamp().current;
    if (!cur) return '';
    const has = cur.summary && cur.summary.text;
    const btn = (has ? '<button class="btn sm" data-action="camp-summarize">🔄 重新生成</button>' : '<button class="btn primary" data-action="camp-summarize">📊 期末一键汇总（AI 生成新认识+实践清单）</button>');
    return `
    <h3 style="margin:16px 0 8px">🏁 期末整合</h3>
    ${has ? `
      <div style="border:1px solid var(--good);border-radius:10px;padding:12px;background:rgba(34,197,94,0.06);margin-bottom:8px">
        <div class="sub" style="color:var(--muted);margin-bottom:6px">生成于 ${esc(cur.summary.createdAt || '')}</div>
        <div style="white-space:pre-wrap;line-height:1.8">${esc(cur.summary.text)}</div>
        <div class="row" style="margin-top:8px;gap:6px">
          <button class="btn sm" data-action="camp-copy-summary">📋 复制全文</button>
          ${btn}
        </div>
      </div>` : `
      <div class="note">读完后点下面按钮，AI 会把你本期全部子问题与想法汇总成一页：新认识（带书名）/ 被推翻的旧观念 / 可实践清单 / 验证方法。需要先在「设置」里配好 DeepSeek API Key。</div>
      ${btn}`}
    `;
  }

  function renderCampHistory() {
    const s = S();
    // 兜底：与 ensureCamp 同款防御
    if (!s.camp || typeof s.camp !== 'object') s.camp = { current: null, history: [], candidates: [] };
    const hist = (s.camp.history || []);
    if (!hist.length) return '';
    return `
    <details class="camp-hist" ${ui.campHistoryOpen ? 'open' : ''}>
      <summary style="cursor:pointer;color:var(--muted);font-size:13px;margin-top:10px">📦 已归档期次（${hist.length}）</summary>
      ${hist.map(h => `
        <div class="camp-note" style="margin-top:6px">
          <div class="sub" style="color:var(--muted)">第${h.round}期 · ${esc(h.started)} ~ ${esc(h.ended)} ${h.archivedAt ? '· 归档 ' + esc((h.archivedAt || '').slice(0, 10)) : ''}</div>
          <div><b>《${esc(h.title)}》</b> ${(h.books || []).filter(b => b.status === '读完').length} / ${(h.books || []).length} 本读完</div>
          ${h.summary && h.summary.text ? `<div class="sub" style="white-space:pre-wrap;margin-top:4px;color:var(--muted);font-size:12px">${esc(h.summary.text.slice(0, 300))}${h.summary.text.length > 300 ? '…' : ''}</div>` : ''}
        </div>`).join('')}
    </details>`;
  }

  // —— 主题营操作 ——
  function renderCampCandidates() {
    const s = S();
    const c = s.camp;
    const cands = c && Array.isArray(c.candidates) ? c.candidates : [];
    if (!cands.length) return '';
    const busy = !!(c && c.current);
    return `
    <div style="margin-top:14px">
      <h3 style="margin:0 0 4px">🗂 候选期次（${cands.length}）<span class="sub" style="font-weight:400">· 周度体检觉得值得开营的主题</span></h3>
      <div class="note" style="margin-top:4px">体检报告的「主题阅读建议」存到这里。当期结束归档后，可一键以此开新营；主题与问题自动带入，子问题和书池随后再配。</div>
      ${cands.map(x => `
      <div class="item" style="flex-direction:column;align-items:stretch;border:0.5px solid var(--border-tertiary,#3a3a3a);border-radius:10px;padding:10px 12px;margin-top:8px">
        <div class="title" style="font-size:13.5px">📚 《${esc(x.topic)}》 <span class="sub" style="font-weight:400">· 来自 ${esc(x.date || '')} 周度体检</span></div>
        ${x.question ? '<div style="font-size:13px;margin-top:4px;line-height:1.6"><b>想解决的问题：</b>' + esc(x.question) + '</div>' : ''}
        ${x.why ? '<div class="sub" style="color:var(--muted);margin-top:3px;line-height:1.6">' + esc(x.why) + '</div>' : ''}
        <div class="row" style="margin-top:8px;flex-wrap:wrap">
          ${busy
            ? '<span class="sub" style="color:#BA7517;line-height:2">⏳ 本期（第' + (c.current.round || 1) + '期）还在跑，结束归档后可开</span>'
            : '<button class="btn sm primary" data-action="camp-cand-use" data-id="' + x.id + '">🚀 以此开新营（带入主题与问题）</button>'}
          <button class="btn sm" data-action="camp-cand-del" data-id="${x.id}" style="margin-left:6px">🗑 移除</button>
        </div>
      </div>`).join('')}
    </div>`;
  }
  function campStartFromCandidate(cand) {
    const s = S();
    const c = s.camp;
    if (c && c.current) { toast('本期还在跑，先「结束本期」归档再开新营'); return; }
    const hist = (c && Array.isArray(c.history) ? c.history : []);
    const round = hist.reduce((m, h) => Math.max(m, h.round || 0), 0) + 1;
    const today = new Date();
    const st = new Date(today); st.setDate(today.getDate() + 1);
    const pad = n => String(n).padStart(2, '0');
    const started = st.getFullYear() + '-' + pad(st.getMonth() + 1) + '-' + pad(st.getDate());
    const en = new Date(st); en.setDate(st.getDate() + 29);
    const ended = en.getFullYear() + '-' + pad(en.getMonth() + 1) + '-' + pad(en.getDate());
    const seed = {
      round: round,
      title: cand.topic,
      question: cand.question || cand.topic,
      started: started, ended: ended,
      plan: cand.why || '',
      fromCand: cand.reportId || '',
      books: [], weekly: {}, summary: '',
      createdAt: fmtStamp()
    };
    s.camp.current = seed;
    // 已采纳的候选从列表移除，避免重复开营
    const arr = s.camp.candidates || [];
    const ci = arr.findIndex(x => x.id === cand.id);
    if (ci >= 0) arr.splice(ci, 1);
    Store.save(); render();
    toast('第 ' + round + ' 期已按候选开营：主题与问题已带入，书池待配');
  }
  function campStart() {
    const s = S();
    const seed = JSON.parse(JSON.stringify(CAMP_ROUND1));
    const started = seed.started, ended = seed.ended;
    // 若当前日期已过 ended，则顺延 30 天（懒人友好）
    const endD = new Date(ended + 'T00:00:00');
    if (new Date() > endD) {
      const today = new Date();
      const st = new Date(today);
      st.setDate(today.getDate() + 1);
      const pad = n => String(n).padStart(2, '0');
      seed.started = st.getFullYear() + '-' + pad(st.getMonth() + 1) + '-' + pad(st.getDate());
      const en = new Date(st); en.setDate(st.getDate() + 29);
      seed.ended = en.getFullYear() + '-' + pad(en.getMonth() + 1) + '-' + pad(en.getDate());
    }
    seed.subQs = CAMP_SUBS.map(x => ({ id: x.id, label: x.label, hint: x.hint }));
    seed.books = seed.books.map(b => ({ id: Store.uid(), t: b.t, a: b.a, m: b.m, q: b.q || [], status: '未读', w: b.w || '', d: b.d || '', bg: b.bg || '', how: b.how || '', notes: [] }));
    seed.weekly = {};
    seed.summary = '';
    seed.createdAt = fmtStamp();
    s.camp.current = seed;
    Store.save(); render();
    toast('🚀 主题营第 1 期已开跑，去书池里展开第一本书吧');
  }
  function campEnd() {
    const s = S();
    const cur = s.camp.current;
    if (!cur) return;
    if (!confirm('确定结束本期并归档？归档后随时可在下方回看，也可以再开下一期。')) return;
    cur.archivedAt = fmtStamp();
    s.camp.history.unshift(JSON.parse(JSON.stringify(cur)));
    s.camp.current = null;
    Store.save(); render();
    toast('已归档本期 · 辛苦啦');
  }
  function campDelNote(bid, i) {
    const s = S();
    const cur = s.camp.current;
    if (!cur) return;
    const b = cur.books.find(x => x.id === bid);
    if (b && b.notes && i >= 0 && i < b.notes.length) {
      const arr = b.notes;
      undoDelete(arr, i, arr.splice(i, 1)[0], '想法');
      Store.save(); render();
    }
  }
  function campSummarize(btn) {
    const s = S();
    const cur = s.camp.current;
    if (!cur) return;
    if (!s.settings.apiKey) { alert('请先在设置页配置 DeepSeek API Key，才能用 AI 汇总'); return; }
    const old = btn.textContent; btn.disabled = true; btn.textContent = 'AI 汇总中…（约 10-30 秒）';
    const prompt = campBuildPrompt(cur);
    AI.callAI(prompt, s.settings, 90000).then(txt => {
      cur.summary = { text: (txt || '').trim(), createdAt: fmtStamp() };
      Store.save(); render();
      toast('✅ 期末整合完成');
    }).catch(err => {
      alert('AI 汇总失败：' + (err && err.message || err) + '\n可稍后重试，或到设置页检查 API Key/网络');
    }).finally(() => { btn.disabled = false; if (btn) btn.textContent = old; });
  }
  function campBuildPrompt(cur) {
    const lines = [];
    lines.push('你是我的读书搭子。下面是我一期"主题阅读营"的全部记录，请帮我做期末整合。');
    lines.push('');
    lines.push('【本期主题】' + cur.title);
    lines.push('【我的元问题】' + cur.question);
    lines.push('【子问题】' + (cur.subQs || []).map(x => x.id + ' ' + x.label + '：' + (x.hint || '')).join('；'));
    lines.push('');
    lines.push('【我的想法记录（按书）】');
    (cur.books || []).forEach(b => {
      if (!b.notes || !b.notes.length) return;
      lines.push('《' + (b.t || b.title || '未知') + '》状态：' + b.status + ' 绑定：' + (b.q || []).join('、'));
      b.notes.forEach(n => lines.push('  - [' + (n.sub || '随手') + '] ' + (n.text || '')));
    });
    lines.push('');
    lines.push('请输出一份"一页心得"，分四段，口语化、真诚、别端着：');
    lines.push('一、我这 30 天得到的 3-5 个新认识（尽量带书名出处）；');
    lines.push('二、我被推翻的旧观念（比如"我就是天生低精力"到底成不成立，给判断）；');
    lines.push('三、可实践清单：马上做的 / 30 天内 / 长期，各 2-3 条，具体到能执行；');
    lines.push('四、我打算怎么验证效果（体感、睡眠记录、精力日志等）。');
    lines.push('如果某部分我没有足够记录支撑，就明说"这部分还没读到/没想清楚"，不要编。');
    return lines.join('\n');
  }

  function renderGoals() {
    // 2026-09-06：旧「阅读概览 / 书单 / 周计划 / 书架」已下线，本页只保留主题阅读营。
    // 下方旧代码保留但不可达（便于回滚/数据迁移），确认稳定后可物理删除。
    return renderCamp();
    const s = S();
    const cats = ['经济', '历史', '心理', '哲学', '其他'];
    const books = s.goals.books;
    // 确保每本书有封面元数据
    books.forEach(ensureBookMeta);
    const cnt = c => books.filter(b => b.category === c).length;
    const finished = books.filter(b => b.status === '读完').length;

    const bookList = books.length ? books.map(b => `
      <div class="item">
        <div class="grow">
          <div class="title">《${esc(b.title)}》 ${cat(b.category)}</div>
          <div class="sub">${esc(b.author || '未知')} · 状态：${esc(b.status)} ${b.note ? '· ' + esc(b.note) : ''}</div>
          <div class="row" style="margin-top:8px;align-items:flex-end">
            <select data-change="book-status" data-id="${b.id}">
              ${['想读', '在读', '读完'].map(st => `<option ${b.status === st ? 'selected' : ''}>${st}</option>`).join('')}
            </select>
            <button class="btn sm danger" data-action="del-book" data-id="${b.id}">删除</button>
          </div>
        </div>
      </div>`).join('') : '<div class="book-empty">书架空空，先加几本吧</div>';

    // 按分类折叠：点阅读概览的分类卡片 → 展开/收起该分类书目
    const openCats = cats.filter(c => ui.catOpen[c]);
    const catBookList = openCats.length ? openCats.map(c => {
      const list = books.filter(b => b.category === c);
      return `
        <h3 style="margin:14px 0 8px">${cat(c)} · ${list.length} 本
          <button class="icon-btn" data-action="toggle-cat" data-cat="${c}" title="收起">▲</button>
        </h3>
        ${list.map(b => `
        <div class="item">
          <div class="grow">
            <div class="title">《${esc(b.title)}》</div>
            <div class="sub">${esc(b.author || '未知')} · ${b.status} ${b.note ? '· ' + esc(b.note) : ''}</div>
            <div class="row" style="margin-top:8px;align-items:flex-end">
              <select data-change="book-status" data-id="${b.id}">
                ${['想读', '在读', '读完'].map(st => `<option ${b.status === st ? 'selected' : ''}>${st}</option>`).join('')}
              </select>
              <button class="btn sm danger" data-action="del-book" data-id="${b.id}">删除</button>
            </div>
          </div>
        </div>`).join('')}`;
    }).join('') : '<div class="empty" style="padding:16px">👆 点击上方「阅读概览」的分类卡片，展开查看该分类的书目</div>';

    // 周计划（含5天拆分）
    const wk = ui.week;
    const plan = (s.goals.weeklyPlan[wk] || []);
    const planList = plan.length ? plan.map((p, i) => {
      const b = books.find(x => x.id === p.bookId);
      const dailyBreakdown = genDailyPlan(p.pages || 0);
      return `<div class="item"><div class="grow"><div class="title">${b ? '《' + esc(b.title) + '》' : '（书已删除）'}</div><div class="sub">${p.pages ? '读 ' + esc(p.pages) + ' 页' : ''} ${esc(p.note || '')}</div>${dailyBreakdown}</div><button class="icon-btn" data-action="del-week-plan" data-wk="${wk}" data-i="${i}">🗑</button></div>`;
    }).join('') : '<div class="empty">本周还没有读书计划</div>';

    return `
    ${renderCamp()}
    <!-- 阅读概览（紧凑版 · 分类卡片可点击展开） -->
    <div class="card">
      <h2>📊 阅读概览 <span class="sub" style="font-size:12px;color:var(--muted)">· 点分类卡片查看书目</span></h2>
      <div class="stat-row">
        ${cats.map(c => `<div class="stat-chip ${ui.catOpen[c] ? 'open' : ''}" data-action="toggle-cat" data-cat="${c}" title="点击展开/收起 ${c} 类书目"><span class="stat-num">${cnt(c)}</span><span class="stat-lbl">${c}类</span></div>`).join('')}
        <div class="stat-chip stat-finished"><span class="stat-num">${finished}</span><span class="stat-lbl">已读完</span></div>
      </div>
      <div class="sub" style="color:var(--muted);margin-top:8px;font-size:12px">共 ${books.length} 本 · 已读完 ${finished} 本 ${openCats.length ? '· 正在查看：' + openCats.map(c => c + '类').join('、') : ''}</div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <h2>📚 书单
          <span style="margin-left:auto;font-size:13px;font-weight:500">
            <button type="button" class="btn sm" data-action="load-recommended">📥 载入推荐（${RECOMMENDED.length} 本）</button>
          </span>
        </h2>
        <form data-form="add-book">
          <div class="row">
            <div><label>书名</label><input name="title" required placeholder="《人类简史》"></div>
            <div><label>作者</label><input name="author" placeholder="尤瓦尔·赫拉利"></div>
          </div>
          <div class="row">
            <div><label>分类</label><select name="category">${cats.map(c => `<option ${c === '经济' ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
            <div><label>状态</label><select name="status"><option selected>想读</option><option>在读</option><option>读完</option></select></div>
          </div>
          <label>备注</label><input name="note" placeholder="为什么想读 / 期望收获">
          <button class="btn primary sm" style="margin-top:10px">+ 加入书单</button>
        </form>
        <h3>📖 书目（${books.length} 本）
          ${openCats.length ? `<button class="btn sm" data-action="collapse-cats" style="margin-left:auto">收起全部</button>` : ''}
        </h3>
        ${catBookList}
      </div>

      <div class="card">
        <h2>🗓 周计划（读书）</h2>
        <div class="note">安排到每周的读书任务，会<strong>自动出现</strong>在「总览·今日」的读书安排里。填入页数后会按 5 天拆分每日阅读量。</div>
        <label>选择周</label>
        <input type="week" data-change="week-sel" value="${wk}">
        <form data-form="add-week-plan" style="margin-top:10px">
          <input type="hidden" name="week" value="${wk}">
          <label>选择书</label>
          <select name="bookId">${books.map(b => `<option value="${b.id}">《${esc(b.title)}》</option>`).join('') || '<option>请先加书</option>'}</select>
          <div class="row">
            <div><label>总页数</label><input name="pages" type="number" min="0" placeholder="如 300"></div>
            <div><label>备注</label><input name="note" placeholder="章节/目标"></div>
          </div>
          <button class="btn primary sm" style="margin-top:8px">+ 加入本周计划</button>
        </form>
        <h3>${wk} 的计划</h3>
        ${planList}
      </div>
    </div>
    ${renderBookshelf()}`;
  }

  /* ---------- 周计划：按页数拆成 5 天 ---------- */
  function genDailyPlan(totalPages) {
    if (!totalPages || totalPages <= 0) return '';
    const perDay = Math.ceil(totalPages / 5);
    const days = ['周一','周二','周三','周四','周五'];
    let start = 1;
    return `<div class="daily-plan">${days.map((d, i) => {
      const end = Math.min(start + perDay - 1, totalPages);
      const range = `${start}-${end}`;
      start = end + 1;
      return `<span class="day-chip">${d}<strong>${range}</strong>页</span>`;
    }).join('')}</div>`;
  }

  /* ============================================================
   * 书架（已读完的书的封面展示 + 读书笔记）
   * ============================================================ */
  function renderBookshelf() {
    const s = S();
    const finishedBooks = s.goals.books.filter(b => b.status === '读完');
    finishedBooks.forEach(ensureBookMeta);

    if (!finishedBooks.length) {
      return `<div class="card"><h2>📚 我的书架</h2><div class="empty"><div class="big">📖</div>读完的书会自动出现在这里，变成一本漂亮的"书脊"卡片。把书单里的状态改成「试试」就能看到效果。</div></div>`;
    }

    // 视图切换
    const isCover = ui.shelfView === 'covers';

    let content;
    if (isCover) {
      content = `
        <div class="bookshelf-grid">
          ${finishedBooks.map(b => bookSpineCard(b)).join('')}
        </div>`;
    } else {
      // 按分类列表视图
      const cats = ['经济', '历史', '心理', '哲学', '其他'];
      content = cats.filter(c => finishedBooks.some(b => b.category === c)).map(c => {
        const group = finishedBooks.filter(b => b.category === c);
        return `
        <div style="margin-bottom:16px">
          <h3 style="margin:0 0 8px;color:var(--muted);font-size:14px">${cat(c)} · ${group.length} 本</h3>
          ${group.map(b => bookListItem(b)).join('')}
        </div>`;
      }).join('');
    }

    return `
    <div class="card">
      <h2>📚 我的书架（${finishedBooks.length} 本）
        <span style="margin-left:auto;font-size:13px;font-weight:500;display:flex;gap:4px">
          <button class="btn sm ${isCover ? 'primary' : ''}" data-action="shelf-view" data-v="covers">📕 封面</button>
          <button class="btn sm ${!isCover ? 'primary' : ''}" data-action="shelf-view" data-v="list">📋 分类</button>
        </span>
      </h2>
      <div class="note">已读完的书自动入架。封面视图模拟真实书脊；分类视图按学科归档。点击任意书籍可展开写/看<strong>读书笔记</strong>。</div>
      ${content}
    </div>`;
  }

  function bookSpineCard(b) {
    const expanded = ui.shelfExpanded === b.id;
    const noteCount = (b.readingNotes || []).length;
    return `
    <div class="spine-card ${expanded ? 'expanded' : ''}" style="--spine-color:${b.coverColor}">
      <div class="spine-inner" data-action="toggle-shelf" data-id="${b.id}">
        <div class="spine-top">${b.coverEmoji}</div>
        <div class="spine-title">${esc(b.title.length > 8 ? b.title.slice(0,7) + '…' : b.title)}</div>
        <div class="spine-author">${esc(b.author || '')}</div>
        <div class="spine-cat">${esc(b.category)}</div>
      </div>
      ${expanded ? `
      <div class="spine-detail">
        <div class="spine-detail-head">
          <strong>《${esc(b.title)}》</strong> · ${esc(b.author || '')} · ${cat(b.category)}
          <span class="sub">读完于 ${esc(b.finishedAt || '')}</span>
        </div>
        ${b.note ? `<div class="sub" style="margin:6px 0">📝 ${esc(b.note)}</div>` : ''}
        <h4 style="margin:10px 0 6px;font-size:14px">读书笔记（${noteCount}）</h4>
        <form data-form="add-note" data-bid="${b.id}" style="margin-bottom:10px">
          <textarea name="note" placeholder="写下你的读后感悟、金句摘抄、思维导图要点…" style="min-height:64px"></textarea>
          <button class="btn sm primary" style="margin-top:6px">+ 记笔记</button>
        </form>
        ${(b.readingNotes || []).map((n, i) => `
          <div class="reading-note">
            <div class="sub">${esc(n.date)} #${i+1}</div>
            <div style="white-space:pre-wrap;line-height:1.7">${esc(n.text)}</div>
            <button class="icon-btn sm" data-action="del-note" data-bid="${b.id}" data-i="${i}" style="float:right;margin-top:-18px">🗑</button>
          </div>`).join('') || '<div class="sub" style="color:var(--muted)">还没有笔记，写下第一笔吧</div>'}
      </div>` : ''}
    </div>`;
  }

  function bookListItem(b) {
    const expanded = ui.shelfExpanded === b.id;
    return `
    <div class="item shelf-item" style="border-left:3px solid ${b.coverColor}">
      <div class="grow" data-action="toggle-shelf" data-id="${b.id}" style="cursor:pointer">
        <div class="title">${b.coverEmoji} 《${esc(b.title)}》<span class="sub">· ${esc(b.author || '')}</span></div>
        <div class="sub">${cat(b.category)} · 读完于 ${esc(b.finishedAt || '')}${(b.readingNotes||[]).length ? ` · ${(b.readingNotes||[]).length} 条笔记` : ''}</div>
      </div>
      ${expanded ? `
      <div class="spine-detail" style="padding-left:16px;margin-top:10px">
        <h4 style="margin:0 0 6px;font-size:13px">读书笔记</h4>
        <form data-form="add-note" data-bid="${b.id}" style="margin-bottom:8px">
          <textarea name="note" placeholder="写下你的读后感悟…" style="min-height:54px"></textarea>
          <button class="btn sm primary" style="margin-top:4px">+ 记笔记</button>
        </form>
        ${(b.readingNotes || []).map((n, i) => `
          <div class="reading-note">
            <div class="sub">${esc(n.date)} #${i+1}</div>
            <div style="white-space:pre-wrap;line-height:1.65">${esc(n.text)}</div>
            <button class="icon-btn sm" data-action="del-note" data-bid="${b.id}" data-i="${i}" style="float:right;margin-top:-16px">🗑</button>
          </div>`).join('') || '<div class="sub" style="color:var(--muted)">还没有笔记</div>'}
      </div>` : ''}
    </div>`;
  }

  /* ============================================================
   * 收藏夹清理
   * ============================================================ */
  function renderFavorites() {
    const s = S();
    const channels = ['抖音', '小红书', '公众号'];
    const cats = ['温暖治愈', 'AI', '运动健身', '好物', '其它'];
    const wk = Store.isoWeek();
    let items = s.favorites.items.slice().sort((a, b) => b.date.localeCompare(a.date));
    if (ui.favFilter === 'pending') items = items.filter(i => !i.cleared);
    if (ui.favFilter === 'week') items = items.filter(i => !i.cleared && Store.isoWeek(i.date) === wk);

    const list = items.length ? items.map(i => `
      <div class="item">
        <div class="grow">
          <div class="title">${esc(i.content || '(无文字)')}</div>
          <div class="sub" style="margin-top:4px">${cat(i.channel)} ${cat(i.category)} · ${esc(i.date)} ${i.url ? '· <a href="' + esc(i.url) + '" target="_blank">链接</a>' : ''}</div>
          ${i.toMaterial ? '<div class="sub" style="color:var(--good);margin-top:2px">→ 已转入自媒体素材池</div>' : ''}
        </div>
        <div class="tools">
          ${i.toMaterial ? '' : (i.cleared ? '' : `<button class="btn sm" data-action="fav-to-material" data-id="${i.id}" title="保留这条，转入自媒体素材池供内容创作使用">转素材</button>`)}
          ${i.cleared ? '<span class="badge">已清理</span>' : `<button class="btn sm" data-action="clear-fav" data-id="${i.id}">清除</button>`}
          <button class="icon-btn" data-action="del-fav" data-id="${i.id}">🗑</button>
        </div>
      </div>`).join('') : '<div class="empty"><div class="big">🧼</div>没有符合条件的收藏</div>';

    const weekPending = s.favorites.items.filter(i => !i.cleared && Store.isoWeek(i.date) === wk);
    const materialCount = s.media.materials.length;

    return `
    <div class="card">
      <h2>🧹 收藏夹清理</h2>
      <div class="note">每天顺手记下令你点赞/收藏的内容，周末统一清理（标记"已清除"即移出待处理）。清理时看到有价值的（尤其是 <strong>AI / 成长类</strong>），点 <strong>「转素材」</strong> 保留进自媒体素材池，其余再清除。本周待清理：<strong>${weekPending.length}</strong> 条 · 素材池已有 <strong>${materialCount}</strong> 条。</div>
      <form data-form="add-fav">
        <div class="row">
          <div><label>渠道</label><select name="channel">${channels.map(c => `<option ${c === '抖音' ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
          <div><label>分类</label><select name="category">${cats.map(c => `<option ${c === '温暖治愈' ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
          <div><label>日期</label><input name="date" type="date" value="${T()}"></div>
        </div>
        <label>内容/一句话</label><input name="content" placeholder="这条内容讲了什么、为什么收藏">
        <label>链接（可选）</label><input name="url" placeholder="https://...">
        <div class="row" style="margin-top:8px;align-items:flex-end">
          <button class="btn primary sm">+ 记录收藏</button>
          ${weekPending.length ? '<button class="btn sm danger" data-action="clear-week">一键清除本周</button>' : ''}
        </div>
      </form>
      <h3 style="margin:16px 0 8px">📋 收藏列表
        <span style="margin-left:auto;font-size:13px;font-weight:500;display:flex;gap:4px">
          <button class="btn sm ${ui.favFilter === 'all' ? 'primary' : ''}" data-action="fav-filter" data-f="all">全部</button>
          <button class="btn sm ${ui.favFilter === 'pending' ? 'primary' : ''}" data-action="fav-filter" data-f="pending">待清理</button>
          <button class="btn sm ${ui.favFilter === 'week' ? 'primary' : ''}" data-action="fav-filter" data-f="week">本周</button>
        </span>
      </h3>
      <button class="btn sm" data-action="fav-ai-classify" style="margin-bottom:8px">🤖 AI 自动分类（全部收藏）</button>
      <button class="btn sm" data-action="fav-cleanup-suggest" style="margin-bottom:8px">🧹 AI 清理建议</button>
      <div id="favCleanupPanel" class="hidden" style="margin-bottom:10px"></div>
      ${list}
    </div>`;
  }

  /* ============================================================
   * 感恩日记
   * ============================================================ */
  function renderGratitude() {
    const s = S();
    const entries = s.gratitude.entries;
    const list = entries.length ? entries.map(e => `
      <div class="item">
        <div class="grow">
          <div class="title">${esc(e.date)} ${e.mood ? '· 心情 ' + esc(e.mood) : ''}</div>
          <div class="sub" style="color:var(--muted);font-size:12px;margin-top:2px">🕐 记录于 ${esc(stampOf(e))}${e.createdAt ? ' · 时间已锁定' : ''}</div>
          <ul style="margin:6px 0 0;padding-left:18px">${e.items.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
        </div>
        <button class="icon-btn" data-action="del-gratitude" data-id="${e.id}">🗑</button>
      </div>`).join('') : '<div class="empty"><div class="big">🌿</div>今天有什么值得感恩的小事吗？</div>';

    return `
    <div class="card">
      <h2>🌿 写一条感恩</h2>
      <form data-form="add-gratitude">
        <div class="row">
          <div><label>日期</label><input name="date" type="date" value="${T()}"></div>
          <div><label>心情（可选）</label><select name="mood"><option value="">— 选择 —</option><option>平静</option><option>开心</option><option>疲惫</option><option>焦虑</option><option>满足</option><option>低落</option><option>兴奋</option></select></div>
        </div>
        <label>今天感恩的 1-3 件事（每行一件）</label>
        <textarea name="items" required placeholder="1. 早上阳光很好&#10;2. 学生主动发来进步的好消息&#10;3. 喝到了好喝的咖啡" style="min-height:90px"></textarea>
        <button class="btn primary sm" style="margin-top:8px">+ 保存</button>
      </form>
    </div>
    <div class="card">
      <h2>📜 感恩记录（${entries.length}）</h2>
      ${list}
    </div>`;
  }

  /* ============================================================
   * 生活语录（收藏夹页内模块 · 右侧列）
   * ============================================================ */
  // 语录整理独立页（从收藏夹分离出来）
  function renderQuotes() {
    const s = S();
    const platforms = ['小红书', '微博', '公众号', '抖音', 'flomo', '其他'];
    let items = s.quotes.slice();
    if (ui.quoteFilter !== 'all') items = items.filter(q => q.platform === ui.quoteFilter);
    // 置顶优先，其次按日期倒序
    items.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return String(b.date).localeCompare(String(a.date));
    });
    const cards = items.length ? items.map(q => quoteCard(q)).join('') :
      '<div class="empty"><div class="big">💬</div>还没有收藏语录，遇到喜欢的句子就记下来吧</div>';

    return `
    <div class="card">
      <h2>💬 语录整理（${s.quotes.length}）
        <span style="margin-left:auto;font-size:13px;font-weight:500;display:flex;gap:4px;flex-wrap:wrap">
          <button class="btn sm ${ui.quoteFilter === 'all' ? 'primary' : ''}" data-action="quote-filter" data-f="all">全部</button>
          ${platforms.map(p => `<button class="btn sm ${ui.quoteFilter === p ? 'primary' : ''}" data-action="quote-filter" data-f="${p}">${p}</button>`).join('')}
        </span>
      </h2>
      <div class="note">在各平台刷到的好句子，收藏、打标签、置顶。粘贴文本会自动清理格式。</div>
      <form data-form="add-quote" style="margin:10px 0">
        <label>句子（粘贴自动去多余空行）</label>
        <textarea name="content" data-clean="quote" required placeholder="粘贴或输入你喜欢的句子…" style="min-height:60px"></textarea>
        <div class="row">
          <div><label>来源平台</label><select name="platform">${platforms.map(p => `<option ${p === '小红书' ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
        </div>
        <label>来源链接</label><input name="sourceUrl" placeholder="https://…（可选）">
        <label>配图</label><input name="image" placeholder="粘贴截图（Ctrl+V）或填图片链接">
        <div class="row" style="margin-top:8px;align-items:flex-end">
          <button class="btn primary sm">+ 收藏语录</button>
        </div>
      </form>
      ${cards}
    </div>`;
  }

  function quoteCard(q) {
    const expanded = ui.quoteExpanded === q.id;
    const editing = ui.quoteEditing === q.id;
    const imgSrc = resolveImg(q.image);
    return `
    <div class="quote ${q.pinned ? 'pinned' : ''}">
      <div class="quote-head" data-action="toggle-quote" data-id="${q.id}">
        ${imgSrc ? `<img class="quote-thumb" src="${esc(imgSrc)}" alt="" onerror="this.style.display='none'" loading="lazy">` : ''}
        <div class="grow">
          <div class="quote-text">${esc(q.content)}</div>
          <div class="quote-meta">
            ${q.sourceUrl ? `<a href="${esc(q.sourceUrl)}" target="_blank" rel="noopener" class="quote-link">🔗 来源</a>` : ''}
            ${cat(q.platform)}${q.createdAt ? ` · 🕐 ${esc(q.createdAt)}` : ''}${q.pinned ? ' · 📌' : ''}
          </div>
        </div>
        <div class="tools">
          <button class="icon-btn" data-action="edit-quote" data-id="${q.id}" title="编辑">✏️</button>
          <button class="icon-btn" data-action="pin-quote" data-id="${q.id}" title="置顶/取消置顶">${q.pinned ? '📌' : '📍'}</button>
          <button class="icon-btn" data-action="del-quote" data-id="${q.id}" title="删除">🗑</button>
        </div>
      </div>
      ${expanded ? `
      <div class="quote-detail">
        ${imgSrc ? `<img class="quote-preview" src="${esc(imgSrc)}" alt="" onerror="this.style.display='none'">` : ''}
        <div>${esc(q.content)}</div>
      </div>` : ''}
      ${editing ? renderQuoteEdit(q) : ''}
    </div>`;
  }

  function renderQuoteEdit(q) {
    const platforms = ['小红书', '微博', '公众号', '抖音', 'flomo', '其他'];
    return `
    <div class="quote-edit-panel">
      <form data-form="save-quote-edit" data-id="${q.id}">
        <label>句子内容</label>
        <textarea name="content" data-clean="quote" style="min-height:50px">${esc(q.content)}</textarea>
        <div class="row">
          <div><label>来源平台</label><select name="platform">${platforms.map(p => `<option ${q.platform === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
        </div>
        <label>来源链接</label><input name="sourceUrl" value="${esc(q.sourceUrl || '')}" placeholder="https://…">
        <label>配图链接</label><input name="image" value="${esc(q.image || '')}" placeholder="粘贴截图（Ctrl+V）或填 https://… 图片直链">
        <div class="paste-status" style="font-size:12px;color:var(--muted);margin-top:4px;min-height:18px"></div>
        <div class="row" style="margin-top:8px;gap:6px">
          <button class="btn primary sm">💾 保存修改</button>
          <button class="btn sm" data-action="cancel-edit-quote" type="button">取消</button>
        </div>
      </form>
    </div>`;
  }

  /* ============================================================
   * 每日复盘（含根因分析 + 跟踪）
   * ============================================================ */
  function renderReview() {
    const s = S();
    if (ui.reviewTab === 'tracking') return renderTracking();
    if (ui.reviewTab === 'journal') return renderJournal();
    if (ui.reviewTab === 'weekly') return renderWeekly();
    const entries = s.reviews.entries;
    const list = entries.length ? entries.map(e => `
      <div class="card" style="margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div class="title" style="font-weight:700">📅 ${esc(e.date)} 复盘<span class="sub" style="font-weight:400;margin-left:8px">🕐 ${esc(stampOf(e))}${e.createdAt ? ' · 已锁定' : ''}</span></div>
          <button class="icon-btn" data-action="del-review" data-id="${e.id}">🗑</button>
        </div>
        <div class="sub" style="color:var(--muted);white-space:pre-wrap;margin-top:6px">${esc(e.content || '（无正文）')}</div>
        ${(e.problems || []).length ? `<div class="sub" style="margin-top:8px">📍 这篇产出 <b>${(e.problems || []).length}</b> 个卡点在跟踪 <button class="btn sm" data-action="review-tab" data-f="tracking" style="margin-left:4px">去问题跟踪 →</button></div>` : ''}
      </div>`).join('') : '<div class="empty"><div class="big">🪞</div>还没有复盘记录</div>';

    return `
    ${renderActionCheck()}
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <h2 style="margin:0">🪞 写今日复盘</h2>
        <span style="display:inline-flex;gap:6px;flex-wrap:wrap">
          <button class="btn sm ${ui.reviewTab === 'list' ? 'primary' : ''}" data-action="review-tab" data-f="list">复盘</button>
          <button class="btn sm ${ui.reviewTab === 'journal' ? 'primary' : ''}" data-action="review-tab" data-f="journal">随笔</button>
          <button class="btn sm ${ui.reviewTab === 'weekly' ? 'primary' : ''}" data-action="review-tab" data-f="weekly">周度体检</button>
          <button class="btn sm ${ui.reviewTab === 'tracking' ? 'primary' : ''}" data-action="review-tab" data-f="tracking">问题跟踪</button>
        </span>
      </div>
      <form data-form="add-review">
        <div class="row"><div><label>日期</label><input name="date" type="date" value="${T()}"></div></div>
        <label>今天发生了什么 / 总体复盘</label>
        <textarea name="content" required placeholder="今天做了什么、状态如何、有什么感悟…" style="min-height:90px"></textarea>
        <button class="btn primary sm" style="margin-top:8px">+ 保存复盘</button>
      </form>
      <div id="review-auto-panel" class="hidden" style="margin-top:12px"></div>
    </div>
    <div class="card">
      <h2>📜 复盘记录（${entries.length}）</h2>
      ${list}
    </div>`;
  }

  /* ---------- 每日随笔：纯记录、不分析、不进卡点 ---------- */
  const JOURNAL_MOODS = [
    { v: '开心', e: '😊' }, { v: '平静', e: '😌' }, { v: '满足', e: '😄' },
    { v: '低落', e: '😔' }, { v: '疲惫', e: '😪' }, { v: '烦躁', e: '😤' },
    { v: '焦虑', e: '😰' }, { v: '感恩', e: '🙏' }, { v: '其他', e: '🌙' }
  ];
  function moodEmoji(m) { const f = JOURNAL_MOODS.find(o => o.v === m); return f ? f.e : ''; }
  function renderJournal() {
    const s = S();
    const jl = (s.journals && Array.isArray(s.journals.entries)) ? s.journals.entries : [];
    const edit = ui.journalEdit || null;
    const tabBtn = (f, label) => `<button class="btn sm ${ui.reviewTab === f ? 'primary' : ''}" data-action="review-tab" data-f="${f}">${label}</button>`;
    const moodOpts = JOURNAL_MOODS.map(o => `<option value="${o.v}" ${edit && edit.mood === o.v ? 'selected' : ''}>${o.e} ${o.v}</option>`).join('');
    const items = jl.length ? jl.map(j => `
      <div class="item" style="align-items:flex-start">
        <div class="grow">
          <div class="title">📖 ${esc(j.date)}${j.mood ? '　' + moodEmoji(j.mood) + ' ' + esc(j.mood) : ''}${(j.updatedAt || j.createdAt) ? '<span class="sub" style="font-weight:400;margin-left:8px">🕐 ' + esc((j.updatedAt || j.createdAt).slice(11, 16)) + '</span>' : ''}</div>
          <div style="white-space:pre-wrap;margin-top:4px;font-size:13px;line-height:1.75;color:var(--text,inherit)">${esc(j.content || '')}</div>
        </div>
        <div class="tools">
          <button class="btn sm" data-action="journal-edit" data-id="${j.id}" title="修改这篇">✏️ 改</button>
          <button class="icon-btn" data-action="del-journal" data-id="${j.id}" title="删除">🗑</button>
        </div>
      </div>`).join('') : '<div class="empty"><div class="big">📖</div>还没有随笔<br>今天有什么想说的，随手记一笔</div>';
    return `
    <div class="card" id="journalFormCard">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <h2 style="margin:0">📖 每日随笔</h2>
        <span style="display:inline-flex;gap:6px;flex-wrap:wrap">${tabBtn('list', '复盘')}${tabBtn('journal', '随笔')}${tabBtn('weekly', '周度体检')}${tabBtn('tracking', '问题跟踪')}</span>
      </div>
      <div class="note">随笔是写给自己的——事情、心情、胡思乱想都可以。它平时<b>不会被 AI 分析</b>、不会变成卡点，只安静地存在；只有每周「周度体检」深挖时，会把你这一周的文字一起通读一遍。</div>
      <form data-form="save-journal">
        <div class="row" style="align-items:flex-end">
          <div><label>日期</label><input name="date" type="date" value="${edit ? edit.date : T()}" required></div>
          <div><label>心情（可选）</label><select name="mood"><option value="">—</option>${moodOpts}</select></div>
        </div>
        <label>随笔内容</label>
        <textarea name="content" placeholder="今天发生的事、心里的感受、忽然冒出的念头…" style="min-height:130px">${edit ? esc(edit.content) : ''}</textarea>
        <div class="row" style="margin-top:8px">
          <button class="btn primary sm">${edit ? '💾 保存修改' : '💾 保存随笔'}</button>
          ${edit ? '<button class="btn sm" data-action="journal-cancel" style="margin-left:8px">取消修改</button>' : ''}
        </div>
      </form>
    </div>
    <div class="card">
      <h2>📜 随笔本（${jl.length}）</h2>
      ${items}
    </div>`;
  }

  /* ---------- 复盘闭环：卡点复发合并 + 昨日卡点跟进 + 周度体检 ---------- */
  function _norm(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/[\s，。！？、,.!?'"“”‘’：:；;()（）\-—_~～]/g, '');
  }
  function _editDist(a, b) {
    const la = a.length, lb = b.length;
    const dp = [];
    for (let i = 0; i <= la; i++) { dp[i] = [i]; }
    for (let j = 0; j <= lb; j++) { dp[0][j] = j; }
    for (let i = 1; i <= la; i++) {
      for (let j = 1; j <= lb; j++) {
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
    }
    return dp[la][lb];
  }
  function _sim(a, b) {
    if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
    return 1 - _editDist(a, b) / Math.max(a.length, b.length);
  }
  // 在近 45 天所有复盘与周度体检报告中找相似卡点（用于复发合并）。返回 {entry, prob, exact}
  function findMergeTarget(text) {
    const n = _norm(text);
    if (!n) return null;
    const cutoff = Store.addDays(T(), -45);
    const cands = [];
    (S().reviews.entries || []).forEach(en => { if (!(en.date && en.date < cutoff)) (en.problems || []).forEach(p => cands.push({ entry: en, prob: p })); });
    (S().reviews.weeklyReports || []).forEach(r => { if (!(r.date && r.date < cutoff)) (r.problems || []).forEach(p => cands.push({ entry: r, prob: p })); });
    for (let i = 0; i < cands.length; i++) {
      const p = cands[i].prob, m = _norm(p.text);
      if (!m) continue;
      const sim = m === n || m.indexOf(n) >= 0 || n.indexOf(m) >= 0 || _sim(m, n) >= 0.72;
      if (sim) return { entry: cands[i].entry, prob: p, exact: m === n };
    }
    return null;
  }
  // 添加卡点：相似则合并到已有问题（累计复发），否则新建
  function pushProblem(entry, text) {
    entry.problems = entry.problems || [];
    const n = _norm(text);
    if (!n) return { dup: false, merged: false };
    if (entry.problems.some(p => _norm(p.text) === n)) return { dup: true, merged: false };
    const tgt = findMergeTarget(text);
    if (tgt) {
      const p = tgt.prob;
      p.followups = p.followups || [];
      p.recurCount = (p.recurCount || 0) + 1;
      p.recurDates = p.recurDates || [];
      const d = T();
      if (p.recurDates[p.recurDates.length - 1] !== d) p.recurDates.push(d);
      p.followups.push({ date: d, note: '同类问题再次出现，已自动合并（来自 ' + (entry.date || '当日') + ' 复盘）', improved: false, recur: true });
      if (p.status === '已改善') p.status = '改善中';
      Store.save();
      return { dup: false, merged: true, target: tgt };
    }
    entry.problems.push({ id: Store.uid(), text: text, analysis: '', status: '待跟进', followups: [], recurCount: 0, recurDates: [], createdAt: fmtStamp(), date: T() });
    Store.save();
    return { dup: false, merged: false };
  }
  function resultText(r) { return r === 'done' ? '✅ 有改善' : r === 'partial' ? '🔁 部分改善' : r === 'no' ? '⏳ 没改善' : ''; }
  // 问题最近一次"被提起"的日期：新建日 / 复发日 / 后续跟踪日，取最大
  function lastActiveDate(p) {
    let d = p.createdAt ? p.createdAt.slice(0, 10) : (p.date || '');
    (p.recurDates || []).forEach(r => { if (r > d) d = r; });
    (p.followups || []).forEach(f => { if (f.date && f.date > d) d = f.date; });
    return d;
  }
  // 全库找某个卡点（跨天/跨体检合并后，问题可能挂在最早的载体下）
  function findProblem(id) {
    const s = S();
    const carriers = [];
    (s.reviews.entries || []).forEach(en => carriers.push({ entry: en, from: 'entry' }));
    (s.reviews.weeklyReports || []).forEach(r => carriers.push({ entry: r, from: 'weekly' }));
    for (let i = 0; i < carriers.length; i++) {
      const c = carriers[i];
      const p = ((c.entry && c.entry.problems) || []).find(x => x.id === id);
      if (p) return { entry: c.entry, prob: p, from: c.from };
    }
    return null;
  }
  // 昨日卡点跟进卡片：昨天还"未改善"且最近动态在昨天的卡点，今天顺手确认一次状态
  function renderActionCheck() {
    const s = S();
    const y = Store.addDays(T(), -1);
    const cutoff = Store.addDays(T(), -45);
    const open = [];
    (s.reviews.entries || []).forEach(e => {
      if (e.date && e.date < cutoff) return;
      (e.problems || []).forEach(p => {
        if (p.status === '已改善') return;
        if (lastActiveDate(p) === y) open.push(p);
      });
    });
    (s.reviews.weeklyReports || []).forEach(r => {
      if (r.date && r.date < cutoff) return;
      (r.problems || []).forEach(p => {
        if (p.status === '已改善') return;
        if (lastActiveDate(p) === y) open.push(p);
      });
    });
    if (!open.length) return '';
    let html = '<div class="card" style="border:1px solid rgba(29,158,117,0.5)"><h2>🔄 昨日卡点跟进 <span class="sub">来自 ' + esc(y) + '</span></h2>';
    html += '<div class="note" style="margin-top:6px">昨天还在跟进的卡点，今天有变化吗？确认后状态会自动更新。深层惯性交给「周度体检」，这里只管眼前这一步。</div>';
    html += open.map(p => `
        <div class="item" style="flex-direction:column;align-items:stretch">
          <div class="title">❓ ${esc(p.text)}${(p.recurCount || 0) ? ' <span class="sub">· 已复发 ' + (p.recurCount) + ' 次</span>' : ''}</div>
          <div class="row" style="margin-top:6px;gap:6px">
            <button class="btn sm" data-action="check-problem" data-id="${p.id}" data-r="done">✅ 有改善</button>
            <button class="btn sm" data-action="check-problem" data-id="${p.id}" data-r="partial">🔁 部分改善</button>
            <button class="btn sm" data-action="check-problem" data-id="${p.id}" data-r="no">⏳ 没改善</button>
          </div>
        </div>`).join('');
    html += '</div>';
    return html;
  }
  // 首页「今日节奏」卡片：待办 + 复盘/随笔 + 周度体检
  function renderActionTodayCard() {
    const s = S();
    const todoOpen = (s.todos || []).filter(t => !t.done).length;
    const doneToday = (s.reviews.entries || []).find(e => e.date === T());
    const journalToday = (s.journals && s.journals.entries || []).find(j => j.date === T());
    const wReps = s.reviews.weeklyReports || [];
    const cutoff7 = Store.addDays(T(), -7);
    const latest = wReps.length ? wReps[0] : null;
    const fresh = latest && latest.date >= cutoff7;
    const wkFind = fresh ? (latest.findings || []).length : 0;
    const wkTracked = fresh ? (latest.problems || []).length : 0;
    const writeLine = doneToday || journalToday
      ? (doneToday ? '复盘已写 ✓' : '') + (doneToday && journalToday ? ' · ' : '') + (journalToday ? '随笔已写 ✓' : '')
      : '今天还没写 · 现在花两分钟';
    return `
    <div class="card">
      <h2>🧭 今日节奏</h2>
      <div class="item">
        <div class="grow"><div class="title">✅ 今日待办</div><div class="sub">${todoOpen} 条未完成</div></div>
        <button class="btn sm" data-action="nav" data-sec="todos">去处理</button>
      </div>
      <div class="item">
        <div class="grow"><div class="title">🪞 复盘 · 随笔</div><div class="sub">${writeLine}</div></div>
        ${doneToday || journalToday ? '<button class="btn sm" data-action="nav" data-sec="review">看记录</button>' : '<button class="btn sm primary" data-action="go-journal">去写</button>'}
      </div>
      <div class="item">
        <div class="grow"><div class="title">🧠 周度体检</div><div class="sub">${fresh ? '已出报告 · ' + wkFind + ' 个发现' + (wkTracked ? ' · ' + wkTracked + ' 条已转追踪' : '') : '还没做过 · 攒几天随笔再深挖'}</div></div>
        <button class="btn sm" data-action="go-weekly">${fresh ? '看报告' : '去体检'}</button>
      </div>
    </div>`;
  }

  // 发现类型配色：行动与身体(绿) / 思维与认知(橙) / 情感与关系(紫) / 根源升华(金)
  function kindColor(k) {
    const MAP = {
      '惯性': '#5DCAA5', '身体信号': '#5DCAA5', '目标偏离': '#5DCAA5',
      '思维漏洞': '#EF9F27', '能力盲区': '#EF9F27', '内在标准': '#EF9F27',
      '隐藏的思考': '#AFA9EC', '情绪暗流': '#AFA9EC', '关系边界': '#AFA9EC',
      '根源': '#FAC775', '阅读建议': '#FAC775'
    };
    return MAP[k] || '#5DCAA5';
  }
  function problemCard(p) {
    const statusOpts = ['待跟进', '改善中', '已改善', '未改善'];
    const kindChip = p.kind ? `<span style="border:0.5px solid ${kindColor(p.kind)};color:${kindColor(p.kind)};border-radius:999px;padding:0 7px;font-size:11px;margin-right:6px;line-height:1.9">${esc(p.kind)}</span>` : '';
    const meta = (p.kind || p.source) ? `<div class="sub" style="margin-top:4px">${kindChip}${p.source ? '来自 ' + esc(p.source) : ''}</div>` : '';
    const evidence = p.evidence ? `<div class="sub" style="color:var(--muted);margin-top:6px;border-left:2px solid #888780;padding-left:8px;line-height:1.6">📎 ${esc(p.evidence)}</div>` : '';
    const planBox = (p.fix || p.habitPlan) ? `<div class="ai-box" style="margin-top:8px">${p.fix ? '<div style="margin-bottom:4px"><strong>🛠 破解办法</strong></div><div style="white-space:pre-wrap">' + esc(p.fix) + '</div>' : ''}${p.fix && p.habitPlan ? '<div style="margin-top:6px;border-top:0.5px solid var(--border-tertiary,#3a3a3a);padding-top:6px"></div>' : ''}${p.habitPlan ? '<strong>🎯 习惯培养方案</strong><div style="white-space:pre-wrap;margin-top:4px">' + esc(p.habitPlan) + '</div>' : ''}</div>` : '';
    const analysis = p.analysis ? `<div class="ai-box" style="margin-top:8px">${esc(p.analysis)}</div>` : '';
    const recurBadge = (p.recurCount || 0) ? `<span class="sub" style="margin-left:8px;color:#BA7517;font-weight:500">🔁 复发 ${p.recurCount} 次</span>` : '';
    const follows = (p.followups || []).map(f => `<div class="item" style="margin:6px 0 0"><div class="grow"><div class="sub">${esc(f.date)} ${f.improved ? '✅ 有改善' : (f.recur ? '🔁 复发' : '⏳ 待观察')}</div><div>${esc(f.note)}</div></div></div>`).join('') || '';
    return `
    <div class="item" style="flex-direction:column;align-items:stretch">
      <div style="display:flex;justify-content:space-between;gap:10px">
        <div class="grow"><div class="title">❓ ${esc(p.text)}</div>${meta}${recurBadge}</div>
        <span class="status-pill status-${p.status || '待跟进'}">${p.status || '待跟进'}</span>
      </div>
      ${evidence}
      ${planBox}
      <div class="row" style="margin-top:8px;align-items:flex-end">
        <select data-change="problem-status" data-id="${p.id}">${statusOpts.map(o => `<option ${ (p.status||'待跟进')===o?'selected':''}>${o}</option>`).join('')}</select>
        <button class="btn sm primary" data-action="analyze-problem" data-id="${p.id}">🤖 AI 根因分析</button>
      </div>
      <div id="aipanel-${p.id}" class="hidden" style="margin-top:10px"></div>
      ${analysis}
      <h3 style="margin:10px 0 4px">后续跟踪</h3>
      ${follows}
      <form data-form="add-followup" data-id="${p.id}" style="margin-top:6px">
        <div class="row" style="align-items:flex-end">
          <div style="flex:3"><textarea name="note" placeholder="这周执行得怎么样？有无改善信号？" style="min-height:44px"></textarea></div>
          <div style="flex:1"><label style="display:flex;align-items:center;gap:6px;margin-top:0"><input type="checkbox" name="improved" style="width:auto"> 有改善</label></div>
          <button class="btn sm" style="flex:0">记录</button>
        </div>
      </form>
    </div>`;
  }

  function renderTracking() {
    const s = S();
    const all = [];
    (s.reviews.entries || []).forEach(e => (e.problems || []).forEach(p => all.push(Object.assign({ entryDate: e.date, from: 'entry' }, p))));
    (s.reviews.weeklyReports || []).forEach(r => (r.problems || []).forEach(p => all.push(Object.assign({ entryDate: r.date, from: 'weekly' }, p))));
    const order = { '待跟进': 0, '改善中': 1, '未改善': 2, '已改善': 3 };
    all.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
    const solvedN = all.filter(p => p.status === '已改善').length;
    const solveRate = all.length ? Math.round(solvedN / all.length * 100) : 0;
    const list = all.length ? all.map(p => {
      const src = p.from === 'weekly' ? '来自 ' + esc(p.entryDate) + ' 周度体检' : '来自 ' + esc(p.entryDate) + ' 复盘';
      const chip = p.kind ? `<span style="border:0.5px solid ${kindColor(p.kind)};color:${kindColor(p.kind)};border-radius:999px;padding:0 6px;font-size:11px;margin-left:6px">${esc(p.kind)}</span>` : '';
      const habit = p.habitPlan ? `<div class="sub" style="margin-top:4px"><span style="color:#5DCAA5">🎯 培养方案</span>　${esc(String(p.habitPlan).slice(0, 70))}${String(p.habitPlan).length > 70 ? '…' : ''}</div>` : '';
      const goBtn = p.from === 'weekly'
        ? '<button class="btn sm" data-action="weekly-open" style="align-self:flex-start;margin-top:6px">去体检页补跟踪 →</button>'
        : '<button class="btn sm" data-action="nav" data-sec="review" style="align-self:flex-start;margin-top:6px">去该复盘补充跟踪 →</button>';
      return `
      <div class="item" style="flex-direction:column;align-items:stretch">
        <div style="display:flex;justify-content:space-between;gap:10px">
          <div class="grow"><div class="title">❓ ${esc(p.text)}${(p.recurCount || 0) ? ' <span class="sub" style="color:#BA7517;font-weight:500">🔁 复发 ' + (p.recurCount) + ' 次</span>' : ''}${chip}</div><div class="sub">${src} · 最近动态 ${esc(lastActiveDate(p))}</div></div>
          <span class="status-pill status-${p.status || '待跟进'}">${p.status || '待跟进'}</span>
        </div>
        ${habit}
        ${p.analysis ? `<div class="ai-box" style="margin-top:8px">${esc(p.analysis)}</div>` : '<div class="sub" style="color:var(--muted);margin-top:6px">尚未做 AI 根因分析</div>'}
        <div class="sub" style="margin-top:6px">跟踪记录：${(p.followups||[]).length} 条 · 已改善信号 ${(p.followups||[]).filter(f=>f.improved).length} 个</div>
        ${goBtn}
      </div>`;
    }).join('') : '<div class="empty"><div class="big">📈</div>还没有卡点需要跟踪<br>写复盘时把想改掉的毛病直接写进正文，保存后 AI 会识别，点「＋记作卡点」即可收录；每周在「周度体检」做深度扫描、转追踪带培养方案的卡点</div>';
    return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <h2 style="margin:0">📈 卡点跟踪</h2>
        <span style="display:inline-flex;gap:6px">
          <button class="btn sm" data-action="review-tab" data-f="weekly">← 周度体检</button>
          <button class="btn sm" data-action="review-tab" data-f="list">← 复盘列表</button>
        </span>
      </div>
      <div class="note">这里汇总所有「卡点」：保存复盘时 AI 从正文识别、你点「＋记作卡点」收录的 + 周度体检转来的（带习惯培养方案）。跨载体自动合并、累计复发；每周做一次深度扫描，才能看见自己在哪些模式上真的变了。</div>
      <div class="stat-row" style="margin-top:8px">
        <div class="stat-chip"><span class="stat-num">${all.length}</span><span class="stat-lbl">总卡点</span></div>
        <div class="stat-chip stat-finished"><span class="stat-num">${solveRate}%</span><span class="stat-lbl">解决率</span></div>
        <div class="stat-chip"><span class="stat-num">${all.reduce((n, p) => n + (p.recurCount || 0), 0)}</span><span class="stat-lbl">累计复发</span></div>
        <div class="stat-chip"><span class="stat-num">${all.filter(p => (p.status || '待跟进') === '待跟进').length}</span><span class="stat-lbl">待跟进</span></div>
        <div class="stat-chip"><span class="stat-num">${all.filter(p => (p.status || '') === '改善中').length}</span><span class="stat-lbl">改善中</span></div>
        <div class="stat-chip"><span class="stat-num">${all.filter(p => (p.status || '') === '已改善').length}</span><span class="stat-lbl">已改善</span></div>
      </div>
      ${list}
    </div>`;
  }

  /* ============================================================
   * 周度思考体检：每周从「随笔+复盘」里挖隐藏模式
   * ============================================================ */
  function _weekMat() {
    const s = S();
    const start = Store.addDays(T(), -6);
    const jl = (s.journals && s.journals.entries || []).filter(j => j.date && j.date >= start).sort((a, b) => a.date.localeCompare(b.date));
    const rl = (s.reviews.entries || []).filter(e => e.date && e.date >= start).sort((a, b) => a.date.localeCompare(b.date));
    const txts = [];
    jl.forEach(j => txts.push('【' + j.date + ' · 随笔' + (j.mood ? '(' + j.mood + ')' : '') + '】' + String(j.content || '').slice(0, 800)));
    rl.forEach(e => txts.push('【' + e.date + ' · 复盘】' + String(e.content || '').slice(0, 800)));
    return { text: txts.join('\n\n'), nJ: jl.length, nR: rl.length, start, label: start + ' ~ ' + T() };
  }
  const FIND_KINDS = ['惯性', '思维漏洞', '隐藏的思考', '情绪暗流', '内在标准', '关系边界', '目标偏离', '能力盲区', '身体信号'];
  // 解析体检输出：新版为 JSON 对象 {findings:[...],rootCause,...}，兼容旧版纯数组
  function _parseDeepDive(txt) {
    let t = String(txt || '').replace(/```[a-z]*/gi, '');
    const o = { findings: [], rootCause: '', rootEvidence: '', readTopic: '', readQuestion: '', readWhy: '' };
    const cb = t.indexOf('{'), ce = t.lastIndexOf('}');
    if (cb >= 0 && ce > cb) {
      try {
        const obj = JSON.parse(t.slice(cb, ce + 1));
        const arr = Array.isArray(obj) ? obj : obj.findings;
        if (Array.isArray(arr)) {
          o.findings = arr.filter(x => x && String(x.title || '').trim()).map(x => ({
            kind: FIND_KINDS.indexOf(x.kind) >= 0 ? x.kind : '惯性',
            title: String(x.title).trim(),
            evidence: String(x.evidence || '').trim(),
            fix: String(x.fix || '').trim(),
            habitPlan: String(x.habitPlan || '').trim()
          }));
        }
        if (!Array.isArray(obj)) {
          o.rootCause = String(obj.rootCause || '').trim();
          o.rootEvidence = String(obj.rootEvidence || '').trim();
          o.readTopic = String(obj.readTopic || '').trim();
          o.readQuestion = String(obj.readQuestion || '').trim();
          o.readWhy = String(obj.readWhy || '').trim();
        }
        return o;
      } catch (e) { /* fallthrough */ }
    }
    const i = t.indexOf('['), j = t.lastIndexOf(']');
    if (i >= 0 && j > i) {
      try {
        const arr = JSON.parse(t.slice(i, j + 1));
        if (Array.isArray(arr)) {
          o.findings = arr.filter(x => x && String(x.title || '').trim()).map(x => ({
            kind: FIND_KINDS.indexOf(x.kind) >= 0 ? x.kind : '惯性',
            title: String(x.title).trim(),
            evidence: String(x.evidence || '').trim(),
            fix: String(x.fix || '').trim(),
            habitPlan: String(x.habitPlan || '').trim()
          }));
        }
      } catch (e) { /* ignore */ }
    }
    return o;
  }
  function mountWeeklyRun(panel) {
    panel.classList.remove('hidden');
    const mat = _weekMat();
    if (!mat.text) {
      panel.innerHTML = '<div class="note" style="color:var(--muted)">最近 7 天还没有随笔或复盘素材——先随手写几天，素材够了再来深挖才有东西可挖。</div>';
      return;
    }
    const prompt = AI.buildWeeklyDeepDive(mat.text, mat.label);
    mountAIPanel(panel, prompt, function(txt) {
      const r = _parseDeepDive(txt);
      if (!r.findings.length && !r.rootCause && !r.readTopic) { toast('没有解析到内容，请把 AI 回复粘贴为完整 JSON 再保存'); return; }
      const s2 = S();
      const reps = s2.reviews.weeklyReports || [];
      const cutoff7 = Store.addDays(T(), -7);
      const latest = reps.length ? reps[0] : null;
      const rep = { id: Store.uid(), date: T(), rangeLabel: mat.label, createdAt: fmtStamp(), findings: r.findings, rootCause: r.rootCause, rootEvidence: r.rootEvidence, readTopic: r.readTopic, readQuestion: r.readQuestion, readWhy: r.readWhy, readSavedAt: '', problems: [] };
      if (latest && latest.date >= cutoff7 && !(latest.problems || []).length) {
        reps[reps.findIndex(x => x.id === latest.id)] = rep;
      } else {
        reps.unshift(rep);
      }
      Store.save(); render();
      toast('体检完成：发现 ' + r.findings.length + ' 个模式' + (r.readTopic ? ' · 附 1 个主题阅读建议' : '') + '，逐条决定要不要转成卡点');
    }, '保存本次体检');
  }
  function _wkTabRow() {
    const tabBtn = (f, label) => `<button class="btn sm ${ui.reviewTab === f ? 'primary' : ''}" data-action="review-tab" data-f="${f}">${label}</button>`;
    return `<span style="display:inline-flex;gap:6px;flex-wrap:wrap">${tabBtn('list', '复盘')}${tabBtn('journal', '随笔')}${tabBtn('weekly', '周度体检')}${tabBtn('tracking', '问题跟踪')}</span>`;
  }
  function _wkFindingCard(f, rep, idx) {
    const kc = kindColor(f.kind);
    return `
    <div class="item" style="flex-direction:column;align-items:stretch;border:0.5px solid var(--border-tertiary,#3a3a3a);border-radius:10px;padding:10px 12px;margin-top:8px">
      <div class="title" style="font-size:13.5px"><span style="border:0.5px solid ${kc};color:${kc};border-radius:999px;padding:0 7px;font-size:11px;margin-right:6px;line-height:1.9">${esc(f.kind)}</span>${esc(f.title)}</div>
      ${f.evidence ? '<div class="sub" style="color:var(--muted);margin-top:5px;border-left:2px solid ' + kc + ';padding-left:8px;line-height:1.6">' + esc(f.evidence) + '</div>' : ''}
      ${f.fix ? '<div style="font-size:13px;margin-top:6px;line-height:1.7"><span style="color:' + kc + '">破解办法</span>　' + esc(f.fix) + '</div>' : ''}
      ${f.habitPlan ? '<div style="font-size:13px;margin-top:6px;line-height:1.7"><span style="color:' + kc + '">习惯培养</span>　' + esc(f.habitPlan) + '</div>' : ''}
      <div style="margin-top:8px"><button class="btn sm primary" data-action="weekly-track" data-id="${rep.id}" data-i="${idx}">转为追踪 · 开始培养</button></div>
    </div>`;
  }
  function renderWeeklyReport(r, showRun) {
    const findings = (r.findings || []).filter(f => !f.tracked);
    const tracked = (r.problems || []).filter(p => p && p.id);
    let html = `<div class="ai-box" style="margin-top:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <strong>📋 ${esc(r.date)} 周度体检 · ${esc(r.rangeLabel || '')}</strong>
        <span class="sub">发现 ${(r.findings || []).length} 个 · 已转追踪 ${tracked.length} 个</span>
      </div>
      ${showRun ? '<div class="row" style="margin-top:8px"><button class="btn sm" data-action="weekly-run">↻ 重新深挖（覆盖本周空报告）</button></div>' : ''}`;
    if (r.rootCause) {
      html += `<div style="border:0.5px solid #FAC77588;border-radius:10px;padding:10px 12px;margin-top:10px">
        <div style="font-weight:500;color:#FAC775">🎯 根源假设 · 本周几条发现的共同底层</div>
        <div style="font-size:13px;margin-top:5px;line-height:1.7">${esc(r.rootCause)}</div>
        ${r.rootEvidence ? '<div class="sub" style="color:var(--muted);margin-top:5px;line-height:1.6">线索：' + esc(r.rootEvidence) + '</div>' : ''}
        <div class="sub" style="color:var(--muted);margin-top:5px">单周验证不了根源——它更适合放进「主题阅读」或跨几周体检持续观察，别急着当卡点硬改。</div>
      </div>`;
    }
    if (r.readTopic) {
      html += `<div style="border:0.5px solid #FAC775;border-radius:10px;padding:10px 12px;margin-top:8px">
        <div style="font-weight:500;color:#FAC775">📚 主题阅读建议 · 值得开一期去解决</div>
        <div style="font-size:13px;margin-top:5px;line-height:1.7"><b>建议主题：</b>${esc(r.readTopic)}</div>
        ${r.readQuestion ? '<div style="font-size:13px;margin-top:3px;line-height:1.7"><b>想解决的问题：</b>' + esc(r.readQuestion) + '</div>' : ''}
        ${r.readWhy ? '<div class="sub" style="color:var(--muted);margin-top:3px;line-height:1.6">' + esc(r.readWhy) + '</div>' : ''}
        ${r.readSavedAt
          ? '<div class="sub" style="margin-top:6px;color:#5DCAA5">✓ 已存入主题阅读营候选（' + esc(String(r.readSavedAt).slice(0, 16)) + '）</div>'
          : '<div class="row" style="margin-top:6px"><button class="btn sm primary" data-action="weekly-cand-save" data-id="' + r.id + '">💾 存为候选期次（收进主题阅读营）</button></div>'}
      </div>`;
    }
    if (findings.length) {
      html += '<div class="note" style="margin-top:10px">下面是从你一周文字里挖出的隐藏模式——每条都带证据。只有你真正认同、想改的，才点「转为追踪」。</div>';
      findings.forEach((f, i) => { html += _wkFindingCard(f, r, r.findings.indexOf(f)); });
    }
    if (tracked.length) {
      html += '<h3 style="margin:12px 0 2px">🎯 已转入跟踪（可在此更新状态/记录每周进展）</h3>';
      tracked.forEach(p => { html += problemCard(p); });
    }
    if (!findings.length && !tracked.length && !r.rootCause && !r.readTopic) html += '<div class="sub" style="color:var(--muted);margin-top:8px">这次没发现成模式的困扰——状态不错，下周再深挖一次。</div>';
    html += '</div>';
    return html;
  }
  function renderWeekly() {
    const s = S();
    const reps = s.reviews.weeklyReports || [];
    const cutoff7 = Store.addDays(T(), -7);
    const fresh = reps.length && reps[0].date >= cutoff7 ? reps[0] : null;
    const history = reps.filter(r => r !== fresh);
    const mat = _weekMat();
    const matLine = `近 7 天素材：随笔 ${mat.nJ} 篇 · 复盘 ${mat.nR} 次（${mat.label}）`;
    const noMat = !mat.nJ && !mat.nR;
    return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <h2 style="margin:0">🧠 周度思考体检</h2>
        ${_wkTabRow()}
      </div>
      <div class="note">平时随笔、复盘安静记录；每周一次，AI 通读 7 天文字，从 9 个方向挖你没意识到的模式：<b>惯性 · 思维漏洞 · 隐藏的思考 · 情绪暗流 · 内在标准 · 关系边界 · 目标偏离 · 能力盲区 · 身体信号</b>。每条带原文证据 + 破解办法 + 习惯培养方案；最后还会给一层更深的<b>根源假设</b>与<b>主题阅读建议</b>。认同的转成卡点长期跟，不认同的忽略——你永远是决定的人。</div>
      <div class="stat-row" style="margin-top:8px">
        <div class="stat-chip"><span class="stat-num">${mat.nJ + mat.nR}</span><span class="stat-lbl">本周素材</span></div>
        <div class="stat-chip"><span class="stat-num">${fresh ? (fresh.findings || []).length : 0}</span><span class="stat-lbl">最新发现</span></div>
        <div class="stat-chip"><span class="stat-num">${(fresh && fresh.problems || []).length}</span><span class="stat-lbl">已转追踪</span></div>
      </div>
      ${fresh ? renderWeeklyReport(fresh, true) : `
      <div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap">
        <button class="btn primary" data-action="weekly-run">${reps.length ? '🧠 深挖最近 7 天' : '🧠 开始第一次深挖'}</button>
        ${!S().settings.apiKey ? '<button class="btn sm" data-action="nav" data-sec="settings">先去设置 API →</button>' : ''}
      </div>
      ${noMat ? '<div class="note" style="color:var(--muted);margin-top:8px">最近 7 天还没有素材。从今天起每天在「随笔」或「复盘」写几句话，周日回来深挖，效果最好。</div>' : ''}`}
      <div id="weeklyPanel" class="hidden" style="margin-top:12px"></div>
      ${history.length ? `<details style="margin-top:12px"><summary style="cursor:pointer;color:var(--muted)">历史体检报告（${history.length} 份）</summary>${history.map(r => renderWeeklyReport(r, false)).join('')}</details>` : ''}
    </div>`;
  }

  /* ============================================================
   * 洞察报告：周报/月报 + 个人分析
   * ============================================================ */
  function renderInsight() {
    const s = S();
    const type = ui.insightType;
    const d = AI.collectInsightData(s, type);
    const label = type === 'month' ? '月报' : '周报';

    // 数据概览（纯本地统计，不依赖 AI）
    const habitRate = d.habits.totalSlots ? Math.round(d.habits.doneCount / d.habits.totalSlots * 100) : 0;
    const solveRate = d.problems.total ? Math.round(d.problems.solved / d.problems.total * 100) : 0;
    const moodChips = Object.keys(d.gratitude.moods).length
      ? Object.entries(d.gratitude.moods).map(([k, v]) => `<span class="badge">${esc(k)} ×${v}</span>`).join('')
      : '<span class="sub" style="color:var(--muted)">暂无心情记录</span>';
    const habitBars = Object.keys(d.habits.perHabit).map(name => {
      const h = d.habits.perHabit[name];
      const tot = h.done + h.partial;
      const pct = tot ? Math.round(h.done / tot * 100) : 0;
      return `<div class="item"><div class="grow"><div class="title" style="font-size:13px">${esc(name)}</div><div class="progress" style="height:8px;margin:4px 0"><span style="width:${pct}%"></span></div><div class="sub" style="font-size:12px">完成 ${h.done} 次${h.partial ? ' · 部分 ' + h.partial + ' 次' : ''}</div></div></div>`;
    }).join('');

    const reports = s.reports.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const reportList = reports.length ? reports.map(r => `
      <div class="item" style="flex-direction:column;align-items:stretch">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div class="title">${r.type === 'month' ? '📅 月报' : '📅 周报'} · ${esc(r.period)}</div>
          <div class="tools">
            <button class="btn sm" data-action="view-report" data-id="${r.id}">查看</button>
            <button class="icon-btn" data-action="del-report" data-id="${r.id}">🗑</button>
          </div>
        </div>
        ${ui.insightExpanded === r.id ? `<div class="ai-box" style="margin-top:8px;white-space:pre-wrap;line-height:1.7">${esc(r.copy)}</div>` : ''}
      </div>`).join('') : '<div class="empty">还没有生成过报告</div>';

    return `
    <div class="card">
      <h2>📊 生成洞察报告（${label}）
        <span style="margin-left:auto;font-size:13px;font-weight:500;display:flex;gap:4px">
          <button class="btn sm ${type === 'week' ? 'primary' : ''}" data-action="insight-type" data-v="week">周报</button>
          <button class="btn sm ${type === 'month' ? 'primary' : ''}" data-action="insight-type" data-v="month">月报</button>
        </span>
      </h2>
      <div class="note">自动汇总本期全部记录（打卡/复盘/感恩/收藏/语录/读书/自媒体），生成<strong>个人深度分析报告</strong>——不只是数据总结，重点是透过数据看你的<strong>行为模式、心理状态、性格优势、潜在盲点</strong>，并给出针对性建议。</div>
      <div class="row" style="margin-top:8px;align-items:flex-end">
        <span class="sub" style="color:var(--muted)">统计区间：${esc(d.range)}</span>
        <button class="btn primary sm" data-action="gen-insight">✨ 生成${label}（AI 个人分析）</button>
      </div>
      <div id="insightPanel" class="hidden" style="margin-top:12px"></div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <h2>📈 本期概览</h2>
        <div class="stat-row">
          <div class="stat-chip"><span class="stat-num">${habitRate}%</span><span class="stat-lbl">打卡完成率</span></div>
          <div class="stat-chip"><span class="stat-num">${d.habits.doneCount}</span><span class="stat-lbl">完成项次</span></div>
          <div class="stat-chip ${solveRate > 0 ? 'stat-finished' : ''}"><span class="stat-num">${solveRate}%</span><span class="stat-lbl">问题解决率</span></div>
          <div class="stat-chip"><span class="stat-num">${d.reviews.count}</span><span class="stat-lbl">复盘${d.reviews.count === 1 ? '次' : '次'}</span></div>
        </div>
        <div class="sub" style="margin-top:8px;font-size:13px;line-height:2">
          ${cat('感恩')} ${d.gratitude.count} 条 · ${cat('收藏')} ${d.favorites.count} 条 · ${cat('语录')} ${d.quotes} 条<br>
          ${cat('读书')} 在读 ${d.books.reading.length} 本 · 本期读完 ${d.books.done.length} 本<br>
          ${cat('自媒体')} 灵感 ${d.media.ideas} · 素材 ${d.media.materials} · 选题 ${d.media.topics} · 发布 ${d.media.publishes}
        </div>
        <h3 style="margin-top:10px">心情分布</h3>
        <div class="row" style="gap:6px;flex-wrap:wrap">${moodChips}</div>
      </div>

      <div class="card">
        <h2>✅ 习惯执行明细</h2>
        ${habitBars || '<div class="empty">本期没有打卡数据</div>'}
        <div class="sub" style="color:var(--muted);font-size:12px;margin-top:6px">完成率 = 完成次数 ÷（完成+部分）次数。部分完成也会保留，避免破窗。</div>
      </div>
    </div>

    <div class="card">
      <h2>📚 历史报告（${reports.length}）</h2>
      ${reportList}
    </div>

    <div class="card">
      <h2>🔗 跨版块数据关联</h2>
      <div class="note">AI 扫描全部数据（书单、语录、收藏、选题、复盘、习惯），自动发现隐藏的关联。例如："你收藏的 AI 类内容，和你选定的选题《AI 时代为什么语文思维更值钱》高度相关"。</div>
      <div class="row" style="margin-top:8px;align-items:flex-end;gap:8px">
        <button class="btn primary sm" data-action="gen-kg">🔗 生成数据关联</button>
      </div>
      <div id="kgPanel" class="hidden" style="margin-top:12px"></div>
    </div>

    <div class="card">
      <h2>📅 年度回顾报告</h2>
      <div class="note">年底时（或随时），AI 基于全年数据生成一份真诚温暖的年度个人成长报告。包含：年度关键词、最铭记的时刻、最大的改变、仍在努力的事、新年寄语。</div>
      <div class="row" style="margin-top:8px;align-items:flex-end;gap:8px">
        <button class="btn primary sm" data-action="gen-yearly">📅 生成年度报告</button>
      </div>
      <div id="yearlyPanel" class="hidden" style="margin-top:12px"></div>
    </div>

    <div class="card">
      <h2>💬 问答式数据洞察</h2>
      <div class="note">直接问工作台，AI 会结合你的真实记录回答。例如：<em>"我最近一周心情怎么样？"</em>、<em>"我的打卡连续纪录里哪项最容易断？"</em>、<em>"下个月我该重点改什么习惯？"</em></div>
      <div class="row" style="align-items:flex-end;gap:8px">
        <input id="qaInput" placeholder="输入你的问题…" style="flex:1">
        <button class="btn primary sm" data-action="qa-ask">🤖 提问</button>
      </div>
      <div id="qaPanel" class="hidden" style="margin-top:12px"></div>
    </div>`;
  }

  /* ============================================================
   * 生活打卡
   * ============================================================ */
  /* ---------- 打卡状态读取（兼容旧 true 格式） ---------- */
  function habitState(rec, id) {
    const v = rec && rec[id];
    if (!v) return { s: '', note: '' };
    if (v === true) return { s: 'done', note: '' };
    if (typeof v === 'string') return { s: v, note: '' };
    return { s: v.s || '', note: v.note || '' };
  }
  function habitStreak(def) {
    const s = S(); let count = 0;
    if (def.type === 'daily') {
      let d = T();
      while (s.habits.records[d] && habitState(s.habits.records[d], def.id).s === 'done') { count++; d = Store.addDays(d, -1); }
    } else if (def.type === 'weekly-thu') {
      let d = T();
      while (Store.weekdayName(d) !== '周四') d = Store.addDays(d, -1);
      while (s.habits.records[d] && habitState(s.habits.records[d], def.id).s === 'done') { count++; d = Store.addDays(d, -7); }
    }
    return count;
  }
  // 三态循环：无 → 完成 → 部分完成 → 无
  function nextHabitState(cur) {
    if (!cur) return { s: 'done', note: '' };
    if (cur.s === 'done') return { s: 'partial', note: cur.note || '' };
    return null;
  }

  /* ---------- 运动计划工具 ---------- */
  // 返回今天对应的训练日（workout.plan 里 dow 匹配的项）
  function todayWorkout() {
    const s = S();
    const plan = s.workout && s.workout.plan ? s.workout.plan : [];
    const dow = (new Date().getDay() + 6) % 7 + 1; // 周一=1 ... 周日=7
    return plan.find(p => p.dow === dow) || null;
  }
  // 计算某日期处于周期第几天（1..cycle）；未设置经期起始日返回 null
  function cycleDayOf(dateStr) {
    const s = S();
    const w = s.workout || {};
    const last = (w.period || {}).lastStart || '';
    const cycle = (w.period || {}).cycleDays || 28;
    if (!last) return null;
    const diff = Math.floor((new Date(dateStr + 'T00:00:00') - new Date(last + 'T00:00:00')) / 86400000);
    return ((diff % cycle) + cycle) % cycle + 1; // 1..cycle
  }
  // 经期阶段：推算今天处于哪个周期阶段 → 返回 { day, phase, label, tip, intensity }
  function cyclePhase() {
    const day = cycleDayOf(T());
    if (!day) return null;
    if (day <= 5) return { day, phase: 'period', label: '月经期', tip: '身体较弱，建议休息或温和拉伸，不做高强度/核心卷腹', intensity: '低' };
    if (day <= 13) return { day, phase: 'follicular', label: '卵泡期', tip: '精力回升，力量训练黄金期，可放心练背/臀/腿', intensity: '高' };
    if (day <= 15) return { day, phase: 'ovulation', label: '排卵期', tip: '体能高峰，适合做想挑战的动作，注意热身', intensity: '高' };
    return { day, phase: 'luteal', label: '黄体期', tip: '能量逐渐下降，经前易疲劳，建议温和减量，多做拉伸', intensity: '中低' };
  }
  // 今日运动是否已完成
  function workoutDoneToday() {
    const s = S();
    return !!(s.workout.records && s.workout.records[T()]);
  }
  function renderHabits() {
    const s = S(); const t = T(); const rec = s.habits.records[t] || {};
    const list = s.habits.definitions.map(d => {
      const st = habitState(rec, d.id);
      const streak = habitStreak(d);
      const cls = st.s === 'done' ? 'on' : (st.s === 'partial' ? 'part' : '');
      const icon = st.s === 'done' ? '✓' : (st.s === 'partial' ? '◐' : '');
      return `<div class="habit">
        <div class="left">
          <div class="check ${cls}" data-action="cycle-habit" data-id="${d.id}" title="点击切换：未打卡 → 完成 → 部分完成">${icon}</div>
          <div><div class="title">${esc(d.name)}</div><div class="streak">${d.type === 'weekly-thu' ? '每周四 · ' : '每日 · '}连续 ${streak} ${d.type === 'weekly-thu' ? '周' : '天'}${st.s === 'partial' ? ' · 已部分完成' : ''}</div>
            ${st.note ? `<div class="sub" style="color:var(--muted);font-size:12px">💬 ${esc(st.note)}</div>` : ''}
          </div>
        </div>
        <div class="tools" style="display:flex;align-items:center;gap:6px">
          <button class="btn sm" data-action="habit-note" data-id="${d.id}">备注</button>
          <button class="icon-btn" data-action="del-habit" data-id="${d.id}">🗑</button>
        </div>
      </div>`;
    }).join('') || '<div class="empty">还没有习惯，先加一个</div>';

    // 复盘待跟进问题（打卡↔复盘联动提醒）
    const allP = [];
    s.reviews.entries.forEach(en => (en.problems || []).forEach(p => allP.push(p)));
    const pend = allP.filter(p => p.status !== '已改善');
    const pendNote = pend.length ? `
      <div class="note" style="margin-top:10px;background:var(--warn);color:#fff;border:none">
        ⚠ 你有 ${pend.length} 个复盘问题待跟进：${pend.slice(0, 3).map(p => esc(p.text)).join('、')}${pend.length > 3 ? '…' : ''}
        <button class="btn sm" style="margin-left:8px;background:#fff;color:#854F0B" data-action="nav" data-sec="review">去处理</button>
      </div>` : '';

    // ---- 运动安排（右列） ----
    const workout = renderWorkoutPanel();

    return `
    <div class="grid grid-2 habits-grid">
      <div class="card">
        <h2>✅ 今日打卡 · ${esc(t)} ${Store.isThursday(t) ? '· 周四（记得听姜思达播客）' : ''}</h2>
        <div class="note">点击左侧方框切换状态：<strong>✓ 完成 → ◐ 部分完成 → 取消</strong>。连续天数按"完成"累计；每周四专属习惯只在周四计入。</div>
        ${pendNote}
        ${list}
        <h3 style="margin-top:14px">➕ 添加习惯</h3>
        <form data-form="add-habit" class="row" style="align-items:flex-end">
          <div style="flex:2"><label>名称</label><input name="name" placeholder="如 早上拉伸" required></div>
          <div style="flex:1"><label>频率</label><select name="type"><option value="daily">每日</option><option value="weekly-thu">每周四</option></select></div>
          <button class="btn primary sm">添加</button>
        </form>
      </div>

      <div class="card">
        <h2>🏃 运动安排 · 今日</h2>
        ${workout}
      </div>
    </div>`;
  }

  /* ---------- 运动安排面板（右列）：今日任务 + 经期提示 + 周计划一览 ---------- */
  function renderWorkoutPanel() {
    const s = S();
    const w = s.workout || {};
    const plan = w.plan || [];
    const today = todayWorkout();
    const done = workoutDoneToday();
    const phase = cyclePhase();
    const body = w.bodyInfo || {};

    // 经期撞上训练日 → 今日自动改为温和恢复（避开核心卷腹 / 臀腿大重量 / HIIT）
    const inPeriod = !!(phase && phase.phase === 'period');
    const periodRest = inPeriod && !!(today && today.trained);
    const folStart = (w.period || {}).lastStart ? Store.addDays((w.period || {}).lastStart, 5) : '';
    // 今日运动卡片（含打卡开关）
    const todayCard = today ? `
      <div class="workout-today ${done ? 'done' : ''}">
        <div class="workout-today-head">
          <span class="badge" style="background:${periodRest ? 'var(--warn)' : 'var(--accent)'};color:#fff">${periodRest ? '🌸 ' + esc(today.name) + ' · 经期改恢复' : esc(today.name)}</span>
          ${today.trained ? `<button class="btn sm ${done ? 'primary' : ''}" data-action="toggle-workout">${done ? '✓ 今日运动已完成' : '打卡今日运动'}</button>` : '<span class="badge">休息日</span>'}
        </div>
        ${periodRest ? `
        <div class="workout-focus">🌸 月经期温和恢复：散步 / 八段锦 / 温和拉伸</div>
        <ul class="workout-items">
          <li>散步 20-30 分钟 或 八段锦一套</li>
          <li>温和拉伸 5-10 分钟（髋部 / 腰背 / 腿后侧放松）</li>
          <li>腹式呼吸 3 分钟收尾</li>
        </ul>
        <div class="workout-note">月经期身体较弱，今天暂不练「${esc(today.focus || '')}」。原训练顺延：可在卵泡期${folStart ? '（' + folStart + ' 起）' : ''}的休息日补练，量力即可、不必全补。</div>` : `
        <div class="workout-focus">🎯 ${esc(today.focus || '')}</div>
        <ul class="workout-items">
          ${(today.items || []).map(i => `<li>${esc(i)}</li>`).join('')}
        </ul>
        ${today.note ? `<div class="workout-note">💡 ${esc(today.note)}</div>` : ''}
        ${!today.trained ? '<div class="note" style="margin-top:8px">今天是恢复日：肌肉需要 24-48 小时生长与修复，休息也是训练的一部分。</div>' : ''}`}
      </div>` : '<div class="empty">未找到今日运动安排</div>';

    // 经期阶段提示
    const periodCard = phase ? `
      <div class="workout-phase phase-${phase.phase}">
        <div class="workout-phase-head">🌙 周期第 ${phase.day} 天 · <strong>${phase.label}</strong> · 强度建议：${phase.intensity}</div>
        <div class="workout-phase-tip">${esc(phase.tip)}</div>
      </div>` : `
      <div class="note" style="margin-top:10px">在下方填写<strong>最近一次月经开始日期</strong>，工作台会自动根据周期阶段（月经期/卵泡期/排卵期/黄体期）调整每日运动强度建议。</div>`;

    // 周计划一览（训练日落在月经期时，自动标记为「经期·恢复」）
    const weekStart = Store.addDays(T(), -((new Date().getDay() + 6) % 7)); // 本周一
    const weekView = plan.map(p => {
      const pDate = Store.addDays(weekStart, (p.dow || 1) - 1);
      const pDay = cycleDayOf(pDate);
      const pRest = !!(p.trained && pDay && pDay <= 5); // 月经期内的训练日 → 自动恢复
      const isToday = pDate === T();
      const cls = (isToday ? ' today' : '') + (pRest ? ' period-rest' : (p.trained ? '' : ' rest'));
      return `<div class="wk-plan-day${cls}">
        <div class="wk-plan-dow">${['一','二','三','四','五','六','日'][p.dow - 1]}</div>
        <div class="grow"><div class="wk-plan-name">${esc(p.name)}</div><div class="wk-plan-focus">${esc(pRest ? '月经期 · 自动改为散步/八段锦/拉伸' : (p.focus || ''))}</div></div>
        ${p.trained ? `<span class="badge" style="background:${pRest ? 'var(--warn)' : 'var(--good)'};color:#fff">${pRest ? '经期·恢复' : '练'}</span>` : '<span class="badge">休</span>'}
      </div>`;
    }).join('');

    const periodForm = `
      <form data-form="save-period" class="row" style="align-items:flex-end;margin-top:8px">
        <div style="flex:2"><label>最近一次月经开始日期</label><input name="lastStart" type="date" value="${esc((w.period || {}).lastStart || '')}"></div>
        <button class="btn sm primary">保存</button>
      </form>`;

    return `
      ${todayCard}
      ${periodCard}
      <h3 style="margin:14px 0 8px">🗓 本周运动计划（一周 ${(body.daysPerWeek || 5)} 练 · 每天约 ${(body.minutesPerDay || 35)} 分钟）</h3>
      <div class="wk-plan-list">${weekView}</div>
      <div class="row" style="margin-top:10px;gap:8px;align-items:flex-end">
        <button class="btn sm" data-action="gen-workout-adjust">🤖 AI 按周期/完成度微调本周计划</button>
      </div>
      <div id="workoutAdjust" class="hidden" style="margin-top:10px"></div>
      ${w.adjust ? `<div class="ai-box" style="margin-top:8px"><strong>🤖 微调建议（${esc(w.adjust.date)}）</strong><div style="white-space:pre-wrap;margin-top:4px">${esc(w.adjust.text)}</div></div>` : ''}
      <div class="note" style="margin-top:10px">计划依据：${esc(body.height || '')}cm / ${esc(body.weight || '')}kg · 目标 ${esc((body.goals || []).join('、'))} · ${esc(body.limits || '')}。经期（${(w.period || {}).cycleDays || 28} 天周期）自动减量。</div>
      ${periodForm}`;
  }

  /* ============================================================
   * 自媒体 · 内容工作流
   * 素材池 → 选题库 → 内容日历 → 草稿/发布 → 数据反馈
   * ============================================================ */
  function renderMedia() {
    const s = S(); const pos = s.media.positioning;
    const ideas = s.media.ideas.slice().sort((a, b) => b.date.localeCompare(a.date));
    const gens = s.media.generated.slice().sort((a, b) => b.date.localeCompare(a.date));
    const mats = s.media.materials.slice().sort((a, b) => b.date.localeCompare(a.date));
    const topics = s.media.topics.slice().sort((a, b) => String(a.scheduledDate || a.createdAt || '').localeCompare(String(b.scheduledDate || b.createdAt || '')));
    const pubs = s.media.publishes.slice().sort((a, b) => b.date.localeCompare(a.date));

    const ideaList = ideas.length ? ideas.map(i => `
      <div class="item">
        <div class="grow"><div class="title">${esc(i.text)}</div><div class="sub">${cat(i.source)} · ${esc(i.date)} ${i.refUrl ? '· <a href="' + esc(i.refUrl) + '" target="_blank">参考</a>' : ''}</div></div>
        <div class="tools">
          <button class="btn sm" data-action="idea-to-material" data-id="${i.id}">→ 素材</button>
          <button class="icon-btn" data-action="del-idea" data-id="${i.id}">🗑</button>
        </div>
      </div>`).join('') : '<div class="empty">还没有灵感，刷到好想法先记下来</div>';

    const materialList = mats.length ? mats.map(m => `
      <div class="item">
        <div class="grow"><div class="title">${esc(m.text)}</div><div class="sub">${cat(m.source)} · ${esc(m.date)} ${m.refUrl ? '· <a href="' + esc(m.refUrl) + '" target="_blank">链接</a>' : ''} ${m.used ? '<span class="badge">已用</span>' : ''}</div></div>
        <div class="tools">
          <button class="btn sm ${m.used ? 'primary' : ''}" data-action="toggle-material" data-id="${m.id}">${m.used ? '已用' : '标记使用'}</button>
          <button class="icon-btn" data-action="del-material" data-id="${m.id}">🗑</button>
        </div>
      </div>`).join('') : '<div class="empty">素材池还空着。去「收藏清理」把有价值的收藏「转素材」，或把灵感「→ 素材」。</div>';

    const topicList = topics.length ? topics.map(tp => {
      const st = tp.status || '候选';
      const stCls = { '候选': '', '已排期': 'primary', '已发布': '', '放弃': 'danger' }[st] || '';
      return `
      <div class="item" style="flex-direction:column;align-items:stretch">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
          <div class="grow"><div class="title">${esc(tp.title)}${tp.angle ? `<span class="sub"> · ${esc(tp.angle)}</span>` : ''}</div>
          <div class="sub">${st === '已排期' ? '📅 排期：' + esc(tp.scheduledDate || '') : ''}${tp.note ? ' · ' + esc(tp.note) : ''}</div></div>
          <div class="tools">
            <button class="btn sm ${stCls}" data-action="topic-status" data-id="${tp.id}" title="切换状态：候选→已排期→已发布→放弃">${st}</button>
            <button class="btn sm primary" data-action="gen-draft" data-id="${tp.id}" title="AI 根据选题+素材+语录风格生成内容初稿">✍️ 生成初稿</button>
            <button class="btn sm" data-action="topic-publish" data-id="${tp.id}" title="发布后记入发布记录">🚀 发布</button>
            <button class="icon-btn" data-action="del-topic" data-id="${tp.id}">🗑</button>
          </div>
        </div>
        <div id="draftpanel-${tp.id}" class="hidden" style="margin-top:10px"></div>
      </div>`;
    }).join('') : '<div class="empty">还没有选题。从素材池挑一条，或直接用「一键生成」产出选题。</div>';

    const pubList = pubs.length ? pubs.map(p => {
      const st = p.stats || {};
      const total = (st.likes || 0) + (st.collects || 0) + (st.comments || 0) + (st.views ? Math.round(st.views / 10) : 0);
      return `
      <div class="item" style="flex-direction:column;align-items:stretch">
        <div style="display:flex;justify-content:space-between;gap:10px">
          <div class="grow"><div class="title">${esc(p.title)}</div><div class="sub">${cat(p.platform || '其他')} · ${esc(p.date)} ${p.link ? '· <a href="' + esc(p.link) + '" target="_blank">链接</a>' : ''}</div></div>
          <div class="tools"><button class="icon-btn" data-action="del-publish" data-id="${p.id}">🗑</button></div>
        </div>
        <div class="row" style="margin-top:8px;gap:8px;flex-wrap:wrap">
          ${[['likes', '👍 赞', st.likes], ['collects', '⭐ 藏', st.collects], ['comments', '💬 评', st.comments], ['views', '👀 看', st.views]].map(([k, lbl, v]) => `
            <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:var(--muted)">${lbl}<input type="number" min="0" value="${v || ''}" data-action="pub-stat" data-id="${p.id}" data-k="${k}" style="width:64px;padding:4px 6px;border:1px solid var(--border);border-radius:6px;background:var(--surface)"></label>`).join('')}
          ${p.note ? `<span class="sub" style="color:var(--muted);font-size:12px">📝 ${esc(p.note)}</span>` : ''}
        </div>
      </div>`;
    }).join('') : '<div class="empty">还没有发布记录。发布后点选题的「🚀 发布」登记，慢慢积累数据反馈。</div>';

    const genList = gens.length ? gens.map(g => `
      <div class="item" style="flex-direction:column;align-items:stretch">
        <div style="display:flex;justify-content:space-between"><div class="title">📌 ${esc(g.date)} 内容方向</div><button class="icon-btn" data-action="del-generated" data-id="${g.id}">🗑</button></div>
        <div class="ai-box" style="margin-top:6px">${esc(g.copy)}</div>
      </div>`).join('') : '<div class="empty">还没有生成内容方向</div>';

    const tab = ui.mediaTab || 'idea';
    const tabsBar = '<div class="media-tabs">' + [
      ['idea', '💡 收灵感'], ['material', '📦 攒素材'], ['topic', '🗂 定选题'], ['publish', '📈 看数据']
    ].map(t2 => '<button class="btn sm' + (tab === t2[0] ? ' primary' : '') + '" data-action="media-tab" data-f="' + t2[0] + '">' + t2[1] + '</button>').join('') + '</div>';

    // 定位：一行摘要常驻，点「编辑定位」展开小表单（不再单独占一大卡）
    const briefs = [];
    if (pos.direction) briefs.push('定位 ' + esc(pos.direction));
    if (pos.audience) briefs.push('受众 ' + esc(pos.audience));
    if ((pos.pillars || []).length) briefs.push('支柱 ' + esc((pos.pillars || []).join('、')));
    const posCard = `
    <div class="card" style="padding:12px 16px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="font-size:12.5px;color:var(--muted)">🎯 ${briefs.length ? briefs.join('　') : '还没设置定位 — 写清方向/受众后，AI 生成会更贴合你'}</span>
        <button class="btn sm" data-action="pos-toggle" style="margin-left:auto">${ui.posOpen ? '收起' : '✏️ 编辑定位'}</button>
      </div>
      ${ui.posOpen ? `<form data-form="save-positioning" style="margin-top:10px">
        <label>方向 / 定位</label><input name="direction" value="${esc(pos.direction)}" placeholder="如：用语文老师的视角拆解AI时代的学习与成长">
        <label>目标受众</label><input name="audience" value="${esc(pos.audience)}" placeholder="如：想自我提升的年轻职场人">
        <label>内容调性</label><input name="tone" value="${esc(pos.tone)}" placeholder="如：温暖、真诚、有干货">
        <label>内容支柱（逗号分隔）</label><input name="pillars" value="${esc((pos.pillars || []).join('，'))}" placeholder="如：学习方法，AI工具，成长思考">
        <button class="btn primary sm" style="margin-top:10px">保存定位</button>
      </form>` : ''}
    </div>`;

    const ideaCard = `
    <div class="card">
      <h2>💡 收灵感（${ideas.length}）</h2>
      <div class="note">刷到好想法随时记下来；同一主题积累够了点「→ 素材」转入素材池。首页快捷入口与这里同一个池子。</div>
      <form data-form="add-idea">
        <label>内容</label><input name="text" placeholder="一个想法 / 刷到的视频主题" required>
        <div class="row">
          <div><label>来源</label><select name="source"><option>自己想的</option><option>刷到的视频</option></select></div>
          <div><label>日期</label><input name="date" type="date" value="${T()}"></div>
        </div>
        <label>参考链接（可选）</label><input name="refUrl" placeholder="https://...">
        <button class="btn primary sm" style="margin-top:8px">+ 记录灵感</button>
      </form>
      ${ideaList}
    </div>`;

    const materialCard = `
    <div class="card">
      <h2>📦 攒素材（${mats.length}）</h2>
      <div class="note">内容的"弹药库"：收藏清理「转素材」、灵感「→ 素材」会自动汇入这里，也可手动添加。</div>
      <form data-form="add-material" class="row" style="align-items:flex-end;margin-top:6px">
        <div style="flex:3"><input name="text" placeholder="手动添加一条素材…"></div>
        <button class="btn sm primary">+ 添加</button>
      </form>
      <div class="row" style="margin-top:8px;gap:8px">
        <button class="btn sm" data-action="gen-topics">🤖 从素材自动生成选题</button>
      </div>
      <div id="topicsPanel" class="hidden" style="margin-top:10px"></div>
      ${materialList}
    </div>`;

    const topicCard = `
    <div class="card">
      <h2>🗂 定选题 · 内容日历（${topics.length}）</h2>
      <div class="note">选题按排期日期排序，即你的<strong>内容日历</strong>。状态循环：候选 → 已排期 → 已发布 → 放弃；排期后点「✍️ 生成初稿」直接产出内容。</div>
      <form data-form="add-topic" style="margin-top:6px">
        <div class="row">
          <div style="flex:2"><label>选题标题</label><input name="title" placeholder="如：AI时代，为什么语文思维更值钱"></div>
          <div><label>排期日期</label><input name="scheduledDate" type="date" value="${T()}"></div>
        </div>
        <label>切入点 / 备注（可选）</label><input name="angle" placeholder="核心观点、形式、配图想法…">
        <button class="btn sm primary" style="margin-top:6px">+ 加入选题</button>
      </form>
      ${topicList}
    </div>
    <div class="card">
      <h2>🚀 一键生成内容方向</h2>
      <div class="note">基于最近的感恩/复盘/打卡/收藏/语录/灵感/素材，结合定位挑最贴合的角度；未配置 API 时可复制提示词到任意 AI 工具。</div>
      <button class="btn primary" data-action="gen-content">✨ 基于今日输入生成</button>
      <div id="genPanel" class="hidden" style="margin-top:12px"></div>
      <h3 style="margin-top:14px">📌 已生成内容（${gens.length}）</h3>
      ${genList}
    </div>`;

    const publishCard = `
    <div class="card">
      <h2>📈 看数据 · 发布记录（${pubs.length}）</h2>
      <div class="note">发布后登记数据，慢慢看出<strong>哪类选题反馈最好</strong>。登记 3 条以上即可让 AI 解读。</div>
      ${pubs.length >= 3 ? '<button class="btn sm primary" data-action="publish-insight" style="margin-bottom:8px">📊 AI 数据解读</button><div id="publishInsightPanel" class="hidden" style="margin-bottom:8px"></div>' : ''}
      <form data-form="add-publish" style="margin-top:6px">
        <label>标题</label><input name="title" placeholder="发布的内容标题" required>
        <div class="row">
          <div><label>平台</label><select name="platform"><option>小红书</option><option>抖音</option><option>公众号</option><option>视频号</option><option>其他</option></select></div>
          <div><label>日期</label><input name="date" type="date" value="${T()}"></div>
        </div>
        <label>链接（可选）</label><input name="link" placeholder="https://...">
        <div class="row">
          <div><label>赞</label><input name="likes" type="number" min="0"></div>
          <div><label>藏</label><input name="collects" type="number" min="0"></div>
          <div><label>评</label><input name="comments" type="number" min="0"></div>
          <div><label>看</label><input name="views" type="number" min="0"></div>
        </div>
        <label>复盘备注（可选）</label><input name="note" placeholder="这次发布学到了什么？">
        <button class="btn sm primary" style="margin-top:6px">+ 记录发布</button>
      </form>
      ${pubList}
    </div>`;

    let body = '';
    if (tab === 'material') body = materialCard;
    else if (tab === 'topic') body = topicCard;
    else if (tab === 'publish') body = publishCard;
    else body = ideaCard;
    return tabsBar + posCard + body;
  }

  /* ============================================================
   * 设置
   * ============================================================ */
  /* ============================================================
   * 待办清单
   * ============================================================ */
  function renderTodos() {
    const s = S();
    const todos = Array.isArray(s.todos) ? s.todos : [];
    const filter = ui.todoFilter || 'all';
    const visible = todos.filter(t => filter === 'all' ? true : (filter === 'done' ? !!t.done : !t.done));
    const doneCount = todos.filter(t => t.done).length;
    const sel = f => 'data-action="todo-filter" data-f="' + f + '" class="btn sm ' + (filter === f ? 'primary' : '') + '"';
    const list = visible.length ? visible.map(t => `
      <div class="item ${t.done ? 'todo-done' : ''}">
        <input type="checkbox" class="todo-check" data-action="toggle-todo" data-id="${t.id}" ${t.done ? 'checked' : ''}>
        <span class="grow title" data-action="toggle-todo" data-id="${t.id}">${esc(t.text)}${t.note ? ' <span class="sub">· ' + esc(t.note) + '</span>' : ''}</span>
        <div class="tools"><button class="icon-btn" data-action="del-todo" data-id="${t.id}" title="删除">🗑</button></div>
      </div>`).join('') : '<div class="empty">📝 还没有待办，在上方加一条吧</div>';
    return `
    <div class="card">
      <h2>📝 待办清单 <span class="sub">已完成 ${doneCount} / 共 ${todos.length}</span></h2>
      <form data-form="add-todo" class="row" style="align-items:flex-end">
        <div style="flex:3;min-width:160px"><label>事项</label><input name="text" placeholder="今天要做什么？" required></div>
        <div style="flex:2;min-width:120px"><label>备注（可选）</label><input name="note" placeholder="补充说明"></div>
        <button class="btn primary sm" style="flex:0 0 auto">+ 添加</button>
      </form>
    </div>
    <div class="card">
      <div class="row" style="margin-bottom:12px">
        <button ${sel('all')}>全部 ${todos.length}</button>
        <button ${sel('active')}>未完成 ${todos.length - doneCount}</button>
        <button ${sel('done')}>已完成 ${doneCount}</button>
        ${doneCount ? '<button class="btn sm danger" data-action="clear-done-todos" style="margin-left:auto">清空已完成</button>' : ''}
      </div>
      ${list}
    </div>`;
  }

  /* ============================================================
   * 愿望清单：许愿池 → 已实现 / 已放下（长期项目池，不设期限）
   * ============================================================ */
  const WISH_CATS = ['想要的东西', '想去的地方', '想做的事', '想成为的样子'];
  function wishRows(list, actBtns) {
    if (!list.length) return '<div class="empty">（还没有）</div>';
    return list.map(w => {
      const mark = w.status === '已实现' ? '✅' : (w.status === '已放下' ? '🍃' : '⭐');
      const dateTxt = w.status === '许愿中' ? (w.date || '') + ' 许愿' : ((w.statusDate || w.date || '') + (w.status === '已实现' ? ' 实现' : ' 放下'));
      return `<div class="item">
        <div class="grow">
          <div class="title">${mark} ${esc(w.text)}</div>
          <div class="sub">${esc(w.category || '')}${w.category ? ' · ' : ''}${esc(dateTxt)}</div>
        </div>
        <div class="tools">${actBtns(w)}</div>
      </div>`;
    }).join('');
  }
  function renderWishlist() {
    const wl = (S().wishlist && Array.isArray(S().wishlist.items)) ? S().wishlist.items : [];
    const act = wl.filter(w => w.status === '许愿中');
    const done = wl.filter(w => w.status === '已实现');
    const drop = wl.filter(w => w.status === '已放下');
    const cats = WISH_CATS.map(c => `<option>${c}</option>`).join('');
    const actRows = wishRows(act, w => `
      <button class="btn sm" data-action="wish-done" data-id="${w.id}" title="实现了，标记一下">✅ 实现</button>
      <button class="btn sm" data-action="wish-drop" data-id="${w.id}" title="暂时放下，不再追">放下</button>
      <button class="icon-btn" data-action="del-wish" data-id="${w.id}" title="删除">🗑</button>`);
    const doneRows = wishRows(done, w => `
      <button class="btn sm" data-action="wish-thanks" data-id="${w.id}" title="写进感恩日记">🌿 记感恩</button>
      <button class="icon-btn" data-action="del-wish" data-id="${w.id}" title="删除">🗑</button>`);
    const dropRows = wishRows(drop, w => `
      <button class="btn sm" data-action="wish-reopen" data-id="${w.id}" title="其实还是想要">↩ 重新许愿</button>
      <button class="icon-btn" data-action="del-wish" data-id="${w.id}" title="删除">🗑</button>`);
    const noneAll = !act.length && !done.length && !drop.length;
    return `
    <div class="card">
      <h2>✨ 愿望清单 <span class="sub">${act.length} 个在路上 · 已实现 ${done.length} 个</span></h2>
      <div class="note">愿望不是任务，不设期限：许下了，慢慢靠近它；实现了，去感恩日记记一笔；放下了，也不丢人。</div>
      <form data-form="add-wish" class="row" style="align-items:flex-end;flex-wrap:wrap">
        <div style="flex:3;min-width:160px"><label>许个愿</label><input name="text" placeholder="想要的东西 / 想去的地方 / 想做成的事…" required></div>
        <div style="flex:1;min-width:120px"><label>分类</label><select name="category">${cats}</select></div>
        <div style="flex:0 0 auto"><button class="btn primary sm">⭐ 许愿</button></div>
      </form>
      ${noneAll ? '<div class="empty" style="padding:8px 0 0">还没有愿望。闭上眼睛想一想：最近心里痒痒、想要靠近的是什么？</div>' : ''}
    </div>
    ${act.length ? `<div class="card"><h2>⭐ 在路上（${act.length}）</h2>${actRows}</div>` : ''}
    ${done.length ? `<div class="card"><h2>🎉 已实现（${done.length}）</h2>${doneRows}</div>` : ''}
    ${drop.length ? `<div class="card"><h2>🍃 已放下（${drop.length}）</h2>${dropRows}</div>` : ''}`;
  }
  // 首页心愿卡：展示最新一个在路上的愿望；空态引导开跑
  function renderWishCard() {
    const wl = (S().wishlist && Array.isArray(S().wishlist.items)) ? S().wishlist.items : [];
    const act = wl.filter(w => w.status === '许愿中');
    const doneN = wl.filter(w => w.status === '已实现').length;
    if (!act.length) {
      return `<div class="card">
        <h2>✨ 心愿清单 ${doneN ? `<span class="sub">已实现 ${doneN} 个 🎉</span>` : ''}</h2>
        <div class="item">
          <div class="grow"><div class="title">还没许愿</div><div class="sub">心里想要、想去、想成为的事，值得被记下来</div></div>
          <button class="btn sm primary" data-action="nav" data-sec="wishlist">⭐ 许一个</button>
        </div>
      </div>`;
    }
    const w = act[0];
    return `<div class="card">
      <h2>✨ 心愿清单 <span class="sub">${doneN ? '已实现 ' + doneN + ' 个 · ' : ''}${act.length} 个在路上</span></h2>
      <div class="item">
        <div class="grow"><div class="title">${esc(w.text)}</div><div class="sub">${esc(w.category || '心愿')} · ${esc(w.date || '')} 许下</div></div>
        <button class="btn sm" data-action="nav" data-sec="wishlist">查看</button>
      </div>
    </div>`;
  }

  function renderSettings() {
    const s = S(); const st = s.settings;
    const av = st.avatar;
    const sc = (window.Sync ? Sync.getConfig() : { enabled: false, apiKey: '', binId: '', passphrase: '' });
    const syncBadge = sc.enabled
      ? '<span class="badge" style="background:var(--good);color:#fff">✓ 同步已开启</span>'
      : '<span class="badge" style="background:var(--surface-2);color:var(--muted)">未开启</span>';
    return `
    <div class="card">
      <h2>🖼 头像</h2>
      <div class="row" style="align-items:center;gap:14px">
        <div class="logo avatar-big" id="avatarPreview">${av ? `<img src="${av}" alt="头像">` : '🪴'}</div>
        <div>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <button class="btn sm primary" data-action="change-avatar">📷 更换头像</button>
            ${av ? '<button class="btn sm danger" data-action="remove-avatar">恢复默认</button>' : ''}
          </div>
          <div class="sub" style="color:var(--muted);margin-top:6px">支持 JPG / PNG，自动压缩到 128px 存储于本地。建议选一张治愈系图片 🌿</div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>⚙️ 通用</h2>
      <label>主题</label>
      <select data-change="theme-sel">
        <option value="light" ${st.theme === 'light' ? 'selected' : ''}>浅色</option>
        <option value="dark" ${st.theme === 'dark' ? 'selected' : ''}>深色</option>
      </select>
      <div class="row" style="margin-top:12px">
        <button class="btn" data-action="export">⬇ 导出备份（JSON）</button>
        <button class="btn" data-action="import">⬆ 从备份恢复</button>
        <button class="btn danger" data-action="reset">🗑 清空全部数据</button>
      </div>
      <div class="note" style="margin-top:12px;line-height:1.8">
        <strong>两份保障，互不替代：</strong><br>
        ⛅ <strong>云端同步</strong>（见下方「云端同步」区）：数据自动备份到你的私有 GitHub gist，换设备填「同步钥匙」即可恢复。<br>
        💾 <strong>本地导出</strong>：再存一份 JSON 在自己电脑/微信里，防云端与浏览器双重意外。<br>
        <span class="sub" style="color:var(--muted);font-size:12px">建议每 1–2 周点一次「⬇ 导出备份（JSON）」，存进微信收藏。</span>
      </div>
    </div>

    <div class="card">
      <h2>🤖 AI 配置（可选 · 已预置 DeepSeek）</h2>
      <div class="note">默认已填好 DeepSeek 接口，你只需要把 <strong>API Key</strong> 粘贴进来、点保存。可在下方一键<strong>测试连接</strong>验证 Key 和模型是否可用。留空也能用——会生成提示词让你复制到任意 AI 工具。</div>
      <div class="row" style="align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px">
        ${st.apiKey ? `<span class="badge" style="background:var(--good);color:#fff">✓ 已配置</span><span class="badge" style="background:var(--primary-soft);color:var(--primary)">${esc(st.apiBase.includes('deepseek') ? 'DeepSeek' : (st.apiBase || '').slice(8, 18))}</span><span class="badge">${esc(st.model)}</span>` : '<span class="badge" style="background:var(--surface-2);color:var(--muted)">未配置</span>'}
        <button class="btn sm primary" data-action="test-connection">🔌 测试连接</button>
        <button class="btn sm" data-action="toggle-api-config">${ui.apiConfigOpen ? '隐藏配置' : '显示原配置'}</button>
      </div>
      <div id="testConnResult" style="margin-top:10px"></div>
      <div id="apiConfigForm" style="margin-top:14px;${ui.apiConfigOpen ? '' : 'display:none'}">
        <form data-form="save-settings">
          <label>接口地址（OpenAI 兼容）</label><input name="apiBase" value="${esc(st.apiBase)}" placeholder="https://api.deepseek.com/v1/chat/completions">
          <label>API Key</label><input name="apiKey" type="password" value="${esc(st.apiKey)}" placeholder="sk-...">
          <label>模型</label><input name="model" value="${esc(st.model)}" placeholder="deepseek-chat">
          <button class="btn primary sm" style="margin-top:10px">保存配置</button>
        </form>
      </div>
    </div>

    <div class="card">
      <h2>☁️ 云端同步（手机 / 电脑共享） ${syncBadge}</h2>
      <div class="note" style="line-height:1.8">
        开启后数据自动存到云端，<strong>手机和电脑打开同一个部署网址</strong>即可同步编辑。两端需填写<strong>相同的 Token + 仓库 ID</strong>（若设了密码，两端密码也要一致）。<br>
        <strong>⚠️「同步密码」建议留空。</strong>gist 是私有的，只有拿着 Token 的人能读，不加密一样安全；而一旦设了密码又忘记，云端数据就再也打不开（2026-09 已因此出过一次事故）。真要加密，请务必把密码抄到备忘录里。
      </div>
      <label style="margin-top:10px">存储后端</label>
      <select id="syncProvider">
        <option value="github" ${sc.provider !== 'jsonbin' ? 'selected' : ''}>GitHub Gist（推荐 · 空间大 · 配额充足）</option>
        <option value="jsonbin" ${sc.provider === 'jsonbin' ? 'selected' : ''}>JSONBin.io（免费额度小，仅备选）</option>
      </select>
      <label style="margin-top:10px">GitHub Token（Personal Access Token，需勾 gist 权限）</label>
      <input type="password" id="syncApiKey" value="${esc(sc.apiKey)}" placeholder="ghp_...（完整 40 位；GitHub → Settings → Developer settings → Tokens）">
      <label style="margin-top:10px">同步密码（可选 · 建议留空）</label>
      <input type="password" id="syncPass" value="${esc(sc.passphrase)}" placeholder="建议留空；若填写，请务必抄下来存好——忘记=数据打不开">
      <label style="margin-top:10px">仓库 ID（可选 · 留空=新建；另一台设备填此 ID 可共用同一份数据）</label>
      <input type="text" id="syncBinId" value="${esc(sc.binId)}" placeholder="留空则新建云端仓库；填另一台设备的仓库 ID 即共用">
      <div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap">
        <button class="btn primary sm" data-action="sync-save">💾 保存并开启同步</button>
        <button class="btn sm" data-action="sync-now">🔄 立即拉取同步</button>
        ${sc.enabled ? '<button class="btn sm danger" data-action="sync-disable">关闭同步</button>' : ''}
      </div>
      <div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap">
        <button class="btn sm" data-action="sync-key-copy">🔑 复制同步钥匙</button>
        <button class="btn sm" data-action="sync-key-paste">🔓 粘贴同步钥匙（换网址/换设备用）</button>
      </div>
      <div class="sub" style="margin-top:6px;color:var(--muted)">换网址或换设备时：先点「复制同步钥匙」把那一串存进备忘录/网盘，新网址打开后点「粘贴同步钥匙」即可一步接上并恢复数据，不用再手填三个框。（钥匙内含 Token，等于你的账号凭证，请勿发给别人）</div>
      <div id="syncBinInfo" class="note" style="margin-top:10px">
        ${sc.binId
          ? '当前云端仓库 ID：<code>' + esc(sc.binId) + '</code> <button class="btn sm" data-action="sync-copy-bin">复制</button><br><span class="sub" style="color:var(--muted)">在另一台设备填相同的仓库 ID，即可共用同一份数据。</span>'
          : '尚未创建云端仓库——保存设置后，编辑任意内容会自动创建并上传。'}
      </div>
      <div id="syncStatus" class="sub" style="margin-top:8px;color:var(--muted)">${ui.syncStatusText || '同步未开始'}</div>
      <div class="sub" style="margin-top:8px;color:var(--muted)">📌 GitHub 免费拿 Token：GitHub → 头像 → Settings → Developer settings → Personal access tokens → Generate new token → 勾选 <strong>gist</strong>（想让它能建仓库再加 <strong>repo</strong>）→ 复制生成的 ghp_...。<br>⚠️ 完整长度是 <strong>40 位</strong>（ghp_ 后面跟 36 个字符）。如果只有二十来位，就是没复制全。</div>
    </div>

    <div class="card">
      <h2>🔒 隐私说明</h2>
      <div class="sub" style="color:var(--muted);line-height:1.8">
        本工作台是纯本地应用，所有日记、复盘、收藏都不会上传到任何服务器。<br>
        只有在你主动点击「AI 分析 / 生成」时，相关数据才会按你看到的提示词发送到你配置的 AI 接口。<br>
        建议：不要在提示词里写入极度私密的信息；定期导出备份以防换设备丢失。
      </div>
    </div>`;
  }

  /* ============================================================
   * AI 面板（复用）
   * ============================================================ */
  function mountAIPanel(container, prompt, onSave, saveLabel) {
    const hasKey = !!S().settings.apiKey;
    container.classList.remove('hidden');
    container.innerHTML = `
      <div class="note">${hasKey ? '已配置 API，可一键分析；也可复制提示词到其它工具。' : '未配置 API：复制下方提示词到 ChatGPT / Claude 等工具，再把回复粘贴回来保存。'}</div>
      <div class="row" style="align-items:flex-end">
        ${hasKey ? '<button class="btn primary sm" data-ai="call">✨ 一键分析</button>' : ''}
        <button class="btn sm" data-ai="copy">📋 复制提示词</button>
      </div>
      <details style="margin-top:10px"><summary style="cursor:pointer;color:var(--muted)">查看 / 编辑提示词</summary>
        <textarea class="prompt-box" data-role="prompt" style="margin-top:8px">${esc(prompt)}</textarea>
      </details>
      <div data-role="result" class="hidden" style="margin-top:12px">
        <label>AI 回复（可编辑后保存）</label>
        <textarea class="prompt-box" data-role="reply" style="min-height:170px"></textarea>
        <button class="btn primary sm" data-ai="save" style="margin-top:8px">${saveLabel || '保存'}</button>
      </div>`;
    container.querySelector('[data-ai="copy"]').onclick = function() { copyText(container.querySelector('[data-role="prompt"]').value); };
    var callBtn = container.querySelector('[data-ai="call"]');
    var replyArea = container.querySelector('[data-role="reply"]');
    var resultDiv = container.querySelector('[data-role="result"]');

    var doStreamCall = function(promptText) {
      if (!callBtn) return;
      callBtn.disabled = true; callBtn.textContent = '▌生成中…';
      resultDiv.classList.remove('hidden');
      replyArea.value = '';
      var settings = S().settings;
      AI.callAIStream(promptText, settings, function(delta, fullText) {
        replyArea.value = fullText;
        replyArea.scrollTop = replyArea.scrollHeight;
      }).then(function(fullText) {
        callBtn.disabled = false; callBtn.textContent = '✨ 重新生成';
        replyArea.focus();
      }).catch(function(e) {
        callBtn.disabled = false; callBtn.textContent = '✨ 一键生成';
        resultDiv.classList.remove('hidden');
        replyArea.value = '生成失败：' + (e.message || '') + '\n你可以复制上方提示词手动使用。';
      });
    };

    if (callBtn) callBtn.onclick = function() {
      doStreamCall(container.querySelector('[data-role="prompt"]').value);
    };

    container.querySelector('[data-ai="save"]').onclick = function() {
      var txt = replyArea.value;
      if (!txt.trim()) { alert('请先获取或粘贴 AI 回复'); return; }
      onSave(txt);
    };
    container.scrollIntoView({ behavior: 'smooth' });
  }

  /* ---------- 复盘教练对话面板 ---------- */
  function appendCoachMsg(list, role, text, loading) {
    var cls = loading ? 'coach-msg assistant loading' : 'coach-msg ' + role;
    var div = document.createElement('div');
    div.className = cls;
    div.innerHTML = '<div class="coach-bubble">' + esc(text) + '</div>';
    list.appendChild(div);
    list.scrollTop = list.scrollHeight;
    return div; // 返回节点，供流式更新使用
  }
  // 流式更新教练消息气泡
  function updateCoachMsg(div, text, done) {
    div.querySelector('.coach-bubble').textContent = text;
    if (done) { div.classList.remove('loading'); }
    var list = div.parentNode;
    if (list) list.scrollTop = list.scrollHeight;
  }
  // 教练流式调用
  function coachStream(list, messages, onDone) {
    var bubble = appendCoachMsg(list, 'assistant', '思考中…', true);
    var settings = S().settings;
    AI.callAIStream(messages, settings, function(delta, fullText) {
      updateCoachMsg(bubble, fullText, false);
    }).then(function(fullText) {
      updateCoachMsg(bubble, fullText || '（未收到回复）', true);
      if (onDone) onDone(fullText);
    }).catch(function(e) {
      updateCoachMsg(bubble, '抱歉，连接失败：' + (e.message || ''), true);
      if (onDone) onDone('');
    });
  }

  function mountCoachPanel(container, problemId, prob, entry, recentReviews) {
    var sid = 'coach_' + problemId;
    var session = ui.coachSessions[sid];
    var existing = session && session.messages && session.messages.length > 1;

    container.classList.remove('hidden');
    container.innerHTML = '<div class="coach-chat">' +
      '<div class="coach-header"><span>🤖 复盘教练 · 深度对话</span><button class="icon-btn" data-action="close-coach" data-sid="' + sid + '" style="float:right">✕</button></div>' +
      '<div class="coach-messages" id="coach-msgs-' + sid + '"></div>' +
      '<div class="coach-input-row"><input id="coach-input-' + sid + '" placeholder="输入你的想法，教练会追问…" data-sid="' + sid + '"><button class="btn sm primary" data-action="coach-send" data-sid="' + sid + '">发送</button></div>' +
      '</div>';

    var list = $('#coach-msgs-' + sid);
    var input = $('#coach-input-' + sid);

    // 回车发送
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('[data-action="coach-send"][data-sid="' + sid + '"]').click(); }
    });

    if (existing) {
      // 恢复已有对话
      session.messages.forEach(function(m) {
        if (m.role !== 'system') appendCoachMsg(list, m.role, m.content);
      });
      list.scrollTop = list.scrollHeight;
      return;
    }

    // 新对话：发送首轮
    if (!session) {
      var sysPrompt = AI.buildCoachSystemPrompt(prob.text, recentReviews);
      session = { messages: [{ role: 'system', content: sysPrompt }, { role: 'user', content: '请帮我分析这个问题：' + prob.text }], problemId: problemId };
      ui.coachSessions[sid] = session;
    }

    // 首轮流式分析
    coachStream(list, session.messages, function(reply) {
      if (reply) {
        session.messages.push({ role: 'assistant', content: reply });
        prob.analysis = reply; prob.status = prob.status || '改善中'; Store.save();
      }
    });
  }

  /* ---------- 智能导入预览面板 ---------- */
  function mountImportPreview(organizedText) {
    var preview = $('#importPreview');
    if (!preview) return; // 批量导入卡片已从设置页移除，此面板不存在
    preview.classList.remove('hidden');
    // 解析分类
    var sections = {};
    var curSection = null;
    var lines = organizedText.split('\n');
    lines.forEach(function(line) {
      var m = line.match(/^#(\S+)\s*(.*)$/);
      if (m) {
        var tag = m[1], rest = m[2].trim();
        if (tag === '语录') curSection = 'quotes';
        else if (tag === '灵感') curSection = 'ideas';
        else if (tag.startsWith('收藏')) curSection = 'favs';
        else if (tag === '感恩') curSection = 'gratitude';
        else if (tag === '复盘') curSection = 'reviews';
        else if (tag === '素材') curSection = 'materials';
      } else if (curSection && line.trim()) {
        sections[curSection] = sections[curSection] || [];
        sections[curSection].push(line.trim());
      }
    });
    var total = 0;
    var secNames = { quotes: '📝 语录', ideas: '💡 灵感', favs: '🧹 收藏', gratitude: '🌿 感恩', reviews: '🪞 复盘', materials: '📦 素材' };
    var html = '<div class="import-preview">';
    html += '<div class="import-preview-head"><strong>预览分类结果</strong><span class="sub" style="margin-left:8px;color:var(--muted)">检查无误后确认导入，可删除不想导入的条目</span></div>';
    Object.keys(sections).forEach(function(sec) {
      var items = sections[sec];
      total += items.length;
      html += '<div class="import-sec"><div class="import-sec-head">' + (secNames[sec] || sec) + '（' + items.length + ' 条）</div>';
      items.forEach(function(item, i) {
        html += '<div class="import-item"><span class="import-item-text">' + esc(item) + '</span><button class="icon-btn sm" data-action="del-import-item" data-sec="' + sec + '" data-i="' + i + '">✕</button></div>';
      });
      html += '</div>';
    });
    if (total === 0) html += '<div class="empty">AI 没有识别出可导入的内容，请检查文本或试试手动词法导入</div>';
    else html += '<div class="row" style="margin-top:12px;gap:8px"><button class="btn primary" data-action="confirm-import">✅ 确认导入全部（' + total + ' 条）</button><button class="btn sm" data-action="cancel-import-preview">取消</button></div>';
    html += '</div>';
    preview.innerHTML = html;
    preview.scrollIntoView({ behavior: 'smooth' });
    // 挂载数据到 preview 节点，供后续 handler 使用
    preview._importSections = sections;
  }

  function buildRecentInputs() {
    const s = S(); const t = T();
    const out = [];
    const since = Store.addDays(t, -7);
    s.gratitude.entries.filter(e => e.date >= since).forEach(e => e.items.forEach(it => out.push({ date: e.date, kind: '感恩', text: it })));
    s.reviews.entries.filter(e => e.date >= since).forEach(e => {
      out.push({ date: e.date, kind: '复盘', text: e.content || '' });
      (e.problems || []).forEach(p => out.push({ date: e.date, kind: '问题', text: p.text }));
    });
    s.favorites.items.filter(i => i.date >= since).forEach(i => out.push({ date: i.date, kind: '收藏·' + i.category, text: i.content || '' }));
    s.quotes.filter(q => q.date >= since).forEach(q => out.push({ date: q.date, kind: '语录·' + q.platform, text: q.content }));
    s.media.materials.filter(m => m.date >= since).forEach(m => out.push({ date: m.date, kind: '素材', text: m.text }));
    const rec = s.habits.records[t] || {};
    const doneToday = s.habits.definitions.filter(d => habitState(rec, d.id).s === 'done').map(d => d.name);
    if (doneToday.length) out.push({ date: t, kind: '打卡', text: '今日完成：' + doneToday.join('、') });
    return out;
  }

  // 批量导入解析：带 #版块 标记的多行文本 → 写入各版块（追加，不覆盖）
  // 时间戳写法：#语录 [2026-08-03 14:30]  → 该版块后续内容用这个时间；行首单独 [时间戳] 表示这一条
  function runBatchImport(text) {
    const s = S();
    const lines = String(text || '').split('\n').map(l => l.trim());
    const result = { 语录: 0, 灵感: 0, 收藏: 0, 感恩: 0, 复盘: 0, 素材: 0 };
    let section = null;
    let sectionStamp = '';
    let pendingGratitude = null;
    const stampRe = /^\[(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?)\]\s*(.*)$/;

    const toStamp = (raw) => {
      if (!raw) return '';
      const t = raw.replace(' ', 'T');
      const d = new Date(t);
      if (isNaN(d.getTime())) return '';
      return d.getFullYear() + '-' + Store.pad(d.getMonth() + 1) + '-' + Store.pad(d.getDate()) + ' ' + Store.pad(d.getHours()) + ':' + Store.pad(d.getMinutes());
    };

    const flushGratitude = () => {
      if (pendingGratitude && pendingGratitude.items.length) {
        s.gratitude.entries.unshift({ id: Store.uid(), date: pendingGratitude.date, createdAt: pendingGratitude.stamp || fmtStamp(), items: pendingGratitude.items, mood: '' });
        result.感恩++;
      }
      pendingGratitude = null;
    };

    lines.forEach(line => {
      if (!line) return;
      // 版块标记：#语录 [时间戳] 或 #语录 或 #收藏 AI 等
      if (line.startsWith('#')) {
        flushGratitude();
        const m = line.match(/^#(\S+)\s*(.*)$/);
        if (m) {
          const tag = m[1];
          const rest = m[2].trim();
          const sm = rest.match(stampRe);
          if (sm) sectionStamp = toStamp(sm[1]);
          else sectionStamp = '';
          const restNoStamp = rest.replace(stampRe, '').trim();
          if (tag === '语录') section = 'quotes';
          else if (tag === '灵感') section = 'ideas';
          else if (tag === '收藏') section = 'favs' + (restNoStamp ? '|' + restNoStamp : '');
          else if (tag === '感恩') section = 'gratitude';
          else if (tag === '复盘') section = 'reviews';
          else if (tag === '素材') section = 'materials';
          else section = tag;
        }
        return;
      }
      if (!section) return;
      // 行内时间戳 [YYYY-MM-DD HH:MM] 表示这一条的时间
      const inline = line.match(stampRe);
      const lineStamp = inline ? toStamp(inline[1]) : '';
      const text = inline ? inline[2] : line;
      const stamp = lineStamp || sectionStamp || fmtStamp();
      const date = stamp.slice(0, 10);
      if (section === 'quotes') {
        s.quotes.unshift({ id: Store.uid(), content: text, platform: '小红书', sourceUrl: '', date, createdAt: stamp, note: '', pinned: false });
        result.语录++;
      } else if (section === 'ideas') {
        s.media.ideas.unshift({ id: Store.uid(), date, createdAt: stamp, text, source: '批量导入', refUrl: '', used: false });
        result.灵感++;
      } else if (section.startsWith('favs')) {
        const category = section.split('|')[1] || '其它';
        s.favorites.items.unshift({ id: Store.uid(), date, createdAt: stamp, channel: '小红书', category, content: text, url: '', cleared: false });
        result.收藏++;
      } else if (section === 'gratitude') {
        if (!pendingGratitude) pendingGratitude = { date, stamp, items: [] };
        pendingGratitude.items.push(text.replace(/^\d+[.、)]\s*/, ''));
      } else if (section === 'reviews') {
        s.reviews.entries.unshift({ id: Store.uid(), date, createdAt: stamp, content: text, problems: [] });
        result.复盘++;
      } else if (section === 'materials') {
        s.media.materials.unshift({ id: Store.uid(), date, createdAt: stamp, text, source: '批量导入', refUrl: '', used: false });
        result.素材++;
      }
    });
    flushGratitude();
    Store.save();
    return result;
  }

  /* ---------- 从 flomo 导出的 HTML 文件直接导入 ---------- */
  // 返回 { ok, counts, error }；counts = { 语录, 灵感, 收藏, 感恩, 复盘, 素材, skipped }
  function runFlomoImport(htmlText) {
    const s = S();
    if (!htmlText) return { ok: false, error: '文件为空' };
    let doc;
    try { doc = new DOMParser().parseFromString(htmlText, 'text/html'); }
    catch (e) { return { ok: false, error: 'HTML 解析失败：' + e.message }; }
    // 宽松匹配 flomo 常见结构：.memo / [data-slug] / .note / .flomo-memo / .memolist>li / article
    const memos = Array.from(doc.querySelectorAll('.memo, .flomo-memo, .note, li[data-id], [data-slug], .memolist > *, article.memo'));
    // 若上述都没匹配到，退而求其次：把所有 li/article 当候选
    let source = memos;
    if (!source.length) {
      const fallback = doc.querySelectorAll('li, article');
      if (fallback.length) {
        source = Array.from(fallback).filter(el => {
          const t = (el.textContent || '').trim();
          return t.length > 4 && t.length < 3000;
        }).slice(0, 500);
      }
    }
    if (!source.length) {
      // 诊断：告诉用户文件里实际有什么，便于排查
      const hasMemo = /class="[^"]*memo/i.test(htmlText);
      const hasSlug = /data-slug/i.test(htmlText);
      const liCount = (htmlText.match(/<li/g) || []).length;
      const artCount = (htmlText.match(/<article/g) || []).length;
      return { ok: false, error: '没找到任何笔记记录。诊断：文件是否包含 memo 标记=' + hasMemo + '，data-slug=' + hasSlug + '，<li>数量=' + liCount + '，<article>数量=' + artCount + '。请确认选的是 flomo 网页版导出的 HTML 文件（不是 file 文件夹）。' };
    }

    const counts = { 语录: 0, 灵感: 0, 收藏: 0, 感恩: 0, 复盘: 0, 素材: 0, skipped: 0 };
    const now = fmtStamp();

    // 标签关键词 → 版块映射
    const classify = (tags) => {
      const t = tags.join(' ').toLowerCase();
      if (/语录|金句|quote|sentence|好句|美句|摘录|句子|power|inspiration|quotes|quote/.test(t)) return { section: 'quotes', cat: '其它' };
      const catMatch = (t.match(/ai|人工智能|产品|读书|心理|历史|经济|哲学|健身|运动|好物|科技|学习/) || [])[0];
      const catMap = { 'ai': 'AI', '人工智能': 'AI', '读书': '其它', '学习': '其它' };
      if (/收藏|资源|教程|文章|工具|干货|分享|链接|推荐|网站|app|书/.test(t)) {
        return { section: 'favs', cat: catMatch ? (catMap[catMatch] || catMatch.toUpperCase()) : '其它' };
      }
      if (/感恩|谢|gratitude|感谢|暖心/.test(t)) return { section: 'gratitude' };
      if (/复盘|反思|总结|review|日记|回顾/.test(t)) return { section: 'reviews' };
      if (/素材|文案|草稿|选题/.test(t)) return { section: 'materials' };
      return { section: 'ideas' };
    };

    // 4. 归类收集（先收集到临时数组，最后一次性合并，避免大量 unshift 阻塞主线程）
    const batches = { quotes: [], ideas: [], favs: [], gratitude: [], reviews: [], materials: [] };
    source.forEach(m => {
      // 1. 时间戳：flomo 格式 "2026-04-14 16:41:04"（.time 纯文本）
      let stamp = '';
      const timeEl = m.querySelector('.time');
      if (timeEl) {
        const raw = (timeEl.textContent || '').trim();
        const d = new Date(raw.replace(' ', 'T'));
        if (!isNaN(d.getTime())) stamp = d.getFullYear() + '-' + Store.pad(d.getMonth() + 1) + '-' + Store.pad(d.getDate()) + ' ' + Store.pad(d.getHours()) + ':' + Store.pad(d.getMinutes());
      }
      if (!stamp) stamp = now;

      // 2. 标签 + 内容段：flomo 结构是 <p>#Tag1</p><p>#Tag2</p><p>内容...</p>
      //    标签段是"整段只有 #开头的词"或纯 # 标签文本；其余段落视为内容
      const contentEl = m.querySelector('.content');
      const tags = [];
      const contentPs = [];
      if (contentEl) {
        const ps = contentEl.querySelectorAll('p');
        ps.forEach(p => {
          const t = (p.textContent || '').replace(/\s+/g, ' ').trim();
          if (!t) return;
          // 整段是标签：纯 #tag 形式（可能多个，空格分隔）
          const tagOnly = t.split(/\s+/).every(w => /^#[^\s#]+$/.test(w));
          if (tagOnly) {
            t.split(/\s+/).forEach(w => {
              const cleaned = w.replace(/^[#\s]+/, '').trim();
              if (cleaned) tags.push(cleaned);
            });
          } else {
            // 段落里也可能有 #标签（比如正文里夹了 #AI 标记），剥离出来
            const inlineTagRe = /#([A-Za-z0-9·\u4e00-\u9fa5_\-]+)/g;
            let m2;
            while ((m2 = inlineTagRe.exec(t)) !== null) {
              if (m2[1].length > 1) tags.push(m2[1]);
            }
            contentPs.push(t);
          }
        });
      }
      const text = contentPs.join('\n').replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      if (!text) { counts.skipped++; return; }

      // 3. 归类
      const { section, cat } = classify(tags);
      const date = stamp.slice(0, 10);

      if (section === 'quotes') {
        batches.quotes.push({ id: Store.uid(), content: text, platform: 'flomo', sourceUrl: '', date, createdAt: stamp, note: tags.length ? tags.join(' ') : '', pinned: false });
        counts.语录++;
      } else if (section === 'ideas') {
        batches.ideas.push({ id: Store.uid(), date, createdAt: stamp, text, source: 'flomo', refUrl: '', used: false });
        counts.灵感++;
      } else if (section === 'favs') {
        batches.favs.push({ id: Store.uid(), date, createdAt: stamp, channel: 'flomo', category: cat || '其它', content: text, url: '', cleared: false });
        counts.收藏++;
      } else if (section === 'gratitude') {
        batches.gratitude.push({ id: Store.uid(), date, createdAt: stamp, items: [text], mood: '' });
        counts.感恩++;
      } else if (section === 'reviews') {
        batches.reviews.push({ id: Store.uid(), date, createdAt: stamp, content: text, problems: [] });
        counts.复盘++;
      } else if (section === 'materials') {
        batches.materials.push({ id: Store.uid(), date, createdAt: stamp, text, source: 'flomo', refUrl: '', used: false });
        counts.素材++;
      }
    });
    // 一次性合并（新记录放最前）
    if (batches.quotes.length) s.quotes = batches.quotes.concat(s.quotes);
    if (batches.ideas.length) s.media.ideas = batches.ideas.concat(s.media.ideas);
    if (batches.favs.length) s.favorites.items = batches.favs.concat(s.favorites.items);
    if (batches.gratitude.length) s.gratitude.entries = batches.gratitude.concat(s.gratitude.entries);
    if (batches.reviews.length) s.reviews.entries = batches.reviews.concat(s.reviews.entries);
    if (batches.materials.length) s.media.materials = batches.materials.concat(s.media.materials);
    Store.save();
    return { ok: true, counts };
  }

  /* ============================================================
   * 事件处理
   * ============================================================ */
  function handleAction(a, id, el, e) {
    if (a === 'undo-last') { applyUndo(); return; }
    const s = S();
    switch (a) {
      case 'toggle-todo': { const td = (s.todos || []).find(x => x.id === id); if (td) { td.done = !td.done; Store.save(); render(); } break; }
      case 'del-todo': { const arrT = (s.todos || []); const iT = arrT.findIndex(x => x.id === id); if (iT >= 0) undoDelete(arrT, iT, arrT.splice(iT, 1)[0], '待办'); Store.save(); render(); break; }
      case 'wish-done': {
        const w = s.wishlist && s.wishlist.items && s.wishlist.items.find(x => x.id === id);
        if (w && w.status === '许愿中') { w.status = '已实现'; w.statusDate = T(); Store.save(); render(); toast('🎉 愿望实现！去「感恩日记」记一笔，把美好留住 🌿'); }
        break;
      }
      case 'wish-thanks': { go('gratitude'); toast('在感恩日记里记下这一刻吧 🌿'); break; }
      case 'wish-drop': {
        const w2 = s.wishlist && s.wishlist.items && s.wishlist.items.find(x => x.id === id);
        if (w2 && w2.status === '许愿中') { w2.status = '已放下'; w2.statusDate = T(); Store.save(); render(); toast('已放下这个愿望 🍃'); }
        break;
      }
      case 'wish-reopen': {
        const w3 = s.wishlist && s.wishlist.items && s.wishlist.items.find(x => x.id === id);
        if (w3 && w3.status !== '许愿中') { w3.status = '许愿中'; w3.statusDate = ''; Store.save(); render(); toast('重新许愿，继续靠近它 ⭐'); }
        break;
      }
      case 'del-wish': {
        const wl = (s.wishlist && Array.isArray(s.wishlist.items)) ? s.wishlist.items : [];
        const iW = wl.findIndex(x => x.id === id); if (iW >= 0) undoDelete(wl, iW, wl.splice(iW, 1)[0], '愿望'); Store.save(); render(); break;
      }
      case 'journal-edit': {
        const j = s.journals && s.journals.entries && s.journals.entries.find(x => x.id === id);
        if (j) {
          ui.journalEdit = { date: j.date, content: j.content || '', mood: j.mood || '' };
          ui.reviewTab = 'journal'; render();
          setTimeout(() => { const c = $('#journalFormCard'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80);
        }
        break;
      }
      case 'journal-cancel': { ui.journalEdit = null; render(); break; }
      case 'del-journal': {
        const jl = (s.journals && Array.isArray(s.journals.entries)) ? s.journals.entries : [];
        const iJ = jl.findIndex(x => x.id === id); if (iJ >= 0) undoDelete(jl, iJ, jl.splice(iJ, 1)[0], '随笔'); Store.save(); render(); break;
      }
      case 'todo-filter': { ui.todoFilter = el.dataset.f; render(); break; }
      case 'clear-done-todos': { s.todos = (s.todos || []).filter(x => !x.done); Store.save(); render(); toast('已清空已完成'); break; }
      case 'nav': go(id); break;
      case 'go-review': { ui.reviewTab = 'list'; go('review'); break; }
      case 'go-journal': { ui.reviewTab = 'journal'; go('review'); break; }
      case 'reload': { location.reload(); break; }
      case 'toggle-api-config': { ui.apiConfigOpen = !ui.apiConfigOpen; render(); break; }
      case 'test-connection': {
        const st = S().settings;
        if (!st.apiKey) { alert('请先填入 API Key 并保存配置（点「显示原配置」展开表单）'); break; }
        const panel = $('#testConnResult');
        const btn = el; const old = btn.textContent; btn.disabled = true; btn.textContent = '🔌 测试中…';
        panel.innerHTML = '<div class="note">正在连接 ' + esc(st.apiBase) + ' · 模型 ' + esc(st.model) + ' …</div>';
        const t0 = Date.now();
        const prompt = '请只回"pong"两个字，不要其他内容。';
        AI.callAI(prompt, st, 15000).then(txt => {
          const ms = Date.now() - t0;
          const ok = (txt || '').trim().length > 0;
          panel.innerHTML = '<div style="border:1px solid var(--good);border-radius:8px;padding:10px;background:rgba(34,197,94,0.08);margin-top:6px">' +
            '<div style="font-weight:500;color:var(--good)">✓ 连接成功 · 耗时 ' + ms + ' ms</div>' +
            '<div class="sub" style="color:var(--muted);margin-top:4px;font-size:12px">接口：' + esc(st.apiBase) + '<br>模型：' + esc(st.model) + '<br>回复：' + esc(txt.trim().slice(0, 60)) + '</div></div>';
          toast('✅ 连接成功（' + ms + 'ms）');
        }).catch(err => {
          const ms = Date.now() - t0;
          let tip = '';
          const msg = err.message || String(err);
          if (/401|Unauthorized/i.test(msg)) tip = 'Key 无效或已过期，请到 DeepSeek 平台重新生成';
          else if (/403|Forbidden/i.test(msg)) tip = 'Key 没有访问该模型的权限';
          else if (/404/i.test(msg)) tip = '模型名称错误或接口地址错误，请检查 apiBase 与 model';
          else if (/Failed to fetch|NetworkError|abort/i.test(msg)) tip = '网络问题或浏览器拦截（file:// 协议可能受限），建议把工作台部署到 HTTPS 后测试';
          else if (/timeout|abort/i.test(msg)) tip = '连接超时，请检查网络或 API 地址是否可达';
          panel.innerHTML = '<div style="border:1px solid var(--danger);border-radius:8px;padding:10px;background:rgba(239,68,68,0.08);margin-top:6px">' +
            '<div style="font-weight:500;color:var(--danger)">✗ 连接失败 · 耗时 ' + ms + ' ms</div>' +
            '<div class="sub" style="color:var(--muted);margin-top:4px;font-size:12px;white-space:pre-wrap">' + esc(msg) + (tip ? '\n\n💡 建议：' + esc(tip) : '') + '</div></div>';
          toast('❌ 连接失败：' + msg.slice(0, 50));
        }).finally(() => { btn.disabled = false; btn.textContent = old; });
        break;
      }
      case 'ai-organize': {
        if (!s.settings.apiKey) { alert('请先在设置页配置 DeepSeek API Key'); break; }
        const ta = $('#batchImportText');
        if (!ta || !ta.value.trim()) { toast('请先粘贴原始内容'); break; }
        const btn = el; const old = btn.textContent; btn.disabled = true; btn.textContent = 'AI 整理中…';
        const prompt = AI.buildOrganizePrompt(ta.value);
        AI.callAI(prompt, s.settings).then(txt => {
          ta.value = txt.trim();
          toast('✅ 已整理为导入格式，请检查后点「开始导入」');
          ta.scrollIntoView({ behavior: 'smooth' });
        }).catch(err => alert('AI 整理失败：' + err.message)).finally(() => { btn.disabled = false; btn.textContent = old; });
        break;
      }
      case 'smart-import': {
        if (!s.settings.apiKey) { alert('请先在设置页配置 DeepSeek API Key'); break; }
        const ta2 = $('#batchImportText');
        if (!ta2 || !ta2.value.trim()) { toast('请先粘贴内容'); break; }
        const btn2 = el; const old2 = btn2.textContent; btn2.disabled = true; btn2.textContent = 'AI 识别分类中…';
        const prompt2 = AI.buildOrganizePrompt(ta2.value);
        AI.callAI(prompt2, s.settings).then(organized => {
          ta2.value = organized.trim();
          mountImportPreview(organized.trim());
          btn2.disabled = false; btn2.textContent = old2;
        }).catch(err => {
          alert('AI 整理失败：' + err.message + '\n请改用「手动词法导入」或检查 API 配置');
          btn2.disabled = false; btn2.textContent = old2;
        });
        break;
      }
      case 'gen-topics': {
        if (!s.settings.apiKey) { alert('请先在设置页配置 DeepSeek API Key'); break; }
        const panel = $('#topicsPanel');
        if (!panel.classList.contains('hidden') && panel.dataset.mounted === '1') { panel.classList.add('hidden'); break; }
        const prompt = AI.buildTopicsPrompt(s.media.materials, s.media.positioning);
        mountAIPanel(panel, prompt, (txt) => {
          const lines = txt.split('\n').map(l => l.trim()).filter(l => l && l.includes('｜'));
          let added = 0;
          lines.forEach(l => {
            const [title, angle] = l.split('｜');
            if (!title) return;
            s.media.topics.push({ id: Store.uid(), title: title.replace(/^[-•\d.\s]+/, ''), angle: (angle || '').trim(), status: '候选', scheduledDate: '', note: '', createdAt: T() });
            added++;
          });
          Store.save(); render(); toast('✅ 已生成 ' + added + ' 个选题到选题库');
        }, '保存为选题');
        panel.dataset.mounted = '1';
        break;
      }
      case 'gen-kg': {
        if (!s.settings.apiKey) { alert('请先在设置页配置 DeepSeek API Key'); break; }
        var kgPanel = $('#kgPanel');
        if (!kgPanel) break;
        kgPanel.classList.remove('hidden');
        kgPanel.innerHTML = '<div class="ai-box" style="white-space:pre-wrap;line-height:1.7;min-height:40px"><span class="sub" style="color:var(--muted)">▌AI 正在扫描全部数据，寻找隐藏关联…</span></div>';
        kgPanel.scrollIntoView({ behavior: 'smooth' });
        var kgPrompt = AI.buildKnowledgeGraphPrompt(s);
        var kgBox = kgPanel.querySelector('.ai-box');
        AI.callAIStream(kgPrompt, s.settings, function(delta, fullText) {
          if (kgBox) kgBox.textContent = fullText;
        }).catch(function(err) {
          if (kgBox) kgBox.innerHTML = '<span style="color:var(--danger)">生成失败：' + esc(err.message || '') + '</span>';
        });
        break;
      }
      case 'gen-yearly': {
        if (!s.settings.apiKey) { alert('请先在设置页配置 DeepSeek API Key'); break; }
        var yrPanel = $('#yearlyPanel');
        if (!yrPanel) break;
        yrPanel.classList.remove('hidden');
        yrPanel.innerHTML = '<div class="ai-box" style="white-space:pre-wrap;line-height:1.7;min-height:40px"><span class="sub" style="color:var(--muted)">▌AI 正在生成年度回顾报告…</span></div>';
        yrPanel.scrollIntoView({ behavior: 'smooth' });
        var yrPrompt = AI.buildYearlyReportPrompt(s);
        var yrBox = yrPanel.querySelector('.ai-box');
        AI.callAIStream(yrPrompt, s.settings, function(delta, fullText) {
          if (yrBox) yrBox.textContent = fullText;
        }).catch(function(err) {
          if (yrBox) yrBox.innerHTML = '<span style="color:var(--danger)">生成失败：' + esc(err.message || '') + '</span>';
        });
        break;
      }
      case 'qa-ask': {
        if (!s.settings.apiKey) { alert('请先在设置页配置 DeepSeek API Key'); break; }
        var qaInput = $('#qaInput');
        if (!qaInput || !qaInput.value.trim()) { toast('请先输入问题'); break; }
        var qaPanel = $('#qaPanel');
        qaPanel.classList.remove('hidden');
        qaPanel.innerHTML = '<div class="ai-box" id="qaStreamBox" style="white-space:pre-wrap;line-height:1.7;min-height:40px"><span class="sub" style="color:var(--muted)">▌思考中…</span></div>';
        qaPanel.scrollIntoView({ behavior: 'smooth' });
        var qaPrompt = AI.buildQAPrompt(qaInput.value.trim(), AI.collectInsightData(s, 'month'));
        var streamBox = $('#qaStreamBox');
        AI.callAIStream(qaPrompt, s.settings, function(delta, fullText) {
          if (streamBox) streamBox.textContent = fullText;
        }).catch(function(err) {
          if (streamBox) streamBox.innerHTML = '<span style="color:var(--danger)">回答失败：' + esc(err.message || '') + '</span>';
        });
        break;
      }
      case 'fav-ai-classify': {
        const items = s.favorites.items.filter(i => !i.cleared && i.content);
        if (!items.length) { toast('没有可分类的收藏'); break; }
        if (!s.settings.apiKey) { alert('请先在设置页配置 DeepSeek API Key（AI 配置卡片）'); break; }
        const btn = el; const old = btn.textContent; btn.disabled = true; btn.textContent = 'AI 分类中…';
        const prompt = AI.buildFavClassifyPrompt(items.slice(0, 40));
        AI.callAI(prompt, s.settings).then(txt => {
          let applied = 0;
          txt.split('\n').forEach(line => {
            const m = line.match(/^([A-Za-z0-9_-]+)\s*[|｜]\s*(.+)$/);
            if (!m) return;
            const it = s.favorites.items.find(x => x.id === m[1]);
            const cat = m[2].trim();
            if (it && ['温暖治愈', 'AI', '运动健身', '好物', '其它'].includes(cat)) { it.category = cat; applied++; }
          });
          Store.save(); render();
          toast('✅ AI 分类完成：' + applied + ' 条已归类');
        }).catch(err => alert('AI 分类失败：' + err.message)).finally(() => { btn.disabled = false; btn.textContent = old; });
        break;
      }
      case 'fav-cleanup-suggest': {
        const cleanupItems = s.favorites.items.filter(function(i) { return !i.cleared && i.content; });
        if (!cleanupItems.length) { toast('没有待清理的收藏'); break; }
        if (!s.settings.apiKey) { alert('请先在设置页配置 DeepSeek API Key'); break; }
        var cbtn = el; var cold = cbtn.textContent; cbtn.disabled = true; cbtn.textContent = 'AI 分析中…';
        var cpanel = $('#favCleanupPanel');
        cpanel.classList.remove('hidden');
        cpanel.innerHTML = '<div class="note">🤖 AI 正在分析你的收藏，生成清理建议…</div>';
        var cprompt = AI.buildFavCleanupPrompt(cleanupItems.slice(0, 40));
        AI.callAI(cprompt, s.settings).then(function(txt) {
          // 解析建议
          var lines = txt.split('\n').filter(function(l) { return l.trim(); });
          var deletes = [], materials = [], merges = [], keeps = [];
          lines.forEach(function(l) {
            var m2 = l.match(/^(\d+)\s*[|｜]\s*(DELETE|MATERIAL|MERGE|KEEP)\s*[|｜]?\s*(.*)$/);
            if (!m2) return;
            var idx = parseInt(m2[1]) - 1;
            var op = m2[2], detail = m2[3].trim();
            if (idx >= 0 && idx < cleanupItems.length) {
              if (op === 'DELETE') deletes.push({ item: cleanupItems[idx], detail: detail });
              else if (op === 'MATERIAL') materials.push({ item: cleanupItems[idx], detail: detail });
              else if (op === 'MERGE') merges.push({ item: cleanupItems[idx], detail: detail });
              else keeps.push({ item: cleanupItems[idx], detail: detail });
            }
          });
          var html = '<div class="cleanup-suggest">';
          if (deletes.length) html += '<div class="cleanup-sec cleanup-del"><strong>🗑 建议删除（' + deletes.length + ' 条）</strong>' + deletes.map(function(d) { return '<div class="cleanup-item">' + esc((d.item.content || '').slice(0, 60)) + '<span class="sub">' + esc(d.detail) + '</span></div>'; }).join('') + '<button class="btn sm danger" data-action="cleanup-batch-delete">一键删除以上</button></div>';
          if (materials.length) html += '<div class="cleanup-sec cleanup-mat"><strong>📦 建议转素材（' + materials.length + ' 条）</strong>' + materials.map(function(d) { return '<div class="cleanup-item">' + esc((d.item.content || '').slice(0, 60)) + '<span class="sub">选题方向：' + esc(d.detail) + '</span></div>'; }).join('') + '<button class="btn sm primary" data-action="cleanup-batch-material">一键转为素材</button></div>';
          if (merges.length) html += '<div class="cleanup-sec cleanup-merge"><strong>🔗 建议合并（' + merges.length + ' 条）</strong>' + merges.map(function(d) { return '<div class="cleanup-item">' + esc((d.item.content || '').slice(0, 60)) + '<span class="sub">' + esc(d.detail) + '</span></div>'; }).join('') + '</div>';
          if (keeps.length) html += '<div class="cleanup-sec"><strong>✅ 建议保留（' + keeps.length + ' 条）</strong></div>';
          if (!deletes.length && !materials.length && !merges.length) html += '<div class="sub" style="color:var(--muted)">AI 认为你的收藏都很棒，暂无清理建议！</div>';
          html += '</div>';
          cpanel.innerHTML = html;
          // 挂载数据供批量操作使用
          cpanel._cleanupData = { deletes: deletes, materials: materials };
          cpanel.scrollIntoView({ behavior: 'smooth' });
        }).catch(function(err) {
          cpanel.innerHTML = '<div class="note" style="color:var(--danger)">分析失败：' + esc(err.message || '') + '</div>';
        }).finally(function() { cbtn.disabled = false; cbtn.textContent = cold; });
        break;
      }
      case 'gen-action-plan': {
        const entry = s.reviews.entries.find(x => x.id === id);
        if (!entry) break;
        if (!s.settings.apiKey) { alert('请先在设置页配置 DeepSeek API Key'); break; }
        const panel = $('#planpanel-' + id);
        if (!panel.classList.contains('hidden') && panel.dataset.mounted === '1') { panel.classList.add('hidden'); break; }
        const prompt = AI.buildActionPlanPrompt(entry.content || '', (entry.problems || []).map(p => p.text));
        mountAIPanel(panel, prompt, (txt) => {
          entry.actionPlan = { date: T(), text: txt };
          Store.save(); render(); toast('已保存明日行动建议');
        }, '保存行动建议');
        panel.dataset.mounted = '1';
        break;
      }
      case 'gen-workout-adjust': {
        if (!s.settings.apiKey) { alert('请先在设置页配置 DeepSeek API Key'); break; }
        const panel = $('#workoutAdjust');
        if (!panel.classList.contains('hidden') && panel.dataset.mounted === '1') { panel.classList.add('hidden'); break; }
        const w = s.workout || {};
        // 近期打卡情况：近 7 天运动完成情况
        const recentDone = (w.records || {});
        const recentStr = Object.entries(recentDone).slice(-7).map(([d, v]) => d + (v ? '✓' : '✗')).join(' ');
        const phase = cyclePhase();
        const prompt = AI.buildWorkoutAdjustPrompt(w.bodyInfo || {}, phase, recentStr || '暂无', '—');
        mountAIPanel(panel, prompt, (txt) => {
          w.adjust = { date: T(), text: txt };
          Store.save(); render(); toast('已保存本周微调建议');
        }, '保存建议');
        panel.dataset.mounted = '1';
        break;
      }
      case 'flomo-import': { $('#flomoFile').click(); break; }
      case 'batch-import': {
        const txt = $('#batchImportText');
        if (!txt || !txt.value.trim()) { toast('请先粘贴内容'); break; }
        const r = runBatchImport(txt.value);
        const parts = Object.entries(r).filter(([, n]) => n > 0).map(([k, n]) => k + ' ' + n + ' 条');
        render(); toast('导入完成：' + (parts.join(' · ') || '没有可导入的内容')); break;
      }
      case 'confirm-import': {
        var preview = $('#importPreview');
        var sections = preview._importSections || {};
        var totals = { 语录: 0, 灵感: 0, 收藏: 0, 感恩: 0, 复盘: 0, 素材: 0 };
        var stamp = fmtStamp();
        // 批量转换 sections 为导入格式文本
        var importText = '';
        Object.keys(sections).forEach(function(sec) {
          var items = sections[sec];
          if (!items.length) return;
          var tagMap = { quotes: '语录', ideas: '灵感', favs: '收藏', gratitude: '感恩', reviews: '复盘', materials: '素材' };
          importText += '#' + (tagMap[sec] || sec) + '\n';
          items.forEach(function(item) { importText += item + '\n'; });
          importText += '\n';
        });
        if (!importText.trim()) { toast('没有可导入的内容'); preview.classList.add('hidden'); break; }
        var r2 = runBatchImport(importText);
        var parts2 = Object.entries(r2).filter(function(e) { return e[1] > 0; }).map(function(e) { return e[0] + ' ' + e[1] + ' 条'; });
        preview.classList.add('hidden');
        toast('导入完成：' + (parts2.join(' · ') || '没有可导入的内容'));
        break;
      }
      case 'cancel-import-preview': {
        $('#importPreview').classList.add('hidden');
        break;
      }
      case 'del-import-item': {
        var sec = el.dataset.sec, i = parseInt(el.dataset.i);
        var pv = $('#importPreview');
        var secs = pv._importSections || {};
        if (secs[sec]) secs[sec].splice(i, 1);
        // 重新渲染预览
        var remainText = '';
        var tagMap2 = { quotes: '语录', ideas: '灵感', favs: '收藏', gratitude: '感恩', reviews: '复盘', materials: '素材' };
        Object.keys(secs).forEach(function(s) {
          if (secs[s].length) {
            remainText += '#' + (tagMap2[s] || s) + '\n';
            secs[s].forEach(function(item) { remainText += item + '\n'; });
            remainText += '\n';
          }
        });
        mountImportPreview(remainText);
        break;
      }
      case 'show-quote': { showQuoteModal(); break; }
      case 'close-quote-modal': { const m = el.closest('.quote-modal'); if (m) m.remove(); break; }
      case 'change-avatar': { $('#avatarFile').click(); break; }
      case 'remove-avatar': {
        s.settings.avatar = ''; Store.save(); renderBrand(); render(); toast('已恢复默认头像'); break;
      }
      case 'theme': {
        s.settings.theme = s.settings.theme === 'dark' ? 'light' : 'dark';
        Store.save(); applyTheme(); toast('已切换主题'); break;
      }
      case 'save-daily': {
        s.daily = s.daily || {}; s.daily[T()] = $('#dailyNote').value; Store.save(); toast('已保存今日三件事'); break;
      }
      case 'load-recommended': {
        const have = new Set(s.goals.books.map(b => (b.title + '|' + b.author).toLowerCase()));
        let added = 0;
        RECOMMENDED.forEach(r => {
          const key = (r.title + '|' + r.author).toLowerCase();
          if (!have.has(key)) {
            s.goals.books.unshift({ id: Store.uid(), title: r.title, author: r.author, category: r.category, status: '想读', addedAt: T(), note: r.note });
            added++;
          }
        });
        Store.save(); render(); toast('已载入推荐书单，新增 ' + added + ' 本'); break;
      }
      case 'toggle-cat': {
        const c = el.dataset.cat;
        if (ui.catOpen[c]) delete ui.catOpen[c]; else ui.catOpen[c] = true;
        render(); break;
      }
      case 'collapse-cats': { ui.catOpen = {}; render(); break; }
      case 'cycle-habit': {
        const d = T(); s.habits.records[d] = s.habits.records[d] || {};
        const cur = habitState(s.habits.records[d], id);
        const nx = nextHabitState(cur.s ? cur : '');
        if (nx === null) delete s.habits.records[d][id];
        else s.habits.records[d][id] = nx;
        Store.save(); render();
        toast(nx === null ? '已取消打卡' : (nx.s === 'done' ? '✓ 已打卡' : '◐ 已标记部分完成'));
        break;
      }
      case 'toggle-workout': {
        const d = T();
        s.workout.records = s.workout.records || {};
        if (s.workout.records[d]) delete s.workout.records[d];
        else s.workout.records[d] = true;
        Store.save(); render();
        toast(s.workout.records[d] ? '🏃 今日运动已完成' : '已取消今日运动'); break;
      }
      case 'habit-note': {
        const d = T(); s.habits.records[d] = s.habits.records[d] || {};
        const cur = habitState(s.habits.records[d], id);
        const note = prompt('记录备注（为什么部分完成 / 今天做得怎么样）：', cur.note || '');
        if (note === null) break;
        const st = cur.s || 'done';
        s.habits.records[d][id] = { s: st, note };
        Store.save(); render(); toast('已保存备注'); break;
      }
      case 'del-habit': { const arrH = s.habits.definitions; const iH = arrH.findIndex(x => x.id === id); if (iH >= 0) undoDelete(arrH, iH, arrH.splice(iH, 1)[0], '习惯'); Store.save(); render(); break; }
      case 'fav-to-material': {
        const it = s.favorites.items.find(i => i.id === id);
        if (!it) break;
        if (it.toMaterial) break;
        it.toMaterial = true;
        s.media.materials.unshift({ id: Store.uid(), date: T(), text: (it.content || '') + (it.url ? '（' + it.url + '）' : ''), source: '收藏·' + (it.category || '其它'), refUrl: it.url || '', used: false });
        Store.save(); render(); toast('已转入素材池，可在「自媒体」使用'); break;
      }
      case 'idea-to-material': {
        const it = s.media.ideas.find(i => i.id === id);
        if (!it) break;
        s.media.materials.unshift({ id: Store.uid(), date: T(), text: it.text, source: '灵感', refUrl: it.refUrl || '', used: false });
        Store.save(); render(); toast('灵感已入素材池'); break;
      }
      case 'toggle-material': { const m = s.media.materials.find(x => x.id === id); if (m) m.used = !m.used; Store.save(); render(); break; }
      case 'del-material': { const arrM = s.media.materials; const iM = arrM.findIndex(x => x.id === id); if (iM >= 0) undoDelete(arrM, iM, arrM.splice(iM, 1)[0], '素材'); Store.save(); render(); break; }
      case 'del-idea': { const arrI = s.media.ideas; const iI = arrI.findIndex(x => x.id === id); if (iI >= 0) undoDelete(arrI, iI, arrI.splice(iI, 1)[0], '灵感'); Store.save(); render(); break; }
      case 'del-generated': { const arrG = s.media.generated; const iG = arrG.findIndex(x => x.id === id); if (iG >= 0) undoDelete(arrG, iG, arrG.splice(iG, 1)[0], '内容方向'); Store.save(); render(); break; }
      case 'del-topic': { const arrTp = s.media.topics; const iTp = arrTp.findIndex(x => x.id === id); if (iTp >= 0) undoDelete(arrTp, iTp, arrTp.splice(iTp, 1)[0], '选题'); Store.save(); render(); break; }
      case 'topic-status': {
        const tp = s.media.topics.find(x => x.id === id); if (!tp) break;
        const order = ['候选', '已排期', '已发布', '放弃'];
        tp.status = order[(order.indexOf(tp.status || '候选') + 1) % order.length];
        Store.save(); render(); break;
      }
      case 'topic-publish': {
        const tp = s.media.topics.find(x => x.id === id); if (!tp) break;
        const title = prompt('登记发布：这篇的标题是？', tp.title || '');
        if (title === null) return;
        tp.status = '已发布';
        s.media.publishes.unshift({ id: Store.uid(), date: T(), title, platform: '小红书', link: '', stats: { likes: 0, collects: 0, comments: 0, views: 0 }, note: tp.angle || '' });
        Store.save(); render(); toast('已登记发布，可在下方补数据'); break;
      }
      case 'del-publish': { const arrP = s.media.publishes; const iP = arrP.findIndex(x => x.id === id); if (iP >= 0) undoDelete(arrP, iP, arrP.splice(iP, 1)[0], '发布记录'); Store.save(); render(); break; }
      case 'pub-stat': {
        const p = s.media.publishes.find(x => x.id === id); if (!p) return;
        p.stats = p.stats || {};
        p.stats[el.dataset.k] = parseInt(el.value, 10) || 0;
        Store.save(); break;
      }
      case 'insight-type': { ui.insightType = el.dataset.v; render(); break; }
      case 'gen-insight': {
        const prompt = AI.buildInsightPrompt(s, ui.insightType);
        const panel = $('#insightPanel');
        if (!panel.classList.contains('hidden') && panel.dataset.mounted === '1') { panel.classList.add('hidden'); break; }
        mountAIPanel(panel, prompt, (txt) => {
          const type = ui.insightType;
          const data = AI.collectInsightData(s, type);
          s.reports.unshift({ id: Store.uid(), type, period: data.range, copy: txt, createdAt: T() });
          Store.save(); render(); toast('已保存' + (type === 'month' ? '月报' : '周报'));
        }, '保存报告');
        panel.dataset.mounted = '1';
        break;
      }
      case 'view-report': { ui.insightExpanded = ui.insightExpanded === id ? null : id; render(); break; }
      case 'del-report': { const arrR = s.reports; const iR = arrR.findIndex(x => x.id === id); if (iR >= 0) undoDelete(arrR, iR, arrR.splice(iR, 1)[0], '报告'); Store.save(); render(); break; }
      case 'del-book': { const arrB = s.goals.books; const iB = arrB.findIndex(b => b.id === id); if (iB >= 0) undoDelete(arrB, iB, arrB.splice(iB, 1)[0], '书目'); Store.save(); render(); break; }
      case 'del-week-plan': {
        const i = +el.dataset.i; const arr = s.goals.weeklyPlan[el.dataset.wk] || [];
        if (i >= 0 && i < arr.length) undoDelete(arr, i, arr.splice(i, 1)[0], '周计划'); Store.save(); render(); break;
      }
      case 'del-fav': { const arrF = s.favorites.items; const iF = arrF.findIndex(x => x.id === id); if (iF >= 0) undoDelete(arrF, iF, arrF.splice(iF, 1)[0], '收藏'); Store.save(); render(); break; }
      case 'clear-fav': { const it = s.favorites.items.find(i => i.id === id); if (it) it.cleared = true; Store.save(); render(); break; }
      case 'cleanup-batch-delete': {
        var cd = $('#favCleanupPanel')._cleanupData;
        if (cd && cd.deletes) {
          cd.deletes.forEach(function(d) { d.item.cleared = true; });
          Store.save(); render(); toast('已清理 ' + cd.deletes.length + ' 条收藏');
        }
        break;
      }
      case 'cleanup-batch-material': {
        var cd2 = $('#favCleanupPanel')._cleanupData;
        if (cd2 && cd2.materials) {
          var added = 0;
          cd2.materials.forEach(function(d) {
            if (!d.item.toMaterial) {
              s.media.materials.unshift({ id: Store.uid(), date: T(), createdAt: fmtStamp(), text: d.item.content || '', source: '收藏转素材', refUrl: d.item.url || '', used: false });
              d.item.toMaterial = true; added++;
            }
          });
          Store.save(); render(); toast('已转入素材池 ' + added + ' 条');
        }
        break;
      }
      case 'clear-week': {
        const wk = Store.isoWeek(); s.favorites.items.forEach(i => { if (!i.cleared && Store.isoWeek(i.date) === wk) i.cleared = true; });
        Store.save(); render(); toast('本周收藏已清除'); break;
      }
      case 'fav-filter': { ui.favFilter = el.dataset.f; render(); break; }
      case 'del-gratitude': { const arrA = s.gratitude.entries; const iA = arrA.findIndex(x => x.id === id); if (iA >= 0) undoDelete(arrA, iA, arrA.splice(iA, 1)[0], '感恩记录'); Store.save(); render(); break; }
      case 'quote-filter': { ui.quoteFilter = el.dataset.f; render(); break; }
      case 'toggle-quote': { ui.quoteExpanded = ui.quoteExpanded === id ? null : id; render(); break; }
      case 'edit-quote': { ui.quoteEditing = ui.quoteEditing === id ? null : id; ui.quoteExpanded = null; render(); break; }
      case 'cancel-edit-quote': { ui.quoteEditing = null; render(); break; }
      case 'pin-quote': { const q = s.quotes.find(x => x.id === id); if (q) q.pinned = !q.pinned; Store.save(); render(); break; }
      case 'del-quote': { const arrQ = s.quotes; const iQ = arrQ.findIndex(x => x.id === id); if (iQ >= 0) undoDelete(arrQ, iQ, arrQ.splice(iQ, 1)[0], '语录'); Store.save(); render(); break; }
      case 'shelf-view': { ui.shelfView = el.dataset.v; render(); break; }
      case 'toggle-shelf': { ui.shelfExpanded = ui.shelfExpanded === id ? null : id; render(); break; }
      case 'del-note': {
        const bid = el.dataset.bid; const idx = +el.dataset.i;
        const book = s.goals.books.find(b => b.id === bid);
        if (book && book.readingNotes && idx >= 0 && idx < book.readingNotes.length) { const arrN = book.readingNotes; undoDelete(arrN, idx, arrN.splice(idx, 1)[0], '读书笔记'); Store.save(); render(); }
        break;
      }
      case 'del-review': { const arrV = s.reviews.entries; const iV = arrV.findIndex(x => x.id === id); if (iV >= 0) undoDelete(arrV, iV, arrV.splice(iV, 1)[0], '复盘'); Store.save(); render(); break; }
      case 'toggle-idea': { const it = s.media.ideas.find(x => x.id === id); if (it) it.used = !it.used; Store.save(); render(); break; }
      case 'review-tab': { ui.reviewTab = el.dataset.f; render(); break; }
      case 'go-weekly': { ui.reviewTab = 'weekly'; go('review'); break; }
      case 'weekly-open': { ui.reviewTab = 'weekly'; go('review'); break; }
      case 'weekly-run': {
        const wp = $('#weeklyPanel');
        if (!wp) break;
        if (wp.classList.contains('hidden') || wp.dataset.mounted !== '1') { mountWeeklyRun(wp); wp.dataset.mounted = '1'; }
        else { wp.classList.add('hidden'); }
        break;
      }
      case 'weekly-track': {
        const rid = el.dataset.id; const wi = +el.dataset.i;
        const rep = (s.reviews.weeklyReports || []).find(x => x.id === rid);
        if (!rep) break;
        const f = rep.findings && rep.findings[wi];
        if (!f) break;
        rep.problems = rep.problems || [];
        if (rep.problems.some(p => _norm(p.text) === _norm(f.title))) { f.tracked = true; Store.save(); render(); toast('这个卡点已经在跟踪里了'); break; }
        rep.problems.push({ id: Store.uid(), text: f.title, kind: f.kind, source: '周度体检（' + (rep.date || '') + '）', evidence: f.evidence, fix: f.fix, habitPlan: f.habitPlan, status: '待跟进', analysis: '', followups: [], recurCount: 0, recurDates: [], createdAt: fmtStamp(), date: rep.date });
        f.tracked = true;
        Store.save(); render(); toast('已转为卡点，进「问题跟踪」长期跟进 🎯'); break;
      }
      case 'weekly-cand-save': {
        const rep = (s.reviews.weeklyReports || []).find(x => x.id === id);
        if (!rep || !rep.readTopic) break;
        s.camp = s.camp || { current: null, history: [], candidates: [] };
        s.camp.candidates = Array.isArray(s.camp.candidates) ? s.camp.candidates : [];
        if (s.camp.candidates.some(c => c.reportId === rep.id)) { toast('这个建议已经是候选期次了'); break; }
        s.camp.candidates.push({ id: Store.uid(), topic: rep.readTopic, question: rep.readQuestion || '', why: rep.readWhy || '', reportId: rep.id, date: rep.date || T(), createdAt: fmtStamp() });
        rep.readSavedAt = fmtStamp();
        Store.save(); render(); toast('已存入主题阅读营候选 📚'); break;
      }
      case 'media-tab': { ui.mediaTab = el.dataset.f || 'idea'; render(); break; }
      case 'pos-toggle': { ui.posOpen = !ui.posOpen; render(); break; }
      case 'quick-add-problem': {
        var rid = el.dataset.id, text2 = el.dataset.text;
        var entry2 = s.reviews.entries.find(function(en) { return en.id === rid; });
        if (entry2 && text2) {
          var mres = pushProblem(entry2, text2);
          if (mres.merged) toast('🔁 与已有卡点合并，复发次数 +1');
          else if (mres.dup) toast('这个卡点已经在跟踪里了');
          else toast('已加入卡点跟踪');
          render();
        }
        break;
      }
      case 'check-problem': {
        const f = findProblem(id);
        if (!f) break;
        const r = el.dataset.r;
        f.prob.followups = f.prob.followups || [];
        f.prob.followups.push({ date: T(), note: '跟进确认：' + resultText(r), improved: r === 'done' });
        if (r === 'done') { f.prob.status = '已改善'; toast('✅ 已标记改善，卡点关闭'); }
        else if (r === 'partial') { if (f.prob.status === '待跟进') f.prob.status = '改善中'; toast('已记录部分做到，继续保持'); }
        else { f.prob.status = '待跟进'; toast('已记录，继续跟进这个卡点'); }
        Store.save(); render(); break;
      }
      case 'check-plan': {
        const e2 = s.reviews.entries.find(x => x.id === id);
        if (!e2) break;
        e2.actionCheck = { date: T(), result: el.dataset.r };
        Store.save(); render(); toast('已确认昨日行动：' + resultText(el.dataset.r)); break;
      }
      case 'todo-from-action': {
        const t2 = el.dataset.text ? decodeURIComponent(el.dataset.text) : '';
        if (!t2) break;
        s.todos = s.todos || [];
        s.todos.unshift({ id: Store.uid(), text: t2, note: '来自复盘行动建议', done: false, createdAt: fmtStamp() });
        Store.save(); render(); toast('已转为今日待办'); break;
      }
      case 'save-auto-plan': {
        const e3 = s.reviews.entries.find(x => x.id === id);
        if (!e3) break;
        const p2 = el.dataset.text ? decodeURIComponent(el.dataset.text) : '';
        if (!p2) break;
        e3.actionPlan = { date: T(), text: p2 };
        Store.save(); render(); toast('已存为明日行动，明天复盘会提醒你检查'); break;
      }
      case 'analyze-problem': {
        const found = findProblem(id);
        const entry = found && found.entry;
        const prob = found && found.prob;
        if (!prob) break;
        if (!s.settings.apiKey) { alert('请先在设置页配置 DeepSeek API Key'); break; }
        const panel = $('#aipanel-' + id);
        if (panel.classList.contains('hidden') || panel.dataset.mounted !== '1') {
          const recent = s.reviews.entries.slice(0, 8);
          mountCoachPanel(panel, id, prob, entry, recent);
          panel.dataset.mounted = '1';
        } else {
          panel.classList.add('hidden');
        }
        break;
      }
      case 'coach-send': {
        var sid2 = el.dataset.sid;
        var session2 = ui.coachSessions[sid2];
        if (!session2) break;
        var input2 = $('#coach-input-' + sid2);
        if (!input2 || !input2.value.trim()) { toast('请输入你的想法'); break; }
        var msg2 = input2.value.trim();
        input2.value = '';
        input2.disabled = true;
        session2.messages.push({ role: 'user', content: msg2 });
        var list2 = $('#coach-msgs-' + sid2);
        appendCoachMsg(list2, 'user', msg2);
        coachStream(list2, session2.messages, function(reply2) {
          if (reply2) session2.messages.push({ role: 'assistant', content: reply2 });
          input2.disabled = false;
          input2.focus();
        });
        break;
      }
      case 'gen-content': {
        const prompt = AI.buildContentPrompt(s.media, buildRecentInputs());
        const panel = $('#genPanel');
        if (!panel.classList.contains('hidden') && panel.dataset.mounted === '1') { panel.classList.add('hidden'); break; }
        mountAIPanel(panel, prompt, (txt) => {
          s.media.generated.unshift({ id: Store.uid(), date: T(), basedOn: '近 7 日输入', copy: txt });
          Store.save(); render(); toast('已生成并保存内容方向');
        }, '保存内容方向');
        panel.dataset.mounted = '1';
        break;
      }
      case 'close-coach': {
        const sid = el.dataset.sid;
        const panel = document.querySelector('[id^="aipanel-"]');
        if (panel && !panel.classList.contains('hidden')) panel.classList.add('hidden');
        break;
      }
      case 'gen-draft': {
        if (!s.settings.apiKey) { alert('请先在设置页配置 DeepSeek API Key'); break; }
        const topic = s.media.topics.find(t => t.id === id);
        if (!topic) break;
        const panel = $('#draftpanel-' + id);
        if (panel && !panel.classList.contains('hidden') && panel.dataset.mounted === '1') { panel.classList.add('hidden'); break; }
        const prompt = AI.buildContentDraftPrompt(topic, s.media.materials, s.media.positioning, s.quotes);
        mountAIPanel(panel, prompt, (txt) => {
          // 保存为已生成内容，标记来自选题
          s.media.generated.unshift({ id: Store.uid(), date: T(), basedOn: '选题：' + topic.title, copy: txt, topicId: topic.id });
          topic.status = '已发布'; topic.publishedAt = T();
          Store.save(); render(); toast('初稿已生成并保存');
        }, '保存初稿');
        if (panel) panel.dataset.mounted = '1';
        break;
      }
      case 'publish-insight': {
        if (!s.settings.apiKey) { alert('请先在设置页配置 DeepSeek API Key'); break; }
        var pip = $('#publishInsightPanel');
        if (!pip) break;
        pip.classList.remove('hidden');
        pip.innerHTML = '<div class="note">📊 AI 正在分析你的发布数据…</div>';
        var pprompt = AI.buildPublishInsightPrompt(s.media.publishes, s.media.positioning);
        AI.callAI(pprompt, s.settings).then(function(txt) {
          pip.innerHTML = '<div class="ai-box" style="white-space:pre-wrap;line-height:1.7">' + esc(txt) + '</div>';
          pip.scrollIntoView({ behavior: 'smooth' });
        }).catch(function(err) {
          pip.innerHTML = '<div class="note" style="color:var(--danger)">分析失败：' + esc(err.message || '') + '</div>';
        });
        break;
      }
      case 'export': {
        const blob = new Blob([Store.exportJSON()], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = 'life-workbench-backup-' + T() + '.json'; a.click();
        toast('已导出备份'); break;
      }
      case 'import': { $('#importFile').click(); break; }
      case 'reset': {
        if (confirm('确定清空全部数据？此操作不可恢复（建议先导出备份）。')) { Store.reset(); ui.week = Store.isoWeek(); render(); toast('已清空'); }
        break;
      }
      /* ---------- 云端同步 ---------- */
      case 'sync-save': {
        if (!window.Sync) { toast('同步模块未加载'); break; }
        const keyEl = $('#syncApiKey'), passEl = $('#syncPass'), provEl = $('#syncProvider');
        const key = (keyEl && keyEl.value || '').trim();
        const pass = (passEl && passEl.value || '').trim();
        const prov = (provEl && provEl.value) || 'github';
        if (!key) { toast('请先填写 GitHub Token'); break; }
        const binEl = $('#syncBinId');
        const userBin = (binEl && binEl.value || '').trim();
        const oldCfg = Sync.getConfig();
        const providerChanged = oldCfg.provider !== prov;
        // 切换存储后端时若未填新 ID 则清掉旧仓库 ID（避免拿旧后端 ID 去读新后端）；否则采用用户填写的仓库 ID
        Sync.setConfig({ provider: prov, enabled: true, apiKey: key, passphrase: pass, binId: (providerChanged && !userBin) ? '' : userBin });
        if (!Sync.getBinId()) {
          // 新仓库：上传当前数据
          toast('已保存，正在上传当前数据到云端…');
          Sync.push(S()).then(function (r) {
            if (r.ok) { toast('✅ 已开启同步并上传'); render(); }
            else toast('开启成功，但上传失败：' + (r.reason || ''));
          });
        } else {
          // 已填了仓库 ID：先拉取云端现有数据，避免覆盖
          toast('正在从云端拉取现有数据…');
          Sync.pull().then(function (r) {
            if (r.ok && r.state) { try { Store.replaceState(r.state); ui.week = Store.isoWeek(); } catch (e) {} render(); toast('✅ 已接入同步，拉取云端数据'); }
            else { render(); toast('已接入（云端暂无数据）'); }
          });
        }
        break;
      }
      case 'sync-now': {
        if (!window.Sync) { toast('同步模块未加载'); break; }
        toast('正在从云端拉取…');
        Sync.pull().then(function (r) {
          if (r.ok && r.state) {
            try { Store.replaceState(r.state); ui.week = Store.isoWeek(); render(); toast('✅ 已拉取云端最新数据'); }
            catch (e) { toast('拉取数据异常：' + e.message); }
          } else if (r.reason === 'empty') { toast('云端暂无数据，编辑任意内容即会上传'); }
          else if (r.reason === 'nobin') { toast('尚未创建云端仓库，先保存同步设置'); }
          else { toast('拉取失败：' + (r.reason || '')); }
        });
        break;
      }
      case 'sync-disable': {
        if (!window.Sync) break;
        Sync.setConfig({ enabled: false });
        toast('已关闭云端同步（本地数据保留）'); render(); break;
      }
      case 'sync-copy-bin': {
        const id = window.Sync && Sync.getBinId();
        if (!id) { toast('尚未创建云端仓库'); break; }
        copyText(id); toast('已复制仓库 ID'); break;
      }
      case 'sync-key-copy': {
        if (!window.Sync) { toast('同步模块未加载'); break; }
        const c0 = Sync.getConfig();
        if (!c0.apiKey) { toast('还没有可复制的钥匙——请先在上方填写 Token 并保存同步'); break; }
        try { copyText(Sync.exportKey()); toast('🔑 同步钥匙已复制 → 请粘贴到备忘录/网盘存好（含 Token，勿外传）'); }
        catch (e) { toast('复制失败：' + e.message); }
        break;
      }
      case 'sync-key-paste': {
        if (!window.Sync) { toast('同步模块未加载'); break; }
        const raw = prompt('把之前复制的「同步钥匙」粘贴到这里：');
        if (!raw || !raw.trim()) break;
        let cfg;
        try { cfg = Sync.importKey(raw.trim()); }
        catch (e) { toast('钥匙格式不对：' + e.message); break; }
        toast('✅ 钥匙已导入，正在接上云端…');
        if (cfg.binId) {
          Sync.pull().then(function (r) {
            if (r.ok && r.state) {
              try { Store.replaceState(r.state); ui.week = Store.isoWeek(); render(); toast('✅ 已接上云端并恢复数据'); }
              catch (e) { toast('数据恢复异常：' + e.message); }
            } else { render(); toast('已导入钥匙（云端暂未读到数据：' + (r.reason || '') + '）'); }
          });
        } else {
          toast('钥匙已导入（没有仓库 ID，下次保存同步设置将新建云端仓库）'); render();
        }
        break;
      }
      /* ---------- 主题阅读营 ---------- */
      case 'camp-start': campStart(); break;
      case 'camp-cand-use': {
        const candArr = (s.camp && s.camp.candidates) || [];
        const cand = candArr.find(x => x.id === id);
        if (!cand) break;
        if (s.camp && s.camp.current) { toast('本期还在跑，先「结束本期」归档再开新营'); break; }
        campStartFromCandidate(cand); break;
      }
      case 'camp-cand-del': {
        const candArr2 = (s.camp && s.camp.candidates) || [];
        const ci2 = candArr2.findIndex(x => x.id === id);
        if (ci2 >= 0) { undoDelete(candArr2, ci2, candArr2.splice(ci2, 1)[0], '候选期次'); Store.save(); render(); }
        break;
      }
      case 'camp-toggle-book': {
        const bid = el.dataset.id;
        const cur = S().camp.current;
        if (!cur) break;
        ui.campBookOpen = ui.campBookOpen === bid ? null : bid;
        render(); break;
      }
      case 'camp-end': campEnd(); break;
      case 'camp-del-note': campDelNote(el.dataset.bid, parseInt(el.dataset.i || '0', 10)); break;
      case 'camp-summarize': campSummarize(el); break;
      case 'camp-copy-summary': {
        const cur2 = S().camp.current;
        copyText((cur2 && cur2.summary && cur2.summary.text) || ''); break;
      }
    }
  }

  function handleForm(form, el, e) {
    const s = S();
    const fd = new FormData(el);
    const get = n => (fd.get(n) || '').toString().trim();
    switch (form) {
      case 'add-todo': {
        const txt = (get('text') || '').trim();
        if (!txt) { toast('待办内容不能为空'); break; }
        s.todos = s.todos || [];
        s.todos.unshift({ id: Store.uid(), text: txt, note: (get('note') || '').trim(), done: false, createdAt: fmtStamp() });
        Store.save(); render(); toast('已添加待办'); break;
      }
      case 'add-wish': {
        const txt = get('text'); if (!txt) { toast('写下愿望内容吧'); break; }
        if (!s.wishlist) s.wishlist = { items: [] };
        const dup = s.wishlist.items.find(x => x.status === '许愿中' && x.text === txt);
        if (dup) { toast('这个愿望已经在路上了 ⭐'); break; }
        s.wishlist.items.unshift({ id: Store.uid(), text: txt, category: get('category'), status: '许愿中', date: T(), createdAt: fmtStamp(), statusDate: '' });
        Store.save(); render(); toast('已许愿，慢慢靠近它 ✨'); break;
      }
      case 'save-journal': {
        const date = get('date') || T();
        const content = get('content');
        if (!content || !content.trim()) { toast('写点什么再保存吧'); break; }
        if (!s.journals) s.journals = { entries: [] };
        const mood = get('mood') || '';
        const ex = s.journals.entries.find(j => j.date === date);
        if (ex) { ex.content = content; ex.mood = mood; ex.updatedAt = fmtStamp(); toast('已更新这篇随笔 📖'); }
        else { s.journals.entries.unshift({ id: Store.uid(), date, content, mood, createdAt: fmtStamp(), updatedAt: fmtStamp() }); toast('已保存随笔 📖'); }
        ui.journalEdit = null;
        Store.save(); render(); break;
      }
      case 'add-book': {
        if (!get('title')) break;
        s.goals.books.unshift({ id: Store.uid(), title: get('title'), author: get('author'), category: get('category'), status: get('status'), addedAt: T(), note: get('note') });
        Store.save(); render(); toast('已加入书单'); break;
      }
      case 'add-week-plan': {
        const wk = get('week'); const bookId = get('bookId');
        if (!bookId) { alert('请先在书单加书'); break; }
        s.goals.weeklyPlan[wk] = s.goals.weeklyPlan[wk] || [];
        s.goals.weeklyPlan[wk].push({ bookId, pages: get('pages'), note: get('note') });
        Store.save(); render(); toast('已加入周计划'); break;
      }
      case 'add-fav': {
        s.favorites.items.unshift({ id: Store.uid(), date: get('date') || T(), channel: get('channel'), category: get('category'), content: get('content'), url: get('url'), cleared: false });
        Store.save(); render(); toast('已记录收藏'); break;
      }
      case 'add-gratitude': {
        const items = get('items').split('\n').map(x => x.replace(/^\d+[.、)]\s*/, '').trim()).filter(Boolean);
        if (!items.length) break;
        s.gratitude.entries.unshift({ id: Store.uid(), date: get('date') || T(), createdAt: fmtStamp(), items, mood: get('mood') });
        Store.save(); render(); toast('已保存感恩'); break;
      }
      case 'add-quote': {
        let content = cleanQuote(get('content')); if (!content) break;
        const img = (get('image') || '').trim();
        s.quotes.unshift({ id: Store.uid(), content, platform: get('platform'), sourceUrl: get('sourceUrl'), image: img || '', date: T(), createdAt: fmtStamp(), note: '', pinned: false });
        Store.save(); render(); toast('已收藏语录'); break;
      }
      case 'save-quote-edit': {
        const qid = el.dataset.id;
        const q = s.quotes.find(x => x.id === qid);
        if (!q) break;
        const newContent = cleanQuote(get('content'));
        if (!newContent) { toast('句子内容不能为空'); break; }
        q.content = newContent;
        q.platform = get('platform') || q.platform;
        q.sourceUrl = (get('sourceUrl') || '').trim();
        q.image = (get('image') || '').trim();
        ui.quoteEditing = null;
        Store.save(); render(); toast('已更新语录'); break;
      }
      case 'add-note': {
        const bid = el.dataset.bid; const book = s.goals.books.find(b => b.id === bid);
        if (!book) break;
        ensureBookMeta(book);
        const txt = get('note'); if (!txt) break;
        (book.readingNotes = book.readingNotes || []).unshift({ id: Store.uid(), date: T(), text: cleanQuote(txt) });
        Store.save(); render(); toast('已记录读书笔记'); break;
      }
      case 'add-review': {
        var reviewContent = get('content');
        s.reviews.entries.unshift({ id: Store.uid(), date: get('date') || T(), createdAt: fmtStamp(), content: reviewContent, problems: [] });
        Store.save();
        // 如果配置了AI且复盘有内容，自动触发分析
        if (s.settings.apiKey && reviewContent.trim()) {
          var newEntry = s.reviews.entries[0];
          var panel = $('#review-auto-panel');
          if (!panel) { render(); var p2 = $('#review-auto-panel'); if (p2) panel = p2; }
          if (panel) {
            panel.classList.remove('hidden');
            panel.innerHTML = '<div class="note">🤖 AI 正在从你的复盘中识别可能成为卡点的困扰…</div>';
            AI.callAI(AI.buildReviewAutoAnalyze(reviewContent), s.settings).then(function(txt) {
              var pMatch = txt.match(/---PROBLEMS---\n([\s\S]*?)(?:---ACTIONS---|$)/);
              var problems = pMatch ? pMatch[1].trim().split('\n').filter(function(l) { return l.trim() && l.trim() !== '无' && l.indexOf('---') !== 0; }) : [];
              var html = '<div class="review-auto-result">';
              if (problems.length) {
                html += '<div class="review-auto-section"><strong>🔍 识别到的潜在卡点（点击即加入跟踪，同类会自动合并；每周体检会再深挖一层）</strong>';
                problems.forEach(function(p) { html += '<div class="review-auto-item">' + esc(p) + '<button class="btn sm" data-action="quick-add-problem" data-id="' + newEntry.id + '" data-text="' + esc(p) + '">＋ 记作卡点</button></div>'; });
                html += '</div>';
              }
              if (!problems.length) html += '<div class="sub" style="color:var(--muted)">今天没有发现值得跟踪的卡点，继续保持！每周日来「周度体检」做一次深度扫描。</div>';
              html += '</div>';
              if (panel) panel.innerHTML = html;
            }).catch(function(e) {
              if (panel) panel.innerHTML = '<div class="note" style="color:var(--muted)">AI 分析未完成：' + esc(e.message || '') + '</div>';
            });
          }
        }
        render(); toast('已保存复盘');
        break;
      }
      case 'add-problem': {
        const entry = s.reviews.entries.find(en => en.id === el.dataset.id);
        if (!entry) break;
        const txt = get('text'); if (!txt) break;
        const mres = pushProblem(entry, txt);
        if (mres.merged) toast('🔁 与已有卡点合并，复发次数 +1');
        else if (mres.dup) toast('这个卡点已经在跟踪里了');
        else toast('已记录卡点，将自动跟踪');
        render(); break;
      }
      case 'add-followup': {
        const f2 = findProblem(el.dataset.id);
        const prob = f2 && f2.prob;
        if (!prob) break; prob.followups = prob.followups || [];
        const note = get('note'); if (!note) break;
        prob.followups.push({ date: T(), note, improved: fd.get('improved') === 'on' });
        if (fd.get('improved') === 'on' && prob.status === '待跟进') prob.status = '改善中';
        Store.save(); render(); toast('已记录跟踪'); break;
      }
      case 'add-habit': {
        if (!get('name')) break;
        s.habits.definitions.push({ id: Store.uid(), name: get('name'), type: get('type') || 'daily' });
        Store.save(); render(); toast('已添加习惯'); break;
      }
      case 'save-period': {
        s.workout.period = s.workout.period || {};
        const val = get('lastStart');
        s.workout.period.lastStart = val || '';
        Store.save(); render(); toast(val ? '已保存经期日期，运动强度将按周期自动调整' : '已清除经期日期'); break;
      }
      case 'add-idea': {
        if (!get('text')) break;
        s.media.ideas.unshift({ id: Store.uid(), date: get('date') || T(), text: get('text'), source: get('source'), refUrl: get('refUrl'), used: false });
        Store.save(); render(); toast('已记录灵感'); break;
      }
      case 'add-material': {
        if (!get('text')) break;
        s.media.materials.unshift({ id: Store.uid(), date: T(), text: get('text'), source: '手动添加', refUrl: '', used: false });
        Store.save(); render(); toast('已加入素材池'); break;
      }
      case 'add-topic': {
        if (!get('title')) break;
        s.media.topics.push({ id: Store.uid(), title: get('title'), angle: get('angle'), status: '候选', scheduledDate: get('scheduledDate') || '', note: '', createdAt: T() });
        Store.save(); render(); toast('已加入选题'); break;
      }
      case 'add-publish': {
        if (!get('title')) break;
        s.media.publishes.unshift({
          id: Store.uid(), date: get('date') || T(), title: get('title'), platform: get('platform'), link: get('link'),
          stats: { likes: +get('likes') || 0, collects: +get('collects') || 0, comments: +get('comments') || 0, views: +get('views') || 0 },
          note: get('note')
        });
        Store.save(); render(); toast('已记录发布'); break;
      }
      case 'save-positioning': {
        s.media.positioning = {
          direction: get('direction'), audience: get('audience'), tone: get('tone'),
          pillars: get('pillars').split(/[，,]/).map(x => x.trim()).filter(Boolean)
        };
        Store.save(); toast('已保存定位'); break;
      }
      case 'save-settings': {
        s.settings.apiBase = get('apiBase') || s.settings.apiBase;
        s.settings.apiKey = get('apiKey');
        // 智能补全：用户输入模型名是常见简写时，自动补全为完整 v4-pro
        let m = (get('model') || s.settings.model || '').trim();
        if (!m || /^deepseek$/i.test(m) || /^deepseek[\s\-_]?chat$/i.test(m)) m = 'deepseek-v4-pro';
        s.settings.model = m;
        Store.save(); toast('已保存 AI 配置' + (m.includes('v4') ? '（已自动补全模型名为 ' + m + '）' : '')); break;
      }
      /* ---------- 主题阅读营 ---------- */
      case 'camp-add-note': {
        const bid = el.dataset.bid;
        const txt = cleanQuote(get('text'));
        if (!txt) { toast('写点内容再记'); break; }
        const cur = s.camp && s.camp.current;
        if (!cur) break;
        const b = cur.books.find(x => x.id === bid);
        if (!b) { toast('书不存在'); break; }
        b.notes = b.notes || [];
        b.notes.unshift({ id: Store.uid(), date: T(), createdAt: fmtStamp(), text: txt, sub: get('sub') });
        if (b.status === '未读') b.status = '在读';
        Store.save(); render();
        toast('✍ 已记一条想法');
        break;
      }
      case 'camp-weekly': {
        const cur2 = s.camp && s.camp.current;
        if (!cur2) break;
        const wk = Store.isoWeek();
        cur2.weekly = cur2.weekly || {};
        cur2.weekly[wk] = { text: cleanQuote(get('text')), at: fmtStamp() };
        Store.save(); render();
        toast('🪞 本周轻复盘已保存');
        break;
      }
    }
  }

  function handleChange(change, el) {
    const s = S();
    switch (change) {
      case 'theme-sel': s.settings.theme = el.value; Store.save(); applyTheme(); break;
      case 'week-sel': ui.week = el.value; render(); break;
      case 'book-status': { const b = s.goals.books.find(x => x.id === el.dataset.id); if (b) { b.status = el.value; Store.save(); render(); } break; }
      case 'problem-status': {
        const f = findProblem(el.dataset.id);
        if (f) { f.prob.status = el.value; Store.save(); render(); }
        break;
      }
      case 'camp-book-status': {
        const cur = s.camp && s.camp.current;
        if (cur) {
          const b = cur.books.find(x => x.id === el.dataset.id);
          if (b) { b.status = el.value; Store.save(); render(); }
        }
        break;
      }
    }
  }

  /* ---------- 主题 / 初始化 ---------- */
  function applyTheme() { document.documentElement.setAttribute('data-theme', S().settings.theme || 'light'); }

  /* ---------- 打开页面时的智能同步 ----------
   * 规则（比旧版「无条件用云端覆盖」安全）：
   *  1) 没开同步 / 没填钥匙 → 不动；
   *  2) 本机是全空新数据（换网址/新设备）→ 用云端恢复；
   *  3) 云端比本机新（误差 60s 内视为相同）→ 用云端覆盖本机；
   *  4) 本机比云端新 → 补推云端，不覆盖本机。
   * 任一分支都带时间戳比较，避免「云端是旧的却把本机新数据冲掉」。
   */
  function syncTimeOf(st) {
    const t = st && st.meta && st.meta.updatedAt;
    if (!t) return 0;
    const n = Date.parse(t);
    return isNaN(n) ? 0 : n;
  }
  function runAutoSync() {
    if (!window.Sync) return;
    const c = Sync.getConfig();
    if (!c.enabled || !c.apiKey || !c.binId) return;
    Sync.pull().then(function (r) {
      if (!r.ok || !r.state) return; // 网络/云端暂不可用：静默保留本机，下次打开再试
      const local = S(), remote = r.state;
      const localT = syncTimeOf(local), remoteT = syncTimeOf(remote);
      if (Store.isEmptyish(local)) {
        try { Store.replaceState(remote); ui.week = Store.isoWeek(); render(); toast('☁️ 已从云端恢复全部数据'); }
        catch (e) { console.warn('云端数据合并失败', e); }
        return;
      }
      if (!remoteT) return; // 云端是老格式（无时间戳）：保留本机，下次改动会自动带时间戳上传
      if (remoteT > localT + 60000) {
        try { Store.replaceState(remote); ui.week = Store.isoWeek(); render(); toast('☁️ 云端有更新，已自动同步到本机'); }
        catch (e) { console.warn('云端数据合并失败', e); }
      } else if (localT > remoteT + 60000) {
        Sync.schedulePush(local); // 本机较新：补推一份到云端
      }
    }).catch(function () {});
  }

  /* ---------- 首开提示条 ----------
   * 在「新网址/新设备、还没接同步」时提示用户数据在云端，可一键恢复，
   * 避免把空白新数据误当成「数据全丢了」。仅当本机是全空数据时出现，可关闭。
   */
  function maybeBanner() {
    try {
      if (!window.Sync) return;
      if (localStorage.getItem('wb_restore_banner_dismiss')) return;
      const c = Sync.getConfig();
      if (c.enabled || !Store.isEmptyish(S())) return;
      const bar = document.createElement('div');
      bar.style.cssText = 'background:var(--warn,#f59e0b);color:#fff;padding:10px 40px 10px 14px;font-size:13px;line-height:1.7;position:relative;z-index:999;';
      bar.innerHTML = '📢 这是一份<b>空白新数据</b>——你在原来网址记下的内容都在云端，接一下就回来：去「设置 → 云端同步」点<b>「🔓 粘贴同步钥匙」</b>（或手动填 Token + 仓库 ID）即可恢复。'
        + '<button id="wbBannerClose" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);border:none;background:rgba(255,255,255,.25);color:#fff;width:24px;height:24px;border-radius:50%;cursor:pointer;font-size:14px;line-height:1">✕</button>';
      bar.querySelector('#wbBannerClose').onclick = function () { bar.remove(); try { localStorage.setItem('wb_restore_banner_dismiss', '1'); } catch (e) {} };
      document.body.insertBefore(bar, document.body.firstChild);
    } catch (e) { console.warn('提示条渲染失败', e); }
  }

  function init() {
    // 全局错误兜底：任何 JS 异常都直接显示在页面上，方便诊断
    window.addEventListener('error', function (e) {
      try {
        var v = document.getElementById('view');
        if (!v) return;
        v.innerHTML = '<div class="card" style="border-color:var(--danger)"><h2>⚠️ JS 运行时错误</h2><div class="note" style="white-space:pre-wrap;color:var(--danger)">' + (e.message || String(e.error || e)) + '\n\n文件: ' + (e.filename || '') + '\n行: ' + (e.lineno || '') + ':' + (e.colno || '') + '</div></div>';
      } catch (_) {}
    });
    window.addEventListener('unhandledrejection', function (e) {
      try {
        var v = document.getElementById('view');
        if (!v) return;
        v.innerHTML = '<div class="card" style="border-color:var(--danger)"><h2>⚠️ Promise 错误</h2><div class="note" style="white-space:pre-wrap;color:var(--danger)">' + (e.reason && e.reason.message || String(e.reason || '')) + '</div></div>';
      } catch (_) {}
    });
    Store.load();
    applyTheme();
    // 云端同步：注册状态回调 + 首屏自动拉取（打开即同步）
    if (window.Sync) {
      Sync.loadConfig();
      Sync.onStatus(function (st) {
        const map = {
          pulling: ['🔄', '正在从云端拉取…'],
          pushing: ['🔄', '正在同步到云端…'],
          synced: ['✅', '已同步 · ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })],
          idle: ['☁️', '云端暂无数据'],
          error: ['⚠️', '同步出错：' + (st.msg || '')]
        };
        const info = map[st.type] || ['☁️', '同步未开始'];
        ui.syncStatusText = info[1];
        const dot = $('#syncDot');
        if (dot) { dot.textContent = info[0]; dot.title = '云端同步：' + info[1]; dot.className = 'sync-dot' + (st.type === 'error' ? ' err' : (st.type === 'synced' ? ' ok' : (st.type === 'pulling' || st.type === 'pushing' ? ' busy' : ''))); }
        const el = $('#syncStatus');
        if (el) el.textContent = info[1];
      });
    }
    // 全局事件
    document.addEventListener('click', e => {
      const t = e.target.closest('[data-action]'); if (!t) return;
      handleAction(t.dataset.action, t.dataset.id || t.dataset.sec || '', t, e);
    });
    document.addEventListener('submit', e => {
      const f = e.target.closest('form[data-form]'); if (!f) return; e.preventDefault(); handleForm(f.dataset.form, f, e);
    });
    document.addEventListener('paste', e => {
      const ta = e.target.closest('textarea[data-clean="quote"]'); if (!ta) return;
      e.preventDefault();
      const raw = (e.clipboardData || window.clipboardData).getData('text');
      const cleaned = cleanQuote(raw);
      const start = ta.selectionStart, end = ta.selectionEnd;
      ta.value = ta.value.slice(0, start) + cleaned + ta.value.slice(end);
      ta.selectionStart = ta.selectionEnd = start + cleaned.length;
    });
    document.addEventListener('change', e => {
      const t = e.target.closest('[data-change]'); if (!t) return; handleChange(t.dataset.change, t, e);
    });
    window.addEventListener('resize', () => { try { renderNav(); } catch (e) {} });
    $('#importFile').addEventListener('change', e => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const text = reader.result;
          let parsed = JSON.parse(text);
          // 智能识别：如果是 flomo 追加包（_merge=append），则只追加 quotes
          if (parsed && parsed._merge === 'append' && Array.isArray(parsed.quotes)) {
            const s = S();
            const existing = new Set(s.quotes.map(q => q.content + '|' + q.date));
            let added = 0;
            parsed.quotes.forEach(q => {
              if (!existing.has(q.content + '|' + q.date)) {
                s.quotes.unshift({ id: Store.uid(), content: q.content, platform: q.platform || 'flomo', sourceUrl: q.sourceUrl || '', date: q.date, createdAt: q.createdAt || (q.date + ' 00:00:00'), note: q.note || '', pinned: !!q.pinned });
                added++;
              }
            });
            Store.save(); render();
            toast('✅ 已从 flomo 追加 ' + added + ' 条语录（去重后）');
          } else {
            Store.importJSON(text); ui.week = Store.isoWeek(); render();
            toast('已恢复备份');
          }
        } catch (err) { alert('恢复失败：' + err.message); }
      };
      reader.readAsText(file); e.target.value = '';
    });
    const avInput = $('#avatarFile');
    if (avInput) avInput.addEventListener('change', e => {
      const file = e.target.files[0]; if (!file) return;
      const img = new Image();
      const fr = new FileReader();
      fr.onload = () => {
        img.onload = () => {
          const size = 128;
          const canvas = document.createElement('canvas');
          canvas.width = size; canvas.height = size;
          const ctx = canvas.getContext('2d');
          const min = Math.min(img.width, img.height);
          const sx = (img.width - min) / 2, sy = (img.height - min) / 2;
          ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
          S().settings.avatar = canvas.toDataURL('image/jpeg', 0.85);
          Store.save(); renderBrand(); render(); toast('头像已更新');
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
      e.target.value = '';
    });
    const flInput = $('#flomoFile');
    if (flInput) flInput.addEventListener('change', e => {
      const file = e.target.files[0]; if (!file) return;
      const btn = document.querySelector('[data-action="flomo-import"]');
      const old = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = '解析中…'; }
      const fr = new FileReader();
      fr.onload = () => {
        const html = String(fr.result || '');
        const r = runFlomoImport(html);
        if (r.ok) {
          const c = r.counts;
          const total = c.语录 + c.灵感 + c.收藏 + c.感恩 + c.复盘 + c.素材;
          const parts = ['语录 ' + c.语录, '灵感 ' + c.灵感, '收藏 ' + c.收藏, '感恩 ' + c.感恩, '复盘 ' + c.复盘, '素材 ' + c.素材].filter(x => !/\s0$/.test(x));
          render();
          toast('✅ 已从 flomo 导入 ' + total + ' 条（' + parts.join(' · ') + (c.skipped ? ' · 跳过 ' + c.skipped : '') + '）');
        } else {
          alert('flomo 导入失败：' + r.error + '\n\n请检查：\n1. 选的文件是 "五一的笔记.HTML"（.HTML 结尾的文件），不是 file 文件夹或压缩包；\n2. 如果是 flomo 老版本导出的 HTML 结构不同，把报错里的诊断信息发给我，我帮你适配。');
        }
        if (btn) { btn.disabled = false; btn.textContent = old || '📂 从 flomo HTML 文件直接导入'; }
      };
      fr.onerror = () => { alert('文件读取失败'); if (btn) { btn.disabled = false; btn.textContent = old; } };
      fr.readAsText(file, 'utf-8');
      e.target.value = '';
    });
    // 语录编辑面板内支持 Ctrl+V 粘贴图片（截图/剪贴板图片 → 压缩 → IndexedDB）
    document.addEventListener('paste', e => {
      const panel = e.target.closest('.quote-edit-panel');
      if (!panel) return;
      const items = (e.clipboardData || window.clipboardData || {}).items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          e.preventDefault();
          const blob = items[i].getAsFile();
          const imgInput = panel.querySelector('input[name="image"]');
          const status = panel.querySelector('.paste-status');
          if (status) status.textContent = '压缩中…';
          (async () => {
            try {
              const dataURL = await ImgStore.compress(blob, 1200, 0.75);
              const id = 'img_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
              await ImgStore.put(id, dataURL);
              // 缓存到内存并设引用
              ImgStore.cache.set(id, dataURL);
              if (imgInput) { imgInput.value = 'img://' + id; imgInput.style.borderColor = 'var(--good)'; }
              if (status) status.textContent = '✓ 已粘贴（压缩后约 ' + Math.round(dataURL.length / 1024) + ' KB，引用 ' + id + '）';
              toast('图片已粘贴');
            } catch (err) {
              if (status) status.textContent = '粘贴失败：' + err.message;
            }
          })();
          break;
        }
      }
    });
    render();
    // 首屏智能同步（打开即自动对比本机/云端，谁新用谁）+ 全空时的一键恢复提示条
    runAutoSync();
    maybeBanner();
    // 自动迁移：把旧的 dataURL 图片搬到 IndexedDB，释放 localStorage 空间
    if (typeof ImgStore !== 'undefined') {
      const s = S();
      const need = s.quotes.filter(q => typeof q.image === 'string' && q.image.startsWith('data:'));
      if (need.length) {
        (async () => {
          let ok = 0;
          for (const q of need) {
            const id = 'img_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
            try {
              await ImgStore.put(id, q.image);
              q.image = 'img://' + id;
              ok++;
            } catch (e) { console.warn('图片迁移失败', e); }
          }
          if (ok) {
            try { Store.save(); } catch (e) {}
            toast('已迁移 ' + ok + ' 张图片到 IndexedDB（释放 localStorage 空间）');
            render();
          }
        })();
      }
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
