import { parseQuery } from './query.js';

const TYPE_ORDER = ['plugin', 'skill', 'agent', 'command', 'hook', 'mcp'];

function matches(item, { types = [], tag = '', plugin = '' }) {
  return (!types.length || types.includes(item.type)) && (!tag || item.tags.includes(tag)) && (!plugin || item.plugin === plugin);
}

export function search({ ms, items, query, filters = {} }) {
  const q = parseQuery(query);
  let hits;
  if (q.terms.length > 0) {
    const byId = new Map(items.map((i) => [i.id, i]));
    const results = ms.search(q.text, {
      boostDocument: (_id, _term, stored) => (q.typeBoost && stored?.type === q.typeBoost ? 2 : 1),
    });
    hits = results.filter((r) => byId.has(r.id)).map((r) => ({ item: byId.get(r.id), score: r.score, terms: q.terms }));
  } else {
    hits = items
      .map((item) => ({ item, score: 0, terms: [] }))
      .sort((a, b) =>
        Number(b.item.type === q.typeBoost) - Number(a.item.type === q.typeBoost) ||
        a.item.plugin.localeCompare(b.item.plugin) ||
        TYPE_ORDER.indexOf(a.item.type) - TYPE_ORDER.indexOf(b.item.type) ||
        a.item.name.localeCompare(b.item.name));
  }
  return { query: q, hits: hits.filter((h) => matches(h.item, filters)) };
}
