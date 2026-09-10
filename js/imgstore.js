// imgstore.js — 图片存 IndexedDB（避免 localStorage 5MB 上限）
(function (global) {
  'use strict';
  const DB_NAME = 'life_workbench_imgs';
  const STORE = 'images';
  let _db = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { try { req.result.createObjectStore(STORE); } catch (e) {} };
      req.onsuccess = () => { _db = req.result; resolve(_db); };
      req.onerror = () => reject(req.error);
    });
  }

  async function put(id, dataURL) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(dataURL, id);
      tx.oncomplete = () => resolve(id);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function get(id) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function remove(id) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // 同步缓存（render 前批量预加载，避免异步渲染）
  const cache = new Map();
  async function preload(ids) {
    const missing = ids.filter(id => !cache.has(id));
    if (!missing.length) return;
    await Promise.all(missing.map(async id => {
      const url = await get(id);
      if (url) cache.set(id, url);
    }));
  }
  function url(id) { return cache.get(id) || ''; }

  // 压缩图片到最大宽度 1200px，质量 0.75（显著减少 base64 体积）
  function compress(file, maxW = 1200, quality = 0.75) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        const img = new Image();
        img.onload = () => {
          const w = img.width, h = img.height;
          const scale = w > maxW ? maxW / w : 1;
          const cw = Math.round(w * scale), ch = Math.round(h * scale);
          const c = document.createElement('canvas');
          c.width = cw; c.height = ch;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0, cw, ch);
          // 优先 webp，体积更小；不支持则回退 jpeg
          let dataURL;
          try { dataURL = c.toDataURL('image/webp', quality); }
          catch (e) { dataURL = c.toDataURL('image/jpeg', quality); }
          resolve(dataURL);
        };
        img.onerror = reject;
        img.src = fr.result;
      };
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  global.ImgStore = { put, get, remove, cache, preload, url, compress };
})(window);