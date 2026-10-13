export const TYPES = ['skill', 'agent', 'command', 'hook', 'mcp', 'plugin'];

export function readState(search) {
  const p = new URLSearchParams(search);
  return {
    q: p.get('q') ?? '',
    types: (p.get('type') ?? '').split(',').filter((t) => TYPES.includes(t)),
    tag: p.get('tag') ?? '',
    plugin: p.get('plugin') ?? '',
    channel: ['latest', 'stable'].includes(p.get('channel')) ? p.get('channel') : null,
  };
}

export function writeState({ q, types, tag, plugin, channel }) {
  const p = new URLSearchParams();
  if (q) p.set('q', q);
  if (types?.length) p.set('type', types.join(','));
  if (tag) p.set('tag', tag);
  if (plugin) p.set('plugin', plugin);
  if (channel === 'stable') p.set('channel', 'stable');
  return p.toString();
}

export function resolveChannel({ fromUrl, stored, hasStable }) {
  const want = fromUrl ?? stored ?? 'latest';
  return want === 'stable' && hasStable ? 'stable' : 'latest';
}
