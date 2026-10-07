// Keep flat stored comments compatible while displaying replies below their parent.
(() => {
  'use strict';
  function flatten(comments) {
    const list = Array.isArray(comments) ? comments.filter(c => c && typeof c === 'object' && c.id) : [];
    const byId = new Map(list.map(c => [c.id, c]));
    const children = new Map(), roots = [];
    for (const c of list) {
      const parent = c.replyTo && c.replyTo !== c.id ? byId.get(c.replyTo) : null;
      if (parent) {
        const group = children.get(parent.id) || [];
        group.push(c); children.set(parent.id, group);
      } else roots.push(c);
    }
    const seen = new Set(), rows = [];
    function visit(c, depth) {
      if (seen.has(c.id)) return;
      seen.add(c.id);
      rows.push({ comment: c, parent: byId.get(c.replyTo) || null, depth: Math.min(depth, 2) });
      for (const child of children.get(c.id) || []) visit(child, depth + 1);
    }
    for (const root of roots) visit(root, 0);
    for (const c of list) visit(c, 0); // orphaned cycles still show up
    return rows;
  }
  const api = { flatten };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.CCCommentThreads = api;
})();
