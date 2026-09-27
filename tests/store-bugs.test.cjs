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
    deleteStatus: [], photoPut: {}, photoStatus: null, photoReply: null, putReply: null, photoDelay: 0, active: 0, maxActive: 0,
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
      if (method === 'PUT') {
        await new Promise(resolve => setImmediate(resolve));
        if (this.conflict) { this.conflict(this.data); this.conflict = null; this.sha++; }
        if (this.beforePut) { this.beforePut(); this.beforePut = null; }
        if (this.putReply) { const reply = this.putReply; this.putReply = null; return response(...reply); }
        const body = JSON.parse(options.body); this.messages.push(body.message);
        if (this.data == null ? !!body.sha : body.sha !== String(this.sha)) return response(409);
        this.data = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8')); this.sha++;
        return response(200, { content: { sha: String(this.sha) } });
      }
      if (this.dataReply) return response(...this.dataReply);
      if (this.lagOnce) { const lag = this.lagOnce; this.lagOnce = null; return response(200, lag); }
      if (this.data == null) return response(404, { message: 'Not Found' });
      const etag = '"' + this.sha + '"';
      if (options.headers?.['If-None-Match'] === etag) return response(304);
      if (raw) return response(200, this.data, { etag });
      if (this.big) return response(200, { sha: String(this.sha), size: 2e6, content: '' }, { etag }); // over 1 MB: the details come without the content
      return response(200, { sha: String(this.sha), content: b64(this.data) }, { etag });
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
        getAllKeys() { const req = {}; queueMicrotask(() => { req.result = [...disk.keys()]; req.onsuccess?.(); queueMicrotask(() => tx.oncomplete?.()); }); return req; },
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
  const reloads = { n: 0 };
  const context = vm.createContext({ window, indexedDB, location: { reload: () => { reloads.n++; } },
    localStorage: { getItem: k => local.get(k), setItem: (k, v) => local.set(k, v), removeItem: k => local.delete(k), get length() { return local.size; }, key: i => [...local.keys()][i] ?? null },
    document: { hidden: false, addEventListener: on('doc:') }, navigator: { onLine: true }, Date: FakeDate, Blob, FileReader,
    fetch: (...args) => remote.fetch(...args), TextEncoder, TextDecoder, Uint8Array,
    btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary'),
    setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms, at: Date.now() + clock.offset + ms }); return id; }, clearTimeout: id => timers.delete(id),
    setInterval: (fn, ms) => { intervals.push({ fn, ms }); return ++timerId; }, clearInterval() {}, console: { ...console, warn: (...a) => warnings.push(a) }
  });
  vm.runInContext(source, context);
  const store = window.CCStore.create(config);
  const changes = {}, statuses = [], photoTimes = [], photoHints = []; let emits = 0; // emits: full updates (meta is sent with every one); photoTimes: when the photo list was sent
  const page = { store, disk, local, changes, statuses, timers, intervals, listeners, warnings, clock, photoTimes, photoHints, Blob, reloads, get emits() { return emits; },
    connect: () => store.start((col, items, hint) => { if (col === 'meta') emits++; if (col === 'photos') { photoTimes.push(Date.now() + clock.offset); photoHints.push(hint); } changes[col] = clone(items); }, (state, error) => statuses.push({ state, error })),
    async start(name = '斯婕') { await store.signIn('fake-test-credential', name); await page.connect(); },
    async runTimers(ms) { const due = [...timers].filter(([, t]) => t.ms === ms); due.forEach(([id]) => timers.delete(id)); for (const [, t] of due) await t.fn(); return due.length; },
    async flush() { assert.ok(await page.runTimers(700), 'save scheduled'); },
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
async function addPhotos(page, entryId, ids) {
  for (const id of ids) { await page.store.putFull(id, IMG); await page.store.set('photos', { id, entryId, thumb: IMG }); }
  await page.store.set('diary', { id: entryId, text: 'Picnic', photoIds: ids });
  await page.flush();
}
// app.js savePhotos for a diary post: every photo's files go up, then the photos and the entry are one change;
// when it fails part way, the files this try uploaded are taken back
async function post(page, entryId, ids, text = 'Picnic') {
  const items = [], tried = [];
  try {
    for (const id of ids) { tried.push(id); items.push(await page.store.uploadPhoto({ id, thumb: IMG, entryId, caption: '' }, IMG)); }
    await page.store.saveAll([{ col: 'diary', item: { id: entryId, text, photoIds: tried } }, ...items.map(item => ({ col: 'photos', item }))]);
  } catch (err) { await page.store.discard(tried); throw err; }
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

test('dark and high contrast switched at the same time on both phones both land (the mode is shared, one flag per save)', async () => {
  const remote = server(), a = browser(remote), b = browser(remote);
  remote.data.meta.mode = { dark: false, high: false };
  await a.start('斯婕'); await b.start('真真');
  await a.store.metaKey('mode', 'dark', true);
  await b.store.metaKey('mode', 'high', true);
  await a.flush(); await b.flush(); // b replays onto a's save
  assert.deepEqual(remote.data.meta.mode, { dark: true, high: true });
  await b.store.metaKey('mode', 'dark', false); await b.flush();
  assert.deepEqual(remote.data.meta.mode, { dark: false, high: true }, 'switching off is kept too');
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
test('a new device downloads thumbnails four at a time and shows a burst of them as one photo update', async () => {
  const remote = server(); remote.photoDelay = 2;
  remote.data.collections.photos = Array.from({ length: 30 }, (_, i) => ({ id: 'ph' + i, thumb: '' }));
  for (let i = 0; i < 30; i++) remote.files.set(`photos/ph${i}-thumb.jpg`, { content: 'YQ==', sha: 's' + i });
  const page = browser(remote); await page.start();
  await waitFor(() => remote.count(/-thumb\.jpg raw$/) === 30 && remote.active === 0, 'thumbs');
  await settle();
  assert.ok(remote.maxActive <= 4, 'max concurrent ' + remote.maxActive);
  const full = page.emits, sent = page.photoTimes.length; await page.advance(400);
  assert.equal(page.photoTimes.length - sent, 1, 'one update for the burst'); assert.equal(page.emits, full, 'only the photo list is sent again');
  assert.deepEqual(page.photoHints.slice(-2), [undefined, 'thumbs'], 'marked as thumbnails only, so the page can skip drawing it');
  assert.ok(page.changes.photos.every(p => p.thumb.type === 'image/jpeg'), 'thumbnails come as Blobs');
  assert.equal(page.disk.get('thumb:ph0').type, 'image/jpeg', 'and are kept on the device as Blobs');
});

test('thumbnails arriving one after another update the photo list at most every 0.4 s, the first ones quickly', async () => {
  const remote = server(); remote.gate = [];
  remote.data.collections.photos = Array.from({ length: 12 }, (_, i) => ({ id: 'ph' + i, thumb: '' }));
  for (let i = 0; i < 12; i++) remote.files.set(`photos/ph${i}-thumb.jpg`, { content: 'YQ==', sha: 's' + i });
  const page = browser(remote); await page.start();
  await waitFor(() => remote.gate.length === 4, 'first four asked for');
  const t0 = Date.now() + page.clock.offset, sent = page.photoTimes.length;
  for (let i = 0; i < 12; i++) { await waitFor(() => remote.gate.length, 'next thumb'); remote.gate.shift()(); await settle(); await page.advance(100); } // one arrives every 0.1 s
  await page.advance(400);
  const times = page.photoTimes.slice(sent);
  assert.ok(times[0] - t0 >= 50 && times[0] - t0 < 100, `the first one shows after 50 ms (${times[0] - t0})`);
  times.slice(1).forEach((t, i) => assert.ok(t - times[i] >= 400, `updates ${t - times[i]} ms apart`));
  assert.ok(times.length <= 4, times.length + ' updates for 1.2 s of arrivals');
  assert.ok(page.changes.photos.every(p => p.thumb), 'every thumb is shown in the end');
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
  await waitFor(() => remote.count(/-thumb/) === 20 && remote.active === 0, 'retry'); await settle(); await page.advance(400);
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

test('a rate limit while loading is a busy status, not a bad token; a real 401/403 still signs out', async () => {
  const remote = server(), page = browser(remote); await page.start();
  remote.dataReply = [403, { message: 'API rate limit exceeded for user.' }, { 'x-ratelimit-remaining': '0' }];
  const again = browser(remote, { disk: page.disk, local: page.local }); await again.connect(); // with a copy on this device
  assert.equal(again.statuses.at(-1).state, 'ratelimited'); assert.equal(again.statuses.at(-1).error.code, 'ratelimit');
  const fresh = browser(remote, { local: page.local }); let done = false; // nothing on this device: waits and tries again
  fresh.connect().then(() => { done = true; }, () => { done = 'threw'; });
  await settle(); assert.equal(done, false); assert.equal(fresh.statuses.at(-1).state, 'ratelimited');
  remote.dataReply = null; await fresh.advance(60000); await waitFor(() => done === true, 'start after the limit');
  assert.ok(page.local.has('olc:github'));
  for (const verify of [{ status: 401, body: {}, headers: {} }, { status: 403, body: { message: 'Resource not accessible by personal access token' }, headers: {} }]) {
    remote.verify = verify;
    const local = new Map([['olc:github', JSON.stringify({ token: 'bad', name: '斯婕' })]]);
    const [user, err] = await new Promise(res => browser(remote, { local }).store.onAuth((...a) => res(a)));
    assert.equal(user, null); assert.equal(err.code, 'auth'); assert.equal(local.has('olc:github'), false);
  }
});

// ---------- #9 follow-up: a friendly wait instead of retrying every 20 s ----------
test('a rate limit shows "GitHub is busy" with the minutes left and pauses polling until then, even when back online or in the tab', async () => {
  const remote = server(), page = browser(remote); await page.start();
  remote.dataReply = [403, { message: 'You have exceeded a secondary rate limit.' }, { 'retry-after': '150' }];
  await page.intervals[0].fn();
  const busy = page.statuses.at(-1);
  assert.equal(busy.state, 'ratelimited'); assert.equal(busy.error.message, 'GitHub is busy, trying again in 3 min.');
  assert.ok(Math.abs(busy.error.until - (Date.now() + 150000)) < 1000);
  remote.dataReply = null;
  const sent = remote.log.length;
  await page.intervals[0].fn(); await page.fire('online'); await page.fire('doc:visibilitychange'); await settle();
  await page.advance(20000); await page.intervals[0].fn(); // a poll 20 s later still waits
  assert.equal(remote.log.length, sent, 'no requests while GitHub is busy');
  await page.advance(15000); // the countdown ticks each minute (at 30 s and 90 s here)
  assert.equal(page.statuses.at(-1).error.message, 'GitHub is busy, trying again in 2 min.');
  await page.advance(60000);
  assert.equal(page.statuses.at(-1).error.message, 'GitHub is busy, trying again in 1 min.');
  assert.equal(remote.log.length, sent);
  await page.advance(60000); // the wait is over at 150 s: sync resumes by itself
  assert.equal(remote.log.at(-1), 'GET data.json'); assert.equal(page.statuses.at(-1).state, 'synced');
});

test('the wait uses x-ratelimit-reset when no requests are left, a minute otherwise, and any 429 counts', async () => {
  const remote = server(), page = browser(remote); await page.start();
  remote.dataReply = [403, { message: 'API rate limit exceeded for user.' }, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 600) }];
  await page.intervals[0].fn();
  assert.equal(page.statuses.at(-1).error.message, 'GitHub is busy, trying again in 10 min.');
  const other = browser(remote, { local: page.local, disk: new Map(page.disk) }); remote.dataReply = [429, {}];
  await other.connect();
  assert.equal(other.statuses.at(-1).state, 'ratelimited'); assert.equal(other.statuses.at(-1).error.message, 'GitHub is busy, trying again in 1 min.');
  // a secondary limit: the hourly reset time doesn't apply while requests are left, so wait a minute
  const third = browser(remote, { local: page.local, disk: new Map(page.disk) });
  remote.dataReply = [403, { message: 'You have exceeded a secondary rate limit.' }, { 'x-ratelimit-remaining': '4000', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3000) }];
  await third.connect();
  assert.equal(third.statuses.at(-1).error.message, 'GitHub is busy, trying again in 1 min.');
});

test('a rate-limited save keeps the changes, never says the token cannot write, and saves after the wait', async () => {
  const remote = server(), page = browser(remote); await page.start();
  await page.store.set('tasks', { id: 'kept', title: 'x' });
  remote.putReply = [403, { message: 'You have exceeded a secondary rate limit.' }, {}];
  await page.flush();
  assert.ok(page.statuses.every(x => !/Token cannot write/.test(x.error?.message || '')));
  assert.equal(page.statuses.at(-1).state, 'ratelimited'); assert.equal(page.statuses.at(-1).error.message, 'GitHub is busy, trying again in 1 min.');
  assert.equal(page.store.pending(), true); assert.deepEqual(remote.data.collections.tasks, []);
  await page.store.set('tasks', { id: 'during', title: 'y' }); // a change made while waiting stays queued too
  assert.equal(page.statuses.at(-1).state, 'ratelimited');
  assert.ok([...page.timers.values()].every(t => t.ms !== 700), 'no save before the wait is over');
  await page.advance(61000);
  assert.deepEqual(remote.data.collections.tasks.map(t => t.id), ['kept', 'during']);
  assert.equal(page.store.pending(), false); assert.equal(page.statuses.at(-1).state, 'synced');
});

test('logging in while GitHub is busy says to try again in N minutes and keeps nothing', async () => {
  const remote = server(); remote.verify = { status: 429, body: {}, headers: { 'retry-after': '120' } };
  const page = browser(remote);
  await assert.rejects(page.store.signIn('fake-test-credential', '斯婕'), { message: 'GitHub is busy, try again in 2 min.' });
  assert.equal(page.local.has('olc:github'), false);
  const sent = remote.log.length; remote.verify = { status: 200, body: {}, headers: {} };
  await assert.rejects(page.store.signIn('fake-test-credential', '斯婕'), /GitHub is busy, try again in \d min\./); // not sent again yet
  assert.equal(remote.log.length, sent);
  await page.advance(120000);
  await page.store.signIn('fake-test-credential', '斯婕'); assert.ok(page.local.has('olc:github'));
});

test('thumbnails skipped while GitHub is busy load after the wait, without counting as failures', async () => {
  const remote = server();
  remote.data.collections.photos = Array.from({ length: 8 }, (_, i) => ({ id: 'ph' + i, thumb: '' }));
  for (let i = 0; i < 8; i++) remote.files.set(`photos/ph${i}-thumb.jpg`, { content: 'YQ==', sha: 's' + i });
  remote.photoReply = [403, { message: 'You have exceeded a secondary rate limit.' }, { 'retry-after': '60' }];
  const page = browser(remote); await page.start();
  await waitFor(() => remote.active === 0 && remote.count(/-thumb/) >= 1, 'first tries'); await settle();
  const tries = remote.count(/-thumb/); assert.ok(tries <= 4, 'stopped after the first answers: ' + tries);
  remote.photoReply = null;
  await page.advance(60000); await waitFor(() => remote.count(/-thumb/) === tries + 8 && remote.active === 0, 'after the wait'); await settle(); await page.advance(400);
  assert.ok(page.changes.photos.every(p => p.thumb));
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

// ---------- no second update or copy for our own save ----------
test('our own save updates the page once; a save that met the other phone\'s change shows the combined data', async () => {
  const remote = server(), page = browser(remote); await page.start();
  await page.store.set('tasks', { id: 'mine', title: 'x' });
  const shown = page.emits; await page.flush();
  assert.equal(page.emits, shown, 'nothing new to show after a plain save');
  remote.conflict = data => data.collections.tasks.push({ id: 'theirs', title: 'y' });
  await page.store.set('tasks', { id: 'second', title: 'z' }); await page.flush();
  assert.deepEqual(page.changes.tasks.map(t => t.id), ['mine', 'theirs', 'second']);
});

test('changes waiting to be saved never alter the saved copy they are shown on top of', async () => {
  const remote = server(); remote.data.collections.tasks = [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }];
  remote.data.collections.diary = [{ id: 'e', text: 'hi', comments: [] }];
  const page = browser(remote); await page.start(); remote.offline = true;
  await page.store.remove('tasks', 'a'); await page.store.update('tasks', 'b', { title: 'B2' }); await page.store.set('tasks', { id: 'c', title: 'C' });
  await page.store.addComment('e', { id: 'c1', text: 'yo' }); await page.store.setMeta({ heroCaption: 'X' });
  const saved = page.disk.get('github-state:test/private-data:main');
  assert.deepEqual(saved.base.collections.tasks, [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }]); assert.deepEqual(saved.base.collections.diary[0].comments, []);
  assert.equal(saved.base.meta.heroCaption, undefined); assert.equal(saved.pending.length, 5);
  assert.deepEqual(page.changes.tasks.map(t => [t.id, t.title]), [['b', 'B2'], ['c', 'C']]); assert.equal(page.changes.diary[0].comments.length, 1);
  remote.offline = false; await page.flush();
  assert.deepEqual(remote.data.collections.tasks.map(t => [t.id, t.title]), [['b', 'B2'], ['c', 'C']]); assert.equal(remote.data.meta.heroCaption, 'X');
});

// ---------- a diary post is one change ----------
test('a diary post with three photos uploads their files first, then saves the photos and the entry in one write', async () => {
  const remote = server(), page = browser(remote); await page.start();
  const from = remote.log.length, shown = page.emits;
  await post(page, 'e1', ['p1', 'p2', 'p3']);
  assert.equal(page.emits - shown, 1, 'one change on this device');
  assert.deepEqual(page.changes.diary.map(e => e.id), ['e1']); assert.ok(page.changes.photos.every(p => p.thumb.type === 'image/jpeg'));
  await page.flush();
  const log = remote.log.slice(from).filter(l => l.startsWith('PUT'));
  assert.deepEqual(log, ['PUT photos/p1.jpg', 'PUT photos/p1-thumb.jpg', 'PUT photos/p2.jpg', 'PUT photos/p2-thumb.jpg', 'PUT photos/p3.jpg', 'PUT photos/p3-thumb.jpg', 'PUT data.json']);
  assert.deepEqual(remote.data.collections.diary.map(e => [e.id, e.photoIds]), [['e1', ['p1', 'p2', 'p3']]]);
  assert.deepEqual(remote.data.collections.photos.map(p => [p.id, p.entryId, p.thumb, p.shas.full === remote.files.get(`photos/${p.id}.jpg`).sha, p.shas.thumb === remote.files.get(`photos/${p.id}-thumb.jpg`).sha]),
    [['p1', 'e1', '', true, true], ['p2', 'e1', '', true, true], ['p3', 'e1', '', true, true]]);
  assert.match(remote.messages.at(-1), /: save diary \+ photos$/);
  assert.equal(page.store.pending(), false);
});

test('a post that fails part way saves nothing and takes back the files it uploaded; posting again works', async () => {
  const remote = server(), page = browser(remote); await page.start();
  remote.photoPut['photos/p2-thumb.jpg'] = 500;
  await assert.rejects(post(page, 'e1', ['p1', 'p2', 'p3']), /Photo upload failed/);
  assert.equal(remote.count(/^PUT photos\/p3/), 0, 'stops at the failure');
  assert.equal(page.store.pending(), false, 'nothing to save'); assert.deepEqual(page.changes.diary, []); assert.deepEqual(page.changes.photos, []);
  await waitFor(() => remote.files.size === 0, 'uploaded files deleted'); await settle();
  assert.equal(remote.count(/^PUT data\.json/), 0);
  assert.deepEqual(remote.log.filter(l => /^GET photos/.test(l)), ['GET photos', 'GET photos/p2-thumb.jpg'], 'uploaded files go by the shas from the upload; only the one that failed is looked up');
  assert.ok(![...page.disk.keys()].some(k => /^(thumb|full):p[123]$/.test(k)), 'nothing left on this device');
  assert.deepEqual(page.disk.get('github-state:test/private-data:main').files, []);
  delete remote.photoPut['photos/p2-thumb.jpg'];
  await post(page, 'e2', ['p4', 'p5']); await page.flush();
  assert.deepEqual(remote.data.collections.diary.map(e => e.id), ['e2']); assert.deepEqual(remote.data.collections.photos.map(p => p.id), ['p4', 'p5']);
  assert.equal(remote.files.size, 4); assert.equal(remote.count(/^PUT data\.json/), 1);
});

test('a post that fails because the phone is offline or GitHub is busy says so in the error', async () => {
  const remote = server(), page = browser(remote); await page.start();
  remote.offline = true;
  await assert.rejects(post(page, 'e1', ['p1']), e => e.code === 'offline');
  remote.offline = false; remote.photoPut['photos/p2.jpg'] = [403, { message: 'You have exceeded a secondary rate limit.' }, { 'retry-after': '120' }];
  await assert.rejects(post(page, 'e2', ['p2']), e => e.code === 'ratelimit' && Math.abs(e.until - (Date.now() + 120000)) < 1000);
  delete remote.photoPut['photos/p2.jpg']; remote.photoPut['photos/p3.jpg'] = 413; // really too large: no code, the app says so
  await page.advance(121000);
  await assert.rejects(post(page, 'e3', ['p3']), e => !e.code);
  assert.deepEqual(page.changes.diary, []);
});

test('in local mode a post is one change too, and a failed one leaves no photo behind', async () => {
  const page = browser(null, { config: {} }); await page.connect();
  await post(page, 'e1', ['p1', 'p2']);
  const saved = page.disk.get('data').collections;
  assert.deepEqual(saved.diary.map(e => [e.id, e.photoIds]), [['e1', ['p1', 'p2']]]); assert.deepEqual(saved.photos.map(p => [p.id, p.thumb]), [['p1', IMG], ['p2', IMG]]);
  assert.equal(page.disk.get('full:p2').type, 'image/jpeg');
  let n = 0; const put = page.store.putFull; page.store.putFull = (...a) => (++n === 2 ? Promise.reject(new Error('Could not save on this device.')) : put(...a));
  await assert.rejects(post(page, 'e2', ['p3', 'p4']));
  assert.deepEqual(page.disk.get('data').collections.diary.map(e => e.id), ['e1']); assert.ok(!page.disk.has('full:p3'));
});

// ---------- pictures on the device are Blobs ----------
const bytes = blob => Buffer.concat(blob.parts.map(p => Buffer.from(p))).toString('base64');
test('thumbnails and full photos an older version kept as data URLs are read as Blobs and saved again as Blobs', async () => {
  const remote = server(); remote.data.collections.photos = [{ id: 'p1', thumb: '' }];
  const disk = new Map([['thumb:p1', IMG], ['full:p1', IMG]]);
  const page = browser(remote, { disk }); await page.start(); await settle(); await page.advance(400);
  assert.equal(page.changes.photos[0].thumb.type, 'image/jpeg'); assert.equal(bytes(page.changes.photos[0].thumb), 'YQ==');
  const full = await page.store.getFull('p1'); await settle();
  assert.equal(full.type, 'image/jpeg'); assert.equal(bytes(full), 'YQ==');
  for (const key of ['thumb:p1', 'full:p1']) { assert.equal(typeof disk.get(key), 'object', key); assert.equal(bytes(disk.get(key)), 'YQ=='); }
  assert.equal(remote.count(/^GET photos\//), 0, 'nothing downloaded');
  await page.store.putFull('p2', IMG); await page.store.set('photos', { id: 'p2', thumb: IMG }); // a new photo's pictures are Blobs straight away
  assert.equal(disk.get('full:p2').type, 'image/jpeg'); assert.equal(disk.get('thumb:p2').type, 'image/jpeg');
  await page.store.set('photos', { id: 'p3', thumb: new page.Blob(['x'], { type: 'image/jpeg' }) }); await page.flush(); // a thumbnail Blob never goes into data.json
  assert.deepEqual(remote.data.collections.photos.map(p => p.thumb), ['', '', '']);
});

test('local mode keeps thumbnails in its data record as data URLs, never a blob: link or a Blob, and full photos as Blobs', async () => {
  const page = browser(null, { config: {} }); await page.connect();
  await page.store.putFull('p1', IMG); await page.store.set('photos', { id: 'p1', thumb: IMG, caption: '' });
  assert.equal(page.disk.get('full:p1').type, 'image/jpeg'); assert.equal(bytes(await page.store.getFull('p1')), 'YQ==');
  await page.store.set('photos', { id: 'p1', thumb: 'blob:http://localhost:8771/2b0f3c3e-9a51-4f0e-9d0e-1f7d2f4f3a11', caption: 'x' }); // e.g. a record taken from the page
  await page.store.update('photos', 'p1', { thumb: 'blob:http://localhost:8771/aa', albumId: 'a1' });
  await page.store.batchSet('photos', [{ id: 'p1', thumb: new page.Blob(['x'], { type: 'image/jpeg' }), caption: 'y', albumId: 'a1' }, { id: 'p2', thumb: 'blob:x' }]);
  const saved = page.disk.get('data').collections.photos;
  assert.deepEqual(saved.map(p => [p.id, p.thumb, p.caption, p.albumId]), [['p1', IMG, 'y', 'a1'], ['p2', '', undefined, undefined]]);
  assert.ok(!JSON.stringify(page.disk.get('data')).includes('blob:'));
  assert.equal(page.changes.photos[0].thumb, IMG);
  page.disk.set('full:old', IMG); // kept by an older version
  const full = await page.store.getFull('old'); await settle();
  assert.equal(bytes(full), 'YQ=='); assert.equal(bytes(page.disk.get('full:old')), 'YQ==');
});

// ---------- the old top picture ----------
test('a replaced or reset top picture has its old file deleted, only once the change is saved', async () => {
  const remote = server(), page = browser(remote); await page.start();
  await page.store.putFull('hero-1', IMG); await page.store.setMeta({ hero: 'hero-1' }); await page.flush();
  await page.store.putFull('hero-2', IMG); await page.store.setMeta({ hero: 'hero-2' }); await page.store.dropFull('hero-1'); // app.js: new picture up, saved, then the old one dropped
  assert.ok(!page.disk.has('full:hero-1'), 'gone from this device');
  remote.putReply = [500, {}]; await page.flush(); await settle(); // the change didn't reach GitHub yet: the old file stays
  assert.ok(remote.files.has('photos/hero-1.jpg')); assert.equal(remote.count(/^DELETE/), 0); assert.equal(remote.data.meta.hero, 'hero-1');
  const from = remote.log.length; await page.runTimers(15000); await page.flush(); await settle(); // the retry
  assert.deepEqual([...remote.files.keys()], ['photos/hero-2.jpg']); assert.equal(remote.data.meta.hero, 'hero-2');
  assert.deepEqual(remote.log.slice(from).filter(l => !l.startsWith('GET')), ['PUT data.json', 'DELETE photos/hero-1.jpg'], 'by the sha from the upload, after the save');
  await page.store.setMeta({ hero: null }); await page.store.dropFull('hero-2'); await page.flush(); await settle(); // Reset
  assert.equal(remote.files.size, 0); assert.equal(remote.data.meta.hero, null);
  await post(page, 'e1', ['p1']); await page.store.putFull('hero-3', IMG); await page.store.setMeta({ hero: 'hero-3' }); await page.flush();
  await page.store.dropFull('p1'); await page.store.dropFull('hero-3'); await page.store.dropFull(null); await settle(); // never a photo's file or the picture in use
  assert.deepEqual([...remote.files.keys()].sort(), ['photos/hero-3.jpg', 'photos/p1-thumb.jpg', 'photos/p1.jpg']);
  assert.deepEqual(page.disk.get('github-state:test/private-data:main').files, []);
});

test('in local mode a replaced top picture is dropped from the device', async () => {
  const page = browser(null, { config: {} }); await page.connect();
  await page.store.putFull('hero-1', IMG); await page.store.setMeta({ hero: 'hero-1' });
  await page.store.putFull('hero-2', IMG); await page.store.setMeta({ hero: 'hero-2' }); await page.store.dropFull('hero-1'); await page.store.dropFull('hero-2');
  assert.ok(!page.disk.has('full:hero-1')); assert.ok(page.disk.has('full:hero-2'), 'the picture in use stays');
});

// ---------- logging out ----------
test('logging out waits until everything is on GitHub, then clears the private data kept on this device', async () => {
  const remote = server(); remote.data.collections.photos = [{ id: 'p1', thumb: '' }, { id: 'p2', thumb: '' }];
  for (const id of ['p1', 'p2']) remote.files.set(`photos/${id}-thumb.jpg`, { content: 'YQ==', sha: 't' + id });
  const disk = new Map([['data', { version: 1, meta: {}, collections: {} }], ['full:p1', IMG]]); // 'data': local mode's own record, not this repo's
  const page = browser(remote, { disk }); await page.start(); await waitFor(() => disk.has('thumb:p2'), 'thumbs kept');
  page.local.set('olc:drafts:sijie', '{"diary":{"":{"text":"secret"}}}'); page.local.set('olc:drafts:zhenzhen', '{}'); page.local.set('olc:me', '"sijie"');
  const refused = e => e.code === 'unsaved' && e.message === 'Still saving to GitHub. Log out once it says SYNCED, so nothing is lost.';
  await page.store.set('tasks', { id: 't1', title: 'not saved yet' });
  await assert.rejects(page.store.signOut(), refused); // a change still waiting
  remote.deleteStatus = [500]; await page.store.remove('photos', 'p2'); await page.flush();
  assert.equal(page.store.pending(), false); assert.equal(remote.files.size, 2);
  await assert.rejects(page.store.signOut(), refused); // a photo's files still to delete
  assert.equal(page.reloads.n, 0); assert.ok(page.local.has('olc:github')); assert.ok(disk.has('github-state:test/private-data:main'));
  assert.ok(await page.runTimers(20000)); await settle(); assert.equal(remote.files.size, 1); // the delete goes through on its retry
  await page.store.signOut();
  assert.equal(page.reloads.n, 1);
  assert.deepEqual([...page.local.keys()], ['olc:me']);
  assert.deepEqual([...disk.keys()], ['data']);
  assert.deepEqual(remote.data.collections.tasks.map(t => t.id), ['t1']);
});

// ---------- the file we already have is not downloaded again ----------
test('a relaunch and the first check after our own save do not download or redraw an unchanged data.json', async () => {
  const remote = server(); remote.big = true; remote.data.collections.tasks = [{ id: 't0', title: 'x' }];
  const page = browser(remote); await page.start();
  const raws = () => remote.count(/^GET data\.json raw$/);
  assert.equal(raws(), 1, 'a new device downloads it once'); assert.equal(page.emits, 1);
  const again = browser(remote, { disk: page.disk, local: page.local }); await again.start(); // relaunch: this device has the same file
  assert.equal(raws(), 1, 'not downloaded again'); assert.equal(again.emits, 1, 'shown once, from the copy on this device');
  assert.deepEqual(again.changes.tasks.map(t => t.id), ['t0']); assert.equal(again.statuses.at(-1).state, 'synced');
  await again.store.set('tasks', { id: 't1', title: 'y' }); await again.flush();
  const shown = again.emits; await again.intervals[0].fn(); // the first check after our own save finds what we saved
  assert.equal(raws(), 1); assert.equal(again.emits, shown);
  const sent = remote.log.length; await again.intervals[0].fn(); // its ETag is kept, so the next check is a 304
  assert.deepEqual(remote.log.slice(sent), ['GET data.json']); assert.equal(again.emits, shown);
  remote.data.collections.tasks.push({ id: 'theirs', title: 'z' }); remote.sha++; // a real change from the other phone still comes in
  await again.intervals[0].fn();
  assert.equal(raws(), 2); assert.deepEqual(again.changes.tasks.map(t => t.id), ['t0', 't1', 'theirs']);
});

test('removeMany also works in local mode', async () => {
  const page = browser(null, { config: {} }); await page.connect();
  await page.store.batchSet('events', [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  await page.store.removeMany('events', ['a', 'c']);
  assert.deepEqual(page.disk.get('data').collections.events.map(e => e.id), ['b']);
  assert.deepEqual(page.changes.events.map(e => e.id), ['b']);
});
