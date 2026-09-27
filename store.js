// Data layer. Two modes with the same API:
//  - github: everything is saved in a private GitHub repo (data.json + photos/), via the GitHub API.
//            Both of you log in with a token; changes show up on the other device within ~20 seconds.
//  - local:  IndexedDB on this device only (used when config.js has no repo filled in).
(function (scope) {
  'use strict';
  const COLLECTIONS = ['events', 'trips', 'tasks', 'dates', 'wishes', 'diary', 'photos', 'albums', 'answers', 'questions', 'checkins'];
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
        // a full disk aborts the transaction (QuotaExceededError) instead of firing error, so listen for both
        return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(value, key); t.oncomplete = res; t.onerror = t.onabort = () => rej(t.error || new Error('Could not save on this device.')); });
      },
      async del(key) {
        const db = await dbPromise; if (!db) { memory.delete(key); return; }
        return new Promise(res => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').delete(key); t.oncomplete = res; t.onerror = t.onabort = res; });
      },
      async drop(test) { // every key that passes test, in one go
        const db = await dbPromise; if (!db) { [...memory.keys()].filter(test).forEach(k => memory.delete(k)); return; }
        return new Promise(res => { const t = db.transaction('kv', 'readwrite'), s = t.objectStore('kv'), r = s.getAllKeys(); r.onsuccess = () => r.result.filter(test).forEach(k => s.delete(k)); t.oncomplete = res; t.onerror = t.onabort = res; });
      }
    };
  }
  // Pictures are kept on the device as Blobs (older versions kept data URLs, a third bigger, which are turned into Blobs when read)
  function dataUrlToBlob(url) {
    try { const i = url.indexOf(','), bin = atob(url.slice(i + 1)), bytes = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k); return new Blob([bytes], { type: url.slice(5, url.indexOf(';')) || 'image/jpeg' }); }
    catch { return null; }
  }
  async function readPicture(db, key) { // a Blob, or undefined; an old data URL is turned into a Blob and saved again as one
    const v = await db.get(key); if (typeof v !== 'string') return v || undefined;
    const blob = dataUrlToBlob(v); if (blob) db.put(key, blob).catch(() => {}); return blob || undefined;
  }

  // ---------- operations (shared by both modes, so GitHub conflicts can be replayed) ----------
  function emptyData() { const d = { version: 1, meta: {}, collections: {} }; COLLECTIONS.forEach(c => d.collections[c] = []); return d; }
  // mergeMeta rules: arrays -> union (order kept, no duplicates); numbers -> max (or min when num is 'min');
  // plain objects -> merged key by key; anything else or a type mismatch -> the new value; null/undefined -> keep what's there
  const isPlain = v => !!v && typeof v === 'object' && !Array.isArray(v);
  function mergeValue(cur, val, num) {
    if (val == null) return cur;
    if (Array.isArray(val)) {
      if (!Array.isArray(cur)) return val;
      const seen = new Set(), out = [];
      for (const x of [...cur, ...val]) { const k = JSON.stringify(x); if (!seen.has(k)) { seen.add(k); out.push(x); } }
      return out;
    }
    if (typeof val === 'number') return typeof cur === 'number' ? (num === 'min' ? Math.min(cur, val) : Math.max(cur, val)) : val;
    if (isPlain(val)) {
      const out = isPlain(cur) ? { ...cur } : {};
      for (const [k, v] of Object.entries(val)) { const m = mergeValue(out[k], v, num); if (m === undefined) delete out[k]; else out[k] = m; }
      return out;
    }
    return val;
  }
  function applyOp(data, op) {
    if (op.type === 'meta') { data.meta = { ...data.meta, ...op.patch }; return data; }
    if (op.type === 'inboxRead') {
      const reads = data.meta?.inboxReads || {};
      const current = reads[op.who] || {};
      const since = Math.max(Number(current.since) || Number(op.since) || 0, Number(op.cutoff) || 0);
      const items = new Map();
      for (const item of [...(current.read || []), ...(op.items || [])]) {
        if (item && typeof item.key === 'string' && Number(item.at) > since) items.set(item.key, { key: item.key, at: Number(item.at) });
      }
      data.meta = { ...data.meta, inboxReads: { ...reads, [op.who]: { since, read: [...items.values()] } } };
      return data;
    }
    // one entry inside a shared meta object (avatars.sijie, kindColors.trip): replaying it after a conflict keeps the other entries; null removes it
    if (op.type === 'metaKey') {
      const cur = data.meta?.[op.key], next = cur && typeof cur === 'object' && !Array.isArray(cur) ? { ...cur } : {};
      if (op.value == null) delete next[op.sub]; else next[op.sub] = op.value;
      data.meta = { ...data.meta, [op.key]: next };
      return data;
    }
    if (op.type === 'mergeMeta') { // two devices' copies combine instead of the later one winning (see mergeValue)
      const merged = mergeValue(data.meta?.[op.key], op.value, op.num);
      if (merged !== undefined) data.meta = { ...data.meta, [op.key]: merged };
      return data;
    }
    if (op.type === 'setAll') { (op.items || []).forEach(({ col, item }) => applyOp(data, { type: 'set', col, id: item.id, item })); return data; } // records in several collections as one change, e.g. an entry and its photos
    const list = data.collections[op.col] || (data.collections[op.col] = []);
    const idx = op.id != null ? list.findIndex(x => x.id === op.id) : -1;
    switch (op.type) {
      case 'set': if (idx >= 0) list[idx] = op.item; else list.push(op.item); break;
      case 'setMany': op.items.forEach(item => { const i = list.findIndex(x => x.id === item.id); if (i >= 0) list[i] = item; else list.push(item); }); break;
      case 'update': if (idx >= 0) list[idx] = { ...list[idx], ...op.patch }; break;
      case 'remove': if (idx >= 0) list.splice(idx, 1); break;
      case 'removeMany': { const gone = new Set(op.ids || []); for (let i = list.length - 1; i >= 0; i--) if (gone.has(list[i].id)) list.splice(i, 1); break; } // one change, e.g. undoing an import
      case 'addComment': if (idx >= 0) { const c = list[idx].comments || []; if (!c.some(x => x.id === op.comment.id)) list[idx] = { ...list[idx], comments: [...c, op.comment] }; } break;
      case 'removeComment': if (idx >= 0) list[idx] = { ...list[idx], comments: (list[idx].comments || []).filter(x => x.id !== op.commentId) }; break;
      case 'meta': data.meta = { ...data.meta, ...op.patch }; break;
    }
    return data;
  }
  // Changes are replayed on a copy that shares what they don't touch: applyOp only swaps items and meta for new ones and edits
  // the lists, so a copy of each list a change touches is enough (the page and the queue never edit an item in place)
  function applyAll(base, ops) {
    const data = { ...base, collections: { ...base.collections } }, copied = new Set();
    for (const op of ops) {
      for (const col of op.type === 'setAll' ? (op.items || []).map(x => x.col) : op.col ? [op.col] : []) if (!copied.has(col)) { copied.add(col); data.collections[col] = [...(data.collections[col] || [])]; }
      applyOp(data, op);
    }
    return data;
  }

  // ---------- local mode ----------
  function localStore() {
    const db = kv();
    const channel = scope.BroadcastChannel ? new BroadcastChannel('our-little-corner') : null;
    let data = null, onChange = null, queue = Promise.resolve();
    async function load() { data = (await db.get('data')) || emptyData(); COLLECTIONS.forEach(c => data.collections[c] ||= []); }
    const emitAll = () => { if (!onChange) return; COLLECTIONS.forEach(c => onChange(c, data.collections[c])); onChange('meta', data.meta || {}); };
    // here a photo's thumbnail lives in the data record as a data URL: anything else (a page's blob: link, a Blob) keeps the saved one
    const odd = t => t != null && t !== '' && !(typeof t === 'string' && t.startsWith('data:'));
    function keepThumbs(o) {
      const saved = id => (data.collections.photos || []).find(p => p.id === id)?.thumb || '', fix = item => (odd(item.thumb) ? { ...item, thumb: saved(item.id) } : item);
      if (o.col === 'photos' && o.type === 'set') o.item = fix(o.item);
      if (o.col === 'photos' && o.type === 'setMany') o.items = o.items.map(fix);
      if (o.col === 'photos' && o.type === 'update' && odd(o.patch?.thumb)) delete o.patch.thumb;
      if (o.type === 'setAll') o.items = o.items.map(x => (x.col === 'photos' ? { ...x, item: fix(x.item) } : x));
      return o;
    }
    function op(o) {
      const job = queue.then(async () => { await load(); applyOp(data, keepThumbs(clean(o))); await db.put('data', data); emitAll(); channel?.postMessage('changed'); });
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
      markSeeded: () => op({ type: 'meta', patch: { seeded: true } }),
      setMeta: patch => op({ type: 'meta', patch }),
      metaKey: (key, sub, value) => op({ type: 'metaKey', key, sub, value }),
      mergeMeta: (key, value, num = 'max') => op({ type: 'mergeMeta', key, value, num }),
      markInboxRead: (who, since, cutoff, items) => op({ type: 'inboxRead', who, since, cutoff, items }),
      set: (col, item) => op({ type: 'set', col, id: item.id, item }),
      update: (col, id, patch) => op({ type: 'update', col, id, patch }),
      remove: async (col, id) => { await op({ type: 'remove', col, id }); if (col === 'photos') await db.del('full:' + id); },
      async removeMany(col, ids) { if (col === 'photos') { for (const id of ids) await this.remove(col, id); return; } return op({ type: 'removeMany', col, ids: [...ids] }); },
      addComment: (id, comment) => op({ type: 'addComment', col: 'diary', id, comment }),
      removeComment: (id, commentId) => op({ type: 'removeComment', col: 'diary', id, commentId }),
      batchSet: (col, items) => op({ type: 'setMany', col, items }),
      saveAll: changes => op({ type: 'setAll', items: changes }),
      async uploadPhoto(item, full) { await this.putFull(item.id, full); return item; },
      discard: ids => Promise.all(ids.map(id => db.del('full:' + id))),
      dropFull(id) { // an old top picture (see the GitHub mode one)
        const job = queue.then(async () => { await load(); if (id && data.meta.hero !== id && !data.collections.photos.some(p => p.id === id)) await db.del('full:' + id); });
        queue = job.catch(() => {}); return job;
      },
      putFull: (id, dataUrl) => db.put('full:' + id, dataUrlToBlob(dataUrl) || dataUrl),
      getFull: id => readPicture(db, 'full:' + id) // a Blob
    };
  }

  // ---------- GitHub mode ----------
  const b64encode = text => { const bytes = new TextEncoder().encode(text); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
  const b64decode = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0)));

  function githubStore(gh) {
    const api = (gh.apiBase || 'https://api.github.com') + `/repos/${gh.owner}/${gh.repo}`;
    const branch = gh.branch || 'main';
    const FILE = 'data.json';
    const stateKey = `github-state:${gh.owner}/${gh.repo}:${branch}`;
    const db = kv();
    const auth = { token: null, name: null };
    try { Object.assign(auth, JSON.parse(localStorage.getItem('olc:github') || '{}')); } catch {}
    let base = emptyData(), sha = null, etag = null, pending = [], started = false, verified = false;
    let mutationQueue = Promise.resolve(), revision = 0;
    let onChange = null, onStatus = null, flushTimer = null, flushing = null, pollTimer = null, listening = false, retryStart = null;
    const thumbs = new Map(); // photo id -> thumbnail Blob (the page makes a link for it when it shows it)
    const loadingThumbs = new Set();
    const thumbFails = new Map(); // photo id -> { n, at }: a failed thumb download waits until `at` before trying again
    const thumbQueue = []; let thumbActive = 0, thumbEmit = null, thumbLast = 0, shown = null; // shown: the photo list of the last full update
    const superseded = new Map(); // data.json shas our own saves replaced -> when; GitHub can briefly serve those again
    const fileShas = new Map(); // photo id -> { full, thumb }: shas of its files uploaded in this session
    let fileDeletes = []; // photo files still to delete on GitHub, [{ path, sha }]; kept across reloads, retried until done
    let deleting = null, deleteFails = 0, deleteTimer = null;
    let fullCache = []; // ids of full photos cached on this device, oldest first (all are on GitHub too, so they can be dropped)
    let warned = false, evictedOld = false, closed = false; // closed: logging out, nothing is saved on this device any more
    let busyUntil = 0, busyTimer = null; // GitHub rate limit: no requests until then

    // Every request goes through here. While GitHub is busy nothing is sent; a rate-limited answer starts that wait.
    function gh$(path, opts = {}) {
      const send = () => Date.now() < busyUntil ? Promise.reject(busyError(busyUntil)) : fetch(api + path, {
        cache: 'no-store', ...opts,
        headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + auth.token, 'X-GitHub-Api-Version': '2022-11-28', ...(opts.headers || {}) }
      }).then(async res => { const until = await limitedUntil(res); if (until) throw pause(until); return res; }, err => { if (err?.name === 'TypeError') err.code ||= 'offline'; throw err; }); // no answer at all: offline, most likely
      if (opts.method === 'PUT' || opts.method === 'DELETE') {
        const job = mutationQueue.then(send); mutationQueue = job.catch(() => {}); return job;
      }
      return send();
    }
    // A rate limit (403/404 with x-ratelimit-remaining 0, retry-after or a "rate limit" message, or any 429) is temporary,
    // so the token stays. Returns when to try again, as GitHub advises: retry-after, else x-ratelimit-reset when none are left, else a minute; or 0.
    async function limitedUntil(res) {
      if (res.status !== 403 && res.status !== 404 && res.status !== 429) return 0;
      const h = k => res.headers.get(k), now = Date.now();
      if (res.status !== 429 && h('x-ratelimit-remaining') !== '0' && h('retry-after') == null) {
        const body = await (res.clone ? res.clone() : res).json().catch(() => null);
        if (!/rate limit/i.test((body && body.message) || '')) return 0;
      }
      const after = Number(h('retry-after')), reset = h('x-ratelimit-remaining') === '0' ? Number(h('x-ratelimit-reset')) * 1000 : 0;
      return now + (after > 0 ? after * 1000 : reset > now ? reset - now : 60000);
    }
    const busyError = (until, login) => { const n = Math.max(1, Math.ceil((until - Date.now()) / 60000)); return Object.assign(new Error(login ? `GitHub is busy, try again in ${n} min.` : `GitHub is busy, trying again in ${n} min.`), { code: 'ratelimit', until }); };
    function pause(until) { // polls and saves wait (an online event or tab focus doesn't skip it); the status ticks each minute, then sync resumes
      busyUntil = Math.max(busyUntil, until);
      const tick = () => {
        const left = busyUntil - Date.now();
        if (left > 0) { status('ratelimited'); busyTimer = setTimeout(tick, left % 60000 || 60000); return; }
        poll(); if (pending.length) scheduleFlush(); else deleteFiles();
      };
      clearTimeout(busyTimer); busyTimer = setTimeout(tick, (busyUntil - Date.now()) % 60000 || 60000);
      status('ratelimited');
      return busyError(busyUntil);
    }
    const status = (s, err) => { if (!onStatus) return; if (Date.now() < busyUntil) onStatus('ratelimited', busyError(busyUntil)); else onStatus(s, err); };
    // The device copy is a cache: when storage is full, drop old full photos and try once more, else carry on (logged once).
    async function cachePut(key, value) {
      if (closed) return false;
      try { await db.put(key, value); return true; } catch {}
      await evictFull();
      try { await db.put(key, value); return true; }
      catch (err) { if (!warned) { warned = true; console.warn('This device is out of storage; the app keeps working but saves less for offline use.', err); } return false; }
    }
    async function evictFull() { // oldest half of the full-photo cache; the first time also copies cached before this list existed
      const drop = fullCache.splice(0, Math.ceil(fullCache.length / 2));
      if (!evictedOld) { evictedOld = true; const known = new Set(fullCache); drop.push(...(base.collections.photos || []).map(p => p.id).filter(id => !known.has(id)), ...(base.meta?.hero && !known.has(base.meta.hero) ? [base.meta.hero] : [])); }
      await Promise.all(drop.map(id => db.del('full:' + id)));
    }
    const keepFull = id => { fullCache = [...fullCache.filter(x => x !== id), id]; };
    const persist = () => cachePut(stateKey, { base, sha, pending, files: fileDeletes, fullCache }); // IndexedDB copies it; all of it is plain JSON already
    const view = () => applyAll(base, pending);
    const withThumbs = list => list.map(p => ({ ...p, thumb: thumbs.get(p.id) || '' }));
    function emit() {
      if (!onChange) return;
      const v = view(); shown = v.collections.photos || [];
      COLLECTIONS.forEach(c => onChange(c, c === 'photos' ? withThumbs(shown) : v.collections[c] || []));
      onChange('meta', v.meta || {});
      shown.forEach(p => { if (!thumbs.has(p.id)) loadThumb(p.id); });
    }

    async function pull(force) {
      const observedRevision = revision;
      const res = await gh$(`/contents/${FILE}?ref=${branch}`, { headers: etag ? { 'If-None-Match': etag } : {} });
      if (res.status === 304) return false;
      if (res.status === 404 && verified && !sha) { // the repo opens but has no data.json yet: start empty, the first save creates it
        if (revision !== observedRevision) return false;
        base = emptyData(); etag = null;
        await persist();
        return true;
      }
      if (res.status === 404) throw new Error('The private data file could not be opened. Check the repository and token access.');
      if (res.status === 401 || res.status === 403) throw Object.assign(new Error('Token is not valid for this repo.'), { code: 'auth' });
      if (!res.ok) throw new Error('GitHub error ' + res.status);
      const json = await res.json();
      if (!force && json.sha === sha && revision === observedRevision) { etag = res.headers.get('ETag'); return false; } // the file we have already (on launch, or the first check after our own save)
      if (!force && json.sha !== sha && Date.now() - (superseded.get(json.sha) || 0) < 30000) return false; // a lagging copy from before our own save
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
      if (document.hidden || flushing || !auth.token || Date.now() < busyUntil) return;
      if (retryStart) { const retry = retryStart; retryStart = null; retry(); return; } // the first load failed: start() tries again
      try { if (await pull()) emit(); else retryThumbs(); status(pending.length ? 'saving' : 'synced'); if (pending.length) scheduleFlush(); }
      catch (err) { status(navigator.onLine === false ? 'offline' : 'error', err); }
    }
    function schedulePoll() { clearInterval(pollTimer); pollTimer = setInterval(poll, (gh.pollSeconds || 20) * 1000); }
    function listen() {
      if (listening) return; listening = true;
      schedulePoll();
      document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
      scope.addEventListener('online', () => { thumbFails.forEach(f => { f.at = 0; }); deleteFails = 0; poll(); if (pending.length) scheduleFlush(); else deleteFiles(); });
      scope.addEventListener('beforeunload', e => { if (pending.length || flushing) { e.preventDefault(); e.returnValue = ''; } });
    }

    async function flush() {
      if (flushing) return flushing;
      if (Date.now() < busyUntil) { scheduleFlush(); return; }
      flushing = (async () => {
        while (pending.length) {
          const ops = pending.slice();
          let ok = false, merged = false;
          for (let attempt = 0; attempt < 4 && !ok; attempt++) {
            const next = applyAll(base, ops);
            const who = auth.name || 'someone';
            const res = await gh$(`/contents/${FILE}`, { method: 'PUT', body: JSON.stringify({ message: `${who}: ${describe(ops)}`, content: b64encode(JSON.stringify(next, null, 1)), branch, ...(sha ? { sha } : {}) }) });
            if (res.ok) {
              const j = await res.json(), now = Date.now();
              if (sha) { superseded.forEach((at, s) => { if (now - at > 30000) superseded.delete(s); }); superseded.set(sha, now); }
              base = next; sha = j.content.sha; etag = null; revision++; ok = true;
            }
            else if (res.status === 409 || res.status === 422) { etag = null; await pull(true); merged = true; } // someone else saved first: reload, replay our changes
            else if (res.status === 401 || res.status === 403) throw Object.assign(new Error('Token cannot write to this repo.'), { code: 'auth' });
            else throw new Error('GitHub error ' + res.status);
          }
          if (!ok) throw new Error('Could not save after several tries.');
          pending = pending.slice(ops.length);
          await persist();
          if (merged) emit(); // else what was saved is what the page shows already
        }
      })();
      try { await flushing; status('synced'); }
      catch (err) { status(navigator.onLine === false ? 'offline' : 'error', err); setTimeout(() => pending.length && scheduleFlush(), 15000); }
      finally { flushing = null; }
      await deleteFiles();
    }
    function describe(ops) {
      const o = ops[0], n = ops.length;
      const text = { set: 'save', setAll: 'save', setMany: 'import', update: 'edit', remove: 'delete', removeMany: 'delete', addComment: 'reply', removeComment: 'delete reply', meta: 'setup', metaKey: 'setup', mergeMeta: 'sync', inboxRead: 'read messages' }[o.type] || 'update';
      const col = o.col || [...new Set((o.items || []).map(x => x.col))].join(' + '); // setAll: 'diary + photos'
      return `${text} ${col}${n > 1 ? ` (+${n - 1} more)` : ''}`.trim();
    }
    function scheduleFlush() { clearTimeout(flushTimer); flushTimer = setTimeout(flush, Math.max(700, busyUntil - Date.now())); }
    async function op(o) { pending.push(clean(o)); await persist(); status('saving'); emit(); scheduleFlush(); }

    // photos: stored as files photos/<id>.jpg (full) and photos/<id>-thumb.jpg
    async function putFile(path, dataUrl, message) { // resolves to the new file's sha
      const content = dataUrl.split(',')[1];
      let fileSha;
      for (let attempt = 0; attempt < 4; attempt++) {
        const res = await gh$(`/contents/${path}`, { method: 'PUT', body: JSON.stringify({ message, content, branch, ...(fileSha ? { sha: fileSha } : {}) }) });
        if (res.ok) return (await res.json().catch(() => null))?.content?.sha || null;
        if (res.status !== 409 && res.status !== 422) throw new Error('Photo upload failed (' + res.status + ')');
        const current = await gh$(`/contents/${path}?ref=${branch}`);
        if (current.ok) fileSha = (await current.json()).sha;
        else if (current.status !== 404) throw new Error('Photo upload failed (' + current.status + ')');
      }
      throw new Error('The photo could not be uploaded. Please try again.');
    }
    // A new photo's thumbnail goes up as a file first; the record keeps the files' shas (a later delete needs no download),
    // never the picture itself: a thumbnail Blob from the page stays on this device
    async function prepare(col, item) {
      if (col !== 'photos' || !item.thumb) return item;
      if (typeof item.thumb !== 'string' || !item.thumb.startsWith('data:')) return { ...item, thumb: '' };
      const thumbSha = await putFile(`photos/${item.id}-thumb.jpg`, item.thumb, `${auth.name || 'someone'}: add photo`);
      const blob = dataUrlToBlob(item.thumb); if (blob) { thumbs.set(item.id, blob); await cachePut('thumb:' + item.id, blob); }
      if (thumbSha) fileShas.set(item.id, { ...fileShas.get(item.id), thumb: thumbSha });
      const shas = { ...item.shas, ...fileShas.get(item.id) };
      return { ...item, thumb: '', ...(shas.full || shas.thumb ? { shas } : {}) };
    }
    async function forget(id) { // a photo's pictures on this device
      thumbs.delete(id); thumbFails.delete(id); fileShas.delete(id); fullCache = fullCache.filter(x => x !== id);
      await Promise.all([db.del('thumb:' + id), db.del('full:' + id)]);
    }
    async function getFile(path) { // a photo file as a Blob
      const res = await gh$(`/contents/${path}?ref=${branch}`, { headers: { Accept: 'application/vnd.github.raw' } });
      if (!res.ok) return null;
      return new Blob([await res.arrayBuffer()], { type: 'image/jpeg' });
    }
    // A file's sha without downloading it: one directory listing (names and shas only) serves every older photo in a batch;
    // a file missing from it (a listing stops at 1,000 files) falls back to reading the file's own details.
    async function findSha(path, listing) {
      if (!listing.files) {
        const res = await gh$(`/contents/photos?ref=${branch}`).catch(() => null);
        const list = res && res.ok ? await res.json().catch(() => null) : null;
        listing.files = new Map(Array.isArray(list) ? list.map(f => [f.path, f.sha]) : []);
      }
      if (listing.files.has(path)) return listing.files.get(path);
      const meta = await gh$(`/contents/${path}?ref=${branch}`);
      if (meta.status === 404) return null;
      if (!meta.ok) throw new Error('Photo deletion failed (' + meta.status + ')');
      return (await meta.json()).sha;
    }
    async function deleteFile(path, message, fileSha, listing = {}) {
      let res;
      for (let attempt = 0; attempt < 2; attempt++) {
        fileSha ||= await findSha(path, listing); if (!fileSha) return; // already gone
        res = await gh$(`/contents/${path}`, { method: 'DELETE', body: JSON.stringify({ message, sha: fileSha, branch }) });
        if (res.ok || res.status === 404) return;
        if (res.status !== 409 && res.status !== 422) break;
        fileSha = null; listing.files = null; // the sha we had is out of date: look it up again
      }
      throw new Error('Photo deletion failed (' + res.status + ')');
    }
    // Files go only after the data change that removed their photo is saved (nothing pending), one at a time, retried later on failure.
    function deleteFiles() {
      if (deleting) return deleting;
      if (flushing || pending.length || !fileDeletes.length || !auth.token || Date.now() < busyUntil) return;
      clearTimeout(deleteTimer);
      let failed = false;
      deleting = (async () => {
        const listing = {};
        try {
          while (fileDeletes.length && !pending.length) {
            const job = fileDeletes[0];
            await deleteFile(job.path, 'delete photo', job.sha, listing);
            fileDeletes = fileDeletes.filter(x => x !== job);
          }
          deleteFails = 0;
        } catch (err) {
          failed = true; // a busy GitHub resumes the deletes when the wait is over
          if (err.code !== 'ratelimit') { deleteFails++; deleteTimer = setTimeout(deleteFiles, Math.min(600000, 20000 * 2 ** (deleteFails - 1))); }
        }
        await persist();
      })().finally(() => { deleting = null; if (!failed) deleteFiles(); });
      return deleting;
    }
    async function loadThumb(id) {
      const fail = thumbFails.get(id);
      if (loadingThumbs.has(id) || (fail && Date.now() < fail.at) || Date.now() < busyUntil) return; loadingThumbs.add(id);
      const blob = await readPicture(db, 'thumb:' + id);
      if (blob) { loadingThumbs.delete(id); thumbReady(id, blob); } else { thumbQueue.push(id); pumpThumbs(); }
    }
    function pumpThumbs() { // at most 4 downloads at a time, so a new device doesn't send hundreds of requests at once
      while (thumbActive < 4 && thumbQueue.length) {
        const id = thumbQueue.shift(); thumbActive++;
        getFile(`photos/${id}-thumb.jpg`).catch(err => err.code === 'ratelimit' ? undefined : null).then(blob => {
          thumbActive--; loadingThumbs.delete(id);
          if (blob) { thumbFails.delete(id); cachePut('thumb:' + id, blob); thumbReady(id, blob); }
          else if (blob === null) { const n = (thumbFails.get(id)?.n || 0) + 1; thumbFails.set(id, { n, at: Date.now() + Math.min(300000, 15000 * 2 ** (n - 1)) }); }
          pumpThumbs();
        });
      }
    }
    // Arriving thumbnails go out together, as the photo list alone (nothing else changed): at most one update every 0.4 s,
    // and the first ones after a quiet spell 50 ms after they arrive
    function thumbReady(id, blob) {
      thumbs.set(id, blob);
      thumbEmit ||= setTimeout(() => { thumbEmit = null; thumbLast = Date.now(); if (shown && onChange) onChange('photos', withThumbs(shown)); else emit(); }, Math.max(50, thumbLast + 400 - Date.now()));
    }
    function retryThumbs() { // missing thumbs: failed ones once their wait is over, and any skipped while GitHub was busy (emit only runs when data changes)
      const ids = new Set();
      (base.collections.photos || []).forEach(p => { ids.add(p.id); if (!thumbs.has(p.id)) loadThumb(p.id); });
      thumbFails.forEach((f, id) => { if (!ids.has(id)) thumbFails.delete(id); });
    }

    return {
      mode: 'github',
      async start(cb, statusCb) {
        onChange = cb; onStatus = statusCb; status('connecting');
        const cached = await db.get(stateKey);
        if (cached) { base = cached.base; sha = cached.sha; pending = cached.pending || []; fileDeletes = cached.files || []; fullCache = cached.fullCache || []; emit(); }
        for (;;) {
          try { const changed = await pull(); started = true; if (changed || !cached) emit(); status(pending.length ? 'saving' : 'synced'); break; }
          catch (err) {
            if (cached) { started = true; status(navigator.onLine === false ? 'offline' : 'error', err); break; }
            if (err.code === 'auth') { if (listening) { clearInterval(pollTimer); auth.token = null; } throw err; }
            // nothing saved on this device yet: keep the error showing and try again on the next poll, when back online or back in the tab
            listen(); status(navigator.onLine === false ? 'offline' : 'error');
            await new Promise(res => { retryStart = res; });
          }
        }
        listen(); if (pending.length) scheduleFlush(); else deleteFiles();
      },
      onAuth(cb) {
        if (!auth.token) { cb(null); return; }
        this.verify().then(() => cb({ name: auth.name })).catch(err => { if (err.code === 'auth') { localStorage.removeItem('olc:github'); cb(null, err); } else cb({ name: auth.name }); });
      },
      async verify() {
        const res = await gh$('');
        if (res.status === 401 || res.status === 403 || res.status === 404) throw Object.assign(new Error('This token cannot open the repo.'), { code: 'auth' });
        if (!res.ok) throw new Error('GitHub error ' + res.status);
        const repo = await res.json();
        if (!repo.private) throw Object.assign(new Error('Please use a private data repository.'), { code: 'auth' });
        if (repo.permissions && !repo.permissions.push) throw Object.assign(new Error('This token can read but not write. Give it Contents: Read and write.'), { code: 'auth' });
        verified = true;
      },
      async signIn(token, name) {
        auth.token = token.trim(); auth.name = name;
        try { await this.verify(); } catch (e) { auth.token = null; throw e.code === 'ratelimit' ? busyError(e.until, true) : e; }
        localStorage.setItem('olc:github', JSON.stringify({ token: auth.token, name }));
      },
      // Not while changes or photo deletions are still on their way to GitHub; then this device forgets the token and
      // the private data it keeps: the saved copy, thumbnails, full photos and drafts
      async signOut() {
        if (pending.length || flushing || fileDeletes.length || deleting) throw Object.assign(new Error('Still saving to GitHub. Log out once it says SYNCED, so nothing is lost.'), { code: 'unsaved' });
        closed = true; clearInterval(pollTimer); localStorage.removeItem('olc:github');
        for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith('olc:drafts:')) localStorage.removeItem(k); }
        await db.drop(k => typeof k === 'string' && /^(github-state:|thumb:|full:)/.test(k));
        location.reload();
      },
      pending: () => pending.length > 0 || !!flushing,
      async isSeeded() { if (!started) await pull(); return !!view().meta.seeded; },
      markSeeded: () => op({ type: 'meta', patch: { seeded: true } }),
      setMeta: patch => op({ type: 'meta', patch }),
      metaKey: (key, sub, value) => op({ type: 'metaKey', key, sub, value }),
      mergeMeta: (key, value, num = 'max') => op({ type: 'mergeMeta', key, value, num }),
      markInboxRead: (who, since, cutoff, items) => op({ type: 'inboxRead', who, since, cutoff, items }),
      async set(col, item) { item = await prepare(col, item); return op({ type: 'set', col, id: item.id, item }); },
      // several records saved as one change, one write to GitHub: e.g. a diary entry with its photos (after uploadPhoto)
      async saveAll(changes) {
        const items = []; for (const { col, item } of changes) items.push({ col, item: await prepare(col, item) });
        return op({ type: 'setAll', items });
      },
      // a new photo's two files, uploaded before its record is saved; resolves to the record to save (its thumbnail stays on this device)
      async uploadPhoto(item, full) { await this.putFull(item.id, full); return prepare('photos', item); },
      // files uploaded for photos whose records were never saved (a post that failed part way): deleted in the background
      // a top picture that was replaced or reset: its file is deleted once that change is saved (never one still in use)
      async dropFull(id) {
        const v = view(); if (!id || v.meta.hero === id || (v.collections.photos || []).some(p => p.id === id)) return;
        fileDeletes.push({ path: `photos/${id}.jpg`, sha: fileShas.get(id)?.full || null }); await forget(id);
        await persist(); deleteFiles();
      },
      async discard(ids) {
        for (const id of ids) { const s = fileShas.get(id) || {}; fileDeletes.push({ path: `photos/${id}-thumb.jpg`, sha: s.thumb || null }, { path: `photos/${id}.jpg`, sha: s.full || null }); await forget(id); }
        await persist(); deleteFiles();
      },
      update: (col, id, patch) => op({ type: 'update', col, id, patch }),
      // Only the data change waits here (it works offline); the photo's files are deleted in the background once it is saved.
      async remove(col, id) {
        if (col !== 'photos') return op({ type: 'remove', col, id });
        const s = (view().collections.photos || []).find(p => p.id === id)?.shas || {};
        fileDeletes.push({ path: `photos/${id}-thumb.jpg`, sha: s.thumb || null }, { path: `photos/${id}.jpg`, sha: s.full || null });
        await op({ type: 'remove', col, id }); // saved on this device together with the files to delete
        await forget(id);
      },
      async removeMany(col, ids) { // photos keep their one-by-one path (their files need deleting too)
        if (col === 'photos') { for (const id of ids) await this.remove(col, id); return; }
        return op({ type: 'removeMany', col, ids: [...ids] });
      },
      addComment: (id, comment) => op({ type: 'addComment', col: 'diary', id, comment }),
      removeComment: (id, commentId) => op({ type: 'removeComment', col: 'diary', id, commentId }),
      batchSet: (col, items) => op({ type: 'setMany', col, items }),
      async putFull(id, dataUrl) {
        const fileSha = await putFile(`photos/${id}.jpg`, dataUrl, `${auth.name || 'someone'}: add photo`);
        if (fileSha) fileShas.set(id, { ...fileShas.get(id), full: fileSha });
        if (await cachePut('full:' + id, dataUrlToBlob(dataUrl) || dataUrl)) keepFull(id);
      },
      async getFull(id) { // a Blob
        let blob = await readPicture(db, 'full:' + id);
        if (blob) keepFull(id);
        else { blob = await getFile(`photos/${id}.jpg`); if (blob) cachePut('full:' + id, blob).then(ok => ok && keepFull(id)); }
        return blob;
      }
    };
  }

  function create(config) {
    const gh = config && config.github;
    return gh && gh.owner && gh.repo ? githubStore(gh) : localStore();
  }

  // Resize a photo to a JPEG data URL.
  function resizeImage(file, maxSide, quality, square = false) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth, h = img.naturalHeight, side = Math.min(w, h);
        const sx = square ? (w - side) / 2 : 0, sy = square ? (h - side) / 2 : 0, sw = square ? side : w, sh = square ? side : h;
        const scale = Math.min(1, maxSide / Math.max(sw, sh));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(sw * scale); canvas.height = Math.round(sh * scale);
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        let q = quality, data = canvas.toDataURL('image/jpeg', q);
        while (data.length > 1400000 && q > 0.35) { q -= 0.1; data = canvas.toDataURL('image/jpeg', q); }
        resolve(data);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This image could not be read.')); };
      img.src = url;
    });
  }

  scope.CCStore = { create, uid, resizeImage, COLLECTIONS, toBlob: dataUrlToBlob };
})(window);
