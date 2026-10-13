function unquote(s) {
  if (s.length >= 2 && ((s[0] === '"' && s.at(-1) === '"') || (s[0] === "'" && s.at(-1) === "'"))) {
    const inner = s.slice(1, -1);
    return s[0] === '"'
      ? inner.replace(/\\(["\\nt])/g, (_, c) => ({ n: '\n', t: '\t' })[c] ?? c)
      : inner.replace(/''/g, "'");
  }
  return s;
}

function splitInline(s) {
  const out = [];
  let cur = '';
  let quote = null;
  for (const ch of s) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function scalar(raw) {
  const s = raw.trim();
  if (s.startsWith('[') && s.endsWith(']')) {
    return splitInline(s.slice(1, -1)).map((x) => x.trim()).filter(Boolean).map(scalar);
  }
  if (s === 'true') return true;
  if (s === 'false') return false;
  return unquote(s);
}

function parseYaml(src) {
  const lines = src.split('\n');
  const data = {};
  for (let i = 0; i < lines.length; i++) {
    const m = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const [, key, rest] = m;
    if (/^[>|][+-]?$/.test(rest)) {
      const block = [];
      while (i + 1 < lines.length && (/^\s+/.test(lines[i + 1]) || lines[i + 1] === '')) block.push(lines[++i]);
      const text = block.map((l) => l.replace(/^\s+/, ''));
      data[key] = rest[0] === '>' ? text.join(' ').replace(/\s+/g, ' ').trim() : text.join('\n').trim();
    } else if (rest === '') {
      const items = [];
      while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) items.push(scalar(lines[++i].replace(/^\s*-\s+/, '')));
      data[key] = items.length ? items : '';
    } else {
      data[key] = scalar(rest);
    }
  }
  return data;
}

export function parseFrontmatter(text) {
  const src = String(text ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const m = /^---\n(?:([\s\S]*?)\n)?---[ \t]*(?:\n|$)/.exec(src);
  if (!m) return { data: {}, body: src, hasFrontmatter: false };
  return { data: parseYaml(m[1] ?? ''), body: src.slice(m[0].length), hasFrontmatter: true };
}
