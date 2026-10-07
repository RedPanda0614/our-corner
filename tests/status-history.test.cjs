const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../status-history.js');

test('history includes the current status, sorts newest first, and deduplicates archived current', () => {
  const old = { emoji: '🌟', text: 'great', at: 100 };
  const now = { emoji: '😢', text: 'sad', at: 200 };
  const meta = { 'status:sijie': now, 'statusHistory:sijie': H.patch(old, now) };
  assert.deepEqual(H.entries(meta, 'sijie'), [now, old]);
  assert.deepEqual(H.entries(meta, 'zhenzhen'), []);
});

test('cleared status remains in history and invalid records are ignored', () => {
  const old = { emoji: '💬', text: 'hello', at: 300 };
  const meta = { 'status:sijie': null, 'statusHistory:sijie': { ...H.patch(old), broken: { emoji: '<script>', at: 'x' } } };
  assert.deepEqual(H.entries(meta, 'sijie'), [old]);
  assert.deepEqual(H.patch(null, {}, old), { '300:💬': old });
});
