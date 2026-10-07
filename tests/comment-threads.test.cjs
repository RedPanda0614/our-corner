const test = require('node:test');
const assert = require('node:assert/strict');
const { flatten } = require('../comment-threads.js');

test('replies appear directly below their parent, without changing stored order', () => {
  const a = { id: 'a', text: 'first' }, b = { id: 'b', text: 'second' };
  const reply = { id: 'r', replyTo: 'a', text: 'answer' };
  const nested = { id: 'n', replyTo: 'r', text: 'answer again' };
  const list = [a, b, reply, nested];
  assert.deepEqual(flatten(list).map(row => [row.comment.id, row.depth]), [['a', 0], ['r', 1], ['n', 2], ['b', 0]]);
  assert.deepEqual(list.map(x => x.id), ['a', 'b', 'r', 'n']);
});

test('a reply survives deleting its parent and malformed cycles cannot hide comments', () => {
  const orphan = { id: 'r', replyTo: 'deleted', replyToAuthor: '斯婕' };
  assert.deepEqual(flatten([orphan]).map(row => row.comment.id), ['r']);
  assert.deepEqual(flatten([{ id: 'a', replyTo: 'b' }, { id: 'b', replyTo: 'a' }]).map(row => row.comment.id), ['a', 'b']);
});
