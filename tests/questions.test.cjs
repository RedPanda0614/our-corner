const test = require('node:test');
const assert = require('node:assert/strict');
const { CATEGORIES, BANK, MOODS, WEEKLY, BANK_SIZES, WEEKLY_SIZES, bankFor, bankIndex, schedule, forDay, nextFreeDay, weekOf, forWeek, weekIndex } = require('../questions.js');

const DAY = 864e5;
const shift = (iso, n) => new Date(Date.parse(iso) + n * DAY).toISOString().slice(0, 10);
const cycleQids = start => Array.from({ length: BANK.length }, (_, i) => bankFor(shift(start, i)).qid);
const item = (id, date, extra = {}) => ({ id, date, text: `Question ${id}?`, by: 'Sijie', createdAt: 1, ...extra });
const ons = list => Object.fromEntries(schedule(list).map(s => [s.q.id, s.on]));
const DASH = /[\u2013\u2014]/;
const wellFormed = (x, label) => {
  assert.ok(x.en.trim() && x.en.endsWith('?'), `${label} en`);
  assert.ok(x.zh.trim() && /[一-鿿]/.test(x.zh) && x.zh.endsWith('？'), `${label} zh`);
  assert.doesNotMatch(x.zh, /[,.?!:;()]/, `${label} zh uses full-width punctuation`);
  assert.doesNotMatch(x.en + x.zh, DASH, `${label} has a dash`);
  assert.ok(x.en.length <= 130, `${label} en is too long`);
};

test('the bank has 360 well-formed bilingual questions', () => {
  assert.equal(BANK.length, 360);
  assert.deepEqual(BANK.map(b => b.id), Array.from({ length: 360 }, (_, i) => 'q' + String(i + 1).padStart(3, '0')));
  const perCat = {};
  for (const b of BANK) {
    assert.match(b.id, /^q\d{3}$/);
    assert.ok(Object.hasOwn(CATEGORIES, b.cat) && b.cat !== 'custom' && b.cat !== 'checkin', `${b.id} category ${b.cat}`);
    perCat[b.cat] = (perCat[b.cat] || 0) + 1;
    wellFormed(b, b.id);
    if (b.cat === 'wyr') {
      assert.match(b.en, /^Would you rather .+ or .+\?$/, `${b.id} wyr en`);
      assert.match(b.zh, /^你更想.+还是.+？$/, `${b.id} wyr zh`);
    }
  }
  assert.deepEqual(perCat, { fun: 45, deep: 45, memory: 45, wyr: 45, know: 45, future: 45, week: 30, childhood: 30, food: 30 });
  assert.equal(new Set(BANK.map(b => b.id)).size, 360);
  assert.equal(new Set(BANK.map(b => b.en.toLowerCase())).size, 360);
  assert.equal(new Set(BANK.map(b => b.zh)).size, 360);
});

// Append-only guard. Answers point at question ids, so q001..q180 must never change. This is an FNV-1a hash of
// `id|cat|en|zh` for each of them, joined by '\n'. If it fails, an existing question was edited, reordered or
// removed: put it back and add new questions at the end instead. Do not update the expected hash.
test('the original 180 questions are unchanged (append-only)', () => {
  const fnv1a = s => {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
  };
  assert.equal(fnv1a(BANK.slice(0, 180).map(b => [b.id, b.cat, b.en, b.zh].join('|')).join('\n')), 'a6a6840f');
});

test('every category has bilingual labels, including custom and weekly check-in questions', () => {
  for (const key of ['fun', 'deep', 'memory', 'wyr', 'know', 'future', 'week', 'childhood', 'food', 'checkin', 'custom']) {
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

test('asking never gives away a day the other person booked: mine keeps its day, the schedule moves it on when shown', () => {
  // Zhenzhen books Oct 10 first. Sijie's ask form only looks at Sijie's own bookings (none yet).
  const theirs = item('a', '2026-10-10', { by: 'Zhenzhen', createdAt: 1 }), own = list => list.filter(q => q.by === 'Sijie');
  assert.equal(nextFreeDay('2026-10-10', own([theirs])), '2026-10-10', 'the default date and the saved date are the day picked');
  const mine = item('b', '2026-10-10', { by: 'Sijie', createdAt: 2 }), all = [theirs, mine];
  assert.deepEqual(schedule(own(all)).map(s => [s.q.id, s.on]), [['b', '2026-10-10']], 'the waiting list shows the day picked');
  // the real schedule (delivery, the inbox, the other person's view) delivers the later booking the next free day
  assert.deepEqual(ons(all), { a: '2026-10-10', b: '2026-10-11' });
  assert.deepEqual([forDay('2026-10-10', all).qid, forDay('2026-10-11', all).qid], ['c:a', 'c:b']);
  // a clash with one of your own still moves on (and the form says so)
  assert.equal(nextFreeDay('2026-10-10', own(all)), '2026-10-11');
});

// ---------- weekly check-in ----------
const shiftWeeks = (iso, n) => shift(iso, 7 * n);
const MONDAY = '2026-01-05';

test('moods run from sunny to stormy', () => {
  assert.deepEqual(MOODS, [
    { v: 5, glyph: '☀️', en: 'Sunny', zh: '晴' },
    { v: 4, glyph: '🌤️', en: 'Mostly sunny', zh: '多云转晴' },
    { v: 3, glyph: '☁️', en: 'Cloudy', zh: '多云' },
    { v: 2, glyph: '🌧️', en: 'Rainy', zh: '小雨' },
    { v: 1, glyph: '⛈️', en: 'Stormy', zh: '雷阵雨' }
  ]);
});

test('the weekly pool has 26 well-formed bilingual prompts', () => {
  assert.equal(WEEKLY.length, 26);
  assert.deepEqual(WEEKLY.map(w => w.id), Array.from({ length: 26 }, (_, i) => 'w' + String(i + 1).padStart(2, '0')));
  for (const w of WEEKLY) {
    assert.deepEqual(Object.keys(w), ['id', 'en', 'zh'], w.id);
    wellFormed(w, w.id);
  }
  assert.equal(new Set(WEEKLY.map(w => w.en.toLowerCase())).size, 26);
  assert.equal(new Set(WEEKLY.map(w => w.zh)).size, 26);
  const daily = new Set(BANK.flatMap(b => [b.en.toLowerCase(), b.zh]));
  for (const w of WEEKLY) assert.ok(!daily.has(w.en.toLowerCase()) && !daily.has(w.zh), `${w.id} repeats a daily question`);
});

test('weekOf finds the Monday of a Monday to Sunday week', () => {
  assert.equal(weekOf('2026-01-05'), '2026-01-05', 'a Monday is its own week');
  assert.equal(weekOf('2026-01-11'), '2026-01-05', 'Sunday belongs to the Monday before');
  assert.equal(weekOf('2026-01-07'), '2026-01-05');
  assert.equal(weekOf('2026-01-12'), '2026-01-12');
  assert.equal(weekOf('2026-01-01'), '2025-12-29', 'across a year boundary');
  assert.equal(weekOf('2027-01-03'), '2026-12-28');
  assert.equal(weekOf('2026-03-01'), '2026-02-23', 'across a month boundary');
  assert.equal(weekOf('2024-03-03'), '2024-02-26', 'across a leap day');
  for (const bad of ['', '2026-02-30', 'nope', '2026-1-5', null, undefined, 20260105]) assert.equal(weekOf(bad), null);
});

test('the weekly prompt is the same all week and deterministic', () => {
  for (const mon of [MONDAY, '2026-09-21', '2025-12-29', '2019-07-01']) {
    const q = forWeek(mon);
    assert.deepEqual(Object.keys(q), ['qid', 'cat', 'en', 'zh']);
    assert.equal(q.cat, 'checkin');
    const w = WEEKLY.find(x => x.id === q.qid);
    assert.deepEqual(q, { qid: w.id, cat: 'checkin', en: w.en, zh: w.zh });
    for (let d = 0; d < 7; d++) assert.deepEqual(forWeek(shift(mon, d)), q, `${mon} + ${d}`);
    assert.notEqual(forWeek(mon), forWeek(mon), 'returns a fresh copy');
  }
  const weeks = Array.from({ length: 10 }, (_, i) => forWeek(shiftWeeks(MONDAY, i)).qid);
  assert.ok(new Set(weeks).size > 1, 'different weeks get different prompts');
  for (const bad of ['', '2026-02-30', 'nope', null, undefined]) assert.equal(forWeek(bad), null);
});

test('no weekly prompt repeats within a cycle, before or after 2026', () => {
  const L = WEEKLY.length;
  const cycle = start => Array.from({ length: L }, (_, i) => forWeek(shiftWeeks(start, i)).qid);
  for (const k of [0, 1, 2, -1, -3]) {
    const qids = cycle(shiftWeeks(MONDAY, k * L));
    assert.deepEqual([...qids].sort(), WEEKLY.map(w => w.id), `cycle ${k}`);
  }
  assert.notDeepEqual(cycle(MONDAY), cycle(shiftWeeks(MONDAY, L)), 'each cycle is shuffled differently');
});

test('a weekly prompt never comes back within 4 weeks, even across cycle boundaries', () => {
  const L = WEEKLY.length, gap = Math.min(4, Math.floor(L / 3));
  const seen = new Map();
  for (let i = -3 * L; i < 5 * L; i++) {
    const qid = forWeek(shiftWeeks(MONDAY, i)).qid;
    if (seen.has(qid)) assert.ok(i - seen.get(qid) > gap, `${qid} repeats after ${i - seen.get(qid)} weeks`);
    seen.set(qid, i);
  }
});

// ---------- size tables: questions appended later only rotate in from their own row's day ----------
const fnv1a = s => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
};
const range = (from, to, step = 1) => { const out = []; for (let d = from; d <= to; d = shift(d, step)) out.push(d); return out; };

// Every day's built-in question and every week's prompt from 2019 to 2032, hashed as they were before the size
// tables existed. If it fails, a day's question moved: put the old mapping back. Do not update the expected hash.
test('the size tables keep every day and week on the question it always had', () => {
  assert.equal(fnv1a(range('2019-01-01', '2032-12-31').map(d => bankFor(d).qid).join(',')), '50e2a81c');
  assert.equal(fnv1a(range('2019-01-07', '2032-12-27', 7).map(d => forWeek(d).qid).join(',')), '21335491');
});

test('the size tables are append-only and cover the whole bank and pool', () => {
  for (const [table, list, label] of [[BANK_SIZES, BANK, 'BANK_SIZES'], [WEEKLY_SIZES, WEEKLY, 'WEEKLY_SIZES']]) {
    assert.deepEqual(table[0], label === 'BANK_SIZES' ? { from: '2026-01-01', size: 360 } : { from: '2026-01-05', size: 26 }, `${label}: the first row never changes`);
    table.forEach((row, i) => {
      assert.equal(bankFor(row.from) === null, false, `${label}[${i}].from is a real date`);
      if (label === 'WEEKLY_SIZES') assert.equal(weekOf(row.from), row.from, `${label}[${i}] starts on a Monday`);
      if (i) assert.ok(row.from > table[i - 1].from && row.size > table[i - 1].size, `${label}[${i}] comes after the row before and is bigger`);
      assert.ok(row.size <= list.length, `${label}[${i}].size fits the list`);
    });
    // appended questions need a row of their own, or they would never be asked
    assert.equal(table[table.length - 1].size, list.length, `${label}: add a row for the questions appended last`);
  }
});

test('appending a question only changes days on or after its row', () => {
  const FROM = '2027-03-01', grown = [...BANK_SIZES, { from: FROM, size: BANK.length + 1 }];
  for (const d of range('2019-01-01', shift(FROM, -1))) assert.equal(bankIndex(d, grown), bankIndex(d), d);
  // from then on the new question is in the rotation: a full cycle of the new size, no repeats, and nothing back
  // within 30 days, across the row boundary too
  const cycle = range(FROM, shift(FROM, BANK.length)).map(d => bankIndex(d, grown));
  assert.equal(new Set(cycle).size, BANK.length + 1);
  assert.ok(cycle.includes(BANK.length));
  const around = range(shift(FROM, -400), shift(FROM, 3 * (BANK.length + 1))).map(d => bankIndex(d, grown)), last = new Map();
  around.forEach((i, n) => { if (last.has(i)) assert.ok(n - last.get(i) > 30, `${i} back after ${n - last.get(i)} days`); last.set(i, n); });
  assert.notDeepEqual(range(FROM, shift(FROM, 60)).map(d => bankIndex(d, grown)), range(FROM, shift(FROM, 60)).map(d => bankIndex(d)), 'the new row takes effect');
  // a second row later on: the days of the first added row stay as they were
  const twice = [...grown, { from: '2028-01-03', size: BANK.length + 5 }];
  for (const d of range('2019-01-01', '2028-01-02')) assert.equal(bankIndex(d, twice), bankIndex(d, grown), d);
});

test('appending a weekly prompt only changes weeks on or after its row', () => {
  const FROM = '2027-03-01', grown = [...WEEKLY_SIZES, { from: FROM, size: WEEKLY.length + 1 }];
  for (const d of range('2018-12-31', shift(FROM, -7), 7)) assert.equal(weekIndex(d, grown), weekIndex(d), d);
  for (let k = 0; k < 7; k++) assert.equal(weekIndex(shift(FROM, k), grown), weekIndex(FROM, grown), 'the same all week');
  const cycle = range(FROM, shift(FROM, 7 * WEEKLY.length), 7).map(d => weekIndex(d, grown));
  assert.equal(new Set(cycle).size, WEEKLY.length + 1);
  const around = range(shift(FROM, -7 * 60), shift(FROM, 7 * 90), 7).map(d => weekIndex(d, grown)), last = new Map();
  around.forEach((i, n) => { if (last.has(i)) assert.ok(n - last.get(i) > 4, `${i} back after ${n - last.get(i)} weeks`); last.set(i, n); });
});
