// Status history lives in private per-person metadata; the current status is
// included when browsing so statuses saved before this feature are visible.
(() => {
  'use strict';
  const valid = value => value && typeof value === 'object' && typeof value.emoji === 'string' && Number.isFinite(+value.at) && +value.at > 0
    ? { emoji: value.emoji, text: String(value.text || ''), at: +value.at } : null;
  const id = value => `${value.at}:${value.emoji}`;
  function patch(...values) {
    const out = {};
    for (const value of values) { const record = valid(value); if (record) out[id(record)] = record; }
    return out;
  }
  function entries(meta, who) {
    const archive = meta?.[`statusHistory:${who}`];
    const values = archive && typeof archive === 'object' && !Array.isArray(archive) ? Object.values(archive) : [];
    values.push(meta?.[`status:${who}`]);
    const found = new Map();
    for (const value of values) { const record = valid(value); if (record) found.set(id(record), record); }
    return [...found.values()].sort((a, b) => b.at - a.at);
  }
  const api = { patch, entries };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.CCStatusHistory = api;
})();
