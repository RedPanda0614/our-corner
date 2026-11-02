const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const start = source.indexOf('// ---------- journey links');
const end = source.indexOf('// ---------- end journey links ----------');
assert.ok(start > 0 && end > start);

function journey(data) {
  return vm.runInNewContext(`const data = input; ${source.slice(start, end)}; ({ todoByRef, todoRef, planForWish, diaryForTodo, photosForTodo })`, { input: data });
}

test('a wish keeps the same plan link when its title changes, and stale links disappear safely', () => {
  const data = { wishes: [{ id: 'wish-1', title: 'Visit the lake' }], tasks: [{ id: 'task-1', title: 'Lake day', wishId: 'wish-1' }], trips: [], diary: [], photos: [] };
  const j = journey(data);
  assert.equal(j.planForWish(data.wishes[0]).id, 'task-1');
  assert.equal(j.todoByRef({ col: 'tasks', id: 'task-1' }).title, 'Lake day');
  assert.equal(j.todoByRef({ col: 'photos', id: 'task-1' }), null);
  data.tasks.splice(0);
  assert.equal(j.planForWish(data.wishes[0]), undefined);
  assert.equal(j.todoByRef({ col: 'tasks', id: 'task-1' }), undefined);
});

test('a completed plan finds both its diary photos and direct album photos, without mixing another plan', () => {
  const data = { wishes: [], tasks: [], trips: [{ id: 'trip-1', start: '2026-11-07' }],
    diary: [{ id: 'entry-1', todoRef: { col: 'trips', id: 'trip-1' } }, { id: 'entry-2', todoRef: { col: 'tasks', id: 'trip-1' } }],
    photos: [{ id: 'photo-1', entryId: 'entry-1' }, { id: 'photo-2', todoRef: { col: 'trips', id: 'trip-1' } }, { id: 'photo-3', entryId: 'entry-2' }] };
  const j = journey(data), ref = j.todoRef({ id: 'trip-1', kind: 'trip' });
  assert.equal(ref.col, 'trips');
  assert.deepEqual([...j.diaryForTodo(ref)].map(x => x.id), ['entry-1']);
  assert.deepEqual([...j.photosForTodo(ref)].map(x => x.id), ['photo-1', 'photo-2']);
});
