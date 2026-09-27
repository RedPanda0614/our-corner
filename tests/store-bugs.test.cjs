// Store fixes, checked against a fake GitHub (never api.github.com).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../store.js'), 'utf8');
const clone = x => structuredClone(x);
const RAW = 'application/vnd.github.raw';
const response = (status, body = {}, headers = {}) => ({ status, ok: status >= 200 && status < 300, headers: { get: k => headers[k.toLowerCase()] ?? null }, json: async () => clone(body), text: async () => JSON.stringify(body), arrayBuffer: async () => new ArrayBuffer(0) });
const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64');
const settle = async (n = 20) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };
async function waitFor(check, what) { for (let i = 0; i < 400; i++) { if (check()) return; await new Promise(r => setTimeout(r, 5)); } assert.fail('timed out waiting for ' + what); }
const IMG = 'data:image/jpeg;base64,YQ==';

function server() {
  return {
    data: { version: 1, meta: { seeded: true }, collections: { events: [], dates: [], trips: [], tasks: [], wishes: [], diary: [], photos: [] } },
    sha: 1, files: new Map(), fileSeq: 0, log: [], messages: [], offline: false, conflict: null, beforePut: null,
    verify: { status: 200, body: {}, headers: {} }, dataReply: null, lagOnce: null,
    deleteStatus: [], photoStatus: null, photoDelay: 0, active: 0, maxActive: 0,
    count(re) { return this.log.filter(l => re.test(l)).length; },
    async fetch(url, options = {}) {
      const file = decodeURIComponent(new URL(url).pathname).split('/contents/')[1];
      const method = options.method || 'GET', raw = options.headers?.Accept === RAW;
      this.log.push(`${method} ${file ?? '(repo)'}${raw ? ' raw' : ''}`);
      if (this.offline) throw new TypeError('Failed to fetch');
      if (file == null) return this.verify.status === 200 ? response(200, { private: true, permissions: { push: true } }) : response(this.verify.status, this.verify.body, this.verify.headers);
      if (file === 'photos') return response(200, [...this.files].map(([p, f]) => ({ name: p.slice(7), path: p, sha: f.sha, type: 'file' })));
      if (file.startsWith('photos/')) {
        const cur = this.files.get(file), body = options.body ? JSON.parse(options.body) : {};
        if (method === 'PUT') {
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
        await new Promise(r => setTimeout(r, this.photoDelay)); this.active--;
        if (this.photoStatus) return response(this.photoStatus);
        if (!cur) return response(404);
        if (raw) return { ...response(200), arrayBuffer: async () => Buffer.from(cur.content, 'base64') };
        return response(200, { sha: cur.sha, content: cur.content });
      }
      if (method === 'PUT') {
        await new Promise(resolve => setImmediate(resolve));
        if (this.conflict) { this.conflict(this.data); this.conflict = null; this.sha++; }
        if (this.beforePut) { this.beforePut(); this.beforePut = null; }
        const body = JSON.parse(options.body); this.messages.push(body.message);
        if (this.data == null ? !!body.sha : body.sha !== String(this.sha)) return response(409);
        this.data = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8')); this.sha++;
        return response(200, { content: { sha: String(this.sha) } });
      }
      if (this.dataReply) return response(...this.dataReply);
      if (this.lagOnce) { const lag = this.lagOnce; this.lagOnce = null; return response(200, lag); }
      if (this.data == null) return response(404, { message: 'Not Found' });
      return response(200, { sha: String(this.sha), content: b64(this.data) }, { etag: '"' + this.sha + '"' });
    }
  };
}

// A page in a fake browser. `quota(key, value, disk)` returning true makes that IndexedDB write fail like a full disk.
function browser(remote, { disk = new Map(), local = new Map(), quota = null, config = { github: { owner: 'test', repo: 'private-data' } } } = {}) {
  const timers = new Map(), intervals = [], listeners = {}, warnings = [], clock = { offset: 0 }; let timerId = 0;
  const indexedDB = { open() {
    const request = { result: { transaction() {
      const tx = { objectStore() { return {
        get(key) { const req = {}; queueMicrotask(() => { req.result = clone(disk.get(key)); req.onsuccess?.(); }); return req; },
        put(value, key) { const snapshot = clone(value); queueMicrotask(() => { if (quota && quota(key, snapshot, disk)) { tx.error = new Error('QuotaExceededError'); tx.onabort?.(); return; } disk.set(key, snapshot); tx.oncomplete?.(); }); },
        delete(key) { queueMicrotask(() => { disk.delete(key); tx.oncomplete?.(); }); }
      }; } }; return tx;
    } } }; queueMicrotask(() => request.onsuccess?.()); return request;
  } };
  const on = prefix => (type, fn) => { (listeners[prefix + type] ||= []).push(fn); };
  const window = { addEventListener: on('') };
  class FakeDate extends Date { static now() { return Date.now() + clock.offset; } }
  class Blob { constructor(parts, o) { this.parts = parts; this.type = o?.type; } }
  class FileReader { readAsDataURL(blob) { setImmediate(() => { this.result = `data:${blob.type};base64,` + Buffer.concat(blob.parts.map(p => Buffer.from(p))).toString('base64'); this.onload?.(); }); } }
  const context = vm.createContext({ window, indexedDB, localStorage: { getItem: k => local.get(k), setItem: (k, v) => local.set(k, v), removeItem: k => local.delete(k) },
    document: { hidden: false, addEventListener: on('doc:') }, navigator: { onLine: true }, Date: FakeDate, Blob, FileReader,
    fetch: (...args) => remote.fetch(...args), TextEncoder, TextDecoder, Uint8Array,
    btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary'),
    setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id),
    setInterval: (fn, ms) => { intervals.push({ fn, ms }); return ++timerId; }, clearInterval() {}, console: { ...console, warn: (...a) => warnings.push(a) }
  });
  vm.runInContext(source, context);
  const store = window.CCStore.create(config);
  const changes = {}, statuses = []; let emits = 0;
  const page = { store, disk, local, changes, statuses, timers, intervals, listeners, warnings, clock, get emits() { return emits; },
    connect: () => store.start((col, items) => { if (col === 'meta') emits++; changes[col] = clone(items); }, (state, error) => statuses.push({ state, error })),
    async start(name = '斯婕') { await store.signIn('fake-test-credential', name); await page.connect(); },
    async runTimers(ms) { const due = [...timers].filter(([, t]) => t.ms === ms); due.forEach(([id]) => timers.delete(id)); for (const [, t] of due) await t.fn(); return due.length; },
    async flush() { assert.ok(await page.runTimers(700), 'save scheduled'); },
    fire: (type, ...args) => Promise.all((listeners[type] || []).map(fn => fn(...args)))
  };
  return page;
}
async function addPhotos(page, entryId, ids) {
  for (const id of ids) { await page.store.putFull(id, IMG); await page.store.set('photos', { id, entryId, thumb: IMG }); }
  await page.store.set('diary', { id: entryId, text: 'Picnic', photoIds: ids });
  await page.flush();
}
// app.js entry delete handler, unchanged: photo records one by one, then the entry
async function deleteEntry(page, id) { const entry = page.changes.diary.find(x => x.id === id); for (const pid of entry.photoIds) await page.store.remove('photos', pid); await page.store.remove('diary', id); }

// ---------- #6 per-person meta entries ----------
test('avatar and colour changes made at the same time on both phones both survive', async () => {
  const remote = server(), a = browser(remote), b = browser(remote);
  await a.start('斯婕'); await b.start('真真');
  await a.store.metaKey('avatars', 'sijie', 'data:A'); await a.store.metaKey('kindColors', 'trip', '#111111');
  await b.store.metaKey('avatars', 'zhenzhen', 'data:B'); await b.store.metaKey('kindColors', 'plan', '#222222');
  await a.flush(); await b.flush(); // b replays onto a's save
  assert.deepEqual(remote.data.meta.avatars, { sijie: 'data:A', zhenzhen: 'data:B' });
  assert.deepEqual(remote.data.meta.kindColors, { trip: '#111111', plan: '#222222' });
  await a.store.metaKey('avatars', 'sijie', null); await a.flush(); // Remove picture
  assert.deepEqual(remote.data.meta.avatars, { zhenzhen: 'data:B' });
});

// ---------- mergeMeta ----------
test('mergeMeta: two devices of one person saving out of order keep the newest seen time, all seen ids and the earliest kept time', async () => {
  const remote = server(), phone = browser(remote), laptop = browser(remote);
  await phone.start(); await laptop.start();
  await laptop.store.mergeMeta('statusSeen:sijie', 1790000000000);
  await phone.store.mergeMeta('statusSeen:sijie', 1780000000000); // older value saved later
  await laptop.store.mergeMeta('achievements:sijie', { seen: ['a', 'b'] });
  await phone.store.mergeMeta('achievements:sijie', { seen: ['b', 'c'] });
  await laptop.store.mergeMeta('achievements:sijie', { kept: { 'first-entry': 300, 'first-photo': 50 } }, 'min');
  await phone.store.mergeMeta('achievements:sijie', { kept: { 'first-entry': 123 } }, 'min');
  await laptop.flush(); await phone.flush();
  assert.equal(remote.data.meta['statusSeen:sijie'], 1790000000000);
  assert.deepEqual(remote.data.meta['achievements:sijie'], { seen: ['a', 'b', 'c'], kept: { 'first-entry': 123, 'first-photo': 50 } });
  const reopened = browser(remote); await reopened.start();
  assert.equal(reopened.changes.meta['statusSeen:sijie'], 1790000000000);
  assert.match(remote.messages.at(-1), /: sync/);
});

test('mergeMeta works on older data without the key, keeps values for null and lets a new type win', async () => {
  const remote = server(), page = browser(remote); await page.start();
  assert.equal(page.changes.meta['achievements:zhenzhen'], undefined);
  await page.store.mergeMeta('achievements:zhenzhen', { seen: ['x'], kept: { x: 5 } });
  await page.store.mergeMeta('achievements:zhenzhen', null);
  await page.store.mergeMeta('achievements:zhenzhen', { seen: ['x', 'y'], kept: { x: null } });
  await page.store.mergeMeta('statusSeen:zhenzhen', 'not a number');
  await page.store.mergeMeta('statusSeen:zhenzhen', 7);
  await page.flush();
  assert.deepEqual(remote.data.meta['achievements:zhenzhen'], { seen: ['x', 'y'], kept: { x: 5 } });
  assert.equal(remote.data.meta['statusSeen:zhenzhen'], 7);
});

test('metaKey and mergeMeta also work in local mode', async () => {
  const page = browser(null, { config: {} }); await page.connect();
  await page.store.metaKey('avatars', 'sijie', 'data:A'); await page.store.mergeMeta('statusSeen:sijie', 5); await page.store.mergeMeta('statusSeen:sijie', 3);
  assert.deepEqual(page.disk.get('data').meta.avatars, { sijie: 'data:A' });
  assert.equal(page.changes.meta['statusSeen:sijie'], 5);
});
