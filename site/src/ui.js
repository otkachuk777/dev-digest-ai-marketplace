import { esc, highlight } from './highlight.js';
import { displayName, tokenLabel, versionLabel } from './data.js';

export const COPY_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/></svg>';

export function detailHref(id, channel) {
  return `artifact.html?id=${encodeURIComponent(id)}${channel === 'stable' ? '&channel=stable' : ''}`;
}

export function cardHtml(item, { terms, channel }) {
  const href = esc(detailHref(item.id, channel));
  const tags = item.tags.slice(0, 4).map((t) => `<span class="tag">#${esc(t)}</span>`).join('');
  return `<article class="card">
<div class="card-top"><span class="b b-${esc(item.type)}">${esc(item.type)}</span><span class="mono muted small">${esc(versionLabel(item.version))}</span></div>
<div><h2 class="card-title"><a href="${href}">${highlight(displayName(item), terms)}</a></h2><div class="small muted">in <span class="mono">${esc(item.plugin)}</span></div></div>
<p class="clamp">${highlight(item.description, terms)}</p>
<div class="tags">${tags}</div>
<div class="card-foot"><span class="mono muted small grow">${esc(tokenLabel(item.tokens))}</span><a class="small" href="${href}">Details</a><button class="btn" type="button" data-copy="${esc(item.plugin)}" aria-label="Copy install snippet for ${esc(item.plugin)}">${COPY_ICON} Copy install</button></div>
</article>`;
}

export function tileHtml(kind, ctx = {}) {
  switch (kind) {
    case 'empty':
      return `<section class="tile"><span class="lbl">Empty marketplace</span><h2>No plugins published yet</h2><p>The marketplace is live and the catalog builds. Plugins will appear here after they are merged to main.</p>${ctx.requestUrl ? `<div class="actions"><a class="btn" href="${esc(ctx.requestUrl)}">Request a skill</a></div>` : ''}</section>`;
    case 'no-results':
      return `<section class="tile"><span class="lbl">No results</span><h2>Nothing matches &quot;${esc(ctx.query)}&quot;</h2><p>Try fewer or broader words, or remove a filter.</p><div class="actions"><button class="btn" type="button" data-action="clear">Clear filters</button><a class="btn btn-p" href="${esc(ctx.requestUrl)}">Request a skill</a></div><span class="small muted">Opens a prefilled GitHub issue with your query.</span></section>`;
    case 'error':
      return `<section class="tile"><span class="lbl">Load failed</span><div class="alert" role="alert"><strong>Could not load the catalog.</strong><br><span class="small">${esc(ctx.message)} Nothing is cached.</span></div><div class="actions"><button class="btn btn-p" type="button" data-action="retry">Retry</button></div></section>`;
    case 'not-found':
      return `<section class="tile"><span class="lbl">Unknown artifact id</span><h2>Artifact not found</h2><p>No artifact with id <span class="mono">${esc(ctx.id)}</span> in this channel. It may have been renamed or removed.</p><div class="actions"><a class="btn btn-p" href="./">Back to search</a></div></section>`;
    case 'not-in-stable':
      return `<section class="tile"><span class="lbl">Channel stable</span><h2>Not available in stable</h2><p class="warn">This artifact has no stable version. Switch to latest to install.</p><div class="actions"><a class="btn btn-p" href="${esc(ctx.switchUrl)}">Open in latest</a><a class="btn" href="./">Back to search</a></div></section>`;
    default:
      return '';
  }
}

export function newsHtml(releases, siteBase) {
  if (!releases.length) return '<li class="muted">No releases yet.</li>';
  return releases.map((r) => {
    const href = esc(detailHref(`${r.plugin}/plugin/${r.plugin}`, 'latest'));
    return `<li><span class="mono muted small">${esc(String(r.date).slice(0, 10))}</span><span><strong class="mono">${esc(`${r.plugin} ${r.version}`)}</strong> <span class="muted">${esc(r.summary)}</span></span><a class="small" href="${siteBase}${href}">Open</a></li>`;
  }).join('');
}
