// A fake GitHub and a fake browser page for the store tests (never api.github.com).
// GitHub: the contents API (files, and folder listings with ETags and 304s; base64 PUTs checked against the file's sha;
// DELETE), git blobs by sha, the gzip data files in data/, the old single data.json, photos, rate limits and an offline switch.
// The page: store.js in its own context, with a fake IndexedDB (one transaction: all writes or none), timers and a clock.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname, '../store.js'), 'utf8');
const clone = x => structuredClone(x);
const RAW = 'application/vnd.github.raw';
const IMG = 'data:image/jpeg;base64,YQ==';
const PEOPLE = ['sijie', 'zhenzhen'], PARTS = ['main', 'imported', ...PEOPLE];
const SHARED = 'github-state:test/private-data:main:v2', FILE = name => SHARED + ':' + name, OLD = 'github-state:test/private-data:main';
const settle = async (n = 20) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };
async function waitFor(check, what) { for (let i = 0; i < 400; i++) { if (check()) return; await new Promise(r => setTimeout(r, 5)); } assert.fail('timed out waiting for ' + what); }
const response = (status, body = {}, headers = {}) => {
  const bytes = Buffer.isBuffer(body) ? body : null;
  return { status, ok: status >= 200 && status < 300, headers: { get: k => headers[k.toLowerCase()] ?? null },
    json: async () => (bytes ? JSON.parse(bytes.toString('utf8')) : clone(body)), text: async () => (bytes ? bytes.toString('utf8') : JSON.stringify(body)),
    arrayBuffer: async () => { const b = bytes || Buffer.alloc(0); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); } };
};
const gitSha = buf => crypto.createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
const gz = value => zlib.gzipSync(JSON.stringify(value));
const ungz = buf => JSON.parse(zlib.gunzipSync(buf).toString('utf8'));
const COLLECTIONS = ['events', 'trips', 'tasks', 'dates', 'wishes', 'diary', 'photos', 'albums', 'answers', 'questions', 'checkins'];

// The one-file data -> the files, as the spec lays them out (written apart from store.js, so the tests compare the two)
function split(data, stamp) {
  const parts = { main: { version: 2, meta: {}, collections: {} }, imported: { version: 2, meta: {}, collections: { events: [] } } };
  for (const p of PEOPLE) parts[p] = { version: 2, meta: {}, collections: {} };
  for (const [k, v] of Object.entries(data.meta || {})) {
    const who = PEOPLE.find(p => k.endsWith(':' + p));
    if (who) parts[who].meta[k] = v;
    else if (k === 'inboxReads') for (const [p, r] of Object.entries(v)) { const n = PEOPLE.includes(p) ? p : 'main'; parts[n].meta.inboxReads = { ...parts[n].meta.inboxReads, [p]: r }; }
    else parts.main.meta[k] = v;
  }
  for (const [c, list] of Object.entries(data.collections || {})) {
    if (c === 'events') { parts.main.collections.events = list.filter(e => !e.importKey); parts.imported.collections.events = list.filter(e => e.importKey); }
    else parts.main.collections[c] = list;
  }
  if (stamp) for (const n of PARTS) parts[n].meta.legacy = stamp;
  return parts;
}
// The files -> what the page sees (main's records first; meta.legacy is a record, not shown)
function join(parts) {
  const meta = {}, collections = {};
  for (const n of PARTS) for (const [k, v] of Object.entries(parts[n]?.meta || {})) if (k !== 'legacy') meta[k] = k === 'inboxReads' && meta.inboxReads ? { ...meta.inboxReads, ...v } : v;
  for (const n of PARTS) for (const [c, list] of Object.entries(parts[n]?.collections || {})) collections[c] = [...(collections[c] || []), ...list];
  return { meta, collections };
}

function server({ legacy = false } = {}) {
  const s = {
    seed: { version: 1, meta: { seeded: true }, collections: { events: [], dates: [], trips: [], tasks: [], wishes: [], diary: [], photos: [] } },
    legacy, // true: the repo has only the single data.json, as before the split
    ready: false, tree: new Map(), blobs: new Map(), // path -> sha for data.json and data/*.json.gz; sha -> bytes, every version ever saved
    files: new Map(), fileSeq: 0, log: [], messages: [], puts: [], offline: false, conflict: null, beforePut: null,
    verify: { status: 200, body: {}, headers: {} }, publicRepo: false, dataReply: null, lagOnce: null, rejectWrites: false,
    deleteStatus: [], photoPut: {}, photoStatus: null, photoReply: null, putReply: null, photoDelay: 0, active: 0, maxActive: 0, putActive: 0, putMaxActive: 0,
    count(re) { return this.log.filter(l => re.test(l)).length; },
    // Before the first request `data` is the starting data (the files are made from it, or data.json when legacy);
    // after that it is the files joined the way the page sees them (or data.json while nothing has been moved).
    get data() { if (!this.ready) return this.seed; return PARTS.some(n => this.tree.has(`data/${n}.json.gz`)) ? this.view() : this.tree.has('data.json') ? this.json('data.json') : null; },
    set data(v) { assert.ok(!this.ready, 'set remote.data before the first request, then use edit()'); this.seed = v; },
    setup() {
      if (this.ready) return; this.ready = true;
      if (this.seed == null) return;
      if (this.legacy) this.write('data.json', Buffer.from(JSON.stringify(this.seed, null, 1)));
      else { const parts = split(this.seed); for (const n of PARTS) this.write(`data/${n}.json.gz`, gz(parts[n])); }
    },
    write(p, buf) { const sha = gitSha(buf); this.blobs.set(sha, buf); this.tree.set(p, sha); return sha; },
    drop(p) { this.setup(); this.tree.delete(p); },
    bytes(p) { this.setup(); return this.blobs.get(this.tree.get(p)); },
    json(p) { const b = this.bytes(p); return b == null ? null : p.endsWith('.gz') ? ungz(b) : JSON.parse(b.toString('utf8')); },
    part(n) { return this.json(`data/${n}.json.gz`); },
    edit(n, fn) { this.setup(); const d = this.part(n); fn(d); return this.write(`data/${n}.json.gz`, gz(d)); }, // the other phone saves one file
    editOld(fn) { this.setup(); const d = this.json('data.json'); fn(d); return this.write('data.json', Buffer.from(JSON.stringify(d, null, 1))); }, // an older app saves data.json
    view() { return join(Object.fromEntries(PARTS.map(n => [n, this.part(n)]))); },
    entries(dir) { // a folder listing as GitHub gives it; null when there is no such folder (an empty repo has no root listing)
      const data = [...this.tree].filter(([p]) => p.startsWith('data/')).map(([p, sha]) => ({ name: p.slice(5), path: p, sha, size: this.blobs.get(sha).length, type: 'file' }));
      if (dir === 'data') return data.length ? data : null;
      const root = [];
      if (this.tree.has('data.json')) root.push({ name: 'data.json', path: 'data.json', sha: this.tree.get('data.json'), size: this.bytes('data.json').length, type: 'file' });
      if (data.length) root.push({ name: 'data', path: 'data', sha: gitSha(Buffer.from(JSON.stringify(data))), size: 0, type: 'dir' });
      if (this.files.size) root.push({ name: 'photos', path: 'photos', sha: gitSha(Buffer.from(JSON.stringify([...this.files]))), size: 0, type: 'dir' });
      return root.length ? root : null;
    },
    async fetch(url, options = {}) {
      this.setup();
      const p = decodeURIComponent(new URL(url).pathname).replace(/^\/repos\/[^/]+\/[^/]+\/?/, '');
      const method = options.method || 'GET', raw = options.headers?.Accept === RAW;
      const file = p === 'contents' || p.startsWith('contents/') ? p.slice(9) : null, blobSha = p.startsWith('git/blobs/') ? p.slice(10) : null;
      if (p === 'contents/') { this.log.push(`${method} contents/ (not canonical)`); return response(400, { message: 'Request path could not be canonicalized' }); } // the root is /contents, never /contents/
      this.log.push(`${method} ${p === '' ? '(repo)' : blobSha ? 'blob ' + blobSha : file === '' ? '/' : file}${raw ? ' raw' : ''}`);
      if (this.offline) throw new TypeError('Failed to fetch');
      if (p === '') return this.verify.status === 200 ? response(200, { private: !this.publicRepo, permissions: { push: true } }) : response(this.verify.status, this.verify.body, this.verify.headers);
      if (file === 'photos') return response(200, [...this.files].map(([fp, f]) => ({ name: fp.slice(7), path: fp, sha: f.sha, type: 'file' })));
      if (file && file.startsWith('photos/')) {
        const cur = this.files.get(file), body = options.body ? JSON.parse(options.body) : {};
        if (method === 'PUT') {
          this.putActive++; this.putMaxActive = Math.max(this.putMaxActive, this.putActive); await new Promise(r => setImmediate(r)); this.putActive--;
          if (this.photoPut[file]) return response(...[].concat(this.photoPut[file]));
          if (cur && body.sha !== cur.sha) return response(422);
          const sha = 'file-' + (++this.fileSeq); this.files.set(file, { content: body.content, sha });
          return response(201, { content: { sha } });
        }
        if (method === 'DELETE') {
          const forced = this.deleteStatus.shift(); if (forced) return response(forced);
          if (!cur) return response(404);
          if (body.sha !== cur.sha) return response(409);
          this.files.delete(file); return response(200);
        }
        this.active++; this.maxActive = Math.max(this.maxActive, this.active);
        await new Promise(r => (this.gate ? this.gate.push(r) : setTimeout(r, this.photoDelay))); this.active--; // gate: held until the test lets it through
        if (this.photoStatus) return response(this.photoStatus);
        if (this.photoReply) return response(...this.photoReply);
        if (!cur) return response(404);
        if (raw) return { ...response(200), arrayBuffer: async () => Buffer.from(cur.content, 'base64') };
        return response(200, { sha: cur.sha, content: cur.content });
      }
      if (method === 'PUT') { // data.json or a data/ file: base64 content, created only without a sha, replaced only with the current one
        this.putActive++; this.putMaxActive = Math.max(this.putMaxActive, this.putActive); await new Promise(r => setImmediate(r)); this.putActive--;
        if (this.rejectWrites) return response(403, { message: 'Resource not accessible by personal access token' });
        if (this.conflict && file.startsWith('data/')) { const c = this.conflict; this.conflict = null; this.edit(file.slice(5, -8), c); } // the other phone saved this file first
        if (this.beforePut) { const b = this.beforePut; this.beforePut = null; b(file); }
        if (this.putReply) { const reply = this.putReply; this.putReply = null; return response(...reply); }
        const body = JSON.parse(options.body); this.messages.push(body.message); this.puts.push({ path: file, bytes: options.body.length });
        const cur = this.tree.get(file);
        if (cur && !body.sha) return response(422, { message: 'Invalid request. "sha" wasn\'t supplied.' });
        if (cur ? body.sha !== cur : body.sha) return response(409, { message: `${file} does not match ${body.sha}` });
        const sha = this.write(file, Buffer.from(body.content, 'base64'));
        return response(cur ? 200 : 201, { content: { sha, path: file } });
      }
      if (this.dataReply) return response(...this.dataReply);
      if (blobSha != null) { // git blobs: immutable, by sha
        const b = this.blobs.get(blobSha); if (!b) return response(404, { message: 'Not Found' });
        return raw ? response(200, b) : response(200, { sha: blobSha, size: b.length, content: b.toString('base64'), encoding: 'base64' });
      }
      if (file === '' || file === 'data') {
        let entries = this.entries(file);
        if (file === 'data' && this.lagOnce) { entries = this.lagOnce; this.lagOnce = null; } // a listing from before the latest saves
        if (!entries) return response(404, { message: 'Not Found' });
        const etag = 'W/"' + gitSha(Buffer.from(JSON.stringify(entries))) + '"';
        if (options.headers?.['If-None-Match'] === etag) return response(304, {}, { etag });
        return response(200, entries, { etag });
      }
      if (file != null && this.tree.has(file)) {
        const sha = this.tree.get(file), b = this.blobs.get(sha);
        if (raw) return response(200, b);
        return response(200, { name: file.split('/').pop(), path: file, sha, size: b.length, type: 'file', ...(b.length > 1e6 ? { content: '', encoding: 'none' } : { content: b.toString('base64'), encoding: 'base64' }) });
      }
      return response(404, { message: 'Not Found' });
    }
  };
  return s;
}

// A page in a fake browser. `quota(key, value, disk)` returning true makes that IndexedDB write fail like a full disk;
// idb: false, no IndexedDB at all; zip: false, a browser without CompressionStream.
function browser(remote, { disk = new Map(), local = new Map(), quota = null, idb = true, zip = true, config = { github: { owner: 'test', repo: 'private-data' } } } = {}) {
  const timers = new Map(), intervals = [], listeners = {}, warnings = [], clock = { offset: 0 }; let timerId = 0;
  const indexedDB = { open() { if (!idb) throw new Error('IndexedDB is not available here');
    const request = { result: { transaction() {
      let open = 0, full = false; const writes = [];
      const later = fn => { open++; queueMicrotask(() => { fn(); if (--open) return; if (full) { tx.error = new Error('QuotaExceededError'); tx.onabort?.(); return; } for (const [k, v, del] of writes) del ? disk.delete(k) : disk.set(k, v); tx.oncomplete?.(); }); };
      const tx = { objectStore() { return {
        get(key) { const req = {}; queueMicrotask(() => { req.result = clone(disk.get(key)); req.onsuccess?.(); }); return req; },
        getAllKeys() { const req = {}; later(() => { req.result = [...disk.keys()]; req.onsuccess?.(); }); return req; },
        put(value, key) { const snapshot = clone(value); later(() => { if (quota && quota(key, snapshot, disk)) full = true; writes.push([key, snapshot]); }); },
        delete(key) { later(() => writes.push([key, undefined, true])); }
      }; } }; return tx;
    } } }; queueMicrotask(() => request.onsuccess?.()); return request;
  } };
  const on = prefix => (type, fn) => { (listeners[prefix + type] ||= []).push(fn); };
  const window = { addEventListener: on('') };
  class FakeDate extends Date { static now() { return Date.now() + clock.offset; } }
  class Blob { constructor(parts, o) { this.parts = parts; this.type = o?.type; } }
  class FileReader { readAsDataURL(blob) { setImmediate(() => { this.result = `data:${blob.type};base64,` + Buffer.concat(blob.parts.map(p => Buffer.from(p))).toString('base64'); this.onload?.(); }); } }
  const reloads = { n: 0 };
  const context = vm.createContext({ window, indexedDB, location: { reload: () => { reloads.n++; } },
    localStorage: { getItem: k => local.get(k), setItem: (k, v) => local.set(k, v), removeItem: k => local.delete(k), get length() { return local.size; }, key: i => [...local.keys()][i] ?? null },
    document: { hidden: false, addEventListener: on('doc:') }, navigator: { onLine: true }, Date: FakeDate, Blob, FileReader,
    fetch: (...args) => remote.fetch(...args), TextEncoder, TextDecoder, Uint8Array, structuredClone,
    ...(zip ? { CompressionStream, DecompressionStream } : {}),
    btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary'),
    setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms, at: Date.now() + clock.offset + ms }); return id; }, clearTimeout: id => timers.delete(id),
    setInterval: (fn, ms) => { intervals.push({ fn, ms }); return ++timerId; }, clearInterval() {}, console: { ...console, warn: (...a) => warnings.push(a) }
  });
  vm.runInContext(source, context);
  const store = window.CCStore.create(config);
  const changes = {}, lists = {}, statuses = [], photoTimes = [], photoHints = []; let emits = 0; // emits: full updates (meta is sent with every one); photoTimes: when the photo list was sent
  const page = { store, disk, local, changes, lists, statuses, timers, intervals, listeners, warnings, clock, photoTimes, photoHints, Blob, reloads, get emits() { return emits; },
    connect: () => store.start((col, items, hint) => { if (col === 'meta') emits++; if (col === 'photos') { photoTimes.push(Date.now() + clock.offset); photoHints.push(hint); } changes[col] = clone(items); lists[col] = items; }, (state, error) => statuses.push({ state, error })),
    async start(name = '斯婕') { await store.signIn('fake-test-credential', name); await page.connect(); },
    async runTimers(ms) { const due = [...timers].filter(([, t]) => t.ms === ms); due.forEach(([id]) => timers.delete(id)); for (const [, t] of due) await t.fn(); return due.length; },
    async flush() { assert.ok(await page.runTimers(700), 'save scheduled'); },
    poll: () => intervals[0].fn(),
    file: name => disk.get(FILE(name)), shared: () => disk.get(SHARED), // this device's copy
    async advance(ms) { // move the clock on, running each timer that falls due on the way at its own time
      const end = Date.now() + clock.offset + ms;
      for (;;) {
        const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        clock.offset = Math.max(clock.offset, due[1].at - Date.now()); timers.delete(due[0]); await due[1].fn(); await settle();
      }
      clock.offset = end - Date.now();
    },
    fire: (type, ...args) => Promise.all((listeners[type] || []).map(fn => fn(...args)))
  };
  return page;
}

module.exports = { server, browser, split, join, gz, ungz, gitSha, settle, waitFor, clone, IMG, RAW, PEOPLE, PARTS, SHARED, FILE, OLD, COLLECTIONS };
