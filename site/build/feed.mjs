const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

export function buildAtom({ siteUrl, repo, releases, updated }) {
  const entries = releases.map((r) => {
    const link = `${siteUrl}artifact.html?id=${encodeURIComponent(`${r.plugin}/plugin/${r.plugin}`)}`;
    return `  <entry>
    <id>tag:github.com,${esc(repo)}:${esc(r.tag)}</id>
    <title>${esc(`${r.plugin} ${r.version}`)}</title>
    <updated>${esc(r.date)}</updated>
    <link href="${esc(link)}"/>
    <summary>${esc(r.summary)}</summary>
  </entry>`;
  });
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>tag:github.com,${esc(repo)}:releases</id>
  <title>${esc(repo)} releases</title>
  <updated>${esc(updated)}</updated>
  <link rel="self" href="${esc(`${siteUrl}feed.xml`)}"/>
  <link href="${esc(siteUrl)}"/>
${entries.join('\n')}
</feed>
`;
}
