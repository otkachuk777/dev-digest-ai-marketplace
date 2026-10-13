export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function highlight(text, terms) {
  const list = (terms ?? []).filter((t) => t && t.length > 0);
  if (list.length === 0) return esc(text);
  const re = new RegExp(`(${list.map(reEscape).join('|')})`, 'gi');
  return String(text ?? '').split(re).map((part, i) => (i % 2 === 1 ? `<mark>${esc(part)}</mark>` : esc(part))).join('');
}
