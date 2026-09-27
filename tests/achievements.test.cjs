process.env.TZ = 'Asia/Shanghai';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const A = require('../achievements.js');
const Q = require('../questions.js');
const { DEFS, evaluate, LUNAR_NEW_YEAR } = A;

const DAY = 864e5;
const SJ = '斯婕', ZZ = '真真';
const TODAY = '2026-09-27';
const L = (y, m, d, h = 12, mi = 0, s = 0) => new Date(y, m - 1, d, h, mi, s).getTime();
const run = (data, opts = {}) => evaluate(data, { today: TODAY, Q, ...opts });
const pick = (data, id, opts) => run(data, opts).find(r => r.id === id);
const earnedIds = (data, opts) => run(data, opts).filter(r => r.earned).map(r => r.id);
const DASH = /[\u2013\u2014]/;

let seq = 0;
const nid = p => `${p}${String(++seq).padStart(4, '0')}`;
const entry = (at, x = {}) => ({ id: nid('e'), author: SJ, text: 'hello', date: '2026-01-01', tags: [], photoIds: [], comments: [], createdAt: at, ...x });
const photo = (at, x = {}) => ({ id: nid('p'), author: SJ, date: '2026-01-01', createdAt: at, ...x });
const answer = (date, author, at, text = 'ok', x = {}) => ({ id: `${date}:${author === SJ ? 'sijie' : 'zhenzhen'}`, date, q: { qid: 'q001', cat: 'fun' }, author, text, createdAt: at, ...x });
const both = (date, at, qid = 'q001', texts = ['yes', 'no']) => [
  answer(date, SJ, at, texts[0], { q: { qid } }), answer(date, ZZ, at + 1000, texts[1], { q: { qid } })
];
const deepFreeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };

const IDS = [
  'first-entry', 'first-photo', 'first-reply', 'first-trip', 'first-wish', 'first-task', 'first-answered', 'first-asked',
  'first-special-day', 'first-album', 'first-plan',
  'diary-10', 'diary-50', 'diary-100', 'diary-250', 'photos-50', 'photos-200', 'photos-500', 'trips-3', 'trips-10',
  'wishes-5', 'wishes-20', 'tasks-10', 'tasks-50', 'answers-10', 'answers-50', 'answers-100', 'replies-25', 'replies-100', 'deck-all',
  'secret-night-owl', 'secret-early-bird', 'secret-anniversary', 'secret-birthday', 'secret-seasons', 'secret-mind-reader',
  'secret-520', 'secret-new-year', 'secret-lunar-new-year', 'secret-nine-grid', 'secret-time-letter'
];
const GOALS = {
  'diary-10': 10, 'diary-50': 50, 'diary-100': 100, 'diary-250': 250, 'photos-50': 50, 'photos-200': 200, 'photos-500': 500,
  'trips-3': 3, 'trips-10': 10, 'wishes-5': 5, 'wishes-20': 20, 'tasks-10': 10, 'tasks-50': 50,
  'answers-10': 10, 'answers-50': 50, 'answers-100': 100, 'replies-25': 25, 'replies-100': 100, 'deck-all': Q.BANK.length
};
const FIELDS = ['id', 'cat', 'glyph', 'en', 'zh', 'desc', 'series', 'tier', 'earned', 'at', 'target', 'progress', 'visible'];

test('module shape: stable unique ids, bilingual, no dashes, valid categories and tiers', () => {
  assert.deepEqual(Object.keys(A).sort(), ['DEFS', 'LUNAR_NEW_YEAR', 'evaluate']);
  assert.deepEqual(DEFS.map(d => d.id), IDS);
  assert.equal(new Set(DEFS.map(d => d.id)).size, DEFS.length);
  const cjk = /[一-鿿]/;
  const bilingual = (o, what) => {
    assert.ok(o && typeof o.en === 'string' && o.en.trim() && typeof o.zh === 'string' && cjk.test(o.zh), what);
  };
  const tiers = {};
  for (const d of DEFS) {
    assert.ok(['firsts', 'totals', 'secret'].includes(d.cat), d.id);
    assert.ok(typeof d.glyph === 'string' && [...d.glyph].length >= 1 && [...d.glyph].length <= 2, `${d.id} glyph`);
    bilingual(d, `${d.id} title`);
    assert.ok(d.en.length <= 24, `${d.id} title is short`);
    bilingual(d.desc, `${d.id} desc`);
    if (d.cat === 'firsts') {
      bilingual(d.invite, `${d.id} invite`);
      assert.match(d.invite.en, /^Someday: /, `${d.id} invite reads as an invitation`);
      assert.doesNotMatch(d.desc.en, /^Someday/, `${d.id} desc`);
    }
    if (d.cat === 'totals') {
      assert.ok(typeof d.series === 'string' && d.series, `${d.id} series`);
      assert.ok(Number.isInteger(d.tier) && d.tier >= 1, `${d.id} tier`);
      (tiers[d.series] ||= []).push(d.tier);
    } else {
      assert.equal(d.series, undefined, `${d.id} series`);
      assert.equal(d.tier, undefined, `${d.id} tier`);
    }
  }
  for (const [series, list] of Object.entries(tiers)) assert.deepEqual(list, list.map((_, i) => i + 1), `${series} tiers run 1..n in order`);
  assert.deepEqual(Object.keys(tiers), ['diary', 'photos', 'trips', 'wishes', 'tasks', 'answers', 'replies', 'deck']);
  assert.doesNotMatch(JSON.stringify(DEFS), DASH);
  const src = fs.readFileSync(path.join(__dirname, '..', 'achievements.js'), 'utf8');
  assert.doesNotMatch(src, DASH, 'no en or em dashes in the source');
  assert.deepEqual([...LUNAR_NEW_YEAR], ['2026-02-17', '2027-02-06', '2028-01-26', '2029-02-13', '2030-02-03']);
  assert.ok(Object.isFrozen(DEFS) && Object.isFrozen(DEFS[0]) && Object.isFrozen(DEFS[0].desc) && Object.isFrozen(LUNAR_NEW_YEAR));
});

test('with no data nothing is earned, firsts invite, each series shows only its first tier, secrets stay hidden', () => {
  for (const data of [{}, undefined, null, { diary: [], photos: [], answers: [], questions: [] }]) {
    const res = evaluate(data, { today: TODAY, Q });
    assert.deepEqual(res.map(r => r.id), IDS);
    for (const r of res) {
      assert.deepEqual(Object.keys(r), FIELDS, r.id);
      assert.equal(r.earned, false, r.id);
      assert.equal(r.at, null, r.id);
      assert.equal(r.target, null, r.id);
      if (r.cat === 'firsts') {
        assert.equal(r.visible, true, r.id);
        assert.equal(r.progress, null, r.id);
        assert.match(r.desc.en, /^Someday: /, r.id);
        assert.equal(r.series, null);
        assert.equal(r.tier, null);
      } else if (r.cat === 'secret') {
        assert.equal(r.visible, false, r.id);
        assert.equal(r.progress, null, r.id);
      } else {
        assert.equal(r.visible, r.tier === 1, `${r.id} visible only as the first tier`);
        assert.deepEqual(r.progress, { n: 0, of: GOALS[r.id] }, r.id);
      }
    }
  }
});

test('each first picks the earliest qualifying item and points at it', () => {
  const d1 = entry(L(2026, 3, 1), { id: 'd1' }), d2 = entry(L(2026, 3, 2), { id: 'd2' });
  d2.comments = [{ id: 'c1', author: ZZ, text: 'aw', at: L(2026, 3, 9) }];
  const d3 = entry(L(2026, 2, 20), { id: 'd3', author: ZZ, comments: [{ id: 'c2', author: SJ, text: 'hehe', at: L(2026, 3, 5) }] });
  const data = {
    diary: [d2, d1, d3],
    photos: [photo(L(2026, 4, 2), { id: 'p2' }), photo(L(2026, 4, 1), { id: 'p1', entryId: 'd1' })],
    albums: [{ id: 'a2', title: 'B', by: ZZ, createdAt: L(2026, 5, 2) }, { id: 'a1', title: 'A', by: SJ, createdAt: L(2026, 5, 1) }],
    events: [{ id: 'v2', title: 'x', by: SJ, kind: 'plan', date: '2026-07-01', createdAt: L(2026, 6, 2) }, { id: 'v1', title: 'y', by: ZZ, kind: 'plan', date: '2026-08-01', createdAt: L(2026, 6, 1) }],
    trips: [{ id: 't2', status: 'visited', createdAt: L(2026, 6, 20) }, { id: 't1', status: 'visited', createdAt: L(2026, 6, 10) }],
    wishes: [{ id: 'w2', got: true, createdAt: L(2026, 7, 2) }, { id: 'w1', got: true, createdAt: L(2026, 7, 1) }],
    tasks: [{ id: 'k2', done: true, createdAt: L(2026, 7, 4) }, { id: 'k1', done: true, createdAt: L(2026, 7, 3) }],
    dates: [{ id: 's2', title: 'x', by: SJ, kind: 'holiday', date: '2026-12-25', repeat: true, createdAt: L(2026, 8, 2) }, { id: 's1', title: 'y', by: ZZ, kind: 'birthday', date: '1999-01-01', repeat: true, createdAt: L(2026, 8, 1) }],
    // the day completed first wins, even though another day comes earlier on the calendar
    answers: [...both('2026-03-04', L(2026, 3, 6)), ...both('2026-03-05', L(2026, 3, 5))],
    questions: [{ id: 'cq1', date: '2026-04-10', text: 'Q one?', by: ZZ, createdAt: L(2026, 4, 1) }, { id: 'cq2', date: '2026-04-02', text: 'Q two?', by: SJ, createdAt: L(2026, 4, 1, 13) }]
  };
  const res = Object.fromEntries(run(data).map(r => [r.id, r]));
  const is = (id, at, target) => {
    assert.equal(res[id].earned, true, id);
    assert.equal(res[id].at, at, id);
    assert.deepEqual(res[id].target, target, id);
    assert.doesNotMatch(res[id].desc.en, /^Someday/, `${id} celebrates once earned`);
  };
  is('first-entry', L(2026, 2, 20), { col: 'diary', id: 'd3' });
  is('first-photo', L(2026, 4, 1), { col: 'photos', id: 'p1' });
  is('first-reply', L(2026, 3, 5), { col: 'diary', id: 'd3' });
  is('first-trip', L(2026, 6, 10), { col: 'trips', id: 't1' });
  is('first-wish', L(2026, 7, 1), { col: 'wishes', id: 'w1' });
  is('first-task', L(2026, 7, 3), { col: 'tasks', id: 'k1' });
  is('first-answered', L(2026, 3, 5) + 1000, { question: '2026-03-05' });
  is('first-asked', L(2026, 4, 2, 0, 0), { question: '2026-04-02' });
  is('first-special-day', L(2026, 8, 1), { col: 'dates', id: 's1' });
  is('first-album', L(2026, 5, 1), { col: 'albums', id: 'a1' });
  is('first-plan', L(2026, 6, 1), { col: 'events', id: 'v1' });
});

test('only a reply to the other person counts as a reply', () => {
  const e = entry(L(2026, 3, 1), { id: 'mine', comments: [
    { id: 'c1', author: SJ, text: 'me again', at: L(2026, 3, 2) },
    { id: 'c2', author: '', text: 'who?', at: L(2026, 3, 3) },
    { id: 'c3', author: ZZ, text: 'love it', at: L(2026, 3, 4) }
  ] });
  const r = pick({ diary: [e] }, 'first-reply');
  assert.equal(r.at, L(2026, 3, 4));
  assert.deepEqual(r.target, { col: 'diary', id: 'mine' });
  assert.deepEqual(pick({ diary: [e] }, 'replies-25').progress, { n: 1, of: 25 });
  const own = { ...e, comments: e.comments.slice(0, 2) };
  assert.equal(pick({ diary: [own] }, 'first-reply').earned, false);
  assert.equal(pick({ diary: [{ ...e, comments: undefined }] }, 'first-reply').earned, false);
});

test('trips, wishes and little things count from the moment they were ticked', () => {
  const T0 = L(2026, 1, 1), T1 = L(2026, 2, 1), T2 = L(2026, 3, 1);
  const changed = { id: 'b', status: 'visited', createdAt: T0, updatedAt: T2, updatedWhat: 'status' };
  assert.equal(pick({ trips: [changed] }, 'first-trip').at, T2);
  const born = { id: 'a', status: 'visited', createdAt: T1 };
  assert.equal(pick({ trips: [changed, born] }, 'first-trip').at, T1, 'created as visited uses createdAt');
  assert.deepEqual(pick({ trips: [changed, born] }, 'first-trip').target, { col: 'trips', id: 'a' });
  const retitled = { id: 'c', status: 'visited', createdAt: T0, updatedAt: T2, updatedWhat: 'title,note' };
  assert.equal(pick({ trips: [retitled] }, 'first-trip').at, T0, 'an unrelated edit falls back to createdAt');
  assert.equal(pick({ trips: [{ id: 'd', status: 'planning', createdAt: T0, updatedAt: T1, updatedWhat: 'status' }] }, 'first-trip').earned, false);

  assert.equal(pick({ tasks: [{ id: 'k', done: false, createdAt: T0, updatedAt: T1, updatedWhat: 'done' }] }, 'first-task').earned, false, 'unticked');
  assert.equal(pick({ tasks: [{ id: 'k', done: 'yes', createdAt: T0 }] }, 'first-task').earned, false);
  assert.equal(pick({ tasks: [{ id: 'k', done: true, createdAt: T0, updatedAt: T1, updatedWhat: 'done' }] }, 'first-task').at, T1);
  assert.equal(pick({ wishes: [{ id: 'w', got: false, createdAt: T0, updatedAt: T1, updatedWhat: 'got' }] }, 'first-wish').earned, false, 'unticked');
  assert.equal(pick({ wishes: [{ id: 'w', got: true, createdAt: T0, updatedAt: T2, updatedWhat: 'got' }] }, 'first-wish').at, T2);
  assert.equal(pick({ wishes: [{ id: 'w', got: true, createdAt: T0, updatedAt: T2 }] }, 'first-wish').at, T0, 'no updatedWhat falls back');
});

test('a daily question counts once both of us answered it, at the later first answer', () => {
  const D = '2026-05-01';
  assert.equal(pick({ answers: [answer(D, SJ, L(2026, 5, 1, 9))] }, 'first-answered').earned, false, 'one-sided');
  const twice = [answer(D, SJ, L(2026, 5, 1, 9)), answer(D, SJ, L(2026, 5, 1, 10), 'again', { id: 'dup' })];
  assert.equal(pick({ answers: twice }, 'first-answered').earned, false, 'the same person twice');
  const pair = [answer(D, SJ, L(2026, 5, 2, 8)), answer(D, ZZ, L(2026, 5, 1, 21))];
  const r = pick({ answers: pair }, 'first-answered');
  assert.equal(r.at, L(2026, 5, 2, 8), 'the later createdAt wins');
  assert.deepEqual(r.target, { question: D });
  const edited = [pair[0], { ...pair[1], text: 'changed', updatedAt: L(2026, 6, 1) }];
  assert.equal(pick({ answers: edited }, 'first-answered').at, L(2026, 5, 2, 8), 'editing never moves it');
  const untimed = [pair[0], { ...pair[1], createdAt: undefined }];
  assert.equal(pick({ answers: untimed }, 'first-answered').earned, false);
  assert.equal(pick({ answers: [answer('2026-02-30', SJ, 1), answer('2026-02-30', ZZ, 2)] }, 'first-answered').earned, false, 'invalid day');
});

test('the first question we asked each other opens on its day, at local midnight, without leaking its text', () => {
  const secretA = 'What is the dream you never told me?', secretB = 'Which song reminds you of us?';
  const questions = [
    { id: 'c2', date: '2026-10-01', text: secretB, by: SJ, createdAt: 2 },
    { id: 'c1', date: '2026-10-01', text: secretA, by: ZZ, createdAt: 1 },
    { id: 'blank', date: '2026-09-01', text: '   ', by: ZZ, createdAt: 0 }
  ];
  assert.deepEqual(Q.schedule(questions).map(s => [s.q.id, s.on]), [['c1', '2026-10-01'], ['c2', '2026-10-02']], 'the clash is bumped');
  const locked = pick({ questions }, 'first-asked', { today: '2026-09-30' });
  assert.equal(locked.earned, false);
  assert.match(locked.desc.en, /^Someday: /);
  const res = run({ questions }, { today: '2026-10-01' });
  const r = res.find(x => x.id === 'first-asked');
  assert.equal(r.earned, true);
  assert.equal(r.at, L(2026, 10, 1, 0, 0));
  assert.equal(r.at, new Date(2026, 9, 1).getTime());
  assert.deepEqual(r.target, { question: '2026-10-01' });
  const json = JSON.stringify(res) + JSON.stringify(run({ questions }, { today: '2026-12-31' }));
  for (const s of [secretA, secretB, 'dream', 'song']) assert.ok(!json.includes(s), `no question text: ${s}`);
  // only the bumped question is left: it now keeps its own booked day
  assert.equal(pick({ questions: [questions[0]] }, 'first-asked', { today: '2026-10-01' }).at, L(2026, 10, 1, 0, 0));
  // without the questions module the custom first is skipped and the deck uses 360
  const noQ = evaluate({ questions }, { today: '2026-12-31', Q: null });
  assert.equal(noQ.find(x => x.id === 'first-asked').earned, false);
  assert.deepEqual(noQ.find(x => x.id === 'deck-all').progress, { n: 0, of: 360 });
  assert.deepEqual(evaluate({}, { today: TODAY }).find(x => x.id === 'deck-all').progress, { n: 0, of: 360 });
  // a bad today falls back to the real local day
  assert.equal(pick({ questions: [{ id: 'old', date: '2000-01-01', text: 'x?', by: SJ, createdAt: 1 }] }, 'first-asked', { today: 'nope' }).earned, true);
});

test('imported, seeded and unsigned plans or special days are not counted as added by hand', () => {
  const ev = (id, x) => ({ id, title: 't', kind: 'plan', date: '2026-10-01', by: SJ, createdAt: L(2026, 1, 1), ...x });
  const events = [ev('imp', { importKey: '["uid","2026-10-01"]' }), ev('seed-event-0'), ev('noby', { by: '' }), ev('spaces', { by: '  ' }), ev('str', { createdAt: '5' })];
  assert.equal(pick({ events }, 'first-plan').earned, false);
  const r = pick({ events: [...events, ev('hand', { createdAt: L(2026, 2, 1) })] }, 'first-plan');
  assert.equal(r.at, L(2026, 2, 1));
  assert.deepEqual(r.target, { col: 'events', id: 'hand' });
  const day = (id, x) => ({ id, title: 't', kind: 'anniversary', date: '2020-10-01', repeat: true, by: SJ, createdAt: L(2026, 1, 1), ...x });
  const dates = [day('imp', { importUIDs: ['u1'] }), day('key', { importKey: 'k' }), day('seed-date-1'), day('noby', { by: undefined }), day('nt', { createdAt: null })];
  assert.equal(pick({ dates }, 'first-special-day').earned, false);
  assert.deepEqual(pick({ dates: [...dates, day('hand', { createdAt: L(2026, 3, 3) })] }, 'first-special-day').target, { col: 'dates', id: 'hand' });
});

test('totals reach a tier at the Nth item, and only the next tier peeks out', () => {
  const make = n => Array.from({ length: n }, (_, i) => entry(L(2025, 1, 1) + i * DAY, { id: `t${String(i).padStart(3, '0')}` }));
  const nine = run({ diary: make(9).reverse() });
  const r9 = id => nine.find(r => r.id === id);
  assert.equal(r9('diary-10').earned, false);
  assert.deepEqual(r9('diary-10').progress, { n: 9, of: 10 });
  assert.equal(r9('diary-10').visible, true);
  assert.equal(r9('diary-50').visible, false);
  assert.equal(r9('diary-50').earned, false);

  const ten = make(10), res10 = run({ diary: [...ten].reverse() });
  const r10 = id => res10.find(r => r.id === id);
  assert.equal(r10('diary-10').earned, true);
  assert.equal(r10('diary-10').at, ten[9].createdAt);
  assert.deepEqual(r10('diary-10').target, { col: 'diary', id: ten[9].id });
  assert.equal(r10('diary-10').visible, true);
  assert.deepEqual(r10('diary-10').progress, { n: 10, of: 10 });
  assert.deepEqual([r10('diary-50').visible, r10('diary-50').earned], [true, false]);
  assert.deepEqual(r10('diary-50').progress, { n: 10, of: 50 });
  assert.deepEqual([r10('diary-100').visible, r10('diary-250').visible], [false, false]);

  const fifty = make(55), res50 = run({ diary: fifty });
  const r50 = id => res50.find(r => r.id === id);
  assert.deepEqual(['diary-10', 'diary-50', 'diary-100', 'diary-250'].map(id => [r50(id).earned, r50(id).visible]), [[true, true], [true, true], [false, true], [false, false]]);
  assert.equal(r50('diary-50').at, fifty[49].createdAt);
  // other series are independent
  assert.deepEqual([r50('photos-50').visible, r50('photos-200').visible], [true, false]);

  const days = Array.from({ length: 10 }, (_, i) => both(`2026-01-${String(i + 1).padStart(2, '0')}`, L(2026, 1, i + 1, 20)));
  const a10 = pick({ answers: days.flat() }, 'answers-10');
  assert.equal(a10.earned, true);
  assert.equal(a10.at, L(2026, 1, 10, 20) + 1000);
  assert.deepEqual(a10.target, { question: '2026-01-10' });
  const trips = [1, 2, 3].map(i => ({ id: 'tr' + i, status: 'visited', createdAt: L(2026, i, 1) }));
  assert.deepEqual(pick({ trips }, 'trips-3').target, { col: 'trips', id: 'tr3' });
  assert.deepEqual(pick({ trips }, 'trips-10').progress, { n: 3, of: 10 });
});

test('the whole deck counts distinct built-in questions from days we both answered', () => {
  const small = { schedule: Q.schedule, BANK: Q.BANK.slice(0, 3) };
  const base = [
    ...both('2026-01-01', L(2026, 1, 1), 'q001'),
    ...both('2026-01-02', L(2026, 1, 2), 'q002'),
    ...both('2026-01-03', L(2026, 1, 3), 'c:abc'),
    ...both('2026-01-04', L(2026, 1, 4), 'q001'),
    ...both('2026-01-06', L(2026, 1, 6), 'q999'),
    answer('2026-01-05', SJ, L(2026, 1, 5), 'solo', { q: { qid: 'q003' } })
  ];
  let r = pick({ answers: base }, 'deck-all', { Q: small });
  assert.deepEqual([r.earned, r.visible, r.progress], [false, true, { n: 2, of: 3 }]);
  // the question of a day is the one the first answer saw
  const mixed = [answer('2026-01-08', SJ, L(2026, 1, 8), 'a', { q: { qid: 'q002' } }), answer('2026-01-08', ZZ, L(2026, 1, 8, 13), 'b', { q: { qid: 'q003' } })];
  r = pick({ answers: [...base, ...mixed] }, 'deck-all', { Q: small });
  assert.deepEqual(r.progress, { n: 2, of: 3 });
  const done = [...base, ...mixed, ...both('2026-01-09', L(2026, 1, 9), 'q003'), ...both('2026-01-10', L(2026, 1, 10), 'q002')];
  r = pick({ answers: done }, 'deck-all', { Q: small });
  assert.equal(r.earned, true);
  assert.equal(r.at, L(2026, 1, 9) + 1000);
  assert.deepEqual(r.target, { question: '2026-01-09' });
  assert.deepEqual(r.progress, { n: 3, of: 3 });
  assert.deepEqual(pick({ answers: done }, 'deck-all').progress, { n: 3, of: Q.BANK.length });
});

test('night owls and early birds follow the local hour of createdAt', () => {
  const secrets = at => earnedIds({ diary: [entry(at)] }).filter(id => id === 'secret-night-owl' || id === 'secret-early-bird');
  assert.deepEqual(secrets(L(2026, 3, 3, 0, 0)), ['secret-night-owl']);
  assert.deepEqual(secrets(L(2026, 3, 3, 3, 59, 59)), ['secret-night-owl']);
  assert.deepEqual(secrets(L(2026, 3, 3, 4, 0)), []);
  assert.deepEqual(secrets(L(2026, 3, 3, 4, 59)), []);
  assert.deepEqual(secrets(L(2026, 3, 3, 5, 0)), ['secret-early-bird']);
  assert.deepEqual(secrets(L(2026, 3, 3, 6, 59)), ['secret-early-bird']);
  assert.deepEqual(secrets(L(2026, 3, 3, 7, 0)), []);
  assert.deepEqual(secrets(L(2026, 3, 3, 23, 59)), []);
  const r = pick({ diary: [entry(L(2026, 3, 3, 12)), entry(L(2026, 3, 4, 2), { id: 'owl' })] }, 'secret-night-owl');
  assert.deepEqual([r.visible, r.at, r.target], [true, L(2026, 3, 4, 2), { col: 'diary', id: 'owl' }]);
});

test('dates follow the local day of createdAt, never the backdated or edited date', () => {
  const at = Date.parse('2026-05-19T16:30:00Z');
  assert.equal(new Date(at).getUTCDate(), 19);
  const ids = earnedIds({ diary: [entry(at, { date: '2026-05-19' })] });
  assert.ok(ids.includes('secret-520'), 'Shanghai says May 20');
  assert.ok(ids.includes('secret-night-owl'));
  assert.ok(!earnedIds({ diary: [entry(Date.parse('2026-05-20T16:30:00Z'), { date: '2026-05-20' })] }).includes('secret-520'), 'already May 21 in Shanghai');
  assert.ok(!earnedIds({ diary: [entry(L(2026, 3, 3), { date: '2026-01-01' })] }).includes('secret-new-year'), 'a backdated date is ignored');
  assert.ok(!earnedIds({ diary: [entry(L(2025, 5, 19), { date: '2025-05-20', updatedAt: L(2025, 5, 20) })] }).includes('secret-520'), 'an edit is ignored');
  assert.ok(earnedIds({ diary: [entry(L(2027, 1, 1, 10))] }).includes('secret-new-year'));
  assert.ok(earnedIds({ diary: [entry(L(2027, 2, 6, 10))] }).includes('secret-lunar-new-year'));
  assert.ok(!earnedIds({ diary: [entry(L(2027, 2, 7, 10), { date: '2027-02-06' })] }).includes('secret-lunar-new-year'));
  const late = entry(L(2026, 3, 2), { id: 'late', date: '2020-01-01' }), early = entry(L(2026, 3, 1), { id: 'early', date: '2026-03-01' });
  assert.deepEqual(pick({ diary: [late, early] }, 'first-entry').target, { col: 'diary', id: 'early' });
});

test('anniversary pages match the special day, yearly or once', () => {
  const ann = (date, repeat, x = {}) => ({ id: 'an', title: 'us', kind: 'anniversary', date, repeat, by: SJ, createdAt: 1, ...x });
  const got = (dates, at) => earnedIds({ diary: [entry(at)], dates }).includes('secret-anniversary');
  assert.equal(got([ann('2024-06-01', true)], L(2026, 6, 1, 20)), true);
  assert.equal(got([ann('2024-06-01', true)], L(2024, 6, 1, 9)), true, 'the day itself counts');
  assert.equal(got([ann('2024-06-01', true)], L(2026, 6, 2)), false);
  assert.equal(got([ann('2024-06-01', false)], L(2026, 6, 1)), false, 'no repeat, another year');
  assert.equal(got([ann('2024-06-01', false)], L(2024, 6, 1, 9)), true, 'no repeat, the exact day');
  assert.equal(got([ann('2027-06-01', true)], L(2026, 6, 1)), false, 'before the original day');
  assert.equal(got([ann('2027-06-01', true)], L(2027, 6, 1)), true);
  for (const at of [L(2025, 2, 28), L(2026, 2, 28), L(2028, 2, 28), L(2028, 3, 1)]) assert.equal(got([ann('2024-02-29', true)], at), false, 'Feb 29, or Mar 1 without one');
  for (const at of [L(2025, 3, 1), L(2027, 3, 1), L(2028, 2, 29), L(2100, 3, 1)]) assert.equal(got([ann('2024-02-29', true)], at), true, 'Mar 1 stands in for Feb 29 in other years');
  assert.equal(got([ann('2024-03-01', true)], L(2028, 3, 1)), true, 'a real Mar 1 stays on Mar 1');
  assert.equal(got([ann('2024-06-01', true, { kind: 'birthday' })], L(2026, 6, 1)), false, 'birthdays are not anniversaries');
  assert.equal(got([ann('2024-06-01', true, { id: 'seed-x', importUIDs: ['u'], by: '' })], L(2026, 6, 1)), true, 'any source counts');
  assert.equal(got([ann('2024-06-31', true)], L(2026, 6, 30)), false);
  const r = pick({ diary: [entry(L(2027, 6, 1), { id: 'b' }), entry(L(2026, 6, 1), { id: 'a' })], dates: [ann('2024-06-01', true)] }, 'secret-anniversary');
  assert.deepEqual([r.at, r.target], [L(2026, 6, 1), { col: 'diary', id: 'a' }]);
  assert.doesNotMatch(r.en + r.desc.en, /\d+ (year|yr)/i);
});

test('birthday photos match on the photo day and count from when they were added', () => {
  const bd = (date, repeat) => ({ id: 'bd', title: 'Zhenzhen', kind: 'birthday', date, repeat, by: SJ, createdAt: 1 });
  const hit = (dates, photos) => pick({ dates, photos }, 'secret-birthday');
  let r = hit([bd('1998-03-14', true)], [photo(L(2026, 3, 20), { id: 'ph', date: '2026-03-14' }), photo(L(2026, 3, 14), { date: '2026-03-15' })]);
  assert.deepEqual([r.earned, r.at, r.target], [true, L(2026, 3, 20), { col: 'photos', id: 'ph' }]);
  assert.equal(hit([bd('1998-03-14', true)], [photo(undefined, { date: '2026-03-14' })]).earned, false, 'no createdAt');
  assert.equal(hit([bd('2026-07-07', false)], [photo(L(2027, 7, 7), { date: '2027-07-07' })]).earned, false);
  assert.equal(hit([bd('2026-07-07', false)], [photo(L(2026, 7, 8), { date: '2026-07-07' })]).earned, true);
  assert.equal(hit([{ ...bd('1998-03-14', true), kind: 'anniversary' }], [photo(L(2026, 3, 14), { date: '2026-03-14' })]).earned, false);
  assert.equal(hit([bd('2000-02-29', true)], [photo(L(2027, 3, 1), { date: '2027-03-01' })]).earned, true, 'a Feb 29 birthday is on Mar 1 in 2027');
  assert.equal(hit([bd('2000-02-29', true)], [photo(L(2027, 2, 28), { date: '2027-02-28' })]).earned, false);
  assert.equal(hit([bd('2000-02-29', true)], [photo(L(2028, 3, 1), { date: '2028-03-01' })]).earned, false, '2028 has its own Feb 29');
});

test('four seasons completes at the page that fills the last season', () => {
  const pages = [entry(L(2026, 7, 5)), entry(L(2025, 12, 5)), entry(L(2026, 4, 5)), entry(L(2026, 8, 5)), entry(L(2026, 2, 5))];
  assert.equal(pick({ diary: pages }, 'secret-seasons').earned, false);
  const autumn = entry(L(2026, 10, 5), { id: 'autumn' });
  const r = pick({ diary: [autumn, ...pages, entry(L(2027, 1, 5))] }, 'secret-seasons');
  assert.deepEqual([r.earned, r.visible, r.at, r.target], [true, true, L(2026, 10, 5), { col: 'diary', id: 'autumn' }]);
  const r2 = pick({ diary: [...pages, autumn, entry(L(2025, 9, 1))] }, 'secret-seasons');
  assert.equal(r2.at, L(2026, 7, 5), 'walks in time order, not list order: summer came last');
});

test('mind readers: the same answer after normalizing, earned when it first matched', () => {
  const D = '2026-06-01', T1 = L(2026, 6, 1, 9), T2 = L(2026, 6, 1, 21);
  const day = (a, b, xa = {}, xb = {}) => [answer(D, SJ, T1, a, xa), answer(D, ZZ, T2, b, xb)];
  const mind = answers => pick({ answers }, 'secret-mind-reader');
  let r = mind(day('Winter!', 'winter'));
  assert.deepEqual([r.earned, r.visible, r.at, r.target], [true, true, T2, { question: D }]);
  assert.equal(mind(day('ＷＩＮＴＥＲ', 'winter')).earned, true, 'full width');
  assert.equal(mind(day('冬天', '冬天！')).earned, true);
  assert.equal(mind(day('🙂🙂', '🙂🙂')).earned, false, 'emoji only');
  assert.equal(mind(day('A', 'a')).earned, false, 'too short');
  assert.equal(mind(day('summer', 'winter')).earned, false);
  assert.equal(mind(day('winter', 42)).earned, false);
  const T3 = L(2026, 6, 3);
  const edited = day('summer', 'Summer.', {}, { updatedAt: T3 });
  r = mind(edited);
  assert.equal(r.at, T3, 'a match made by an edit counts from the edit');
  assert.equal(pick({ answers: edited }, 'first-answered').at, T2, 'same page stays put');
  assert.equal(mind(day('summer', 'Summer', { updatedAt: L(2026, 6, 5) }, { updatedAt: T3 })).at, L(2026, 6, 5));
});

test('nine squares needs nine photos that still exist', () => {
  const pics = Array.from({ length: 10 }, (_, i) => photo(L(2026, 3, 1, 10, i), { id: `g${i}` }));
  pics[4] = { ...pics[4], createdAt: L(2026, 3, 2) };
  const page = ids => entry(L(2026, 3, 1, 12), { id: 'grid', photoIds: ids });
  const nine = pics.slice(0, 9).map(p => p.id);
  let r = pick({ diary: [page(nine)], photos: pics }, 'secret-nine-grid');
  assert.deepEqual([r.earned, r.at, r.target], [true, L(2026, 3, 2), { col: 'diary', id: 'grid' }]);
  assert.equal(pick({ diary: [page(nine.slice(0, 8))], photos: pics }, 'secret-nine-grid').earned, false);
  assert.equal(pick({ diary: [page(nine)], photos: pics.filter(p => p.id !== 'g0') }, 'secret-nine-grid').earned, false, 'one was deleted');
  assert.equal(pick({ diary: [page([...nine.slice(0, 8), 'g0'])], photos: pics }, 'secret-nine-grid').earned, false, 'a duplicate');
  r = pick({ diary: [page([...nine, 'g9'])], photos: pics.filter(p => p.id !== 'g0') }, 'secret-nine-grid');
  assert.equal(r.earned, true, 'nine left after a deletion');
  const early = pics.map(p => ({ ...p, createdAt: L(2026, 1, 1) }));
  assert.equal(pick({ diary: [page(nine)], photos: early }, 'secret-nine-grid').at, L(2026, 3, 1, 12), 'the page itself is later');
});

test('a letter back in time: a comment more than 365 days after the page was written', () => {
  const T = L(2025, 4, 1, 20);
  const page = at => entry(T, { id: 'old', date: '2025-04-01', comments: [{ id: 'c', author: ZZ, text: 'still true', at }] });
  assert.equal(pick({ diary: [page(T + 365 * DAY)] }, 'secret-time-letter').earned, false, 'exactly a year');
  const r = pick({ diary: [page(T + 365 * DAY + 1)] }, 'secret-time-letter');
  assert.deepEqual([r.earned, r.at, r.target], [true, T + 365 * DAY + 1, { col: 'diary', id: 'old' }]);
  const backdated = entry(L(2026, 4, 1), { id: 'bd', date: '2020-01-01', comments: [{ id: 'c', author: ZZ, text: 'hi', at: L(2026, 4, 2) }] });
  assert.equal(pick({ diary: [backdated] }, 'secret-time-letter').earned, false, 'the backdated date is ignored');
  const own = entry(T, { id: 'own', comments: [{ id: 'c', author: SJ, text: 'me, later', at: T + 400 * DAY }] });
  assert.equal(pick({ diary: [own] }, 'secret-time-letter').earned, true, 'any comment counts');
});

test('garbage input never throws', () => {
  const junk = [null, undefined, 'x', 42, true, [], () => 1, { id: {} }, { createdAt: 'soon' }, { createdAt: NaN }, { createdAt: Infinity }];
  const data = {
    diary: [...junk, { createdAt: 1, comments: 'nope', photoIds: 'abc' }, { createdAt: 2, comments: [null, 5, { at: 'x' }, { author: 7, at: 9 }], photoIds: [null, {}, 3] }],
    photos: 'nope', albums: 5, events: { a: 1 }, trips: junk, tasks: junk, wishes: junk,
    dates: [...junk, { kind: 'anniversary', date: null, repeat: true }, { kind: 'birthday', date: 20260101 }],
    answers: [...junk, { date: 5, author: SJ, createdAt: 1 }, { date: '2026-01-01', author: ['x'], createdAt: 1 }, { date: '2026-01-01', author: SJ, createdAt: 1, q: 'x', text: null }, { date: '2026-01-01', author: ZZ, createdAt: 2, q: null, text: {} }],
    questions: [...junk, { id: 'q', date: '2026-01-01', text: 5 }]
  };
  const optsList = [undefined, null, 'x', { today: 'bad', kept: 'x', Q: {} }, { today: 20260101, kept: null, Q: { schedule: () => { throw new Error('boom'); }, BANK: 'x' } }, { Q: { schedule: () => [null, { on: 5 }, 'x'] } }, { kept: { 'first-entry': NaN, 'diary-10': '1' } }];
  for (const input of [data, undefined, null, 'x', 42, [], { diary: null }, { diary: 'x' }]) {
    for (const opts of optsList) {
      assert.doesNotThrow(() => {
        const res = evaluate(input, opts);
        assert.equal(res.length, DEFS.length);
        JSON.stringify(res);
      });
    }
  }
  const res = run(data);
  assert.ok(res.find(r => r.id === 'first-answered').earned, 'both answered, even with junk text');
  assert.equal(res.find(r => r.id === 'secret-mind-reader').earned, false);
  assert.equal(res.find(r => r.id === 'first-entry').at, 1);
  assert.equal(res.find(r => r.id === 'first-reply').earned, false, 'a non-string author is not a reply');
});

test('kept achievements stay earned after their item is gone', () => {
  const e = entry(L(2026, 3, 3, 2), { id: 'gone' });
  const before = pick({ diary: [e] }, 'first-entry');
  assert.deepEqual([before.at, before.target], [L(2026, 3, 3, 2), { col: 'diary', id: 'gone' }]);
  const kept = { 'first-entry': before.at, 'secret-night-owl': before.at, 'diary-10': 789, 'first-photo': 'x', 'first-album': NaN };
  const res = Object.fromEntries(run({}, { kept }).map(r => [r.id, r]));
  assert.deepEqual([res['first-entry'].earned, res['first-entry'].at, res['first-entry'].target], [true, before.at, null]);
  assert.doesNotMatch(res['first-entry'].desc.en, /^Someday/);
  assert.deepEqual([res['secret-night-owl'].earned, res['secret-night-owl'].visible, res['secret-night-owl'].target], [true, true, null]);
  assert.deepEqual([res['diary-10'].earned, res['diary-10'].visible, res['diary-10'].at, res['diary-10'].progress], [true, true, 789, { n: 0, of: 10 }]);
  assert.deepEqual([res['diary-50'].visible, res['diary-100'].visible], [true, false]);
  assert.equal(res['first-photo'].earned, false);
  assert.equal(res['first-album'].earned, false);
  // when the data still has it, the data wins
  const now = pick({ diary: [e] }, 'first-entry', { kept: { 'first-entry': 5 } });
  assert.deepEqual([now.at, now.target], [L(2026, 3, 3, 2), { col: 'diary', id: 'gone' }]);
  assert.equal(pick({}, 'toString', { kept: { toString: 1 } }), undefined);
});

test('results are deterministic and never touch the input', () => {
  const pics = Array.from({ length: 9 }, (_, i) => photo(L(2026, 2, 1, 10, i), { id: `z${i}`, date: '2026-03-14' }));
  const data = deepFreeze({
    diary: [
      entry(L(2026, 1, 1, 2), { id: 'x2', photoIds: pics.map(p => p.id) }),
      entry(L(2026, 1, 1, 2), { id: 'x1', comments: [{ id: 'c1', author: ZZ, text: 'hi', at: L(2027, 2, 6, 9) }] }),
      entry(L(2026, 5, 20, 6)), entry(L(2026, 8, 1)), entry(L(2026, 10, 1))
    ],
    photos: pics,
    dates: [{ id: 'b', kind: 'birthday', date: '1990-03-14', repeat: true, by: SJ, createdAt: 1 }],
    answers: [...both('2026-01-01', L(2026, 1, 1), 'q001', ['Tea!', 'tea']), ...both('2026-01-02', L(2026, 1, 1), 'q002')],
    questions: [{ id: 'c', date: '2026-02-01', text: 'Hidden?', by: ZZ, createdAt: 1 }],
    trips: [{ id: 't', status: 'visited', createdAt: 5 }], tasks: [{ id: 'k', done: true, createdAt: 6 }], wishes: [{ id: 'w', got: true, createdAt: 7 }],
    albums: [{ id: 'a', by: SJ, createdAt: 8 }], events: [{ id: 'v', by: ZZ, createdAt: 9, kind: 'plan', date: '2026-01-01' }]
  });
  const snapshot = JSON.stringify(data), defs = JSON.stringify(DEFS);
  const a = run(data), b = run(data);
  assert.deepEqual(a, b);
  assert.notEqual(a[0], b[0]);
  const reversed = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, [...v].reverse()]));
  assert.deepEqual(run(reversed), a, 'input order does not matter, ties break by id');
  assert.equal(JSON.stringify(data), snapshot);
  a[0].desc.en = 'changed'; a[0].target && (a[0].target.id = 'changed');
  assert.deepEqual(run(data), b, 'results are fresh copies');
  assert.equal(JSON.stringify(DEFS), defs);
  assert.deepEqual(b.find(r => r.id === 'first-entry').target, { col: 'diary', id: 'x1' });
  const earned = b.filter(r => r.earned).map(r => r.id);
  for (const id of ['first-entry', 'first-reply', 'first-photo', 'first-answered', 'first-asked', 'secret-night-owl', 'secret-early-bird', 'secret-520', 'secret-seasons', 'secret-nine-grid', 'secret-mind-reader', 'secret-time-letter', 'secret-birthday']) {
    assert.ok(earned.includes(id), id);
  }
  assert.doesNotMatch(JSON.stringify(b), DASH);
  assert.ok(!JSON.stringify(b).includes('Hidden'));
});
