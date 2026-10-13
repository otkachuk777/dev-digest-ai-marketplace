const TYPE_ORDER = ['plugin', 'skill', 'agent', 'command', 'hook', 'mcp'];
const SIZED = new Set(['skill', 'agent', 'command']);

export const bodyFile = (channel, id) => `bodies/${channel}/${id.replaceAll('/', '__')}.md`;

export function buildCatalog({ repo, latest, stable, releases }) {
  const records = new Map();
  const bodies = new Map();
  const searchDocs = { latest: [], stable: [] };

  for (const ch of [latest, stable]) {
    if (!ch) continue;
    const seen = new Set();
    for (const plugin of ch.plugins) {
      const kids = plugin.artifacts.filter((a) => SIZED.has(a.type));
      const sum = (k) => kids.reduce((n, a) => n + a.tokens[k], 0);
      const allTools = [...new Set(plugin.artifacts.flatMap((a) => a.tools))];
      for (const a of plugin.artifacts) {
        const id = `${plugin.name}/${a.type}/${a.slug}`;
        if (seen.has(id)) throw new Error(`Duplicate artifact id "${id}" in channel ${ch.channel}`);
        seen.add(id);
        const isPlugin = a.type === 'plugin';
        const tokens = isPlugin ? (plugin.indexed ? { always: sum('always'), onInvoke: sum('onInvoke') } : null) : a.tokens;
        const text = (a.body ?? '').trim();
        const file = text ? bodyFile(ch.channel, id) : null;
        if (file) bodies.set(file, `${text}\n`);
        const rec = records.get(id) ?? { id, type: a.type, name: a.name, plugin: plugin.name, channels: {} };
        rec.channels[ch.channel] = {
          version: plugin.version,
          description: a.description,
          tags: a.tags,
          tokens,
          declared: { tools: isPlugin ? allTools : a.tools, hooks: plugin.hooks, mcp: plugin.mcp },
          path: a.path,
          ref: ch.channel === 'latest' ? 'main' : (plugin.tag ?? 'stable'),
          body: file,
          validation: plugin.validation,
          lastChange: plugin.lastChange,
          indexed: plugin.indexed,
        };
        records.set(id, rec);
        searchDocs[ch.channel].push({
          id, type: a.type, name: a.name, plugin: plugin.name, description: a.description,
          tags: a.tags.join(' '), body: text.slice(0, 4000),
        });
      }
    }
  }

  const artifacts = [...records.values()].sort((a, b) =>
    a.plugin.localeCompare(b.plugin) || TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.name.localeCompare(b.name));

  return {
    catalog: {
      schema: 1,
      repo,
      channels: {
        latest: { marketplace: latest.marketplace, ref: latest.ref },
        stable: stable ? { marketplace: stable.marketplace, ref: stable.ref } : null,
      },
      artifacts,
      releases,
    },
    bodies,
    searchDocs,
  };
}
