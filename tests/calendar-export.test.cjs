const { test } = require('node:test');
const assert = require('node:assert/strict');
const ICAL = require('../calendar-import.js');
const { KINDS, build } = require('../calendar-export.js');

const data = {
  events: [
    { id: 'plan', title: 'Coffee, then cake', date: '2026-10-03', endDate: '2026-10-04', note: 'Meet at 10; bring photos' },
    { id: 'timed', title: 'Flight arrival', kind: 'plan', date: '2026-10-05', allDay: false,
      startMs: Date.UTC(2026, 9, 5, 14), endMs: Date.UTC(2026, 9, 5, 15) },
    { id: 'legacy-trip', title: 'Old trip event', kind: 'trip', date: '2026-11-02' }
  ],
  trips: [{ id: 'trip', title: 'Taiwan', start: '2026-11-10', end: '2026-11-13', status: 'planning', note: 'Hotels' }],
  tasks: [{ id: 'task', title: 'Pack camera', date: '2026-11-09', done: false }, { id: 'undated', title: 'Someday' }],
  dates: [
    { id: 'birthday', title: 'Birthday', kind: 'birthday', date: '2026-04-12', repeat: true },
    { id: 'holiday', title: 'Holiday', kind: 'holiday', date: '2026-12-25', repeat: false },
    { id: 'anniversary', title: 'Anniversary', kind: 'anniversary', date: '2025-06-14', repeat: true }
  ]
};
const expected = { plan: 2, trip: 2, task: 1, birthday: 1, holiday: 1, anniversary: 1 };
const read = kind => build(kind, data, '2026-09-26', Date.UTC(2026, 8, 26));

test('each download contains only its category and has its own calendar name', () => {
  for (const [kind, label] of KINDS) {
    const file = read(kind);
    assert.equal(file.count, expected[kind]);
    assert.equal(file.filename, `bibo-bobi-${kind}-2026-09-26.ics`);
    assert.match(file.ics, new RegExp(`X-WR-CALNAME:Bibo & Bobi · ${label}`));
    const component = new ICAL.Component(ICAL.parse(file.ics));
    assert.equal(component.getAllSubcomponents('vevent').length, expected[kind]);
  }
  assert.ok(read('plan').ics.includes('UID:ev-plan@our-little-corner'));
  assert.ok(!read('plan').ics.includes('UID:trip-trip@our-little-corner'));
  assert.ok(read('trip').ics.includes('UID:ev-legacy-trip@our-little-corner'));
  assert.ok(!read('task').ics.includes('undated'));
});

test('preserves times, inclusive trip dates, recurring special days, and text escaping', () => {
  const plan = read('plan').ics;
  assert.match(plan, /DTSTART:20261005T140000Z\r\nDTEND:20261005T150000Z/);
  assert.match(plan, /DTSTART;VALUE=DATE:20261003\r\nDTEND;VALUE=DATE:20261005/);
  assert.match(plan, /SUMMARY:Coffee\\, then cake/);
  assert.match(plan, /DESCRIPTION:Meet at 10\\; bring photos/);
  assert.match(read('trip').ics, /DTSTART;VALUE=DATE:20261110\r\nDTEND;VALUE=DATE:20261114/);
  assert.match(read('birthday').ics, /RRULE:FREQ=YEARLY/);
  assert.doesNotMatch(read('holiday').ics, /RRULE:FREQ=YEARLY/);
});

test('empty and unknown categories do not produce a download', () => {
  assert.equal(build('plan', { events: [] }, '2026-09-26'), null);
  assert.throws(() => build('unknown', data, '2026-09-26'), /Unknown calendar category/);
});

test('a yearly Feb 29 day exports so calendars show it on Mar 1 in other years', () => {
  const leap = build('birthday', { dates: [{ id: 'leap', title: 'Leap birthday', kind: 'birthday', date: '2024-02-29', repeat: true }] }, '2026-09-26', Date.UTC(2026, 8, 26));
  assert.match(leap.ics, /DTSTART;VALUE=DATE:20240229/);
  assert.match(leap.ics, /RRULE:FREQ=YEARLY;BYYEARDAY=60/);
  assert.match(read('birthday').ics, /RRULE:FREQ=YEARLY\r\n/, 'other yearly days keep the plain rule');
  globalThis.ICAL = ICAL; // round-trip through the site's own calendar reader (ICAL.js)
  const { events } = globalThis.CoupleCalendarImport.parse(leap.ics, { from: '2027-01-01', to: '2028-12-31' });
  assert.deepEqual(events.map(e => e.date), ['2027-03-01', '2028-02-29']);
});

// Events that came from Apple Calendar (calendar-import.js sets importKey/uid/source) and special days from the
// first-run seed (importUIDs) are already in that calendar: re-exported with our UIDs they would show up twice.
const withImported = {
  events: [
    { id: 'mine', title: 'Picnic', kind: 'plan', date: '2026-10-03', by: '斯婕', createdAt: 1 },
    { id: 'apple', title: 'Dentist', date: '2026-10-04', importKey: '["abc@icloud","2026-10-04"]', uid: 'abc@icloud', source: 'Apple Calendar', by: '斯婕', createdAt: 2 },
    { id: 'seed-event-0', title: 'Seeded concert', date: '2026-10-05', importKey: '["seed","2026-10-05"]', source: 'Apple Calendar' }
  ],
  trips: [{ id: 'trip', title: 'Taiwan', start: '2026-11-10' }],
  dates: [
    { id: 'bday', title: 'Mum', kind: 'birthday', date: '1970-05-02', repeat: true, by: '真真', createdAt: 3 },
    { id: 'seed-date-0', title: 'Imported birthday', kind: 'birthday', date: '1990-07-01', repeat: true, importUIDs: ['xyz@icloud'] }
  ]
};
const uids = file => [...file.ics.matchAll(/^UID:(.*)$/gm)].map(m => m[1].trim());
const at = (kind, opts) => build(kind, withImported, '2026-09-26', Date.UTC(2026, 8, 26), opts);

test('imported events and special days are left out of an export by default', () => {
  const plan = at('plan');
  assert.deepEqual(uids(plan), ['ev-mine@our-little-corner']);
  assert.equal(plan.count, 1);
  assert.equal(plan.skipped, 2);
  assert.doesNotMatch(plan.ics, /Dentist|Seeded concert/);
  const bday = at('birthday');
  assert.deepEqual(uids(bday), ['day-bday@our-little-corner']);
  assert.equal(bday.skipped, 1);
  assert.equal(build('plan', { events: [withImported.events[1]] }, '2026-09-26'), null, 'only imported items: nothing to download');
});

test('an event read by the calendar importer counts as imported', () => {
  globalThis.ICAL = ICAL;
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Apple Inc.//macOS//EN', 'BEGIN:VEVENT', 'UID:dinner-1@icloud.com', 'DTSTAMP:20260901T000000Z',
    'DTSTART;VALUE=DATE:20261012', 'DTEND;VALUE=DATE:20261013', 'SUMMARY:Dinner with friends', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const [parsed] = globalThis.CoupleCalendarImport.parse(ics, { from: '2026-10-01', to: '2026-10-31' }).events;
  const stored = { ...parsed, id: 'imp1', by: '斯婕', createdAt: 5 }; // what confirmImport saves
  const mixed = { events: [stored, withImported.events[0]] };
  assert.deepEqual(uids(build('plan', mixed, '2026-09-26')), ['ev-mine@our-little-corner']);
  assert.deepEqual(uids(build('plan', mixed, '2026-09-26', Date.now(), { includeImported: true })), ['ev-imp1@our-little-corner', 'ev-mine@our-little-corner']);
});

test('imported events and special days are exported when asked for', () => {
  const plan = at('plan', { includeImported: true });
  assert.deepEqual(uids(plan), ['ev-mine@our-little-corner', 'ev-apple@our-little-corner', 'ev-seed-event-0@our-little-corner']);
  assert.equal(plan.count, 3);
  assert.equal(plan.skipped, 0);
  assert.deepEqual(uids(at('birthday', { includeImported: true })), ['day-bday@our-little-corner', 'day-seed-date-0@our-little-corner']);
});

test('hand-added events, trips and special days are always exported', () => {
  for (const opts of [undefined, {}, { includeImported: false }, { includeImported: true }]) {
    assert.ok(uids(at('plan', opts)).includes('ev-mine@our-little-corner'));
    assert.deepEqual(uids(at('trip', opts)), ['trip-trip@our-little-corner']);
    assert.ok(uids(at('birthday', opts)).includes('day-bday@our-little-corner'));
  }
  assert.equal(read('plan').skipped, 0, 'the hand-made test data has nothing imported');
});

test('a little thing with a time exports as a one-hour slot at that local time', () => {
  const file = build('task', { tasks: [
    { id: 'timed-task', title: 'Dinner', date: '2026-10-21', time: '19:30', done: false },
    { id: 'late-task', title: 'Night walk', date: '2026-10-21', time: '23:15', done: false },
    { id: 'plain-task', title: 'Pack', date: '2026-10-22', done: false }
  ] }, '2026-10-20', Date.UTC(2026, 9, 20));
  assert.equal(file.count, 3);
  assert.match(file.ics, /DTSTART:20261021T193000\r\nDTEND:20261021T203000/);
  assert.match(file.ics, /DTSTART:20261021T231500\r\nDTEND:20261022T001500/);
  assert.match(file.ics, /DTSTART;VALUE=DATE:20261022/);
  const parsed = new ICAL.Component(ICAL.parse(file.ics)).getAllSubcomponents('vevent');
  assert.equal(parsed.length, 3);
});

test('a todo item goes into the file of its own category', () => {
  const tasks = [
    { id: 'gift', title: 'Buy a gift', kind: 'birthday', date: '2026-11-01' },
    { id: 'tickets', title: 'Book tickets', kind: 'plan', date: '2026-11-02' },
    { id: 'plain', title: 'Laundry', date: '2026-11-03' },
    { id: 'odd', title: 'Odd', kind: 'not-a-kind', date: '2026-11-04' }
  ];
  const file = kind => build(kind, { tasks }, '2026-10-20', Date.UTC(2026, 9, 20));
  assert.ok(file('birthday').ics.includes('UID:task-gift@our-little-corner'));
  assert.ok(!file('task').ics.includes('task-gift'));
  assert.ok(file('plan').ics.includes('UID:task-tickets@our-little-corner'));
  assert.equal(file('task').count, 2); // plain + unknown category
  assert.equal(file('trip'), null);
});
