import MiniSearch from './vendor/minisearch.js';
import { searchOptions } from './search-options.js';
import { search } from './search.js';
import { readState, writeState, resolveChannel, TYPES } from './state.js';
import { viewItems, facets } from './data.js';
import { loadCatalog, loadMeta, loadIndexText, getStoredChannel, storeChannel } from './loader.js';
import { cardHtml, tileHtml, newsHtml } from './ui.js';
import { installSteps } from './snippets.js';
import { requestSkillUrl } from './issues.js';
import { copyText } from './clipboard.js';
import { esc } from './highlight.js';

const $ = (id) => document.getElementById(id);
const state = { q: '', types: [], tag: '', plugin: '', channel: 'latest' };
const indexCache = new Map();
let catalog;
let meta;
let items = [];
let ms = null;
let statusTimer;

function say(text) {
  const el = $('status');
  el.textContent = text;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { el.textContent = ''; }, 4000);
}

async function indexFor(channel) {
  if (!indexCache.has(channel)) indexCache.set(channel, MiniSearch.loadJSON(await loadIndexText(channel), searchOptions));
  return indexCache.get(channel);
}

async function selectChannel(channel) {
  state.channel = channel;
  items = viewItems(catalog, channel);
  ms = items.length ? await indexFor(channel) : null;
  const { tags, plugins } = facets(items);
  fillSelect($('tag'), tags, 'any', state.tag);
  fillSelect($('plugin'), plugins, 'all', state.plugin);
  if (!tags.includes(state.tag)) state.tag = '';
  if (!plugins.includes(state.plugin)) state.plugin = '';
  for (const b of $('channel').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.channel === channel));
  $('footer-build').textContent = `build ${meta.commit} · ${channel}`;
  $('eyebrow').textContent = `Catalog · ${items.length} artifact${items.length === 1 ? '' : 's'} · channel ${channel}`;
}

function fillSelect(select, values, anyLabel, current) {
  select.innerHTML = `<option value="">${anyLabel}</option>${values.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('')}`;
  select.value = values.includes(current) ? current : '';
}

function renderTypeChips() {
  const present = new Set(items.map((i) => i.type));
  $('types').innerHTML = TYPES.filter((t) => present.has(t))
    .map((t) => `<button class="chip" type="button" data-type="${t}" aria-pressed="${state.types.includes(t)}">${t}</button>`).join('');
}

function renderUnderstood(query) {
  const el = $('understood');
  if (!state.q.trim()) { el.innerHTML = ''; return; }
  const terms = query.terms.length ? `<span class="term mono">${esc(query.text)}</span>` : '<span class="term mono">no search terms</span>';
  const boost = query.typeBoost ? `<span>boost for type</span><span class="b b-${esc(query.typeBoost)}">${esc(query.typeBoost)}</span>` : '';
  el.innerHTML = `<span>Understood as</span>${terms}${boost}<span class="note">Matches run in your browser. No network call.</span>`;
}

function render() {
  $('request').href = requestSkillUrl(catalog.repo, state.q);
  renderTypeChips();
  if (items.length === 0) {
    $('results').innerHTML = tileHtml('empty', { requestUrl: requestSkillUrl(catalog.repo, '') });
    $('count').textContent = '0 results';
    $('understood').innerHTML = '';
    return;
  }
  const { query, hits } = search({ ms, items, query: state.q, filters: state });
  renderUnderstood(query);
  $('count').textContent = `${hits.length} result${hits.length === 1 ? '' : 's'}${query.terms.length ? ' · sorted by score' : ''}`;
  $('results').innerHTML = hits.length
    ? hits.map((h) => cardHtml(h.item, { terms: query.terms, channel: state.channel })).join('')
    : tileHtml('no-results', { query: state.q || 'these filters', requestUrl: requestSkillUrl(catalog.repo, state.q) });
}

function syncUrl(push) {
  const qs = writeState({ ...state, channel: state.channel });
  const url = `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`;
  if (push) history.pushState(null, '', url); else history.replaceState(null, '', url);
}

function bind() {
  let timer;
  $('q').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.q = e.target.value; render(); syncUrl(false); }, 120);
  });
  $('search-form').addEventListener('submit', (e) => e.preventDefault());
  $('types').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-type]');
    if (!b) return;
    const t = b.dataset.type;
    state.types = state.types.includes(t) ? state.types.filter((x) => x !== t) : [...state.types, t];
    render(); syncUrl(true);
  });
  $('tag').addEventListener('change', (e) => { state.tag = e.target.value; render(); syncUrl(true); });
  $('plugin').addEventListener('change', (e) => { state.plugin = e.target.value; render(); syncUrl(true); });
  $('channel').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-channel]');
    if (!b || b.dataset.channel === state.channel) return;
    storeChannel(b.dataset.channel);
    await selectChannel(b.dataset.channel);
    render(); syncUrl(true);
  });
  $('results').addEventListener('click', async (e) => {
    const copy = e.target.closest('button[data-copy]');
    if (copy) {
      const plugin = copy.dataset.copy;
      const text = installSteps({ repo: catalog.repo, plugin, channel: state.channel, marketplace: catalog.channels[state.channel].marketplace }).map((s) => s.command).join('\n');
      say((await copyText(text)) ? `Copied install snippet for ${plugin}` : 'Clipboard is not available. Open Details and copy the snippet by hand.');
      return;
    }
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'clear') {
      state.q = ''; state.types = []; state.tag = ''; state.plugin = '';
      $('q').value = '';
      $('tag').value = ''; $('plugin').value = '';
      render(); syncUrl(true);
    }
    if (action === 'retry') init();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName ?? '')) {
      e.preventDefault();
      $('q').focus();
    }
  });
  window.addEventListener('popstate', async () => {
    const url = readState(location.search);
    Object.assign(state, { q: url.q, types: url.types, tag: url.tag, plugin: url.plugin });
    $('q').value = state.q;
    const channel = resolveChannel({ fromUrl: url.channel ?? 'latest', stored: null, hasStable: Boolean(catalog.channels.stable) });
    if (channel !== state.channel) await selectChannel(channel);
    $('tag').value = state.tag; $('plugin').value = state.plugin;
    render();
  });
}

let bound = false;
async function init() {
  try {
    [catalog, meta] = await Promise.all([loadCatalog(), loadMeta()]);
    const url = readState(location.search);
    Object.assign(state, { q: url.q, types: url.types, tag: url.tag, plugin: url.plugin });
    $('channel').hidden = !catalog.channels.stable;
    const channel = resolveChannel({ fromUrl: url.channel, stored: getStoredChannel(), hasStable: Boolean(catalog.channels.stable) });
    await selectChannel(channel);
    $('tag').value = state.tag; $('plugin').value = state.plugin;
    $('q').value = state.q;
    $('news-list').innerHTML = newsHtml(catalog.releases.slice(0, 10), '');
    render();
    if (!bound) { bind(); bound = true; }
  } catch (e) {
    $('results').innerHTML = tileHtml('error', { message: e.message });
  }
}

init();
