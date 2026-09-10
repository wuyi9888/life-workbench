/* ============================================================
 * sync.js — 云端同步层（手机 / 电脑共享同一份数据）
 * 后端：JSONBin.io（免服务器，前端直连，开放 CORS）
 * 安全：可选「同步密码」用 AES-GCM 客户端加密，存储方只看密文
 * 配置：每设备本地保存（apiKey / passphrase / binId），不随状态同步
 * ============================================================ */
(function (global) {
  'use strict';

  const CFG_KEY = 'life_workbench_sync_cfg';
  const GIST_FILE = 'life-workbench.json'; // GitHub Gist 里的文件名
  const PROVIDERS = {
    jsonbin: {
      label: 'JSONBin.io',
      create: function (key, body) {
        return { url: 'https://api.jsonbin.io/v3/b', headers: { 'Content-Type': 'application/json', 'X-Master-Key': key }, method: 'POST', body: body };
      },
      read: function (key, bin) {
        return { url: 'https://api.jsonbin.io/v3/b/' + bin, headers: { 'X-Master-Key': key }, method: 'GET' };
      },
      write: function (key, bin, body) {
        return { url: 'https://api.jsonbin.io/v3/b/' + bin, headers: { 'Content-Type': 'application/json', 'X-Master-Key': key }, method: 'PUT', body: body };
      },
      parseCreate: function (j) { return j && j.metadata && j.metadata.id; },
      parseRead: function (j) { return j && j.record; }
    },
    github: {
      label: 'GitHub Gist',
      gistFile: GIST_FILE,
      create: function (key, env) {
        var files = {}; files[GIST_FILE] = { content: JSON.stringify(env) };
        return {
          url: 'https://api.github.com/gists',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key, 'Accept': 'application/vnd.github+json' },
          method: 'POST',
          body: { description: '生活副业台 · 云端同步数据', public: false, files: files }
        };
      },
      read: function (key, bin) {
        return { url: 'https://api.github.com/gists/' + bin, headers: { 'Authorization': 'Bearer ' + key, 'Accept': 'application/vnd.github+json' }, method: 'GET' };
      },
      write: function (key, bin, env) {
        var files = {}; files[GIST_FILE] = { content: JSON.stringify(env) };
        return {
          url: 'https://api.github.com/gists/' + bin,
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key, 'Accept': 'application/vnd.github+json' },
          method: 'PATCH',
          body: { files: files }
        };
      },
      parseCreate: function (j) { return j && j.id; },
      parseRead: function (j) {
        if (!j || !j.files || !j.files[GIST_FILE]) return null;
        try { return JSON.parse(j.files[GIST_FILE].content); } catch (e) { return null; }
      }
    }
  };

  let cfg = null;
  let statusCb = null;
  let pushTimer = null;
  let pushing = false;

  function loadConfig() {
    try {
      const raw = localStorage.getItem(CFG_KEY);
      cfg = raw ? JSON.parse(raw) : { enabled: false, provider: 'github', apiKey: '', binId: '', passphrase: '' };
    } catch (e) { cfg = { enabled: false, provider: 'github', apiKey: '', binId: '', passphrase: '' }; }
    return cfg;
  }
  function saveConfig() {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {}
  }
  function getConfig() { return cfg || loadConfig(); }
  function setConfig(c) { cfg = Object.assign(getConfig(), c); saveConfig(); }
  function clearConfig() { cfg = { enabled: false, provider: 'github', apiKey: '', binId: '', passphrase: '' }; saveConfig(); }

  function onStatus(cb) { statusCb = cb; }
  function emit(s) { if (statusCb) { try { statusCb(s); } catch (e) {} } }

  /* ---------- 加密 ---------- */
  function cryptoOK() { return !!(global.crypto && global.crypto.subtle); }
  function b64(buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))); }
  function unb64(s) { const b = atob(s); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) { a[i] = b.charCodeAt(i); } return a; }

  async function deriveKey(pass, salt) {
    const enc = new TextEncoder();
    const mat = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' },
      mat, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
  }
  async function encryptState(state, pass) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(pass, salt);
    const data = new TextEncoder().encode(JSON.stringify(state));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, data);
    return { _sync: true, enc: true, salt: b64(salt.buffer), iv: b64(iv.buffer), ct: b64(ct) };
  }
  async function decryptState(env, pass) {
    const key = await deriveKey(pass, unb64(env.salt));
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv) }, key, unb64(env.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  }
  async function envelope(state, pass) {
    if (pass) {
      if (!cryptoOK()) throw new Error('当前环境不支持加密（需 https），请留空密码或改用部署网址');
      return encryptState(state, pass);
    }
    return { _sync: true, enc: false, data: state };
  }
  async function unwrap(blob, pass) {
    if (blob && blob._sync) {
      if (blob.enc) {
        if (!pass) throw new Error('需要同步密码才能解密');
        return decryptState(blob, pass);
      }
      return blob.data;
    }
    return blob;
  }

  /* ---------- 网络 ---------- */
  async function req(opts) {
    const ctrl = new AbortController();
    const t = setTimeout(function () { ctrl.abort(); }, 15000);
    try {
      const res = await fetch(opts.url, {
        method: opts.method,
        headers: opts.headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: ctrl.signal
      });
      clearTimeout(t);
      return res;
    } catch (e) { clearTimeout(t); throw e; }
  }
  async function createBin(env) {
    const p = PROVIDERS[cfg.provider];
    const r = p.create(cfg.apiKey, env);
    const res = await req(r);
    if (!res.ok) throw new Error('创建云端仓库失败 ' + res.status);
    const j = await res.json();
    const id = p.parseCreate(j);
    if (!id) throw new Error('创建云端仓库返回异常');
    return id;
  }
  async function readBin() {
    const p = PROVIDERS[cfg.provider];
    const res = await req(p.read(cfg.apiKey, cfg.binId));
    if (res.status === 404) return { notFound: true };
    if (!res.ok) throw new Error('读取云端失败 ' + res.status);
    const j = await res.json();
    return { data: p.parseRead(j) };
  }
  async function writeBin(env) {
    const p = PROVIDERS[cfg.provider];
    const res = await req(p.write(cfg.apiKey, cfg.binId, env));
    if (!res.ok) throw new Error('写入云端失败 ' + res.status);
  }

  /* ---------- 对外 API ---------- */
  async function pull() {
    const c = getConfig();
    if (!c.enabled || !c.apiKey) return { ok: false, reason: 'disabled' };
    emit({ type: 'pulling' });
    try {
      if (!c.binId) { emit({ type: 'idle' }); return { ok: false, reason: 'nobin' }; }
      const r = await readBin();
      if (r.notFound) { emit({ type: 'idle' }); return { ok: false, reason: 'empty' }; }
      const state = await unwrap(r.data, c.passphrase);
      emit({ type: 'synced' });
      return { ok: true, state: state };
    } catch (e) {
      emit({ type: 'error', msg: e.message });
      return { ok: false, reason: e.message };
    }
  }

  async function push(state) {
    const c = getConfig();
    if (!c.enabled || !c.apiKey) return { ok: false, reason: 'disabled' };
    if (pushing) return { ok: false, reason: 'busy' };
    pushing = true; emit({ type: 'pushing' });
    try {
      const env = await envelope(state, c.passphrase);
      if (c.binId) {
        await writeBin(env);
      } else {
        const id = await createBin(env);
        cfg.binId = id; saveConfig();
      }
      emit({ type: 'synced' });
      return { ok: true };
    } catch (e) {
      emit({ type: 'error', msg: e.message });
      return { ok: false, reason: e.message };
    } finally { pushing = false; }
  }

  function schedulePush(state) {
    const c = getConfig();
    if (!c.enabled || !c.apiKey) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(function () { push(state); }, 800);
  }

  function getBinId() { return getConfig().binId; }
  function cryptoAvailable() { return cryptoOK(); }

  /* ---------- 「同步钥匙」：一份字符串带走全部同步配置 ----------
   * 用途：换网址 / 换设备时，不用重新填三个框。
   * 复制 → 存到备忘录/网盘；新网址打开 → 粘贴导入 → 自动接上云端并恢复数据。
   * 注意：钥匙里含 Token，等同账号凭证，请勿外传。
   */
  function exportKey() {
    const c = getConfig();
    return JSON.stringify({ p: c.provider, k: c.apiKey, b: c.binId, s: c.passphrase });
  }
  function importKey(str) {
    const j = JSON.parse(str);
    if (!j || typeof j !== 'object') throw new Error('钥匙格式不对');
    const prov = (j.p && PROVIDERS[j.p]) ? j.p : 'github';
    cfg = {
      enabled: !!(j.k),
      provider: prov,
      apiKey: String(j.k || ''),
      binId: String(j.b || ''),
      passphrase: String(j.s || '')
    };
    saveConfig();
    return cfg;
  }

  global.Sync = {
    loadConfig: loadConfig, saveConfig: saveConfig, getConfig: getConfig,
    setConfig: setConfig, clearConfig: clearConfig,
    onStatus: onStatus, pull: pull, push: push, schedulePush: schedulePush,
    getBinId: getBinId, cryptoAvailable: cryptoAvailable, PROVIDERS: PROVIDERS,
    exportKey: exportKey, importKey: importKey
  };
})(window);
