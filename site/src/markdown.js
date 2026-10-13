export function createRenderer({ marked, purify }) {
  purify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') node.setAttribute('rel', 'noopener noreferrer');
  });
  return (md) => {
    const html = marked.parse(String(md ?? ''), { async: false, gfm: true });
    return purify.sanitize(html, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe', 'object', 'embed', 'textarea', 'select'],
      FORBID_ATTR: ['style'],
    });
  };
}
