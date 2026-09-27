// Achievements: gentle "us" milestones worked out from what the two of us already keep here.
// No streaks, nothing resets, no countdowns, no scores between us: every badge belongs to both.
(() => {
  'use strict';
  const DAY = 864e5, YEAR = 365 * DAY;
  // First day of the Lunar New Year (大年初一), local calendar dates.
  const LUNAR_NEW_YEAR = Object.freeze(['2026-02-17', '2027-02-06', '2028-01-26', '2029-02-13', '2030-02-03']);

  // ---------- definitions ----------
  // firsts carry two lines: desc once it has happened, invite while it is still "someday".
  // totals: tier is the 1-based step within a series; the count to reach is in GOALS (and in progress.of).
  const first = (id, glyph, en, zh, desc, invite) => ({ id, cat: 'firsts', glyph, en, zh, desc, invite });
  const total = (id, series, tier, glyph, en, zh, desc) => ({ id, cat: 'totals', glyph, en, zh, desc, series, tier });
  const secret = (id, glyph, en, zh, desc) => ({ id, cat: 'secret', glyph, en, zh, desc });
  const t = (en, zh) => ({ en, zh });

  const DEFS = [
    first('first-entry', '✎', 'First page', '第一页',
      t('Our very first diary page.', '我们的第一篇日记。'),
      t('Someday: write the first page together.', '哪天有空，一起写下第一页吧。')),
    first('first-photo', '▧', 'Say cheese', '茄子',
      t('Our first photo, kept here for good.', '第一张照片，好好地存在这里了。'),
      t('Someday: tuck a first photo in here.', '哪天，放进第一张照片吧。')),
    first('first-reply', '✉', 'Pen pals', '你来我往',
      t('The first time we wrote back to each other.', '第一次在对方的日记下留言。'),
      t("Someday: leave a note on each other's page.", '哪天，在对方的日记下留句话吧。')),
    first('first-trip', '✈', 'Passport stamp', '第一枚印章',
      t('The first trip we have been on together.', '我们一起去过的第一个地方。'),
      t('Someday: our first trip, side by side.', '哪天，一起去一个地方吧。')),
    first('first-wish', '✧', 'Wish come true', '愿望成真',
      t('The first wish on our list came true.', '清单上第一个实现的愿望。'),
      t('Someday: a wish on our list comes true.', '总有一天，清单上的愿望会实现的。')),
    first('first-task', '✓', 'Little thing, done', '小事一桩',
      t('The first little thing we got done.', '我们完成的第一件小事。'),
      t('Someday: one little thing, done together.', '哪天，一起做完一件小事吧。')),
    first('first-answered', '♡', 'Same page', '同一页',
      t('The first daily question we both answered.', '我们都回答了的第一道每日一问。'),
      t('Someday: both answer the same daily question.', '哪天，一起回答同一道每日一问吧。')),
    first('first-asked', '?', 'Curious cats', '好奇宝宝',
      t('The first question we asked each other.', '我们第一次给对方出的题。'),
      t('Someday: ask each other a question of our own.', '哪天，给对方出一道专属的题吧。')),
    first('first-special-day', '◆', 'A day to keep', '值得纪念的日子',
      t('The first special day we saved.', '我们存下的第一个特别的日子。'),
      t('Someday: save a day that matters to us.', '哪天，存下一个对我们重要的日子吧。')),
    first('first-album', '▣', 'Our first album', '第一本相册',
      t('The first photo album we started.', '我们建的第一本相册。'),
      t('Someday: start an album together.', '哪天，一起建一本相册吧。')),
    first('first-plan', '☕', 'Penciled in', '约好啦',
      t('The first plan we wrote down ourselves.', '我们亲手写下的第一个计划。'),
      t('Someday: pencil in a plan together.', '哪天，一起约个计划吧。')),

    total('diary-10', 'diary', 1, '✎', 'Ten pages', '十页日记', t('10 diary entries, written together.', '一起写下了 10 篇日记。')),
    total('diary-50', 'diary', 2, '✎', 'Fifty pages', '五十页日记', t('50 diary entries, written together.', '一起写下了 50 篇日记。')),
    total('diary-100', 'diary', 3, '✎', 'A hundred pages', '一百页日记', t('100 diary entries, written together.', '一起写下了 100 篇日记。')),
    total('diary-250', 'diary', 4, '✎', 'A whole book', '一整本书', t('250 diary entries, written together.', '一起写下了 250 篇日记。')),
    total('photos-50', 'photos', 1, '▧', 'Fifty snapshots', '五十张照片', t('50 photos, kept together.', '一起存下了 50 张照片。')),
    total('photos-200', 'photos', 2, '▧', 'Two hundred frames', '两百张回忆', t('200 photos, kept together.', '一起存下了 200 张照片。')),
    total('photos-500', 'photos', 3, '▧', 'Five hundred smiles', '五百张笑脸', t('500 photos, kept together.', '一起存下了 500 张照片。')),
    total('trips-3', 'trips', 1, '✈', 'Three stamps', '三枚印章', t('3 trips, visited together.', '一起去过了 3 个地方。')),
    total('trips-10', 'trips', 2, '✈', 'Ten stamps', '十枚印章', t('10 trips, visited together.', '一起去过了 10 个地方。')),
    total('wishes-5', 'wishes', 1, '✧', 'Five wishes', '五个愿望', t('5 wishes from our list, come true.', '清单上的 5 个愿望实现了。')),
    total('wishes-20', 'wishes', 2, '✧', 'Twenty wishes', '二十个愿望', t('20 wishes from our list, come true.', '清单上的 20 个愿望实现了。')),
    total('tasks-10', 'tasks', 1, '✓', 'Ten little things', '十件小事', t('10 little things, done together.', '一起完成了 10 件小事。')),
    total('tasks-50', 'tasks', 2, '✓', 'Fifty little things', '五十件小事', t('50 little things, done together.', '一起完成了 50 件小事。')),
    total('answers-10', 'answers', 1, '♡', 'Ten questions', '十道问答', t('10 daily questions, answered by both of us.', '我们一起回答了 10 道每日一问。')),
    total('answers-50', 'answers', 2, '♡', 'Fifty questions', '五十道问答', t('50 daily questions, answered by both of us.', '我们一起回答了 50 道每日一问。')),
    total('answers-100', 'answers', 3, '♡', 'A hundred questions', '一百道问答', t('100 daily questions, answered by both of us.', '我们一起回答了 100 道每日一问。')),
    total('replies-25', 'replies', 1, '✉', 'Twenty five notes', '二十五张小纸条', t('25 replies to each other.', '给对方留了 25 次言。')),
    total('replies-100', 'replies', 2, '✉', 'A hundred notes', '一百张小纸条', t('100 replies to each other.', '给对方留了 100 次言。')),
    total('deck-all', 'deck', 1, '♣', 'The whole deck', '一整副牌', t('Every built-in question, answered by both of us.', '题库里的每一道题，我们都一起答过了。')),

    secret('secret-night-owl', '☾', 'Night owls', '夜猫子', t('A diary page written after midnight.', '午夜过后写下的一页日记。')),
    secret('secret-early-bird', '☀', 'Early birds', '早起的鸟儿', t('A diary page written in the early morning.', '清晨时分写下的一页日记。')),
    secret('secret-anniversary', '❀', 'Happy anniversary', '纪念日快乐', t('A diary page written on our anniversary.', '在我们的纪念日写下的一页日记。')),
    secret('secret-birthday', '★', 'Happy birthday', '生日快乐', t('A photo from a birthday.', '生日那天留下的一张照片。')),
    secret('secret-seasons', '✿', 'Four seasons', '四季', t('Diary pages in spring, summer, autumn and winter.', '春夏秋冬，每个季节都有我们的日记。')),
    secret('secret-mind-reader', '✦', 'Mind readers', '心有灵犀', t('We gave the very same answer.', '我们写下了一模一样的答案。')),
    secret('secret-520', '♥', '520, love you', '520 我爱你', t('A diary page written on May 20.', '5 月 20 日写下的一页日记。')),
    secret('secret-new-year', '✶', 'Happy New Year', '新年快乐', t("A diary page written on New Year's Day.", '元旦那天写下的一页日记。')),
    secret('secret-lunar-new-year', '福', 'Happy Lunar New Year', '新春快乐', t('A diary page written on the first day of Spring Festival.', '大年初一写下的一页日记。')),
    secret('secret-nine-grid', '▦', 'Nine squares', '九宫格', t('One diary page holding nine photos.', '一篇日记里放满了九张照片。')),
    secret('secret-time-letter', '⌛', 'A letter back in time', '时光回信', t('A reply to a page from more than a year before.', '给一年多以前的日记写了回信。'))
  ];
  const GOALS = {
    'diary-10': 10, 'diary-50': 50, 'diary-100': 100, 'diary-250': 250,
    'photos-50': 50, 'photos-200': 200, 'photos-500': 500,
    'trips-3': 3, 'trips-10': 10, 'wishes-5': 5, 'wishes-20': 20, 'tasks-10': 10, 'tasks-50': 50,
    'answers-10': 10, 'answers-50': 50, 'answers-100': 100, 'replies-25': 25, 'replies-100': 100
  };
  const freeze = o => { for (const v of Object.values(o)) if (v && typeof v === 'object') freeze(v); return Object.freeze(o); };
  freeze(DEFS);

  // ---------- small, forgiving helpers ----------
  const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  const list = x => (Array.isArray(x) ? x.filter(isObj) : []);
  const num = x => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  const str = x => (typeof x === 'string' ? x.trim() : '');
  const has = v => v != null && v !== '' && !(Array.isArray(v) && v.length === 0);
  const keyOf = x => (typeof x.id === 'string' || typeof x.id === 'number' ? String(x.id) : '');
  const ref = (col, x) => ((typeof x.id === 'string' && x.id) || typeof x.id === 'number' ? { col, id: x.id } : null);
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const byTime = (a, b) => a.t - b.t || cmp(a.k, b.k);
  const sorted = cands => cands.slice().sort(byTime);
  const earliest = cands => (cands.length ? sorted(cands)[0] : null);
  const pad = n => String(n).padStart(2, '0');
  const dayOf = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  function validDay(iso) {
    const m = typeof iso === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    return !!m && new Date(Date.UTC(+m[1], m[2] - 1, +m[3])).toISOString().slice(0, 10) === iso;
  }
  const localMidnight = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
  // when a checkbox or status changed: the edit time if that edit touched the field, else the creation time
  const changedAt = (x, field) => {
    const u = num(x.updatedAt);
    return u !== null && typeof x.updatedWhat === 'string' && field.test(x.updatedWhat) ? u : num(x.createdAt);
  };
  const byHand = x => !!str(x.by) && num(x.createdAt) !== null && !has(x.importKey) && !has(x.importUIDs) && !String(x.id ?? '').startsWith('seed-');
  const squash = s => (typeof s === 'string' ? s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') : '');
  const season = month => (month >= 3 && month <= 5 ? 'spring' : month >= 6 && month <= 8 ? 'summer' : month >= 9 && month <= 11 ? 'autumn' : 'winter');
  // a yearly Feb 29 is kept on Mar 1 in years without one, the same as on the calendar
  const yearlyMonthDay = (monthDay, year) => (monthDay === '02-29' && !(year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? '03-01' : monthDay);
  const matchesDay = (day, special, onOrAfter) => (special.repeat === true
    ? day.slice(5) === yearlyMonthDay(special.date.slice(5), +day.slice(0, 4)) && (!onOrAfter || day >= special.date)
    : day === special.date);

  // Days the two of us both answered: the time is when the second of us first answered.
  function answeredDays(answers) {
    const byDate = new Map();
    for (const a of answers) {
      const at = num(a.createdAt);
      if (at === null || !validDay(a.date)) continue;
      let g = byDate.get(a.date);
      if (!g) byDate.set(a.date, g = { people: new Map(), asked: null });
      const who = str(a.author), k = keyOf(a), prev = who && g.people.get(who);
      if (who && (!prev || at < prev.at || (at === prev.at && k < prev.k))) g.people.set(who, { a, at, k });
      if (isObj(a.q) && (!g.asked || at < g.asked.at || (at === g.asked.at && k < g.asked.k))) g.asked = { a, at, k };
    }
    const days = [];
    for (const [date, g] of byDate) {
      if (g.people.size < 2) continue;
      const pair = [...g.people.values()].sort((x, y) => x.at - y.at || cmp(x.k, y.k)).slice(0, 2);
      const qid = g.asked && typeof g.asked.a.q.qid === 'string' ? g.asked.a.q.qid : null;
      days.push({ t: pair[1].at, k: date, target: { question: date }, date, pair: pair.map(p => p.a), qid });
    }
    return sorted(days);
  }

  // ---------- evaluate ----------
  function evaluate(data, opts) {
    const d = isObj(data) ? data : {}, o = isObj(opts) ? opts : {};
    const today = validDay(o.today) ? o.today : dayOf(Date.now());
    const kept = isObj(o.kept) ? o.kept : {};
    const Q = o.Q !== undefined ? o.Q : (typeof window !== 'undefined' && window.CCQuestions) || null;

    const diary = list(d.diary), photos = list(d.photos), albums = list(d.albums), events = list(d.events);
    const trips = list(d.trips), tasks = list(d.tasks), wishes = list(d.wishes), dates = list(d.dates), answers = list(d.answers);
    const item = (col, x, at) => ({ t: at, k: keyOf(x), target: ref(col, x), x });
    const timed = (col, xs, when) => xs.map(x => item(col, x, when(x))).filter(c => c.t !== null);

    const entries = sorted(timed('diary', diary, x => num(x.createdAt)));
    const pics = sorted(timed('photos', photos, x => num(x.createdAt)));
    const visited = sorted(timed('trips', trips.filter(x => x.status === 'visited'), x => changedAt(x, /status/)));
    const granted = sorted(timed('wishes', wishes.filter(x => x.got === true), x => changedAt(x, /got/)));
    const done = sorted(timed('tasks', tasks.filter(x => x.done === true), x => changedAt(x, /done/)));
    const days = answeredDays(answers);

    // comments on each other's pages (the entry's own time does not matter here)
    const replies = [], lateReplies = [];
    for (const e of diary) {
      if (!Array.isArray(e.comments)) continue;
      const author = str(e.author), created = num(e.createdAt), target = ref('diary', e);
      e.comments.forEach((c, i) => {
        if (!isObj(c)) return;
        const at = num(c.at);
        if (at === null) return;
        const cand = { t: at, k: `${keyOf(e)}\u0000${keyOf(c)}\u0000${pad(i)}`, target };
        const who = str(c.author);
        if (who && who !== author) replies.push(cand);
        if (created !== null && at - created > YEAR) lateReplies.push(cand);
      });
    }
    const repliesSorted = sorted(replies);

    // the first question one of us asked the other, once its day has come
    let asked = null;
    if (Q && typeof Q.schedule === 'function') {
      let booked = [];
      try { booked = Q.schedule(Array.isArray(d.questions) ? d.questions : []); } catch (err) { booked = []; }
      const ons = (Array.isArray(booked) ? booked : []).map(s => (isObj(s) ? s.on : null)).filter(on => validDay(on) && on <= today).sort();
      if (ons.length) asked = { t: localMidnight(ons[0]), target: { question: ons[0] } };
    }

    // the whole deck: distinct built-in questions from days we both answered
    const bank = Q && Array.isArray(Q.BANK) ? Q.BANK : null;
    const bankIds = bank ? new Set(bank.filter(isObj).map(b => b.id)) : null;
    const deckSize = bank ? bank.length : 360, seen = new Set();
    let deck = null;
    for (const day of days) {
      const qid = day.qid;
      if (!qid || !/^q\d{3}$/.test(qid) || (bankIds && !bankIds.has(qid)) || seen.has(qid)) continue;
      seen.add(qid);
      if (!deck && seen.size >= deckSize) deck = day;
    }

    // secrets: judged on the writer's wall clock (new entries carry tzo = their getTimezoneOffset()), else this device's clock
    const wall = c => {
      const o = c.x && c.x.tzo;
      if (typeof o === 'number' && Number.isFinite(o) && Math.abs(o) <= 840) { const d = new Date(c.t - o * 60000); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours() }; }
      const d = new Date(c.t); return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), h: d.getHours() };
    };
    const wallDay = c => { const w = wall(c); return `${w.y}-${pad(w.m)}-${pad(w.d)}`; };
    const hourIn = (lo, hi) => earliest(entries.filter(c => { const h = wall(c).h; return h >= lo && h <= hi; }));
    const onDay = test => earliest(entries.filter(c => test(wallDay(c))));
    const annivs = dates.filter(x => x.kind === 'anniversary' && validDay(x.date));
    const bdays = dates.filter(x => x.kind === 'birthday' && validDay(x.date));
    const covered = new Set();
    let seasons = null;
    for (const c of entries) {
      covered.add(season(wall(c).m));
      if (covered.size === 4) { seasons = c; break; }
    }
    const minds = [];
    for (const day of days) {
      const [a, b] = day.pair, x = squash(a.text);
      if ([...x].length < 2 || x !== squash(b.text)) continue;
      const when = p => num(p.updatedAt) ?? num(p.createdAt);
      minds.push({ t: Math.max(when(a), when(b)), k: day.k, target: day.target });
    }
    const photoById = new Map();
    for (const p of photos) { const k = keyOf(p); if (k && !photoById.has(p.id)) photoById.set(p.id, p); }
    const grids = [];
    for (const c of entries) {
      if (!Array.isArray(c.x.photoIds)) continue;
      const found = [...new Set(c.x.photoIds)].map(id => photoById.get(id)).filter(Boolean);
      if (found.length < 9) continue;
      grids.push({ ...c, t: Math.max(c.t, ...found.map(p => num(p.createdAt)).filter(n => n !== null)) });
    }

    const hits = {
      'first-entry': entries[0],
      'first-photo': pics[0],
      'first-reply': repliesSorted[0],
      'first-trip': visited[0],
      'first-wish': granted[0],
      'first-task': done[0],
      'first-answered': days[0],
      'first-asked': asked,
      'first-special-day': earliest(timed('dates', dates.filter(byHand), x => num(x.createdAt))),
      'first-album': earliest(timed('albums', albums, x => num(x.createdAt))),
      'first-plan': earliest(timed('events', events.filter(byHand), x => num(x.createdAt))),
      'deck-all': deck,
      'secret-night-owl': hourIn(0, 3),
      'secret-early-bird': hourIn(5, 6),
      'secret-anniversary': onDay(day => annivs.some(s => matchesDay(day, s, true))),
      'secret-birthday': earliest(timed('photos', photos.filter(p => validDay(p.date) && bdays.some(s => matchesDay(p.date, s, false))), x => num(x.createdAt))),
      'secret-seasons': seasons,
      'secret-mind-reader': earliest(minds),
      'secret-520': onDay(day => day.slice(5) === '05-20'),
      'secret-new-year': onDay(day => day.slice(5) === '01-01'),
      'secret-lunar-new-year': onDay(day => LUNAR_NEW_YEAR.includes(day)),
      'secret-nine-grid': earliest(grids),
      'secret-time-letter': earliest(lateReplies)
    };
    const counts = { diary: entries, photos: pics, trips: visited, wishes: granted, tasks: done, answers: days, replies: repliesSorted };

    const out = DEFS.map(def => {
      let hit = hits[def.id] || null, progress = null;
      if (def.cat === 'totals') {
        if (def.series === 'deck') progress = { n: seen.size, of: deckSize };
        else {
          const all = counts[def.series], goal = GOALS[def.id];
          progress = { n: all.length, of: goal };
          hit = all.length >= goal ? all[goal - 1] : null;
        }
      }
      const keptAt = Object.prototype.hasOwnProperty.call(kept, def.id) ? num(kept[def.id]) : null;
      const earned = !!hit || keptAt !== null;
      const at = hit && (keptAt === null || hit.t <= keptAt) ? hit.t : keptAt; // the earliest: when what earned it is deleted and a later item earns it, the date stays
      const target = hit && hit.target && hit.t === at ? { ...hit.target } : null; // no link when the moment shown is gone
      const desc = def.cat === 'firsts' && !earned ? def.invite : def.desc;
      return {
        id: def.id, cat: def.cat, glyph: def.glyph, en: def.en, zh: def.zh, desc: { en: desc.en, zh: desc.zh },
        series: def.series || null, tier: def.tier || null,
        earned, at: earned ? at : null, target, progress,
        visible: def.cat === 'firsts' || (def.cat === 'secret' && earned) || def.cat === 'totals'
      };
    });
    // totals: every tier reached, plus the next one waiting; later tiers stay tucked away
    const opened = new Set();
    for (const r of out) {
      if (r.cat !== 'totals' || r.earned) continue;
      r.visible = !opened.has(r.series);
      opened.add(r.series);
    }
    return out;
  }

  const api = { DEFS, evaluate, LUNAR_NEW_YEAR };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.CCAchievements = api;
})();
