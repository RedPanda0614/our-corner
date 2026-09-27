const { test } = require('node:test');
const assert = require('node:assert/strict');
const { server, browser } = require('./fake-github.cjs');

test('replays a save after another person changes the shared data', async () => {
  const remote = server(), page = browser(remote); await page.start();
  remote.conflict = data => data.collections.tasks.push({ id: 'their-task', title: 'Other person' });
  await page.store.set('tasks', { id: 'my-task', title: '我们的计划' }); await page.flush();
  assert.deepEqual(remote.data.collections.tasks.map(x => x.id), ['their-task', 'my-task']);
  assert.equal(page.store.pending(), false);
});

test('message read receipts merge across devices and remain separate for each person', async () => {
  const remote = server(), first = browser(remote), second = browser(remote);
  await first.start(); await second.start();
  await first.store.markInboxRead('sijie', 100, 0, [{ key: 'one', at: 200 }]);
  await second.store.markInboxRead('sijie', 150, 0, [{ key: 'two', at: 300 }]);
  await first.flush(); await second.flush();
  assert.equal(remote.data.meta.inboxReads.sijie.since, 100);
  assert.deepEqual(remote.data.meta.inboxReads.sijie.read.map(x => x.key).sort(), ['one', 'two']);
  await first.store.markInboxRead('zhenzhen', 100, 0, [{ key: 'one', at: 200 }]);
  await first.flush();
  assert.deepEqual(remote.data.meta.inboxReads.zhenzhen.read.map(x => x.key), ['one']);
  const reopened = browser(remote); await reopened.start();
  assert.deepEqual(reopened.changes.meta.inboxReads.sijie.read.map(x => x.key).sort(), ['one', 'two']);
});

test('old message receipts are compacted without bringing old alerts back', async () => {
  const remote = server(), page = browser(remote); await page.start();
  await page.store.markInboxRead('sijie', 100, 0, [{ key: 'old', at: 200 }, { key: 'recent', at: 300 }]);
  await page.flush();
  await page.store.markInboxRead('sijie', 100, 250, [{ key: 'recent', at: 300 }]);
  await page.flush();
  assert.equal(remote.data.meta.inboxReads.sijie.since, 250);
  assert.deepEqual(remote.data.meta.inboxReads.sijie.read.map(x => x.key), ['recent']);
});

test('failed saves survive reopening and can finish after access is restored', async () => {
  const remote = server(), first = browser(remote); await first.start(); remote.rejectWrites = true;
  await first.store.set('diary', { id: 'draft-1', text: 'A saved draft' }); await first.flush();
  assert.equal(first.store.pending(), true);
  assert.ok(first.statuses.some(x => x.state === 'error' && x.error));
  remote.rejectWrites = false;
  const reopened = browser(remote, { disk: first.disk, local: first.local }); await reopened.start(); await reopened.flush();
  assert.equal(remote.data.collections.diary[0].text, 'A saved draft');
  assert.equal(reopened.store.pending(), false);
});

test('photo validation failures are reported instead of marked successful', async () => {
  const remote = server(), page = browser(remote); await page.start();
  remote.photoPut['photos/photo-1.jpg'] = 422; // GitHub turns the file down every time
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
  assert.equal(remote.putMaxActive, 1);
});

test('a diary photo is saved only after both image files upload, then can be removed', async () => {
  const remote = server();
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

test('older shared data accepts albums and preserves photo membership', async () => {
  const remote = server(); // The old data file has no albums collection.
  const page = browser(remote); await page.start();
  assert.deepEqual(page.changes.albums, []);
  await page.store.set('albums', { id: 'album-1', title: 'Summer', createdAt: 1 });
  await page.store.set('photos', { id: 'photo-1', albumId: 'album-1', thumb: '' });
  await page.flush();
  assert.equal(remote.data.collections.albums[0].title, 'Summer');
  assert.equal(remote.data.collections.photos[0].albumId, 'album-1');
});

test('older shared data accepts daily answers and custom questions', async () => {
  const remote = server(); // The old data file has no answers or questions collections.
  const page = browser(remote); await page.start();
  assert.deepEqual(page.changes.answers, []);
  assert.deepEqual(page.changes.questions, []);
  assert.deepEqual(page.changes.checkins, []);
  await page.store.set('answers', { id: '2026-09-27:sijie', date: '2026-09-27', text: 'Dumplings', createdAt: 1 });
  await page.store.set('questions', { id: 'q-1', date: '2026-09-28', text: 'Best trip so far?', createdAt: 2 });
  await page.flush();
  assert.equal(remote.data.collections.answers[0].text, 'Dumplings');
  assert.equal(remote.data.collections.questions[0].date, '2026-09-28');
});

test('undoing an import removes its events in one change and keeps a concurrent save', async () => {
  const remote = server(), page = browser(remote); await page.start();
  await page.store.batchSet('events', [{ id: 'a' }, { id: 'b' }, { id: 'c' }]); await page.flush();
  remote.conflict = data => data.collections.events.push({ id: 'theirs' }); // the other person saves first
  await page.store.removeMany('events', ['a', 'b']); await page.flush();
  assert.deepEqual(remote.data.collections.events.map(e => e.id).sort(), ['c', 'theirs']);
  assert.equal(page.store.pending(), false);
});
