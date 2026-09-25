const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../store.js'), 'utf8');
const clone = x => structuredClone(x);
const response = (status, body = {}) => ({ status, ok: status >= 200 && status < 300, headers: { get: () => null }, json: async () => clone(body), text: async () => JSON.stringify(body) });

function server() {
  return {
    data: { version: 1, meta: { seeded: true }, collections: { events: [], dates: [], trips: [], tasks: [], wishes: [], diary: [], photos: [] } },
    sha: 1, rejectWrites: false, conflict: null, publicRepo: false, active: 0, maxActive: 0,
    allowPhotos: false, files: new Map(),
    async fetch(url, options) {
      const pathname = new URL(url).pathname;
      if (!pathname.includes('/contents/')) return response(200, { private: !this.publicRepo, permissions: { push: true } });
      if (options.method === 'PUT') {
        this.active++; this.maxActive = Math.max(this.maxActive, this.active);
        await new Promise(resolve => setImmediate(resolve)); this.active--;
        if (this.rejectWrites) return response(403);
        if (pathname.includes('/photos/')) {
          if (!this.allowPhotos) return response(422);
          this.files.set(pathname, JSON.parse(options.body).content);
          return response(200, { content: { sha: 'photo-sha' } });
        }
        if (this.conflict) { this.conflict(this.data); this.conflict = null; this.sha++; }
        const body = JSON.parse(options.body);
        if (body.sha !== String(this.sha)) return response(409);
        this.data = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8')); this.sha++;
        return response(200, { content: { sha: String(this.sha) } });
      }
      if (pathname.includes('/photos/')) {
        if (!this.files.has(pathname)) return response(404);
        if (options.method === 'DELETE') { this.files.delete(pathname); return response(200); }
        return response(200, { sha: 'photo-sha' });
      }
      return response(200, { sha: String(this.sha), content: Buffer.from(JSON.stringify(this.data)).toString('base64') });
    }
  };
}

function browser(remote, disk = new Map(), local = new Map()) {
  const timers = new Map(); let timerId = 0;
  const indexedDB = { open() {
    const request = { result: { transaction() {
      const tx = { objectStore() { return {
        get(key) { const req = {}; queueMicrotask(() => { req.result = clone(disk.get(key)); req.onsuccess?.(); }); return req; },
        put(value, key) { const snapshot = clone(value); queueMicrotask(() => { disk.set(key, snapshot); tx.oncomplete?.(); }); },
        delete(key) { queueMicrotask(() => { disk.delete(key); tx.oncomplete?.(); }); }
      }; } }; return tx;
    } } }; queueMicrotask(() => request.onsuccess?.()); return request;
  } };
  const window = { addEventListener() {} };
  const context = vm.createContext({ window, indexedDB, localStorage: { getItem: k => local.get(k), setItem: (k, v) => local.set(k, v), removeItem: k => local.delete(k) },
    document: { hidden: false, addEventListener() {} }, navigator: { onLine: true },
    fetch: (...args) => remote.fetch(...args), TextEncoder, TextDecoder, Uint8Array,
    btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary'),
    setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id), setInterval: () => ++timerId, clearInterval() {}, console
  });
  vm.runInContext(source, context);
  const store = window.CCStore.create({ github: { owner: 'test', repo: 'private-data' } });
  const changes = {}, statuses = [];
  return { store, disk, local, changes, statuses,
    async start() { await store.signIn('fake-test-credential', '斯婕'); await store.start((col, items) => { changes[col] = JSON.parse(JSON.stringify(items)); }, (state, error) => statuses.push({ state, error })); },
    async flush() { const entry = [...timers].find(([, t]) => t.ms === 700); assert.ok(entry, 'save scheduled'); timers.delete(entry[0]); await entry[1].fn(); }
  };
}

test('replays a save after another person changes the shared data', async () => {
  const remote = server(), page = browser(remote); await page.start();
  remote.conflict = data => data.collections.tasks.push({ id: 'their-task', title: 'Other person' });
  await page.store.set('tasks', { id: 'my-task', title: '我们的计划' }); await page.flush();
  assert.deepEqual(remote.data.collections.tasks.map(x => x.id), ['their-task', 'my-task']);
  assert.equal(page.store.pending(), false);
});

test('failed saves survive reopening and can finish after access is restored', async () => {
  const remote = server(), first = browser(remote); await first.start(); remote.rejectWrites = true;
  await first.store.set('diary', { id: 'draft-1', text: 'A saved draft' }); await first.flush();
  assert.equal(first.store.pending(), true);
  assert.ok(first.statuses.some(x => x.state === 'error' && x.error));
  remote.rejectWrites = false;
  const reopened = browser(remote, first.disk, first.local); await reopened.start(); await reopened.flush();
  assert.equal(remote.data.collections.diary[0].text, 'A saved draft');
  assert.equal(reopened.store.pending(), false);
});

test('photo validation failures are reported instead of marked successful', async () => {
  const remote = server(), page = browser(remote); await page.start();
  await assert.rejects(page.store.putFull('photo-1', 'data:image/jpeg;base64,YQ=='), /could not be uploaded/);
  assert.equal(remote.data.collections.photos.length, 0);
});

test('public data repositories are rejected', async () => {
  const remote = server(); remote.publicRepo = true;
  await assert.rejects(browser(remote).start(), /private data repository/);
});

test('simultaneous file writes use one network mutation at a time', async () => {
  const remote = server(), page = browser(remote); await page.start();
  await Promise.allSettled([page.store.putFull('a', 'data:image/jpeg;base64,YQ=='), page.store.putFull('b', 'data:image/jpeg;base64,Yg==')]);
  assert.equal(remote.maxActive, 1);
});

test('a diary photo is saved only after both image files upload, then can be removed', async () => {
  const remote = server(); remote.allowPhotos = true;
  const page = browser(remote); await page.start();
  const image = 'data:image/jpeg;base64,YQ==';
  await page.store.putFull('photo-1', image);
  await page.store.set('photos', { id: 'photo-1', entryId: 'entry-1', thumb: image });
  await page.flush();
  assert.equal(remote.files.size, 2);
  assert.equal(remote.data.collections.photos[0].id, 'photo-1');
  await page.store.remove('photos', 'photo-1');
  await page.flush();
  assert.equal(remote.files.size, 0);
  assert.equal(remote.data.collections.photos.length, 0);
});
