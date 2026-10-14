export function viewItems(catalog, channel) {
  return catalog.artifacts
    .filter((a) => a.channels[channel])
    .map((a) => {
      const c = a.channels[channel];
      return { id: a.id, type: a.type, name: a.name, plugin: a.plugin, version: c.version, description: c.description, tags: c.tags ?? [], tokens: c.tokens ?? null };
    });
}

export function facets(items) {
  const uniq = (list) => [...new Set(list)].sort((a, b) => a.localeCompare(b));
  return { tags: uniq(items.flatMap((i) => i.tags)), plugins: uniq(items.map((i) => i.plugin)) };
}

export const displayName = (item) => (item.type === 'command' ? `/${item.name}` : item.name);
export const tokenLabel = (tokens) => (tokens ? `≈${tokens.always} tokens always` : 'tokens n/a');
export const versionLabel = (v) => (v ? `v${v}` : 'n/a');
