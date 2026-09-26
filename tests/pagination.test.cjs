const test = require('node:test');
const assert = require('node:assert/strict');
const { paginate, pageForItem } = require('../pagination.js');

const entries = Array.from({ length: 45 }, (_, i) => ({ id: `entry-${i + 1}` }));

test('lists show at most 20 items and preserve their ordering across pages', () => {
  assert.deepEqual(paginate(entries, 1).items.map(e => e.id), entries.slice(0, 20).map(e => e.id));
  assert.deepEqual(paginate(entries, 2).items.map(e => e.id), entries.slice(20, 40).map(e => e.id));
  const last = paginate(entries, 3);
  assert.equal(last.items.length, 5);
  assert.deepEqual([last.start, last.end, last.totalPages], [40, 45, 3]);
});

test('page selection clamps after filtered or deleted items reduce the page count', () => {
  assert.equal(paginate(entries.slice(0, 12), 3).page, 1);
  assert.equal(paginate(entries, 0).page, 1);
  assert.equal(paginate([], 5).page, 1);
  assert.deepEqual(paginate([], 5).items, []);
});

test('linked entries can open on the page containing them', () => {
  assert.equal(pageForItem(entries, 'entry-20'), 1);
  assert.equal(pageForItem(entries, 'entry-21'), 2);
  assert.equal(pageForItem(entries, 'entry-45'), 3);
  assert.equal(pageForItem(entries, 'missing'), 1);
});
