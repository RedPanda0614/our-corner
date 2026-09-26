// Shared list pagination for the diary, plans, wishes, photos, and special days.
(() => {
  'use strict';
  const SIZE = 20;
  function paginate(items, requestedPage, size = SIZE) {
    const totalPages = Math.max(1, Math.ceil(items.length / size));
    const page = Math.min(totalPages, Math.max(1, Number(requestedPage) || 1));
    const start = (page - 1) * size;
    return { items: items.slice(start, start + size), page, totalPages, start, end: Math.min(start + size, items.length), total: items.length };
  }
  function pageForItem(items, id, size = SIZE) {
    const index = items.findIndex(item => item.id === id);
    return index < 0 ? 1 : Math.floor(index / size) + 1;
  }
  const api = { SIZE, paginate, pageForItem };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.CCPagination = api;
})();
