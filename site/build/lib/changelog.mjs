export const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const heading = (version) => new RegExp(`^##\\s+\\[?v?${escapeRe(version)}\\]?(\\s|$)`);

export function hasSection(text, version) {
  return String(text ?? '').replace(/\r\n/g, '\n').split('\n').some((l) => heading(version).test(l));
}

export function changelogSummary(text, version) {
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((l) => heading(version).test(l));
  if (start < 0) return null;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break;
    const t = lines[i].trim().replace(/^[-*]\s+/, '');
    if (t && !t.startsWith('#')) return t;
  }
  return null;
}
