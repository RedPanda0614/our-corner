(() => {
  'use strict';
  const root = document.getElementById('couple-corner');
  const $ = sel => root.querySelector(sel);
  const $$ = sel => [...root.querySelectorAll(sel)];
  const cfg = window.CC_CONFIG || {};
  const store = CCStore.create(cfg);
  { // stamp every edit so the other person gets a message about it; { quiet: true } is for housekeeping that isn't an edit
    const rawUpdate = store.update;
    store.update = (col, id, patch, opts = {}) => rawUpdate(col, id, opts.quiet ? patch : { ...patch, updatedAt: Date.now(), updatedBy: PEOPLE[ui.me] || '', updatedWhat: Object.keys(patch).join(',') });
  }
  const PAGES = ['home', 'diary', 'album', 'todo', 'wishlist'];
  const PEOPLE = { sijie: '斯婕', zhenzhen: '真真' };
  const PLAYER_NICKNAMES = { sijie: 'bibo', zhenzhen: 'bobi' };
  const PLAYER_BUBBLES = { sijie: '宝宝一', zhenzhen: '宝宝二' };
  const nameToKey = name => Object.keys(PEOPLE).find(k => PEOPLE[k] === name) || 'sijie';

  // ---------- small helpers ----------
  const ls = {
    get(k, d) { try { const v = localStorage.getItem('olc:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('olc:' + k, JSON.stringify(v)); } catch {} }
  };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const now = new Date();
  let today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const currentDay = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const utcDay = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const dayISO = d => d.toISOString().slice(0, 10);
  const validDay = iso => /^\d{4}-\d{2}-\d{2}$/.test(iso) && Number.isFinite(+utcDay(iso)) && dayISO(utcDay(iso)) === iso;
  const shiftDay = (iso, n) => { const d = utcDay(iso); d.setUTCDate(d.getUTCDate() + n); return dayISO(d); };
  const shiftMonth = (ym, n) => { const d = utcDay(ym + '-01'); d.setUTCMonth(d.getUTCMonth() + n); return dayISO(d).slice(0, 7); };
  const niceDate = (iso, o = { month: 'short', day: 'numeric', year: 'numeric' }) => new Intl.DateTimeFormat('en-US', { ...o, timeZone: 'UTC' }).format(utcDay(iso));
  const timestamp = (ms, fallbackDate = '') => {
    const value = Number(ms);
    if (!Number.isFinite(value) || value <= 0) return fallbackDate ? niceDate(fallbackDate) : '';
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(value).map(p => [p.type, p.value]));
    return `${parts.month} ${parts.day}, ${parts.year} · ${parts.hour}:${parts.minute}`;
  };
  const weekStart = iso => shiftDay(iso, -((utcDay(iso).getUTCDay() + 6) % 7));
  const daysBetween = (a, b) => Math.round((utcDay(b) - utcDay(a)) / 86400000);
  const countdown = d => { const n = daysBetween(today, d); return n === 0 ? 'Today!' : n > 0 ? `In ${n} day${n === 1 ? '' : 's'}` : `${-n} day${n === -1 ? '' : 's'} ago`; };
  // ---------- pure helpers (tests/app-helpers.test.cjs runs this block on its own, so nothing in it may use page state) ----------
  // Synced data can come from another device, so a picture from it only goes into src="…" or url("…") if it is a
  // base64 PNG/JPEG/GIF/WebP data URL (or, where allowBlob, a blob: URL this page made); anything else becomes ''.
  // What passes holds no quotes, brackets, spaces or backslashes.
  const safeImage = (url, allowBlob = true) => {
    if (typeof url !== 'string') return '';
    const head = /^data:image\/(?:png|jpeg|gif|webp);base64,/.exec(url);
    if (head) { const bad = /[^A-Za-z0-9+/=]/g; bad.lastIndex = head[0].length; return url.length > head[0].length && !bad.test(url) ? url : ''; }
    return allowBlob && /^blob:https?:\/\/[\w.:[\]-]+\/[\w-]+$/.test(url) ? url : '';
  };
  const safeColor = c => (typeof c === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(c) ? c : ''); // colours go into style values
  const isLeapYear = y => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  // where a yearly date (YYYY-MM-DD) falls in a given year: Feb 29 is kept on Mar 1 in years without one
  const yearlyDay = (date, year) => (date.slice(5) === '02-29' && !isLeapYear(year) ? `${year}-03-01` : `${year}-${date.slice(5)}`);
  // the next time a valid yearly date comes round, on or after `from`
  const nextYearly = (date, from) => { const y0 = Math.max(+from.slice(0, 4), +date.slice(0, 4)); for (let y = y0; y < y0 + 9; y++) { const d = yearlyDay(date, y); if (d >= from) return d; } return date; };
  // ---------- end pure helpers ----------
  const repeatDate = item => (item.repeat && validDay(item.date || '') ? nextYearly(item.date, today) : item.date);
  const kindLabel = k => ({ plan: 'PLAN', trip: 'TRIP', task: 'LITTLE THING', birthday: 'BIRTHDAY', holiday: 'HOLIDAY', anniversary: 'ANNIVERSARY' })[k] || 'PLAN';
  const statusLabel = s => ({ dreaming: 'Dreaming', planning: 'Planning', booked: 'Booked', visited: 'Visited' })[s];
  const newId = CCStore.uid;
  const { paginate, pageForItem } = CCPagination;
  const Q = CCQuestions;
  const A = window.CCAchievements || null; // the shelf stays hidden if achievements.js is missing
  // the daily question follows this device's date; the local preview can pretend with ?day=YYYY-MM-DD
  const previewDay = store.mode === 'local' ? new URLSearchParams(location.search).get('day') : null;
  const qDay = () => (previewDay && validDay(previewDay) ? previewDay : currentDay());
  const localMidnight = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };

  // ---------- state ----------
  const data = { events: [], trips: [], tasks: [], dates: [], wishes: [], diary: [], photos: [], albums: [], answers: [], questions: [], checkins: [], meta: {} };
  // Skins: shift the hue (dh) and scale the saturation (s) of each colour family in style.css / app.css.
  // c = contrast (1 normal), dark = invert lightness.
  const T = (id, zh, group, g, a, l, p, c = 1, dark = false) => ({ id, zh, group, v: { g, a, l, p }, lo: dark ? 50 * (1 + c) : 50 * (1 - c), lk: dark ? -c : c });
  const THEMES = [
    T('matcha', '抹茶橘子', 'light', [0, 1.7], [0, 1.4], [0, 1.3], [0, 1.2]),
    T('matchahigh', '抹茶橘子 · 高对比', 'light', [0, 1.9], [0, 1.6], [0, 1.4], [0, 1.1], 1.2),
    T('nightmatcha', '夜抹茶', 'dark', [0, 1.5], [0, 1.5], [0, 1.2], [0, 1], 0.95, true),
    T('nighthigh', '夜抹茶 · 高对比', 'dark', [0, 2], [0, 1.9], [0, 1.5], [0, 1.1], 1.25, true)
  ];
  function currentMode() {
    const m = data.meta.mode; if (m) return { dark: !!m.dark, high: !!m.high };
    return { dark: /night|dark/.test(data.meta.theme || ''), high: false };   // older saved skins
  }
  const themeFor = m => (m.dark ? (m.high ? 'nighthigh' : 'nightmatcha') : (m.high ? 'matchahigh' : 'matcha'));
  const themeVars = t => Object.entries(t.v).map(([f, [dh, sat]]) => `--${f}-dh:${dh}deg;--${f}-s:${sat}`).join(';') + `;--lo:${t.lo}%;--lk:${t.lk}`;
  const KINDS = [['plan', 'Plan'], ['trip', 'Trip'], ['task', 'Little thing'], ['birthday', 'Birthday'], ['holiday', 'Holiday'], ['anniversary', 'Anniversary']];
  const DEFAULT_KIND_COLORS = { plan: '#6fa35a', trip: '#f08a4b', task: '#9a7ad8', birthday: '#e0506a', holiday: '#e8b33c', anniversary: '#d85fb0' };
  const SWATCHES = ['#e0506a', '#f06a8f', '#d85fb0', '#9a7ad8', '#6c6fd8', '#4a9fd8', '#3fae9c', '#6fa35a', '#a8c43c', '#e8b33c', '#f08a4b', '#b0714a', '#8a8f98', '#3d4a5c'];
  const kindColor = k => safeColor((data.meta.kindColors || {})[k]) || DEFAULT_KIND_COLORS[k];
  const safeKind = k => (KINDS.some(([key]) => key === k) ? k : 'plan'); // kinds from synced data end up in class="k-…"
  let heroArt = null; // the top picture's link as last set
  function applyTheme() {
    const t = THEMES.find(x => x.id === themeFor(currentMode())) || THEMES[0];
    for (const [f, [dh, sat]] of Object.entries(t.v)) { root.style.setProperty(`--${f}-dh`, dh + 'deg'); root.style.setProperty(`--${f}-s`, sat); }
    root.style.setProperty('--lo', t.lo + '%'); root.style.setProperty('--lk', t.lk);
    root.dataset.dark = String(t.lk < 0); document.body.style.background = getComputedStyle(root).backgroundColor;
    const hero = linkOf('hero', data.meta.hero ? ui.heroImages[data.meta.hero] : '');
    if (hero !== heroArt) { heroArt = hero; if (hero) root.style.setProperty('--cc-hero-art', `url("${hero}")`); else root.style.removeProperty('--cc-hero-art'); }
    KINDS.forEach(([k]) => root.style.setProperty('--k-' + k, kindColor(k)));
    const bar = getComputedStyle($('.cc-top')).backgroundColor; document.querySelector('meta[name=theme-color]')?.setAttribute('content', bar);
  }
  const ui = {
    page: PAGES.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home',
    collapsed: new Set(ls.get('collapsed', [])),
    sync: store.mode === 'local' ? 'local' : 'connecting',
    user: null,
    me: store.mode === 'local' ? ls.get('me', 'sijie') : null,
    message: null, undo: null, messageTimer: null,
    confirm: null, // key of a two-step delete button
    memory: 0, highlight: null, busy: false, tearView: 0, heroImages: {}, editCaption: false, newEntryOpen: false,
    pages: { diary: 1, todo: 1, wishlist: 1, album: 1, special: 1, questions: 1 },
    album: 'all', albumForm: '', albumDraft: '', questionOpen: false, editingAnswer: null
  };
  // work in progress, counted per form, so one upload finishing never re-enables another form's buttons
  // (ui.busy is left to the profile picture)
  const busy = { diary: 0, entry: 0, album: 0, hero: 0 };
  function pageList(key, items) {
    const result = paginate(items, ui.pages[key]);
    ui.pages[key] = result.page;
    return result;
  }
  function pageNav(key, result) {
    if (result.totalPages < 2) return '';
    const { page, totalPages, start, end, total } = result;
    const pages = [...new Set([1, totalPages, page - 2, page - 1, page, page + 1, page + 2]
      .filter(n => n >= 1 && n <= totalPages))].sort((a, b) => a - b);
    let last = 0;
    const buttons = pages.map(n => {
      const gap = n - last > 1 ? '<span class="cc-page-gap" aria-hidden="true">…</span>' : '';
      last = n;
      return `${gap}<button type="button" class="cc-button" data-page-key="${key}" data-page-number="${n}" ${n === page ? 'aria-current="page"' : ''} aria-label="Page ${n}">${n}</button>`;
    }).join('');
    return `<nav class="cc-pagination" aria-label="${key} pages"><span class="cc-page-range">${start + 1}–${end} / ${total}</span><div class="cc-page-buttons"><button type="button" class="cc-button" data-page-key="${key}" data-page-number="${page - 1}" ${page === 1 ? 'disabled' : ''} aria-label="Previous page">‹</button>${buttons}<button type="button" class="cc-button" data-page-key="${key}" data-page-number="${page + 1}" ${page === totalPages ? 'disabled' : ''} aria-label="Next page">›</button></div></nav>`;
  }
  const pageToolbar = (note, action) => `<div class="cc-page-toolbar"><span class="cc-small">${esc(note)}</span>${action}</div>`;
  const initialSelected = today;
  const planner = {
    view: ls.get('calView', 'month'), month: today.slice(0, 7), year: +today.slice(0, 4), selected: initialSelected,
    filter: 'all', todoFilter: 'all', exportKind: ls.get('exportKind', 'plan'), forms: { event: false, todo: false, wish: false }, specialOpen: false, editing: null,
    drafts: {
      event: { title: '', kind: 'plan', date: today, endDate: '', note: '', repeat: true },
      edit: { title: '', date: '', endDate: '', note: '' },
      todo: { title: '', kind: 'activity', status: 'dreaming', date: '', start: '', end: '', note: '' },
      wish: { title: '', who: 'both', note: '' },
      special: { title: '', kind: 'anniversary', date: '', repeat: true },
      dayedit: { title: '', kind: 'anniversary', date: '', repeat: true },
      entryedit: { text: '', tags: '', photoIds: [], pending: [] },
      ask: { text: '', date: '' }
    }
  };
  const diaryDraft = { text: '', date: today, tags: '', pending: [] };
  const diaryFilter = { q: '', tag: '' };
  const commentDrafts = {};
  const questionDrafts = {};
  const calendarImport = { open: false, file: null, name: '', from: today, to: shiftDay(today, 365), preview: null, error: '', busy: false };

  const meName = () => PEOPLE[ui.me] || '';
  function run(promise, failText = 'Could not save. Please try again.') {
    return Promise.resolve(promise).catch(err => { console.error(err); flash(failText); });
  }

  // ---------- messages ----------
  function flash(text, undo = null) {
    ui.message = text; ui.undo = undo;
    clearTimeout(ui.messageTimer);
    ui.messageTimer = setTimeout(() => { ui.message = null; ui.undo = null; renderMessage(); }, undo ? 9000 : 4000);
    renderMessage();
  }
  function renderMessage() {
    const el = $('#cc-planner-message');
    el.hidden = !ui.message;
    el.innerHTML = ui.message ? `<span>${esc(ui.message)}</span>${ui.undo ? '<button type="button" class="cc-button" data-undo>Undo</button>' : ''}<button type="button" class="cc-button" data-dismiss aria-label="Dismiss">OK</button>` : '';
  }

  // ---------- window chrome ----------
  function minButton(key) {
    const closed = ui.collapsed.has(key);
    return `<button type="button" class="cc-min" data-min="${esc(key)}" aria-expanded="${!closed}" aria-label="${closed ? 'Expand' : 'Minimize'} window">${closed ? '□' : '_'}</button>`;
  }
  function panelShell(key, title, whisper, body, extraClass = '') {
    if (key === 'special-editor') return `<section class="cc-window ${extraClass}" data-win="${esc(key)}"><div class="cc-bar"><span>${esc(title)}</span><button type="button" class="cc-min" data-edit-days aria-label="Close">×</button></div><div class="cc-body">${whisper ? `<p lang="zh-CN" class="cc-page-whisper">${esc(whisper)}</p>` : ''}${body}</div></section>`;
    const closed = ui.collapsed.has(key);
    return `<section class="cc-window ${extraClass} ${closed ? 'cc-collapsed' : ''}" data-win="${esc(key)}"><div class="cc-bar"><span>${esc(title)}</span>${minButton(key)}</div><div class="cc-body" ${closed ? 'hidden' : ''}>${whisper ? `<p lang="zh-CN" class="cc-page-whisper">${esc(whisper)}</p>` : ''}${body}</div></section>`;
  }
  function decorateStaticWindows() {
    $$('section[data-win]').forEach(win => {
      if (win.closest('dialog')) return;
      const key = win.dataset.win, bar = win.querySelector(':scope > .cc-bar');
      bar.querySelector(':scope > .cc-min')?.remove();
      bar.insertAdjacentHTML('beforeend', minButton(key));
      const closed = ui.collapsed.has(key);
      win.classList.toggle('cc-collapsed', closed);
      win.querySelector(':scope > .cc-body').hidden = closed;
    });
  }

  // ---------- form helpers ----------
  const formField = (form, name, label, type = 'text', required = false) => `<label class="cc-field">${esc(label)}<input name="${name}" type="${type}" value="${esc(planner.drafts[form][name] || '')}" ${required ? 'required' : ''} ${type === 'text' ? 'maxlength="100"' : ''}></label>`;
  const notesField = form => `<label class="cc-field cc-field-wide">Notes (optional)<textarea name="note" maxlength="600">${esc(planner.drafts[form].note || '')}</textarea></label>`;
  const selectField = (form, name, label, options) => `<label class="cc-field">${esc(label)}<select name="${name}">${options.map(([v, t]) => `<option value="${v}" ${planner.drafts[form][name] === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
  const formShell = (name, title, fields, button, extra = '') => `<form class="cc-plan-form" data-planner-form="${name}"><h3>${esc(title)}</h3><div class="cc-fields">${fields}</div><div class="cc-form-footer"><button class="cc-button" type="submit">${esc(button)}</button>${extra}</div></form>`;
  const removeButton = (col, id, label = 'Remove') => `<button class="cc-button" type="button" data-remove="${col}" data-id="${esc(id)}">${label}</button>`;
  const confirmButton = (key, label, attrs) => ui.confirm === key
    ? `<button class="cc-button cc-danger" type="button" ${attrs}>Sure? Delete</button><button class="cc-button" type="button" data-confirm-cancel>Keep</button>`
    : `<button class="cc-button" type="button" data-confirm="${esc(key)}">${label}</button>`;
  let pendingCommentDelete = null;
  function openCommentDelete(entryId, commentId) {
    const entry = data.diary.find(x => x.id === entryId);
    if (!(entry?.comments || []).some(c => c.id === commentId && c.author === meName())) return;
    pendingCommentDelete = { entryId, commentId };
    $('[data-comment-confirm-dialog]').showModal();
  }

  // ---------- calendar ----------
  function dayEvents(iso) {
    return [
      ...data.events.filter(e => e.date <= iso && (e.endDate || e.date) >= iso).map(e => ({ ...e, kind: safeKind(e.kind), collection: 'events' })),
      ...data.trips.filter(e => e.start && iso >= e.start && iso <= (e.end || e.start)).map(e => ({ ...e, kind: 'trip', collection: 'trips' })),
      ...data.tasks.filter(e => e.date === iso).map(e => ({ ...e, kind: 'task', collection: 'tasks' })),
      ...data.dates.filter(e => e.repeat ? iso >= e.date && yearlyDay(e.date, +iso.slice(0, 4)) === iso : iso === e.date).map(e => ({ ...e, kind: safeKind(e.kind), collection: 'dates' }))
    ].sort((a, b) => (a.startMs || 0) - (b.startMs || 0));
  }
  function calendarTitle() {
    if (planner.view === 'year') return String(planner.year);
    if (planner.view === 'week') {
      const s = weekStart(planner.selected), e = shiftDay(s, 6);
      const sameMonth = s.slice(0, 7) === e.slice(0, 7);
      return `${niceDate(s, { month: 'short', day: 'numeric' })} – ${niceDate(e, sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' })}, ${e.slice(0, 4)}`;
    }
    return niceDate(planner.month + '-01', { month: 'long', year: 'numeric' });
  }
  function select(iso) {
    planner.selected = iso; planner.month = iso.slice(0, 7); planner.year = +iso.slice(0, 4);
    planner.drafts.event.date = iso; planner.editing = null;
  }
  function monthGrid() {
    const first = utcDay(planner.month + '-01'), offset = (first.getUTCDay() + 6) % 7;
    const count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    let cells = Array.from({ length: offset }, () => '<div class="cc-day-blank" aria-hidden="true"></div>').join('');
    for (let d = 1; d <= count; d++) {
      const iso = `${planner.month}-${pad(d)}`, ev = dayEvents(iso);
      cells += `<button type="button" class="cc-day" data-day="${iso}" data-today="${iso === today}" aria-pressed="${iso === planner.selected}" aria-label="${esc(niceDate(iso))}, ${ev.length} events">${d}<span class="cc-day-dots" aria-hidden="true">${ev.slice(0, 3).map(e => `<i class="k-${e.kind}"></i>`).join('')}</span></button>`;
    }
    return `<div class="cc-calendar-grid">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => `<div class="cc-weekday">${d}</div>`).join('')}${cells}</div>`;
  }
  function weekList() {
    const s = weekStart(planner.selected);
    return `<div class="cc-week">${Array.from({ length: 7 }, (_, i) => {
      const iso = shiftDay(s, i), ev = dayEvents(iso);
      const chips = ev.map(e => `<button type="button" class="cc-chip k-${e.kind}" data-day="${iso}"><span>${e.done ? '✓ ' : ''}${esc(e.title)}</span>${e.timeLabel && !e.allDay ? `<small>${esc(e.timeLabel.split(' → ')[0])}</small>` : ''}</button>`).join('');
      return `<div class="cc-week-row" data-selected="${iso === planner.selected}" data-today="${iso === today}"><button type="button" class="cc-week-day" data-day="${iso}" aria-pressed="${iso === planner.selected}"><span>${niceDate(iso, { weekday: 'short' }).toUpperCase()}</span><b>${+iso.slice(8)}</b></button><div class="cc-week-items">${chips}<button type="button" class="cc-chip-add" data-add-on="${iso}" aria-label="Add a plan on ${esc(niceDate(iso))}">+</button></div></div>`;
    }).join('')}</div>`;
  }
  function yearGrid() {
    const months = [];
    for (let m = 1; m <= 12; m++) {
      const ym = `${planner.year}-${pad(m)}`, first = utcDay(ym + '-01'), offset = (first.getUTCDay() + 6) % 7;
      const count = new Date(Date.UTC(planner.year, m, 0)).getUTCDate();
      let cells = '<i></i>'.repeat(offset), total = 0;
      for (let d = 1; d <= count; d++) {
        const iso = `${ym}-${pad(d)}`, ev = dayEvents(iso); total += ev.length ? 1 : 0;
        const kind = ev[0]?.kind || '';
        cells += `<button type="button" class="cc-mini-day ${ev.length ? 'has k-' + kind : ''}" data-day="${iso}" data-today="${iso === today}" aria-pressed="${iso === planner.selected}" aria-label="${esc(niceDate(iso))}, ${ev.length} events">${d}</button>`;
      }
      months.push(`<div class="cc-mini"><button type="button" class="cc-mini-title" data-open-month="${ym}"><span>${niceDate(ym + '-01', { month: 'short' }).toUpperCase()}</span><small>${total ? total + (total === 1 ? ' day' : ' days') : ''}</small></button><div class="cc-mini-grid">${cells}</div></div>`);
    }
    return `<div class="cc-year">${months.join('')}</div>`;
  }
  function agendaHtml() {
    const rows = dayEvents(planner.selected).map(e => {
      const editing = e.collection === 'events' && planner.editing === e.id;
      if (editing) {
        return `<div class="cc-plan-row cc-editing">${formShell('edit', 'Edit plan', formField('edit', 'title', 'Title', 'text', true) + formField('edit', 'date', 'Date', 'date', true) + formField('edit', 'endDate', 'End date (optional)', 'date') + notesField('edit'), 'Save', '<button type="button" class="cc-button" data-edit-cancel>Cancel</button>')}</div>`;
      }
      const actions = e.collection === 'events'
        ? `<button class="cc-button" type="button" data-edit-event="${esc(e.id)}">Edit</button>${removeButton('events', e.id)}`
        : e.collection === 'dates' ? '<button class="cc-button" type="button" data-edit-days>Manage</button>'
        : `<button class="cc-button" type="button" data-open-todo="${e.collection === 'trips' ? 'trips' : 'activities'}">Open todo</button>`;
      return `<div class="cc-plan-row"><div><div class="cc-plan-tag"><i class="cc-dot k-${e.kind}"></i>${esc(e.source || kindLabel(e.kind))}${e.by ? ' · ' + esc(e.by) : ''}</div><div>${e.done ? '✓ ' : ''}${esc(e.title)}</div>${e.timeLabel ? `<p>${esc(e.timeLabel)}</p>` : ''}${e.endDate && e.endDate !== e.date && !e.timeLabel ? `<p>${esc(niceDate(e.date))} → ${esc(niceDate(e.endDate))}</p>` : ''}${e.location ? `<p>${esc(e.location)}</p>` : ''}${e.note ? `<p>${esc(e.note)}</p>` : ''}</div><div class="cc-plan-actions">${actions}</div></div>`;
    }).join('') || '<p class="cc-empty-plan">Nothing planned.</p>';
    return `<div class="cc-agenda"><div class="cc-agenda-title">${niceDate(planner.selected, { weekday: 'long', month: 'long', day: 'numeric' })}${planner.selected === today ? ' · today' : ''}</div>${rows}</div>`;
  }
  function renderImport() {
    if (!calendarImport.open) return '';
    const r = calendarImport.preview;
    return `<section class="cc-import" aria-label="Import Apple Calendar"><div class="cc-import-heading"><h3>Import Apple Calendar</h3><button type="button" class="cc-button" data-import-close>Close</button></div><p class="cc-small">On Mac: Calendar → File → Export → Export. On iPhone, export from a Mac or iCloud.com first. <a href="https://support.apple.com/guide/calendar/import-or-export-calendars-icl1023/mac" target="_blank" rel="noopener noreferrer">Apple guide ↗</a></p><label class="cc-field cc-import-file">Calendar file (.ics)<input type="file" accept=".ics,text/calendar" data-calendar-file></label><p class="cc-small">${calendarImport.name ? esc(calendarImport.name) : 'No file selected'}</p><div class="cc-import-dates"><label class="cc-field">From<input type="date" data-import-date="from" value="${esc(calendarImport.from)}"></label><label class="cc-field">Through<input type="date" data-import-date="to" value="${esc(calendarImport.to)}"></label></div><p class="cc-small">Repeated events are added within this range.</p><button type="button" class="cc-button" data-import-preview ${!calendarImport.file || calendarImport.busy ? 'disabled' : ''}>${calendarImport.busy ? 'Reading…' : 'Preview events'}</button>${calendarImport.error ? `<p class="cc-import-error" role="alert">${esc(calendarImport.error)}</p>` : ''}${r ? `<div class="cc-import-result" aria-live="polite"><p><strong>${r.events.length} events to import</strong> · ${r.duplicates} already added</p>${r.events.slice(0, 4).map(e => `<div class="cc-import-event"><span>${esc(e.title)}</span><small>${esc(e.date)}${e.endDate !== e.date ? ' → ' + esc(e.endDate) : ''} · ${esc(e.timeLabel)}</small></div>`).join('')}${r.events.length > 4 ? `<p class="cc-small">+ ${r.events.length - 4} more</p>` : ''}${r.skipped ? `<p class="cc-import-error">${r.skipped} entries could not be read.</p>` : ''}${r.events.length ? `<button type="button" class="cc-button cc-import-confirm" data-import-confirm>Import ${r.events.length} events</button>` : '<p class="cc-small">No new events in this date range.</p>'}</div>` : ''}<p class="cc-import-note">One-time file import, not live sync.</p></section>`;
  }
  function renderCalendar() {
    const views = [['week', 'Week'], ['month', 'Month'], ['year', 'Year']];
    const body = planner.view === 'week' ? weekList() : planner.view === 'year' ? yearGrid() : monthGrid();
    const selectedKind = planner.drafts.event.kind || 'plan';
    const isSpecial = ['birthday', 'holiday', 'anniversary'].includes(selectedKind);
    const eventFields = selectField('event', 'kind', 'Category', KINDS)
      + formField('event', 'title', selectedKind === 'trip' ? 'Destination' : 'What shall we do?', 'text', true)
      + formField('event', 'date', 'Date', 'date', true)
      + (!isSpecial && selectedKind !== 'task' ? formField('event', 'endDate', 'End date (optional)', 'date') : '')
      + (isSpecial ? `<label class="cc-inline-check"><input name="repeat" type="checkbox" ${planner.drafts.event.repeat ? 'checked' : ''}><span>Repeat every year</span></label>` : '')
      + notesField('event');
    const form = planner.forms.event ? formShell('event', 'Add to calendar', eventFields, '+ Add to calendar', '<button type="button" class="cc-button" data-show-form="event">Cancel</button>') : '';
    fill($('[data-home-calendar]'), panelShell('calendar', '▦ CALENDAR', '共同日历',
      `<div class="cc-planner-toolbar"><h3>${esc(calendarTitle())}</h3><div class="cc-plan-actions"><button class="cc-button" type="button" data-shift="-1" aria-label="Previous">‹</button><button class="cc-button" type="button" data-planner-today>Today</button><button class="cc-button" type="button" data-shift="1" aria-label="Next">›</button></div></div>
      <div class="cc-filter-row cc-view-switch" role="group" aria-label="Calendar view">${views.map(([v, l]) => `<button type="button" class="cc-button" data-view="${v}" aria-pressed="${planner.view === v}">${l}</button>`).join('')}</div>
      <div class="cc-cal-wrap"><div class="cc-cal-main">${body}
      <div class="cc-legend" role="group" aria-label="Category colours"><span class="cc-small">Colours (tap to change):</span>${KINDS.map(([k, l]) => `<button type="button" class="cc-legend-btn" data-pick-color="${k}" aria-expanded="${ui.colorKind === k}" title="Change colour"><i class="cc-dot k-${k}"></i>${l}</button>`).join('')}</div>${ui.colorKind ? `<div class="cc-swatches" role="group" aria-label="Colour for ${esc(ui.colorKind)}"><span class="cc-small">${esc(KINDS.find(x => x[0] === ui.colorKind)[1])} colour</span>${SWATCHES.map(c => `<button type="button" class="cc-swatch" style="background:${c}" data-set-color="${c}" aria-pressed="${kindColor(ui.colorKind) === c}" aria-label="${c}"></button>`).join('')}<button type="button" class="cc-button" data-pick-color="${ui.colorKind}">Done</button></div>` : ''}
      </div><div class="cc-cal-side">${agendaHtml()}
      <div class="cc-calendar-actions"><button type="button" class="cc-button" data-show-form="event" aria-expanded="${planner.forms.event}">${planner.forms.event ? 'Close form' : '+ Add a plan'}</button><button type="button" class="cc-button" data-import-open aria-expanded="${calendarImport.open}">Import Apple Calendar</button></div>
      <div class="cc-export-row"><label class="cc-field">Export category<select data-export-kind aria-label="Calendar category to export">${KINDS.map(([kind, label]) => `<option value="${kind}" ${planner.exportKind === kind ? 'selected' : ''}>${label}</option>`).join('')}</select></label><button type="button" class="cc-button" data-export-ics>Download .ics</button></div>${form}${renderImport()}</div></div>`));
  }

  // ---------- special days + memory ----------
  function renderSpecialDays() {
    const names = [['all', 'All'], ['birthday', 'Birthdays'], ['holiday', 'Holidays'], ['anniversary', 'Anniversaries']];
    const items = data.dates.filter(d => planner.filter === 'all' || d.kind === planner.filter).map(d => ({ ...d, next: repeatDate(d) })).sort((a, b) => Number(a.next < today) - Number(b.next < today) || a.next.localeCompare(b.next));
    const page = pageList('special', items);
    const cards = page.items.map(it => {
      if (planner.editingDay === it.id) {
        const f = formField('dayedit', 'title', 'Name of the day', 'text', true) + selectField('dayedit', 'kind', 'Category', names.slice(1)) + formField('dayedit', 'date', 'Date', 'date', true) + `<label class="cc-inline-check" style="align-self:end;padding-bottom:8px"><input name="repeat" type="checkbox" ${planner.drafts.dayedit.repeat ? 'checked' : ''}><span>Repeat every year</span></label>`;
        return `<article class="cc-plan-card k-${safeKind(it.kind)} cc-kind-card">${formShell('dayedit', 'Edit special day', f, 'Save', '<button type="button" class="cc-button" data-dayedit-cancel>Cancel</button>')}</article>`;
      }
      return `<article class="cc-plan-card k-${safeKind(it.kind)} cc-kind-card"><div class="cc-plan-tag"><i class="cc-dot k-${safeKind(it.kind)}"></i>${kindLabel(it.kind)}</div><h3>${esc(it.title)}</h3><div class="cc-card-meta"><span>${niceDate(it.next)} ${it.repeat ? '↻' : ''}</span><span class="cc-countdown">${countdown(it.next)}</span></div><p class="cc-small">${it.repeat ? 'Repeats yearly' : 'One-time date'}</p><div class="cc-plan-actions"><button class="cc-button" type="button" data-edit-day="${esc(it.id)}">Edit</button><button class="cc-button" type="button" data-open-date="${esc(it.next)}">See in calendar</button>${removeButton('dates', it.id)}</div></article>`;
    }).join('') || '<p class="cc-empty-plan">No special days yet.</p>';
    const fields = formField('special', 'title', 'Name of the day', 'text', true) + selectField('special', 'kind', 'Category', names.slice(1)) + formField('special', 'date', 'Date', 'date', true) + `<label class="cc-inline-check" style="align-self:end;padding-bottom:8px"><input name="repeat" type="checkbox" ${planner.drafts.special.repeat ? 'checked' : ''}><span>Repeat every year</span></label>`;
    const upcoming = data.dates.map(it => ({ ...it, next: repeatDate(it) })).filter(it => it.next >= today).sort((a, b) => a.next.localeCompare(b.next)).slice(0, 4);
    $('[data-upcoming-days]').innerHTML = upcoming.map(it => `<button type="button" class="cc-upcoming-entry" data-open-date="${esc(it.next)}"><span class="cc-plan-tag"><i class="cc-dot k-${safeKind(it.kind)}"></i>${kindLabel(it.kind)}</span><strong>${esc(it.title)}</strong><span class="cc-upcoming-bottom"><span>${niceDate(it.next, { month: 'short', day: 'numeric' })}</span><span class="cc-countdown">${countdown(it.next)}</span></span></button>`).join('') || '<p class="cc-empty-plan">No upcoming dates.</p>';
    const editor = $('[data-special-dialog]');
    if (!planner.specialOpen) { if (editor.open) editor.close(); return; }
    fill(editor, planner.specialOpen ? panelShell('special-editor', '♡ SPECIAL DAYS', '生日、节日与纪念日', `<div class="cc-add-row"><div class="cc-filter-row" style="margin:0">${names.map(([v, l]) => `<button type="button" class="cc-button" data-date-filter="${v}" aria-pressed="${planner.filter === v}">${l}</button>`).join('')}</div></div><div class="cc-todo-grid" data-page-list="special">${cards}</div>${pageNav('special', page)}${formShell('special', 'Save a special day', fields, '+ Save this day')}`) : '');
  }
  const entryDisplayDate = entry => entry.updatedAt ? currentDayFor(entry.updatedAt) : (entry.date || today);
  const currentDayFor = timestamp => { const d = new Date(timestamp); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const entryTimestamp = entry => {
    const at = entry.updatedAt || entry.createdAt;
    if (!at) return niceDate(entryDisplayDate(entry));
    const posted = timestamp(at);
    return !entry.updatedAt && entry.date && entry.date !== currentDayFor(at) ? `${niceDate(entry.date)} · posted ${posted}` : posted;
  };
  function diarySorted() { return [...data.diary].sort((a, b) => entryDisplayDate(b).localeCompare(entryDisplayDate(a)) || (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)); }
  function renderMemory() {
    const pool = data.diary.filter(e => (e.text || '').trim() || entryPhotoIds(e).length);
    const body = $('[data-memory]');
    if (!pool.length) { body.innerHTML = '<div class="cc-memory-label"><span>FROM THE DIARY</span></div><p class="cc-memory">No diary entries yet.</p><button class="cc-button" type="button" data-go="diary">Write the first one</button>'; return; }
    const e = pool[((ui.memory % pool.length) + pool.length) % pool.length];
    const photo = data.photos.find(p => p.id === entryPhotoIds(e)[0]), src = thumbOf(photo);
    const text = (e.text || '').trim();
    body.innerHTML = `<div class="cc-memory-label"><span>${esc(entryTimestamp(e))} · ${esc(e.author || '')}${e.updatedAt ? ' · Edited' : ''}</span><span aria-hidden="true">✧ ♡</span></div>${photo ? `<button type="button" class="cc-memory-photo" data-photo="${esc(photo.id)}" aria-label="Open photo">${src ? `<img src="${esc(src)}" alt="">` : '<span class="cc-img-wait" aria-hidden="true">▧</span>'}</button>` : ''}<p class="cc-memory">${esc(text.length > 140 ? text.slice(0, 140) + '…' : text)}</p><div class="cc-plan-actions"><button class="cc-button" type="button" data-shuffle ${pool.length < 2 ? 'disabled' : ''}>Shuffle</button><button class="cc-button" type="button" data-open-entry="${esc(e.id)}">Open diary</button></div>`;
  }

  // ---------- daily question ----------
  const partnerKey = () => (ui.me === 'zhenzhen' ? 'sijie' : 'zhenzhen');
  const answerOf = (date, key) => data.answers.find(a => a.id === `${date}:${key}`);
  function questionFor(date) { // the first answer keeps its question, so later bank or schedule changes never rewrite a day
    const first = data.answers.filter(a => a.date === date && a.q).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))[0];
    return first ? first.q : Q.forDay(date, data.questions);
  }
  function questionHtml(q) {
    if (!q) return '';
    const cat = Q.CATEGORIES[q.cat] || Q.CATEGORIES.fun;
    const tag = `<div class="cc-plan-tag cc-q-cat">${esc(cat.en)} · <span lang="zh-CN">${esc(cat.zh)}</span>${q.cat === 'custom' && q.by ? ` · asked by ${esc(q.by)}` : ''}</div>`;
    return q.cat === 'custom' ? `${tag}<p class="cc-q-text">${esc(q.text)}</p>` : `${tag}<p class="cc-q-text">${esc(q.en)}</p><p class="cc-q-zh" lang="zh-CN">${esc(q.zh)}</p>`;
  }
  const answerHead = key => `<span class="cc-q-who">${mini(key)}<b>${esc(PEOPLE[key])}</b></span>`;
  function myAnswerCell(date) {
    const mine = answerOf(date, ui.me);
    if (mine && ui.editingAnswer !== date) return `<div class="cc-q-answer ${ui.me}"><div class="cc-q-row">${answerHead(ui.me)}<button type="button" class="cc-link" data-answer-edit="${date}">Edit</button></div><p class="cc-feed-text">${esc(mine.text)}</p></div>`;
    const draft = questionDrafts[date] ?? '';
    return `<form class="cc-q-answer cc-q-form ${ui.me}" data-question-form="${date}"><div class="cc-q-row">${answerHead(ui.me)}</div><textarea name="answer" maxlength="1000" rows="3" placeholder="Your answer…" aria-label="Your answer">${esc(draft)}</textarea><div class="cc-form-footer"><button class="cc-button" type="submit">${mine ? 'Save' : 'Answer ♡'}</button>${mine ? `<button type="button" class="cc-button" data-answer-cancel="${date}">Cancel</button>` : ''}</div></form>`;
  }
  function partnerAnswerCell(date) {
    const key = partnerKey(), theirs = answerOf(date, key);
    if (!theirs) return `<div class="cc-q-answer cc-q-waiting ${key}"><div class="cc-q-row">${answerHead(key)}</div><p class="cc-small">${date < qDay() ? 'No answer that day.' : 'Hasn’t answered yet.'}</p></div>`;
    // the partner's text never reaches the page until you have answered too
    if (!answerOf(date, ui.me)) return `<div class="cc-q-answer cc-q-locked ${key}"><div class="cc-q-row">${answerHead(key)}</div><p>${emojiHtml('🔒')} ${esc(PEOPLE[key])} answered. Answer to unlock.</p></div>`;
    return `<div class="cc-q-answer ${key}"><div class="cc-q-row">${answerHead(key)}</div><p class="cc-feed-text">${esc(theirs.text)}</p></div>`;
  }
  const qaBlock = date => `<div class="cc-q-answers">${myAnswerCell(date)}<div class="cc-q-cell" data-q-partner="${date}">${partnerAnswerCell(date)}</div></div>`;
  function renderQuestion() {
    const win = $('[data-question]'); if (!win) return;
    if (!ui.me) { win.innerHTML = ''; return; }
    // the weekly check-in and the daily question get a box each, so a sync that rebuilds one never touches the other
    if (!win.querySelector(':scope > [data-q-daily]')) win.innerHTML = '<div class="cc-checkin" data-checkin></div><div data-q-daily></div>';
    renderCheckin(win.querySelector(':scope > [data-checkin]'));
    const body = win.querySelector(':scope > [data-q-daily]');
    const date = qDay(), q = questionFor(date), mine = answerOf(date, ui.me);
    const key = [date, !!mine, ui.editingAnswer === date, q?.qid].join('|'), a = document.activeElement;
    // a sync while typing only refreshes the partner's side, so the keyboard and IME stay put
    if (passive && body.dataset.key === key && a && body.contains(a) && a.closest('[data-question-form]')) {
      const cell = body.querySelector('[data-q-partner]'); if (cell) cell.innerHTML = partnerAnswerCell(date);
      return;
    }
    body.dataset.key = key;
    body.innerHTML = `<div class="cc-memory-label cc-q-head"><span>${esc(niceDate(date, { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase())}</span>${mine ? '<span aria-hidden="true">✧ ♡</span>' : '<span class="cc-q-new">NEW</span>'}</div>${questionHtml(q)}${qaBlock(date)}<div class="cc-plan-actions"><button type="button" class="cc-button" data-question-open="past">Past questions</button><button type="button" class="cc-button" data-question-open="ask">Ask ${esc(PEOPLE[partnerKey()])} a question</button></div>`;
  }
  function questionArchive() {
    const day = qDay();
    const days = [...data.answers.map(a => a.date), ...Q.schedule(data.questions).map(s => s.on)];
    return withCheckinWeeks([...new Set(days)].filter(d => validDay(d || '') && d < day).sort().reverse().map(id => ({ id })));
  }
  function renderQuestionDialog() {
    const dlg = $('[data-question-dialog]');
    if (!ui.questionOpen || !ui.me) { if (dlg.open) dlg.close(); return; }
    const a = document.activeElement;
    if (passive && a && dlg.contains(a) && (a.matches('input, textarea') || a.closest('[data-checkin-form], [data-question-form]'))) return;
    const day = qDay(), tomorrow = shiftDay(day, 1), partner = esc(PEOPLE[partnerKey()]), ask = planner.drafts.ask;
    const askForm = `<form class="cc-plan-form" data-planner-form="ask"><h3>Ask ${partner} a question</h3><div class="cc-fields"><label class="cc-field cc-field-wide">Your question<textarea name="text" maxlength="200" rows="2" placeholder="Something you have always wanted to know…">${esc(ask.text)}</textarea></label><label class="cc-field">Show it on<input name="date" type="date" min="${tomorrow}" value="${esc(ask.date || Q.nextFreeDay(tomorrow, data.questions))}"></label></div><p class="cc-small">It replaces the built-in question that day. ${partner} won’t see it until then.</p><div class="cc-form-footer"><button class="cc-button" type="submit">+ Schedule it</button></div></form>`;
    const waiting = Q.schedule(data.questions).filter(s => s.q.by === meName() && s.on > day);
    const scheduled = waiting.length ? `<h3 class="cc-q-sub">Waiting to be asked</h3>${waiting.map(({ q, on }) => `<div class="cc-q-sched"><span><b>${esc(niceDate(on))}</b> ${esc(q.text)}</span>${removeButton('questions', q.id, 'Cancel')}</div>`).join('')}` : '';
    const page = pageList('questions', questionArchive());
    const past = page.items.map(({ id: date }) => date.startsWith('wk:') ? checkinArticle(date.slice(3)) : `<article class="cc-q-day ${ui.highlight === date ? 'cc-highlight' : ''}" id="qday-${date}"><div class="cc-memory-label cc-q-head"><span>${esc(niceDate(date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase())}</span></div>${questionHtml(questionFor(date))}${qaBlock(date)}</article>`).join('') || '<p class="cc-empty-plan">Answered questions collect here, one day at a time.</p>';
    dlg.innerHTML = `<section class="cc-window"><div class="cc-bar"><span>? DAILY QUESTIONS</span><button type="button" class="cc-min" data-question-close aria-label="Close">×</button></div><div class="cc-body">${askForm}${scheduled}<h3 class="cc-q-sub" id="cc-q-past">Past questions</h3><div data-page-list="questions">${past}</div>${pageNav('questions', page)}</div></section>`;
  }
  function openQuestions(open, target = '') {
    ui.questionOpen = open;
    const day = validDay(target) || isWeekItem(target) ? target : ''; // a day, or 'wk:<monday>' for a past check-in
    if (open && day) { ui.pages.questions = pageForItem(questionArchive(), day); ui.highlight = day; setTimeout(() => { ui.highlight = null; scheduleRender(); }, 3000); }
    render();
    const dlg = $('[data-question-dialog]');
    if (!open) return;
    if (!dlg.open) dlg.showModal?.() ?? dlg.setAttribute('open', '');
    if (target === 'ask') $('[data-planner-form="ask"] textarea')?.focus();
    else $(day ? archiveAnchor(day) : '#cc-q-past')?.scrollIntoView({ block: 'start' });
  }
  function showTodayQuestion() {
    if (ui.collapsed.delete('question')) ls.set('collapsed', [...ui.collapsed]);
    go('home');
    $('[data-win="question"]')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  function submitAnswer(form) {
    const date = form.dataset.questionForm, field = form.elements.answer, text = String(field.value || '').trim();
    if (!ui.me || !validDay(date) || date > qDay()) return;
    if (!text) { field.setCustomValidity('Write an answer first.'); field.reportValidity(); return; }
    const mine = answerOf(date, ui.me), theirs = answerOf(date, partnerKey());
    const job = mine ? store.update('answers', mine.id, { text }) : store.set('answers', { id: `${date}:${ui.me}`, date, q: questionFor(date), author: meName(), text, createdAt: Date.now() });
    run(job.then(() => { delete questionDrafts[date]; dropDraft('answer', date); if (ui.editingAnswer === date) ui.editingAnswer = null; render(); }));
    flash(mine ? 'Saved.' : theirs ? `Answered. ${PEOPLE[partnerKey()]}’s answer is unlocked ♡` : `Answered. You’ll see ${PEOPLE[partnerKey()]}’s once they answer.`);
  }

  // ---------- weekly check-in ----------
  // One card per Monday-to-Sunday week, above the daily question: how the week feels (a weather mood) and a few
  // words if you like. Same no-spoiler rule as the daily question, but kept apart from it: answering one never
  // unlocks the other. Not part of the icon badge's "+1" or of achievements.
  // every emoji on the page goes through here (pixel art when pixel-emoji.js is loaded); labels live on the element around it
  const moodHtml = ch => (window.CCPixelEmoji ? CCPixelEmoji.html(ch, { decorative: true }) : `<span class="cc-emoji">${esc(ch)}</span>`);
  const checkinDrafts = {}; // week -> { mood, text }, so a re-render never loses what you picked or typed
  let editingCheckin = null;
  const thisWeek = () => Q.weekOf(qDay());
  const checkinOf = (week, key) => data.checkins.find(c => c.id === `${week}:${key}`);
  const checkinDraft = week => (checkinDrafts[week] ||= { mood: 0, text: '' });
  const moodOf = v => Q.MOODS.find(m => m.v === Number(v));
  const isWeekItem = id => /^wk:/.test(id || '') && validDay(id.slice(3));
  const archiveAnchor = id => (isWeekItem(id) ? '#qweek-' + id.slice(3) : '#qday-' + id);
  const weekLabel = (week, withYear) => 'WEEK OF ' + niceDate(week, withYear ? undefined : { month: 'short', day: 'numeric' }).toUpperCase();
  function checkinPromptFor(week) { // the first check-in keeps its prompt, like questionFor
    const first = data.checkins.filter(c => c.week === week && c.q).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))[0];
    return first ? first.q : Q.forWeek(week);
  }
  function moodLine(c, withLabel) {
    const m = moodOf(c.mood); if (!m) return '';
    const name = `${esc(m.en)} ${esc(m.zh)}`;
    return `<p class="cc-ck-mood-line"><span class="cc-ck-glyph" role="img" aria-label="${name}" title="${name}">${moodHtml(m.glyph)}</span>${withLabel ? `<span aria-hidden="true">${esc(m.en)} <span lang="zh-CN">${esc(m.zh)}</span></span>` : ''}</p>`;
  }
  function myCheckinCell(week) {
    const mine = checkinOf(week, ui.me);
    if (mine && editingCheckin !== week) return `<div class="cc-q-answer cc-ck-answer ${ui.me}"><div class="cc-q-row">${answerHead(ui.me)}<button type="button" class="cc-link" data-checkin-edit="${week}">Edit</button></div>${moodLine(mine, false)}${mine.text ? `<p class="cc-feed-text">${esc(mine.text)}</p>` : ''}</div>`;
    const draft = checkinDrafts[week] || { mood: 0, text: '' };
    const moods = Q.MOODS.map(m => `<button type="button" class="cc-button cc-ck-mood" data-checkin-mood="${m.v}" aria-pressed="${draft.mood === m.v}" aria-label="${esc(m.en)} ${esc(m.zh)}" title="${esc(m.en)} ${esc(m.zh)}"><span class="cc-ck-glyph" aria-hidden="true">${moodHtml(m.glyph)}</span>${esc(m.en)}</button>`).join(''); // a bare label keeps the button's typewriter font
    return `<form class="cc-q-answer cc-q-form cc-ck-form ${ui.me}" data-checkin-form="${week}"><div class="cc-q-row">${answerHead(ui.me)}<span class="cc-small">How was your week?</span></div><div class="cc-ck-moods" role="group" aria-label="How was your week? Pick one">${moods}</div><textarea name="text" maxlength="600" rows="2" placeholder="A few words, if you like…" aria-label="A few words about your week (optional)">${esc(draft.text)}</textarea><div class="cc-form-footer"><button class="cc-button" type="submit">${mine ? 'Save' : 'Check in'}</button>${mine ? `<button type="button" class="cc-button" data-checkin-cancel="${week}">Cancel</button>` : ''}</div></form>`;
  }
  function partnerCheckinCell(week) {
    const key = partnerKey(), theirs = checkinOf(week, key);
    if (!theirs) return `<div class="cc-q-answer cc-q-waiting ${key}"><div class="cc-q-row">${answerHead(key)}</div><p class="cc-small">${week < thisWeek() ? 'No check-in that week.' : 'Hasn’t checked in yet.'}</p></div>`;
    // their mood and words never reach the page until you have checked in for that week too
    if (!checkinOf(week, ui.me)) return `<div class="cc-q-answer cc-q-locked ${key}"><div class="cc-q-row">${answerHead(key)}</div><p>${moodHtml('🔒')} ${esc(PEOPLE[key])} checked in. Check in to see how they’re doing.</p></div>`;
    return `<div class="cc-q-answer cc-ck-answer ${key}"><div class="cc-q-row">${answerHead(key)}</div>${moodLine(theirs, true)}${theirs.text ? `<p class="cc-feed-text">${esc(theirs.text)}</p>` : ''}</div>`;
  }
  const checkinBlock = week => `<div class="cc-q-answers cc-ck-answers">${myCheckinCell(week)}<div class="cc-q-cell" data-ck-partner="${week}">${partnerCheckinCell(week)}</div></div>`;
  function renderCheckin(box) { // this week's card, at the top of the daily question window
    if (!box) return;
    const week = thisWeek(), q = checkinPromptFor(week), mine = checkinOf(week, ui.me);
    const key = [week, !!mine, editingCheckin === week, q?.qid].join('|'), a = document.activeElement;
    // like the daily question: a sync while you type or pick a mood only refreshes the partner's side
    if (passive && box.dataset.key === key && a && box.contains(a) && a.closest('[data-checkin-form]')) {
      const cell = box.querySelector('[data-ck-partner]'); if (cell) cell.innerHTML = partnerCheckinCell(week);
      return;
    }
    box.dataset.key = key;
    box.innerHTML = `<div class="cc-memory-label cc-q-head"><span>${esc(weekLabel(week))}</span>${mine ? '<span aria-hidden="true">✧ ♡</span>' : '<span class="cc-q-new">NEW</span>'}</div>${questionHtml(q)}${checkinBlock(week)}`;
  }
  function withCheckinWeeks(items) { // past weeks with a check-in join the Past questions list, just above their Monday
    const current = thisWeek(), weeks = [...new Set(data.checkins.map(c => c.week))].filter(w => validDay(w || '') && Q.weekOf(w) === w && w < current);
    const at = it => (isWeekItem(it.id) ? it.id.slice(3) + '~' : it.id);
    return [...items, ...weeks.map(w => ({ id: 'wk:' + w }))].sort((a, b) => (at(a) < at(b) ? 1 : at(a) > at(b) ? -1 : 0));
  }
  const checkinArticle = week => `<article class="cc-q-day cc-ck-day ${ui.highlight === 'wk:' + week ? 'cc-highlight' : ''}" id="qweek-${week}"><div class="cc-memory-label cc-q-head"><span>${esc(weekLabel(week, true))}</span></div>${questionHtml(checkinPromptFor(week))}${checkinBlock(week)}</article>`;
  function checkinMessages(add, edited) { // for allMessages: nothing about their week shows before you check in for it
    const current = thisWeek();
    for (const c of data.checkins) {
      if (!validDay(c.week || '')) continue;
      const open = !!checkinOf(c.week, ui.me), target = { type: 'checkin', week: c.week };
      const which = c.week === current ? 'for the week' : `for the week of ${niceDate(c.week, { month: 'short', day: 'numeric' })}`;
      const said = [moodOf(c.mood)?.glyph, clip(c.text)].filter(Boolean).join(' ');
      add('home', 'wk:' + c.id, c.author, c.createdAt, `checked in ${which} · ${open ? said : 'your turn 🔒'}`, target);
      if (open && edited(c)) add('home', `wk-u:${c.id}:${c.updatedAt}`, c.updatedBy, c.updatedAt, `updated their check-in${c.week === current ? '' : ' ' + which} · ${said}`, target);
    }
  }
  function submitCheckin(form) {
    const week = form.dataset.checkinForm, draft = checkinDraft(week), field = form.elements.text;
    if (!ui.me || !validDay(week) || Q.weekOf(week) !== week || week > thisWeek()) return;
    draft.text = field.value;
    if (!moodOf(draft.mood)) { flash('Pick a mood for your week first.'); form.querySelector('[data-checkin-mood]')?.focus(); return; }
    const text = String(field.value || '').trim().slice(0, 600), mood = draft.mood;
    const mine = checkinOf(week, ui.me), theirs = checkinOf(week, partnerKey()), partner = PEOPLE[partnerKey()];
    const job = mine ? store.update('checkins', mine.id, { mood, text }) : store.set('checkins', { id: `${week}:${ui.me}`, week, mood, text, q: checkinPromptFor(week), author: meName(), createdAt: Date.now() });
    run(job.then(() => { delete checkinDrafts[week]; dropDraft('checkin', week); if (editingCheckin === week) editingCheckin = null; render(); }));
    flash(mine ? 'Saved.' : theirs ? `Checked in. Now you can see how ${partner}’s week went ♡` : `Checked in. You’ll see ${partner}’s once they check in.`);
  }
  root.addEventListener('input', e => { const f = e.target.closest('[data-checkin-form]'); if (f && e.target.name === 'text') { checkinDraft(f.dataset.checkinForm).text = e.target.value; keepDraft('checkin', f.dataset.checkinForm); } });
  root.addEventListener('submit', e => { if (e.target.matches('[data-checkin-form]')) { e.preventDefault(); submitCheckin(e.target); } });
  root.addEventListener('click', e => {
    const el = e.target.closest('button'); if (!el || el.disabled) return;
    const ds = el.dataset;
    if (ds.checkinMood) { // picking a mood only flips the tiles, so focus and the half-typed text stay put
      const f = el.closest('[data-checkin-form]'); if (!f) return;
      checkinDraft(f.dataset.checkinForm).mood = Number(ds.checkinMood); keepDraft('checkin', f.dataset.checkinForm);
      f.querySelectorAll('[data-checkin-mood]').forEach(b => b.setAttribute('aria-pressed', String(b === el)));
    } else if (ds.checkinEdit) {
      const mine = checkinOf(ds.checkinEdit, ui.me); if (!mine) return;
      editingCheckin = ds.checkinEdit; checkinDrafts[ds.checkinEdit] = { mood: Number(mine.mood) || 0, text: mine.text || '' };
      render(); $(`[data-checkin-form="${ds.checkinEdit}"] textarea`)?.focus();
    } else if (ds.checkinCancel) { delete checkinDrafts[ds.checkinCancel]; dropDraft('checkin', ds.checkinCancel); editingCheckin = null; render(); }
  });

  // ---------- achievements: earned from what is already in the data; nothing resets, nothing is counted elsewhere ----------
  const achKey = key => 'achievements:' + key;
  const mergeKept = (...all) => { const out = {}; for (const k of all) for (const [id, at] of Object.entries(k || {})) if (typeof at === 'number' && !(out[id] <= at)) out[id] = at; return out; };
  function achState() { // this person's seen list, plus "kept": once earned, never taken back even if the item is deleted
    const local = ls.get(achKey(ui.me || 'x'), null), synced = ui.me ? data.meta[achKey(ui.me)] : null;
    return { seen: [...new Set([...(synced?.seen || []), ...(local?.seen || [])])], kept: mergeKept(local?.kept, synced?.kept) };
  }
  function saveAchState(st) {
    const key = achKey(ui.me); ls.set(key, st);
    const cur = data.meta[key];
    if (!ui.dataReady || (cur && (cur.seen || []).length === st.seen.length && JSON.stringify(mergeKept(cur.kept)) === JSON.stringify(mergeKept(st.kept)))) return;
    data.meta = { ...data.meta, [key]: st };
    run(store.mergeMeta(key, { seen: st.seen }, 'max')); run(store.mergeMeta(key, { kept: st.kept }, 'min')); // union of seen, earliest kept time
  }
  let achCache = null, achCacheKey = '';
  function achievements() {
    const key = (ui.me || '') + '|' + qDay();
    if (!A) return [];
    if (!achCache || achCacheKey !== key) {
      const kept = mergeKept(achState().kept, ...Object.keys(PEOPLE).map(k => data.meta[achKey(k)]?.kept));
      achCache = A.evaluate(data, { today: qDay(), kept, Q }); achCacheKey = key;
    }
    return achCache;
  }
  const unseenAchievements = () => { const seen = new Set(achState().seen); return achievements().filter(a => a.earned && !seen.has(a.id)); };
  function achTarget(a) { // the moment that earned it, if it is still there
    const t = a.target; if (!t) return null;
    if (t.question) return { type: 'question', date: t.question };
    const item = (data[t.col] || []).find(x => x.id === t.id); if (!item) return null;
    return { diary: { type: 'entry', id: t.id }, photos: { type: 'photo', id: t.id }, trips: { type: 'item', tab: 'todo', id: t.id }, tasks: { type: 'item', tab: 'todo', id: t.id }, wishes: { type: 'item', tab: 'wishlist', id: t.id }, albums: { type: 'album', id: t.id }, dates: { type: 'date', date: repeatDate(item) }, events: { type: 'date', date: item.date } }[t.col] || null;
  }
  function achTile(a, fresh) {
    const bar = p => { const f = Math.min(10, Math.floor(10 * Math.min(p.n, p.of) / p.of)); return `<span class="cc-ach-bar" role="img" aria-label="${p.n} of ${p.of}"><span aria-hidden="true">${'▮'.repeat(f)}${'▯'.repeat(10 - f)}</span> ${Math.min(p.n, p.of)} / ${p.of}</span>`; };
    const desc = `<small>${esc(a.desc.en)} <span lang="zh-CN">${esc(a.desc.zh)}</span></small>`; // locked firsts come back as a gentle invitation
    const when = a.earned && a.at ? `<small class="cc-ach-when">${esc(niceDate(currentDayFor(a.at)))}${achTarget(a) ? ` · <button type="button" class="cc-link" data-ach-go="${esc(a.id)}">See the moment ›</button>` : ''}</small>` : '';
    return `<article class="cc-ach ${a.earned ? '' : 'cc-ach-locked'}"><span class="cc-ach-glyph" aria-hidden="true">${emojiHtml(a.glyph)}</span><div class="cc-ach-text"><div><b>${esc(a.en)}</b> <span lang="zh-CN">${esc(a.zh)}</span>${fresh.has(a.id) ? ' <span class="cc-q-new">NEW</span>' : ''}</div>${desc}${when}${!a.earned && a.progress ? bar(a.progress) : ''}</div></article>`;
  }
  function achChip() {
    const n = achievements().filter(a => a.earned).length, fresh = unseenAchievements().length;
    return `<button type="button" data-ach-open aria-label="${n} achievement${n === 1 ? '' : 's'}${fresh ? ', some new' : ''}">✦ ${n} achievement${n === 1 ? '' : 's'}${fresh ? '<i class="cc-ach-spark" aria-hidden="true"></i>' : ''}</button>`;
  }
  function renderAchievementsDialog() {
    const dlg = $('[data-ach-dialog]');
    if (!ui.achOpen || !ui.me) { if (dlg.open) dlg.close(); return; }
    const list = achievements(), fresh = ui.achFresh || new Set();
    const earned = list.filter(a => a.earned).sort((a, b) => (b.at || 0) - (a.at || 0));
    const onTheWay = list.filter(a => !a.earned && a.visible), hidden = list.filter(a => a.cat === 'secret' && !a.earned).length;
    dlg.innerHTML = `<section class="cc-window"><div class="cc-bar"><span>✦ ACHIEVEMENTS · 成就</span><button type="button" class="cc-min" data-ach-close aria-label="Close">×</button></div><div class="cc-body">
      <p class="cc-small">Little things you have done together. Nothing expires and nothing resets.</p>
      <h3 class="cc-q-sub">Earned · ${earned.length}</h3><div class="cc-ach-grid">${earned.map(a => achTile(a, fresh)).join('') || '<p class="cc-empty-plan">Nothing yet. They turn up on their own as you use the site.</p>'}</div>
      ${onTheWay.length ? `<h3 class="cc-q-sub">On the way</h3><div class="cc-ach-grid">${onTheWay.map(a => achTile(a, fresh)).join('')}</div>` : ''}
      ${hidden ? `<h3 class="cc-q-sub">Hidden · ${hidden}</h3><div class="cc-ach-grid cc-ach-hidden">${Array.from({ length: hidden }, () => '<article class="cc-ach cc-ach-locked" aria-label="Hidden achievement"><span class="cc-ach-glyph" aria-hidden="true">?</span><div class="cc-ach-text"><b>???</b></div></article>').join('')}</div><p class="cc-small">These show up when they happen.</p>` : ''}
    </div></section>`;
  }
  function openAchievements(open) {
    ui.achOpen = open;
    if (!open) ui.achFresh = null;
    if (open && ui.me) { // opening the shelf marks everything seen and keeps what has been earned
      const st = achState(), earned = achievements().filter(a => a.earned), kept = { ...st.kept };
      ui.achFresh = new Set(unseenAchievements().map(a => a.id));
      for (const a of earned) if (typeof a.at === 'number' && !(kept[a.id] <= a.at)) kept[a.id] = a.at;
      saveAchState({ seen: [...new Set([...st.seen, ...earned.map(a => a.id)])], kept });
    }
    render();
    const dlg = $('[data-ach-dialog]');
    if (open && !dlg.open) dlg.showModal?.() ?? dlg.setAttribute('open', '');
  }

  // ---------- todo + wishlist ----------
  function todoSorted() {
    return [...data.trips.map(i => ({ ...i, kind: 'trip', done: i.status === 'visited' })), ...data.tasks.map(i => ({ ...i, kind: 'activity' }))]
      .sort((a, b) => Number(!!a.done) - Number(!!b.done) || (a.createdAt || 0) - (b.createdAt || 0));
  }
  function wishesSorted() {
    return [...data.wishes].sort((a, b) => Number(!!a.got) - Number(!!b.got) || (a.createdAt || 0) - (b.createdAt || 0));
  }
  function wishNoteStyle(wish) {
    if (Number.isInteger(wish.noteStyle) && wish.noteStyle >= 0 && wish.noteStyle < 8) return wish.noteStyle;
    return [...String(wish.id)].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 0) % 8;
  }
  function renderTodo() {
    const filters = [['all', 'All'], ['trips', 'Trips'], ['activities', 'Little things'], ['done', 'Done']];
    const combined = todoSorted();
    const items = combined.filter(i => planner.todoFilter === 'all' || (planner.todoFilter === 'trips' && i.kind === 'trip') || (planner.todoFilter === 'activities' && i.kind === 'activity') || (planner.todoFilter === 'done' && i.done));
    const page = pageList('todo', items);
    const cards = page.items.map(i => {
      const trip = i.kind === 'trip', date = trip ? i.start : i.date;
      const heading = trip ? `<h3>${esc(i.title)}</h3>` : `<label class="cc-task-title"><input type="checkbox" data-task-id="${esc(i.id)}" ${i.done ? 'checked' : ''}><span>${esc(i.title)}</span></label>`;
      const status = trip ? `<label><span class="cc-small">Status </span><select class="cc-plan-status" data-trip-status="${esc(i.id)}">${['dreaming', 'planning', 'booked', 'visited'].map(v => `<option value="${v}" ${i.status === v ? 'selected' : ''}>${statusLabel(v)}</option>`).join('')}</select></label>` : '';
      return `<article class="cc-plan-card ${i.done ? 'cc-done' : ''} ${ui.highlight === i.id ? 'cc-highlight' : ''}" id="item-${esc(i.id)}"><div class="cc-plan-tag">${trip ? '✈ TRIP' : '✓ LITTLE THING'}${i.by ? ' · ' + esc(i.by) : ''}</div>${heading}${i.note ? `<p>${esc(i.note)}</p>` : ''}<div class="cc-card-meta"><span>${date ? niceDate(date) + (trip && i.end && i.end !== date ? ' → ' + niceDate(i.end) : '') : 'Date still open'}</span>${status}</div><div class="cc-plan-actions" style="margin-top:9px">${date ? `<button class="cc-button" type="button" data-open-date="${esc(date)}">See in calendar</button>` : ''}${removeButton(trip ? 'trips' : 'tasks', i.id)}</div></article>`;
    }).join('') || '<p class="cc-empty-plan">Nothing here yet.</p>';
    const isTrip = planner.drafts.todo.kind === 'trip';
    const fields = selectField('todo', 'kind', 'Plan type', [['activity', 'Little thing'], ['trip', 'Trip']]) + formField('todo', 'title', isTrip ? 'Destination' : 'What should we do?', 'text', true) + (isTrip ? formField('todo', 'start', 'Departure (optional)', 'date') + formField('todo', 'end', 'Return (optional)', 'date') + selectField('todo', 'status', 'Status', ['dreaming', 'planning', 'booked', 'visited'].map(s => [s, statusLabel(s)])) : formField('todo', 'date', 'Pick a date (optional)', 'date')) + notesField('todo');
    fill($('[data-panel="todo"]'), panelShell('todo', '✓ OUR TODO LIST', '旅行与待办', `${pageToolbar(`${combined.length} plans`, `<button type="button" class="cc-button" data-show-form="todo" aria-expanded="${planner.forms.todo}">${planner.forms.todo ? 'Close form' : '+ Add a plan'}</button>`)}<div class="cc-filter-row cc-page-filters">${filters.map(([v, l]) => `<button type="button" class="cc-button" data-todo-filter="${v}" aria-pressed="${planner.todoFilter === v}">${l}</button>`).join('')}</div>${planner.forms.todo ? formShell('todo', 'Add to todo', fields, '+ Add to todo', '<button type="button" class="cc-button" data-show-form="todo">Cancel</button>') : ''}<div class="cc-todo-grid" data-page-list="todo">${cards}</div>${pageNav('todo', page)}`));
  }
  function renderWishlist() {
    const people = { both: 'For us', sijie: 'For 斯婕', zhenzhen: 'For 真真' };
    const wishes = wishesSorted();
    const page = pageList('wishlist', wishes);
    const cards = page.items.map(i => `<article class="cc-plan-card cc-wish-note cc-wish-note-${wishNoteStyle(i)} ${i.got ? 'cc-done' : ''} ${ui.highlight === i.id ? 'cc-highlight' : ''}" id="item-${esc(i.id)}"><div class="cc-plan-tag">${people[i.who] || 'For us'}</div><div class="cc-wish-name">${esc(i.title)}</div>${i.note ? `<p>${esc(i.note)}</p>` : ''}<div class="cc-card-meta"><label class="cc-inline-check"><input type="checkbox" data-wish-id="${esc(i.id)}" ${i.got ? 'checked' : ''}><span>Got it ♡</span></label>${removeButton('wishes', i.id)}</div></article>`).join('') || '<p class="cc-empty-plan">No wishes yet.</p>';
    const fields = formField('wish', 'title', 'Something we would love', 'text', true) + selectField('wish', 'who', 'Who is it for?', [['both', 'Both of us'], ['sijie', '斯婕'], ['zhenzhen', '真真']]) + notesField('wish');
    fill($('[data-panel="wishlist"]'), panelShell('wishlist', '♡ WISHLIST', '愿望清单', `${pageToolbar(`${wishes.length} wishes`, `<button type="button" class="cc-button" data-show-form="wish" aria-expanded="${planner.forms.wish}">${planner.forms.wish ? 'Close form' : '+ Add a wish'}</button>`)}${planner.forms.wish ? formShell('wish', 'Add a wish', fields, '+ Save wish') : ''}<div class="cc-wishlist-grid" data-page-list="wishlist">${cards}</div>${pageNav('wishlist', page)}`));
  }

  // ---------- diary ----------
  // Pictures go into the page as short blob: links this page makes when a picture is first shown, one per picture and place,
  // not as data URLs pasted into every row (an avatar ~10 KB, the top picture ~500 KB). A place's old link is let go
  // when its picture changes, a thumbnail's when its photo is gone. Synced strings still have to pass safeImage.
  const links = new Map(); // place -> { v: the picture, url }
  function linkOf(place, v) {
    const cur = links.get(place); if (cur && cur.v === v) return cur.url;
    if (cur?.url) URL.revokeObjectURL(cur.url);
    const blob = v instanceof Blob ? v : safeImage(v, false) && CCStore.toBlob(v), url = blob ? URL.createObjectURL(blob) : '';
    links.set(place, { v, url }); return url;
  }
  let linksFor = null; // the photo list the thumbnail links were last checked against
  const thumbOf = p => { // '' shows the ▧ placeholder
    if (linksFor !== data.photos) { linksFor = data.photos; const ids = new Set(data.photos.map(x => 't:' + x.id)); for (const [k, l] of links) if (k.startsWith('t:') && !ids.has(k)) { if (l.url) URL.revokeObjectURL(l.url); links.delete(k); } }
    return p ? linkOf('t:' + p.id, p.thumb) : '';
  };
  const avatarOf = key => linkOf('a:' + key, (data.meta.avatars || {})[key]);
  let photoIndex = null; // photo ids and photos per diary entry, rebuilt when the photo list changes
  function entryPhotoIds(entry) {
    // an entry's photos: its photoIds that still exist, then any other photo saved for it. photoIds is saved as a whole
    // list, so when both of us change one entry's photos at once, the later save can drop the other's new photo from it
    if (photoIndex?.src !== data.photos) {
      const ids = new Set(), byEntry = new Map();
      for (const p of data.photos) { ids.add(p.id); if (p.entryId) { if (!byEntry.has(p.entryId)) byEntry.set(p.entryId, []); byEntry.get(p.entryId).push(p); } }
      photoIndex = { src: data.photos, ids, byEntry };
    }
    const listed = (entry.photoIds || []).filter(id => photoIndex.ids.has(id));
    const more = (photoIndex.byEntry.get(entry.id) || []).filter(p => !listed.includes(p.id)).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    return [...listed, ...more.map(p => p.id)];
  }
  function photoThumbs(ids) {
    const photos = (ids || []).map(id => data.photos.find(p => p.id === id)).filter(Boolean);
    return photos.length ? `<div class="cc-feed-photos n${Math.min(photos.length, 3)}">${photos.map(p => { const src = thumbOf(p); return `<button type="button" class="cc-thumb" data-photo="${esc(p.id)}" aria-label="Open photo">${src ? `<img src="${esc(src)}" alt="${esc(p.caption || '')}" loading="lazy">` : '<span class="cc-img-wait" aria-hidden="true">▧</span>'}</button>`; }).join('')}</div>` : '';
  }
  function parseTags(text) {
    const seen = new Set();
    return String(text || '').split(/[,，#\s]+/).map(t => t.trim().slice(0, 20)).filter(t => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase())).slice(0, 8);
  }
  function entryMatches(e) {
    if (diaryFilter.tag && !(e.tags || []).some(t => t.toLowerCase() === diaryFilter.tag.toLowerCase())) return false;
    const q = diaryFilter.q.trim().toLowerCase(); if (!q) return true;
    const hay = [e.text, e.author, entryDisplayDate(e), ...(e.tags || []), ...(e.comments || []).map(c => c.text)].join(' ').toLowerCase();
    return q.split(/\s+/).every(w => hay.includes(w));
  }
  const mini = key => { const img = avatarOf(key); return `<span class="cc-mini-avatar ${key}">${img ? `<img src="${esc(img)}" alt="">` : PEOPLE[key].slice(0, 1)}</span>`; };
  function diaryEditForm(entry) {
    const draft = planner.drafts.entryedit;
    const existing = draft.photoIds.map(id => data.photos.find(photo => photo.id === id)).filter(Boolean);
    const kept = existing.map(photo => `<span class="cc-pending">${thumbOf(photo) ? `<img src="${esc(thumbOf(photo))}" alt="">` : '<span class="cc-img-wait" aria-hidden="true">▧</span>'}<button type="button" data-entry-photo-remove="${esc(photo.id)}" aria-label="Remove photo">×</button></span>`).join('');
    const added = draft.pending.map((photo, index) => `<span class="cc-pending"><img src="${esc(photo.thumb)}" alt=""><button type="button" data-entry-pending-remove="${index}" aria-label="Remove new photo">×</button></span>`).join('');
    return `<article class="cc-feed" id="entry-${esc(entry.id)}"><form class="cc-plan-form" data-planner-form="entryedit"><h3>Edit entry</h3><div class="cc-fields"><label class="cc-field cc-field-wide">Text<textarea name="text" maxlength="3000" rows="4">${esc(draft.text)}</textarea></label><label class="cc-field">Tags<input name="tags" type="text" maxlength="120" value="${esc(draft.tags)}"></label><label class="cc-field cc-field-wide">Photos (${existing.length + draft.pending.length}/9)<span class="cc-button cc-file-btn">＋ Add photos<input type="file" accept="image/*" multiple data-entry-edit-photos ${busy.entry ? 'disabled' : ''}></span></label></div>${kept || added ? `<div class="cc-pending-row">${kept}${added}</div>` : ''}<p class="cc-small">Date updates when you save.</p><div class="cc-form-footer"><button class="cc-button" type="submit" ${busy.entry ? 'disabled' : ''}>${busy.entry ? 'Saving…' : 'Save edits'}</button><button type="button" class="cc-button" data-entry-cancel ${busy.entry ? 'disabled' : ''}>Cancel</button></div></form></article>`;
  }
  function renderDiary() {
    const pending = diaryDraft.pending.map((p, i) => `<span class="cc-pending"><img src="${esc(p.thumb)}" alt=""><button type="button" data-pending-remove="${i}" aria-label="Remove photo">×</button></span>`).join('');
    const composer = `<div id="cc-diary-composer" ${ui.newEntryOpen ? '' : 'hidden'}><form class="cc-plan-form cc-diary-form" data-diary-form><h3>New entry · ${esc(meName())}</h3><div class="cc-fields"><label class="cc-field cc-field-wide">What happened?<textarea name="text" maxlength="3000" rows="4">${esc(diaryDraft.text)}</textarea></label><label class="cc-field">Date<input name="date" type="date" value="${esc(diaryDraft.date)}"></label><label class="cc-field">Tags (optional)<input name="tags" type="text" maxlength="120" placeholder="travel, food" value="${esc(diaryDraft.tags)}"></label><label class="cc-field cc-field-wide">Photos (up to 9)<span class="cc-button cc-file-btn">＋ Choose photos<input type="file" accept="image/*" multiple data-diary-photos ${busy.diary ? 'disabled' : ''}></span></label></div>${pending ? `<div class="cc-pending-row">${pending}</div>` : ''}<div class="cc-form-footer"><button class="cc-button" type="submit" ${busy.diary ? 'disabled' : ''}>${busy.diary ? 'Saving…' : 'Post ✎'}</button><button class="cc-button" type="button" data-toggle-diary ${busy.diary ? 'disabled' : ''}>Close</button></div></form></div>`;
    const tagCounts = new Map();
    data.diary.forEach(e => (e.tags || []).forEach(t => { const k = t.toLowerCase(); const cur = tagCounts.get(k) || { t, n: 0 }; cur.n++; tagCounts.set(k, cur); }));
    const tagsRow = [...tagCounts.values()].sort((a, b) => b.n - a.n || a.t.localeCompare(b.t)).map(({ t, n }) => `<button type="button" class="cc-tag" data-tag="${esc(t)}" aria-pressed="${diaryFilter.tag.toLowerCase() === t.toLowerCase()}">#${esc(t)} <small>${n}</small></button>`).join('');
    const filtering = diaryFilter.q.trim() || diaryFilter.tag;
    const list = diarySorted().filter(entryMatches);
    const page = pageList('diary', list);
    const search = `<form class="cc-diary-search" data-diary-search role="search"><input name="q" type="search" placeholder="Search the diary…" value="${esc(diaryFilter.q)}" aria-label="Search the diary"><button type="submit" class="cc-button">Search</button>${filtering ? '<button type="button" class="cc-button" data-clear-filter>Clear</button>' : ''}</form>${tagsRow ? `<div class="cc-tag-row">${tagsRow}</div>` : ''}${filtering ? `<p class="cc-small cc-result-count">${list.length} of ${data.diary.length} entries</p>` : ''}`;
    const feed = page.items.map(e => {
      const mine = e.author === meName(), key = nameToKey(e.author);
      if (ui.editingEntry === e.id) {
        return diaryEditForm(e);
      }
      const tags = (e.tags || []).map(t => `<button type="button" class="cc-tag" data-tag="${esc(t)}">#${esc(t)}</button>`).join('');
      const comments = (e.comments || []).map(c => `<div class="cc-reply"><b>${esc(c.author)}:</b>${c.at ? `<small class="cc-reply-time">${esc(timestamp(c.at))}</small>` : ''} ${esc(c.text)}${c.author === meName() ? ` <button type="button" class="cc-x" data-comment-remove="${esc(c.id)}" data-entry="${esc(e.id)}" aria-label="Delete comment">×</button>` : ''}</div>`).join('');
      return `<article class="cc-feed ${ui.highlight === e.id ? 'cc-highlight' : ''}" id="entry-${esc(e.id)}"><div class="cc-meta"><span class="cc-meta-who">${mini(key)}${esc(e.author || '')} · ${esc(entryTimestamp(e))}${e.updatedAt ? ' · Edited' : ''}</span>${mine ? `<span class="cc-plan-actions"><button type="button" class="cc-button" data-entry-edit="${esc(e.id)}">Edit</button>${confirmButton('entry:' + e.id, 'Delete', `data-entry-delete="${esc(e.id)}"`)}</span>` : ''}</div>${e.text ? `<p class="cc-feed-text">${esc(e.text)}</p>` : ''}${tags ? `<div class="cc-tag-row cc-entry-tags">${tags}</div>` : ''}${photoThumbs(entryPhotoIds(e))}${comments}<form class="cc-comment-form" data-comment-form="${esc(e.id)}"><input name="comment" maxlength="500" placeholder="Reply as ${esc(meName())}…" value="${esc(commentDrafts[e.id] || '')}" aria-label="Write a reply"><button class="cc-button" type="submit">Reply</button></form></article>`;
    }).join('') || `<p class="cc-empty-plan">${filtering ? 'No entries match.' : 'No entries yet. Write the first one above.'}</p>`;
    fill($('[data-panel="diary"]'), panelShell('diary', '✎ DIARY', '我们的日记', pageToolbar(`${data.diary.length} entries`, `<button type="button" class="cc-button" data-toggle-diary aria-expanded="${ui.newEntryOpen}" aria-controls="cc-diary-composer" ${busy.diary ? 'disabled' : ''}>${ui.newEntryOpen ? '− Close new entry' : '＋ New entry'}</button>`) + composer + search + `<div data-page-list="diary">${feed}</div>` + pageNav('diary', page)));
  }

  // ---------- album ----------
  function photosSorted() { return [...data.photos].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0)); }
  function albumsSorted() { return [...data.albums].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); }
  function albumPhotos(photos = photosSorted()) {
    if (ui.album === 'all') return photos;
    const known = new Set(data.albums.map(a => a.id));
    if (ui.album === 'unsorted') return photos.filter(p => !p.albumId || !known.has(p.albumId));
    return photos.filter(p => p.albumId === ui.album);
  }
  function renderAlbum() {
    const photos = photosSorted();
    const albums = albumsSorted();
    if (ui.album !== 'all' && ui.album !== 'unsorted' && !albums.some(a => a.id === ui.album)) ui.album = 'all';
    const visible = albumPhotos(photos);
    const page = pageList('album', visible);
    const selected = albums.find(a => a.id === ui.album);
    const albumTile = (key, title, items) => {
      const cover = thumbOf(items.find(p => p.thumb));
      return `<button type="button" class="cc-album-folder" data-album-open="${esc(key)}" aria-pressed="${ui.album === key}"><span class="cc-album-cover">${cover ? `<img src="${esc(cover)}" alt="">` : '<span aria-hidden="true">▧</span>'}</span><span class="cc-album-label"><strong>${esc(title)}</strong><small>${items.length} photo${items.length === 1 ? '' : 's'}</small></span></button>`;
    };
    const known = new Set(albums.map(a => a.id));
    const unsorted = photos.filter(p => !p.albumId || !known.has(p.albumId));
    const shelf = `<div class="cc-album-shelf" role="group" aria-label="Photo albums">${albumTile('all', 'All photos', photos)}${albumTile('unsorted', 'Unsorted', unsorted)}${albums.map(a => albumTile(a.id, a.title, photos.filter(p => p.albumId === a.id))).join('')}</div>`;
    const form = ui.albumForm ? `<form class="cc-plan-form cc-album-form" data-album-form><h3>${ui.albumForm === 'new' ? 'New album' : 'Rename album'}</h3><label class="cc-field">Album name<input name="albumName" maxlength="50" required value="${esc(ui.albumDraft)}" autocomplete="off"></label><div class="cc-form-footer"><button type="submit" class="cc-button">Save album</button><button type="button" class="cc-button" data-album-cancel>Cancel</button></div></form>` : '';
    const title = selected?.title || (ui.album === 'unsorted' ? 'Unsorted' : 'All photos');
    const heading = `<div class="cc-album-heading"><div><h3>${esc(title)}</h3><span class="cc-small">${visible.length} photo${visible.length === 1 ? '' : 's'}</span></div>${selected ? `<div class="cc-plan-actions"><button type="button" class="cc-button" data-album-rename="${esc(selected.id)}">Rename</button>${confirmButton('album:' + selected.id, 'Delete album', `data-album-delete="${esc(selected.id)}"`)}</div>` : ''}</div>`;
    const grid = page.items.map(p => `<button type="button" class="cc-photo" data-photo="${esc(p.id)}">${thumbOf(p) ? `<img class="cc-photo-img" src="${esc(thumbOf(p))}" alt="${esc(p.caption || '')}" loading="lazy">` : '<span class="cc-photo-img cc-img-wait" aria-hidden="true">▧</span>'}<span>${esc(p.caption || niceDate(p.date || today, { month: 'short', day: 'numeric', year: 'numeric' }))}</span></button>`).join('');
    fill($('[data-panel="album"]'), panelShell('album', '▧ PHOTOS & KEEPSAKES', '相册',
      `${pageToolbar('Albums for our photos', `<span class="cc-album-actions"><button type="button" class="cc-button" data-album-new>＋ New album</button><span class="cc-button cc-file-btn">${busy.album ? 'Uploading…' : '＋ Upload photos'}<input type="file" accept="image/*" multiple data-album-photos ${busy.album ? 'disabled' : ''}></span></span>`)}${form}${shelf}${heading}${grid ? `<div class="cc-photos" data-page-list="album">${grid}</div>` : '<p class="cc-empty-plan" data-page-list="album">No photos here yet.</p>'}${pageNav('album', page)}`));
  }
  async function makePhoto(file) {
    const [thumb, full] = await Promise.all([CCStore.resizeImage(file, 480, 0.72), CCStore.resizeImage(file, 1600, 0.82)]);
    return { thumb, full };
  }
  // Every photo's files go up first, then the records are saved as one change, with the entry when there is one
  // (entry: photo ids -> the diary entry); an album upload (keepPartial) saves each photo as it goes, as before.
  async function savePhotos(list, extra, { keepPartial = false, entry = null } = {}) {
    const items = [], tried = [], batch = newId(); // photos from one upload share a batch, so they make one message
    try {
      for (const p of list) {
        const id = newId(); tried.push(id);
        const item = await store.uploadPhoto({ id, thumb: p.thumb, caption: p.caption || '', author: meName(), createdAt: Date.now(), batch, ...extra }, p.full);
        if (keepPartial) await store.set('photos', item); else items.push(item);
      }
      if (!keepPartial && (entry || items.length)) await store.saveAll([...(entry ? [{ col: 'diary', item: entry(tried) }] : []), ...items.map(item => ({ col: 'photos', item }))]);
    } catch (err) {
      // a diary photo is no use without its entry: when a post fails part way, take back the files this try uploaded,
      // so nothing is left for an entry that was never saved and trying again doesn't add them twice
      if (!keepPartial) await Promise.resolve(store.discard(tried)).catch(e => console.error(e));
      throw err;
    }
    return tried;
  }

  // ---------- lightbox ----------
  const lightbox = { id: null, list: [], zoom: 1, panX: 0, panY: 0, pointer: null };
  function photoSequence(p) {
    if (ui.page === 'album') return albumPhotos(photosSorted()).map(x => x.id);
    if (ui.page === 'diary' && p.entryId) {
      const entry = data.diary.find(x => x.id === p.entryId);
      if (entry) return entryPhotoIds(entry);
    }
    return photosSorted().map(x => x.id);
  }
  function applyPhotoZoom() {
    const stage = $('[data-lightbox-stage]'), img = stage?.querySelector('[data-full]');
    if (!img) return;
    if (lightbox.zoom === 1) lightbox.panX = lightbox.panY = 0;
    const maxX = Math.max(0, (img.offsetWidth * lightbox.zoom - stage.clientWidth) / 2);
    const maxY = Math.max(0, (img.offsetHeight * lightbox.zoom - stage.clientHeight) / 2);
    lightbox.panX = Math.max(-maxX, Math.min(maxX, lightbox.panX));
    lightbox.panY = Math.max(-maxY, Math.min(maxY, lightbox.panY));
    img.style.transform = `translate(${lightbox.panX}px, ${lightbox.panY}px) scale(${lightbox.zoom})`;
    stage.classList.toggle('is-zoomed', lightbox.zoom > 1);
    const label = $('[data-photo-zoom-label]'); if (label) label.textContent = `${Math.round(lightbox.zoom * 100)}%`;
    const out = $('[data-photo-zoom="out"]'); if (out) out.disabled = lightbox.zoom === 1;
    const up = $('[data-photo-zoom="in"]'); if (up) up.disabled = lightbox.zoom === 4;
  }
  function setPhotoZoom(value) {
    lightbox.zoom = Math.max(1, Math.min(4, value));
    applyPhotoZoom();
  }
  const photoExists = id => data.photos.some(p => p.id === id);
  function nextInLightbox(direction) { // the nearest photo that way which still exists (the other person may have deleted some)
    const list = lightbox.list, i = list.indexOf(lightbox.id), n = list.length;
    for (let k = 1; k < n; k++) { const id = list[(((i + direction * k) % n) + n) % n]; if (photoExists(id)) return id; }
    return null;
  }
  function stepPhoto(direction) {
    const i = lightbox.list.indexOf(lightbox.id);
    if (i < 0 || lightbox.list.length < 2) return;
    const next = nextInLightbox(direction); if (!next) return;
    ui.confirm = null;
    openPhoto(next, lightbox.list.filter(photoExists));
  }
  function keepLightboxOnData() { // the photo on screen was deleted elsewhere: show the next one, or close when none is left
    if (!lightbox.id || photoExists(lightbox.id)) return;
    const next = nextInLightbox(1);
    ui.confirm = null;
    if (next) openPhoto(next, lightbox.list.filter(photoExists)); else closePhoto();
  }
  async function openPhoto(id, sequence = null) {
    const p = data.photos.find(x => x.id === id); if (!p) return;
    const chosen = sequence || photoSequence(p);
    lightbox.id = id; lightbox.list = chosen.includes(id) ? chosen : [id];
    lightbox.zoom = 1; lightbox.panX = lightbox.panY = 0; lightbox.pointer = null;
    const dlg = $('[data-lightbox]');
    const idx = lightbox.list.indexOf(id);
    const albumPicker = `<label class="cc-photo-album">Album<select data-photo-album="${esc(p.id)}" aria-label="Move photo to album"><option value="" ${!p.albumId ? 'selected' : ''}>Unsorted</option>${albumsSorted().map(a => `<option value="${esc(a.id)}" ${p.albumId === a.id ? 'selected' : ''}>${esc(a.title)}</option>`).join('')}</select></label>`;
    const photoDate = p.date && p.createdAt && p.date !== currentDayFor(p.createdAt) ? `Photo date ${niceDate(p.date)} · uploaded ` : '';
    dlg.innerHTML = `<div class="cc-bar"><span>▧ ${idx + 1} / ${lightbox.list.length}</span><button type="button" class="cc-min" data-lightbox-close aria-label="Close">×</button></div><div class="cc-lightbox-body"><div class="cc-lightbox-stage" data-lightbox-stage role="group" aria-label="Photo. Swipe left or right to browse."><button type="button" class="cc-lightbox-arrow previous" data-lightbox-step="-1" aria-label="Previous photo" ${lightbox.list.length < 2 ? 'disabled' : ''}>‹</button><img data-full draggable="false" src="${esc(thumbOf(p) || 'data:image/gif;base64,R0lGODlhAQABAAAAACw=')}" alt="${esc(p.caption || '')}"><button type="button" class="cc-lightbox-arrow next" data-lightbox-step="1" aria-label="Next photo" ${lightbox.list.length < 2 ? 'disabled' : ''}>›</button></div><div class="cc-lightbox-meta"><span>${esc(p.author || '')} · ${esc(photoDate)}${esc(timestamp(p.createdAt, p.date || today))}${p.caption ? ' · ' + esc(p.caption) : ''}</span><span class="cc-plan-actions">${albumPicker}<button type="button" class="cc-button" data-photo-zoom="out" aria-label="Zoom out" disabled>−</button><span class="cc-zoom-label" data-photo-zoom-label>100%</span><button type="button" class="cc-button" data-photo-zoom="in" aria-label="Zoom in">＋</button>${p.entryId ? `<button type="button" class="cc-button" data-open-entry="${esc(p.entryId)}">Open diary</button>` : ''}${confirmButton('photo:' + p.id, 'Delete', `data-photo-delete="${esc(p.id)}"`)}</span></div></div>`;
    if (!dlg.open) dlg.showModal?.() ?? dlg.setAttribute('open', '');
    dlg.tabIndex = -1; dlg.focus({ preventScroll: true });
    const full = await store.getFull(id).catch(() => null);
    if (full && lightbox.id === id) { const img = dlg.querySelector('[data-full]'); if (img) { img.onload = applyPhotoZoom; img.src = linkOf('full', full); if (img.complete) applyPhotoZoom(); } } // one full photo's link at a time
  }
  function closePhoto() { const dlg = $('[data-lightbox]'); lightbox.id = null; lightbox.pointer = null; ui.confirm = null; dlg.close?.(); dlg.removeAttribute('open'); }

  // ---------- messages (like WeChat moments notifications) ----------
  const TAB_NAMES = { home: 'Home', diary: 'Diary', todo: 'Todo', wishlist: 'Wishlist', album: 'Album' };
  const inboxKey = () => 'inbox:' + (ui.me || 'x');
  function localInboxState() {
    const st = ls.get(inboxKey(), null);
    if (st) return st;
    const fresh = { since: Date.now(), read: [] }; ls.set(inboxKey(), fresh); return fresh;
  }
  function inboxState() {
    const local = localInboxState(), shared = data.meta.inboxReads?.[ui.me];
    if (!shared) return local;
    return { since: Math.max(Number(shared.since) || 0, Date.now() - 30 * 86400000),
      read: [...new Set([...(local.read || []), ...(shared.read || []).map(item => item.key).filter(Boolean)])] };
  }
  function ago(ms) { // "5m ago", "2h ago", "3d ago", then a date
    const sec = Math.max(0, (Date.now() - ms) / 1000);
    if (sec < 60) return 'just now'; if (sec < 3600) return Math.floor(sec / 60) + 'm ago'; if (sec < 86400) return Math.floor(sec / 3600) + 'h ago';
    return sec < 7 * 86400 ? Math.floor(sec / 86400) + 'd ago' : new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  const clip = (t, n = 40) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };
  function allMessages() {
    const me = meName(), out = [];
    const add = (tab, key, who, at, text, target) => { if (who && who !== me && at) out.push({ tab, key, who, at, text, target }); };
    const edited = x => x.updatedBy && x.updatedAt && x.updatedAt - (x.createdAt || 0) > 2000;
    const imports = new Map();
    for (const e of data.events) {
      if (e.importKey && e.by) { const k = e.by + e.createdAt; const g = imports.get(k) || { e, n: 0 }; g.n++; imports.set(k, g); }
      else add('home', 'ev:' + e.id, e.by, e.createdAt, `added a plan · ${clip(e.title)}`, { type: 'date', date: e.date });
      if (edited(e)) add('home', `ev-u:${e.id}:${e.updatedAt}`, e.updatedBy, e.updatedAt, `edited a plan · ${clip(e.title)}`, { type: 'date', date: e.date });
    }
    for (const { e, n } of imports.values()) add('home', 'imp:' + e.by + e.createdAt, e.by, e.createdAt, `imported ${n} calendar event${n === 1 ? '' : 's'}`, { type: 'date', date: e.date });
    for (const d of data.dates) {
      add('home', 'dt:' + d.id, d.by, d.createdAt, `saved a special day · ${clip(d.title)}`, { type: 'date', date: repeatDate(d) });
      if (edited(d)) add('home', `dt-u:${d.id}:${d.updatedAt}`, d.updatedBy, d.updatedAt, `edited a special day · ${clip(d.title)}`, { type: 'date', date: repeatDate(d) });
    }
    for (const t of data.tasks) {
      add('todo', 'tk:' + t.id, t.by, t.createdAt, `added a little thing · ${clip(t.title)}`, { type: 'item', tab: 'todo', id: t.id });
      if (edited(t) && /done/.test(t.updatedWhat || '')) add('todo', `tk-u:${t.id}:${t.updatedAt}`, t.updatedBy, t.updatedAt, `${t.done ? 'finished ✓' : 'reopened'} · ${clip(t.title)}`, { type: 'item', tab: 'todo', id: t.id });
    }
    for (const t of data.trips) {
      add('todo', 'tr:' + t.id, t.by, t.createdAt, `added a trip · ${clip(t.title)}`, { type: 'item', tab: 'todo', id: t.id });
      if (edited(t) && /status/.test(t.updatedWhat || '')) add('todo', `tr-u:${t.id}:${t.updatedAt}`, t.updatedBy, t.updatedAt, `marked ${clip(t.title)} as ${statusLabel(t.status)}`, { type: 'item', tab: 'todo', id: t.id });
    }
    for (const w of data.wishes) {
      add('wishlist', 'ws:' + w.id, w.by, w.createdAt, `wished for · ${clip(w.title)}`, { type: 'item', tab: 'wishlist', id: w.id });
      if (edited(w) && /got/.test(w.updatedWhat || '') && w.got) add('wishlist', `ws-u:${w.id}:${w.updatedAt}`, w.updatedBy, w.updatedAt, `got it ♡ · ${clip(w.title)}`, { type: 'item', tab: 'wishlist', id: w.id });
    }
    for (const e of data.diary) {
      const n = (e.photoIds || []).length;
      add('diary', 'dy:' + e.id, e.author, e.createdAt, `posted in the diary · ${clip(e.text) || (n ? n + ' photo' + (n === 1 ? '' : 's') : '')}`, { type: 'entry', id: e.id });
      if (edited(e) && /text|tags|date/.test(e.updatedWhat || '')) add('diary', `dy-u:${e.id}:${e.updatedAt}`, e.updatedBy, e.updatedAt, `edited a diary entry · ${clip(e.text)}`, { type: 'entry', id: e.id });
      for (const c of e.comments || []) add('diary', 'cm:' + c.id, c.author, c.at, `${e.author === me ? 'replied to you' : 'replied'}: ${clip(c.text)}`, { type: 'entry', id: e.id });
    }
    for (const g of photoUploads()) { // a batch that grows gets a new key (so it alerts again); older photos keep their first photo's key
      const first = g[0], n = g.length, album = data.albums.find(a => a.id === first.albumId);
      add('album', first.batch ? `ph:b:${first.batch}#${n}` : 'ph:' + first.id, first.author, g[n - 1].createdAt, `added ${n === 1 ? 'a photo' : n + ' photos'} to ${album ? clip(album.title, 24) : 'the album'}`, { type: 'photo', id: first.id, ids: g.map(p => p.id), thumb: thumbOf(first) });
    }
    const day = qDay(), answered = new Set(data.answers.filter(a => a.author === me).map(a => a.date));
    const whichQ = date => (date === day ? 'today’s question' : `the question for ${niceDate(date, { month: 'short', day: 'numeric' })}`);
    for (const a of data.answers) {
      const open = answered.has(a.date), target = { type: 'question', date: a.date }; // no spoilers before you answer
      add('home', 'qa:' + a.id, a.author, a.createdAt, `answered ${whichQ(a.date)} · ${open ? clip(a.text) : 'your turn 🔒'}`, target);
      if (open && edited(a)) add('home', `qa-u:${a.id}:${a.updatedAt}`, a.updatedBy, a.updatedAt, `edited their answer · ${clip(a.text)}`, target);
    }
    checkinMessages(add, edited);
    for (const { q, on } of Q.schedule(data.questions)) if (on <= day) add('home', 'cq:' + q.id, q.by, localMidnight(on), `asked you ${on === day ? 'today’s' : 'a'} question · ${clip(q.text)}`, { type: 'question', date: on });
    return out.sort((a, b) => b.at - a.at);
  }
  function photoUploads() { // album photos grouped by upload; older photos without a batch group by person + album + within 10 minutes
    const groups = new Map(), open = new Map();
    for (const p of data.photos.filter(x => !x.entryId && x.author && x.createdAt).sort((a, b) => a.createdAt - b.createdAt)) {
      if (p.batch) { const g = groups.get('b:' + p.batch); g ? g.push(p) : groups.set('b:' + p.batch, [p]); continue; }
      const k = p.author, g = open.get(k); // not the album, so moving a photo later doesn't split its upload
      if (g && p.createdAt - g[g.length - 1].createdAt < 10 * 60000) g.push(p);
      else { const fresh = [p]; open.set(k, fresh); groups.set('p:' + p.id, fresh); }
    }
    return [...groups.values()];
  }
  function isRead(key, read) { // a photo batch read at a bigger size stays read after one of its photos is deleted
    if (read.has(key)) return true;
    const m = /^ph:b:(.+)#(\d+)$/.exec(key); if (!m) return false;
    for (const k of read) { const r = /^ph:b:(.+)#(\d+)$/.exec(k); if (r && r[1] === m[1] && +r[2] >= +m[2]) return true; }
    return false;
  }
  function unreadMessages() { const st = inboxState(), read = new Set(st.read); return allMessages().filter(m => m.at > st.since && !isRead(m.key, read)); }
  function syncInboxState() {
    if (!ui.me) return;
    const local = localInboxState(), shared = data.meta.inboxReads?.[ui.me];
    const known = new Set((shared?.read || []).map(item => item.key));
    const times = new Map(allMessages().map(m => [m.key, m.at]));
    const items = (local.read || []).filter(key => !known.has(key) && times.has(key)).map(key => ({ key, at: times.get(key) }));
    if (!shared || items.length) run(store.markInboxRead(ui.me, local.since, Date.now() - 30 * 86400000, items));
  }
  function markRead(keys) { // Persist per-person receipts, so another device does not alert again.
    if (!keys.length || !ui.me) return;
    const st = localInboxState(), at = new Map(allMessages().map(m => [m.key, m.at]));
    const cutoff = Date.now() - 30 * 86400000;
    st.since = Math.max(st.since, cutoff);
    st.read = [...new Set([...(st.read || []), ...keys])].filter(k => (at.get(k) || 0) > st.since);
    ls.set(inboxKey(), st);
    run(store.markInboxRead(ui.me, st.since, cutoff, keys.filter(key => at.has(key)).map(key => ({ key, at: at.get(key) }))));
  }
  function renderBadges() {
    const unread = unreadMessages(), by = {};
    unread.forEach(m => by[m.tab] = (by[m.tab] || 0) + 1);
    $$('[data-tab-count]').forEach(b => { const n = by[b.dataset.tabCount] || 0; b.hidden = !n; b.textContent = n > 99 ? '99+' : n; });
    const bell = $('[data-bell-count]'); bell.hidden = !unread.length; bell.textContent = unread.length > 99 ? '99+' : unread.length;
    const here = unread.filter(m => m.tab === ui.page);
    $('[data-inbox-pill]').innerHTML = here.length ? `<button type="button" class="cc-inbox-pill" data-open-inbox="${ui.page}">${mini(nameToKey(here[0].who))}<span>${here.length} new message${here.length === 1 ? '' : 's'}</span><span aria-hidden="true">›</span></button>` : '';
    if (ui.inboxOpen) renderInbox();
    setIconBadge(ui.me && !$('[data-app]').hidden ? unread.length + (answerOf(qDay(), ui.me) ? 0 : 1) : 0);
  }
  // number on the installed app's icon: new messages, plus one while today's question is unanswered
  let iconBadge = -1;
  function setIconBadge(n) {
    if (n === iconBadge || !('setAppBadge' in navigator)) return;
    iconBadge = n;
    (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
  }
  function renderInbox() {
    const dlg = $('[data-inbox]'), filter = ui.inboxFilter || 'all';
    const list = allMessages().filter(m => filter === 'all' || m.tab === filter).slice(0, 50);
    const fresh = ui.inboxFresh || new Set();
    const tabs = [['all', 'All'], ...Object.entries(TAB_NAMES)];
    dlg.innerHTML = `<section class="cc-window"><div class="cc-bar"><span>✉ MESSAGES</span><button type="button" class="cc-min" data-close-inbox aria-label="Close">×</button></div><div class="cc-body">
      <div class="cc-filter-row">${tabs.map(([v, l]) => `<button type="button" class="cc-button" data-inbox-filter="${v}" aria-pressed="${filter === v}">${l}</button>`).join('')}</div>
      <div class="cc-inbox-list">${list.map(m => `<button type="button" class="cc-inbox-item ${fresh.has(m.key) ? 'cc-fresh' : ''}" data-inbox-go="${esc(m.key)}">${mini(nameToKey(m.who))}<span class="cc-inbox-text"><b>${esc(m.who)}</b> ${window.CCPixelEmoji ? CCPixelEmoji.text(m.text) : esc(m.text)}<small>${esc(TAB_NAMES[m.tab])} · ${esc(timestamp(m.at))}</small></span>${m.target.thumb ? `<img src="${esc(m.target.thumb)}" alt="">` : '<span class="cc-inbox-arrow" aria-hidden="true">›</span>'}</button>`).join('') || '<p class="cc-empty-plan">No messages yet. When the other person adds or replies to something, it shows up here.</p>'}</div>
    </div></section>`;
  }
  function openInbox(filter) {
    const unread = unreadMessages();
    ui.inboxFresh = new Set(unread.map(m => m.key)); ui.inboxFilter = filter || 'all'; ui.inboxOpen = true;
    markRead(unread.filter(m => ui.inboxFilter === 'all' || m.tab === ui.inboxFilter).map(m => m.key));
    renderInbox(); renderBadges();
    const dlg = $('[data-inbox]'); if (!dlg.open) dlg.showModal?.() ?? dlg.setAttribute('open', '');
  }
  function closeInbox() { ui.inboxOpen = false; const dlg = $('[data-inbox]'); if (dlg.open) dlg.close(); }
  function goToMessage(key) {
    const m = allMessages().find(x => x.key === key); if (!m) return;
    markRead([key]); closeInbox(); goToTarget(m.target);
  }
  function goToTarget(t) { // shared by the inbox and the achievements shelf
    if (t.type === 'date') { select(t.date); if (planner.view === 'year') planner.view = 'month'; go('home'); $('[data-home-calendar]')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
    else if (t.type === 'photo') { ui.album = 'all'; ui.pages.album = pageForItem(photosSorted(), t.id); go('album'); openPhoto(t.id, t.ids?.filter(id => data.photos.some(p => p.id === id))); }
    else if (t.type === 'question') { if (t.date === qDay()) showTodayQuestion(); else { go('home'); openQuestions(true, t.date); } }
    else if (t.type === 'checkin') { if (t.week === thisWeek()) showTodayQuestion(); else { go('home'); openQuestions(true, 'wk:' + t.week); } }
    else if (t.type === 'album') { ui.album = data.albums.some(a => a.id === t.id) ? t.id : 'all'; ui.albumForm = ''; ui.pages.album = 1; go('album'); }
    else {
      ui.highlight = t.id;
      if (t.type === 'entry') { diaryFilter.q = ''; diaryFilter.tag = ''; ui.pages.diary = pageForItem(diarySorted(), t.id); }
      if (t.tab === 'todo') { planner.todoFilter = 'all'; ui.pages.todo = pageForItem(todoSorted(), t.id); }
      if (t.tab === 'wishlist') ui.pages.wishlist = pageForItem(wishesSorted(), t.id);
      go(t.type === 'entry' ? 'diary' : t.tab);
      document.getElementById((t.type === 'entry' ? 'entry-' : 'item-') + t.id)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setTimeout(() => { ui.highlight = null; scheduleRender(); }, 3000);
    }
  }

  // ---------- special days modal ----------
  function openSpecial(open) {
    planner.specialOpen = open; if (!open) planner.editingDay = null;
    render();
    const dlg = $('[data-special-dialog]');
    if (open && !dlg.open) dlg.showModal?.() ?? dlg.setAttribute('open', '');
    if (!open && dlg.open) dlg.close();
  }

  // ---------- tear-off "days together" calendar ----------
  const WEEK_ZH = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  function tearSheets(anniv) {
    const d = utcDay(today);
    const todaySheet = { head: niceDate(today, { month: 'short', year: 'numeric' }).toUpperCase(), num: d.getUTCDate(), unit: WEEK_ZH[d.getUTCDay()], foot: 'TODAY' };
    if (!anniv) return [{ head: 'TOGETHER', num: '?', unit: 'DAYS TOGETHER · 在一起', foot: '', set: true }, todaySheet];
    const n = daysBetween(anniv.date, today) + 1, next100 = Math.ceil((n + 1) / 100) * 100;
    const nextAnniv = repeatDate({ ...anniv, repeat: true }), years = +nextAnniv.slice(0, 4) - +anniv.date.slice(0, 4);
    return [
      { head: 'TOGETHER', num: n, unit: 'DAYS TOGETHER · 在一起', foot: 'since ' + anniv.date.replace(/-/g, '.') },
      todaySheet,
      { head: 'NEXT', num: next100 - n, unit: `DAYS LEFT · 距第 ${next100} 天`, foot: niceDate(shiftDay(today, next100 - n), { month: 'short', day: 'numeric', year: 'numeric' }) },
      { head: `${years} YEAR${years === 1 ? '' : 'S'}`, num: daysBetween(today, nextAnniv), unit: 'DAYS LEFT · 距周年', foot: niceDate(nextAnniv, { month: 'short', day: 'numeric', year: 'numeric' }) }
    ];
  }
  function renderTearpad(anniv) {
    const sheets = tearSheets(anniv), sh = sheets[ui.tearView % sheets.length];
    $('[data-tearpad]').innerHTML = `<div class="cc-tear-rings" aria-hidden="true"><i></i><i></i><i></i></div><div class="cc-tear-stack" aria-hidden="true"></div>
      <button type="button" class="cc-tear-sheet" data-tear aria-label="Tear off this page"><span class="cc-tear-head">${esc(sh.head)}</span><b class="cc-tear-num">${esc(sh.num)}</b><span class="cc-tear-unit">${esc(sh.unit)}</span><span class="cc-tear-foot">${esc(sh.foot)}</span><span class="cc-tear-perf" aria-hidden="true"></span></button>
      ${sh.set ? '<button type="button" class="cc-button cc-tear-set" data-set-anniversary>Set our anniversary</button>' : `<p class="cc-tear-hint">tap to tear · ${ui.tearView % sheets.length + 1}/${sheets.length}</p>`}`;
  }
  function tear() {
    const sheet = $('.cc-tear-sheet'); if (!sheet) return;
    const ghost = sheet.cloneNode(true); ghost.classList.add('cc-tearing'); ghost.removeAttribute('data-tear'); ghost.setAttribute('aria-hidden', 'true'); ghost.tabIndex = -1;
    ghost.style.setProperty('--tilt', (Math.random() > .5 ? 1 : -1) * (8 + Math.random() * 10) + 'deg');
    $('[data-tearpad]').appendChild(ghost);
    ui.tearView++;
    const anniv = data.dates.filter(d => d.kind === 'anniversary' && d.date <= today).sort((a, b) => a.date.localeCompare(b.date))[0];
    const keep = ghost; renderTearpad(anniv); $('[data-tearpad]').appendChild(keep);
    setTimeout(() => keep.remove(), 700);
    $('.cc-tear-sheet')?.focus({ preventScroll: true });
  }

  // ---------- hero picture ----------
  async function loadHero(id) {
    if (!id || ui.heroImages[id] || ui.heroLoading === id) return;
    ui.heroLoading = id;
    const url = await store.getFull(id).catch(() => null);
    ui.heroLoading = null;
    if (url) { ui.heroImages[id] = url; applyTheme(); }
  }
  function renderHeroCaption() {
    const cap = data.meta.heroCaption || 'SUNFLOWER GARDEN', custom = !!data.meta.hero;
    loadHero(data.meta.hero);
    fill($('[data-hero-caption]'), ui.editCaption
      ? `<form class="cc-caption-form" data-caption-form><input name="caption" maxlength="40" value="${esc(ui.captionDraft ?? cap)}" aria-label="Picture caption"><button type="submit" class="cc-button">Save</button><button type="button" class="cc-button" data-caption-cancel>Cancel</button></form>`
      : `<button type="button" class="cc-caption-text" data-caption-edit title="Edit caption">${esc(cap)}</button><span class="cc-hero-tools"><span class="cc-button cc-file-btn">${busy.hero ? 'Saving…' : '✎ Photo'}<input type="file" accept="image/*" data-hero-file aria-label="Change the top picture"></span>${custom ? '<button type="button" class="cc-button" data-hero-reset>Reset</button>' : ''}</span>`);
  }

  // ---------- status ----------
  // Like WeChat 状态: one status per person in meta ('status:<key>' = { emoji, text, at } or null),
  // so the two of us never overwrite each other. Shown in a slide-out tab on the right edge of every page.
  // every emoji in this UI goes through emojiHtml (pixel-art versions can plug in here); data keeps plain characters
  const emojiHtml = ch => (window.CCPixelEmoji ? CCPixelEmoji.html(ch, { decorative: true }) : `<span class="cc-emoji">${esc(ch)}</span>`);
  const STATUS_PRESETS = [
    { emoji: '😴', en: 'Sleepy', zh: '犯困' },
    { emoji: '💼', en: 'Busy', zh: '忙碌' },
    { emoji: '🍜', en: 'Eating', zh: '干饭' },
    { emoji: '🚗', en: 'On my way', zh: '在路上' },
    { emoji: '🥰', en: 'Missing you', zh: '想你' },
    { emoji: '🤒', en: 'Unwell', zh: '不舒服' },
    { emoji: '📚', en: 'Studying', zh: '学习中' },
    { emoji: '🏃', en: 'Working out', zh: '运动' },
    { emoji: '🎮', en: 'Gaming', zh: '游戏' },
    { emoji: '🛁', en: 'Relaxing', zh: '放松' },
    { emoji: '🎧', en: 'Music on', zh: '听歌' },
    { emoji: '😤', en: 'Grumpy', zh: '有点烦' },
    { emoji: '✈️', en: 'Travelling', zh: '出行' },
    { emoji: '🌙', en: 'Good night', zh: '晚安' }
  ];
  const STATUS_DAY = 86400000, STATUS_MAX = 40;
  const statusDraft = { emoji: '', text: '', dirty: false, owner: null }; // survives re-renders while typing
  let statusShown = null, statusSwipe = null, statusSwipedAt = -1e9;
  const statusKey = key => 'status:' + key;
  function statusOf(key) {
    const s = key ? data.meta[statusKey(key)] : null;
    return s && typeof s === 'object' && s.emoji && Number.isFinite(+s.at) ? { emoji: String(s.emoji), text: String(s.text || ''), at: +s.at } : null;
  }
  const statusStale = s => Date.now() - s.at >= STATUS_DAY; // older statuses stay, just dimmed
  function statusWhen(s) {
    if (!statusStale(s)) return ago(s.at);
    const n = Math.floor((Date.now() - s.at) / STATUS_DAY);
    return `set ${n} day${n === 1 ? '' : 's'} ago`;
  }
  const statusPreset = emoji => STATUS_PRESETS.find(p => p.emoji === emoji);
  const statusChars = t => (typeof Intl !== 'undefined' && Intl.Segmenter ? [...new Intl.Segmenter().segment(t)].map(x => x.segment) : Array.from(t));
  const statusClip = (t, n = 12) => { const c = statusChars(String(t).replace(/\s+/g, ' ').trim()); return c.length > n ? c.slice(0, n - 1).join('') + '…' : c.join(''); };
  // "seen" bookkeeping: always go through these two, so the storage behind them can change
  function statusSeenAt() { return ui.me ? Math.max(+data.meta['statusSeen:' + ui.me] || 0, +ls.get('statusSeen:' + ui.me, 0) || 0) : 0; } // synced per person, local copy for right now
  function markStatusSeen(at) { if (!ui.me || !(at > statusSeenAt())) return; const key = 'statusSeen:' + ui.me; ls.set(key, at); data.meta = { ...data.meta, [key]: at }; run(store.mergeMeta(key, at, 'max')); } // merged, so an older device can't lower it
  function statusUnseen() {
    const s = statusOf(partnerKey()); if (!s) return false;
    const seen = statusSeenAt();
    return seen ? s.at > seen : Date.now() - s.at < STATUS_DAY; // first run: only a fresh status counts as new
  }
  function statusBubble(key) { // the player card's speech bubble shows the status when there is one
    const s = statusOf(key);
    if (!s) return `<span class="cc-baby-bubble" lang="zh-CN">${PLAYER_BUBBLES[key]}</span>`;
    return `<span class="cc-baby-bubble cc-status-bubble${statusStale(s) ? ' cc-status-stale' : ''}">${emojiHtml(s.emoji)} ${esc(statusClip(s.text, 10))}</span>`;
  }
  function statusCardHtml() {
    const key = partnerKey(), s = statusOf(key);
    const who = `<div class="cc-status-who">${mini(key)}<b>${esc(PEOPLE[key])}</b>${s ? `<small class="cc-plan-tag">${esc(statusWhen(s))}</small>` : ''}</div>`;
    if (!s) return `<div class="cc-status-card cc-status-none ${key}">${who}<p class="cc-status-text cc-small">No status yet.</p></div>`;
    return `<div class="cc-status-card ${key}${statusStale(s) ? ' cc-status-stale' : ''}">${who}<div class="cc-status-now"><span class="cc-status-emoji">${emojiHtml(s.emoji)}</span><p class="cc-status-text">${esc(s.text)}</p></div></div>`;
  }
  function statusMineHtml() {
    const s = statusOf(ui.me), d = statusDraft, pick = statusPreset(d.emoji);
    const current = s
      ? `<div class="cc-status-mine${statusStale(s) ? ' cc-status-stale' : ''}"><span class="cc-status-emoji-sm">${emojiHtml(s.emoji)}</span><span class="cc-status-mine-text">${esc(s.text)}<small class="cc-plan-tag">${esc(statusWhen(s))}</small></span><button type="button" class="cc-button" data-status-clear>Clear</button></div>`
      : '<p class="cc-small cc-status-mine-empty">Not set yet. Pick one below.</p>';
    const presets = STATUS_PRESETS.map((p, i) => `<button type="button" class="cc-button cc-status-preset" data-status-preset="${i}" aria-pressed="${d.emoji === p.emoji}" aria-label="${esc(`${p.en} ${p.zh}`)}" title="${esc(`${p.en} · ${p.zh}`)}">${emojiHtml(p.emoji)}</button>`).join('');
    return `<h3 class="cc-status-sub">Your status · <span lang="zh-CN">我的状态</span></h3>${current}
      <div class="cc-status-presets" role="group" aria-label="Pick a status">${presets}</div>
      <form class="cc-status-form" data-status-form><label class="cc-field">${pick ? `${emojiHtml(pick.emoji)} ${esc(pick.en)} · ${esc(pick.zh)}` : 'Tap an emoji, then add a few words'}<input name="text" type="text" maxlength="${STATUS_MAX}" autocomplete="off" placeholder="${esc(pick ? pick.zh : '干饭')}" value="${esc(d.text)}"></label><div class="cc-form-footer"><button class="cc-button" type="submit">Save</button></div></form>`;
  }
  function renderStatus(soft = passive) {
    const box = $('[data-status-root]'); if (!box) return;
    const tab = box.querySelector('[data-status-toggle]'), panel = box.querySelector('[data-status-panel]'), body = panel.querySelector('[data-status-body]');
    box.hidden = !ui.me || $('[data-app]').hidden;
    if (box.hidden) ui.statusOpen = false;
    const open = !!ui.statusOpen;
    box.classList.toggle('cc-open', open);
    tab.setAttribute('aria-expanded', String(open));
    panel.toggleAttribute('inert', !open);
    if (open) panel.removeAttribute('aria-hidden'); else panel.setAttribute('aria-hidden', 'true');
    if (box.hidden) { body.innerHTML = ''; statusShown = null; return; }
    if (statusDraft.owner !== ui.me) Object.assign(statusDraft, { owner: ui.me, emoji: '', text: '', dirty: false });
    const key = partnerKey(), theirs = statusOf(key);
    if (open && theirs) markStatusSeen(theirs.at); // looking at it counts as seeing it
    const unseen = statusUnseen();
    tab.setAttribute('aria-label', `${PEOPLE[key]}'s status${theirs ? `: ${theirs.emoji} ${theirs.text}` : ''}${unseen ? ' (new)' : ''}`);
    tab.innerHTML = `${mini(key)}${theirs ? `<span class="cc-status-tab-emoji${statusStale(theirs) ? ' cc-status-stale' : ''}">${emojiHtml(theirs.emoji)}</span>` : ''}<span class="cc-status-chev" aria-hidden="true">${open ? '›' : '‹'}</span>${unseen ? '<i class="cc-status-dot" aria-hidden="true"></i>' : ''}`;
    const html = `<div data-status-partner>${statusCardHtml()}</div>${statusMineHtml()}`;
    if (html === statusShown) return;
    const a = document.activeElement, inside = !!a && body.contains(a);
    // a sync while typing only refreshes the other person's card, so the keyboard and IME stay put
    if (soft && inside && a.matches('input')) { const card = body.querySelector('[data-status-partner]'); if (card) card.innerHTML = statusCardHtml(); statusShown = null; return; }
    const sel = !inside ? null : a.name ? `[name="${a.name}"]` : a.dataset.statusPreset != null ? `[data-status-preset="${a.dataset.statusPreset}"]` : a.hasAttribute('data-status-clear') ? '[data-status-clear]' : a.type === 'submit' ? '[data-status-form] [type=submit]' : null;
    const range = inside && a.matches('input') ? [a.selectionStart, a.selectionEnd] : null;
    body.innerHTML = html; statusShown = html;
    if (inside) {
      const el = (sel && body.querySelector(sel)) || panel.querySelector('[data-status-close]');
      el.focus({ preventScroll: true });
      if (range && el.setSelectionRange) try { el.setSelectionRange(...range); } catch {}
    }
  }
  function openStatus(open, restoreFocus = true) {
    if (open && !ui.me) return;
    const was = !!ui.statusOpen, box = $('[data-status-root]');
    ui.statusOpen = open;
    if (open && !was && !statusDraft.dirty) { const mine = statusOf(ui.me); Object.assign(statusDraft, { owner: ui.me, emoji: mine?.emoji || '', text: mine?.text || '' }); }
    renderStatus(false);
    if (open && !was) box.querySelector('[data-status-panel] :is(button, input):not([disabled])')?.focus({ preventScroll: true });
    if (!open && was && restoreFocus) box.querySelector('[data-status-toggle]')?.focus({ preventScroll: true });
  }
  function setMyStatus(value) {
    if (!ui.me) return;
    const key = statusKey(ui.me);
    data.meta = { ...data.meta, [key]: value };
    run(store.setMeta({ [key]: value }));
    render();
  }
  function pickStatusPreset(i) {
    const p = STATUS_PRESETS[i]; if (!p) return;
    const t = statusDraft.text.trim(); // replace the words only while they are still a preset's label
    if (!t || STATUS_PRESETS.some(x => [x.zh, x.en, `${x.zh} ${x.en}`].includes(t))) statusDraft.text = p.zh;
    Object.assign(statusDraft, { emoji: p.emoji, dirty: true }); keepDraft('status');
    renderStatus(false);
  }
  function saveStatus(form) {
    const field = form.elements.text, text = String(field.value || '').trim().slice(0, STATUS_MAX), pick = statusPreset(statusDraft.emoji);
    if (!statusDraft.emoji) { flash('Pick an emoji for your status first.'); $('[data-status-preset]')?.focus(); return; }
    const value = { emoji: statusDraft.emoji, text: text || pick?.zh || '', at: Date.now() };
    Object.assign(statusDraft, { emoji: value.emoji, text: value.text, dirty: false }); dropDraft('status');
    setMyStatus(value);
    flash('Status saved.');
  }
  {
    const box = $('[data-status-root]'), panel = box.querySelector('[data-status-panel]');
    root.addEventListener('click', e => {
      const el = e.target.closest('button'); if (!el || !box.contains(el)) return;
      if (el.hasAttribute('data-status-toggle')) openStatus(!ui.statusOpen);
      else if (el.hasAttribute('data-status-close')) openStatus(false);
      else if (el.dataset.statusPreset != null) pickStatusPreset(+el.dataset.statusPreset);
      else if (el.hasAttribute('data-status-clear')) { Object.assign(statusDraft, { emoji: '', text: '', dirty: false }); dropDraft('status'); setMyStatus(null); flash('Status cleared.'); }
    });
    root.addEventListener('input', e => { if (e.target.name === 'text' && e.target.closest('[data-status-form]')) { Object.assign(statusDraft, { text: e.target.value, dirty: true }); keepDraft('status'); } });
    root.addEventListener('submit', e => { if (e.target.matches('[data-status-form]')) { e.preventDefault(); saveStatus(e.target); } });
    // tapping anywhere else closes it (composedPath: a re-render may already have detached the target)
    document.addEventListener('click', e => {
      if (!ui.statusOpen || e.composedPath().includes(box)) return;
      const a = document.activeElement;
      openStatus(false, !a || a === document.body || panel.contains(a));
    });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || e.isComposing || !ui.statusOpen || root.querySelector('dialog[open]')) return;
      e.preventDefault(); openStatus(false);
    });
    // swipe left on the tab opens, swipe right on the tab or the open panel closes
    box.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const onTab = !!e.target.closest('[data-status-toggle]');
      if (!onTab && !(ui.statusOpen && e.target.closest('[data-status-panel]'))) return;
      if (e.target.closest('input, textarea, select')) return; // let text selection be
      statusSwipe = { id: e.pointerId, x: e.clientX, y: e.clientY, onTab };
    });
    document.addEventListener('pointerup', e => {
      const s = statusSwipe; if (!s || s.id !== e.pointerId) return;
      statusSwipe = null;
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (Math.abs(dx) < 30 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0 && s.onTab && !ui.statusOpen) { statusSwipedAt = performance.now(); openStatus(true); }
      else if (dx > 0 && ui.statusOpen) { statusSwipedAt = performance.now(); openStatus(false); }
    });
    document.addEventListener('pointercancel', e => { if (statusSwipe?.id === e.pointerId) statusSwipe = null; });
    box.addEventListener('dragstart', e => e.preventDefault()); // dragging selected text or an avatar would cancel the swipe
    // the click that ends a swipe must not toggle it straight back (or count as an outside tap)
    document.addEventListener('click', e => { if (performance.now() - statusSwipedAt < 400) { statusSwipedAt = -1e9; e.stopPropagation(); e.preventDefault(); } }, true);
    setInterval(() => { if (ui.statusOpen && !document.hidden) renderStatus(true); }, 60000); // keep "2h ago" fresh
  }

  // ---------- drafts: typed but not sent yet, kept on this device per person (localStorage), so a reload or iOS
  // closing the app loses nothing; sending, cancelling or closing the form forgets them. Picked photos are not kept (too big).
  let draftsOwner = null;
  const draftNow = { // each kind as it is in memory now, or null when there is nothing to keep
    diary: () => (diaryDraft.text || diaryDraft.tags || diaryDraft.date !== today ? { text: diaryDraft.text, tags: diaryDraft.tags, date: diaryDraft.date !== today ? diaryDraft.date : '' } : null),
    reply: id => commentDrafts[id] || null,
    answer: id => questionDrafts[id] || null,
    checkin: id => { const c = checkinDrafts[id]; return c && (c.mood || c.text) ? { mood: c.mood, text: c.text } : null; },
    ask: () => (planner.drafts.ask.text ? { text: planner.drafts.ask.text, date: planner.drafts.ask.date || '' } : null),
    status: () => (statusDraft.dirty ? { emoji: statusDraft.emoji, text: statusDraft.text } : null)
  };
  const obj = v => (v && typeof v === 'object' ? v : {}), str = v => (typeof v === 'string' ? v : '');
  function keepDraft(kind, id = '', drop = false) { // written straight away (a few hundred bytes), so nothing waits on a timer when iOS closes the app
    if (!draftsOwner || draftsOwner !== ui.me) return;
    const all = obj(ls.get('drafts:' + draftsOwner, {})), box = all[kind] = obj(all[kind]), v = drop ? null : draftNow[kind](id);
    if (v) box[id] = v; else delete box[id];
    if (!Object.keys(box).length) delete all[kind];
    ls.set('drafts:' + draftsOwner, all);
  }
  const dropDraft = (kind, id) => keepDraft(kind, id, true);
  function loadDrafts() { // on start, and when someone else starts playing on this device
    if (!ui.me || draftsOwner === ui.me) return;
    draftsOwner = ui.me;
    const all = obj(ls.get('drafts:' + ui.me, {})), one = k => obj(obj(all[k])['']);
    const dy = one('diary'); Object.assign(diaryDraft, { text: str(dy.text), tags: str(dy.tags), date: validDay(str(dy.date)) ? dy.date : today });
    for (const [mem, kind] of [[commentDrafts, 'reply'], [questionDrafts, 'answer']]) { for (const k in mem) delete mem[k]; for (const [k, v] of Object.entries(obj(all[kind]))) if (str(v)) mem[k] = v; }
    for (const k in checkinDrafts) delete checkinDrafts[k];
    for (const [w, c] of Object.entries(obj(all.checkin))) checkinDrafts[w] = { mood: Number(obj(c).mood) || 0, text: str(obj(c).text) };
    const ask = one('ask'); planner.drafts.ask = { text: str(ask.text), date: str(ask.date) };
    const st = one('status'); Object.assign(statusDraft, { owner: ui.me, emoji: str(st.emoji), text: str(st.text), dirty: !!(st.emoji || st.text) });
    if (diaryDraft.text || diaryDraft.tags) ui.newEntryOpen = true; // an unfinished entry comes back already open
    reopenEdits = { answers: Object.keys(questionDrafts), checkins: Object.keys(checkinDrafts) }; reopenDraftEdits();
  }
  let reopenEdits = null;
  function reopenDraftEdits() { // a half-finished edit of an answer or check-in already posted reopens in edit mode, once the data is here
    if (!reopenEdits || !ui.dataReady || !ui.me) return;
    const { answers, checkins } = reopenEdits; reopenEdits = null;
    const a = answers.filter(d => { const m = answerOf(d, ui.me); return m && questionDrafts[d] !== m.text; }).sort().pop();
    if (a) ui.editingAnswer = a;
    const c = checkins.filter(w => { const m = checkinOf(w, ui.me), d = checkinDrafts[w]; return m && d && (d.mood !== (Number(m.mood) || 0) || d.text !== (m.text || '')); }).sort().pop();
    if (c) editingCheckin = c;
  }

  // ---------- chrome: player card, hero, sync ----------
  function renderChrome() {
    $$('[data-panel]').forEach(p => p.hidden = p.dataset.panel !== ui.page);
    $$('.cc-tab').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.go === ui.page)));
    $('[data-current-folder]').textContent = ui.page;
    const local = store.mode === 'local';
    const avatars = data.meta.avatars || {};
    const badge = key => `<span class="cc-badge ${key}">${avatarOf(key) ? `<img src="${esc(avatarOf(key))}" alt="">` : PEOPLE[key].slice(0, 1)}</span>`;
    const playerAvatar = key => `<span class="cc-player-avatar ${key}">${badge(key)}${statusBubble(key)}</span>`;
    const canBadge = 'setAppBadge' in navigator && 'Notification' in window && Notification.permission === 'default' && (matchMedia('(display-mode: standalone)').matches || navigator.standalone);
    const picture = `<div class="cc-avatar-tools"><span class="cc-button cc-file-btn">${ui.busy === 'avatar' ? 'Saving…' : 'Change my picture'}<input type="file" accept="image/*" data-avatar-file aria-label="Change my profile picture"></span>${avatars[ui.me] ? '<button type="button" class="cc-link" data-avatar-reset>Remove picture</button>' : ''}${canBadge ? '<button type="button" class="cc-link" data-enable-badge>Show a count on the app icon</button>' : ''}</div>`;
    $('[data-player-card]').innerHTML = (local
      ? `<div class="cc-avatar" role="group" aria-label="Who is writing on this device">${['sijie', 'zhenzhen'].map(k => `<button type="button" class="cc-avatar-btn" data-me="${k}" aria-pressed="${ui.me === k}">${playerAvatar(k)}<small>${PLAYER_NICKNAMES[k]}</small></button>`).join('<span class="cc-avatar-heart" aria-hidden="true">♥</span>')}</div><div class="cc-player-label">Playing as ${esc(meName())}</div>`
      : `<div class="cc-avatar">${['sijie', 'zhenzhen'].map(k => `<span class="cc-avatar-static ${ui.me === k ? 'me' : ''}">${playerAvatar(k)}<small>${PLAYER_NICKNAMES[k]}</small></span>`).join('<span class="cc-avatar-heart" aria-hidden="true">♥</span>')}</div>`) + picture;
    const mode = currentMode();
    for (const k of ['dark', 'high']) {
      $(`[data-mode-toggle="${k}"]`).setAttribute('aria-pressed', String(mode[k]));
      $(`[data-mode-label="${k}"]`).textContent = k === 'dark' ? (mode.dark ? 'DARK' : 'LIGHT') : (mode.high ? 'HIGH' : 'NORMAL');
    }
    const icon = avatarOf(ui.me);
    $('[data-user-icon]').innerHTML = ui.me ? (icon ? `<img src="${esc(icon)}" alt="">` : esc(PEOPLE[ui.me].slice(0, 1))) : '?';
    $('[data-user-icon]').className = 'cc-user-icon ' + (ui.me || '');
    applyTheme();
    const ws = weekStart(today), weekCount = Array.from({ length: 7 }, (_, i) => dayEvents(shiftDay(ws, i)).length).reduce((a, b) => a + b, 0);
    $('[data-hero-stats]').innerHTML = `<button type="button" data-hero="week">▦ ${weekCount} this week</button><button type="button" data-go="diary">✎ ${data.diary.length} diary</button><button type="button" data-go="album">▧ ${data.photos.length} photos</button>${ui.me && A ? achChip() : ''}`;
    const anniv = data.dates.filter(d => d.kind === 'anniversary' && d.date <= today).sort((a, b) => a.date.localeCompare(b.date))[0];
    renderTearpad(anniv);
    renderHeroCaption();
    const busyMin = ui.sync === 'ratelimited' ? Math.max(1, Math.ceil((ui.syncUntil - Date.now()) / 60000)) : 0; // GitHub rate limit: minutes left
    const syncText = { local: 'LOCAL ONLY', connecting: 'CONNECTING…', synced: '● SYNCED', saving: 'SAVING…', offline: 'OFFLINE', error: 'SYNC ERROR', signedout: 'LOG IN', ratelimited: `BUSY · RETRY ${busyMin}m` }[ui.sync] || '';
    const chip = $('[data-sync]'); chip.textContent = syncText; chip.dataset.state = ui.sync;
    chip.title = busyMin ? `GitHub is busy, trying again in ${busyMin} min. Your changes are kept and will save then.` : local ? 'Saved only in this browser. Fill in the GitHub repo in config.js to share.' : 'Saved to GitHub. Checks for updates every 20 seconds.';
    $('[data-logout]').hidden = local || !ui.user;
  }

  // ---------- render with focus preservation ----------
  let frame = 0, passive = false; // passive: a background sync or timer, not something the user just did
  let ime = null, imeWaiting = false; // ime: the field with an open IME composition (pinyin not yet turned into 你)
  root.addEventListener('compositionstart', e => { ime = e.target; });
  root.addEventListener('compositionend', () => { ime = null; if (imeWaiting) { imeWaiting = false; scheduleRender(); } }); // next frame: Safari sends the last input after compositionend
  // the text field being typed in stays the same element through a re-render (caret, IME and the phone keyboard carry on):
  // everything around it is swapped for the fresh markup; if the markup around it changed shape, the box is rebuilt as before
  const typing = el => !!el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|search|email|url|tel|password)$/.test(el.type)));
  const idOf = el => [...el.attributes].filter(x => x.name === 'id' || x.name.startsWith('data-')).map(x => x.name + '=' + x.value).join();
  function keepField(box, html, field) {
    const t = document.createElement('template'); t.innerHTML = html;
    const path = [], pairs = []; for (let n = field; n !== box; n = n.parentNode) path.unshift(n);
    let fresh = t.content;
    for (const node of path) { // its twin: same id / data-* if it has some (entries can move), else same position
      const kids = [...fresh.childNodes], id = idOf(node);
      const twin = id ? kids.find(k => k.nodeName === node.nodeName && idOf(k) === id) : kids[[...node.parentNode.childNodes].indexOf(node)];
      if (!twin || twin.nodeName !== node.nodeName || idOf(twin) !== id) return false;
      pairs.push([node, twin]); fresh = twin;
    }
    if (fresh.value !== field.value || fresh.type !== field.type) return false; // the render means to change what is typed
    for (const [node, twin] of pairs) {
      const kids = [...twin.parentNode.childNodes], at = kids.indexOf(twin);
      for (const k of [...node.parentNode.childNodes]) if (k !== node) k.remove();
      node.before(...kids.slice(0, at)); node.after(...kids.slice(at + 1));
      for (const x of [...node.attributes]) if (!twin.hasAttribute(x.name)) node.removeAttribute(x.name);
      for (const x of twin.attributes) if (x.name !== 'value' && node.getAttribute(x.name) !== x.value) node.setAttribute(x.name, x.value);
    }
    return true;
  }
  function fill(box, html) { const a = document.activeElement; if (!(typing(a) && box.contains(a) && keepField(box, html, a))) box.innerHTML = html; }
  // a keyboard user on a button / select / checkbox that a render replaces lands on its twin (same data-* or same label,
  // in the same box), not on <body>; mouse clicks keep today's behaviour
  const STATEFUL = /^data-(today|selected|key)$/; // data-* that follow state, not which control it is
  const keysOf = el => [...el.attributes].filter(x => (x.name === 'id' || x.name.startsWith('data-')) && !STATEFUL.test(x.name)).map(x => x.name + '=' + x.value).join();
  const boxOf = el => { for (let p = el.parentElement; p && p !== root; p = p.parentElement) { const k = keysOf(p); if (k) return p.tagName + k; } return ''; };
  const twins = (s, same) => [...root.getElementsByTagName(s.tag)].filter(x => same(x) && !x.disabled && boxOf(x) === s.box && x.getClientRects().length);
  let pointerLast = false; // a <select> shows :focus-visible even when clicked, so it also needs the last input to be a key
  document.addEventListener('pointerdown', () => { pointerLast = true; }, true);
  document.addEventListener('keydown', () => { pointerLast = false; }, true);
  function focusSpot() {
    const a = document.activeElement;
    try { if (!a || !root.contains(a) || !a.matches('button, select, input[type=checkbox], input[type=radio]') || !a.matches(':focus-visible') || (a.tagName === 'SELECT' && pointerLast)) return null; } catch { return null; }
    const s = { el: a, tag: a.tagName, keys: keysOf(a), label: a.getAttribute('aria-label'), box: boxOf(a) };
    s.same = x => keysOf(x) === s.keys && x.getAttribute('aria-label') === s.label;
    const list = twins(s, s.same); s.i = list.indexOf(a); s.n = list.length;
    return s;
  }
  function refocus(s) {
    const now = document.activeElement;
    if (!s || s.el.isConnected || (now && now !== document.body)) return;
    const label = x => x.getAttribute('aria-label'), names = x => keysOf(x).replace(/=[^,]*/g, ''), only = m => (m.length === 1 ? m[0] : null);
    const same = twins(s, s.same), gone = s.label && ![...root.getElementsByTagName(s.tag)].some(x => label(x) === s.label && boxOf(x) === s.box);
    const el = (same.length === s.n ? same[s.i] : only(same)) // the same control, e.g. a calendar day or a filter
      || (s.label && only(twins(s, x => label(x) === s.label && names(x) === names(s.el)))) // same job, new data: "Next page"
      || (gone && s.keys && only(twins(s, x => keysOf(x) === s.keys))); // same data, new label: Minimize ↔ Expand
    if (el) el.focus({ preventScroll: true });
  }
  const keepFocus = fn => { const s = focusSpot(); fn(); refocus(s); };
  function render() {
    cancelAnimationFrame(frame); frame = 0;
    // a field replaced mid-composition commits the raw letters ("ni你"): wait for the composition to end, then render once
    if (ime && ime.isConnected && ime === document.activeElement) { imeWaiting = true; return; }
    ime = null; imeWaiting = false;
    const a = document.activeElement, fa = a && root.contains(a) ? a.closest('form') : null, spot = focusSpot();
    const formAttr = fa && ['data-planner-form', 'data-comment-form', 'data-diary-form', 'data-diary-search', 'data-album-form', 'data-question-form', 'data-checkin-form', 'data-caption-form'].find(n => fa.hasAttribute(n));
    const keep = formAttr ? { sel: `[${formAttr}="${CSS.escape(fa.getAttribute(formAttr))}"]`, name: a.name, start: a.selectionStart, end: a.selectionEnd } : null;
    const on = p => ui.page === p; // only the page on screen is rebuilt; the others are rebuilt when you go to them
    renderChrome(); if (on('home')) renderCalendar(); renderSpecialDays(); if (on('home')) renderQuestion(); renderStatus(); if (on('home')) renderMemory();
    if (on('todo')) renderTodo(); if (on('wishlist')) renderWishlist(); if (on('diary')) renderDiary(); if (on('album')) renderAlbum();
    renderQuestionDialog(); renderAchievementsDialog(); renderMessage(); decorateStaticWindows(); renderBadges();
    if (keep?.name) {
      const el = $(keep.sel)?.elements[keep.name];
      if (el && el !== a && el.focus) { el.focus({ preventScroll: true }); try { if (keep.start != null) el.setSelectionRange(keep.start, keep.end); } catch {} }
    }
    refocus(spot);
    root.querySelectorAll('input[type=file]').forEach(f => { f.onchange ||= filesPicked; });
  }
  const scheduleRender = () => { if (!frame) frame = requestAnimationFrame(() => { passive = true; try { render(); } finally { passive = false; } }); };

  // ---------- navigation ----------
  function go(page) { if (!PAGES.includes(page)) return; ui.page = page; ui.confirm = null; if (location.hash.slice(1) !== page) history.pushState(null, '', '#' + page); render(); }
  window.addEventListener('popstate', () => { const p = location.hash.slice(1) || 'home'; if (PAGES.includes(p)) { ui.page = p; render(); } });

  // ---------- form submit ----------
  async function submitPlanner(form) {
    checkDay(); // just past midnight, before the minute timer notices: an untouched date becomes the new today
    const name = form.dataset.plannerForm, d = Object.fromEntries(new FormData(form));
    if (name === 'entryedit') {
      const entry = data.diary.find(item => item.id === ui.editingEntry);
      if (!entry || entry.author !== meName()) return;
      const draft = planner.drafts.entryedit;
      const text = String(d.text || '').trim();
      const current = entryPhotoIds(entry), kept = draft.photoIds.filter(id => current.includes(id));
      if (!text && !kept.length && !draft.pending.length) {
        form.elements.text.setCustomValidity('Write something or keep a photo.'); form.elements.text.reportValidity(); return;
      }
      busy.entry++; render();
      try {
        const editedDate = currentDay();
        const added = await savePhotos(draft.pending, { entryId: entry.id, date: editedDate });
        await store.update('diary', entry.id, { text, date: editedDate, tags: parseTags(d.tags), photoIds: [...kept, ...added] });
        for (const id of current.filter(id => !kept.includes(id))) await store.remove('photos', id);
        ui.editingEntry = null;
        planner.drafts.entryedit = { text: '', tags: '', photoIds: [], pending: [] };
        ui.pages.diary = 1;
        flash('Saved.');
      } catch (err) { console.error(err); flash('Could not save edits. Please try again.'); }
      busy.entry--; render(); return;
    }
    if (name === 'ask') {
      const text = String(d.text || '').trim().slice(0, 200), tomorrow = shiftDay(qDay(), 1);
      if (!text) { form.elements.text.setCustomValidity('Write a question first.'); form.elements.text.reportValidity(); return; }
      if (!validDay(d.date || '') || d.date < tomorrow) { form.elements.date.setCustomValidity('Pick tomorrow or later.'); form.elements.date.reportValidity(); return; }
      const on = Q.nextFreeDay(d.date, data.questions), partner = PEOPLE[partnerKey()];
      run(store.set('questions', { id: newId(), date: on, text, by: meName(), createdAt: Date.now() }).then(() => render()));
      planner.drafts.ask = { text: '', date: '' }; dropDraft('ask');
      flash(on === d.date ? `Scheduled for ${niceDate(on)}. ${partner} won’t see it until then.` : `${niceDate(d.date)} already has a question, so yours is on ${niceDate(on)}.`);
      render(); return;
    }
    const title = String(d.title || '').trim();
    if (!title) { form.elements.title.setCustomValidity('Please add a name.'); form.elements.title.reportValidity(); return; }
    if (['event', 'special', 'edit'].includes(name) && !d.date) { form.elements.date.setCustomValidity('Please choose a date.'); form.elements.date.reportValidity(); return; }
    for (const f of ['date', 'start', 'end', 'endDate']) if (d[f] && !validDay(d[f])) { form.elements[f].setCustomValidity('Please enter a valid date.'); form.elements[f].reportValidity(); return; }
    if (d.endDate && d.endDate < d.date) { form.elements.endDate.setCustomValidity('The end date must be on or after the start.'); form.elements.endDate.reportValidity(); return; }
    if (name === 'todo' && d.kind === 'trip' && d.end && (!d.start || d.end < d.start)) { form.elements.end.setCustomValidity('Pick a departure date first, then a return on or after it.'); form.elements.end.reportValidity(); return; }
    const base = { id: newId(), title, by: meName(), createdAt: Date.now() }, note = String(d.note || '').trim();
    if (name === 'dayedit') { run(store.update('dates', planner.editingDay, { title, kind: d.kind, date: d.date, repeat: d.repeat === 'on' })); planner.editingDay = null; flash('Saved.'); render(); return; }
    if (name === 'event') {
      const kind = KINDS.some(([key]) => key === d.kind) ? d.kind : 'plan';
      if (kind === 'trip') run(store.set('trips', { ...base, start: d.date, end: d.endDate || '', status: 'planning', note }));
      else if (kind === 'task') run(store.set('tasks', { ...base, date: d.date, done: false, note }));
      else if (['birthday', 'holiday', 'anniversary'].includes(kind)) run(store.set('dates', { ...base, kind, date: d.date, repeat: d.repeat === 'on', note }));
      else run(store.set('events', { ...base, kind: 'plan', date: d.date, endDate: d.endDate || '', note }));
      select(d.date);
      planner.drafts.event = { title: '', kind, date: d.date, endDate: '', note: '', repeat: true };
      planner.forms.event = false; flash('Added to the calendar.');
    }
    if (name === 'edit') { run(store.update('events', planner.editing, { title, date: d.date, endDate: d.endDate || '', note })); planner.editing = null; select(d.date); flash('Saved.'); }
    if (name === 'todo') {
      const save = d.kind === 'trip'
        ? store.set('trips', { ...base, status: d.status, start: d.start || '', end: d.end || '', note })
        : store.set('tasks', { ...base, date: d.date || '', done: false, note });
      run(save.then(() => { ui.pages.todo = pageForItem(todoSorted(), base.id); render(); }));
      planner.drafts.todo = { title: '', kind: 'activity', status: 'dreaming', date: '', start: '', end: '', note: '' }; planner.todoFilter = 'all'; planner.forms.todo = false;
      flash((d.date || d.start) ? 'Added. It also shows in the calendar.' : 'Added.');
    }
    if (name === 'wish') { run(store.set('wishes', { ...base, who: d.who, note, got: false, noteStyle: Math.floor(Math.random() * 8) }).then(() => { ui.pages.wishlist = pageForItem(wishesSorted(), base.id); render(); })); planner.drafts.wish = { title: '', who: 'both', note: '' }; planner.forms.wish = false; flash('Wish added.'); }
    if (name === 'special') { run(store.set('dates', { ...base, kind: d.kind, date: d.date, repeat: d.repeat === 'on' })); planner.drafts.special = { title: '', kind: 'anniversary', date: '', repeat: true }; planner.filter = 'all'; flash('Special day saved.'); }
    render();
  }
  async function submitDiary(form) {
    checkDay(); // see submitPlanner
    const text = String(form.elements.text.value || '').trim(), date = form.elements.date.value || today;
    if (!text && !diaryDraft.pending.length) { form.elements.text.setCustomValidity('Write something or add a photo.'); form.elements.text.reportValidity(); return; }
    if (!validDay(date)) { form.elements.date.setCustomValidity('Please enter a valid date.'); form.elements.date.reportValidity(); return; }
    busy.diary++; render();
    try {
      const id = newId(); // the photos and the entry are saved together, once all the photos are up
      await savePhotos(diaryDraft.pending, { entryId: id, date }, { entry: photoIds => ({ id, author: meName(), text, date, tags: parseTags(diaryDraft.tags), photoIds, comments: [], createdAt: Date.now(), tzo: new Date().getTimezoneOffset() }) });
      diaryDraft.text = ''; diaryDraft.date = today; diaryDraft.tags = ''; diaryDraft.pending = []; dropDraft('diary');
      ui.pages.diary = 1;
      ui.newEntryOpen = false;
      flash('Posted.');
    } catch (e) {
      console.error(e);
      flash(e.code === 'offline' ? 'Could not post: you seem to be offline. Your entry is kept; post it again when you are back online.'
        : e.code === 'ratelimit' ? `Could not post: GitHub is busy. Your entry is kept; try again in ${Math.max(1, Math.ceil((e.until - Date.now()) / 60000))} min.`
        : 'Could not post. Photos may be too large; try fewer.');
    }
    busy.diary--; render();
  }

  // ---------- events ----------
  root.addEventListener('input', e => {
    const el = e.target; el.setCustomValidity?.('');
    if (e.isComposing) ime = el; // also caught here in case compositionstart was missed
    if (el.closest('[data-album-form]') && el.name === 'albumName') ui.albumDraft = el.value;
    if (el.closest('[data-caption-form]')) ui.captionDraft = el.value; // a sync while editing the caption keeps what you typed
    const pf = el.closest('[data-planner-form]');
    if (pf) { planner.drafts[pf.dataset.plannerForm][el.name] = el.type === 'checkbox' ? el.checked : el.value; if (pf.dataset.plannerForm === 'ask') keepDraft('ask'); }
    if (el.closest('[data-diary-form]') && ['text', 'date', 'tags'].includes(el.name)) { diaryDraft[el.name] = el.value; keepDraft('diary'); }
    if (el.closest('[data-diary-search]')) { diaryFilter.q = el.value; ui.pages.diary = 1; clearTimeout(ui.searchTimer); ui.searchTimer = setTimeout(render, 150); } // the box itself is kept (fill), only the results change
    const cf = el.closest('[data-comment-form]'); if (cf) { commentDrafts[cf.dataset.commentForm] = el.value; keepDraft('reply', cf.dataset.commentForm); }
    const qf = el.closest('[data-question-form]'); if (qf) { questionDrafts[qf.dataset.questionForm] = el.value; keepDraft('answer', qf.dataset.questionForm); }
  });
  root.addEventListener('change', e => {
    const el = e.target;
    if (el.type === 'file') return; // file inputs have their own listener: filesPicked
    if (el.matches('[data-photo-album]')) {
      const albumId = el.value;
      if (albumId && !data.albums.some(a => a.id === albumId)) return;
      const photo = data.photos.find(p => p.id === el.dataset.photoAlbum);
      if (!photo || (photo.albumId || '') === albumId) return;
      closePhoto();
      run(store.update('photos', photo.id, { albumId }));
      flash('Photo moved.');
      return;
    }
    if (el.matches('[data-import-date]')) { calendarImport[el.dataset.importDate] = el.value; calendarImport.preview = null; calendarImport.error = ''; render(); }
    if (el.matches('[data-export-kind]')) { planner.exportKind = el.value; ls.set('exportKind', el.value); }
    if (el.matches('[data-task-id]')) run(store.update('tasks', el.dataset.taskId, { done: el.checked }));
    if (el.matches('[data-trip-status]')) run(store.update('trips', el.dataset.tripStatus, { status: el.value }));
    if (el.matches('[data-wish-id]')) run(store.update('wishes', el.dataset.wishId, { got: el.checked }));
    if (el.name === 'kind' && el.closest('[data-planner-form="special"]')) { planner.drafts.special.kind = el.value; planner.drafts.special.repeat = el.value !== 'holiday'; render(); }
    if (el.name === 'kind' && el.closest('[data-planner-form="event"]')) { planner.drafts.event.kind = el.value; render(); }
    if (el.name === 'kind' && el.closest('[data-planner-form="todo"]')) { planner.drafts.todo.kind = el.value; render(); }
    if (el.name === 'kind' && el.closest('[data-planner-form="dayedit"]')) { planner.drafts.dayedit.kind = el.value; planner.drafts.dayedit.repeat = el.value !== 'holiday' || planner.drafts.dayedit.repeat; render(); }
  });
  // Every file input gets this as its own listener (render() adds it): a sync can rebuild the page while the photo
  // picker is open, and a change on an input that has left the page never bubbles up to root.
  async function filesPicked(e) {
    const el = e.target, picked = [...el.files]; el.value = ''; // so the same photo can be picked again
    if (el.matches('[data-calendar-file]')) { calendarImport.file = picked[0] || null; calendarImport.name = calendarImport.file?.name || ''; calendarImport.preview = null; calendarImport.error = ''; render(); }
    if (el.matches('[data-entry-edit-photos]')) {
      const draft = planner.drafts.entryedit;
      const files = picked.slice(0, 9 - draft.photoIds.length - draft.pending.length);
      if (picked.length > files.length) flash('Up to 9 photos per entry.');
      busy.entry++; render();
      for (const file of files) { try { draft.pending.push(await makePhoto(file)); } catch (err) { flash(err.message); } }
      busy.entry--; render();
    }
    if (el.matches('[data-diary-photos]')) {
      const files = picked.slice(0, 9 - diaryDraft.pending.length);
      if (picked.length > files.length) flash('Up to 9 photos per entry.');
      busy.diary++; render();
      for (const f of files) { try { diaryDraft.pending.push(await makePhoto(f)); } catch (err) { flash(err.message); } }
      busy.diary--; render();
    }
    if (el.matches('[data-avatar-file]') && picked[0]) {
      ui.busy = 'avatar'; render();
      try { const img = await CCStore.resizeImage(picked[0], 160, 0.8, true); run(store.metaKey('avatars', ui.me, img)); flash('Picture updated.'); }
      catch (err) { flash(err.message); }
      ui.busy = false; render();
    }
    if (el.matches('[data-hero-file]') && picked[0]) {
      busy.hero++; render();
      try {
        const img = await CCStore.resizeImage(picked[0], 1400, 0.85);
        const id = 'hero-' + newId(), old = data.meta.hero; ui.heroImages[id] = img;
        await store.putFull(id, img); await store.setMeta({ hero: id }); flash('Top picture updated.');
        if (old) { delete ui.heroImages[old]; run(store.dropFull(old)); } // the old picture's file goes once this change is saved
      } catch (err) { console.error(err); flash('Could not upload this picture.'); }
      busy.hero--; render();
    }
    if (el.matches('[data-album-photos]')) {
      const files = picked.slice(0, 20);
      busy.album++; render();
      try { const list = []; for (const f of files) list.push(await makePhoto(f)); await savePhotos(list, { date: today, ...(data.albums.some(a => a.id === ui.album) ? { albumId: ui.album } : {}) }, { keepPartial: true }); ui.pages.album = 1; flash(`${list.length} photo${list.length === 1 ? '' : 's'} added.`); }
      catch (err) { console.error(err); flash('Could not upload. Try a smaller photo.'); }
      busy.album--; render();
    }
  }
  root.addEventListener('submit', e => {
    const f = e.target; e.preventDefault();
    if (f.matches('[data-album-form]')) {
      const title = String(f.elements.albumName.value || '').trim();
      if (!title) { f.elements.albumName.setCustomValidity('Add an album name.'); f.elements.albumName.reportValidity(); return; }
      const existing = data.albums.find(a => a.title.toLocaleLowerCase() === title.toLocaleLowerCase() && a.id !== ui.albumForm);
      if (existing) { f.elements.albumName.setCustomValidity('That album name already exists.'); f.elements.albumName.reportValidity(); return; }
      if (ui.albumForm === 'new') {
        const album = { id: newId(), title, by: meName(), createdAt: Date.now() };
        run(store.set('albums', album).then(() => { ui.album = album.id; ui.pages.album = 1; render(); flash('Album created.'); }));
      } else if (data.albums.some(a => a.id === ui.albumForm)) {
        run(store.update('albums', ui.albumForm, { title })); flash('Album renamed.');
      }
      ui.albumForm = ''; ui.albumDraft = ''; render(); return;
    }
    if (f.matches('[data-planner-form]')) submitPlanner(f);
    else if (f.matches('[data-diary-form]')) submitDiary(f);
    else if (f.matches('[data-question-form]')) submitAnswer(f);
    else if (f.matches('[data-diary-search]')) { diaryFilter.q = f.elements.q.value; ui.pages.diary = 1; render(); }
    else if (f.matches('[data-caption-form]')) { const c = f.elements.caption.value.trim().slice(0, 40); run(store.setMeta({ heroCaption: c || null })); data.meta = { ...data.meta, heroCaption: c || null }; ui.editCaption = false; render(); }
    else if (f.matches('[data-comment-form]')) {
      const id = f.dataset.commentForm, text = String(f.elements.comment.value || '').trim(); if (!text) return;
      commentDrafts[id] = ''; dropDraft('reply', id); run(store.addComment(id, { id: newId(), author: meName(), text, at: Date.now() })); render();
    }
    else if (f.matches('[data-login-form]')) {
      const err = $('[data-login-error]'); err.textContent = '';
      const btn = f.querySelector('button[type=submit]'); btn.disabled = true;
      store.signIn(f.elements.token.value, PEOPLE[f.elements.who.value]).then(() => location.reload())
        .catch(x => { btn.disabled = false; err.textContent = navigator.onLine === false ? 'No internet connection.' : (x.message || String(x)); });
    }
  });

  document.addEventListener('click', e => { const u = $('[data-user]'); if (u && !u.contains(e.target)) { u.classList.remove('cc-open'); $('[data-user-toggle]')?.setAttribute('aria-expanded', 'false'); } });
  root.addEventListener('click', e => {
    const el = e.target.closest('button'); if (!el || el.disabled) return;
    const ds = el.dataset;
    if (el.hasAttribute('data-album-new')) { ui.albumForm = 'new'; ui.albumDraft = ''; render(); $('[data-album-form] input[name="albumName"]')?.focus(); return; }
    if (ds.albumOpen) { ui.album = ds.albumOpen; ui.albumForm = ''; ui.pages.album = 1; render(); return; }
    if (ds.albumRename) { const album = data.albums.find(a => a.id === ds.albumRename); if (album) { ui.albumForm = album.id; ui.albumDraft = album.title; render(); $('[data-album-form] input[name="albumName"]')?.focus(); } return; }
    if (el.hasAttribute('data-album-cancel')) { ui.albumForm = ''; ui.albumDraft = ''; render(); return; }
    if (ds.albumDelete) {
      const album = data.albums.find(a => a.id === ds.albumDelete); if (!album) return;
      ui.confirm = null; ui.album = 'unsorted'; ui.albumForm = ''; ui.pages.album = 1;
      // one change, however big the album: a photo whose album is gone already counts as Unsorted everywhere
      run(store.remove('albums', album.id).then(() => flash('Album deleted. Photos are in Unsorted.')));
      render(); return;
    }
    if (el.hasAttribute('data-toggle-diary')) { ui.newEntryOpen = !ui.newEntryOpen; if (!ui.newEntryOpen) dropDraft('diary'); render(); if (ui.newEntryOpen) $('[data-diary-form] textarea[name="text"]')?.focus(); return; }
    if (ds.pageKey && ds.pageNumber) {
      ui.pages[ds.pageKey] = +ds.pageNumber;
      render();
      $(`[data-page-list="${ds.pageKey}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      return;
    }
    if (ds.go) { go(ds.go); if (ds.go === 'home') window.scrollTo({ top: 0 }); return; }
    if (ds.nav) { history[ds.nav](); return; }
    if (ds.min) { ui.collapsed.has(ds.min) ? ui.collapsed.delete(ds.min) : ui.collapsed.add(ds.min); ls.set('collapsed', [...ui.collapsed]); render(); return; }
    if (ds.openInbox) { openInbox(ds.openInbox); return; }
    if (el.hasAttribute('data-close-inbox')) { closeInbox(); return; }
    if (ds.inboxFilter) { ui.inboxFilter = ds.inboxFilter; keepFocus(renderInbox); return; }
    if (ds.inboxGo) { goToMessage(ds.inboxGo); return; }
    if (ds.questionOpen) { openQuestions(true, ds.questionOpen); return; }
    if (el.hasAttribute('data-ach-open')) { openAchievements(true); return; }
    if (el.hasAttribute('data-ach-close')) { openAchievements(false); return; }
    if (ds.achGo) { const a = achievements().find(x => x.id === ds.achGo), t = a && achTarget(a); openAchievements(false); if (t) goToTarget(t); return; }
    if (el.hasAttribute('data-question-close')) { openQuestions(false); return; }
    if (ds.answerEdit) { const mine = answerOf(ds.answerEdit, ui.me); if (mine) { ui.editingAnswer = ds.answerEdit; questionDrafts[ds.answerEdit] = mine.text; render(); $(`[data-question-form="${ds.answerEdit}"] textarea`)?.focus(); } return; }
    if (ds.answerCancel) { delete questionDrafts[ds.answerCancel]; dropDraft('answer', ds.answerCancel); ui.editingAnswer = null; render(); return; }
    if (el.hasAttribute('data-enable-badge')) { Promise.resolve(Notification.requestPermission()).catch(() => {}).finally(() => { iconBadge = -1; render(); }); return; }
    if (ds.me) { ui.me = ds.me; ls.set('me', ds.me); loadDrafts(); render(); return; }
    if (ds.modeToggle) { const m = currentMode(); m[ds.modeToggle] = !m[ds.modeToggle]; data.meta = { ...data.meta, mode: m }; run(store.setMeta({ mode: m })); render(); return; }
    if (el.hasAttribute('data-user-toggle')) { const u = $('[data-user]'); const open = !u.classList.contains('cc-open'); u.classList.toggle('cc-open', open); el.setAttribute('aria-expanded', String(open)); return; }
    if (ds.pickColor) { ui.colorKind = ui.colorKind === ds.pickColor ? null : ds.pickColor; render(); return; }
    if (ds.setColor && ui.colorKind) { const kc = { ...(data.meta.kindColors || {}), [ui.colorKind]: ds.setColor }; data.meta = { ...data.meta, kindColors: kc }; run(store.metaKey('kindColors', ui.colorKind, ds.setColor)); render(); return; }
    if (el.hasAttribute('data-avatar-reset')) { run(store.metaKey('avatars', ui.me, null)); return; }
    if (ds.editDay) { const it = data.dates.find(x => x.id === ds.editDay); if (it) { planner.editingDay = it.id; planner.drafts.dayedit = { title: it.title, kind: it.kind, date: it.date, repeat: !!it.repeat }; render(); } return; }
    if (el.hasAttribute('data-dayedit-cancel')) { planner.editingDay = null; render(); return; }
    if (ds.tag != null && el.classList.contains('cc-tag')) { diaryFilter.tag = diaryFilter.tag.toLowerCase() === ds.tag.toLowerCase() ? '' : ds.tag; ui.pages.diary = 1; if (ui.page !== 'diary') go('diary'); else render(); return; }
    if (el.hasAttribute('data-clear-filter')) { diaryFilter.q = ''; diaryFilter.tag = ''; ui.pages.diary = 1; render(); return; }
    if (ds.entryEdit) { const en = data.diary.find(x => x.id === ds.entryEdit); if (en) { ui.editingEntry = en.id; planner.drafts.entryedit = { text: en.text || '', tags: (en.tags || []).join(', '), photoIds: entryPhotoIds(en), pending: [] }; render(); } return; }
    if (ds.entryPhotoRemove) { planner.drafts.entryedit.photoIds = planner.drafts.entryedit.photoIds.filter(id => id !== ds.entryPhotoRemove); render(); return; }
    if (ds.entryPendingRemove != null) { planner.drafts.entryedit.pending.splice(+ds.entryPendingRemove, 1); render(); return; }
    if (el.hasAttribute('data-entry-cancel')) { ui.editingEntry = null; planner.drafts.entryedit = { text: '', tags: '', photoIds: [], pending: [] }; render(); return; }
    if (ds.bgm) { const a = ds.bgm; a === 'toggle' ? CCBgm.toggle() : a === 'next' ? CCBgm.next(1) : a === 'prev' ? CCBgm.next(-1) : CCBgm.volume(a === 'vol-up' ? 0.1 : -0.1); return; }
    if (el.hasAttribute('data-logout')) { Promise.resolve(store.signOut()).catch(err => flash(err.message)); return; } // refused while changes are still saving
    if (el.hasAttribute('data-dismiss')) { ui.message = null; ui.undo = null; renderMessage(); return; }
    if (el.hasAttribute('data-undo') && ui.undo) { const u = ui.undo; ui.undo = null; Promise.resolve(u()).then(() => flash('Restored.')); return; }
    if (ds.confirm) { ui.confirm = ds.confirm; lightbox.id ? openPhoto(lightbox.id) : render(); return; }
    if (el.hasAttribute('data-confirm-cancel')) { ui.confirm = null; lightbox.id ? openPhoto(lightbox.id) : render(); return; }
    // calendar
    if (ds.view) { planner.view = ds.view; ls.set('calView', ds.view); planner.year = +planner.selected.slice(0, 4); planner.month = planner.selected.slice(0, 7); render(); return; }
    if (ds.shift) {
      const n = +ds.shift;
      if (planner.view === 'week') select(shiftDay(planner.selected, 7 * n));
      else if (planner.view === 'year') { planner.year += n; }
      else { planner.month = shiftMonth(planner.month, n); select(planner.month + '-01'); }
      render(); return;
    }
    if (el.hasAttribute('data-planner-today')) { select(today); render(); return; }
    if (ds.day) { select(ds.day); render(); return; }
    if (ds.openMonth) { planner.view = 'month'; ls.set('calView', 'month'); planner.month = ds.openMonth; select(ds.openMonth + '-01'); render(); return; }
    if (ds.addOn) { select(ds.addOn); planner.forms.event = true; render(); $('[data-planner-form="event"] input[name="title"]')?.focus(); return; }
    if (ds.hero === 'week') { planner.view = 'week'; ls.set('calView', 'week'); select(today); go('home'); return; }
    if (ds.editEvent) { const ev = data.events.find(x => x.id === ds.editEvent); if (ev) { planner.editing = ev.id; planner.drafts.edit = { title: ev.title, date: ev.date, endDate: ev.endDate && ev.endDate !== ev.date ? ev.endDate : '', note: ev.note || '' }; render(); } return; }
    if (el.hasAttribute('data-edit-cancel')) { planner.editing = null; render(); return; }
    if (ds.openDate) { select(ds.openDate); openSpecial(false); if (planner.view === 'year') planner.view = 'month'; go('home'); $('[data-home-calendar]')?.scrollIntoView({ block: 'start' }); return; }
    if (ds.openTodo) { planner.todoFilter = ds.openTodo; ui.pages.todo = 1; go('todo'); return; }
    if (ds.todoFilter) { planner.todoFilter = ds.todoFilter; ui.pages.todo = 1; render(); return; }
    if (ds.showForm) { planner.forms[ds.showForm] = !planner.forms[ds.showForm]; render(); return; }
    if (el.hasAttribute('data-edit-days')) { openSpecial(!planner.specialOpen); return; }
    if (el.hasAttribute('data-set-anniversary')) { planner.drafts.special = { title: '在一起', kind: 'anniversary', date: '', repeat: true }; openSpecial(true); $('[data-planner-form="special"] input[name=date]')?.focus(); return; }
    if (el.hasAttribute('data-tear')) { tear(); return; }
    if (el.hasAttribute('data-hero-reset')) { const old = data.meta.hero; run(store.setMeta({ hero: null }).then(() => old && store.dropFull(old))); return; }
    if (el.hasAttribute('data-caption-edit')) { ui.editCaption = true; ui.captionDraft = null; render(); $('[data-caption-form] input')?.focus(); return; }
    if (el.hasAttribute('data-caption-cancel')) { ui.editCaption = false; render(); return; }
    if (ds.dateFilter) { planner.filter = ds.dateFilter; ui.pages.special = 1; render(); return; }
    if (ds.remove) {
      const col = ds.remove, item = data[col]?.find(x => x.id === ds.id); if (!item) return;
      run(store.remove(col, item.id)); flash('Removed.', () => store.set(col, item)); return;
    }
    // import
    if (el.hasAttribute('data-export-ics')) { exportIcs(); return; }
    if (el.hasAttribute('data-import-open')) { calendarImport.open = !calendarImport.open; render(); return; }
    if (el.hasAttribute('data-import-close')) { calendarImport.open = false; render(); return; }
    if (el.hasAttribute('data-import-preview')) { previewImport(); return; }
    if (el.hasAttribute('data-import-confirm')) { confirmImport(); return; }
    // memory / diary / photos
    if (el.hasAttribute('data-shuffle')) { const n = data.diary.length; ui.memory += 1 + Math.floor(Math.random() * Math.max(1, n - 1)); keepFocus(renderMemory); return; }
    if (ds.openEntry) { closePhoto(); diaryFilter.q = ''; diaryFilter.tag = ''; ui.pages.diary = pageForItem(diarySorted(), ds.openEntry); ui.highlight = ds.openEntry; go('diary'); document.getElementById('entry-' + ds.openEntry)?.scrollIntoView({ block: 'center' }); setTimeout(() => { ui.highlight = null; scheduleRender(); }, 2500); return; }
    if (ds.pendingRemove) { diaryDraft.pending.splice(+ds.pendingRemove, 1); render(); return; }
    if (ds.entryDelete) {
      const entry = data.diary.find(x => x.id === ds.entryDelete); ui.confirm = null; if (!entry) return;
      run((async () => { for (const pid of entryPhotoIds(entry)) await store.remove('photos', pid); await store.remove('diary', entry.id); })()); flash('Entry deleted.'); return;
    }
    if (ds.commentRemove) { openCommentDelete(ds.entry, ds.commentRemove); return; }
    if (el.hasAttribute('data-comment-confirm-cancel')) { $('[data-comment-confirm-dialog]').close(); return; }
    if (el.hasAttribute('data-comment-confirm-delete')) {
      const pending = pendingCommentDelete;
      $('[data-comment-confirm-dialog]').close();
      if (!pending) return;
      const entry = data.diary.find(x => x.id === pending.entryId);
      if ((entry?.comments || []).some(c => c.id === pending.commentId && c.author === meName())) run(store.removeComment(pending.entryId, pending.commentId));
      return;
    }
    if (ds.photo) { ui.confirm = null; openPhoto(ds.photo); return; }
    if (el.hasAttribute('data-lightbox-close')) { closePhoto(); return; }
    if (ds.lightboxStep) { stepPhoto(Number(ds.lightboxStep)); return; }
    if (ds.photoZoom) { setPhotoZoom(lightbox.zoom + (ds.photoZoom === 'in' ? 1 : -1)); return; }
    if (ds.photoDelete) {
      const p = data.photos.find(x => x.id === ds.photoDelete); closePhoto(); if (!p) return;
      run((async () => { await store.remove('photos', p.id); if (p.entryId) { const en = data.diary.find(x => x.id === p.entryId); if (en) await store.update('diary', en.id, { photoIds: (en.photoIds || []).filter(x => x !== p.id) }, { quiet: true }); } })());
      flash('Photo deleted.'); return;
    }
  });
  $('[data-lightbox]').addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); stepPhoto(e.key === 'ArrowRight' ? 1 : -1); }
    if (e.key === '+' || e.key === '=') { e.preventDefault(); setPhotoZoom(lightbox.zoom + 1); }
    if (e.key === '-') { e.preventDefault(); setPhotoZoom(lightbox.zoom - 1); }
  });
  $('[data-lightbox]').addEventListener('pointerdown', e => {
    const stage = e.target.closest('[data-lightbox-stage]');
    if (!stage || e.target.closest('button')) return;
    lightbox.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, panX: lightbox.panX, panY: lightbox.panY };
    stage.setPointerCapture(e.pointerId);
  });
  $('[data-lightbox]').addEventListener('pointermove', e => {
    const p = lightbox.pointer;
    if (!p || p.id !== e.pointerId || lightbox.zoom === 1) return;
    lightbox.panX = p.panX + e.clientX - p.x;
    lightbox.panY = p.panY + e.clientY - p.y;
    applyPhotoZoom();
  });
  $('[data-lightbox]').addEventListener('pointerup', e => {
    const p = lightbox.pointer;
    if (!p || p.id !== e.pointerId) return;
    lightbox.pointer = null;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (lightbox.zoom === 1 && Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.2) stepPhoto(dx < 0 ? 1 : -1);
  });
  $('[data-lightbox]').addEventListener('pointercancel', () => { lightbox.pointer = null; });
  $('[data-lightbox]').addEventListener('dblclick', e => { if (e.target.closest('[data-lightbox-stage]') && !e.target.closest('button')) setPhotoZoom(lightbox.zoom === 1 ? 2 : 1); });
  $('[data-lightbox]').addEventListener('click', e => { if (e.target === e.currentTarget) closePhoto(); });
  $('[data-lightbox]').addEventListener('close', () => { lightbox.id = null; lightbox.pointer = null; });
  $('[data-inbox]').addEventListener('close', () => { ui.inboxOpen = false; ui.inboxFresh = null; });
  $('[data-inbox]').addEventListener('click', e => { if (e.target === e.currentTarget) closeInbox(); });
  $('[data-comment-confirm-dialog]').addEventListener('close', () => { pendingCommentDelete = null; });
  $('[data-comment-confirm-dialog]').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.close(); });
  $('[data-question-dialog]').addEventListener('close', () => { if (ui.questionOpen) { ui.questionOpen = false; render(); } });
  $('[data-question-dialog]').addEventListener('click', e => { if (e.target === e.currentTarget) openQuestions(false); });
  $('[data-ach-dialog]').addEventListener('close', () => { if (ui.achOpen) { ui.achOpen = false; ui.achFresh = null; render(); } $('[data-ach-open]')?.focus({ preventScroll: true }); });
  $('[data-ach-dialog]').addEventListener('click', e => { if (e.target === e.currentTarget) openAchievements(false); });
  let shownDay = currentDay(); // after midnight: new question, fresh "today" for the calendar and countdowns
  const checkDay = () => { const d = currentDay(); if (d === shownDay) return false; rollDay(shownDay, d); shownDay = today = d; achCache = null; scheduleRender(); return true; };
  function rollDay(old, day) { // dates that still say the old "today" (nobody changed them) move on to the new day
    if (diaryDraft.date === old) diaryDraft.date = day;
    if (planner.drafts.event.date === old) planner.drafts.event.date = day;
    if (planner.selected === old && !planner.editing) {
      planner.selected = day;
      if (planner.month === old.slice(0, 7)) planner.month = day.slice(0, 7);
      if (planner.year === +old.slice(0, 4)) planner.year = +day.slice(0, 4);
    }
    // open forms too, in case this render leaves them alone
    $$('[data-diary-form] input[name="date"], [data-planner-form="event"] input[name="date"]').forEach(el => { if (el.value === old) el.value = day; });
  }
  setInterval(() => { if (!document.hidden && !checkDay()) renderBadges(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDay(); });
  $('[data-special-dialog]').addEventListener('close', () => { if (planner.specialOpen) { planner.specialOpen = false; planner.editingDay = null; render(); } });
  $('[data-special-dialog]').addEventListener('click', e => { if (e.target === e.currentTarget) openSpecial(false); });

  // ---------- calendar import ----------
  function importKeys(from, to) {
    const keys = data.events.map(e => e.importKey).filter(Boolean);
    for (const day of data.dates) {
      const years = day.repeat ? Array.from({ length: +to.slice(0, 4) - +from.slice(0, 4) + 1 }, (_, i) => +from.slice(0, 4) + i) : [+day.date.slice(0, 4)];
      for (const y of years) for (const uid of day.importUIDs || []) keys.push(JSON.stringify([uid, `${y}-${day.date.slice(5)}`]));
    }
    return keys;
  }
  async function previewImport() {
    const c = calendarImport; if (!c.file) return;
    if (!validDay(c.from) || !validDay(c.to) || c.from > c.to) { c.error = 'Choose a valid date range.'; render(); return; }
    c.busy = true; c.error = ''; c.preview = null; render();
    try {
      if (c.file.size > 2000000) throw new Error('Choose an .ics file smaller than 2 MB.');
      const text = await c.file.text();
      c.preview = CoupleCalendarImport.parse(text, { from: c.from, to: c.to, existingKeys: importKeys(c.from, c.to) });
    } catch (err) { c.error = err.message || 'This calendar could not be read.'; }
    c.busy = false; render();
  }
  function confirmImport() {
    const r = calendarImport.preview; if (!r?.events.length) return;
    const keys = new Set(data.events.map(e => e.importKey));
    const entries = r.events.filter(e => !keys.has(e.importKey)).map(e => ({ ...e, id: newId(), by: meName(), createdAt: Date.now() }));
    run(store.batchSet('events', entries));
    if (entries.length) select(entries[0].date < calendarImport.from ? calendarImport.from : entries[0].date);
    calendarImport.preview = null; calendarImport.open = false;
    flash(`${entries.length} events imported.`, () => store.removeMany('events', entries.map(x => x.id))); // Undo is one change
    render();
  }

  // ---------- calendar export (.ics for Apple / Google Calendar) ----------
  function exportIcs() {
    const category = KINDS.some(([kind]) => kind === planner.exportKind) ? planner.exportKind : 'plan';
    const file = CoupleCalendarExport.build(category, data, currentDay());
    if (!file) { flash(`No ${kindLabel(category).toLowerCase()} items to export yet.`); return; }
    const url = URL.createObjectURL(new Blob([file.ics], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = file.filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    flash(`Exported ${file.count} ${file.label.toLowerCase()} item${file.count === 1 ? '' : 's'}. Open the file to add them to Apple or Google Calendar.`);
  }

  // ---------- seed (first run only) ----------
  async function seedIfNeeded() {
    const seed = window.CC_SEED; if (!seed) return;
    try {
      if (await store.isSeeded()) return;
      const events = CoupleCalendarImport.parse(seed.ics, { from: seed.from, to: seed.to }).events.map((e, i) => ({ ...e, id: 'seed-event-' + i }));
      await store.batchSet('events', events);
      await store.batchSet('dates', seed.dates || []);
      await store.markSeeded();
    } catch (err) { console.error('seed failed', err); }
  }

  // ---------- bgm screen ----------
  // ---------- draggable iPod with a charging dock ----------
  (() => {
    const ipod = $('[data-ipod]'), dock = $('[data-dock]'), frame = $('[data-dock-frame]'); if (!ipod || !dock) return;
    const saved = ls.get('ipod', { docked: true, x: 0, y: 0 });
    const JACK = { x: 0.075, y: 0.02 };              // jack position on the iPod image (fraction of size)
    const plugTip = () => { const r = dock.querySelector('.cc-plug-tip').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.bottom }; };
    const jackOf = (x, y) => ({ x: x + ipod.offsetWidth * JACK.x, y: y + ipod.offsetHeight * JACK.y });
    const clamp = (x, y) => ({ x: Math.max(4, Math.min(innerWidth - ipod.offsetWidth - 4, x)), y: Math.max(40, Math.min(innerHeight - ipod.offsetHeight - 4, y)) });
    function place() {
      dock.dataset.docked = String(saved.docked);
      ipod.classList.toggle('cc-floating', !saved.docked);
      // a floating iPod lives outside the (possibly scaled) dock so position:fixed works
      if (saved.docked && ipod.parentElement !== frame) frame.insertBefore(ipod, $('[data-dock-hint]'));
      if (!saved.docked && ipod.parentElement !== root) root.appendChild(ipod);
      if (saved.docked) { ipod.style.left = ''; ipod.style.top = ''; }
      else { const c = clamp(saved.x, saved.y); ipod.style.left = c.x + 'px'; ipod.style.top = c.y + 'px'; }
      $('[data-dock-hint]').textContent = saved.docked ? 'drag me · 拖出来玩' : 'drop it back to charge · 放回来充电';
    }
    let drag = null;
    ipod.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const r = ipod.getBoundingClientRect();
      drag = { sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top, moved: false, id: e.pointerId };
    });
    ipod.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (!drag.moved) {
        if (Math.hypot(dx, dy) < 6) return;
        drag.moved = true; ipod.setPointerCapture(e.pointerId);
        saved.docked = false; saved.x = drag.ox; saved.y = drag.oy; place(); ipod.classList.add('cc-dragging');
      }
      const c = clamp(drag.ox + dx, drag.oy + dy); saved.x = c.x; saved.y = c.y;
      ipod.style.left = c.x + 'px'; ipod.style.top = c.y + 'px';
      const j = jackOf(c.x, c.y), t = plugTip();
      dock.classList.toggle('cc-dock-near', Math.hypot(j.x - t.x, j.y - t.y) < 70);
      e.preventDefault();
    });
    function end(e) {
      if (!drag || e.pointerId !== drag.id) return;
      const was = drag; drag = null;
      if (!was.moved) return;
      ui.justDragged = true; setTimeout(() => { ui.justDragged = false; }, 0);
      ipod.classList.remove('cc-dragging');
      if (dock.classList.contains('cc-dock-near')) {
        dock.classList.remove('cc-dock-near');
        // snap: slide the jack onto the plug, then drop back into the dock
        const t = plugTip(), tx = t.x - ipod.offsetWidth * JACK.x, ty = t.y - 3 - ipod.offsetHeight * JACK.y;
        ipod.classList.add('cc-snapping'); ipod.style.left = tx + 'px'; ipod.style.top = ty + 'px';
        setTimeout(() => { ipod.classList.remove('cc-snapping'); saved.docked = true; ls.set('ipod', saved); place(); dock.classList.add('cc-dock-click'); setTimeout(() => dock.classList.remove('cc-dock-click'), 400); }, 180);
      } else ls.set('ipod', saved);
    }
    ipod.addEventListener('pointerup', end); ipod.addEventListener('pointercancel', end);
    ipod.addEventListener('click', e => { if (ui.justDragged) { e.stopPropagation(); e.preventDefault(); ui.justDragged = false; } }, true);
    const fit = () => { const w = dock.clientWidth; dock.style.setProperty('--dock-scale', Math.min(1, w / 180).toFixed(3)); };
    addEventListener('resize', () => { fit(); if (!saved.docked) place(); });
    fit(); new ResizeObserver(fit).observe(dock);
    place();
  })();

  let lastVol = null, volTimer = 0;
  CCBgm.onChange(info => {
    const bubble = $('[data-bgm-screen]'); if (!bubble) return;
    const volChanged = lastVol !== null && lastVol !== info.volume; lastVol = info.volume;
    if (volChanged) { clearTimeout(volTimer); volTimer = setTimeout(() => { bubble.dataset.vol = 'false'; }, 1400); }
    const bars = '▮'.repeat(Math.round(info.volume * 10)) + '▯'.repeat(10 - Math.round(info.volume * 10));
    bubble.dataset.vol = String(volChanged);
    bubble.dataset.playing = info.playing;
    bubble.innerHTML = `<span class="cc-bubble-song">${info.playing ? '♫' : '❚❚'} ${esc(info.name)}</span><span class="cc-bubble-vol">VOL ${bars}</span>`;
  });

  // ---------- boot ----------
  function showApp(show) { $('[data-login]').hidden = show; $('[data-app]').hidden = !show; }
  const onChange = (col, items, only) => { data[col] = items || (col === 'meta' ? {} : []); if (col === 'meta') { ui.dataReady = true; reopenDraftEdits(); } if (col === 'photos') keepLightboxOnData(); achCache = null; if (only !== 'thumbs' || thumbsWaiting()) scheduleRender(); };
  // arriving thumbnails are drawn only where one can show: the album page, an open inbox, or a ▧ still waiting on screen
  const thumbsWaiting = () => ui.page === 'album' || $('[data-inbox]').open || !!root.querySelector('[data-panel]:not([hidden]) .cc-img-wait');
  let lastError = 0;
  const onStatus = (s, err) => {
    if (s === 'ratelimited') { ui.syncUntil = err.until; if (ui.sync !== s) flash(err.message); } // the store re-sends it each minute for the countdown
    else if (s === 'error' && err && Date.now() - lastError > 30000) { lastError = Date.now(); flash('Sync problem: ' + (err.message || err) + ' Will retry.'); }
    if (ui.sync !== s || s === 'ratelimited') { ui.sync = s; scheduleRender(); }
  };
  history.replaceState(null, '', '#' + ui.page);
  loadDrafts(); render();
  if (store.mode === 'local') {
    showApp(true);
    seedIfNeeded().then(() => store.start(onChange)).then(syncInboxState);
  } else {
    showApp(false);
    store.onAuth(async (user, err) => {
      ui.user = user;
      if (!user) { if (err) $('[data-login-error]').textContent = err.message; ui.sync = 'signedout'; showApp(false); render(); return; }
      ui.me = nameToKey(user.name || '斯婕'); loadDrafts();
      showApp(true); render();
      try { await store.start(onChange, onStatus); await seedIfNeeded(); syncInboxState(); }
      catch (e) {
        console.error(e);
        if (e.code === 'auth') { $('[data-login-error]').textContent = e.message; localStorage.removeItem('olc:github'); showApp(false); }
        ui.sync = navigator.onLine === false ? 'offline' : 'error'; render();
      }
    });
  }
})();
