const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// app.js is one page script; its "pure helpers" block is cut out and run here on its own
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const start = source.indexOf('// ---------- pure helpers'), end = source.indexOf('// ---------- end pure helpers ----------');
assert.ok(start > 0 && end > start, 'app.js has the pure helpers block');
const H = vm.runInNewContext(`${source.slice(start, end)}; ({ safeImage, safeColor, isLeapYear, yearlyDay, nextYearly, parseTags })`, {});

const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2w==';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test('safeImage keeps base64 images from synced data and drops everything else', () => {
  for (const ok of [JPEG, PNG, 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==']) assert.equal(H.safeImage(ok), ok);
  for (const bad of [
    JPEG + '" onerror="alert(1)', JPEG + '"><script>alert(1)</script>', JPEG + "' x='", JPEG + ' onload=x', JPEG + ')',
    'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 'data:text/html;base64,PHNjcmlwdD4=', 'data:image/png,rawbytes', 'data:image/png;base64,',
    'javascript:alert(1)', 'https://example.com/a.jpg', '//evil.example/x.png', 'x" onerror="alert(1)', 'DATA:image/png;base64,iVBOR',
    '', null, undefined, 42, {}, ['data:image/png;base64,AAAA']
  ]) assert.equal(H.safeImage(bad), '', String(bad).slice(0, 60));
});

test('safeImage takes a page-made blob: URL only where allowed (never for avatars)', () => {
  const blob = 'blob:https://bibo.example/2b0f3c3e-9a51-4f0e-9d0e-1f7d2f4f3a11';
  assert.equal(H.safeImage(blob), blob);
  assert.equal(H.safeImage('blob:http://localhost:8813/2b0f3c3e-9a51-4f0e-9d0e-1f7d2f4f3a11'), 'blob:http://localhost:8813/2b0f3c3e-9a51-4f0e-9d0e-1f7d2f4f3a11');
  assert.equal(H.safeImage(blob, false), '');
  assert.equal(H.safeImage(blob + '" onerror="x'), '');
  assert.equal(H.safeImage('blob:javascript:alert(1)'), '');
});

test('safeColor only lets hex colours into style values', () => {
  for (const ok of ['#e0506a', '#ABCDEF', '#fff']) assert.equal(H.safeColor(ok), ok);
  for (const bad of ['red', '#e0506a;background:url(//evil)', 'url(https://evil.example/x)', '#12345', '#ggg000', 'var(--x)', '', null, 7]) assert.equal(H.safeColor(bad), '', String(bad));
});

test('a yearly Feb 29 falls on Mar 1 in years without one', () => {
  assert.deepEqual([1900, 2000, 2024, 2025, 2028, 2100].map(H.isLeapYear), [false, true, true, false, true, false]);
  assert.equal(H.yearlyDay('2024-02-29', 2027), '2027-03-01');
  assert.equal(H.yearlyDay('2024-02-29', 2028), '2028-02-29');
  assert.equal(H.yearlyDay('2024-02-29', 2100), '2100-03-01');
  assert.equal(H.yearlyDay('1999-10-03', 2026), '2026-10-03');
  assert.equal(H.yearlyDay('2023-03-01', 2028), '2028-03-01', 'a real Mar 1 stays put');
  assert.equal(H.yearlyDay('2023-02-28', 2028), '2028-02-28');
});

test('nextYearly: the next time a yearly day comes round, today included', () => {
  assert.equal(H.nextYearly('2024-02-29', '2026-09-27'), '2027-03-01');
  assert.equal(H.nextYearly('2024-02-29', '2027-03-01'), '2027-03-01', 'on the day itself');
  assert.equal(H.nextYearly('2024-02-29', '2027-03-02'), '2028-02-29');
  assert.equal(H.nextYearly('2024-02-29', '2028-02-29'), '2028-02-29');
  assert.equal(H.nextYearly('2024-02-29', '2028-03-01'), '2029-03-01');
  assert.equal(H.nextYearly('2024-02-29', '2024-01-10'), '2024-02-29');
  assert.equal(H.nextYearly('2024-05-20', '2026-09-27'), '2027-05-20');
  assert.equal(H.nextYearly('2024-05-20', '2026-05-20'), '2026-05-20');
  assert.equal(H.nextYearly('2030-01-01', '2026-09-27'), '2030-01-01', 'a date still ahead stays itself');
  assert.equal(H.nextYearly('1999-12-31', '2026-12-31'), '2026-12-31');
});

test('parseTags splits on commas, spaces, # and the Chinese list marks', () => {
  const tags = t => [...H.parseTags(t)]; // made in another realm, so compared as plain arrays
  assert.deepEqual(tags('旅行、美食'), ['旅行', '美食']);
  assert.deepEqual(tags('旅行，美食；周末;猫'), ['旅行', '美食', '周末', '猫']);
  assert.deepEqual(tags('#旅行 #美食 ＃火锅'), ['旅行', '美食', '火锅']);
  assert.deepEqual(tags('travel, food  cafe'), ['travel', 'food', 'cafe']);
  assert.deepEqual(tags('旅行\u3000美食'), ['旅行', '美食'], 'a full-width space');
  assert.deepEqual(tags('Food, food、FOOD'), ['Food'], 'no repeats, whatever the case');
  assert.deepEqual(tags('、，；, '), []);
  assert.deepEqual(tags(null), []);
  assert.equal(tags('a b c d e f g h i j').length, 8);
  assert.equal(tags('x'.repeat(30))[0].length, 20);
});
