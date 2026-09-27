// Data layer. Two modes with the same API:
//  - github: everything is saved in a private GitHub repo (compressed files in data/, and photos/), via the GitHub API.
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
        const db = await dbPromise; if (!db) return structuredClone(memory.get(key)); // copies, as IndexedDB gives, so a change never edits what the page holds
        return new Promise(res => { const r = db.transaction('kv').objectStore('kv').get(key); r.onsuccess = () => res(r.result); r.onerror = () => res(undefined); });
      },
      async put(key, value) {
        const db = await dbPromise; if (!db) { memory.set(key, structuredClone(value)); return; }
        // a full disk aborts the transaction (QuotaExceededError) instead of firing error, so listen for both
        return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(value, key); t.oncomplete = res; t.onerror = t.onabort = () => rej(t.error || new Error('Could not save on this device.')); });
      },
      async del(key) {
        const db = await dbPromise; if (!db) { memory.delete(key); return; }
        return new Promise(res => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').delete(key); t.oncomplete = res; t.onerror = t.onabort = res; });
      },
      async putMany(entries, gone = []) { // several keys in one go: all of them are saved (and `gone` removed), or none
        const db = await dbPromise; if (!db) { entries.forEach(([k, v]) => memory.set(k, structuredClone(v))); gone.forEach(k => memory.delete(k)); return; }
        return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'), s = t.objectStore('kv'); entries.forEach(([k, v]) => s.put(v, k)); gone.forEach(k => s.delete(k)); t.oncomplete = res; t.onerror = t.onabort = () => rej(t.error || new Error('Could not save on this device.')); });
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
    if (op.type === 'fold') return applyFold(data, op);
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
      for (const col of op.type === 'setAll' ? (op.items || []).map(x => x.col) : op.type === 'fold' ? Object.keys(op.cols || {}) : op.col ? [op.col] : []) if (!copied.has(col)) { copied.add(col); data.collections[col] = [...(data.collections[col] || [])]; }
      applyOp(data, op);
    }
    return data;
  }

  // ---------- changes an older version of the app saved in data.json (GitHub mode, see foldIn) ----------
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const byId = list => new Map((Array.isArray(list) ? list : []).filter(x => isPlain(x) && x.id != null).map(x => [x.id, x]));
  const changedKeys = (a, b) => ({ set: Object.fromEntries(Object.keys(b).filter(k => !same(a[k], b[k])).map(k => [k, b[k]])), unset: Object.keys(a).filter(k => !(k in b)) });
  // One file's part of data.json at two of its versions -> one change with only what the older app changed in between (and the record):
  // records added, the fields it changed, records it removed, and settings. The rest of the file is left as it is, so a
  // record removed with the new version never comes back, and an edit made there is kept unless the older app edited that field.
  function foldOp(before, after, from, to, at) {
    const op = { type: 'fold', from, to, at, cols: {}, meta: {}, unset: [], sub: {}, reads: [] };
    for (const c of new Set([...Object.keys(before.collections), ...Object.keys(after.collections)])) {
      const was = byId(before.collections[c]), now = byId(after.collections[c]), d = { put: [], patch: [], del: [] };
      now.forEach((item, id) => { const old = was.get(id); if (!old) d.put.push(item); else if (!same(old, item)) d.patch.push({ id, ...changedKeys(old, item) }); });
      was.forEach((item, id) => { if (!now.has(id)) d.del.push(id); });
      if (d.put.length || d.patch.length || d.del.length) op.cols[c] = d;
    }
    for (const k of new Set([...Object.keys(before.meta), ...Object.keys(after.meta)])) {
      const a = before.meta[k], b = after.meta[k];
      if (k === 'legacy' || same(a, b)) continue;
      if (k === 'inboxReads' && isPlain(b)) { for (const [who, r] of Object.entries(b)) if (isPlain(r) && !same(isPlain(a) ? a[who] : undefined, r)) op.reads.push({ who, since: r.since, read: r.read }); } // merged, like a read on this version
      else if (!(k in after.meta)) op.unset.push(k);
      else if (isPlain(a) && isPlain(b)) op.sub[k] = changedKeys(a, b); // avatars, kindColors, mode: only the entries it changed
      else op.meta[k] = b;
    }
    return op;
  }
  function applyFold(data, op) { // only onto the version it was worked out against, so it is made once however often it is replayed
    if ((isPlain(data.meta?.legacy) ? data.meta.legacy.sha : null) !== op.from) return data;
    for (const [c, d] of Object.entries(op.cols || {})) {
      const gone = new Set(d.del || []), list = (data.collections[c] || []).filter(x => !gone.has(x.id)), at = new Map(list.map((x, i) => [x.id, i]));
      for (const p of d.patch || []) { const i = at.get(p.id); if (i == null) continue; const next = { ...list[i], ...p.set }; (p.unset || []).forEach(k => delete next[k]); list[i] = next; } // removed here: stays removed
      for (const item of d.put || []) { const i = at.get(item.id); if (i != null) list[i] = item; else { at.set(item.id, list.length); list.push(item); } }
      data.collections[c] = list;
    }
    const meta = { ...data.meta, ...op.meta };
    (op.unset || []).forEach(k => delete meta[k]);
    for (const [k, s] of Object.entries(op.sub || {})) { const next = { ...(isPlain(meta[k]) ? meta[k] : {}), ...s.set }; (s.unset || []).forEach(x => delete next[x]); meta[k] = next; }
    data.meta = meta;
    for (const r of op.reads || []) applyOp(data, { type: 'inboxRead', who: r.who, since: r.since, cutoff: r.since, items: r.read });
    data.meta = { ...data.meta, legacy: { sha: op.to, at: op.at } };
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
  // The data is kept in data/ as gzip-compressed JSON files, each saved on its own:
  //   main.json.gz      every collection and the shared settings (calendar events that were not imported)
  //   imported.json.gz  calendar events brought in from a calendar file (they have an importKey)
  //   <person>.json.gz  one per person: their own settings (keys ending in :<person>) and message read receipts
  // The page sees them joined, the same as when everything was in one data.json. That data.json is left as it was when the
  // first phone moved to the files (never changed or deleted); what an older version of the app still saves there is taken in (foldIn).
  const PEOPLE = ['sijie', 'zhenzhen']; // the keys of PEOPLE in app.js
  const SPLIT = ['imported', ...PEOPLE, 'main']; // saved in this order: main last, so the move to the files is complete once main exists
  const JOIN = ['main', 'imported', ...PEOPLE]; // the page sees main's records first
  const personOf = key => PEOPLE.find(p => typeof key === 'string' && key.endsWith(':' + p)) || null;
  const readsHome = who => (PEOPLE.includes(who) ? who : 'main');
  function emptyPart(name) { return { version: 2, meta: {}, collections: name === 'main' ? Object.fromEntries(COLLECTIONS.map(c => [c, []])) : name === 'imported' ? { events: [] } : {} }; }
  const fillPart = (name, d) => { if (name === 'main') COLLECTIONS.forEach(c => { d.collections[c] ||= []; }); if (name === 'imported') d.collections.events ||= []; return d; };
  // The one-file data -> the files, by the same rules as each change (route)
  function splitData(data, stamp) {
    const parts = Object.fromEntries(SPLIT.map(n => [n, emptyPart(n)]));
    for (const [k, v] of Object.entries(data.meta || {})) {
      if (k === 'legacy') continue;
      if (k === 'inboxReads' && isPlain(v)) for (const [who, r] of Object.entries(v)) { const m = parts[readsHome(who)].meta; m.inboxReads = { ...m.inboxReads, [who]: r }; }
      else parts[personOf(k) || 'main'].meta[k] = v;
    }
    for (const [c, list] of Object.entries(data.collections || {})) {
      if (!Array.isArray(list)) continue;
      if (c !== 'events') parts.main.collections[c] = list;
      else { parts.main.collections.events = list.filter(e => !e.importKey); parts.imported.collections.events = list.filter(e => e.importKey); }
    }
    if (stamp) SPLIT.forEach(n => { parts[n].meta.legacy = stamp; });
    return parts;
  }
  // The files -> what the page sees: records joined; main's settings plus each person's, read receipts merged one level deep
  function joinParts(parts) {
    const meta = {}, collections = {};
    for (const n of JOIN) for (const [k, v] of Object.entries(parts[n].meta)) {
      if (k !== 'legacy') meta[k] = k === 'inboxReads' && isPlain(v) && isPlain(meta.inboxReads) ? { ...meta.inboxReads, ...v } : v;
    }
    for (const c of COLLECTIONS) {
      const lists = JOIN.map(n => parts[n].collections[c]).filter(l => l && l.length);
      collections[c] = lists.length > 1 ? [].concat(...lists) : lists[0] || [];
    }
    return { version: 1, meta, collections };
  }
  // A file's shape, checked before it is trusted or saved: anything unexpected stops saving (nothing is guessed or overwritten)
  const damaged = (name, why) => Object.assign(new Error(`Saving is paused: data/${name}.json.gz ${why}.`), { code: 'invalid' });
  function checkPart(name, d) {
    if (!isPlain(d) || d.version !== 2 || !isPlain(d.meta) || !isPlain(d.collections)) throw damaged(name, 'is not in the expected shape');
    for (const [c, list] of Object.entries(d.collections)) if (!Array.isArray(list) || !list.every(isPlain)) throw damaged(name, `has a broken ${c} list`);
    if ('legacy' in d.meta && !(isPlain(d.meta.legacy) && typeof d.meta.legacy.sha === 'string')) throw damaged(name, 'has a broken data.json record');
    const ownReads = (k, v, who) => k === 'inboxReads' && isPlain(v) && Object.keys(v).every(w => readsHome(w) === who);
    if (name === 'main') { for (const [k, v] of Object.entries(d.meta)) if (personOf(k) || (k === 'inboxReads' && isPlain(v) && !ownReads(k, v, 'main'))) throw damaged(name, `holds a personal setting (${k})`); }
    else if (name === 'imported') { if (Object.keys(d.collections).some(c => c !== 'events')) throw damaged(name, 'holds more than calendar events'); if (Object.keys(d.meta).some(k => k !== 'legacy')) throw damaged(name, 'holds settings'); }
    else {
      if (Object.values(d.collections).some(l => l.length)) throw damaged(name, 'holds records');
      for (const [k, v] of Object.entries(d.meta)) if (k !== 'legacy' && personOf(k) !== name && !ownReads(k, v, name)) throw damaged(name, `holds someone else's setting (${k})`);
    }
    return d;
  }
  function checkOld(d) { // data.json, as the one-file version saved it
    const bad = () => Object.assign(new Error('data.json could not be read, so nothing was taken from it.'), { code: 'invalid' });
    if (!isPlain(d) || !isPlain(d.collections) || (d.meta != null && !isPlain(d.meta))) throw bad();
    for (const list of Object.values(d.collections)) if (!Array.isArray(list) || !list.every(isPlain)) throw bad();
    d.meta ||= {}; return d;
  }
  const countItems = d => Object.values(d.collections).reduce((n, l) => n + l.length, 0);

  // gzip in the browser (Safari 16.4+, Chrome 80+); the data is never saved uncompressed or by a browser without it
  const canZip = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
  const tooOld = () => Object.assign(new Error('This browser is too old for the new save format. Please update it.'), { code: 'oldbrowser' });
  async function pipeBytes(bytes, stream) {
    const w = stream.writable.getWriter(); w.write(bytes).catch(() => {}); w.close().catch(() => {}); // errors come out of the reader
    const r = stream.readable.getReader(), parts = []; let n = 0;
    for (;;) { const { done, value } = await r.read(); if (done) break; parts.push(value); n += value.length; }
    const out = new Uint8Array(n); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; } return out;
  }
  const gzip = text => pipeBytes(new TextEncoder().encode(text), new CompressionStream('gzip'));
  const utf8 = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const gunzip = async bytes => utf8(await pipeBytes(bytes, new DecompressionStream('gzip')));
  const bytesToB64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
  const b64ToBytes = b64 => Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0));
  // a blob asked for raw but sent as JSON ({ sha, content, encoding }): its content
  const unwrap = (d, sha) => (isPlain(d) && d.sha === sha && d.encoding === 'base64' && typeof d.content === 'string' ? b64ToBytes(d.content) : null);

  function githubStore(gh) {
    const api = (gh.apiBase || 'https://api.github.com') + `/repos/${gh.owner}/${gh.repo}`;
    const branch = gh.branch || 'main';
    const oldKey = `github-state:${gh.owner}/${gh.repo}:${branch}`; // this device's copy as the one-file version kept it
    const stateKey = oldKey + ':v2', fileKey = name => stateKey + ':' + name; // now: what the files share, and one copy per file
    const db = kv();
    const auth = { token: null, name: null };
    try { Object.assign(auth, JSON.parse(localStorage.getItem('olc:github') || '{}')); } catch {}
    // Each file: base is the version GitHub has (at sha), pending the changes still to save on top of it; create: still to be made
    // (the move to the files); synced: base is GitHub's (not yet for a copy taken over from the one-file version); broken: why saving stopped
    const files = {};
    for (const name of SPLIT) files[name] = { name, path: `data/${name}.json.gz`, sha: null, base: emptyPart(name), pending: [], create: false, synced: false, savedAt: 0, revision: 0, superseded: new Map(), broken: null, badSha: null, held: false };
    const all = () => SPLIT.map(n => files[n]);
    const unsaved = () => all().some(f => f.pending.length || f.create);
    const stopped = () => (canZip() ? all().find(f => f.broken)?.broken || null : tooOld());
    let dirEtag = null, rootEtag = null, legacyAt = 0, folding = null, started = false, verified = false;
    let mutationQueue = Promise.resolve();
    let onChange = null, onStatus = null, flushTimer = null, flushing = null, pollTimer = null, listening = false, retryStart = null, uploading = 0;
    const thumbs = new Map(); // photo id -> thumbnail Blob (the page makes a link for it when it shows it)
    const loadingThumbs = new Set();
    const thumbFails = new Map(); // photo id -> { n, at }: a failed thumb download waits until `at` before trying again
    const thumbQueue = []; let thumbActive = 0, thumbEmit = null, thumbLast = 0, shown = null; // shown: the photo list of the last full update
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
        poll(); if (unsaved()) scheduleFlush(); else deleteFiles();
      };
      clearTimeout(busyTimer); busyTimer = setTimeout(tick, (busyUntil - Date.now()) % 60000 || 60000);
      status('ratelimited');
      return busyError(busyUntil);
    }
    const status = (s, err) => { if (!onStatus) return; if (Date.now() < busyUntil) onStatus('ratelimited', busyError(busyUntil)); else onStatus(s, err); };
    const settled = () => { const stop = stopped(); if (stop) status('error', stop); else status(unsaved() ? 'saving' : 'synced'); };
    const failed = err => status(navigator.onLine === false ? 'offline' : 'error', err);
    // The device copy is a cache: when storage is full, drop old full photos and try once more, else carry on (logged once).
    async function cacheSave(entries, gone) {
      if (closed) return false;
      try { await db.putMany(entries, gone); return true; } catch {}
      await evictFull();
      try { await db.putMany(entries, gone); return true; }
      catch (err) { if (!warned) { warned = true; console.warn('This device is out of storage; the app keeps working but saves less for offline use.', err); } return false; }
    }
    const cachePut = (key, value) => cacheSave([[key, value]]);
    async function evictFull() { // oldest half of the full-photo cache; the first time also copies cached before this list existed
      const drop = fullCache.splice(0, Math.ceil(fullCache.length / 2)), main = files.main.base;
      if (!evictedOld) { evictedOld = true; const known = new Set(fullCache); drop.push(...(main.collections.photos || []).map(p => p.id).filter(id => !known.has(id)), ...(main.meta?.hero && !known.has(main.meta.hero) ? [main.meta.hero] : [])); }
      await Promise.all(drop.map(id => db.del('full:' + id)));
    }
    const keepFull = id => { fullCache = [...fullCache.filter(x => x !== id), id]; };
    // this device's copy: what the files share, and the files named (one change touches only its own); written together, all or nothing
    const fileCopy = f => ({ sha: f.sha, base: f.base, pending: f.pending, create: f.create, synced: f.synced, savedAt: f.savedAt });
    const persist = (names = SPLIT, gone) => cacheSave([[stateKey, { files: fileDeletes, fullCache, dirEtag, rootEtag }], ...names.map(n => [fileKey(n), fileCopy(files[n])])], gone);
    const fileView = name => applyAll(files[name].base, files[name].pending);
    const view = () => joinParts(Object.fromEntries(SPLIT.map(n => [n, fileView(n)])));
    const withThumbs = list => list.map(p => ({ ...p, thumb: thumbs.get(p.id) || '' }));
    function emit() {
      if (!onChange) return;
      const v = view(); shown = v.collections.photos || [];
      COLLECTIONS.forEach(c => onChange(c, c === 'photos' ? withThumbs(shown) : v.collections[c] || []));
      onChange('meta', v.meta || {});
      shown.forEach(p => { if (!thumbs.has(p.id)) loadThumb(p.id); });
    }

    // ---- which file a change belongs in; a change that spans files is split (one part per file)
    function eventHomes() { // the file holding each calendar event now (its saved copy and the changes waiting)
      const ids = n => new Set((fileView(n).collections.events || []).map(e => e.id)), imported = ids('imported'), main = ids('main');
      const holder = id => (imported.has(id) ? 'imported' : main.has(id) ? 'main' : null);
      return { holder, home: (id, item) => holder(id) || (item && item.importKey ? 'imported' : 'main') }; // a saved event stays where it is
    }
    function route(o) {
      const out = new Map(), t = o.type, group = (list, fileOf) => { const by = new Map(); for (const x of list || []) { const n = fileOf(x); if (!by.has(n)) by.set(n, []); by.get(n).push(x); } return by; };
      if (t === 'inboxRead') out.set(readsHome(o.who), o);
      else if (t === 'meta') {
        const by = new Map(), add = (n, patch) => by.set(n, { ...by.get(n), ...patch });
        for (const [k, v] of Object.entries(o.patch || {})) {
          if (k === 'inboxReads' && isPlain(v)) for (const [who, r] of Object.entries(v)) add(readsHome(who), { inboxReads: { ...by.get(readsHome(who))?.inboxReads, [who]: r } });
          else add(personOf(k) || 'main', { [k]: v });
        }
        by.forEach((patch, n) => out.set(n, { ...o, patch }));
      }
      else if (t === 'metaKey') out.set(o.key === 'inboxReads' ? readsHome(o.sub) : personOf(o.key) || 'main', o);
      else if (t === 'mergeMeta' && o.key === 'inboxReads' && isPlain(o.value)) group(Object.entries(o.value), ([who]) => readsHome(who)).forEach((entries, n) => out.set(n, { ...o, value: Object.fromEntries(entries) }));
      else if (t === 'mergeMeta') out.set(personOf(o.key) || 'main', o);
      else if (t === 'setAll') { const { home } = eventHomes(); group(o.items, x => (x?.col === 'events' ? home(x.item?.id, x.item) : 'main')).forEach((items, n) => out.set(n, { ...o, items })); }
      else if (o.col !== 'events') out.set('main', o);
      else if (t === 'set') out.set(eventHomes().home(o.item?.id ?? o.id, o.item), o);
      else if (t === 'setMany') { const { home } = eventHomes(); group(o.items, item => home(item?.id, item)).forEach((items, n) => out.set(n, { ...o, items })); }
      else if (t === 'removeMany') { // an id this device doesn't know goes to both (a no-op where it isn't)
        const { holder } = eventHomes(), ids = { main: [], imported: [] };
        for (const id of o.ids || []) { const n = holder(id); if (n) ids[n].push(id); else { ids.main.push(id); ids.imported.push(id); } }
        for (const n of ['main', 'imported']) if (ids[n].length) out.set(n, { ...o, ids: ids[n] });
      }
      else out.set(eventHomes().holder(o.id) || 'main', o); // update, remove, addComment, removeComment
      if (!out.size) out.set('main', o);
      return [...out];
    }
    function addOp(o) { const parts = route(o); for (const [n, x] of parts) files[n].pending.push(x); return parts.map(([n]) => n); }

    // ---- reading from GitHub
    function refused(res) { // an answer that isn't the file (a rate limit was handled in gh$ already)
      if (res.status === 401 || res.status === 403) return Object.assign(new Error('Token is not valid for this repo.'), { code: 'auth' });
      return Object.assign(new Error('GitHub error ' + res.status), { status: res.status });
    }
    async function list(path, etag) { // a folder: { list: name -> entry, etag }; list null when there is no such folder; same: unchanged (a 304 costs nothing)
      const res = await gh$(`/contents${path ? '/' + path : ''}?ref=${branch}`, { headers: etag ? { 'If-None-Match': etag } : {} }); // the root is /contents (with a slash it may not be understood)
      if (res.status === 304) return { same: true };
      if (res.status === 404) return { list: null, etag: null };
      if (!res.ok) throw refused(res);
      const body = await res.json();
      if (!Array.isArray(body)) throw Object.assign(new Error(`GitHub sent something unexpected for ${path || 'the repository'}.`), { code: 'invalid' });
      return { list: new Map(body.filter(e => e && typeof e.name === 'string').map(e => [e.name, e])), etag: res.headers.get('ETag') };
    }
    async function listData() { // data/: file name -> sha
      const d = await list('data', dirEtag);
      if (d.list) d.list = new Map([...d.list].filter(([name, e]) => e.type === 'file' && name.endsWith('.json.gz') && SPLIT.includes(name.slice(0, -8))).map(([name, e]) => [name.slice(0, -8), e.sha]));
      return d;
    }
    async function blob(sha) { // one version of a file by its sha: it never changes (no stale copy) and it can be any size
      const res = await gh$(`/git/blobs/${sha}`, { headers: { Accept: 'application/vnd.github.raw' } });
      if (!res.ok) throw refused(res);
      return new Uint8Array(await res.arrayBuffer());
    }
    async function parsePart(name, bytes, sha) { // a file as it is on GitHub, before any check
      try { if (bytes[0] !== 0x1f) bytes = unwrap(JSON.parse(utf8(bytes)), sha) || bytes; return JSON.parse(await gunzip(bytes)); }
      catch { throw damaged(name, 'could not be read'); }
    }
    const decodePart = async (name, bytes, sha) => fillPart(name, checkPart(name, await parsePart(name, bytes, sha)));
    async function readOld(sha) { // data.json at one of its versions
      const bytes = await blob(sha);
      let d = null;
      try { d = bytes.length ? JSON.parse(utf8(bytes)) : emptyData(); const inner = unwrap(d, sha); if (inner) d = inner.length ? JSON.parse(utf8(inner)) : emptyData(); } catch {}
      return checkOld(d);
    }
    function take(f, base, sha) { f.base = base; f.sha = sha; f.synced = true; f.create = false; f.broken = null; f.badSha = null; f.held = false; f.revision++; }
    const missing = name => Object.assign(new Error(`data/${name}.json.gz is missing. Restore it from the readable-backup branch; nothing was changed.`), { code: 'missing' });
    async function reread(f) { // after a save that met someone else's: the file as GitHub has it now
      const res = await gh$(`/contents/${f.path}?ref=${branch}`);
      if (res.status === 404) { if (f.sha) throw (f.broken = missing(f.name)); return; } // not listed yet: the next try creates it
      if (!res.ok) throw refused(res);
      const j = await res.json();
      try { take(f, await decodePart(f.name, j.content && j.encoding === 'base64' ? b64ToBytes(j.content) : await blob(j.sha), j.sha), j.sha); }
      catch (err) { if (err.code === 'invalid') { f.broken = err; f.badSha = j.sha; } throw err; }
    }

    // What GitHub has, against this device's copy: one listing of data/ (a 304 when nothing changed), then each changed file
    // by its sha. The first start on this version moves data.json into the files instead.
    async function sync() {
      if (!canZip()) throw tooOld();
      const d = await listData();
      if (d.same) return false;
      const listing = d.list || new Map(), main = files.main;
      if (!listing.has('main') && !main.sha && listing.size) { // files without main.json.gz, on a device that never saw it
        if (!(await unfinishedMove(listing))) { main.broken = missing('main'); dirEtag = null; return false; } // nothing is made
        if (main.broken?.code === 'missing') main.broken = null;
      }
      if (listing.has('main') || main.sha || main.create || all().every(f => f.synced)) return applyListing(listing, d.etag); // known (or being made): the files are what there is
      return moveIn(listing);
    }
    // data/ without main.json.gz is carried on as a move only while it is one that stopped part way (on any phone): every file
    // there is exactly the split of the data.json version its record names. Anything else (main deleted after later changes)
    // stops all saving and makes nothing. Files this device made itself in the move are known; a verdict holds for its listing.
    const canon = v => JSON.stringify(v, (k, x) => (isPlain(x) ? Object.fromEntries(Object.keys(x).sort().map(key => [key, x[key]])) : x));
    const pureShas = new Set(); let guard = null;
    async function unfinishedMove(listing) {
      const key = JSON.stringify([...listing].sort());
      if (guard && guard.key === key) return guard.ok;
      let ok = true; const olds = new Map();
      for (const [name, sha] of listing) {
        if (pureShas.has(sha)) continue;
        let part = null; try { part = await parsePart(name, await blob(sha), sha); } catch (err) { if (err.code !== 'invalid') throw err; }
        const stamp = isPlain(part) && isPlain(part.meta) ? part.meta.legacy : null;
        if (!isPlain(stamp) || typeof stamp.sha !== 'string') { ok = false; break; }
        if (!olds.has(stamp.sha)) olds.set(stamp.sha, await readOld(stamp.sha).catch(err => { if (err.code === 'invalid' || err.status === 404) return null; throw err; }));
        if (!olds.get(stamp.sha) || canon(splitData(olds.get(stamp.sha), stamp)[name]) !== canon(part)) { ok = false; break; }
        pureShas.add(sha);
      }
      guard = { key, ok }; return ok;
    }
    async function applyListing(listing, etag) {
      let changed = false, complete = true; const touched = [];
      for (const f of all()) {
        const remote = listing.get(f.name) || null, observed = f.revision;
        try {
          if (remote && remote === f.sha) { f.broken = null; f.held = false; continue; }
          if (!remote) { // gone, or a listing lagging behind our own new file: nothing is saved to it until a listing shows it again
            if (f.sha) { if (Date.now() - f.savedAt < 30000) { f.held = true; complete = false; continue; } throw missing(f.name); }
            if (!f.synced && !f.create) { f.base = emptyPart(f.name); f.synced = true; changed = true; touched.push(f.name); } // not made yet: it is empty
            continue;
          }
          if (Date.now() - (f.superseded.get(remote) || 0) < 30000) { complete = false; continue; } // a lagging listing from before our own save
          if (remote === f.badSha) throw f.broken || damaged(f.name, 'could not be read');
          let base;
          try { base = await decodePart(f.name, await blob(remote), remote); } catch (err) { if (err.code === 'invalid') f.badSha = remote; throw err; }
          if (f.revision !== observed) { complete = false; continue; } // saved meanwhile: ours is newer
          take(f, base, remote); changed = true; touched.push(f.name);
        } catch (err) {
          if (err.code !== 'invalid' && err.code !== 'missing') throw err; // no answer, GitHub busy...: the next check tries again
          f.broken = err; complete = false; // saving stops (see stopped); the other files still load
        }
      }
      dirEtag = complete ? etag : null; // something left for later (a lag, a damaged file): the next check lists it all again
      await persist(touched);
      return changed;
    }
    // The move from data.json to the files (the first phone on this version; a move stopped part way goes on from where it was).
    // Every file is created from data.json at one version, stamped with its sha (meta.legacy), and saved with a create that never
    // replaces a file: one already there (the other phone moved at the same moment) is taken as it is, and its own stamp lets foldIn
    // take in whatever it is missing. data.json is never changed or deleted. Main is created last.
    async function moveIn(existing) {
      const got = new Map();
      for (const [name, sha] of existing) {
        try { got.set(name, [await decodePart(name, await blob(sha), sha), sha]); }
        catch (err) { if (err.code === 'invalid') { files[name].broken = err; files[name].badSha = sha; } throw err; }
      }
      const root = await list('', null), old = root.list && root.list.get('data.json');
      const began = [...got.values()].map(([part]) => part.meta.legacy).find(st => isPlain(st) && typeof st.sha === 'string'); // a move that stopped part way
      let parts = null; // null: a new data repo (an empty one has no listing at all), its files are made by the first saves
      if (old && old.type === 'file') parts = splitData(await readOld(old.sha), { sha: old.sha, at: Date.now() });
      else if (began) parts = splitData(await readOld(began.sha), began); // data.json gone since that move began: finished from its version
      else if (!verified) throw new Error('The private data file could not be opened. Check the repository and token access.');
      for (const f of all()) {
        if (got.has(f.name)) take(f, ...got.get(f.name));
        else { f.base = parts ? parts[f.name] : emptyPart(f.name); f.sha = null; f.create = !!parts; f.synced = true; f.broken = null; f.revision++; }
      }
      await persist();
      return true;
    }
    // A new data repo's file made by its first save: only while there is still no data.json, which an older version of the app
    // could have made meanwhile (then that is moved in first, and this change is saved on top)
    async function stillNew() {
      const root = await list('', null);
      if (!root.list || !root.list.has('data.json')) return;
      all().forEach(f => { if (!f.sha) f.synced = false; }); dirEtag = null;
      throw new Error('Found data.json from an older version of the app: moving it into the new files first.');
    }

    // ---- changes an older version of the app still saves in data.json (a phone not updated yet)
    // Each file records the data.json version it has taken in (meta.legacy). When data.json has moved on, that version and the
    // new one are compared (both read by sha) and only the difference is made in the file (see foldOp), as a change that applies
    // on top of that same version only: two phones doing it at once take it in once. Checked on start and every 10 minutes,
    // until data.json has not changed for 30 days; the record stays.
    function foldIn(force) {
      if (folding) return folding;
      if (!started || !auth.token || stopped() || all().some(f => !f.synced || f.create)) return Promise.resolve();
      const stamps = all().map(f => [f, fileView(f.name).meta.legacy]).filter(([, s]) => isPlain(s) && typeof s.sha === 'string');
      if (!stamps.length || Date.now() - Math.max(...stamps.map(([, s]) => +s.at || 0)) > 30 * 864e5) return Promise.resolve();
      if (!force && Date.now() - legacyAt < 600000) return Promise.resolve();
      legacyAt = Date.now();
      folding = (async () => {
        const root = await list('', rootEtag);
        if (root.same || !root.list) return 0;
        const entry = root.list.get('data.json'), to = entry && entry.type === 'file' ? entry.sha : null;
        const todo = to ? stamps.filter(([, s]) => s.sha !== to) : []; // gone: nothing more to take in (never read as "everything removed")
        let n = 0;
        if (todo.length) {
          const now = await readOld(to), after = splitData(now), before = new Map(), at = Date.now();
          for (const [f, s] of todo) {
            if (!before.has(s.sha)) {
              const was = await readOld(s.sha);
              if (countItems(was) && !countItems(now)) throw Object.assign(new Error('data.json was emptied by an older version of the app, so nothing was taken from it.'), { code: 'invalid' });
              before.set(s.sha, splitData(was));
            }
            f.pending.push(foldOp(before.get(s.sha)[f.name], after[f.name], s.sha, to, at)); n++; // with nothing new, only its record moves on (so no phone reads these versions again)
          }
        }
        rootEtag = root.etag; await persist(todo.map(([f]) => f.name));
        return n;
      })().then(n => { if (n) { emit(); status('saving'); scheduleFlush(); } }, err => failed(err)).finally(() => { folding = null; });
      return folding;
    }

    async function poll() {
      if (document.hidden || flushing || !auth.token || Date.now() < busyUntil) return;
      if (retryStart) { const retry = retryStart; retryStart = null; retry(); return; } // the first load failed: start() tries again
      try { if (await sync()) emit(); else retryThumbs(); settled(); if (unsaved()) scheduleFlush(); }
      catch (err) { failed(err); return; }
      await foldIn();
    }
    function schedulePoll() { clearInterval(pollTimer); pollTimer = setInterval(poll, (gh.pollSeconds || 20) * 1000); }
    function listen() {
      if (listening) return; listening = true;
      schedulePoll();
      document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
      scope.addEventListener('online', () => { thumbFails.forEach(f => { f.at = 0; }); deleteFails = 0; poll(); if (unsaved()) scheduleFlush(); else deleteFiles(); });
      scope.addEventListener('beforeunload', e => { if (unsaved() || flushing) { e.preventDefault(); e.returnValue = ''; } });
    }

    // Each file is saved on its own (one change to a person's file never uploads the others), one request at a time
    async function flush() {
      if (flushing) return flushing;
      if (Date.now() < busyUntil) { scheduleFlush(); return; }
      const stop = stopped(); if (stop) { status('error', stop); return; } // nothing is written while a file looks wrong, or without gzip
      let made = false;
      flushing = (async () => {
        for (let f; (f = nextToSave()); ) { const stop = stopped(); if (stop) throw stop; made ||= f.create; await save(f); }
      })();
      try { await flushing; settled(); }
      catch (err) { failed(err); setTimeout(() => unsaved() && scheduleFlush(), 15000); }
      finally { flushing = null; }
      if (made && !unsaved()) legacyAt = 0; // the move is done: the next check (files first) looks for anything saved in data.json meanwhile
      await deleteFiles();
    }
    // The move's files are made first, exactly as split from data.json and main last, and changes are saved only once main is
    // there: until then every file in data/ is a pure split (see unfinishedMove). In a new data repo main is made first.
    function nextToSave() {
      const f = all().find(x => x.synced && x.create) || all().find(x => x.synced && !x.held && x.pending.length);
      if (f && f !== files.main && !f.sha && !f.create && !files.main.sha && files.main.synced) { files.main.create = true; return files.main; }
      return f;
    }
    async function save(f) {
      const ops = f.create ? [] : f.pending.slice();
      let ok = false;
      for (let attempt = 0; attempt < 4 && !ok; attempt++) {
        const next = applyAll(f.base, ops), text = JSON.stringify(next);
        if (!f.create && text === JSON.stringify(f.base)) { ok = true; break; } // nothing changes (e.g. already taken in): no save
        checkPart(f.name, next);
        if (!f.sha && !files.main.sha && !isPlain(f.base.meta?.legacy)) await stillNew(); // a new repo's first file: data.json still not there?
        const zipped = await gzip(text);
        if (await gunzip(zipped) !== text) throw new Error('The data could not be compressed, so it was not saved. Please try again.');
        const res = await gh$(`/contents/${f.path}`, { method: 'PUT', body: JSON.stringify({ message: `${auth.name || 'someone'}: ${describe(f, ops)}`, content: bytesToB64(zipped), branch, ...(f.sha ? { sha: f.sha } : {}) }) });
        if (res.ok) {
          const j = await res.json(), now = Date.now();
          if (f.sha) { f.superseded.forEach((at, s) => { if (now - at > 30000) f.superseded.delete(s); }); f.superseded.set(f.sha, now); } // GitHub can briefly list the old one again
          if (f.create && isPlain(f.base.meta?.legacy)) pureShas.add(j.content.sha); // made by this move, exactly as split
          f.base = next; f.sha = j.content.sha; f.create = false; f.savedAt = now; f.revision++; ok = true;
        }
        else if (res.status === 409 || res.status === 422) { await reread(f); emit(); } // someone else saved this file first (or made it): reload it, show theirs at once (even if our retry fails), replay ours
        else if (res.status === 401 || res.status === 403) throw Object.assign(new Error('Token cannot write to this repo.'), { code: 'auth' });
        else throw new Error('GitHub error ' + res.status);
      }
      if (!ok) throw new Error('Could not save after several tries.');
      f.pending = f.pending.slice(ops.length);
      await persist([f.name]); // what was saved is what the page shows already
    }
    function describe(f, ops) {
      if (f.create) return `${isPlain(f.base.meta?.legacy) ? 'move data.json into' : 'create'} ${f.path}`;
      const o = ops[0], n = ops.length;
      const text = { set: 'save', setAll: 'save', setMany: 'import', update: 'edit', remove: 'delete', removeMany: 'delete', addComment: 'reply', removeComment: 'delete reply', meta: 'setup', metaKey: 'setup', mergeMeta: 'sync', inboxRead: 'read messages', fold: 'take in changes from data.json' }[o.type] || 'update';
      const col = o.col || [...new Set((o.items || []).map(x => x.col))].join(' + '); // setAll: 'diary + photos'
      return `${text} ${col}${n > 1 ? ` (+${n - 1} more)` : ''}`.trim();
    }
    function scheduleFlush() { clearTimeout(flushTimer); flushTimer = setTimeout(flush, Math.max(700, busyUntil - Date.now())); }
    async function op(o) { const names = addOp(clean(o)); await persist(names); status('saving'); emit(); scheduleFlush(); }

    // This device's copy. One kept by the one-file version is split the same way (its changes still waiting go into the files
    // and are saved once GitHub has been asked what it has), then removed. A damaged file copy is read from GitHub again.
    async function loadCache() {
      const shared = await db.get(stateKey), old = await db.get(oldKey);
      let any = false;
      if (isPlain(shared)) {
        fileDeletes = shared.files || []; fullCache = shared.fullCache || []; dirEtag = shared.dirEtag || null; rootEtag = shared.rootEtag || null;
        const copies = []; for (const f of all()) copies.push(await db.get(fileKey(f.name)));
        const valid = (c, name) => { try { return isPlain(c) && Array.isArray(c.pending) && !!checkPart(name, c.base); } catch { return false; } };
        const whole = all().every((f, i) => valid(copies[i], f.name));
        all().forEach((f, i) => {
          const c = copies[i]; if (isPlain(c) && Array.isArray(c.pending)) f.pending = c.pending;
          if (whole) { f.base = fillPart(f.name, c.base); f.sha = c.sha || null; f.create = !!c.create; f.synced = !!c.synced; f.savedAt = +c.savedAt || 0; }
        });
        if (whole) any = true; else dirEtag = null; // all files are read again (their changes waiting are kept)
      }
      if (isPlain(old)) {
        if (!any) { const parts = splitData(isPlain(old.base) && isPlain(old.base.collections) ? old.base : emptyData()); all().forEach(f => { f.base = parts[f.name]; }); any = true; } // shown until GitHub answers; never saved as it is
        const paths = new Set(fileDeletes.map(x => x.path)); fileDeletes = [...fileDeletes, ...(old.files || []).filter(x => x && !paths.has(x.path))];
        if (!isPlain(shared)) fullCache = old.fullCache || [];
        for (const o of Array.isArray(old.pending) ? old.pending : []) { try { addOp(o); } catch { files.main.pending.push(o); } } // (one it can't place goes where all of them went before)
        await persist(SPLIT, [oldKey]);
      }
      return any;
    }

    // photos: stored as files photos/<id>.jpg (full) and photos/<id>-thumb.jpg
    async function putFile(path, dataUrl, message) { // resolves to the new file's sha
      uploading++; try { return await putFileOnce(path, dataUrl, message); } finally { uploading--; }
    }
    async function putFileOnce(path, dataUrl, message) {
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
      if (flushing || unsaved() || !fileDeletes.length || !auth.token || Date.now() < busyUntil) return;
      clearTimeout(deleteTimer);
      let failed = false;
      deleting = (async () => {
        const listing = {};
        try {
          while (fileDeletes.length && !unsaved()) {
            const job = fileDeletes[0];
            await deleteFile(job.path, 'delete photo', job.sha, listing);
            fileDeletes = fileDeletes.filter(x => x !== job);
          }
          deleteFails = 0;
        } catch (err) {
          failed = true; // a busy GitHub resumes the deletes when the wait is over
          if (err.code !== 'ratelimit') { deleteFails++; deleteTimer = setTimeout(deleteFiles, Math.min(600000, 20000 * 2 ** (deleteFails - 1))); }
        }
        await persist([]);
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
      thumbEmit ||= setTimeout(() => { thumbEmit = null; thumbLast = Date.now(); if (shown && onChange) onChange('photos', withThumbs(shown), 'thumbs'); else emit(); }, Math.max(50, thumbLast + 400 - Date.now()));
    }
    function retryThumbs() { // missing thumbs: failed ones once their wait is over, and any skipped while GitHub was busy (emit only runs when data changes)
      const ids = new Set();
      (files.main.base.collections.photos || []).forEach(p => { ids.add(p.id); if (!thumbs.has(p.id)) loadThumb(p.id); });
      thumbFails.forEach((f, id) => { if (!ids.has(id)) thumbFails.delete(id); });
    }

    return {
      mode: 'github',
      async start(cb, statusCb) {
        onChange = cb; onStatus = statusCb; status('connecting');
        const cached = await loadCache();
        if (cached) emit();
        for (;;) {
          try { const changed = await sync(); started = true; if (changed || !cached) emit(); settled(); break; }
          catch (err) {
            if (cached) { started = true; failed(err); break; } // the copy on this device stays readable
            if (err.code === 'auth') { if (listening) { clearInterval(pollTimer); auth.token = null; } throw err; }
            // nothing saved on this device yet: keep the error showing and try again on the next poll, when back online or back in the tab
            listen(); failed(err.code === 'oldbrowser' || err.code === 'invalid' ? err : undefined); // what to do about it, when there is something
            await new Promise(res => { retryStart = res; });
          }
        }
        listen(); if (unsaved()) scheduleFlush(); else deleteFiles();
        foldIn(true);
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
      // Not while photos or changes are still on their way to GitHub; then this device forgets the token and the private data it
      // keeps: the saved copy, thumbnails, full photos and drafts. Unsent file deletions only leave spare files behind.
      async signOut() {
        if (unsaved() || flushing || uploading) throw Object.assign(new Error('Still saving to GitHub. Log out once it says SYNCED, so nothing is lost.'), { code: 'unsaved' });
        closed = true; clearInterval(pollTimer); localStorage.removeItem('olc:github');
        for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith('olc:drafts:')) localStorage.removeItem(k); }
        await db.drop(k => typeof k === 'string' && /^(github-state:|thumb:|full:)/.test(k));
        location.reload();
      },
      pending: () => unsaved() || !!flushing,
      async isSeeded() { if (!started) await sync(); return !!view().meta.seeded; },
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
      // a top picture that was replaced or reset: its file is deleted once that change is saved (never one still in use)
      async dropFull(id) {
        const v = view(); if (!id || v.meta.hero === id || (v.collections.photos || []).some(p => p.id === id)) return;
        fileDeletes.push({ path: `photos/${id}.jpg`, sha: fileShas.get(id)?.full || null }); await forget(id);
        await persist([]); deleteFiles();
      },
      // files uploaded for photos whose records were never saved (a post that failed part way): deleted in the background
      async discard(ids) {
        for (const id of ids) { const s = fileShas.get(id) || {}; fileDeletes.push({ path: `photos/${id}-thumb.jpg`, sha: s.thumb || null }, { path: `photos/${id}.jpg`, sha: s.full || null }); await forget(id); }
        await persist([]); deleteFiles();
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
