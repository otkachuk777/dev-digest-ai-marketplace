const STOP = new Set([
  'i', 'me', 'my', 'we', 'you', 'need', 'needs', 'want', 'wants', 'a', 'an', 'the', 'for', 'to', 'of', 'with', 'that', 'this',
  'is', 'are', 'be', 'some', 'any', 'please', 'help', 'find', 'show', 'looking', 'something', 'can', 'could', 'would', 'like',
  'there', 'give', 'get', 'and', 'or', 'in', 'on', 'it',
]);

const TYPE_WORDS = {
  skill: 'skill', skills: 'skill', agent: 'agent', agents: 'agent', plugin: 'plugin', plugins: 'plugin',
  command: 'command', commands: 'command', hook: 'hook', hooks: 'hook', mcp: 'mcp',
};

export function parseQuery(raw) {
  const words = String(raw ?? '').toLowerCase().replace(/[^\p{L}\p{N}\s/_-]+/gu, ' ').split(/\s+/).filter(Boolean);
  let typeBoost = null;
  const terms = [];
  for (const w of words) {
    if (TYPE_WORDS[w]) {
      typeBoost ??= TYPE_WORDS[w];
      continue;
    }
    if (STOP.has(w)) continue;
    const t = w.replace(/^\/+/, '');
    if (t && /[\p{L}\p{N}]/u.test(t)) terms.push(t);
  }
  return { terms, text: terms.join(' '), typeBoost };
}
