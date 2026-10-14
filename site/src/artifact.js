import { marked } from './vendor/marked.js';
import DOMPurify from './vendor/purify.js';
import { createRenderer } from './markdown.js';
import { loadCatalog, loadMeta, loadText, getStoredChannel, storeChannel } from './loader.js';
import { resolveChannel } from './state.js';
import { installSteps } from './snippets.js';
import { reportProblemUrl, requestSkillUrl } from './issues.js';
import { copyText, selectContents } from './clipboard.js';
import { displayName, versionLabel } from './data.js';
import { esc } from './highlight.js';
import { tileHtml, installHtml, tokensHtml, securityHtml, dependenciesHtml, sourceUrl, detailHref } from './ui.js';

const $ = (id) => document.getElementById(id);
const render = createRenderer({ marked, purify: DOMPurify });
const params = new URLSearchParams(location.search);
const id = params.get('id') ?? '';

function setChannelButtons(channel) {
  for (const b of $('channel').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.channel === channel));
}

async function main() {
  const root = $('main');
  let catalog;
  let meta;
  try {
    [catalog, meta] = await Promise.all([loadCatalog(), loadMeta()]);
  } catch (e) {
    document.title = 'Catalog unavailable';
    root.innerHTML = tileHtml('error', { message: e.message });
    root.addEventListener('click', (ev) => { if (ev.target.closest('[data-action="retry"]')) location.reload(); });
    return;
  }
  const hasStable = Boolean(catalog.channels.stable);
  const channel = resolveChannel({ fromUrl: params.get('channel'), stored: getStoredChannel(), hasStable });
  $('channel').hidden = !hasStable;
  setChannelButtons(channel);
  $('footer-build').textContent = `build ${meta.commit} · ${channel}`;
  $('request').href = requestSkillUrl(catalog.repo, '');
  $('channel').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-channel]');
    if (!b) return;
    storeChannel(b.dataset.channel);
    location.href = detailHref(id, b.dataset.channel);
  });

  const art = catalog.artifacts.find((a) => a.id === id);
  document.title = art ? `${displayName(art)} · catalog` : 'Artifact not found';
  if (!art) {
    root.innerHTML = tileHtml('not-found', { id });
    return;
  }
  const rec = art.channels[channel];
  if (!rec) {
    const other = channel === 'stable' ? 'latest' : 'stable';
    document.title = `${displayName(art)} · not in ${channel}`;
    root.innerHTML = tileHtml('not-in-stable', { switchUrl: detailHref(id, other, true) });
    return;
  }

  const pluginRec = art.type === 'plugin' ? rec : catalog.artifacts.find((a) => a.id === `${art.plugin}/plugin/${art.plugin}`)?.channels[channel];
  const dependencies = pluginRec?.dependencies ?? [];
  const requiredBy = art.type === 'plugin'
    ? catalog.artifacts.filter((a) => a.type === 'plugin' && a.channels[channel]?.dependencies?.some((d) => !d.marketplace && d.name === art.plugin)).map((a) => a.plugin)
    : [];
  const steps = installSteps({ repo: catalog.repo, plugin: art.plugin, channel, marketplace: catalog.channels[channel].marketplace, dependencies });
  const tags = rec.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join('');
  const bodyTitle = art.type === 'skill' ? 'SKILL.md' : art.type === 'plugin' ? 'README.md' : `${art.type} file`;
  root.innerHTML = `
<nav class="crumbs" aria-label="Breadcrumb"><a href="./">Catalog</a> / <span class="mono">${esc(art.plugin)}</span> / <span class="mono">${esc(displayName(art))}</span></nav>
<div class="dhead">
<div class="info">
<div class="meta"><span class="b b-${esc(art.type)}">${esc(art.type)}</span><span class="mono muted small">${esc(versionLabel(rec.version))} · ${esc(channel)}</span></div>
<h1>${esc(displayName(art))}</h1>
<p class="lead">${esc(rec.description)}</p>
<div class="tags">${tags}</div>
</div>
<div class="actions">
<a class="btn" href="${esc(sourceUrl(catalog.repo, rec))}">View source on GitHub</a>
<a class="btn" href="${esc(reportProblemUrl(catalog.repo, { id, version: rec.version, channel }))}">Report a problem</a>
</div>
</div>
<div class="cols">
<div class="col-main">
<section class="panel" id="install">${installHtml({ steps, plugin: art.plugin, ownerNote: art.type !== 'plugin' })}</section>
${rec.body ? `<section class="panel md" aria-label="Artifact body" id="body"><h2>${esc(bodyTitle)}</h2><div id="md">Loading…</div></section>` : ''}
</div>
<aside class="col-side">
${art.type === 'plugin' && (dependencies.length || requiredBy.length) ? `<section class="panel" id="deps">${dependenciesHtml({ dependencies, requiredBy, channel })}</section>` : ''}
<section class="panel">${tokensHtml(rec.tokens)}</section>
<section class="panel" aria-labelledby="sec">${securityHtml(rec)}</section>
<section class="panel"><h2>Source</h2><p class="mono small muted">${esc(`github.com/${catalog.repo}/blob/${rec.ref}/${rec.path}`)}</p></section>
</aside>
</div>`;

  $('copy').addEventListener('click', async () => {
    const text = steps.map((s) => s.command).join('\n');
    const ok = await copyText(text);
    if (!ok) { selectContents($('snippet')); $('snippet').focus(); }
    $('copy-status').textContent = ok ? 'Copied' : 'Clipboard is not available. Press Ctrl/Cmd+C to copy the selected text.';
  });
  $('snippet').addEventListener('focus', () => selectContents($('snippet')));

  if (rec.body) {
    try {
      $('md').innerHTML = render(await loadText(rec.body));
    } catch (e) {
      $('md').textContent = `Could not load the documentation (${e.message}).`;
    }
  }
}

main();
