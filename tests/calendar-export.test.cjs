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
