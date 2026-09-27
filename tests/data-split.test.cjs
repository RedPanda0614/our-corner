// The data split: data.json -> gzip files in data/ (main, imported, one per person), each saved on its own.
// Checked against the fake GitHub in fake-github.cjs: the move and its failure cases, routing, per-file saves and conflicts,
// polling, taking in what an older app still saves in data.json, damaged files and browsers without CompressionStream.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { server, browser, split, join, gz, settle, clone, IMG, PARTS, SHARED, FILE, OLD, COLLECTIONS } = require('./fake-github.cjs');

const DAY = 864e5;
const LEGACY = () => ({
  version: 1,
  meta: {
    seeded: true, mode: { dark: true, high: false }, kindColors: { plan: '#6fa35a' }, avatars: { sijie: 'data:A', zhenzhen: 'data:B' }, hero: 'p1', heroCaption: 'OUR GARDEN',
    inboxReads: { sijie: { since: 100, read: [{ key: 'dy:d1', at: 200 }] }, zhenzhen: { since: 150, read: [{ key: 'qa:x', at: 300 }] } },
    'achievements:sijie': { seen: ['first-entry'], kept: { 'first-entry': 5 } }, 'status:zhenzhen': { emoji: '📚', text: '学习中', at: 1000 },
    'statusSeen:sijie': 900, 'statusSeen:zhenzhen': 800
  },
  collections: {
    events: [{ id: 'm1', title: 'Dinner', date: '2026-09-01' }, { id: 'i1', title: 'Flight', importKey: '["u1","1"]', date: '2026-09-02' },
      { id: 'm2', title: 'Movie', date: '2026-09-03' }, { id: 'i2', title: 'Concert', importKey: '["u2","2"]', date: '2026-09-04' }],
    trips: [{ id: 'tr1', title: 'Kyoto' }], tasks: [{ id: 't1', title: 'Buy milk' }, { id: 't2', title: 'Call mum', done: false }, { id: 't3', title: 'Book hotel' }],
    dates: [{ id: 'da1', title: 'Anniversary', date: '2023-05-20' }], wishes: [{ id: 'w1', title: 'Camera' }],
    diary: [{ id: 'd1', text: '第一页', photoIds: ['p1'], comments: [{ id: 'c1', text: 'hi' }] }], photos: [{ id: 'p1', thumb: '', entryId: 'd1', shas: { full: 'f1', thumb: 't1' } }],
    albums: [{ id: 'a1', title: 'Summer' }], answers: [{ id: '2026-09-27:sijie', text: 'Dumplings' }], questions: [], checkins: [{ id: '2026-W39:sijie', mood: 4 }]
  }
});
const legacyServer = (data = LEGACY()) => { const remote = server({ legacy: true }); remote.data = data; return remote; };
const puts = (remote, from = 0) => remote.log.slice(from).filter(l => l.startsWith('PUT data'));
// what the page saw before the split for the same data: every collection as it was, events of main first, then the imported ones
function oldView(data) {
  const collections = {};
  for (const c of COLLECTIONS) collections[c] = c === 'events' ? [...data.collections.events.filter(e => !e.importKey), ...data.collections.events.filter(e => e.importKey)] : data.collections[c] || [];
  return { meta: data.meta, collections };
}
const seen = page => ({ meta: page.changes.meta, collections: Object.fromEntries(COLLECTIONS.map(c => [c, page.changes[c]])) });

// ---------- the move ----------
test('the move: each file holds its part of data.json, stamped with its sha; data.json is left as it was; the page sees the same data', async () => {
  const remote = legacyServer(), page = browser(remote);
  const before = Buffer.from(remote.bytes('data.json')), sha = remote.tree.get('data.json');
  await page.start();
  assert.deepEqual(seen(page), oldView(LEGACY()), 'shown straight away, as before the split');
  await page.flush();
  assert.deepEqual(puts(remote), ['PUT data/imported.json.gz', 'PUT data/sijie.json.gz', 'PUT data/zhenzhen.json.gz', 'PUT data/main.json.gz'], 'main last');
  assert.ok(remote.messages.every(m => /^斯婕: move data\.json into data\/\w+\.json\.gz$/.test(m)));
  const stamp = remote.part('main').meta.legacy;
  assert.equal(stamp.sha, sha); assert.ok(Math.abs(stamp.at - Date.now()) < 5000);
  const want = split(LEGACY(), stamp);
  for (const n of PARTS) assert.deepEqual(remote.part(n), n === 'main' ? { ...want.main, collections: { ...Object.fromEntries(COLLECTIONS.map(c => [c, []])), ...want.main.collections } } : want[n], n);
  assert.deepEqual(remote.part('sijie').meta, { 'achievements:sijie': LEGACY().meta['achievements:sijie'], 'statusSeen:sijie': 900, inboxReads: { sijie: LEGACY().meta.inboxReads.sijie }, legacy: stamp });
  assert.deepEqual(remote.part('imported').collections.events.map(e => e.id), ['i1', 'i2']);
  assert.ok(remote.bytes('data.json').equals(before)); assert.equal(remote.tree.get('data.json'), sha);
  assert.equal(page.store.pending(), false); assert.equal(page.statuses.at(-1).state, 'synced');
  assert.deepEqual(seen(page), oldView(LEGACY()));
  const other = browser(remote); await other.start(); // the other phone, updated: reads the files, moves nothing
  assert.deepEqual(seen(other), oldView(LEGACY())); assert.equal(other.timers.size, 0, 'nothing to save');
  assert.equal(puts(remote).length, 4);
});

test('two phones moving at the same moment: each file is made once, the second phone takes it as it is and keeps its own changes', async () => {
  const remote = legacyServer(), a = browser(remote), b = browser(remote);
  await Promise.all([a.start('斯婕'), b.start('真真')]); // both find no data/ and read the same data.json
  await a.store.set('tasks', { id: 'from-a', title: 'A' }); await b.store.set('tasks', { id: 'from-b', title: 'B' });
  await b.store.markInboxRead('zhenzhen', 150, 0, [{ key: 'dy:new', at: 400 }]);
  await Promise.all([a.flush(), b.flush()]); await settle();
  for (const n of PARTS) assert.equal(remote.part(n).version, 2, n);
  assert.equal(remote.count(/^PUT data\/main/), 4, 'one creates main, the other takes it; then each task is saved on top (one replayed)');
  assert.equal(remote.messages.filter(m => m.endsWith('move data.json into data/main.json.gz')).length, 1, 'the second phone sees main was made (its history) and takes it, without a create');
  assert.deepEqual(remote.data.collections.tasks.map(t => t.id).sort(), ['from-a', 'from-b', 't1', 't2', 't3']);
  assert.deepEqual(remote.data.meta.inboxReads.zhenzhen.read.map(r => r.key), ['qa:x', 'dy:new']);
  assert.ok(!a.store.pending() && !b.store.pending());
  await a.poll(); await b.poll();
  assert.deepEqual(seen(a), seen(b)); assert.deepEqual(seen(a).collections.tasks.map(t => t.id).sort(), ['from-a', 'from-b', 't1', 't2', 't3']);
});

test('a move stopped part way (offline, or the app closed) goes on from where it was when opened again; nothing is lost', async () => {
  const remote = legacyServer(), page = browser(remote);
  let cut = 2; const fetch = remote.fetch.bind(remote);
  remote.fetch = (url, o = {}) => (o.method === 'PUT' && /contents\/data\//.test(url) && --cut < 0 ? Promise.reject(new TypeError('Failed to fetch')) : fetch(url, o));
  await page.start(); await page.store.set('tasks', { id: 'during', title: 'made while moving' });
  await page.flush();
  assert.deepEqual([...remote.tree.keys()].filter(p => p.startsWith('data/')), ['data/imported.json.gz', 'data/sijie.json.gz']);
  assert.equal(page.statuses.at(-1).state, 'error'); assert.equal(page.store.pending(), true);
  remote.fetch = fetch; // the app is closed, then opened again
  const again = browser(remote, { disk: page.disk, local: page.local }); await again.start();
  assert.ok(again.changes.tasks.some(t => t.id === 'during'), 'shown from this device');
  const before = remote.log.length; await again.flush();
  assert.deepEqual(puts(remote, before), ['PUT data/zhenzhen.json.gz', 'PUT data/main.json.gz', 'PUT data/main.json.gz'], 'only the files still missing, exactly as split; then the change made meanwhile');
  assert.deepEqual(remote.data.collections.tasks.map(t => t.id), ['t1', 't2', 't3', 'during']);
  assert.deepEqual(oldView(remote.data).collections.events, oldView(LEGACY()).collections.events);
  assert.equal(again.store.pending(), false);
});

test('a phone closed before its move uploaded anything, while the other phone moved: it takes every file as it is and adds its own change', async () => {
  const remote = legacyServer(), a = browser(remote); await a.start();
  await a.store.set('tasks', { id: 'waiting', title: 'saved on a only' }); // the app is closed now, before any upload
  const b = browser(remote); await b.start('真真'); await b.store.set('tasks', { id: 'from-b', title: 'b' }); await b.flush();
  const shas = PARTS.map(n => remote.tree.get(`data/${n}.json.gz`));
  const again = browser(remote, { disk: a.disk, local: a.local }); await again.start();
  assert.equal(again.file('main').create, false, 'main is there now: taken, not made again');
  await again.flush();
  assert.deepEqual(PARTS.slice(1).map(n => remote.tree.get(`data/${n}.json.gz`)), shas.slice(1), 'the other files are left as b made them');
  assert.deepEqual(remote.data.collections.tasks.map(t => t.id), ['t1', 't2', 't3', 'from-b', 'waiting']);
  assert.equal(remote.count(/^PUT data\/(imported|sijie|zhenzhen)/), 3, 'each made once');
});

test('two phones moving from different versions of data.json (an older app saved in between): the files take in the difference', async () => {
  const remote = legacyServer(), a = browser(remote), b = browser(remote);
  let failMain = true; const fetch = remote.fetch.bind(remote);
  remote.fetch = (url, o = {}) => (failMain && o.method === 'PUT' && /main\.json\.gz/.test(url) ? Promise.reject(new TypeError('Failed to fetch')) : fetch(url, o));
  await a.start(); await a.flush(); // a makes imported and the person files from the first version, then loses the connection
  assert.equal(remote.part('main'), null);
  remote.editOld(d => { d.collections.events.push({ id: 'i3', title: 'New import', importKey: '["u3","3"]' }); d.collections.tasks.push({ id: 't4', title: 'Old app task' }); d.meta['status:zhenzhen'] = { emoji: '🍜', at: 2000 }; });
  failMain = false;
  const s2 = remote.tree.get('data.json');
  await b.start('真真'); // b finds the files a made (from the first version) and makes main from the second
  await b.flush();
  assert.equal(remote.part('main').meta.legacy.sha, s2); assert.notEqual(remote.part('imported').meta.legacy.sha, s2);
  await b.poll(); await settle(50); await b.flush(); await settle(); // b's first check after the move takes the difference into imported and zhenzhen
  assert.deepEqual(remote.part('imported').collections.events.map(e => e.id), ['i1', 'i2', 'i3']);
  assert.equal(remote.part('zhenzhen').meta['status:zhenzhen'].emoji, '🍜');
  for (const n of PARTS) assert.equal(remote.part(n).meta.legacy.sha, s2, n + ': the record moves on, even with nothing new (sijie)');
  assert.deepEqual(remote.data.collections.tasks.map(t => t.id), ['t1', 't2', 't3', 't4'], 'main had it already: once');
  const blobs = remote.count(/^GET blob/);
  await a.advance(16000); await a.poll(); await settle(50); // a tries again: main is there now (taken as it is), nothing of its own to add
  assert.equal(remote.count(/^GET blob/) - blobs, 3, 'the three files b changed; no version of data.json is read again');
  assert.equal(remote.count(/^PUT data\/main/), 1, "b's create; a finds main in its history and takes it"); assert.equal(remote.count(/^PUT data\/sijie/), 2);
  assert.equal(a.store.pending(), false);
  assert.deepEqual(seen(a), seen(b));
});

test('changes an older version left waiting on this device are shown at once, moved into the files and saved after the move', async () => {
  const remote = legacyServer(), disk = new Map();
  const imported = [{ id: 'i9', title: 'Imported offline', importKey: '["u9","9"]' }, { id: 'm9', title: 'Plan offline' }];
  disk.set(OLD, { base: LEGACY(), sha: 'old-sha', files: [{ path: 'photos/gone.jpg', sha: null }], fullCache: ['p1'], pending: [
    { type: 'set', col: 'tasks', id: 'off1', item: { id: 'off1', title: 'Offline task' } },
    { type: 'inboxRead', who: 'sijie', since: 100, cutoff: 0, items: [{ key: 'dy:off', at: 500 }] },
    { type: 'meta', patch: { 'status:sijie': { emoji: '🥰', at: 3000 }, heroCaption: 'NEW' } },
    { type: 'setMany', col: 'events', items: imported },
    { type: 'addComment', col: 'diary', id: 'd1', comment: { id: 'c2', text: 'offline reply' } }] });
  const page = browser(remote, { disk });
  await page.start();
  assert.ok(page.changes.tasks.some(t => t.id === 'off1') && page.changes.events.some(e => e.id === 'i9'), 'shown straight away');
  assert.ok(!disk.has(OLD), 'the old copy is gone'); assert.deepEqual(page.shared().files, [{ path: 'photos/gone.jpg', sha: null }]);
  assert.deepEqual(page.file('sijie').pending.map(o => o.type), ['inboxRead', 'meta']);
  assert.deepEqual(page.file('imported').pending.map(o => o.items?.map(x => x.id)), [['i9']]);
  await page.flush();
  assert.deepEqual(remote.data.collections.tasks.map(t => t.id), ['t1', 't2', 't3', 'off1']);
  assert.deepEqual(remote.part('imported').collections.events.map(e => e.id), ['i1', 'i2', 'i9']);
  assert.deepEqual(remote.part('main').collections.events.map(e => e.id), ['m1', 'm2', 'm9']);
  assert.equal(remote.part('sijie').meta['status:sijie'].emoji, '🥰'); assert.equal(remote.part('main').meta.heroCaption, 'NEW');
  assert.deepEqual(remote.part('sijie').meta.inboxReads.sijie.read.map(r => r.key), ['dy:d1', 'dy:off']);
  assert.deepEqual(remote.data.collections.diary[0].comments.map(c => c.id), ['c1', 'c2']);
  assert.equal(page.store.pending(), false);
});

test('an older version\'s copy on a phone that opens offline is shown, and nothing is saved until GitHub has been asked', async () => {
  const remote = legacyServer(), disk = new Map([[OLD, { base: LEGACY(), sha: 'x', pending: [{ type: 'set', col: 'tasks', id: 'o', item: { id: 'o', title: 'offline' } }] }]]);
  const page = browser(remote, { disk }); await page.store.signIn('fake-test-credential', '斯婕');
  remote.offline = true; await page.connect();
  assert.deepEqual(seen(page).collections.tasks.map(t => t.id), ['t1', 't2', 't3', 'o']); assert.equal(page.statuses.at(-1).state, 'error');
  await page.flush(); assert.equal(remote.count(/^PUT/), 0);
  remote.offline = false; await page.poll(); await page.flush();
  assert.deepEqual(remote.data.collections.tasks.map(t => t.id), ['t1', 't2', 't3', 'o']); assert.equal(puts(remote).length, 5, 'the four files, then the waiting change');
});

test('a data repo that is still new: an older app making data.json before the first save has it moved in first', async () => {
  const remote = server(); remote.data = null;
  const page = browser(remote); await page.start();
  remote.write('data.json', Buffer.from(JSON.stringify(LEGACY()))); // the other phone, on the older app, saves first
  await page.store.set('tasks', { id: 'new', title: 'first here' }); await page.flush();
  assert.equal(puts(remote).length, 0); assert.match(page.statuses.at(-1).error.message, /moving it into the new files first/);
  await page.poll(); await page.flush();
  assert.deepEqual(remote.data.collections.tasks.map(t => t.id), ['t1', 't2', 't3', 'new']); assert.equal(remote.part('main').meta.legacy.sha, remote.tree.get('data.json'));
});

// ---------- routing ----------
test('each change goes to its own file; a mixed import and an undo are split by the file that holds each event', async () => {
  const remote = legacyServer(), page = browser(remote); await page.start(); await page.flush();
  remote.offline = true; // keep the changes waiting, to see where each went
  const s = page.store;
  await s.markInboxRead('sijie', 100, 0, [{ key: 'a', at: 900 }]); await s.markInboxRead('zhenzhen', 150, 0, [{ key: 'b', at: 900 }]);
  await s.setMeta({ 'status:sijie': { emoji: '☕' }, heroCaption: 'HI', 'statusSeen:zhenzhen': 5 });
  await s.metaKey('avatars', 'sijie', 'data:C'); await s.mergeMeta('achievements:zhenzhen', { seen: ['x'] }); await s.metaKey('mode', 'high', true);
  await s.set('events', { id: 'i5', title: 'imp', importKey: '["u5","5"]' }); await s.set('events', { id: 'm5', title: 'mine' });
  await s.batchSet('events', [{ id: 'i6', importKey: '["u6","6"]' }, { id: 'm6' }, { id: 'i1', title: 'Flight moved', importKey: '["u1","1"]' }]);
  await s.update('events', 'i2', { title: 'Concert 2' }); await s.update('events', 'm1', { title: 'Dinner 2' }); await s.update('events', 'nope', { title: '?' });
  await s.set('events', { id: 'm2', title: 'Movie, now with a key', importKey: '["k","k"]' }); // an event keeps its file
  await s.removeMany('events', ['i6', 'm6', 'unknown']); await s.remove('events', 'i2');
  await s.set('tasks', { id: 't9', title: 'task' }); await s.addComment('d1', { id: 'c9', text: 'yo' });
  const kinds = n => page.file(n).pending.map(o => o.type + (o.type === 'inboxRead' ? '' : o.ids ? ':' + o.ids : o.items ? ':' + o.items.map(i => i.id) : o.id ? ':' + o.id : o.patch ? ':' + Object.keys(o.patch) : o.key ? ':' + o.key : ''));
  assert.deepEqual(kinds('sijie'), ['inboxRead', 'meta:status:sijie']);
  assert.deepEqual(kinds('zhenzhen'), ['inboxRead', 'meta:statusSeen:zhenzhen', 'mergeMeta:achievements:zhenzhen']);
  assert.deepEqual(kinds('imported'), ['set:i5', 'setMany:i6,i1', 'update:i2', 'removeMany:i6,unknown', 'remove:i2']);
  assert.deepEqual(kinds('main'), ['meta:heroCaption', 'metaKey:avatars', 'metaKey:mode', 'set:m5', 'setMany:m6', 'update:m1', 'update:nope', 'set:m2', 'removeMany:m6,unknown', 'set:t9', 'addComment:d1']);
  remote.offline = false; await page.flush();
  assert.deepEqual(remote.part('imported').collections.events.map(e => [e.id, e.title]), [['i1', 'Flight moved'], ['i5', 'imp']]);
  assert.deepEqual(remote.part('main').collections.events.map(e => [e.id, e.title]), [['m1', 'Dinner 2'], ['m2', 'Movie, now with a key'], ['m5', 'mine']]);
  assert.deepEqual(remote.part('main').meta.avatars, { sijie: 'data:C', zhenzhen: 'data:B' }); assert.equal(remote.part('main').meta.mode.high, true);
  assert.deepEqual(Object.keys(remote.part('zhenzhen').meta).sort(), ['achievements:zhenzhen', 'inboxReads', 'legacy', 'status:zhenzhen', 'statusSeen:zhenzhen']);
  assert.deepEqual(seen(page), (({ meta, collections }) => ({ meta, collections: Object.fromEntries(COLLECTIONS.map(c => [c, collections[c] || []])) }))(remote.data), 'the page sees what was saved');
});

test('a read receipt uploads only its person file, a diary post only main in one write, an import only imported', async () => {
  const data = LEGACY(); data.collections.tasks = Array.from({ length: 400 }, (_, i) => ({ id: 'bulk' + i, title: 'A task with some words in it, number ' + i }));
  const remote = legacyServer(data), page = browser(remote); await page.start(); await page.flush();
  let from = remote.puts.length;
  await page.store.markInboxRead('sijie', 100, 0, [{ key: 'dy:z', at: 999 }]); await page.flush();
  assert.deepEqual(remote.puts.slice(from).map(p => p.path), ['data/sijie.json.gz']); assert.ok(remote.puts.at(-1).bytes < 1500, remote.puts.at(-1).bytes + ' bytes');
  from = remote.puts.length; const log = remote.log.length;
  const item = await page.store.uploadPhoto({ id: 'np', thumb: IMG, entryId: 'e1', caption: '' }, IMG);
  await page.store.saveAll([{ col: 'diary', item: { id: 'e1', text: 'post', photoIds: ['np'] } }, { col: 'photos', item }]); await page.flush();
  assert.deepEqual(remote.log.slice(log).filter(l => l.startsWith('PUT')), ['PUT photos/np.jpg', 'PUT photos/np-thumb.jpg', 'PUT data/main.json.gz']);
  const before = JSON.stringify({ content: Buffer.from(JSON.stringify(remote.json('data.json'), null, 1)).toString('base64') }).length; // what the one-file app sent for any change
  assert.ok(remote.puts.at(-1).bytes < before / 4, `a diary post sends ${remote.puts.at(-1).bytes} bytes, the one-file app ${before}`);
  from = remote.puts.length;
  await page.store.batchSet('events', Array.from({ length: 50 }, (_, i) => ({ id: 'imp' + i, title: 'Imported ' + i, importKey: `["x${i}","1"]` }))); await page.flush();
  assert.deepEqual(remote.puts.slice(from).map(p => p.path), ['data/imported.json.gz']);
  await page.store.removeMany('events', Array.from({ length: 50 }, (_, i) => 'imp' + i)); await page.flush(); // Undo the import: one change, one file
  assert.deepEqual(remote.puts.slice(from + 1).map(p => p.path), ['data/imported.json.gz']);
  assert.deepEqual(remote.part('imported').collections.events.map(e => e.id), ['i1', 'i2']);
});

// ---------- saves and conflicts, per file ----------
test('a save that meets another save is replayed on that file only; the other files are not touched', async () => {
  const remote = legacyServer(), page = browser(remote); await page.start(); await page.flush();
  const other = browser(remote); await other.start('真真');
  await other.store.markInboxRead('sijie', 100, 0, [{ key: 'theirs', at: 800 }]); await other.store.set('tasks', { id: 'theirs', title: 'from the other phone' }); await other.flush();
  const from = remote.log.length, mainSha = remote.tree.get('data/main.json.gz');
  await page.store.markInboxRead('sijie', 100, 0, [{ key: 'mine', at: 900 }]); await page.store.setMeta({ 'status:zhenzhen': { emoji: '?' } }); await page.flush();
  assert.deepEqual(puts(remote, from), ['PUT data/sijie.json.gz', 'PUT data/sijie.json.gz', 'PUT data/zhenzhen.json.gz'], 'sijie: turned down, read again, replayed; main untouched');
  assert.deepEqual(remote.log.slice(from).filter(l => l.startsWith('GET')), ['GET data/sijie.json.gz'], 'only that file is read again');
  assert.equal(remote.tree.get('data/main.json.gz'), mainSha);
  assert.deepEqual(remote.part('sijie').meta.inboxReads.sijie.read.map(r => r.key), ['dy:d1', 'theirs', 'mine']);
  assert.ok(!page.changes.tasks.some(t => t.id === 'theirs'), 'main is read on the next check, not by a person file conflict');
  await page.poll(); assert.ok(page.changes.tasks.some(t => t.id === 'theirs'));
});

test('a rate limit in the middle of the move waits, then the move carries on', async () => {
  const remote = legacyServer(), page = browser(remote); await page.start();
  let n = 0; const fetch = remote.fetch.bind(remote);
  remote.fetch = (url, o = {}) => (o.method === 'PUT' && ++n === 2 ? Promise.resolve({ status: 403, ok: false, headers: { get: k => (k === 'retry-after' ? '60' : null) }, json: async () => ({ message: 'You have exceeded a secondary rate limit.' }) }) : fetch(url, o));
  await page.flush();
  assert.equal(page.statuses.at(-1).state, 'ratelimited'); assert.deepEqual([...remote.tree.keys()].filter(p => p.startsWith('data/')), ['data/imported.json.gz']);
  await page.advance(61000);
  assert.deepEqual(puts(remote).filter(l => !l.includes('imported')), ['PUT data/sijie.json.gz', 'PUT data/zhenzhen.json.gz', 'PUT data/main.json.gz']);
  assert.equal(page.store.pending(), false); assert.equal(page.statuses.at(-1).state, 'synced');
});

// ---------- polling ----------
test('a check with nothing new is one request (a 304); one changed file is one download by sha; a lagging listing never moves a file back', async () => {
  const remote = server(), page = browser(remote); await page.start();
  let from = remote.log.length; await page.poll();
  assert.deepEqual(remote.log.slice(from), ['GET data']);
  const sha = remote.edit('zhenzhen', d => { d.meta['status:zhenzhen'] = { emoji: '🌙' }; });
  from = remote.log.length; await page.poll();
  assert.deepEqual(remote.log.slice(from), ['GET data', `GET blob ${sha} raw`]); assert.equal(page.changes.meta['status:zhenzhen'].emoji, '🌙');
  const old = remote.entries('data');
  await page.store.markInboxRead('sijie', 1, 0, [{ key: 'k', at: 5 }]); await page.flush();
  remote.lagOnce = old; from = remote.log.length; await page.poll(); // lists sijie as it was before our save
  assert.deepEqual(remote.log.slice(from), ['GET data'], 'nothing downloaded');
  assert.deepEqual(page.changes.meta.inboxReads.sijie.read.map(r => r.key), ['k']);
  await page.poll(); assert.deepEqual(page.changes.meta.inboxReads.sijie.read.map(r => r.key), ['k']);
});

// ---------- an older app still saving in data.json ----------
async function moved(data = LEGACY()) { const remote = legacyServer(data), page = browser(remote); await page.start(); await page.flush(); await settle(); return { remote, page }; }
const later = async page => { page.clock.offset += 601000; await page.poll(); await settle(50); await page.runTimers(700); await settle(); }; // the next check of data.json, and the save it leads to

test('what an older app adds, edits and removes in data.json is taken in once; what the new version removed never comes back', async () => {
  const { remote, page } = await moved();
  await page.store.remove('tasks', 't1'); await page.store.update('tasks', 't2', { title: 'Call mum (Sunday)' }); await page.store.addComment('d1', { id: 'c5', text: 'new app' });
  await page.store.remove('events', 'i2'); await page.flush();
  remote.editOld(d => { // the other phone, not updated yet, on its own copy of data.json
    d.collections.tasks.push({ id: 't9', title: 'Old app task' });
    d.collections.tasks.find(t => t.id === 't1').title = 'Buy oat milk'; // removed with the new version: stays removed
    d.collections.tasks.find(t => t.id === 't2').done = true; // another field than the new version's edit: both stay
    d.collections.tasks = d.collections.tasks.filter(t => t.id !== 't3');
    d.collections.events.find(e => e.id === 'i2').title = 'Concert (moved)'; // removed here too
    d.collections.events.push({ id: 'i7', title: 'Old app import', importKey: '["u7","7"]' });
    d.meta['status:zhenzhen'] = { emoji: '🍜', at: 5000 }; d.meta.avatars.zhenzhen = 'data:Z';
    d.meta.inboxReads.zhenzhen.read.push({ key: 'dy:old', at: 700 });
  });
  const to = remote.tree.get('data.json'), from = remote.puts.length;
  await later(page);
  assert.deepEqual(remote.data.collections.tasks.map(t => [t.id, t.title, t.done]), [['t2', 'Call mum (Sunday)', true], ['t9', 'Old app task', undefined]]);
  assert.deepEqual(remote.data.collections.events.map(e => e.id).sort(), ['i1', 'i7', 'm1', 'm2']);
  assert.deepEqual(remote.data.collections.diary[0].comments.map(c => c.id), ['c1', 'c5']);
  assert.equal(remote.part('zhenzhen').meta['status:zhenzhen'].emoji, '🍜'); assert.deepEqual(remote.part('main').meta.avatars, { sijie: 'data:A', zhenzhen: 'data:Z' });
  assert.deepEqual(remote.part('zhenzhen').meta.inboxReads.zhenzhen.read.map(r => r.key), ['qa:x', 'dy:old']);
  assert.deepEqual(remote.puts.slice(from).map(p => p.path).sort(), ['data/imported.json.gz', 'data/main.json.gz', 'data/sijie.json.gz', 'data/zhenzhen.json.gz'], 'one save per file (sijie: only its record)');
  assert.ok(remote.puts.slice(from).find(p => p.path === 'data/sijie.json.gz').bytes < 1500);
  for (const n of PARTS) assert.equal(remote.part(n).meta.legacy.sha, to, n);
  assert.deepEqual(seen(page).collections.tasks.map(t => t.id), ['t2', 't9']);
  const n = remote.puts.length, blobs = remote.count(/^GET blob/); await later(page); // nothing new in data.json: no reading, no saving
  assert.equal(remote.puts.length, n); assert.equal(remote.count(/^GET blob/), blobs);
});

test('two updated phones taking in the same older-app change do it once (a replay never undoes a later removal)', async () => {
  const { remote, page: a } = await moved();
  const b = browser(remote); await b.start('真真');
  remote.editOld(d => { d.collections.tasks.push({ id: 'x', title: 'from the old app' }); });
  a.clock.offset += 601000; await a.poll(); await settle(50); // a works it out ...
  b.clock.offset += 601000; await b.poll(); await settle(50); // ... and so does b, before either saves
  await a.flush(); await a.store.remove('tasks', 'x'); await a.flush(); // a saves it, then the new version removes it
  await b.flush(); await settle(); // b's copy of the same change: GitHub has moved on, it is not made again
  assert.ok(!remote.data.collections.tasks.some(t => t.id === 'x'));
  assert.equal(b.store.pending(), false); await b.poll(); assert.ok(!b.changes.tasks.some(t => t.id === 'x'));
});

test('an emptied or missing data.json is never taken as "everything was removed"', async () => {
  const { remote, page } = await moved();
  remote.editOld(d => { for (const c of Object.keys(d.collections)) d.collections[c] = []; });
  await later(page);
  assert.match(page.statuses.at(-1).error.message, /emptied/); assert.equal(remote.data.collections.tasks.length, 3); assert.equal(page.store.pending(), false);
  remote.drop('data.json'); page.clock.offset += 601000; await page.poll(); await settle(50);
  assert.equal(remote.data.collections.tasks.length, 3); assert.equal(page.store.pending(), false);
});

test('data.json is checked on start and every 10 minutes, and no more after 30 days without a change', async () => {
  const { remote, page } = await moved();
  const roots = () => remote.count(/^GET \/$/), n = roots();
  await page.poll(); await settle(50); assert.equal(roots(), n + 1, 'the first check after the move (on start when nothing is moved)');
  await page.poll(); await settle(50); assert.equal(roots(), n + 1, 'not again within 10 minutes');
  page.clock.offset += 601000; await page.poll(); await settle(50); assert.equal(roots(), n + 2);
  const again = browser(remote, { disk: page.disk, local: page.local }); await again.start(); await settle(50); assert.equal(roots(), n + 3, 'on start');
  page.clock.offset += 31 * 864e5; await page.poll(); await settle(50); assert.equal(roots(), n + 3, 'stopped after 30 days');
  assert.ok(remote.part('main').meta.legacy.sha, 'the record stays');
});

// ---------- a missing main.json.gz ----------
const MISSING = 'data/main.json.gz is missing. Restore it from the readable-backup branch; nothing was changed.';
test('a move stopped part way is finished by a phone without a copy: the files made so far are exactly as split, changes waiting come after main', async () => {
  const remote = legacyServer(), disk = new Map([[OLD, { base: LEGACY(), sha: 'x', pending: [
    { type: 'inboxRead', who: 'sijie', since: 100, cutoff: 0, items: [{ key: 'dy:late', at: 900 }] },
    { type: 'setMany', col: 'events', items: [{ id: 'i8', title: 'waiting import', importKey: '["u8","8"]' }] }] }]]);
  const a = browser(remote, { disk });
  let cut = 2; const fetch = remote.fetch.bind(remote);
  remote.fetch = (url, o = {}) => (o.method === 'PUT' && /contents\/data\//.test(url) && --cut < 0 ? Promise.reject(new TypeError('Failed to fetch')) : fetch(url, o));
  await a.start(); await a.flush(); // imported and sijie are made, then the connection drops
  assert.deepEqual([...remote.tree.keys()].filter(p => p.startsWith('data/')), ['data/imported.json.gz', 'data/sijie.json.gz']);
  const fresh = split(LEGACY(), remote.part('imported').meta.legacy);
  assert.deepEqual(remote.part('imported'), fresh.imported); assert.deepEqual(remote.part('sijie'), fresh.sijie, 'the changes waiting are not in them yet');
  remote.fetch = fetch;
  const c = browser(remote); await c.start('真真'); await c.flush(); // another phone, with no copy, finishes the move
  assert.ok(remote.part('main')); assert.equal(c.statuses.at(-1).state, 'synced'); assert.equal(remote.count(/^PUT data\/(imported|sijie)/), 2, 'taken as they are');
  assert.ok(remote.count(/^GET commits data\/main\.json\.gz$/) >= 1, 'main\'s history was asked: no commits, so a move that stopped part way');
  await a.advance(16000); await settle(); // a is back: its changes go on top
  assert.deepEqual(remote.part('sijie').meta.inboxReads.sijie.read.map(r => r.key), ['dy:d1', 'dy:late']);
  assert.deepEqual(remote.part('imported').collections.events.map(e => e.id), ['i1', 'i2', 'i8']);
  assert.equal(a.store.pending(), false); assert.equal(a.statuses.at(-1).state, 'synced');
});

test('a main.json.gz deleted after later changes is never made again: phones with or without a copy stop and write nothing; putting it back carries on', async () => {
  const remote = legacyServer();
  const p = browser(remote); await p.start(); await p.store.set('tasks', { id: 'planned', title: 'waits on p' }); // p plans the move, then is closed
  const a = browser(remote); await a.start(); await a.flush(); // a moves
  await a.store.markInboxRead('sijie', 100, 0, [{ key: 'dy:after', at: 950 }]); await a.flush(); // a later change to another file
  const mainBytes = remote.bytes('data/main.json.gz'), legacyBytes = remote.bytes('data.json');
  remote.drop('data/main.json.gz');
  const tree = JSON.stringify([...remote.tree]), puts0 = remote.puts.length;
  a.clock.offset += 31000; await a.poll(); await a.store.set('tasks', { id: 'a2', title: 'after' }); await a.flush(); // knew main (and made it over 30 s ago: not a lagging listing)
  const fresh = browser(remote); await fresh.start(); // no copy
  const again = browser(remote, { disk: p.disk, local: p.local }); await again.start(); await again.runTimers(700); // a copy from a planned move
  for (const [who, page] of [['knew main', a], ['no copy', fresh], ['planned move', again]]) { assert.equal(page.statuses.at(-1).state, 'error', who); assert.equal(page.statuses.at(-1).error.message, MISSING, who); }
  assert.equal(remote.puts.length, puts0, 'nothing written'); assert.equal(JSON.stringify([...remote.tree]), tree); assert.ok(remote.bytes('data.json').equals(legacyBytes));
  assert.ok(again.changes.tasks.some(t => t.id === 'planned'), 'the copy on the phone stays readable');
  const blobs = remote.count(/^GET blob/); await fresh.poll(); await again.poll();
  assert.equal(remote.count(/^GET blob/), blobs, 'checked once, not on every poll'); assert.equal(remote.puts.length, puts0);
  remote.write('data/main.json.gz', mainBytes); // put back from the readable backup
  await a.poll(); await a.runTimers(700); await again.poll(); await again.runTimers(700); await fresh.poll();
  assert.deepEqual(remote.data.collections.tasks.map(t => t.id), ['t1', 't2', 't3', 'a2', 'planned']);
  assert.deepEqual(remote.part('sijie').meta.inboxReads.sijie.read.map(r => r.key), ['dy:d1', 'dy:after']);
  for (const page of [a, fresh, again]) assert.equal(page.statuses.at(-1).state, 'synced');
});

test('a main.json.gz deleted right after the move, before anything else changed, is not made again: its history shows it was there', async () => {
  const remote = legacyServer();
  const p = browser(remote); await p.start(); await p.store.set('tasks', { id: 'planned', title: 'waits on p' }); // p plans the move, then is closed
  const a = browser(remote); await a.start(); await a.flush(); await settle(); // a moves; nothing else changes
  const mainBytes = remote.bytes('data/main.json.gz'); remote.drop('data/main.json.gz');
  const tree = JSON.stringify([...remote.tree]), puts0 = remote.puts.length;
  const fresh = browser(remote); await fresh.start(); // no copy: the other files are exactly as split, like a move that stopped part way
  const again = browser(remote, { disk: p.disk, local: p.local }); await again.start(); await again.runTimers(700); // a copy from a planned move
  for (const [who, page] of [['no copy', fresh], ['planned move', again]]) { assert.equal(page.statuses.at(-1).state, 'error', who); assert.equal(page.statuses.at(-1).error.message, MISSING, who); }
  assert.ok(remote.count(/^GET commits data\/main\.json\.gz$/) >= 2);
  assert.equal(remote.puts.length, puts0, 'nothing written'); assert.equal(JSON.stringify([...remote.tree]), tree);
  const asked = remote.count(/^GET commits/); await fresh.poll(); await fresh.poll(); assert.equal(remote.count(/^GET commits/), asked, 'a commit once seen is enough');
  remote.write('data/main.json.gz', mainBytes); await fresh.poll(); await again.poll(); await again.runTimers(700); // put back: carries on
  assert.equal(fresh.statuses.at(-1).state, 'synced'); assert.deepEqual(remote.data.collections.tasks.map(t => t.id), ['t1', 't2', 't3', 'planned']);
});

test('when main\'s history can\'t be read, nothing is made, and the next check asks again', async () => {
  for (const fail of [r => { r.commitsReply = [500, {}]; }, r => { r.commitsReply = [403, { message: 'Resource not accessible by personal access token' }]; }, r => { r.commitsReply = [200, { not: 'a list' }]; }, r => { r.commitsOffline = true; }]) {
    const remote = legacyServer(); fail(remote);
    const page = browser(remote), starting = page.start(); await settle(50);
    assert.equal(page.statuses.at(-1).state, 'error'); assert.equal(remote.count(/^PUT/), 0); assert.equal(remote.part('main'), null);
    remote.commitsReply = null; remote.commitsOffline = false; await page.poll(); await starting; await page.flush();
    assert.ok(remote.part('main')); assert.equal(page.statuses.at(-1).state, 'synced');
  }
  const remote = legacyServer(), page = browser(remote); await page.start(); // asked again right before main is made
  remote.commitsReply = [502, {}]; await page.flush();
  assert.equal(remote.part('main'), null); assert.match(page.statuses.at(-1).error.message, /Could not check whether data\/main\.json\.gz was there before/);
  await page.advance(16000); assert.equal(remote.part('main'), null, 'the retry of the save waits for a check that works');
  remote.commitsReply = null; await page.poll(); await page.advance(1000); await settle(); // the next check asks again
  assert.ok(remote.part('main')); assert.equal(page.store.pending(), false); assert.equal(page.statuses.at(-1).state, 'synced');
});

test('in a new data repo main is always made first; a file there without main is refused', async () => {
  const remote = server(); remote.data = null;
  const page = browser(remote); await page.start();
  await page.store.markInboxRead('sijie', 1, 0, [{ key: 'k', at: 5 }]); await page.flush(); // the first save is for a person file
  assert.deepEqual(puts(remote), ['PUT data/main.json.gz', 'PUT data/sijie.json.gz']); assert.match(remote.messages[0], /: create data\/main\.json\.gz$/);
  remote.drop('data/main.json.gz');
  const fresh = browser(remote); await fresh.start();
  assert.equal(fresh.statuses.at(-1).error.message, MISSING); assert.equal(puts(remote).length, 2);
});

test('the repository root is listed as /contents, never /contents/ (which the way to GitHub can turn down)', async () => {
  const { remote, page } = await moved();
  await page.poll(); await settle(50); // the first check of data.json after the move
  assert.equal(remote.count(/not canonical/), 0);
  assert.equal(remote.count(/^GET \/$/), 2, 'once for the move, once for the check');
  assert.ok(remote.part('main').meta.legacy.sha); assert.equal(page.statuses.at(-1).state, 'synced');
});

// ---------- safety ----------
test('a damaged file stops all saving (nothing is written over it) until a good one is back', async () => {
  const remote = server(), page = browser(remote); await page.start();
  for (const [bytes, why] of [[Buffer.from('not gzip'), /could not be read/], [gz({ version: 2, meta: { 'status:zhenzhen': 1 }, collections: {} }), /someone else's setting/], [gz({ version: 1, meta: {}, collections: {} }), /expected shape/]]) {
    remote.write('data/sijie.json.gz', bytes); await page.poll();
    assert.equal(page.statuses.at(-1).state, 'error'); assert.match(page.statuses.at(-1).error.message, why);
  }
  await page.store.set('tasks', { id: 'waits', title: 'kept on this device' }); await page.flush();
  assert.equal(remote.count(/^PUT/), 0); assert.equal(page.statuses.at(-1).state, 'error'); assert.ok(page.changes.tasks.some(t => t.id === 'waits'));
  const blobs = remote.count(/^GET blob/); await page.poll(); assert.equal(remote.count(/^GET blob/), blobs, 'the damaged version is not downloaded again');
  remote.write('data/sijie.json.gz', gz({ version: 2, meta: {}, collections: {} })); await page.poll(); await page.flush();
  assert.deepEqual(remote.data.collections.tasks.map(t => t.id), ['waits']); assert.equal(page.statuses.at(-1).state, 'synced');
});

test('a damaged data.json is not moved in; nothing is created', async () => {
  const remote = server({ legacy: true }); remote.setup(); remote.write('data.json', Buffer.from('{"version":1,"collections":{"tasks":{"not":"a list"}}}'));
  const page = browser(remote); const starting = page.start(); await settle(50);
  assert.equal(page.statuses.at(-1).state, 'error'); assert.equal(page.statuses.at(-1).error.message, 'data.json could not be read, so nothing was taken from it.');
  await page.poll(); await settle(50); // tried again: still nothing made
  assert.equal(remote.count(/^PUT/), 0); assert.equal(remote.part('main'), null); void starting;
});

test('without CompressionStream nothing is moved or written, the error says to update the browser, and the copy on this device stays', async () => {
  const remote = legacyServer(), fresh = browser(remote, { zip: false });
  const starting = fresh.start(); await settle(50);
  assert.equal(fresh.statuses.at(-1).state, 'error'); assert.equal(fresh.statuses.at(-1).error.message, 'This browser is too old for the new save format. Please update it.');
  assert.equal(remote.count(/^GET/), 1, 'only the login check'); assert.equal(remote.part('main'), null); void starting;
  const page = browser(remote); await page.start(); await page.flush(); // moved by an up-to-date phone ...
  const old = browser(remote, { zip: false, disk: page.disk, local: page.local }); await old.start(); // ... then this one opens in an old browser
  assert.deepEqual(old.changes.tasks.map(t => t.id), ['t1', 't2', 't3']); assert.equal(old.statuses.at(-1).error.code, 'oldbrowser');
  await old.store.set('tasks', { id: 'x', title: 'kept' }); await old.flush();
  assert.equal(puts(remote).length, 4, 'nothing written'); assert.equal(old.store.pending(), true); assert.equal(old.statuses.at(-1).error.code, 'oldbrowser');
});

test('a data file saved by our own first save that a listing does not show yet is not reported missing', async () => {
  const remote = server(); remote.data = null;
  const page = browser(remote); await page.start();
  await page.store.set('tasks', { id: 't', title: 'first' }); await page.flush();
  remote.lagOnce = []; await page.poll();
  assert.equal(page.statuses.at(-1).state, 'synced');
  const n = remote.puts.length; await page.store.set('tasks', { id: 't2', title: 'second' }); await page.flush(); // held until a listing shows the file
  assert.equal(remote.puts.length, n); assert.equal(page.store.pending(), true);
  await page.poll(); await page.runTimers(700);
  assert.deepEqual(remote.data.collections.tasks.map(t => t.id), ['t', 't2']); assert.equal(page.store.pending(), false);
});

test('the saved files are gzip and the page gets the same view as the one-file version for the same data', async () => {
  const { remote, page } = await moved();
  for (const n of PARTS) assert.deepEqual(remote.bytes(`data/${n}.json.gz`).subarray(0, 2), Buffer.from([0x1f, 0x8b]), n);
  assert.deepEqual(seen(page), oldView(LEGACY()));
  const cached = browser(remote, { disk: page.disk, local: page.local }); await cached.start();
  assert.deepEqual(seen(cached), oldView(LEGACY())); assert.deepEqual(join(Object.fromEntries(PARTS.map(n => [n, remote.part(n)]))).meta, LEGACY().meta);
  assert.deepEqual(Object.keys(page.disk.get(SHARED)).sort(), ['dirEtag', 'files', 'fullCache', 'rootEtag']);
  for (const n of PARTS) assert.deepEqual(page.disk.get(FILE(n)).base, remote.part(n), n);
  void clone;
});
