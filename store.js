// Data layer. Two modes with the same API:
//  - github: everything is saved in a private GitHub repo (data.json + photos/), via the GitHub API.
//            Both of you log in with a token; changes show up on the other device within ~20 seconds.
//  - local:  IndexedDB on this device only (used when config.js has no repo filled in).
(function (scope) {
  'use strict';
  const COLLECTIONS = ['events', 'trips', 'tasks', 'dates', 'wishes', 'diary', 'photos'];
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const clean = value => JSON.parse(JSON.stringify(value));

  // ---------- tiny IndexedDB key-value helper (shared) ----------
  function kv() {
    const memory = new Map();
    const dbPromise = new Promise(resolve => {
      try {
        const req = indexedDB.open('our-little-corner', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('kv');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch { resolve(null); }
    });
    return {
      async get(key) {
        const db = await dbPromise; if (!db) return memory.get(key);
        return new Promise(res => { const r = db.transaction('kv').objectStore('kv').get(key); r.onsuccess = () => res(r.result); r.onerror = () => res(undefined); });
      },
      async put(key, value) {
        const db = await dbPromise; if (!db) { memory.set(key, value); return; }
        return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(value, key); t.oncomplete = res; t.onerror = () => rej(t.error); });
      },
      async del(key) {
        const db = await dbPromise; if (!db) { memory.delete(key); return; }
        return new Promise(res => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').delete(key); t.oncomplete = res; t.onerror = res; });
      }
    };
  }

  // ---------- operations (shared by both modes, so GitHub conflicts can be replayed) ----------
  function emptyData() { const d = { version: 1, meta: {}, collections: {} }; COLLECTIONS.forEach(c => d.collections[c] = []); return d; }
  function applyOp(data, op) {
    if (op.type === 'meta') { data.meta = { ...data.meta, ...op.patch }; return data; }
    const list = data.collections[op.col] || (data.collections[op.col] = []);
    const idx = op.id != null ? list.findIndex(x => x.id === op.id) : -1;
    switch (op.type) {
      case 'set': if (idx >= 0) list[idx] = op.item; else list.push(op.item); break;
      case 'setMany': op.items.forEach(item => { const i = list.findIndex(x => x.id === item.id); if (i >= 0) list[i] = item; else list.push(item); }); break;
      case 'update': if (idx >= 0) list[idx] = { ...list[idx], ...op.patch }; break;
      case 'remove': if (idx >= 0) list.splice(idx, 1); break;
      case 'addComment': if (idx >= 0) { const c = list[idx].comments || []; if (!c.some(x => x.id === op.comment.id)) list[idx] = { ...list[idx], comments: [...c, op.comment] }; } break;
      case 'removeComment': if (idx >= 0) list[idx] = { ...list[idx], comments: (list[idx].comments || []).filter(x => x.id !== op.commentId) }; break;
      case 'meta': data.meta = { ...data.meta, ...op.patch }; break;
    }
    return data;
  }
  const applyAll = (base, ops) => ops.reduce(applyOp, clean(base));

  // ---------- local mode ----------
  function localStore() {
    const db = kv();
    const channel = scope.BroadcastChannel ? new BroadcastChannel('our-little-corner') : null;
    let data = null, onChange = null, queue = Promise.resolve();
    async function load() { data = (await db.get('data')) || emptyData(); COLLECTIONS.forEach(c => data.collections[c] ||= []); }
    const emitAll = () => onChange && COLLECTIONS.forEach(c => onChange(c, data.collections[c]));
    function op(o) {
      const job = queue.then(async () => { await load(); applyOp(data, clean(o)); await db.put('data', data); emitAll(); channel?.postMessage('changed'); });
      queue = job.catch(() => {}); return job;
    }
    if (channel) channel.onmessage = () => { queue = queue.then(async () => { await load(); emitAll(); }); };
    return {
      mode: 'local',
      async start(cb) { onChange = cb; await load(); emitAll(); },
      onAuth(cb) { cb({ name: null }); },
      async signIn() {}, signOut() {},
      pending: () => false,
      async isSeeded() { await load(); return !!data.meta.seeded; },
      seedLocal(initial) {
        const job = queue.then(async () => {
          await load();
          if (data.meta.seeded) return;
          for (const col of COLLECTIONS) {
            const ids = new Set(data.collections[col].map(item => item.id));
            for (const item of initial.collections?.[col] || []) {
              if (!ids.has(item.id)) { data.collections[col].push(clean(item)); ids.add(item.id); }
            }
          }
          data.meta = { ...data.meta, seeded: true };
          await db.put('data', data);
          emitAll(); channel?.postMessage('changed');
        });
        queue = job.catch(() => {}); return job;
      },
      markSeeded: () => op({ type: 'meta', patch: { seeded: true } }),
      set: (col, item) => op({ type: 'set', col, id: item.id, item }),
      update: (col, id, patch) => op({ type: 'update', col, id, patch }),
      remove: async (col, id) => { await op({ type: 'remove', col, id }); if (col === 'photos') await db.del('full:' + id); },
      addComment: (id, comment) => op({ type: 'addComment', col: 'diary', id, comment }),
      removeComment: (id, commentId) => op({ type: 'removeComment', col: 'diary', id, commentId }),
      batchSet: (col, items) => op({ type: 'setMany', col, items }),
      putFull: (id, dataUrl) => db.put('full:' + id, dataUrl),
      getFull: id => db.get('full:' + id)
    };
  }

  // ---------- GitHub mode ----------
  const b64encode = text => { const bytes = new TextEncoder().encode(text); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
  const b64decode = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0)));
  const blobToDataUrl = blob => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });

  function githubStore(gh) {
    const api = (gh.apiBase || 'https://api.github.com') + `/repos/${gh.owner}/${gh.repo}`;
    const branch = gh.branch || 'main';
    const FILE = 'data.json';
    const accountKey = `olc:github:${gh.owner}/${gh.repo}`;
    const stateKey = `github-state:${gh.owner}/${gh.repo}:${branch}`;
    const db = kv();
    const auth = { token: null, name: null };
    try { Object.assign(auth, JSON.parse(localStorage.getItem(accountKey) || '{}')); } catch {}
    let base = emptyData(), sha = null, etag = null, pending = [], started = false;
    let mutationQueue = Promise.resolve(), revision = 0;
    let onChange = null, onStatus = null, flushTimer = null, flushing = null, pollTimer = null;
    const thumbs = new Map(); // photo id -> object URL / data URL
    const loadingThumbs = new Set();

    function gh$(path, opts = {}) {
      const send = () => fetch(api + path, {
        cache: 'no-store', ...opts,
        headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + auth.token, 'X-GitHub-Api-Version': '2022-11-28', ...(opts.headers || {}) }
      });
      if (opts.method === 'PUT' || opts.method === 'DELETE') {
        const job = mutationQueue.then(send); mutationQueue = job.catch(() => {}); return job;
      }
      return send();
    }
    const status = (s, err) => onStatus && onStatus(s, err);
    const persist = () => db.put(stateKey, clean({ base, sha, pending }));
    const clearAuth = () => { localStorage.removeItem(accountKey); auth.token = null; auth.name = null; };
    const view = () => applyAll(base, pending);
    function emit() {
      if (!onChange) return;
      const v = view();
      COLLECTIONS.forEach(c => {
        let items = v.collections[c] || [];
        if (c === 'photos') items = items.map(p => ({ ...p, thumb: thumbs.get(p.id) || '' }));
        onChange(c, items);
      });
      (v.collections.photos || []).forEach(p => { if (!thumbs.has(p.id)) loadThumb(p.id); });
    }

    async function pull() {
      const observedRevision = revision;
      const res = await gh$(`/contents/${FILE}?ref=${branch}`, { headers: etag ? { 'If-None-Match': etag } : {} });
      if (res.status === 304) return false;
      if (res.status === 404) throw new Error('The private calendar data file could not be opened. Check the repository and token access.');
      if (res.status === 401 || res.status === 403) throw Object.assign(new Error('Token is not valid for this repo.'), { code: 'auth' });
      if (!res.ok) throw new Error('GitHub error ' + res.status);
      const json = await res.json();
      let text = json.content ? b64decode(json.content) : '';
      if (!text && json.size) { // files over 1 MB come without content
        const raw = await gh$(`/contents/${FILE}?ref=${branch}`, { headers: { Accept: 'application/vnd.github.raw' } });
        if (!raw.ok) throw new Error('GitHub error ' + raw.status);
        text = await raw.text();
      }
      const parsed = text ? JSON.parse(text) : emptyData();
      if (!parsed.collections || typeof parsed.collections !== 'object') throw new Error('The shared data file is invalid.');
      COLLECTIONS.forEach(c => parsed.collections[c] ||= []); parsed.meta ||= {};
      if (revision !== observedRevision) return false;
      etag = res.headers.get('ETag');
      base = parsed; sha = json.sha;
      await persist();
      return true;
    }
    async function poll() {
      if (document.hidden || flushing || !auth.token) return;
      try { if (await pull()) emit(); status(pending.length ? 'saving' : 'synced'); if (pending.length) scheduleFlush(); }
      catch (err) { status(navigator.onLine === false ? 'offline' : 'error', err); }
    }
    function schedulePoll() { clearInterval(pollTimer); pollTimer = setInterval(poll, (gh.pollSeconds || 20) * 1000); }

    async function flush() {
      if (flushing) return flushing;
      flushing = (async () => {
        while (pending.length) {
          const ops = pending.slice();
          let ok = false;
          for (let attempt = 0; attempt < 4 && !ok; attempt++) {
            const next = applyAll(base, ops);
            const who = auth.name || 'someone';
            const res = await gh$(`/contents/${FILE}`, { method: 'PUT', body: JSON.stringify({ message: `${who}: ${describe(ops)}`, content: b64encode(JSON.stringify(next, null, 1)), branch, ...(sha ? { sha } : {}) }) });
            if (res.ok) { const j = await res.json(); base = next; sha = j.content.sha; etag = null; revision++; ok = true; }
            else if (res.status === 409 || res.status === 422) { etag = null; await pull(); } // someone else saved first: reload, replay our changes
            else if (res.status === 401 || res.status === 403) throw Object.assign(new Error('Token cannot write to this repo.'), { code: 'auth' });
            else throw new Error('GitHub error ' + res.status);
          }
          if (!ok) throw new Error('Could not save after several tries.');
          pending = pending.slice(ops.length);
          await persist();
          emit();
        }
      })();
      try { await flushing; status('synced'); }
      catch (err) { status(navigator.onLine === false ? 'offline' : 'error', err); setTimeout(() => pending.length && scheduleFlush(), 15000); }
      finally { flushing = null; }
    }
    function describe(ops) {
      const o = ops[0], n = ops.length;
      const text = { set: 'save', setMany: 'import', update: 'edit', remove: 'delete', addComment: 'reply', removeComment: 'delete reply', meta: 'setup' }[o.type] || 'update';
      return `${text} ${o.col || ''}${n > 1 ? ` (+${n - 1} more)` : ''}`.trim();
    }
    function scheduleFlush() { clearTimeout(flushTimer); flushTimer = setTimeout(flush, 700); }
    async function op(o) { pending.push(clean(o)); await persist(); status('saving'); emit(); scheduleFlush(); }

    // photos: stored as files photos/<id>.jpg (full) and photos/<id>-thumb.jpg
    async function putFile(path, dataUrl, message) {
      const content = dataUrl.split(',')[1];
      let fileSha;
      for (let attempt = 0; attempt < 4; attempt++) {
        const res = await gh$(`/contents/${path}`, { method: 'PUT', body: JSON.stringify({ message, content, branch, ...(fileSha ? { sha: fileSha } : {}) }) });
        if (res.ok) return;
        if (res.status !== 409 && res.status !== 422) throw new Error('Photo upload failed (' + res.status + ')');
        const current = await gh$(`/contents/${path}?ref=${branch}`);
        if (current.ok) fileSha = (await current.json()).sha;
        else if (current.status !== 404) throw new Error('Photo upload failed (' + current.status + ')');
      }
      throw new Error('The photo could not be uploaded. Please try again.');
    }
    async function getFile(path) {
      const res = await gh$(`/contents/${path}?ref=${branch}`, { headers: { Accept: 'application/vnd.github.raw' } });
      if (!res.ok) return null;
      return blobToDataUrl(new Blob([await res.arrayBuffer()], { type: 'image/jpeg' }));
    }
    async function deleteFile(path, message) {
      const meta = await gh$(`/contents/${path}?ref=${branch}`); if (!meta.ok) return;
      const { sha: fileSha } = await meta.json();
      await gh$(`/contents/${path}`, { method: 'DELETE', body: JSON.stringify({ message, sha: fileSha, branch }) });
    }
    async function loadThumb(id) {
      if (loadingThumbs.has(id)) return; loadingThumbs.add(id);
      let url = await db.get('thumb:' + id);
      if (!url) { url = await getFile(`photos/${id}-thumb.jpg`).catch(() => null); if (url) db.put('thumb:' + id, url).catch(() => {}); }
      loadingThumbs.delete(id);
      if (url) { thumbs.set(id, url); emit(); }
    }

    return {
      mode: 'github',
      async start(cb, statusCb) {
        onChange = cb; onStatus = statusCb; status('connecting');
        const cached = await db.get(stateKey);
        if (cached) { base = cached.base; sha = cached.sha; pending = cached.pending || []; emit(); }
        try { await pull(); started = true; emit(); status(pending.length ? 'saving' : 'synced'); }
        catch (err) { if (!cached) throw err; started = true; status(navigator.onLine === false ? 'offline' : 'error', err); }
        schedulePoll(); if (pending.length) scheduleFlush();
        document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
        scope.addEventListener('online', () => { poll(); if (pending.length) scheduleFlush(); });
        scope.addEventListener('beforeunload', e => { if (pending.length || flushing) { e.preventDefault(); e.returnValue = ''; } });
      },
      onAuth(cb) {
        if (!auth.token) { cb(null); return; }
        this.verify().then(() => cb({ name: auth.name })).catch(err => { if (err.code === 'auth') { clearAuth(); cb(null, err); } else cb({ name: auth.name }); });
      },
      async verify() {
        const res = await gh$('');
        if (res.status === 401 || res.status === 403 || res.status === 404) throw Object.assign(new Error('This token cannot open the repo.'), { code: 'auth' });
        if (!res.ok) throw new Error('GitHub error ' + res.status);
        const repo = await res.json();
        if (!repo.private) throw Object.assign(new Error('Please use a private data repository.'), { code: 'auth' });
        if (repo.permissions && !repo.permissions.push) throw Object.assign(new Error('This token can read but not write. Give it Contents: Read and write.'), { code: 'auth' });
      },
      async signIn(token, name) {
        auth.token = token.trim(); auth.name = name;
        try { await this.verify(); } catch (e) { auth.token = null; throw e; }
        localStorage.setItem(accountKey, JSON.stringify({ token: auth.token, name }));
      },
      clearAuth,
      signOut() { clearAuth(); clearInterval(pollTimer); location.reload(); },
      pending: () => pending.length > 0 || !!flushing,
      async isSeeded() { if (!started) await pull(); return !!view().meta.seeded; },
      markSeeded: () => op({ type: 'meta', patch: { seeded: true } }),
      async set(col, item) {
        if (col === 'photos' && item.thumb && item.thumb.startsWith('data:')) {
          await putFile(`photos/${item.id}-thumb.jpg`, item.thumb, `${auth.name || 'someone'}: add photo`);
          const thumb = item.thumb; thumbs.set(item.id, thumb); db.put('thumb:' + item.id, thumb).catch(() => {});
          item = { ...item, thumb: '' };
          return op({ type: 'set', col, id: item.id, item });
        }
        return op({ type: 'set', col, id: item.id, item });
      },
      update: (col, id, patch) => op({ type: 'update', col, id, patch }),
      remove(col, id) {
        if (col === 'photos') {
          thumbs.delete(id); db.del('thumb:' + id); db.del('full:' + id);
          deleteFile(`photos/${id}-thumb.jpg`, 'delete photo').catch(() => {});
          deleteFile(`photos/${id}.jpg`, 'delete photo').catch(() => {});
        }
        return op({ type: 'remove', col, id });
      },
      addComment: (id, comment) => op({ type: 'addComment', col: 'diary', id, comment }),
      removeComment: (id, commentId) => op({ type: 'removeComment', col: 'diary', id, commentId }),
      batchSet: (col, items) => op({ type: 'setMany', col, items }),
      async putFull(id, dataUrl) { db.put('full:' + id, dataUrl).catch(() => {}); await putFile(`photos/${id}.jpg`, dataUrl, `${auth.name || 'someone'}: add photo`); },
      async getFull(id) { let url = await db.get('full:' + id); if (!url) { url = await getFile(`photos/${id}.jpg`); if (url) db.put('full:' + id, url).catch(() => {}); } return url; }
    };
  }

  function create(config) {
    const gh = config && config.github;
    return gh && gh.owner && gh.repo ? githubStore(gh) : localStore();
  }

  // Resize a photo to a JPEG data URL.
  function resizeImage(file, maxSide, quality) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale);
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        let q = quality, data = canvas.toDataURL('image/jpeg', q);
        while (data.length > 1400000 && q > 0.35) { q -= 0.1; data = canvas.toDataURL('image/jpeg', q); }
        resolve(data);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This image could not be read.')); };
      img.src = url;
    });
  }

  scope.CCStore = { create, uid, resizeImage, COLLECTIONS };
})(window);
