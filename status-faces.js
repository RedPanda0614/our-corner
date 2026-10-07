// Status-only portraits inspired by simple, expressive coloured faces.
// Keep emoji keys stable: a saved status stores its emoji, not an icon filename.
(() => {
  'use strict';

  const ink = '#27302d';
  const path = (d, width = 3.4) => `<path d="${d}" fill="none" stroke="${ink}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const dot = (x, y, r = 2.5) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${ink}"/>`;
  const blush = '<ellipse cx="16" cy="38" rx="4" ry="2.2" fill="#e67983" opacity=".36"/><ellipse cx="48" cy="38" rx="4" ry="2.2" fill="#e67983" opacity=".36"/>';
  const eyes = {
    dots: dot(23, 29) + dot(41, 29),
    wide: dot(23, 29, 3.4) + dot(41, 29, 3.4),
    closed: path('M18 29q5 5 10 0M36 29q5 5 10 0', 3),
    half: path('M19 30h9M36 30h9', 3.2),
    worried: path('M18 26l9-4M37 22l9 4', 3) + dot(23, 30, 2.2) + dot(41, 30, 2.2),
    angry: path('M18 23l10 5M46 23l-10 5', 3.8) + dot(24, 32, 2.2) + dot(40, 32, 2.2),
    glasses: '<circle cx="23" cy="29" r="7" fill="none" stroke="#27302d" stroke-width="3"/><circle cx="41" cy="29" r="7" fill="none" stroke="#27302d" stroke-width="3"/>' + path('M30 29h4', 2.5) + dot(23, 29, 1.7) + dot(41, 29, 1.7),
    sparkle: path('M19 26l8 6M27 26l-8 6M37 26l8 6M45 26l-8 6', 2.6)
  };
  const mouths = {
    smile: path('M23 40q9 9 18 0'),
    tiny: path('M27 41q5 4 10 0', 3),
    flat: path('M24 42h16'),
    droop: path('M25 43q7-5 14 0'),
    wavy: path('M22 43q4-4 8 0t8 0t5 0', 3),
    open: '<ellipse cx="32" cy="43" rx="4" ry="6" fill="none" stroke="#27302d" stroke-width="3"/>',
    grin: '<path d="M21 39q11 14 22 0z" fill="#fffaf5" stroke="#27302d" stroke-width="3" stroke-linejoin="round"/>',
    cat: path('M27 39v4q5 5 10 0v-4', 3),
    sideways: path('M26 43l12-3', 3.2)
  };
  const heart = '<path d="M49 16c-3-5-9-1-7 3l7 7 7-7c2-4-4-8-7-3z" fill="#e9819b" stroke="#27302d" stroke-width="2"/>';
  const tear = '<path d="M47 32c-2 4-4 7-4 10a4 4 0 0 0 8 0c0-3-2-6-4-10z" fill="#77b5d6"/>';
  const spark = path('M49 15v9M45 19h8', 2.5);
  const badge = {
    hug: path('M12 41q-4 9 5 11l7-2M52 41q4 9-5 11l-7-2', 3.2),
    bowl: path('M46 21h12q-1 6-6 6t-6-6M48 17q-2-3 1-5M54 17q-2-3 1-5', 2.4),
    car: path('M45 24h14v-6h-3l-2-4h-5l-2 4h-2z', 2.3) + dot(49, 25, 1.5) + dot(56, 25, 1.5),
    plane: path('M44 20l15-8-5 10-5 1-2 5-2-8z', 2.4),
    book: path('M46 15q4-2 7 1v10q-3-3-7-1zM53 16q3-3 6-1v10q-3-1-6 1z', 2.1),
    game: path('M46 18q-2 1-3 8l4 1 3-3h5l3 3 3-1q-1-8-4-8zM48 21h5M50 19v5', 2),
    bubbles: '<circle cx="50" cy="17" r="3" fill="none" stroke="#27302d" stroke-width="2"/><circle cx="57" cy="24" r="2" fill="none" stroke="#27302d" stroke-width="1.7"/>',
    headphones: path('M44 24v-5q0-8 8-8t8 8v5M44 22v5h4v-5zM56 22v5h4v-5z', 2.4),
    moon: '<path d="M48 13a7 7 0 1 0 9 10 8 8 0 0 1-9-10z" fill="#fff5c2" stroke="#27302d" stroke-width="1.5"/>'
  };

  // Each entry changes both colour and expression. Small marks distinguish
  // activity choices that cannot be conveyed by a face alone.
  const FACES = {
    '🌟': { color: '#f7d65c', face: eyes.dots + mouths.cat + spark },
    '🪫': { color: '#a9c4d5', face: eyes.half + mouths.droop + path('M18 20h9', 2.3) },
    '😰': { color: '#b9a3c8', face: eyes.worried + mouths.wavy + tear },
    '🫂': { color: '#f3aeb9', face: eyes.closed + mouths.smile + blush + badge.hug },
    '💬': { color: '#8fc7bf', face: eyes.wide + mouths.open + path('M48 15h7M49 20h5', 2.4) },
    '⌛': { color: '#e7d3ae', face: eyes.half + mouths.flat + path('M48 16h7M50 20h5', 2.2) },
    '😢': { color: '#86b7d2', face: eyes.dots + mouths.droop + tear },
    '😴': { color: '#f1b4be', face: eyes.closed + mouths.open + path('M48 16h6l-6 6h6', 2.2) },
    '💼': { color: '#d9ac82', face: eyes.angry + mouths.flat + path('M47 17h8v7h-8zM49 14h4', 2.2) },
    '🍜': { color: '#f5d0a2', face: eyes.closed + mouths.open + blush + badge.bowl },
    '🚗': { color: '#9bc6df', face: eyes.wide + mouths.smile + badge.car },
    '🥰': { color: '#f1b5bf', face: eyes.dots + mouths.cat + blush + heart },
    '🤒': { color: '#b7c6a1', face: eyes.half + mouths.wavy + '<rect x="46" y="17" width="10" height="4" rx="2" fill="#f5eee4" stroke="#27302d" stroke-width="2"/>' },
    '📚': { color: '#b7afe0', face: eyes.glasses + mouths.tiny + badge.book },
    '🏃': { color: '#e8ae8c', face: eyes.angry + mouths.grin + tear },
    '🎮': { color: '#b5a6d9', face: eyes.sparkle + mouths.grin + badge.game },
    '🛁': { color: '#a4d4c7', face: eyes.closed + mouths.tiny + blush + badge.bubbles },
    '🎧': { color: '#c9b9e4', face: eyes.closed + mouths.smile + badge.headphones },
    '😤': { color: '#a7b580', face: eyes.angry + mouths.sideways + path('M47 40q5-3 8 0', 2.3) },
    '✈': { color: '#8fb9d7', face: eyes.wide + mouths.grin + badge.plane },
    '🌙': { color: '#d7b6d7', face: eyes.closed + mouths.tiny + badge.moon }
  };
  const blobs = [
    'M32 7C45 5 54 14 56 27c3 15-5 27-18 30C23 60 9 52 8 38 6 24 13 9 27 7c2 0 3 0 5 0z',
    'M31 7c14-2 24 8 25 21 2 15-6 27-21 29C20 59 8 51 8 37 7 21 15 9 31 7z',
    'M31 8c15-3 25 7 26 22 1 15-7 26-23 27C18 58 8 49 8 35 8 21 16 10 31 8z'
  ];
  function key(emoji) { return String(emoji || '').replace(/\uFE0F/g, '').trim(); }
  function has(emoji) { return Object.prototype.hasOwnProperty.call(FACES, key(emoji)); }
  function html(emoji) {
    const k = key(emoji), item = FACES[k];
    if (!item) return '';
    const index = Object.keys(FACES).indexOf(k);
    return `<svg class="cc-status-face" viewBox="0 0 64 64" width="64" height="64" aria-hidden="true" focusable="false"><path d="${blobs[index % blobs.length]}" fill="${item.color}"/><path d="M17 17q8-8 17-7" fill="none" stroke="#fff" stroke-opacity=".24" stroke-width="3" stroke-linecap="round"/>${item.face}</svg>`;
  }
  const api = { FACES, key, has, html };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.CCStatusFaces = api;
})();
