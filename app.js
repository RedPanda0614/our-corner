(() => {
  'use strict';
  const root = document.getElementById('couple-corner');
  const $ = sel => root.querySelector(sel);
  const $$ = sel => [...root.querySelectorAll(sel)];
  const cfg = window.CC_CONFIG || {};
  const store = CCStore.create(cfg);
  const PAGES = ['home', 'diary', 'album', 'todo', 'wishlist'];
  const PEOPLE = { sijie: '斯婕', zhenzhen: '真真' };
  const nameToKey = name => Object.keys(PEOPLE).find(k => PEOPLE[k] === name) || 'sijie';

  // ---------- small helpers ----------
  const ls = {
    get(k, d) { try { const v = localStorage.getItem('olc:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('olc:' + k, JSON.stringify(v)); } catch {} }
  };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const now = new Date();
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const utcDay = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const dayISO = d => d.toISOString().slice(0, 10);
  const validDay = iso => /^\d{4}-\d{2}-\d{2}$/.test(iso) && Number.isFinite(+utcDay(iso)) && dayISO(utcDay(iso)) === iso;
  const shiftDay = (iso, n) => { const d = utcDay(iso); d.setUTCDate(d.getUTCDate() + n); return dayISO(d); };
  const shiftMonth = (ym, n) => { const d = utcDay(ym + '-01'); d.setUTCMonth(d.getUTCMonth() + n); return dayISO(d).slice(0, 7); };
  const niceDate = (iso, o = { month: 'short', day: 'numeric', year: 'numeric' }) => new Intl.DateTimeFormat('en-US', { ...o, timeZone: 'UTC' }).format(utcDay(iso));
  const weekStart = iso => shiftDay(iso, -((utcDay(iso).getUTCDay() + 6) % 7));
  const daysBetween = (a, b) => Math.round((utcDay(b) - utcDay(a)) / 86400000);
  const countdown = d => { const n = daysBetween(today, d); return n === 0 ? 'Today!' : n > 0 ? `In ${n} day${n === 1 ? '' : 's'}` : `${-n} day${n === -1 ? '' : 's'} ago`; };
  const repeatDate = item => { if (!item.repeat) return item.date; const start = Math.max(+today.slice(0, 4), +item.date.slice(0, 4)); for (let y = start; y < start + 9; y++) { const d = `${y}-${item.date.slice(5)}`; if (validDay(d) && d >= today) return d; } return item.date; };
  const kindLabel = k => ({ plan: 'PLAN', trip: 'TRIP', task: 'LITTLE THING', birthday: 'BIRTHDAY', holiday: 'HOLIDAY', anniversary: 'ANNIVERSARY' })[k] || 'PLAN';
  const statusLabel = s => ({ dreaming: 'Dreaming', planning: 'Planning', booked: 'Booked', visited: 'Visited' })[s];
  const newId = CCStore.uid;

  // ---------- state ----------
  const data = { events: [], trips: [], tasks: [], dates: [], wishes: [], diary: [], photos: [], meta: {} };
  // Skins: shift the hue (dh) and scale the saturation (s) of each colour family in style.css / app.css.
  // c = contrast (1 normal), dark = invert lightness.
  const T = (id, zh, group, g, a, l, p, c = 1, dark = false) => ({ id, zh, group, v: { g, a, l, p }, lo: dark ? 50 * (1 + c) : 50 * (1 - c), lk: dark ? -c : c });
  const THEMES = [
    T('matcha', '抹茶橘子', 'light', [0, 1.7], [0, 1.4], [0, 1.3], [0, 1.2]),
    T('classic', '原版淡色', 'light', [0, 1], [0, 1], [0, 1], [0, 1], 0.9),
    T('nightmatcha', '抹茶橘子 · 夜', 'dark', [0, 1.5], [0, 1.5], [0, 1.2], [0, 1], 0.95, true),
    T('classicdark', '原版淡色 · 夜', 'dark', [0, 0.9], [0, 0.9], [0, 0.9], [0, 0.8], 0.85, true)
  ];
  const THEME_GROUPS = [['light', 'LIGHT'], ['dark', 'DARK']];
  const themeVars = t => Object.entries(t.v).map(([f, [dh, sat]]) => `--${f}-dh:${dh}deg;--${f}-s:${sat}`).join(';') + `;--lo:${t.lo}%;--lk:${t.lk}`;
  const KINDS = [['plan', 'Plan'], ['trip', 'Trip'], ['task', 'Little thing'], ['birthday', 'Birthday'], ['holiday', 'Holiday'], ['anniversary', 'Anniversary']];
  const DEFAULT_KIND_COLORS = { plan: '#6fa35a', trip: '#f08a4b', task: '#9a7ad8', birthday: '#e0506a', holiday: '#e8b33c', anniversary: '#d85fb0' };
  const SWATCHES = ['#e0506a', '#f06a8f', '#d85fb0', '#9a7ad8', '#6c6fd8', '#4a9fd8', '#3fae9c', '#6fa35a', '#a8c43c', '#e8b33c', '#f08a4b', '#b0714a', '#8a8f98', '#3d4a5c'];
  const kindColor = k => (data.meta.kindColors || {})[k] || DEFAULT_KIND_COLORS[k];
  function applyTheme() {
    const t = THEMES.find(x => x.id === (ui.previewTheme || data.meta.theme)) || THEMES[0];
    for (const [f, [dh, sat]] of Object.entries(t.v)) { root.style.setProperty(`--${f}-dh`, dh + 'deg'); root.style.setProperty(`--${f}-s`, sat); }
    root.style.setProperty('--lo', t.lo + '%'); root.style.setProperty('--lk', t.lk);
    root.dataset.dark = String(t.lk < 0); document.body.style.background = getComputedStyle(root).backgroundColor;
    const hero = data.meta.hero && ui.heroImages[data.meta.hero];
    if (hero) root.style.setProperty('--cc-hero-art', `url("${hero}")`); else root.style.removeProperty('--cc-hero-art');
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
    memory: 0, highlight: null, busy: false, tearView: 0, heroImages: {}, editCaption: false
  };
  const initialSelected = today;
  const planner = {
    view: ls.get('calView', 'month'), month: today.slice(0, 7), year: +today.slice(0, 4), selected: initialSelected,
    filter: 'all', todoFilter: 'all', forms: { event: false, todo: false, wish: false }, specialOpen: false, editing: null,
    drafts: {
      event: { title: '', date: today, endDate: '', note: '' },
      edit: { title: '', date: '', endDate: '', note: '' },
      todo: { title: '', kind: 'activity', status: 'dreaming', date: '', start: '', end: '', note: '' },
      wish: { title: '', who: 'both', note: '' },
      special: { title: '', kind: 'anniversary', date: '', repeat: true },
      dayedit: { title: '', kind: 'anniversary', date: '', repeat: true },
      entryedit: { text: '', date: '', tags: '' }
    }
  };
  const diaryDraft = { text: '', date: today, tags: '', pending: [] };
  const diaryFilter = { q: '', tag: '' };
  const commentDrafts = {};
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
    return `<section class="cc-window ${extraClass} ${closed ? 'cc-collapsed' : ''}" data-win="${esc(key)}"><div class="cc-bar"><span>${esc(title)}</span>${minButton(key)}</div><div class="cc-body">${whisper ? `<p lang="zh-CN" class="cc-page-whisper">${esc(whisper)}</p>` : ''}${body}</div></section>`;
  }
  function decorateStaticWindows() {
    $$('section[data-win]').forEach(win => {
      if (win.closest('dialog')) return;
      const key = win.dataset.win, bar = win.querySelector(':scope > .cc-bar');
      bar.querySelector(':scope > .cc-min')?.remove();
      bar.insertAdjacentHTML('beforeend', minButton(key));
      win.classList.toggle('cc-collapsed', ui.collapsed.has(key));
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

  // ---------- calendar ----------
  function dayEvents(iso) {
    return [
      ...data.events.filter(e => e.date <= iso && (e.endDate || e.date) >= iso).map(e => ({ ...e, kind: 'plan', collection: 'events' })),
      ...data.trips.filter(e => e.start && iso >= e.start && iso <= (e.end || e.start)).map(e => ({ ...e, kind: 'trip', collection: 'trips' })),
      ...data.tasks.filter(e => e.date === iso).map(e => ({ ...e, kind: 'task', collection: 'tasks' })),
      ...data.dates.filter(e => e.repeat ? iso.slice(5) === e.date.slice(5) && iso >= e.date : iso === e.date).map(e => ({ ...e, collection: 'dates' }))
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
    const form = planner.forms.event ? formShell('event', 'Add a shared plan', formField('event', 'title', 'What shall we do?', 'text', true) + formField('event', 'date', 'Date', 'date', true) + formField('event', 'endDate', 'End date (optional)', 'date') + notesField('event'), '+ Add to calendar', '<button type="button" class="cc-button" data-show-form="event">Cancel</button>') : '';
    $('[data-home-calendar]').innerHTML = panelShell('calendar', '▦ CALENDAR', '共同日历',
      `<div class="cc-planner-toolbar"><h3>${esc(calendarTitle())}</h3><div class="cc-plan-actions"><button class="cc-button" type="button" data-shift="-1" aria-label="Previous">‹</button><button class="cc-button" type="button" data-planner-today>Today</button><button class="cc-button" type="button" data-shift="1" aria-label="Next">›</button></div></div>
      <div class="cc-filter-row cc-view-switch" role="group" aria-label="Calendar view">${views.map(([v, l]) => `<button type="button" class="cc-button" data-view="${v}" aria-pressed="${planner.view === v}">${l}</button>`).join('')}</div>
      ${body}
      <div class="cc-legend" role="group" aria-label="Category colours"><span class="cc-small">Colours (tap to change):</span>${KINDS.map(([k, l]) => `<button type="button" class="cc-legend-btn" data-pick-color="${k}" aria-expanded="${ui.colorKind === k}" title="Change colour"><i class="cc-dot k-${k}"></i>${l}</button>`).join('')}</div>${ui.colorKind ? `<div class="cc-swatches" role="group" aria-label="Colour for ${esc(ui.colorKind)}"><span class="cc-small">${esc(KINDS.find(x => x[0] === ui.colorKind)[1])} colour</span>${SWATCHES.map(c => `<button type="button" class="cc-swatch" style="background:${c}" data-set-color="${c}" aria-pressed="${kindColor(ui.colorKind) === c}" aria-label="${c}"></button>`).join('')}<button type="button" class="cc-button" data-pick-color="${ui.colorKind}">Done</button></div>` : ''}
      ${agendaHtml()}
      <div class="cc-calendar-actions"><button type="button" class="cc-button" data-show-form="event" aria-expanded="${planner.forms.event}">${planner.forms.event ? 'Close form' : '+ Add a plan'}</button><button type="button" class="cc-button" data-import-open aria-expanded="${calendarImport.open}">Import Apple Calendar</button></div>${form}${renderImport()}`);
  }

  // ---------- special days + memory ----------
  function renderSpecialDays() {
    const names = [['all', 'All'], ['birthday', 'Birthdays'], ['holiday', 'Holidays'], ['anniversary', 'Anniversaries']];
    const items = data.dates.filter(d => planner.filter === 'all' || d.kind === planner.filter).map(d => ({ ...d, next: repeatDate(d) })).sort((a, b) => Number(a.next < today) - Number(b.next < today) || a.next.localeCompare(b.next));
    const cards = items.map(it => {
      if (planner.editingDay === it.id) {
        const f = formField('dayedit', 'title', 'Name of the day', 'text', true) + selectField('dayedit', 'kind', 'Category', names.slice(1)) + formField('dayedit', 'date', 'Date', 'date', true) + `<label class="cc-inline-check" style="align-self:end;padding-bottom:8px"><input name="repeat" type="checkbox" ${planner.drafts.dayedit.repeat ? 'checked' : ''}><span>Repeat every year</span></label>`;
        return `<article class="cc-plan-card k-${it.kind} cc-kind-card">${formShell('dayedit', 'Edit special day', f, 'Save', '<button type="button" class="cc-button" data-dayedit-cancel>Cancel</button>')}</article>`;
      }
      return `<article class="cc-plan-card k-${it.kind} cc-kind-card"><div class="cc-plan-tag"><i class="cc-dot k-${it.kind}"></i>${kindLabel(it.kind)}</div><h3>${esc(it.title)}</h3><div class="cc-card-meta"><span>${niceDate(it.next)} ${it.repeat ? '↻' : ''}</span><span class="cc-countdown">${countdown(it.next)}</span></div><p class="cc-small">${it.repeat ? 'Repeats yearly' : 'One-time date'}</p><div class="cc-plan-actions"><button class="cc-button" type="button" data-edit-day="${esc(it.id)}">Edit</button><button class="cc-button" type="button" data-open-date="${it.next}">See in calendar</button>${removeButton('dates', it.id)}</div></article>`;
    }).join('') || '<p class="cc-empty-plan">No special days yet.</p>';
    const fields = formField('special', 'title', 'Name of the day', 'text', true) + selectField('special', 'kind', 'Category', names.slice(1)) + formField('special', 'date', 'Date', 'date', true) + `<label class="cc-inline-check" style="align-self:end;padding-bottom:8px"><input name="repeat" type="checkbox" ${planner.drafts.special.repeat ? 'checked' : ''}><span>Repeat every year</span></label>`;
    const upcoming = data.dates.map(it => ({ ...it, next: repeatDate(it) })).filter(it => it.next >= today).sort((a, b) => a.next.localeCompare(b.next)).slice(0, 4);
    $('[data-upcoming-days]').innerHTML = upcoming.map(it => `<button type="button" class="cc-upcoming-entry" data-open-date="${it.next}"><span class="cc-plan-tag"><i class="cc-dot k-${it.kind}"></i>${kindLabel(it.kind)}</span><strong>${esc(it.title)}</strong><span class="cc-upcoming-bottom"><span>${niceDate(it.next, { month: 'short', day: 'numeric' })}</span><span class="cc-countdown">${countdown(it.next)}</span></span></button>`).join('') || '<p class="cc-empty-plan">No upcoming dates.</p>';
    const editor = $('[data-special-dialog]');
    if (!planner.specialOpen) { if (editor.open) editor.close(); return; }
    editor.innerHTML = planner.specialOpen ? panelShell('special-editor', '♡ SPECIAL DAYS', '生日、节日与纪念日', `<div class="cc-add-row"><div class="cc-filter-row" style="margin:0">${names.map(([v, l]) => `<button type="button" class="cc-button" data-date-filter="${v}" aria-pressed="${planner.filter === v}">${l}</button>`).join('')}</div></div><div class="cc-todo-grid">${cards}</div>${formShell('special', 'Save a special day', fields, '+ Save this day')}`) : '';
  }
  function diarySorted() { return [...data.diary].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0)); }
  function renderMemory() {
    const pool = data.diary.filter(e => (e.text || '').trim() || (e.photoIds || []).length);
    const body = $('[data-memory]');
    if (!pool.length) { body.innerHTML = '<div class="cc-memory-label"><span>FROM THE DIARY</span></div><p class="cc-memory">No diary entries yet.</p><button class="cc-button" type="button" data-go="diary">Write the first one</button>'; return; }
    const e = pool[((ui.memory % pool.length) + pool.length) % pool.length];
    const photo = data.photos.find(p => p.id === (e.photoIds || [])[0]);
    const text = (e.text || '').trim();
    body.innerHTML = `<div class="cc-memory-label"><span>${esc(niceDate(e.date || today))} · ${esc(e.author || '')}</span><span aria-hidden="true">✧ ♡</span></div>${photo ? `<button type="button" class="cc-memory-photo" data-photo="${esc(photo.id)}" aria-label="Open photo">${photo.thumb ? `<img src="${photo.thumb}" alt="">` : '<span class="cc-img-wait" aria-hidden="true">▧</span>'}</button>` : ''}<p class="cc-memory">${esc(text.length > 140 ? text.slice(0, 140) + '…' : text)}</p><div class="cc-plan-actions"><button class="cc-button" type="button" data-shuffle ${pool.length < 2 ? 'disabled' : ''}>Shuffle</button><button class="cc-button" type="button" data-open-entry="${esc(e.id)}">Open diary</button></div>`;
  }

  // ---------- todo + wishlist ----------
  function renderTodo() {
    const filters = [['all', 'All'], ['trips', 'Trips'], ['activities', 'Little things'], ['done', 'Done']];
    const combined = [...data.trips.map(i => ({ ...i, kind: 'trip', done: i.status === 'visited' })), ...data.tasks.map(i => ({ ...i, kind: 'activity' }))].sort((a, b) => Number(!!a.done) - Number(!!b.done) || (a.createdAt || 0) - (b.createdAt || 0));
    const items = combined.filter(i => planner.todoFilter === 'all' || (planner.todoFilter === 'trips' && i.kind === 'trip') || (planner.todoFilter === 'activities' && i.kind === 'activity') || (planner.todoFilter === 'done' && i.done));
    const cards = items.map(i => {
      const trip = i.kind === 'trip', date = trip ? i.start : i.date;
      const heading = trip ? `<h3>${esc(i.title)}</h3>` : `<label class="cc-task-title"><input type="checkbox" data-task-id="${esc(i.id)}" ${i.done ? 'checked' : ''}><span>${esc(i.title)}</span></label>`;
      const status = trip ? `<label><span class="cc-small">Status </span><select class="cc-plan-status" data-trip-status="${esc(i.id)}">${['dreaming', 'planning', 'booked', 'visited'].map(v => `<option value="${v}" ${i.status === v ? 'selected' : ''}>${statusLabel(v)}</option>`).join('')}</select></label>` : '';
      return `<article class="cc-plan-card ${i.done ? 'cc-done' : ''}"><div class="cc-plan-tag">${trip ? '✈ TRIP' : '✓ LITTLE THING'}${i.by ? ' · ' + esc(i.by) : ''}</div>${heading}${i.note ? `<p>${esc(i.note)}</p>` : ''}<div class="cc-card-meta"><span>${date ? niceDate(date) + (trip && i.end && i.end !== date ? ' → ' + niceDate(i.end) : '') : 'Date still open'}</span>${status}</div><div class="cc-plan-actions" style="margin-top:9px">${date ? `<button class="cc-button" type="button" data-open-date="${date}">See in calendar</button>` : ''}${removeButton(trip ? 'trips' : 'tasks', i.id)}</div></article>`;
    }).join('') || '<p class="cc-empty-plan">Nothing here yet.</p>';
    const isTrip = planner.drafts.todo.kind === 'trip';
    const fields = selectField('todo', 'kind', 'Plan type', [['activity', 'Little thing'], ['trip', 'Trip']]) + formField('todo', 'title', isTrip ? 'Destination' : 'What should we do?', 'text', true) + (isTrip ? formField('todo', 'start', 'Departure (optional)', 'date') + formField('todo', 'end', 'Return (optional)', 'date') + selectField('todo', 'status', 'Status', ['dreaming', 'planning', 'booked', 'visited'].map(s => [s, statusLabel(s)])) : formField('todo', 'date', 'Pick a date (optional)', 'date')) + notesField('todo');
    $('[data-panel="todo"]').innerHTML = panelShell('todo', '✓ OUR TODO LIST', '旅行与待办', `<div class="cc-add-row"><div class="cc-filter-row" style="margin:0">${filters.map(([v, l]) => `<button type="button" class="cc-button" data-todo-filter="${v}" aria-pressed="${planner.todoFilter === v}">${l}</button>`).join('')}</div><button type="button" class="cc-button" data-show-form="todo" aria-expanded="${planner.forms.todo}">${planner.forms.todo ? 'Close form' : '+ Add a plan'}</button></div>${planner.forms.todo ? formShell('todo', 'Add to todo', fields, '+ Add to todo') : ''}<div class="cc-todo-grid">${cards}</div>`);
  }
  function renderWishlist() {
    const people = { both: 'For us', sijie: 'For 斯婕', zhenzhen: 'For 真真' };
    const cards = [...data.wishes].sort((a, b) => Number(!!a.got) - Number(!!b.got) || (a.createdAt || 0) - (b.createdAt || 0)).map(i => `<article class="cc-plan-card ${i.got ? 'cc-done' : ''}"><div class="cc-plan-tag">${people[i.who] || 'For us'}</div><div class="cc-wish-name">${esc(i.title)}</div>${i.note ? `<p>${esc(i.note)}</p>` : ''}<div class="cc-card-meta"><label class="cc-inline-check"><input type="checkbox" data-wish-id="${esc(i.id)}" ${i.got ? 'checked' : ''}><span>Got it ♡</span></label>${removeButton('wishes', i.id)}</div></article>`).join('') || '<p class="cc-empty-plan">No wishes yet.</p>';
    const fields = formField('wish', 'title', 'Something we would love', 'text', true) + selectField('wish', 'who', 'Who is it for?', [['both', 'Both of us'], ['sijie', '斯婕'], ['zhenzhen', '真真']]) + notesField('wish');
    $('[data-panel="wishlist"]').innerHTML = panelShell('wishlist', '♡ WISHLIST', '愿望清单', `<div class="cc-add-row"><p class="cc-small">Things we want, gift ideas.</p><button type="button" class="cc-button" data-show-form="wish" aria-expanded="${planner.forms.wish}">${planner.forms.wish ? 'Close form' : '+ Add a wish'}</button></div>${planner.forms.wish ? formShell('wish', 'Add a wish', fields, '+ Save wish') : ''}<div class="cc-wishlist-grid">${cards}</div>`);
  }

  // ---------- diary ----------
  function photoThumbs(ids) {
    const photos = (ids || []).map(id => data.photos.find(p => p.id === id)).filter(Boolean);
    return photos.length ? `<div class="cc-feed-photos n${Math.min(photos.length, 3)}">${photos.map(p => `<button type="button" class="cc-thumb" data-photo="${esc(p.id)}" aria-label="Open photo">${p.thumb ? `<img src="${p.thumb}" alt="${esc(p.caption || '')}" loading="lazy">` : '<span class="cc-img-wait" aria-hidden="true">▧</span>'}</button>`).join('')}</div>` : '';
  }
  function parseTags(text) {
    const seen = new Set();
    return String(text || '').split(/[,，#\s]+/).map(t => t.trim().slice(0, 20)).filter(t => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase())).slice(0, 8);
  }
  function entryMatches(e) {
    if (diaryFilter.tag && !(e.tags || []).some(t => t.toLowerCase() === diaryFilter.tag.toLowerCase())) return false;
    const q = diaryFilter.q.trim().toLowerCase(); if (!q) return true;
    const hay = [e.text, e.author, e.date, ...(e.tags || []), ...(e.comments || []).map(c => c.text)].join(' ').toLowerCase();
    return q.split(/\s+/).every(w => hay.includes(w));
  }
  const mini = key => { const img = (data.meta.avatars || {})[key]; return `<span class="cc-mini-avatar ${key}">${img ? `<img src="${img}" alt="">` : PEOPLE[key].slice(0, 1)}</span>`; };
  function renderDiary() {
    const pending = diaryDraft.pending.map((p, i) => `<span class="cc-pending"><img src="${p.thumb}" alt=""><button type="button" data-pending-remove="${i}" aria-label="Remove photo">×</button></span>`).join('');
    const composer = `<form class="cc-plan-form cc-diary-form" data-diary-form><h3>New entry · ${esc(meName())}</h3><div class="cc-fields"><label class="cc-field cc-field-wide">What happened?<textarea name="text" maxlength="3000" rows="4">${esc(diaryDraft.text)}</textarea></label><label class="cc-field">Date<input name="date" type="date" value="${esc(diaryDraft.date)}"></label><label class="cc-field">Tags (optional)<input name="tags" type="text" maxlength="120" placeholder="travel, food" value="${esc(diaryDraft.tags)}"></label><label class="cc-field cc-field-wide">Photos (up to 9)<span class="cc-button cc-file-btn">＋ Choose photos<input type="file" accept="image/*" multiple data-diary-photos></span></label></div>${pending ? `<div class="cc-pending-row">${pending}</div>` : ''}<div class="cc-form-footer"><button class="cc-button" type="submit" ${ui.busy ? 'disabled' : ''}>${ui.busy ? 'Saving…' : 'Post ✎'}</button></div></form>`;
    const tagCounts = new Map();
    data.diary.forEach(e => (e.tags || []).forEach(t => { const k = t.toLowerCase(); const cur = tagCounts.get(k) || { t, n: 0 }; cur.n++; tagCounts.set(k, cur); }));
    const tagsRow = [...tagCounts.values()].sort((a, b) => b.n - a.n || a.t.localeCompare(b.t)).map(({ t, n }) => `<button type="button" class="cc-tag" data-tag="${esc(t)}" aria-pressed="${diaryFilter.tag.toLowerCase() === t.toLowerCase()}">#${esc(t)} <small>${n}</small></button>`).join('');
    const filtering = diaryFilter.q.trim() || diaryFilter.tag;
    const list = diarySorted().filter(entryMatches);
    const search = `<form class="cc-diary-search" data-diary-search role="search"><input name="q" type="search" placeholder="Search the diary…" value="${esc(diaryFilter.q)}" aria-label="Search the diary"><button type="submit" class="cc-button">Search</button>${filtering ? '<button type="button" class="cc-button" data-clear-filter>Clear</button>' : ''}</form>${tagsRow ? `<div class="cc-tag-row">${tagsRow}</div>` : ''}${filtering ? `<p class="cc-small cc-result-count">${list.length} of ${data.diary.length} entries</p>` : ''}`;
    const feed = list.map(e => {
      const mine = e.author === meName(), key = nameToKey(e.author);
      if (ui.editingEntry === e.id) {
        const d = planner.drafts.entryedit;
        return `<article class="cc-feed" id="entry-${esc(e.id)}"><form class="cc-plan-form" data-planner-form="entryedit"><h3>Edit entry</h3><div class="cc-fields"><label class="cc-field cc-field-wide">Text<textarea name="text" maxlength="3000" rows="4">${esc(d.text)}</textarea></label><label class="cc-field">Date<input name="date" type="date" value="${esc(d.date)}"></label><label class="cc-field">Tags<input name="tags" type="text" maxlength="120" value="${esc(d.tags)}"></label></div><div class="cc-form-footer"><button class="cc-button" type="submit">Save</button><button type="button" class="cc-button" data-entry-cancel>Cancel</button></div></form></article>`;
      }
      const tags = (e.tags || []).map(t => `<button type="button" class="cc-tag" data-tag="${esc(t)}">#${esc(t)}</button>`).join('');
      const comments = (e.comments || []).map(c => `<div class="cc-reply"><b>${esc(c.author)}:</b> ${esc(c.text)}${c.author === meName() ? ` <button type="button" class="cc-x" data-comment-remove="${esc(c.id)}" data-entry="${esc(e.id)}" aria-label="Delete comment">×</button>` : ''}</div>`).join('');
      return `<article class="cc-feed ${ui.highlight === e.id ? 'cc-highlight' : ''}" id="entry-${esc(e.id)}"><div class="cc-meta"><span class="cc-meta-who">${mini(key)}${esc(e.author || '')} · ${esc(niceDate(e.date || today))}</span>${mine ? `<span class="cc-plan-actions"><button type="button" class="cc-button" data-entry-edit="${esc(e.id)}">Edit</button>${confirmButton('entry:' + e.id, 'Delete', `data-entry-delete="${esc(e.id)}"`)}</span>` : ''}</div>${e.text ? `<p class="cc-feed-text">${esc(e.text)}</p>` : ''}${tags ? `<div class="cc-tag-row cc-entry-tags">${tags}</div>` : ''}${photoThumbs(e.photoIds)}${comments}<form class="cc-comment-form" data-comment-form="${esc(e.id)}"><input name="comment" maxlength="500" placeholder="Reply as ${esc(meName())}…" value="${esc(commentDrafts[e.id] || '')}" aria-label="Write a reply"><button class="cc-button" type="submit">Reply</button></form></article>`;
    }).join('') || `<p class="cc-empty-plan">${filtering ? 'No entries match.' : 'No entries yet. Write the first one above.'}</p>`;
    $('[data-panel="diary"]').innerHTML = panelShell('diary', '✎ DIARY', '我们的日记', composer + search + feed);
  }

  // ---------- album ----------
  function renderAlbum() {
    const photos = [...data.photos].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
    const grid = photos.map(p => `<button type="button" class="cc-photo" data-photo="${esc(p.id)}">${p.thumb ? `<img class="cc-photo-img" src="${p.thumb}" alt="${esc(p.caption || '')}" loading="lazy">` : '<span class="cc-photo-img cc-img-wait" aria-hidden="true">▧</span>'}<span>${esc(p.caption || niceDate(p.date || today, { month: 'short', day: 'numeric', year: 'numeric' }))}</span></button>`).join('');
    $('[data-panel="album"]').innerHTML = panelShell('album', '▧ PHOTOS & KEEPSAKES', '相册',
      `<div class="cc-add-row"><p class="cc-small">${photos.length} photo${photos.length === 1 ? '' : 's'} · diary photos show up here too.</p><span class="cc-button cc-file-btn">${ui.busy ? 'Uploading…' : '＋ Upload photos'}<input type="file" accept="image/*" multiple data-album-photos ${ui.busy ? 'disabled' : ''}></span></div>${grid ? `<div class="cc-photos">${grid}</div>` : '<p class="cc-empty-plan">No photos yet.</p>'}`);
  }
  async function makePhoto(file) {
    const [thumb, full] = await Promise.all([CCStore.resizeImage(file, 480, 0.72), CCStore.resizeImage(file, 1600, 0.82)]);
    return { thumb, full };
  }
  async function savePhotos(list, extra) {
    const ids = [];
    for (const p of list) {
      const id = newId();
      // Not awaited: Firestore applies writes locally at once and syncs in the background (also offline).
      run(store.putFull(id, p.full), 'A photo could not be saved.');
      run(store.set('photos', { id, thumb: p.thumb, caption: p.caption || '', author: meName(), createdAt: Date.now(), ...extra }), 'A photo could not be saved.');
      ids.push(id);
    }
    return ids;
  }

  // ---------- lightbox ----------
  const lightbox = { id: null };
  async function openPhoto(id) {
    const list = ui.page === 'album' ? [...data.photos].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0)) : data.photos;
    const p = data.photos.find(x => x.id === id); if (!p) return;
    lightbox.id = id; lightbox.list = list.map(x => x.id);
    const dlg = $('[data-lightbox]');
    const idx = lightbox.list.indexOf(id);
    dlg.innerHTML = `<div class="cc-bar"><span>▧ ${idx + 1} / ${lightbox.list.length}</span><button type="button" class="cc-min" data-lightbox-close aria-label="Close">×</button></div><div class="cc-lightbox-body"> <img data-full src="${p.thumb || 'data:image/gif;base64,R0lGODlhAQABAAAAACw='}" alt="${esc(p.caption || '')}"><div class="cc-lightbox-meta"><span>${esc(p.author || '')} · ${esc(niceDate(p.date || today))}${p.caption ? ' · ' + esc(p.caption) : ''}</span><span class="cc-plan-actions"><button type="button" class="cc-button" data-lightbox-step="-1" aria-label="Previous photo">‹</button><button type="button" class="cc-button" data-lightbox-step="1" aria-label="Next photo">›</button>${p.entryId ? `<button type="button" class="cc-button" data-open-entry="${esc(p.entryId)}">Open diary</button>` : ''}${confirmButton('photo:' + p.id, 'Delete', `data-photo-delete="${esc(p.id)}"`)}</span></div></div>`;
    if (!dlg.open) dlg.showModal?.() ?? dlg.setAttribute('open', '');
    const full = await store.getFull(id).catch(() => null);
    if (full && lightbox.id === id) { const img = dlg.querySelector('[data-full]'); if (img) img.src = full; }
  }
  function closePhoto() { const dlg = $('[data-lightbox]'); lightbox.id = null; ui.confirm = null; dlg.close?.(); dlg.removeAttribute('open'); }

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
    if (!anniv) return [{ head: 'TOGETHER', num: '?', unit: 'DAYS · 天', foot: '', set: true }, todaySheet];
    const n = daysBetween(anniv.date, today) + 1, next100 = Math.ceil((n + 1) / 100) * 100;
    const nextAnniv = repeatDate({ ...anniv, repeat: true }), years = +nextAnniv.slice(0, 4) - +anniv.date.slice(0, 4);
    return [
      { head: 'TOGETHER', num: n, unit: 'DAYS · 在一起', foot: 'since ' + anniv.date.replace(/-/g, '.') },
      todaySheet,
      { head: 'NEXT', num: next100 - n, unit: `天后 · 第 ${next100} 天`, foot: niceDate(shiftDay(today, next100 - n), { month: 'short', day: 'numeric', year: 'numeric' }) },
      { head: `${years} YEAR${years === 1 ? '' : 'S'}`, num: daysBetween(today, nextAnniv), unit: '天后 · 周年', foot: niceDate(nextAnniv, { month: 'short', day: 'numeric', year: 'numeric' }) }
    ];
  }
  function renderTearpad(anniv) {
    const sheets = tearSheets(anniv), sh = sheets[ui.tearView % sheets.length];
    $('[data-tearpad]').innerHTML = `<div class="cc-tear-rings" aria-hidden="true"><i></i><i></i><i></i></div><div class="cc-tear-stack" aria-hidden="true"></div>
      <button type="button" class="cc-tear-sheet" data-tear aria-label="Tear off this page"><span class="cc-tear-head">${esc(sh.head)}</span><b class="cc-tear-num">${esc(sh.num)}</b><span class="cc-tear-unit" lang="zh-CN">${esc(sh.unit)}</span><span class="cc-tear-foot">${esc(sh.foot)}</span><span class="cc-tear-perf" aria-hidden="true"></span></button>
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
    $('[data-hero-caption]').innerHTML = ui.editCaption
      ? `<form class="cc-caption-form" data-caption-form><input name="caption" maxlength="40" value="${esc(cap)}" aria-label="Picture caption"><button type="submit" class="cc-button">Save</button><button type="button" class="cc-button" data-caption-cancel>Cancel</button></form>`
      : `<button type="button" class="cc-caption-text" data-caption-edit title="Edit caption">${esc(cap)}</button><span class="cc-hero-tools"><span class="cc-button cc-file-btn">${ui.busy === 'hero' ? 'Saving…' : '✎ Photo'}<input type="file" accept="image/*" data-hero-file aria-label="Change the top picture"></span>${custom ? '<button type="button" class="cc-button" data-hero-reset>Reset</button>' : ''}</span>`;
  }

  // ---------- chrome: player card, hero, sync ----------
  function renderChrome() {
    $$('[data-panel]').forEach(p => p.hidden = p.dataset.panel !== ui.page);
    $$('.cc-tab').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.go === ui.page)));
    $('[data-current-folder]').textContent = ui.page;
    const local = store.mode === 'local';
    const avatars = data.meta.avatars || {};
    const badge = key => `<span class="cc-badge ${key}">${avatars[key] ? `<img src="${avatars[key]}" alt="">` : PEOPLE[key].slice(0, 1)}</span>`;
    const picture = `<div class="cc-avatar-tools"><span class="cc-button cc-file-btn">${ui.busy === 'avatar' ? 'Saving…' : 'Change my picture'}<input type="file" accept="image/*" data-avatar-file aria-label="Change my profile picture"></span>${avatars[ui.me] ? '<button type="button" class="cc-link" data-avatar-reset>Remove picture</button>' : ''}</div>`;
    $('[data-player-card]').innerHTML = (local
      ? `<div class="cc-avatar" role="group" aria-label="Who is writing on this device">${['sijie', 'zhenzhen'].map(k => `<button type="button" class="cc-avatar-btn" data-me="${k}" aria-pressed="${ui.me === k}">${badge(k)}<small>${PEOPLE[k]}</small></button>`).join('<span class="cc-avatar-heart" aria-hidden="true">♥</span>')}</div><div class="cc-player-label">Playing as ${esc(meName())}</div>`
      : `<div class="cc-avatar">${['sijie', 'zhenzhen'].map(k => `<span class="cc-avatar-static ${ui.me === k ? 'me' : ''}">${badge(k)}<small>${PEOPLE[k]}</small></span>`).join('<span class="cc-avatar-heart" aria-hidden="true">♥</span>')}</div><div class="cc-player-label">PLAYER 01 + 02</div>`) + picture;
    const current = ui.previewTheme || data.meta.theme || THEMES[0].id;
    const cur = THEMES.find(t => t.id === current) || THEMES[0];
    $('[data-skins]').innerHTML = THEME_GROUPS.map(([g, label]) => `<p class="cc-skin-group">${label}</p><div class="cc-skin-list">${THEMES.filter(t => t.group === g).map(t => `<button type="button" class="cc-skin-row" data-theme="${t.id}" aria-pressed="${current === t.id}" style="${themeVars(t)}"><span class="cc-skin-dots"><i class="s1"></i><i class="s2"></i><i class="s3"></i></span><span lang="zh-CN">${esc(t.zh.replace(' · 夜', ''))}</span></button>`).join('')}</div>`).join('');
    applyTheme();
    const ws = weekStart(today), weekCount = Array.from({ length: 7 }, (_, i) => dayEvents(shiftDay(ws, i)).length).reduce((a, b) => a + b, 0);
    $('[data-hero-stats]').innerHTML = `<button type="button" data-hero="week">▦ ${weekCount} this week</button><button type="button" data-go="diary">✎ ${data.diary.length} diary</button><button type="button" data-go="album">▧ ${data.photos.length} photos</button>`;
    const anniv = data.dates.filter(d => d.kind === 'anniversary' && d.date <= today).sort((a, b) => a.date.localeCompare(b.date))[0];
    renderTearpad(anniv);
    renderHeroCaption();
    const syncText = { local: 'LOCAL ONLY', connecting: 'CONNECTING…', synced: '● SYNCED', saving: 'SAVING…', offline: 'OFFLINE', error: 'SYNC ERROR', signedout: 'LOG IN' }[ui.sync] || '';
    const chip = $('[data-sync]'); chip.textContent = syncText; chip.dataset.state = ui.sync;
    chip.title = local ? 'Saved only in this browser. Fill in the GitHub repo in config.js to share.' : 'Saved to GitHub. Checks for updates every 20 seconds.';
    $('[data-logout]').hidden = local || !ui.user;
    $('[data-foot-note]').textContent = local ? 'Saved on this device only' : ui.sync === 'offline' ? 'Offline · changes sync when back online' : 'Saved to GitHub · both of us';
    $('[data-status]').textContent = ui.sync === 'saving' ? 'SAVING…' : ui.sync === 'error' ? 'ERROR' : 'READY';
  }

  // ---------- render with focus preservation ----------
  let frame = 0;
  function render() {
    cancelAnimationFrame(frame); frame = 0;
    const a = document.activeElement, fa = a && root.contains(a) ? a.closest('form') : null;
    const formAttr = fa && ['data-planner-form', 'data-comment-form', 'data-diary-form', 'data-diary-search'].find(n => fa.hasAttribute(n));
    const keep = formAttr ? { sel: `[${formAttr}="${CSS.escape(fa.getAttribute(formAttr))}"]`, name: a.name, start: a.selectionStart, end: a.selectionEnd } : null;
    renderChrome(); renderCalendar(); renderSpecialDays(); renderMemory(); renderTodo(); renderWishlist(); renderDiary(); renderAlbum(); renderMessage(); decorateStaticWindows();
    if (keep?.name) {
      const el = $(keep.sel)?.elements[keep.name];
      if (el && el.focus) { el.focus({ preventScroll: true }); try { if (keep.start != null) el.setSelectionRange(keep.start, keep.end); } catch {} }
    }
  }
  const scheduleRender = () => { if (!frame) frame = requestAnimationFrame(render); };

  // ---------- navigation ----------
  function go(page) { if (!PAGES.includes(page)) return; ui.page = page; ui.confirm = null; if (location.hash.slice(1) !== page) history.pushState(null, '', '#' + page); render(); }
  window.addEventListener('popstate', () => { const p = location.hash.slice(1) || 'home'; if (PAGES.includes(p)) { ui.page = p; render(); } });

  // ---------- form submit ----------
  async function submitPlanner(form) {
    const name = form.dataset.plannerForm, d = Object.fromEntries(new FormData(form));
    if (name === 'entryedit') {
      if (!d.date || !validDay(d.date)) { form.elements.date.setCustomValidity('Please enter a valid date.'); form.elements.date.reportValidity(); return; }
      run(store.update('diary', ui.editingEntry, { text: String(d.text || '').trim(), date: d.date, tags: parseTags(d.tags) })); ui.editingEntry = null; flash('Saved.'); render(); return;
    }
    const title = String(d.title || '').trim();
    if (!title) { form.elements.title.setCustomValidity('Please add a name.'); form.elements.title.reportValidity(); return; }
    if (['event', 'special', 'edit'].includes(name) && !d.date) { form.elements.date.setCustomValidity('Please choose a date.'); form.elements.date.reportValidity(); return; }
    for (const f of ['date', 'start', 'end', 'endDate']) if (d[f] && !validDay(d[f])) { form.elements[f].setCustomValidity('Please enter a valid date.'); form.elements[f].reportValidity(); return; }
    if (d.endDate && d.endDate < d.date) { form.elements.endDate.setCustomValidity('The end date must be on or after the start.'); form.elements.endDate.reportValidity(); return; }
    if (name === 'todo' && d.kind === 'trip' && d.end && (!d.start || d.end < d.start)) { form.elements.end.setCustomValidity('Pick a departure date first, then a return on or after it.'); form.elements.end.reportValidity(); return; }
    const base = { id: newId(), title, by: meName(), createdAt: Date.now() }, note = String(d.note || '').trim();
    if (name === 'dayedit') { run(store.update('dates', planner.editingDay, { title, kind: d.kind, date: d.date, repeat: d.repeat === 'on' })); planner.editingDay = null; flash('Saved.'); render(); return; }
    if (name === 'event') { run(store.set('events', { ...base, date: d.date, endDate: d.endDate || '', note })); select(d.date); planner.drafts.event = { title: '', date: d.date, endDate: '', note: '' }; planner.forms.event = false; flash('Added to the calendar.'); }
    if (name === 'edit') { run(store.update('events', planner.editing, { title, date: d.date, endDate: d.endDate || '', note })); planner.editing = null; select(d.date); flash('Saved.'); }
    if (name === 'todo') {
      if (d.kind === 'trip') run(store.set('trips', { ...base, status: d.status, start: d.start || '', end: d.end || '', note }));
      else run(store.set('tasks', { ...base, date: d.date || '', done: false, note }));
      planner.drafts.todo = { title: '', kind: 'activity', status: 'dreaming', date: '', start: '', end: '', note: '' }; planner.todoFilter = 'all'; planner.forms.todo = false;
      flash((d.date || d.start) ? 'Added. It also shows in the calendar.' : 'Added.');
    }
    if (name === 'wish') { run(store.set('wishes', { ...base, who: d.who, note, got: false })); planner.drafts.wish = { title: '', who: 'both', note: '' }; planner.forms.wish = false; flash('Wish added.'); }
    if (name === 'special') { run(store.set('dates', { ...base, kind: d.kind, date: d.date, repeat: d.repeat === 'on' })); planner.drafts.special = { title: '', kind: 'anniversary', date: '', repeat: true }; planner.filter = 'all'; flash('Special day saved.'); }
    render();
  }
  async function submitDiary(form) {
    const text = String(form.elements.text.value || '').trim(), date = form.elements.date.value || today;
    if (!text && !diaryDraft.pending.length) { form.elements.text.setCustomValidity('Write something or add a photo.'); form.elements.text.reportValidity(); return; }
    if (!validDay(date)) { form.elements.date.setCustomValidity('Please enter a valid date.'); form.elements.date.reportValidity(); return; }
    ui.busy = true; render();
    try {
      const id = newId();
      const photoIds = await savePhotos(diaryDraft.pending, { entryId: id, date });
      run(store.set('diary', { id, author: meName(), text, date, tags: parseTags(diaryDraft.tags), photoIds, comments: [], createdAt: Date.now() }), 'Could not post. Please try again.');
      diaryDraft.text = ''; diaryDraft.date = today; diaryDraft.tags = ''; diaryDraft.pending = [];
      flash('Posted.');
    } catch (e) { console.error(e); flash('Could not post. Photos may be too large; try fewer.'); }
    ui.busy = false; render();
  }

  // ---------- events ----------
  root.addEventListener('input', e => {
    const el = e.target; el.setCustomValidity?.('');
    const pf = el.closest('[data-planner-form]');
    if (pf) planner.drafts[pf.dataset.plannerForm][el.name] = el.type === 'checkbox' ? el.checked : el.value;
    if (el.closest('[data-diary-form]') && ['text', 'date', 'tags'].includes(el.name)) diaryDraft[el.name] = el.value;
    if (el.closest('[data-diary-search]')) { diaryFilter.q = el.value; clearTimeout(ui.searchTimer); ui.searchTimer = setTimeout(render, 150); }
    const cf = el.closest('[data-comment-form]'); if (cf) commentDrafts[cf.dataset.commentForm] = el.value;
  });
  root.addEventListener('change', async e => {
    const el = e.target;
    if (el.matches('[data-calendar-file]')) { calendarImport.file = el.files[0] || null; calendarImport.name = calendarImport.file?.name || ''; calendarImport.preview = null; calendarImport.error = ''; render(); }
    if (el.matches('[data-import-date]')) { calendarImport[el.dataset.importDate] = el.value; calendarImport.preview = null; calendarImport.error = ''; render(); }
    if (el.matches('[data-task-id]')) run(store.update('tasks', el.dataset.taskId, { done: el.checked }));
    if (el.matches('[data-trip-status]')) run(store.update('trips', el.dataset.tripStatus, { status: el.value }));
    if (el.matches('[data-wish-id]')) run(store.update('wishes', el.dataset.wishId, { got: el.checked }));
    if (el.name === 'kind' && el.closest('[data-planner-form="special"]')) { planner.drafts.special.kind = el.value; planner.drafts.special.repeat = el.value !== 'holiday'; render(); }
    if (el.name === 'kind' && el.closest('[data-planner-form="todo"]')) { planner.drafts.todo.kind = el.value; render(); }
    if (el.name === 'kind' && el.closest('[data-planner-form="dayedit"]')) { planner.drafts.dayedit.kind = el.value; planner.drafts.dayedit.repeat = el.value !== 'holiday' || planner.drafts.dayedit.repeat; render(); }
    if (el.matches('[data-diary-photos]')) {
      const files = [...el.files].slice(0, 9 - diaryDraft.pending.length);
      if (el.files.length > files.length) flash('Up to 9 photos per entry.');
      ui.busy = true; render();
      for (const f of files) { try { diaryDraft.pending.push(await makePhoto(f)); } catch (err) { flash(err.message); } }
      ui.busy = false; render();
    }
    if (el.matches('[data-avatar-file]') && el.files[0]) {
      ui.busy = 'avatar'; render();
      try { const img = await CCStore.resizeImage(el.files[0], 160, 0.8, true); run(store.setMeta({ avatars: { ...(data.meta.avatars || {}), [ui.me]: img } })); flash('Picture updated.'); }
      catch (err) { flash(err.message); }
      ui.busy = false; render();
    }
    if (el.matches('[data-hero-file]') && el.files[0]) {
      ui.busy = 'hero'; render();
      try {
        const img = await CCStore.resizeImage(el.files[0], 1400, 0.85);
        const id = 'hero-' + newId(); ui.heroImages[id] = img;
        await store.putFull(id, img); await store.setMeta({ hero: id }); flash('Top picture updated.');
      } catch (err) { console.error(err); flash('Could not upload this picture.'); }
      ui.busy = false; render();
    }
    if (el.matches('[data-album-photos]')) {
      const files = [...el.files].slice(0, 20);
      ui.busy = true; render();
      try { const list = []; for (const f of files) list.push(await makePhoto(f)); savePhotos(list, { date: today }); flash(`${list.length} photo${list.length === 1 ? '' : 's'} added.`); }
      catch (err) { console.error(err); flash('Could not upload. Try a smaller photo.'); }
      ui.busy = false; render();
    }
  });
  root.addEventListener('submit', e => {
    const f = e.target; e.preventDefault();
    if (f.matches('[data-planner-form]')) submitPlanner(f);
    else if (f.matches('[data-diary-form]')) submitDiary(f);
    else if (f.matches('[data-diary-search]')) { diaryFilter.q = f.elements.q.value; render(); }
    else if (f.matches('[data-caption-form]')) { const c = f.elements.caption.value.trim().slice(0, 40); run(store.setMeta({ heroCaption: c || null })); data.meta = { ...data.meta, heroCaption: c || null }; ui.editCaption = false; render(); }
    else if (f.matches('[data-comment-form]')) {
      const id = f.dataset.commentForm, text = String(f.elements.comment.value || '').trim(); if (!text) return;
      commentDrafts[id] = ''; run(store.addComment(id, { id: newId(), author: meName(), text, at: Date.now() })); render();
    }
    else if (f.matches('[data-login-form]')) {
      const err = $('[data-login-error]'); err.textContent = '';
      const btn = f.querySelector('button[type=submit]'); btn.disabled = true;
      store.signIn(f.elements.token.value, PEOPLE[f.elements.who.value]).then(() => location.reload())
        .catch(x => { btn.disabled = false; err.textContent = navigator.onLine === false ? 'No internet connection.' : (x.message || String(x)); });
    }
  });

  root.addEventListener('click', e => {
    const el = e.target.closest('button'); if (!el || el.disabled) return;
    const ds = el.dataset;
    if (ds.go) { go(ds.go); if (ds.go === 'home') window.scrollTo({ top: 0 }); return; }
    if (ds.nav) { history[ds.nav](); return; }
    if (ds.min) { ui.collapsed.has(ds.min) ? ui.collapsed.delete(ds.min) : ui.collapsed.add(ds.min); ls.set('collapsed', [...ui.collapsed]); render(); return; }
    if (ds.me) { ui.me = ds.me; ls.set('me', ds.me); render(); return; }
    if (ds.theme) { run(store.setMeta({ theme: ds.theme })); data.meta = { ...data.meta, theme: ds.theme }; render(); return; }
    if (ds.pickColor) { ui.colorKind = ui.colorKind === ds.pickColor ? null : ds.pickColor; render(); return; }
    if (ds.setColor && ui.colorKind) { const kc = { ...(data.meta.kindColors || {}), [ui.colorKind]: ds.setColor }; data.meta = { ...data.meta, kindColors: kc }; run(store.setMeta({ kindColors: kc })); render(); return; }
    if (el.hasAttribute('data-avatar-reset')) { const av = { ...(data.meta.avatars || {}) }; delete av[ui.me]; run(store.setMeta({ avatars: av })); return; }
    if (ds.editDay) { const it = data.dates.find(x => x.id === ds.editDay); if (it) { planner.editingDay = it.id; planner.drafts.dayedit = { title: it.title, kind: it.kind, date: it.date, repeat: !!it.repeat }; render(); } return; }
    if (el.hasAttribute('data-dayedit-cancel')) { planner.editingDay = null; render(); return; }
    if (ds.tag != null && el.classList.contains('cc-tag')) { diaryFilter.tag = diaryFilter.tag.toLowerCase() === ds.tag.toLowerCase() ? '' : ds.tag; if (ui.page !== 'diary') go('diary'); else render(); return; }
    if (el.hasAttribute('data-clear-filter')) { diaryFilter.q = ''; diaryFilter.tag = ''; render(); return; }
    if (ds.entryEdit) { const en = data.diary.find(x => x.id === ds.entryEdit); if (en) { ui.editingEntry = en.id; planner.drafts.entryedit = { text: en.text || '', date: en.date || today, tags: (en.tags || []).join(', ') }; render(); } return; }
    if (el.hasAttribute('data-entry-cancel')) { ui.editingEntry = null; render(); return; }
    if (ds.bgm) { const a = ds.bgm; a === 'toggle' ? CCBgm.toggle() : a === 'next' ? CCBgm.next(1) : a === 'prev' ? CCBgm.next(-1) : CCBgm.volume(a === 'vol-up' ? 0.1 : -0.1); return; }
    if (el.hasAttribute('data-logout')) { store.signOut(); return; }
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
    if (ds.openTodo) { planner.todoFilter = ds.openTodo; go('todo'); return; }
    if (ds.todoFilter) { planner.todoFilter = ds.todoFilter; render(); return; }
    if (ds.showForm) { planner.forms[ds.showForm] = !planner.forms[ds.showForm]; render(); return; }
    if (el.hasAttribute('data-edit-days')) { openSpecial(!planner.specialOpen); return; }
    if (el.hasAttribute('data-set-anniversary')) { planner.drafts.special = { title: '在一起', kind: 'anniversary', date: '', repeat: true }; openSpecial(true); $('[data-planner-form="special"] input[name=date]')?.focus(); return; }
    if (el.hasAttribute('data-tear')) { tear(); return; }
    if (el.hasAttribute('data-hero-reset')) { run(store.setMeta({ hero: null })); return; }
    if (el.hasAttribute('data-caption-edit')) { ui.editCaption = true; render(); $('[data-caption-form] input')?.focus(); return; }
    if (el.hasAttribute('data-caption-cancel')) { ui.editCaption = false; render(); return; }
    if (ds.dateFilter) { planner.filter = ds.dateFilter; render(); return; }
    if (ds.remove) {
      const col = ds.remove, item = data[col]?.find(x => x.id === ds.id); if (!item) return;
      run(store.remove(col, item.id)); flash('Removed.', () => store.set(col, item)); return;
    }
    // import
    if (el.hasAttribute('data-import-open')) { calendarImport.open = !calendarImport.open; render(); return; }
    if (el.hasAttribute('data-import-close')) { calendarImport.open = false; render(); return; }
    if (el.hasAttribute('data-import-preview')) { previewImport(); return; }
    if (el.hasAttribute('data-import-confirm')) { confirmImport(); return; }
    // memory / diary / photos
    if (el.hasAttribute('data-shuffle')) { const n = data.diary.length; ui.memory += 1 + Math.floor(Math.random() * Math.max(1, n - 1)); renderMemory(); return; }
    if (ds.openEntry) { closePhoto(); ui.highlight = ds.openEntry; go('diary'); document.getElementById('entry-' + ds.openEntry)?.scrollIntoView({ block: 'center' }); setTimeout(() => { ui.highlight = null; scheduleRender(); }, 2500); return; }
    if (ds.pendingRemove) { diaryDraft.pending.splice(+ds.pendingRemove, 1); render(); return; }
    if (ds.entryDelete) {
      const entry = data.diary.find(x => x.id === ds.entryDelete); ui.confirm = null; if (!entry) return;
      run((async () => { for (const pid of entry.photoIds || []) await store.remove('photos', pid); await store.remove('diary', entry.id); })()); flash('Entry deleted.'); return;
    }
    if (ds.commentRemove) { const entry = data.diary.find(x => x.id === ds.entry); run(store.removeComment(ds.entry, ds.commentRemove, entry?.comments)); return; }
    if (ds.photo) { ui.confirm = null; openPhoto(ds.photo); return; }
    if (el.hasAttribute('data-lightbox-close')) { closePhoto(); return; }
    if (ds.lightboxStep) { const l = lightbox.list, i = l.indexOf(lightbox.id); ui.confirm = null; openPhoto(l[(i + +ds.lightboxStep + l.length) % l.length]); return; }
    if (ds.photoDelete) {
      const p = data.photos.find(x => x.id === ds.photoDelete); closePhoto(); if (!p) return;
      run((async () => { await store.remove('photos', p.id); if (p.entryId) { const en = data.diary.find(x => x.id === p.entryId); if (en) await store.update('diary', en.id, { photoIds: (en.photoIds || []).filter(x => x !== p.id) }); } })());
      flash('Photo deleted.'); return;
    }
  });
  $('[data-lightbox]').addEventListener('keydown', e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); $(`[data-lightbox-step="${e.key === 'ArrowRight' ? 1 : -1}"]`)?.click(); } });
  $('[data-lightbox]').addEventListener('click', e => { if (e.target === e.currentTarget) closePhoto(); });
  $('[data-lightbox]').addEventListener('close', () => { lightbox.id = null; });
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
    flash(`${entries.length} events imported.`, async () => { for (const x of entries) await store.remove('events', x.id); });
    render();
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
    const ipod = $('[data-ipod]'), dock = $('[data-dock]'); if (!ipod || !dock) return;
    const saved = ls.get('ipod', { docked: true, x: 0, y: 0 });
    const JACK = { x: 0.075, y: 0.02 };              // jack position on the iPod image (fraction of size)
    const plugTip = () => { const r = dock.querySelector('.cc-cable').getBoundingClientRect(); return { x: r.left + 31, y: r.top + 46 }; };
    const jackOf = (x, y) => ({ x: x + ipod.offsetWidth * JACK.x, y: y + ipod.offsetHeight * JACK.y });
    const clamp = (x, y) => ({ x: Math.max(4, Math.min(innerWidth - ipod.offsetWidth - 4, x)), y: Math.max(40, Math.min(innerHeight - ipod.offsetHeight - 4, y)) });
    function place() {
      dock.dataset.docked = String(saved.docked);
      ipod.classList.toggle('cc-floating', !saved.docked);
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
    addEventListener('resize', () => { if (!saved.docked) place(); });
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
  const onChange = (col, items) => { data[col] = items || (col === 'meta' ? {} : []); scheduleRender(); };
  let lastError = 0;
  const onStatus = (s, err) => {
    if (s === 'error' && err && Date.now() - lastError > 30000) { lastError = Date.now(); flash('Sync problem: ' + (err.message || err) + ' Will retry.'); }
    if (ui.sync !== s) { ui.sync = s; scheduleRender(); }
  };
  history.replaceState(null, '', '#' + ui.page);
  render();
  if (store.mode === 'local') {
    showApp(true);
    seedIfNeeded().then(() => store.start(onChange));
  } else {
    showApp(false);
    store.onAuth(async (user, err) => {
      ui.user = user;
      if (!user) { if (err) $('[data-login-error]').textContent = err.message; ui.sync = 'signedout'; showApp(false); render(); return; }
      ui.me = nameToKey(user.name || '斯婕');
      showApp(true); render();
      try { await store.start(onChange, onStatus); await seedIfNeeded(); }
      catch (e) {
        console.error(e);
        if (e.code === 'auth') { $('[data-login-error]').textContent = e.message; localStorage.removeItem('olc:github'); showApp(false); }
        ui.sync = navigator.onLine === false ? 'offline' : 'error'; render();
      }
    });
  }
})();
