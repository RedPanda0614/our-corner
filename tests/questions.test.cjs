const test = require('node:test');
const assert = require('node:assert/strict');
const { CATEGORIES, BANK, bankFor, schedule, forDay, nextFreeDay } = require('../questions.js');

const DAY = 864e5;
const shift = (iso, n) => new Date(Date.parse(iso) + n * DAY).toISOString().slice(0, 10);
const cycleQids = start => Array.from({ length: BANK.length }, (_, i) => bankFor(shift(start, i)).qid);
const item = (id, date, extra = {}) => ({ id, date, text: `Question ${id}?`, by: 'Sijie', createdAt: 1, ...extra });
const ons = list => Object.fromEntries(schedule(list).map(s => [s.q.id, s.on]));

test('the bank has 180 well-formed bilingual questions, 30 per category', () => {
  assert.equal(BANK.length, 180);
  assert.deepEqual(BANK.map(b => b.id), Array.from({ length: 180 }, (_, i) => 'q' + String(i + 1).padStart(3, '0')));
  const perCat = {};
  for (const b of BANK) {
    assert.match(b.id, /^q\d{3}$/);
    assert.ok(Object.hasOwn(CATEGORIES, b.cat) && b.cat !== 'custom', `${b.id} category ${b.cat}`);
    perCat[b.cat] = (perCat[b.cat] || 0) + 1;
    assert.ok(b.en.trim() && b.en.endsWith('?'), `${b.id} en`);
    assert.ok(b.zh.trim() && /[一-鿿]/.test(b.zh) && b.zh.endsWith('？'), `${b.id} zh`);
    assert.doesNotMatch(b.en + b.zh, /[\u2013\u2014]/, `${b.id} has a dash`);
  }
  assert.deepEqual(perCat, { fun: 30, deep: 30, memory: 30, wyr: 30, know: 30, future: 30 });
  assert.equal(new Set(BANK.map(b => b.id)).size, 180);
  assert.equal(new Set(BANK.map(b => b.en.toLowerCase())).size, 180);
  assert.equal(new Set(BANK.map(b => b.zh)).size, 180);
});

test('every category has bilingual labels, including custom questions', () => {
  for (const key of ['fun', 'deep', 'memory', 'wyr', 'know', 'future', 'custom']) {
    assert.ok(CATEGORIES[key].en && /[一-鿿]/.test(CATEGORIES[key].zh), key);
  }
});

test('the bank pick for a day is deterministic and rejects invalid dates', () => {
  const q = bankFor('2026-09-27');
  assert.deepEqual(Object.keys(q), ['qid', 'cat', 'en', 'zh']);
  assert.deepEqual(bankFor('2026-09-27'), q);
  const b = BANK.find(x => x.id === q.qid);
  assert.deepEqual(q, { qid: b.id, cat: b.cat, en: b.en, zh: b.zh });
  assert.notEqual(q, bankFor('2026-09-27'), 'returns a fresh copy');
  for (const bad of ['', '2026-02-30', 'nope', '2026-9-27', null, undefined, 20260927]) assert.equal(bankFor(bad), null);
  assert.equal(bankFor('2028-02-29').cat in CATEGORIES, true);
});

test('a question never comes back within 30 days, even across cycle boundaries', () => {
  const qids = Array.from({ length: BANK.length * 6 }, (_, i) => bankFor(shift('2026-01-01', i - BANK.length * 2)).qid);
  const seen = new Map();
  qids.forEach((qid, day) => {
    if (seen.has(qid)) assert.ok(day - seen.get(qid) > 30, `${qid} repeats after ${day - seen.get(qid)} days`);
    seen.set(qid, day);
  });
});

test('no question repeats within a cycle, before or after 2026', () => {
  const L = BANK.length;
  for (const start of ['2026-01-01', shift('2026-01-01', L), shift('2026-01-01', -L), shift('2026-01-01', -3 * L)]) {
    const qids = cycleQids(start);
    assert.equal(new Set(qids).size, L, start);
    assert.deepEqual([...qids].sort(), BANK.map(b => b.id), start);
  }
  assert.notDeepEqual(cycleQids('2026-01-01'), cycleQids(shift('2026-01-01', L)), 'each cycle is shuffled differently');
  assert.doesNotThrow(() => bankFor('1999-12-31'));
});

test('a custom question replaces the bank question on its day only', () => {
  const custom = [item('abc', '2026-10-10', { text: '  What song is stuck in your head?  ', by: 'Zhenzhen' })];
  assert.deepEqual(forDay('2026-10-10', custom), { qid: 'c:abc', cat: 'custom', text: 'What song is stuck in your head?', by: 'Zhenzhen' });
  assert.deepEqual(forDay('2026-10-09', custom), bankFor('2026-10-09'));
  assert.deepEqual(forDay('2026-10-11', custom), bankFor('2026-10-11'));
  assert.deepEqual(forDay('2026-10-10'), bankFor('2026-10-10'));
  assert.equal(forDay('2026-10-10', [item('x', '2026-10-10', { by: undefined })]).by, '');
  assert.equal(forDay('2026-13-01', custom), null);
});

test('questions booked on the same day cascade to the following days', () => {
  assert.deepEqual(ons([item('a', '2026-10-10', { createdAt: 1 }), item('b', '2026-10-10', { createdAt: 2 })]), { a: '2026-10-10', b: '2026-10-11' });
  const three = [item('c', '2026-10-10', { createdAt: 3 }), item('a', '2026-10-10', { createdAt: 1 }), item('b', '2026-10-10', { createdAt: 2 })];
  assert.deepEqual(ons(three), { a: '2026-10-10', b: '2026-10-11', c: '2026-10-12' });
  assert.deepEqual(ons([...three].reverse()), ons(three));
  assert.equal(forDay('2026-10-12', three).qid, 'c:c');
  // a question already booked on the next day is pushed along too
  const busy = [item('x', '2026-10-11', { createdAt: 0 }), item('a', '2026-10-10', { createdAt: 5 }), item('b', '2026-10-10', { createdAt: 6 })];
  assert.deepEqual(ons(busy), { a: '2026-10-10', b: '2026-10-11', x: '2026-10-12' });
  // month ends roll over
  assert.deepEqual(ons([item('a', '2026-12-31'), item('b', '2026-12-31', { createdAt: 2 })]), { a: '2026-12-31', b: '2027-01-01' });
});

test('ties on date and creation time are broken by id, regardless of input order', () => {
  const list = [item('b', '2026-10-10'), item('a', '2026-10-10'), item('c', '2026-10-10', { createdAt: undefined })];
  assert.deepEqual(schedule(list).map(s => [s.q.id, s.on]), [['c', '2026-10-10'], ['a', '2026-10-11'], ['b', '2026-10-12']]);
  assert.deepEqual(schedule([...list].reverse()).map(s => [s.q.id, s.on]), schedule(list).map(s => [s.q.id, s.on]));
  assert.equal(schedule(list)[0].q, list[2], 'keeps the original item');
});

test('invalid custom questions are ignored', () => {
  const list = [null, 'text', item(undefined, '2026-10-10'), item('', '2026-10-10'), item('bad', '2026-02-30'), item('nodate', undefined),
    item('blank', '2026-10-10', { text: '   ' }), item('notext', '2026-10-10', { text: undefined }), item('ok', '2026-10-10')];
  assert.deepEqual(schedule(list).map(s => s.q.id), ['ok']);
  assert.deepEqual(schedule(undefined), []);
  assert.deepEqual(schedule(null), []);
  assert.deepEqual(forDay('2026-02-30', list), null);
});

test('schedule reflects in-place changes to the same list', () => {
  const list = [item('a', '2026-10-10')];
  assert.equal(schedule(list).length, 1);
  list.push(item('b', '2026-10-10', { createdAt: 2 }));
  assert.deepEqual(ons(list), { a: '2026-10-10', b: '2026-10-11' });
  list[1] = item('b', '2026-10-20');
  assert.deepEqual(ons(list), { a: '2026-10-10', b: '2026-10-20' });
});

test('the next free day skips days taken by custom questions, including bumped ones', () => {
  const list = [item('a', '2026-10-10', { createdAt: 1 }), item('b', '2026-10-10', { createdAt: 2 }), item('c', '2026-10-13')];
  assert.equal(nextFreeDay('2026-10-09', list), '2026-10-09');
  assert.equal(nextFreeDay('2026-10-10', list), '2026-10-12');
  assert.equal(nextFreeDay('2026-10-11', list), '2026-10-12');
  assert.equal(nextFreeDay('2026-10-13', list), '2026-10-14');
  assert.equal(nextFreeDay('2026-10-10'), '2026-10-10');
  assert.equal(nextFreeDay('nope', list), null);
});
