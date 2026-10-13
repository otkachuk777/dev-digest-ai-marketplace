import { esc, highlight } from './highlight.js';
import { displayName, tokenLabel, versionLabel } from './data.js';

export const COPY_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/></svg>';

export function detailHref(id, channel, explicit = false) {
  return `artifact.html?id=${encodeURIComponent(id)}${channel === 'stable' || (explicit && channel === 'latest') ? `&channel=${channel}` : ''}`;
}

export function cardHtml(item, { terms, channel }) {
  const href = esc(detailHref(item.id, channel));
  const tags = item.tags.slice(0, 4).map((t) => `<span class="tag">#${esc(t)}</span>`).join('');
  return `<article class="card">
<div class="card-top"><span class="b b-${esc(item.type)}">${esc(item.type)}</span><span class="mono muted small">${esc(versionLabel(item.version))}</span></div>
<div><h2 class="card-title"><a href="${href}">${highlight(displayName(item), terms)}</a></h2><div class="small muted">in <span class="mono">${esc(item.plugin)}</span></div></div>
<p class="clamp">${highlight(item.description, terms)}</p>
<div class="tags">${tags}</div>
<div class="card-foot"><span class="mono muted small grow">${esc(tokenLabel(item.tokens))}</span><a class="small tap" href="${href}">Details</a><button class="btn" type="button" data-copy="${esc(item.plugin)}" aria-label="Copy install snippet for ${esc(item.plugin)}">${COPY_ICON} Copy install</button></div>
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
    return `<li><span class="mono muted small">${esc(String(r.date).slice(0, 10))}</span><span><strong class="mono">${esc(`${r.plugin} ${r.version}`)}</strong> <span class="muted">${esc(r.summary)}</span></span><a class="small tap" href="${esc(siteBase)}${href}">Open</a></li>`;
  }).join('');
}

export const sourceUrl = (repo, record) => `https://github.com/${repo}/blob/${encodeURIComponent(record.ref)}/${record.path.split('/').map(encodeURIComponent).join('/')}`;

export function installHtml({ steps, plugin, ownerNote }) {
  const pre = steps.map((s) => `<span class="c">${esc(s.comment)}</span>\n${esc(s.command)}`).join('\n');
  const note = ownerNote ? `<p class="hint">Artifacts are not installed on their own. This is the snippet for the owning plugin, <span class="mono">${esc(plugin)}</span>.</p>` : '';
  return `<h2>Install</h2>${note}<pre class="sn" id="snippet" tabindex="0">${pre}</pre><div class="copyrow"><button class="btn btn-p" type="button" id="copy">Copy snippet</button><span id="copy-status" class="ok" role="status" aria-live="polite"></span></div>`;
}

export function tokensHtml(tokens) {
  if (!tokens) return '<h2>Token cost</h2><p class="hint">Token cost is not available for this artifact type.</p><p class="foot">Estimate = characters / 4. A real tokenizer may differ by 10-20%.</p>';
  const n = (v) => `≈${v.toLocaleString('en-US')}`;
  return `<h2>Token cost</h2><div class="stats"><div class="stat"><div class="n">${n(tokens.always)}</div><div class="d">always in context<br>name + description</div></div><div class="stat"><div class="n">${n(tokens.onInvoke)}</div><div class="d">on invoke<br>markdown body</div></div></div><p class="foot">Estimate = characters / 4. A real tokenizer may differ by 10-20%.</p>`;
}

export function securityHtml(record) {
  const d = record.declared;
  const v = record.validation;
  const validation = !record.indexed || !v
    ? 'Not checked (remote source)'
    : v.failures.length === 0
      ? `<span class="ok">Passed</span> · ${v.passed} of ${v.total} rules`
      : `<span class="bad">Failed</span> · ${v.passed} of ${v.total} rules`;
  const failures = v && v.failures.length ? `<ul class="failures">${v.failures.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : '';
  const tools = d.tools.length ? esc(d.tools.join(', ')) : 'None declared';
  const hooks = d.hooks.map((h) => `<div class="risk"><div class="k">${esc(h.event)}${h.matcher ? ` · matcher ${esc(h.matcher)}` : ''}</div><div>${esc(h.command)}</div></div>`).join('');
  const mcp = d.mcp.map((m) => `<div class="risk mcp"><div class="k">server: ${esc(m.name)}</div><div>${esc(m.command)}</div></div>`).join('');
  return `<h2 id="sec">Security</h2><p class="warn">Declared in the plugin files, not independently audited.</p>
<dl class="kv"><dt>Tools</dt><dd class="mono small">${tools}</dd><dt>Validation</dt><dd>${validation}${failures}</dd><dt>Last change</dt><dd class="mono small">${esc(record.lastChange ?? 'unknown')}</dd><dt>Version</dt><dd class="mono small">${esc(record.version ?? 'n/a')} · ${esc(record.ref)}</dd></dl>
${hooks ? `<h3><span class="b b-hook">hook</span> Runs commands on your machine</h3>${hooks}` : ''}
${mcp ? `<h3><span class="b b-mcp">mcp</span> Runs commands on your machine</h3>${mcp}` : ''}`;
}
