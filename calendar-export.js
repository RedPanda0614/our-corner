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

  // Events and special days that came in from a calendar file (Apple Calendar import, or the first-run
  // seed) are already in that calendar. Exported again they would get new UIDs there and show up twice,
  // so they are left out unless the export asks for them.
  const isImported = item => !!(item && (item.importKey || item.source || (Array.isArray(item.importUIDs) && item.importUIDs.length)));

  function build(kind, data, today, timestamp = Date.now(), { includeImported = false } = {}) {
    if (!Object.prototype.hasOwnProperty.call(labels, kind)) throw new Error('Unknown calendar category.');
    const lines = [];
    const stamp = utcStamp(timestamp);
    const allDay = (start, endInclusive) => [
      `DTSTART;VALUE=DATE:${compactDay(start)}`,
      `DTEND;VALUE=DATE:${compactDay(nextDay(endInclusive || start))}`
    ];
    const localHour = (day, time) => {
      const [h, m] = time.split(':').map(Number), endDay = h === 23 ? nextDay(day) : day, endH = (h + 1) % 24;
      const pad = n => String(n).padStart(2, '0');
      return [`DTSTART:${compactDay(day)}T${pad(h)}${pad(m)}00`, `DTEND:${compactDay(endDay)}T${pad(endH)}${pad(m)}00`];
    };
    const event = (id, title, fields, note, location) => {
      lines.push('BEGIN:VEVENT', `UID:${id}@our-little-corner`, `DTSTAMP:${stamp}`, `SUMMARY:${escapeText(title)}`, ...fields);
      if (note) lines.push(`DESCRIPTION:${escapeText(note)}`);
      if (location) lines.push(`LOCATION:${escapeText(location)}`);
      lines.push('END:VEVENT');
    };

    let count = 0, skipped = 0;
    for (const item of data.events || []) {
      if ((item.kind || 'plan') !== kind) continue;
      if (!includeImported && isImported(item)) { skipped++; continue; }
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
    // Todo items carry a calendar category too (no category = Little thing); each goes into its own category's file.
    if (kind !== 'trip') for (const item of data.tasks || []) {
      if (!item.date) continue;
      const itemKind = item.kind && item.kind !== 'trip' && Object.prototype.hasOwnProperty.call(labels, item.kind) ? item.kind : 'task';
      if (itemKind !== kind) continue;
      // A little thing with a time is a one-hour slot in local time (floating, so it stays at that clock time).
      const timed = typeof item.time === 'string' && /^\d{2}:\d{2}$/.test(item.time);
      event('task-' + item.id, (item.done ? '✓ ' : '') + item.title, timed ? localHour(item.date, item.time) : allDay(item.date), item.note);
      count++;
    }
    if (['birthday', 'holiday', 'anniversary'].includes(kind)) for (const item of data.dates || []) {
      if ((item.kind || 'anniversary') !== kind) continue;
      if (!includeImported && isImported(item)) { skipped++; continue; }
      // A yearly Feb 29 repeats on day 60 of the year: Feb 29 in leap years, Mar 1 otherwise (a plain yearly rule skips 3 years in 4).
      const yearly = item.date.slice(5) === '02-29' ? 'RRULE:FREQ=YEARLY;BYYEARDAY=60' : 'RRULE:FREQ=YEARLY';
      event('day-' + item.id, '♡ ' + item.title, [...allDay(item.date), ...(item.repeat ? [yearly] : [])], labels[kind]);
      count++;
    }

    if (!count) return null;
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Bibo and Bobi//Calendar//EN',
      'CALSCALE:GREGORIAN', `X-WR-CALNAME:${escapeText('Bibo & Bobi · ' + labels[kind])}`,
      ...lines, 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n';
    return { ics, count, skipped, kind, label: labels[kind], filename: `bibo-bobi-${kind}-${today}.ics` };
  }

  return { KINDS, build, isImported };
});
