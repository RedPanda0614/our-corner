const test = require('node:test');
const assert = require('node:assert/strict');
const { PALETTE, ICONS, key, has, svg, html, text } = require('../pixel-emoji.js');

const cp = (...codes) => String.fromCodePoint(...codes);
const VS16 = cp(0xFE0F);
const ZWJ = cp(0x200D);
const REQUIRED = ['😴', '💼', '🍜', '🚗', '🥰', '🤒', '📚', '🏃', '🎮', '🛁', '🎧', '😤', '✈', '🌙', '☀', '🌤', '☁', '🌧', '⛈', '🔒', '☕', '⌛'];
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const count = (s, needle) => s.split(needle).length - 1;

// Paint every <rect> of an svg() string back onto a 16x16 grid of palette keys.
function rasterize(markup) {
  const keyOf = new Map(Object.entries(PALETTE).map(([k, v]) => [v, k]));
  const grid = Array.from({ length: 16 }, () => Array(16).fill('.'));
  const re = /<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="([^"]+)"\/>/g;
  const rects = [];
  let m;
  while ((m = re.exec(markup))) {
    const [x, y, w, h] = m.slice(1, 5).map(Number);
    const k = keyOf.get(m[5]);
    assert.ok(k, `fill ${m[5]} is a palette colour`);
    rects.push({ x, y, w, h, k });
    for (let r = y; r < y + h; r++) for (let c = x; c < x + w; c++) {
      assert.ok(r < 16 && c < 16, `rect inside the 16x16 viewBox (${c},${r})`);
      assert.equal(grid[r][c], '.', `pixel ${c},${r} painted once`);
      grid[r][c] = k;
    }
  }
  assert.equal(rects.length, count(markup, '<rect'), 'every <rect> parsed');
  return { rows: grid.map(r => r.join('')), rects };
}

test('all 22 required emoji have icons, keyed without U+FE0F', () => {
  for (const e of REQUIRED) assert.ok(Object.prototype.hasOwnProperty.call(ICONS, e), `missing ${e}`);
  for (const k of Object.keys(ICONS)) assert.ok(!k.includes(VS16), `${k} key contains FE0F`);
});

test('every icon is exactly 16 rows of 16 palette keys or "."', () => {
  for (const [e, icon] of Object.entries(ICONS)) {
    assert.equal(icon.rows.length, 16, `${e} row count`);
    icon.rows.forEach((row, i) => {
      assert.equal(typeof row, 'string');
      assert.equal(Array.from(row).length, 16, `${e} row ${i} width`);
      for (const ch of row) assert.ok(ch === '.' || Object.prototype.hasOwnProperty.call(PALETTE, ch), `${e} row ${i} has unknown key ${ch}`);
    });
    const used = new Set(icon.rows.join('').replace(/\./g, ''));
    assert.ok(used.has('k'), `${e} has an outline`);
    assert.ok(used.size >= 3, `${e} has at least two fill colours`);
  }
});

test('outline k is a themeable CSS variable; the rest are fixed hex colours', () => {
  assert.equal(PALETTE.k, 'var(--px-outline, #3b3b36)');
  assert.ok(!Object.prototype.hasOwnProperty.call(PALETTE, '.'));
  for (const [k, v] of Object.entries(PALETTE)) {
    assert.equal(k.length, 1, `palette key ${k} is one char`);
    if (k !== 'k') assert.match(v, /^#[0-9a-f]{6}$/i, `palette ${k}`);
  }
  assert.equal(new Set(Object.values(PALETTE)).size, Object.keys(PALETTE).length, 'palette colours are distinct');
});

test('names are bilingual and match the app labels', () => {
  for (const [e, icon] of Object.entries(ICONS)) {
    assert.ok(icon.name && typeof icon.name.en === 'string' && icon.name.en.trim(), `${e} en name`);
    assert.match(icon.name.zh, /\p{Script=Han}/u, `${e} zh name`);
  }
  const expected = {
    '😴': ['Sleepy', '犯困'], '💼': ['Busy', '忙碌'], '🍜': ['Eating', '干饭'], '🚗': ['On my way', '在路上'],
    '🥰': ['Missing you', '想你'], '🤒': ['Unwell', '不舒服'], '📚': ['Studying', '学习中'], '🏃': ['Working out', '运动'],
    '🎮': ['Gaming', '游戏'], '🛁': ['Relaxing', '放松'], '🎧': ['Music on', '听歌'], '😤': ['Grumpy', '有点烦'],
    '✈': ['Travelling', '出行'], '🌙': ['Good night', '晚安'],
    '☀': ['Sunny', '晴'], '🌤': ['Mostly sunny', '多云转晴'], '☁': ['Cloudy', '多云'], '🌧': ['Rainy', '小雨'], '⛈': ['Stormy', '雷阵雨'],
    '🔒': ['Locked', '已上锁'], '☕': ['Hot drink', '热饮'], '⌛': ['Hourglass', '沙漏'],
  };
  for (const [e, [en, zh]] of Object.entries(expected)) assert.deepEqual(ICONS[e].name, { en, zh }, e);
});

test('key() strips U+FE0F and surrounding whitespace', () => {
  assert.equal(key('☀' + VS16), '☀');
  assert.equal(key(' ✈' + VS16 + ' '), '✈');
  assert.equal(key('🍜'), '🍜');
  assert.equal(key(null), '');
  assert.equal(key(undefined), '');
});

test('has() works with and without the variation selector', () => {
  for (const e of ['☀', '☀' + VS16, '✈', '✈' + VS16, '☁' + VS16, '⛈' + VS16, '🌤' + VS16, '🌧' + VS16, '☕', '⌛', '🔒']) assert.equal(has(e), true, e);
  for (const e of ['🦄', '', null, undefined, '☀☀', 'sun', '🏃' + cp(0x1F3FD)]) assert.equal(has(e), false, String(e));
});

test('svg() returns a well-formed, labelled inline SVG for every icon', () => {
  for (const [e, icon] of Object.entries(ICONS)) {
    const out = svg(e);
    assert.ok(out.startsWith(`<svg class="cc-px" viewBox="0 0 16 16" width="16" height="16" shape-rendering="crispEdges" role="img" aria-label="${esc(icon.name.en)}" focusable="false">`), `${e} opening tag`);
    assert.ok(out.endsWith('</svg>'));
    assert.equal(count(out, '<svg'), 1);
    assert.ok(count(out, '<rect') > 0, `${e} has rects`);
    assert.ok(!out.includes('aria-hidden'));
  }
  assert.equal(svg('☀' + VS16), svg('☀'));
  assert.equal(svg('🦄'), '');
  assert.equal(svg(''), '');
  assert.ok(svg('🔒', { label: 'Tap to "unlock" <now> & more' }).includes('aria-label="Tap to &quot;unlock&quot; &lt;now&gt; &amp; more"'));
});

test('decorative svg() is hidden from assistive tech and has no role or label', () => {
  const out = svg('🔒', { decorative: true });
  assert.ok(out.includes('aria-hidden="true"'));
  assert.ok(out.includes('focusable="false"'));
  assert.ok(out.includes('viewBox="0 0 16 16"') && out.includes('shape-rendering="crispEdges"'));
  assert.ok(!out.includes('role='));
  assert.ok(!out.includes('aria-label'));
});

test('merged horizontal runs render exactly the pixels of the grid', () => {
  for (const [e, icon] of Object.entries(ICONS)) {
    const { rows, rects } = rasterize(svg(e));
    assert.deepEqual(rows, icon.rows, `${e} re-rasterised`);
    // one rect per maximal run: never two touching rects of the same colour on a row
    const runs = icon.rows.reduce((n, row) => n + (row.match(/([^.])\1*/g) || []).length, 0);
    assert.equal(rects.length, runs, `${e} one rect per run`);
    const pixels = icon.rows.join('').replace(/\./g, '').length;
    assert.ok(rects.length < pixels, `${e} merges pixels into runs`);
    for (const r of rects) assert.equal(r.h, 1);
  }
});

test('html() uses the pixel icon when there is one and an escaped emoji span otherwise', () => {
  assert.equal(html('🍜'), svg('🍜'));
  assert.equal(html('☕' + VS16), svg('☕'));
  assert.ok(html('🍜', { decorative: true }).includes('aria-hidden="true"'));
  assert.equal(html('🦄'), '<span class="cc-emoji">🦄</span>');
  assert.equal(html('<script>'), '<span class="cc-emoji">&lt;script&gt;</span>');
  assert.equal(html(`&"'`), '<span class="cc-emoji">&amp;&quot;&#39;</span>');
  assert.equal(html(''), '');
  assert.equal(html(null), '');
});

test('text() escapes the string and swaps known emoji for decorative icons', () => {
  const out = text('a<b 🍜 c🦄');
  assert.equal(count(out, '<svg'), 1);
  assert.ok(out.startsWith('a&lt;b <svg class="cc-px"'));
  assert.ok(out.includes('aria-hidden="true"'));
  assert.ok(out.endsWith('</svg> c🦄'));
  assert.ok(!out.includes('<b'));

  const both = text('☀' + VS16 + ' then ☀');
  assert.equal(count(both, '<svg'), 2);
  assert.ok(!both.includes(VS16), 'variation selector consumed with its emoji');

  const hostile = text('<img src=x onerror=alert(1)> 🔒');
  assert.ok(!hostile.includes('<img'));
  assert.equal(count(hostile, '<svg'), 1);

  // ZWJ sequences and skin tones are different emoji: left as text, untouched.
  const pilot = cp(0x1F469) + ZWJ + '✈' + VS16;
  const toned = '🏃' + cp(0x1F3FD);
  const runner = '🏃' + ZWJ + cp(0x2640) + VS16;
  const mixed = `${pilot} ${toned} ${runner}`;
  assert.equal(text(mixed), mixed);

  assert.equal(text(`"'&`), '&quot;&#39;&amp;');
  assert.equal(text(''), '');
  assert.equal(text(null), '');
  assert.ok(text('🌙', { decorative: false }).includes('role="img" aria-label="Good night"'));
});
