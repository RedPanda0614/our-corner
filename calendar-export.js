// Build one .ics file per calendar category. Kept separate so category filtering
// and iCalendar formatting can be checked without the page or a GitHub login.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CoupleCalendarExport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const KINDS = [['plan', 'Plan'], ['trip', 'Trip'], ['task', 'Little thing'], ['birthday', 'Birthday'], ['holiday', 'Holiday'], ['anniversary', 'Anniversary']];
  const labels = Object.fromEntries(KINDS);
  const escapeText = value => String(value ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
  const compactDay = day => day.replace(/-/g, '');
  const utcStamp = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const nextDay = day => {
    const [year, month, date] = day.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, date + 1)).toISOString().slice(0, 10);
  };
  const fold = line => {
    const out = [];
    let current = '';
    for (const char of line) {
      if (new TextEncoder().encode(current + char).length > 74) { out.push(current); current = ' ' + char; }
      else current += char;
    }
    out.push(current);
    return out.join('\r\n');
  };

  function build(kind, data, today, timestamp = Date.now()) {
    if (!Object.prototype.hasOwnProperty.call(labels, kind)) throw new Error('Unknown calendar category.');
    const lines = [];
    const stamp = utcStamp(timestamp);
    const allDay = (start, endInclusive) => [
      `DTSTART;VALUE=DATE:${compactDay(start)}`,
      `DTEND;VALUE=DATE:${compactDay(nextDay(endInclusive || start))}`
    ];
    const event = (id, title, fields, note, location) => {
      lines.push('BEGIN:VEVENT', `UID:${id}@our-little-corner`, `DTSTAMP:${stamp}`, `SUMMARY:${escapeText(title)}`, ...fields);
      if (note) lines.push(`DESCRIPTION:${escapeText(note)}`);
      if (location) lines.push(`LOCATION:${escapeText(location)}`);
      lines.push('END:VEVENT');
    };

    let count = 0;
    for (const item of data.events || []) {
      if ((item.kind || 'plan') !== kind) continue;
      const timed = item.startMs && item.endMs && item.allDay === false;
      event('ev-' + item.id, item.title, timed
        ? [`DTSTART:${utcStamp(item.startMs)}`, `DTEND:${utcStamp(item.endMs)}`]
        : allDay(item.date, item.endDate || item.date), item.note, item.location);
      count++;
    }
    if (kind === 'trip') for (const item of data.trips || []) {
      if (!item.start) continue;
      event('trip-' + item.id, '✈ ' + item.title, allDay(item.start, item.end || item.start),
        [({ dreaming: 'Dreaming', planning: 'Planning', booked: 'Booked', visited: 'Visited' })[item.status], item.note].filter(Boolean).join(' · '));
      count++;
    }
    if (kind === 'task') for (const item of data.tasks || []) {
      if (!item.date) continue;
      event('task-' + item.id, (item.done ? '✓ ' : '') + item.title, allDay(item.date), item.note);
      count++;
    }
    if (['birthday', 'holiday', 'anniversary'].includes(kind)) for (const item of data.dates || []) {
      if ((item.kind || 'anniversary') !== kind) continue;
      event('day-' + item.id, '♡ ' + item.title, [...allDay(item.date), ...(item.repeat ? ['RRULE:FREQ=YEARLY'] : [])], labels[kind]);
      count++;
    }

    if (!count) return null;
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Bibo and Bobi//Calendar//EN',
      'CALSCALE:GREGORIAN', `X-WR-CALNAME:${escapeText('Bibo & Bobi · ' + labels[kind])}`,
      ...lines, 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n';
    return { ics, count, kind, label: labels[kind], filename: `bibo-bobi-${kind}-${today}.ics` };
  }

  return { KINDS, build };
});
