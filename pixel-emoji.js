// Pixel-art emoji for the retro UI (status presets, weather moods, lock, cup, hourglass).
// Data keeps plain emoji characters; only rendering swaps to 16x16 pixel icons. Emoji without a
// pixel version render as normal text, so html()/text() are safe for any user input.
//
//   CCPixelEmoji.html('🍜')              -> <svg class="cc-px" ...> (labelled "Eating")
//   CCPixelEmoji.html('🦄')              -> <span class="cc-emoji">🦄</span>
//   CCPixelEmoji.text('走了 🏃 <3')       -> escaped text with decorative pixel icons inline
//
// The page should add this CSS (icons scale with the surrounding font size):
//   .cc-px { width: 1.25em; height: 1.25em; vertical-align: -0.25em; image-rendering: pixelated; }
//
// Palette key `k` is the 1px outline. It reads the CSS variable --px-outline (default #3b3b36,
// a fixed dark ink in both themes), so a theme can override it, e.g.
//   #couple-corner[data-dark=true] .cc-px { --px-outline: #2a2d26; }
// Small features inside filled areas (eyes, mouths, keyhole) use the fixed dark `d`.
(() => {
  'use strict';

  const PALETTE = {
    k: 'var(--px-outline, #3b3b36)', // outline (themeable)
    d: '#3d4336', // fixed dark ink for features on fills
    w: '#fffef5', // cream highlight
    y: '#fce9a4', // butter yellow
    Y: '#f0c35e', // honey
    o: '#f4a86a', // peach
    f: '#fcd9ae', // face
    F: '#f0b27e', // face shade
    p: '#f7b8c6', // pink
    r: '#e56f86', // rose
    R: '#bf5670', // rose shade
    c: '#eef2f5', // cloud
    g: '#c6d0da', // cloud shade
    G: '#8f9dad', // storm grey
    b: '#a4c8ea', // sky blue
    B: '#6f96c8', // deep blue
    m: '#c2dca6', // matcha light
    M: '#88ae6c', // matcha
    l: '#d9cbf1', // lilac
    L: '#a88ddb', // lilac deep
    n: '#d49d6c', // wood / leather
    N: '#9b6645', // dark brown
    s: '#dde1dc', // silver
    S: '#a2ada5', // silver shade / steam
  };

  // 16x16 grids, one string per row. '.' is transparent; every other char is a PALETTE key.
  // Keys are the emoji without the U+FE0F variation selector.
  const ICONS = {
    // Status presets
    '😴': { name: { en: 'Sleepy', zh: '犯困' }, rows: [
      '............LLLL',
      '.....kkkkkk...L.',
      '...kkffffffkkL..',
      '..kfwwffffffLLLL',
      '..kwfffffffffk..',
      '.kffffffffffffk.',
      '.kffffffffffffk.',
      '.kfdffffffffdfk.',
      '.kffddffffddffk.',
      '.kfffffffffffFk.',
      '.kfffffddffffFk.',
      '..kffffddfffFk..',
      '..kffffffffFFk..',
      '...kkFFFFFFkk...',
      '.....kkkkkk.....',
      '................',
    ]},
    '💼': { name: { en: 'Busy', zh: '忙碌' }, rows: [
      '................',
      '.....kkkkkk.....',
      '....kNNNNNNk....',
      '....kNk..kNk....',
      '..kkkkkkkkkkkk..',
      '.kwnnnnnnnnnnnk.',
      '.knnnnnnnnnnnnk.',
      '.knnnnnnnnnnnnk.',
      '.kNNNNNkkNNNNNk.',
      '.knnnnkYYknnnnk.',
      '.knnnnnkknnnnnk.',
      '.knnnnnnnnnnnnk.',
      '.knnnnnnnnnnnNk.',
      '..kkkkkkkkkkkk..',
      '................',
      '................',
    ]},
    '🍜': { name: { en: 'Eating', zh: '干饭' }, rows: [
      '................',
      '..S..S.......N..',
      '...S..S.....N.N.',
      '...S..S....N.N..',
      '..S..S....N.N...',
      '.........N.N....',
      '..kkkkkkNkNkkk..',
      '.kyyYyyNyNyyYyk.',
      '.kkkkkkkkkkkkkk.',
      '.krrrrrrrrrrrrk.',
      '.kwwwwwwwwwwwsk.',
      '..kwwwwwwwwwsk..',
      '...kwwwwwwwsk...',
      '....kkkkkkkk....',
      '.....kSSSSk.....',
      '.....kkkkkk.....',
    ]},
    '🚗': { name: { en: 'On my way', zh: '在路上' }, rows: [
      '................',
      '................',
      '................',
      '.....kkkkkk.....',
      '....kwbkbbbk....',
      '...kbbbkbbbbk...',
      '.kkkkkkkkkkkkkk.',
      '.kwrrrrrrrrrrrk.',
      '.krrrrrrrrrrryk.',
      '.kRRkkRRRRkkRRk.',
      '.kkksskkkksskkk.',
      '...kssk..kssk...',
      '....kk....kk....',
      '................',
      '................',
      '................',
    ]},
    '🥰': { name: { en: 'Missing you', zh: '想你' }, rows: [
      '..........kk.kk.',
      '.....kkkkkrrkrrk',
      '...kkffffkprrrrk',
      '..kfwwffffkrrrk.',
      '..kwfffffffkrk..',
      '.kffffffffffkfk.',
      '.kfffdffffdfffk.',
      '.kffdfdffdfdffk.',
      '.kffffffffffffk.',
      '.kfppffffffppFk.',
      'kkfkfdffffdffFk.',
      'krkrkfddddffFk..',
      'kprrkffffffFFk..',
      '.krkkFFFFFFkk...',
      '..k..kkkkkk.....',
      '................',
    ]},
    '🤒': { name: { en: 'Unwell', zh: '不舒服' }, rows: [
      '................',
      '.....kkkkkk.....',
      '..kkkkkkkkkkkk..',
      '..kwbwwwwwwbwk..',
      '..kcbccccccbgk..',
      '.kkkkkkkkkkkkkk.',
      '.kffffffffffffk.',
      '.kffFFFffFFFffk.',
      '.kffdddffdddffk.',
      '.kfrrffffffrrFk.',
      '.kfppffffffppFk.',
      '..kffdfddfdfFk..',
      '..kfffdffdfFFk..',
      '...kkFFFFFFkk...',
      '.....kkkkkk.....',
      '................',
    ]},
    '📚': { name: { en: 'Studying', zh: '学习中' }, rows: [
      '................',
      '................',
      '...kkkkkkkkkk...',
      '...klLllLlwwk...',
      '...klLllLlssk...',
      '...kLLLLLLwwk...',
      '.kkkkkkkkkkkkk..',
      '.kwwmmMmmmMmmk..',
      '.kssmmMmmmMmmk..',
      '.kwwMMMMMMMMMk..',
      '..kkkkkkkkkkkkk.',
      '..koFoooooFowwk.',
      '..koFoooooFossk.',
      '..kFFFFFFFFFwwk.',
      '..kkkkkkkkkkkkk.',
      '................',
    ]},
    '🏃': { name: { en: 'Working out', zh: '运动' }, rows: [
      '................',
      '.........kkk....',
      '........kfffk...',
      '........kfffk...',
      '.........kkk....',
      '.......kkkk.....',
      '......kookkk....',
      '.....kooookok...',
      '....koookkkok...',
      '...kok.kok.kk...',
      '....k.kSSk......',
      '.....kSSkSk.....',
      '....kSSk.kSk....',
      '...kSSk...kSk...',
      '...kkk....kkkk..',
      '................',
    ]},
    '🎮': { name: { en: 'Gaming', zh: '游戏' }, rows: [
      '................',
      '................',
      '................',
      '...kkkkkkkkkk...',
      '..kwlllllllllk..',
      '.klldllllllrllk.',
      '.kldddllllrlrlk.',
      '.klldllllllrllk.',
      '.kllllllllllllk.',
      '.kLLLLkkkkLLLLk.',
      '.kLLLk....kLLLk.',
      '..kkk......kkk..',
      '................',
      '................',
      '................',
      '................',
    ]},
    '🛁': { name: { en: 'Relaxing', zh: '放松' }, rows: [
      '................',
      '.kkkk......kkk..',
      '.kssk.....kwcck.',
      '.kskk.....kccck.',
      '.ksk.kk....kkk..',
      '.ksk.kwk........',
      '.kkkkkkkkkkkkkk.',
      '.kbbbwwbbbwbbbk.',
      '.kkkkkkkkkkkkkk.',
      '.kwcccccccccggk.',
      '..kcccccccccgk..',
      '...kccccccggk...',
      '....kkkkkkkk....',
      '....kSk..kSk....',
      '....kk....kk....',
      '................',
    ]},
    '🎧': { name: { en: 'Music on', zh: '听歌' }, rows: [
      '................',
      '.....kkkkkk.....',
      '...kkLLLLLLkk...',
      '..kLLkkkkkkLLk..',
      '.kLLk......kLLk.',
      '.kLk........kLk.',
      '.kLk........kLk.',
      '.kkkkkk..kkkkkk.',
      '.kwpprk..krpppk.',
      '.kpppdk..kdpppk.',
      '.kpppdk..kdpppk.',
      '.kpppdk..kdpppk.',
      '.krrrrk..krrrrk.',
      '..kkkk....kkkk..',
      '................',
      '................',
    ]},
    '😤': { name: { en: 'Grumpy', zh: '有点烦' }, rows: [
      '................',
      '.....kkkkkk.....',
      '...kkffffffkk...',
      '..kddwfffffddk..',
      '..kwfddffddffk..',
      '.kffdffffffdffk.',
      '.kfffddffddfffk.',
      '.kffdffffffdffk.',
      '.kfkkffffffkkfk.',
      '.kkwwkffffkwwkk.',
      'kwwccwkffkwccwwk',
      'wcccggkffkggcccw',
      'kgggkkddddkkgggk',
      '.kkkkdFFFFdkkkk.',
      '.....kkkkkk.....',
      '................',
    ]},
    '✈': { name: { en: 'Travelling', zh: '出行' }, rows: [
      '................',
      '................',
      '...........kk...',
      '..........kwsk..',
      '.........kwsSk..',
      '...kkkkkkwsSk...',
      '..kbbbbbwsSk....',
      '..kbbbbwsSk.....',
      '...kkkwsSBk.....',
      '..kkkwsSBBk.....',
      '.kbbwsSkBBk.....',
      '..kwsSkkBBk.....',
      '..ksSBkkBBk.....',
      '...kkBk.kk......',
      '.....k..........',
      '................',
    ]},
    '🌙': { name: { en: 'Good night', zh: '晚安' }, rows: [
      '................',
      '......k.........',
      '....kkyk........',
      '...kwyk.........',
      '..kwwyk.........',
      '..kwyyk.........',
      '.kwyyk..........',
      '.kyyyyk.........',
      '.kyyyyk.........',
      '.kyyyyyk........',
      '..kyyyyykkkkk...',
      '..kyyyyyyYYYYk..',
      '...kyYYYYYYYk...',
      '....kkYYYYkk....',
      '......kkkk......',
      '................',
    ]},
    // Weather moods
    '☀': { name: { en: 'Sunny', zh: '晴' }, rows: [
      '................',
      '.......YY.......',
      '..Y....YY....Y..',
      '...Y........Y...',
      '......kkkk......',
      '.....kwyyyk.....',
      '....kwyyyyyk....',
      '.YY.kyyyyyyk.YY.',
      '.YY.kyyyyyyk.YY.',
      '....kyyyyyYk....',
      '.....kyyyYY.....',
      '......kkkk......',
      '...Y........Y...',
      '..Y....YY....Y..',
      '.......YY.......',
      '................',
    ]},
    '🌤': { name: { en: 'Mostly sunny', zh: '多云转晴' }, rows: [
      '................',
      '......YY........',
      '..Y.........Y...',
      '...Y.kkkk..Y....',
      '....kwyyyk......',
      '...kwyyyyyk.....',
      '.YYkyyyyyyk.....',
      '.YYkyyyyyykkk...',
      '...kyyyyykwcck..',
      '....kykkkccccck.',
      '.....kwccccccck.',
      '...Y.kcccccccck.',
      '..Y..kggggggggk.',
      '......kkkkkkkk..',
      '................',
      '................',
    ]},
    '☁': { name: { en: 'Cloudy', zh: '多云' }, rows: [
      '................',
      '................',
      '................',
      '.......kkkk.....',
      '......kwwcck....',
      '.....kwcccccck..',
      '..kkkkcccccckk..',
      '.kcwcccccccccck.',
      '.kcccccccccccck.',
      '.kcccccccccccck.',
      '.kcccccccccccck.',
      '.kggggggggggggk.',
      '..kkkkkkkkkkkk..',
      '................',
      '................',
      '................',
    ]},
    '🌧': { name: { en: 'Rainy', zh: '小雨' }, rows: [
      '................',
      '......kkkkkk....',
      '......kwwcck....',
      '...kkkcwcccck...',
      '..kccccccccck...',
      '..kcwcccccccck..',
      '..kcccccccccck..',
      '..kcccccccccck..',
      '..kggggggggggk..',
      '..kkkkkkkkkkkk..',
      '...B....B....B..',
      '..B....B....B...',
      '................',
      '.....B....B.....',
      '....B....B......',
      '................',
    ]},
    '⛈': { name: { en: 'Stormy', zh: '雷阵雨' }, rows: [
      '................',
      '......kkkkkk....',
      '......kccggk....',
      '...kkkgcggggk...',
      '..kgggggggggk...',
      '..kgcggggggggk..',
      '..kggggggggggk..',
      '..kggggggggggk..',
      '..kGGGGGGGGGGk..',
      '..kkkkkkyYkkkk..',
      '...B..kyYk...B..',
      '..B..kyyyYk.B...',
      '......kyYk......',
      '...B.kyYk....B..',
      '..B..kYk....B...',
      '......k.........',
    ]},
    // Misc
    '🔒': { name: { en: 'Locked', zh: '已上锁' }, rows: [
      '................',
      '.....kkkkkk.....',
      '....kssssssk....',
      '...ksskkkkssk...',
      '...kssk..kssk...',
      '...kssk..kSsk...',
      '..kkkkkkkkkkkk..',
      '..kwyyyyyyyyYk..',
      '..kyyyyyyyyyYk..',
      '..kyyyyddyyyYk..',
      '..kyyyddddyyYk..',
      '..kyyyyddyyyYk..',
      '..kyyyyddyyyYk..',
      '..kYYYYYYYYYYk..',
      '..kkkkkkkkkkkk..',
      '................',
    ]},
    '☕': { name: { en: 'Hot drink', zh: '热饮' }, rows: [
      '................',
      '....S..S........',
      '.....S..S.......',
      '.....S..S.......',
      '....S..S........',
      '................',
      '..kkkkkkkkkk....',
      '..kNNNNNNNNkkk..',
      '..kwmmmmmmmkmmk.',
      '..kmmmmmmmmk.mk.',
      '..kmmmmmmmmkmmk.',
      '...kmmmmmMkkkk..',
      '.kkkkkkkkkkkkk..',
      '..kssssssssSk...',
      '...kkkkkkkkk....',
      '................',
    ]},
    '⌛': { name: { en: 'Hourglass', zh: '沙漏' }, rows: [
      '................',
      '..kkkkkkkkkkkk..',
      '..knnnnnnnnnNk..',
      '..kkkkkkkkkkkk..',
      '...kwccccccck...',
      '....kwcccck.....',
      '.....kccck......',
      '......kyk.......',
      '......kyk.......',
      '.....kcyck......',
      '....kcyyyyk.....',
      '...kyyyyyyYk....',
      '..kkkkkkkkkkkk..',
      '..knnnnnnnnnNk..',
      '..kkkkkkkkkkkk..',
      '................',
    ]},
  };

  const VS16 = '\uFE0F';
  const VS15 = '\uFE0E';
  const ZWJ = '\u200D';
  const KEYCAP = '\u20E3';
  const own = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = value => String(value).replace(/[&<>"']/g, ch => ESC[ch]);

  function key(ch) {
    return String(ch == null ? '' : ch).split(VS16).join('').trim();
  }

  function has(ch) {
    return own(ICONS, key(ch));
  }

  // Each horizontal run of same-colour pixels becomes one <rect>.
  const bodies = new Map();
  function body(k) {
    if (bodies.has(k)) return bodies.get(k);
    let out = '';
    ICONS[k].rows.forEach((row, y) => {
      for (let x = 0; x < row.length;) {
        const c = row[x];
        let end = x + 1;
        while (end < row.length && row[end] === c) end++;
        if (c !== '.' && own(PALETTE, c)) out += `<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${PALETTE[c]}"/>`;
        x = end;
      }
    });
    bodies.set(k, out);
    return out;
  }

  function svg(ch, opts) {
    opts = opts || {};
    const k = key(ch);
    if (!own(ICONS, k)) return '';
    const a11y = opts.decorative
      ? 'aria-hidden="true"'
      : `role="img" aria-label="${esc(opts.label != null ? opts.label : ICONS[k].name.en)}"`;
    return `<svg class="cc-px" viewBox="0 0 16 16" width="16" height="16" shape-rendering="crispEdges" ${a11y} focusable="false">${body(k)}</svg>`;
  }

  function html(ch, opts) {
    opts = opts || {};
    if (ch == null || ch === '') return '';
    const icon = svg(ch, opts);
    if (icon) return icon;
    const a11y = opts.decorative ? ' aria-hidden="true"' : opts.label != null ? ` role="img" aria-label="${esc(opts.label)}"` : '';
    return `<span class="cc-emoji"${a11y}>${esc(ch)}</span>`;
  }

  // Code points of each key, longest first, for scanning free text.
  let keyCps = null;
  const isTone = cp => cp != null && cp.codePointAt(0) >= 0x1F3FB && cp.codePointAt(0) <= 0x1F3FF;
  function matchAt(cps, i) {
    if (cps[i - 1] === ZWJ) return 0; // tail of a ZWJ sequence, e.g. woman + ZWJ + airplane = pilot
    if (!keyCps) keyCps = Object.keys(ICONS).map(k => Array.from(k)).sort((a, b) => b.length - a.length);
    for (const parts of keyCps) {
      let j = i;
      let ok = true;
      for (const cp of parts) {
        if (cps[j] !== cp) { ok = false; break; }
        j++;
        if (cps[j] === VS16) j++;
      }
      if (!ok) continue;
      const next = cps[j];
      // A ZWJ sequence, skin tone, keycap or text-style request is a different emoji: leave it as text.
      if (next === ZWJ || next === VS15 || next === KEYCAP || isTone(next)) continue;
      return j - i;
    }
    return 0;
  }

  // Escapes the whole string and swaps every known emoji for its pixel icon (decorative by
  // default, since the surrounding text carries the meaning; pass { decorative: false } for labels).
  function text(str, opts) {
    opts = opts || {};
    const cps = Array.from(str == null ? '' : String(str));
    const iconOpts = { decorative: opts.decorative !== false };
    let out = '';
    let plain = '';
    for (let i = 0; i < cps.length;) {
      const len = matchAt(cps, i);
      if (len) {
        out += esc(plain) + svg(cps.slice(i, i + len).join(''), iconOpts);
        plain = '';
        i += len;
      } else {
        plain += cps[i++];
      }
    }
    return out + esc(plain);
  }

  const api = { PALETTE, ICONS, key, has, svg, html, text };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.CCPixelEmoji = api;
})();
