// Store fixes, checked against a fake GitHub (never api.github.com): photo deletes, meta merges, thumbnails,
// rate limits, first start, device storage, a repo without data.json, lagging reads.
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

// ---------- #4 entry delete offline / after a failed file delete ----------
test('deleting a diary entry offline removes it right away and deletes the photo files once back online', async () => {
  const remote = server(), page = browser(remote); await page.start();
  await addPhotos(page, 'e1', ['p1', 'p2']);
  assert.equal(remote.files.size, 4);
  remote.offline = true;
  await deleteEntry(page, 'e1'); // used to throw "Failed to fetch" after removing one photo record
  assert.deepEqual(page.changes.diary, []); assert.deepEqual(page.changes.photos, []);
  assert.equal(page.store.pending(), true);
  await page.flush(); // offline: nothing saved, nothing lost
  // reopen the app later, online: the queued removal saves first, then the files go
  remote.offline = false;
  const reopened = browser(remote, { disk: page.disk, local: page.local }); await reopened.start(); await reopened.flush();
  assert.deepEqual(remote.data.collections.diary, []); assert.deepEqual(remote.data.collections.photos, []);
  assert.equal(remote.files.size, 0);
  assert.deepEqual(reopened.disk.get('github-state:test/private-data:main').files, []);
});

test('a photo file delete that fails is retried later and never blocks the entry removal', async () => {
  const remote = server(), page = browser(remote); await page.start();
  await addPhotos(page, 'e1', ['p1', 'p2']);
  remote.deleteStatus = [409, 409];
  await deleteEntry(page, 'e1');
  const order = remote.log.length;
  await page.flush();
  assert.deepEqual(remote.data.collections.diary, []); // saved even though a file delete failed
  assert.ok(remote.log.slice(order).findIndex(l => l === 'PUT data.json') < remote.log.slice(order).findIndex(l => l.startsWith('DELETE')), 'data saved before files deleted');
  assert.equal(remote.files.size, 4);
  assert.equal(page.statuses.at(-1).state, 'synced');
  assert.ok(await page.runTimers(20000), 'retry scheduled'); await settle();
  assert.equal(remote.files.size, 0);
});

// ---------- #27 photo delete without downloading the photo ----------
test('deleting a photo uses the file shas saved at upload and downloads nothing', async () => {
  const remote = server(), page = browser(remote); await page.start();
  await addPhotos(page, 'e1', ['p1']);
  assert.deepEqual(remote.data.collections.photos[0].shas, { full: remote.files.get('photos/p1.jpg').sha, thumb: remote.files.get('photos/p1-thumb.jpg').sha });
  const order = remote.log.length;
  await page.store.remove('photos', 'p1'); await page.flush();
  assert.deepEqual(remote.log.slice(order).filter(l => l.startsWith('GET')), []);
  assert.equal(remote.files.size, 0);
});

test('older photo records without shas use one directory listing instead of reading each file', async () => {
  const remote = server();
  for (const id of ['old1', 'old2']) { remote.files.set(`photos/${id}.jpg`, { content: 'YQ==', sha: id + '-full' }); remote.files.set(`photos/${id}-thumb.jpg`, { content: 'YQ==', sha: id + '-thumb' }); }
  remote.data.collections.photos = [{ id: 'old1', thumb: '' }, { id: 'old2', thumb: '' }];
  const page = browser(remote); await page.start(); await settle();
  const order = remote.log.length;
  await page.store.remove('photos', 'old1'); await page.store.remove('photos', 'old2'); await page.flush();
  assert.deepEqual(remote.log.slice(order).filter(l => l.startsWith('GET') && !l.endsWith(' raw')), ['GET photos']);
  assert.equal(remote.files.size, 0);
});

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

// ---------- #8 thumbnails ----------
test('a new device downloads thumbnails four at a time and redraws once per burst', async () => {
  const remote = server(); remote.photoDelay = 2;
  remote.data.collections.photos = Array.from({ length: 30 }, (_, i) => ({ id: 'ph' + i, thumb: '' }));
  for (let i = 0; i < 30; i++) remote.files.set(`photos/ph${i}-thumb.jpg`, { content: 'YQ==', sha: 's' + i });
  const page = browser(remote); await page.start();
  await waitFor(() => remote.count(/-thumb\.jpg raw$/) === 30 && remote.active === 0, 'thumbs');
  await settle();
  assert.ok(remote.maxActive <= 4, 'max concurrent ' + remote.maxActive);
  const before = page.emits, runs = await page.runTimers(50);
  assert.equal(page.emits - before, runs); assert.ok(runs <= 2, 'emits ' + runs);
  assert.ok(page.changes.photos.every(p => p.thumb.startsWith('data:image/jpeg;base64,')));
});

test('failed thumbnails wait before trying again instead of being requested on every change', async () => {
  const remote = server(); remote.photoStatus = 403;
  remote.data.collections.photos = Array.from({ length: 10 }, (_, i) => ({ id: 'ph' + i, thumb: '' }));
  const page = browser(remote); await page.start();
  await waitFor(() => remote.count(/-thumb/) === 10 && remote.active === 0, 'first tries'); await settle();
  for (let i = 0; i < 5; i++) await page.store.set('tasks', { id: 't' + i, title: 'x' });
  await settle();
  assert.equal(remote.count(/-thumb/), 10);
  remote.photoStatus = null; for (let i = 0; i < 10; i++) remote.files.set(`photos/ph${i}-thumb.jpg`, { content: 'YQ==', sha: 's' + i });
  page.clock.offset = 16000; await page.intervals[0].fn(); // next poll after the wait
  await waitFor(() => remote.count(/-thumb/) === 20 && remote.active === 0, 'retry'); await settle(); await page.runTimers(50);
  assert.ok(page.changes.photos.every(p => p.thumb));
});

// ---------- #9 rate limits ----------
test('a rate-limited 403 at startup keeps the saved token', async () => {
  for (const verify of [{ status: 403, body: { message: 'API rate limit exceeded' }, headers: { 'x-ratelimit-remaining': '0' } },
    { status: 403, body: { message: 'You have exceeded a secondary rate limit.' }, headers: {} },
    { status: 403, body: {}, headers: { 'retry-after': '60' } }]) {
    const remote = server(); remote.verify = verify;
    const local = new Map([['olc:github', JSON.stringify({ token: 'saved', name: '斯婕' })]]);
    const page = browser(remote, { local });
    const [user, err] = await new Promise(res => page.store.onAuth((...a) => res(a)));
    assert.deepEqual({ ...user }, { name: '斯婕' }); assert.equal(err, undefined);
    assert.ok(local.has('olc:github'));
  }
});

test('a rate limit while loading is a sync error, not a bad token; a real 401/403 still signs out', async () => {
  const remote = server(), page = browser(remote); await page.start();
  remote.dataReply = [403, { message: 'API rate limit exceeded for user.' }, { 'x-ratelimit-remaining': '0' }];
  const again = browser(remote, { disk: page.disk, local: page.local }); await again.connect(); // with a copy on this device
  assert.equal(again.statuses.at(-1).state, 'error'); assert.notEqual(again.statuses.at(-1).error.code, 'auth');
  const fresh = browser(remote, { local: page.local }); let done = false; // nothing on this device: waits and tries again
  fresh.connect().then(() => { done = true; }, () => { done = 'threw'; });
  await settle(); assert.equal(done, false); assert.equal(fresh.statuses.at(-1).state, 'error');
  remote.dataReply = null; await fresh.intervals[0].fn(); await waitFor(() => done === true, 'start after the limit');
  assert.ok(page.local.has('olc:github'));
  for (const verify of [{ status: 401, body: {}, headers: {} }, { status: 403, body: { message: 'Resource not accessible by personal access token' }, headers: {} }]) {
    remote.verify = verify;
    const local = new Map([['olc:github', JSON.stringify({ token: 'bad', name: '斯婕' })]]);
    const [user, err] = await new Promise(res => browser(remote, { local }).store.onAuth((...a) => res(a)));
    assert.equal(user, null); assert.equal(err.code, 'auth'); assert.equal(local.has('olc:github'), false);
  }
});

// ---------- #10 first start fails ----------
test('when the very first start fails it keeps retrying and loads once the connection is back', async () => {
  const remote = server(); remote.data.collections.tasks = [{ id: 'saved', title: 'x' }];
  const page = browser(remote); await page.store.signIn('fake-test-credential', '斯婕');
  remote.offline = true;
  let done = false; const starting = page.connect().then(() => { done = true; });
  await settle();
  assert.equal(done, false); assert.equal(page.statuses.at(-1).state, 'error');
  assert.equal(page.intervals.length, 1); assert.ok(page.listeners.online && page.listeners['doc:visibilitychange']);
  await page.intervals[0].fn(); await settle(); // still offline: keeps waiting
  assert.equal(done, false);
  remote.offline = false; await page.fire('online'); await starting;
  assert.deepEqual(page.changes.tasks.map(t => t.id), ['saved']); assert.equal(page.statuses.at(-1).state, 'synced');
  assert.equal(page.intervals.length, 1);
});

test('a first start that fails because of the token still reports it to sign in again', async () => {
  const remote = server(), page = browser(remote); await page.store.signIn('fake-test-credential', '斯婕');
  remote.dataReply = [401, {}];
  await assert.rejects(page.connect(), e => e.code === 'auth');
});

// ---------- #12 device storage full ----------
test('a full device storage does not stop the app, hide changes or fail a photo post', async () => {
  const remote = server(), page = browser(remote, { quota: () => true });
  await page.start(); // used to throw QuotaExceededError
  await page.store.set('tasks', { id: 'q1', title: 'x' });
  assert.ok(page.changes.tasks.some(t => t.id === 'q1'));
  await page.flush(); assert.ok(remote.data.collections.tasks.some(t => t.id === 'q1'));
  await page.store.putFull('ph', IMG); await page.store.set('photos', { id: 'ph', thumb: IMG }); await page.flush();
  assert.equal(remote.files.size, 2); assert.equal(remote.data.collections.photos[0].id, 'ph');
  assert.equal(page.warnings.length, 1);
});

test('when storage fills up, the oldest cached full photos make room first', async () => {
  const remote = server();
  remote.data.collections.photos = [{ id: 'legacy', thumb: '' }];
  const disk = new Map([['full:legacy', IMG]]); // cached by an older version, untracked
  const fulls = d => [...d.keys()].filter(k => k.startsWith('full:')).sort();
  const page = browser(remote, { disk, quota: (key, v, d) => key.startsWith('full:') && fulls(d).length >= 4 });
  await page.start();
  for (const id of ['p1', 'p2', 'p3']) await page.store.putFull(id, IMG);
  await page.store.putFull('p4', IMG); // full: legacy is dropped, then p1 and p2 (oldest), p3 stays
  assert.deepEqual(fulls(disk), ['full:p3', 'full:p4']);
  assert.equal(page.warnings.length, 0);
});

// ---------- #21 repo without data.json ----------
test('a data repo without data.json starts empty and the first save creates it', async () => {
  const remote = server(); remote.data = null;
  const page = browser(remote); await page.start();
  assert.deepEqual(page.changes.tasks, []); assert.equal(page.statuses.at(-1).state, 'synced');
  assert.equal(await page.store.isSeeded(), false);
  await page.store.set('tasks', { id: 't1', title: 'first' }); await page.flush();
  assert.deepEqual(remote.data.collections.tasks.map(t => t.id), ['t1']);
  assert.equal(page.store.pending(), false);
});

test('data.json disappearing after it was loaded is still reported as an error', async () => {
  const remote = server(), page = browser(remote); await page.start();
  remote.data = null; await page.intervals[0].fn();
  assert.equal(page.statuses.at(-1).state, 'error');
  assert.ok(page.changes.meta.seeded);
});

// ---------- #23 lagging read after our own save ----------
test('a lagging copy served right after our own save does not hide the change', async () => {
  const remote = server(), page = browser(remote); await page.start();
  const old = { sha: String(remote.sha), content: b64(remote.data) };
  await page.store.set('tasks', { id: 'mine', title: 'x' }); await page.flush();
  remote.lagOnce = old; await page.intervals[0].fn();
  assert.ok(page.changes.tasks.some(t => t.id === 'mine'));
  // a real later change from the other phone still shows up
  remote.data.collections.tasks.push({ id: 'theirs', title: 'y' }); remote.sha++;
  await page.intervals[0].fn();
  assert.deepEqual(page.changes.tasks.map(t => t.id), ['mine', 'theirs']);
  // long after the save the old content is accepted again (e.g. the other phone undid everything)
  remote.lagOnce = old; page.clock.offset = 31000; await page.intervals[0].fn();
  assert.deepEqual(page.changes.tasks, []);
});

test('a save conflict still reloads whatever GitHub has, even the content from before our own save', async () => {
  const remote = server(), page = browser(remote); await page.start();
  const before = clone(remote.data);
  await page.store.set('tasks', { id: 'one', title: 'x' }); await page.flush();
  // the other phone removes 'one' again: same content as before our save, so GitHub gives it the old sha
  remote.beforePut = () => { remote.data = clone(before); remote.sha = 1; };
  await page.store.set('tasks', { id: 'two', title: 'x' }); await page.flush();
  assert.deepEqual(remote.data.collections.tasks.map(t => t.id), ['two']);
  assert.equal(page.store.pending(), false);
});
