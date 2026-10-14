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
import { createGuard, shouldIgnoreChannelClick } from './request-guard.js';

const $ = (id) => document.getElementById(id);
const state = { q: '', types: [], tag: '', plugin: '', channel: 'latest' };
const indexCache = new Map();
const channelGuard = createGuard();
let pendingChannel = null;
let catalog;
let meta;
let items = [];
let ms = null;
let statusTimer;

function say(text) {
  const el = $('status');
  el.textContent = text;
  el.classList.toggle('show', Boolean(text));
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { el.textContent = ''; el.classList.remove('show'); }, 4000);
}

async function indexFor(channel) {
  if (!indexCache.has(channel)) indexCache.set(channel, MiniSearch.loadJSON(await loadIndexText(channel), searchOptions));
  return indexCache.get(channel);
}

// Loads the index first, then commits all channel state at once. Returns false when
// a newer switch superseded this one (nothing is committed). Throws on load failure
// with the previous channel state untouched.
async function selectChannel(channel) {
  const token = channelGuard.next();
  const nextItems = viewItems(catalog, channel);
  const nextMs = nextItems.length ? await indexFor(channel) : null;
  if (!channelGuard.isCurrent(token)) return false;

  state.channel = channel;
  items = nextItems;
  ms = nextMs;
  const { tags, plugins } = facets(items);
  if (!tags.includes(state.tag)) state.tag = '';
  if (!plugins.includes(state.plugin)) state.plugin = '';
  const present = new Set(items.map((i) => i.type));
  state.types = state.types.filter((t) => present.has(t));
  fillSelect($('tag'), tags, 'any', state.tag);
  fillSelect($('plugin'), plugins, 'all', state.plugin);
  buildTypeChips(present);
  for (const b of $('channel').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.channel === channel));
  $('footer-build').textContent = `build ${meta.commit} · ${channel}`;
  $('eyebrow').textContent = `Catalog · ${items.length} artifact${items.length === 1 ? '' : 's'} · channel ${channel}`;
  return true;
}

function fillSelect(select, values, anyLabel, current) {
  select.innerHTML = `<option value="">${anyLabel}</option>${values.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('')}`;
  select.value = values.includes(current) ? current : '';
}

// Built once per channel; render() only flips aria-pressed so keyboard focus survives toggles.
function buildTypeChips(present) {
  $('types').innerHTML = TYPES.filter((t) => present.has(t))
    .map((t) => `<button class="chip" type="button" data-type="${t}" aria-pressed="false">${t}</button>`).join('');
}

function updateTypeChips() {
  for (const b of $('types').querySelectorAll('button[data-type]')) b.setAttribute('aria-pressed', String(state.types.includes(b.dataset.type)));
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
  updateTypeChips();
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

// All listeners are attached once at module start, before any await, so Retry works
// after a failed first load. Handlers that need data bail out while `catalog` is unset.
function bindOnce() {
  let timer;
  $('q').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => { if (!catalog) return; state.q = e.target.value; render(); syncUrl(false); }, 120);
  });
  $('search-form').addEventListener('submit', (e) => e.preventDefault());
  $('types').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-type]');
    if (!b || !catalog) return;
    const t = b.dataset.type;
    state.types = state.types.includes(t) ? state.types.filter((x) => x !== t) : [...state.types, t];
    render(); syncUrl(true);
  });
  $('tag').addEventListener('change', (e) => { if (!catalog) return; state.tag = e.target.value; render(); syncUrl(true); });
  $('plugin').addEventListener('change', (e) => { if (!catalog) return; state.plugin = e.target.value; render(); syncUrl(true); });
  $('channel').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-channel]');
    if (!b || !catalog || shouldIgnoreChannelClick(b.dataset.channel, pendingChannel, state.channel)) return;
    const channel = b.dataset.channel;
    pendingChannel = channel;
    try {
      if (!(await selectChannel(channel))) return;
    } catch (err) {
      say(`Could not switch to ${channel}: ${err.message}`);
      return;
    } finally {
      if (pendingChannel === channel) pendingChannel = null;
    }
    storeChannel(channel);
    render(); syncUrl(true);
  });
  $('results').addEventListener('click', async (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'retry') { init(); return; }
    if (!catalog) return;
    const copy = e.target.closest('button[data-copy]');
    if (copy) {
      const plugin = copy.dataset.copy;
      const text = installSteps({ repo: catalog.repo, plugin, channel: state.channel, marketplace: catalog.channels[state.channel].marketplace }).map((s) => s.command).join('\n');
      say((await copyText(text)) ? `Copied install snippet for ${plugin}` : 'Clipboard is not available. Open Details and copy the snippet by hand.');
      return;
    }
    if (action === 'clear') {
      state.q = ''; state.types = []; state.tag = ''; state.plugin = '';
      $('q').value = '';
      $('tag').value = ''; $('plugin').value = '';
      render(); syncUrl(true);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '/' && !/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName ?? '')) {
      e.preventDefault();
      $('q').focus();
    }
  });
  window.addEventListener('popstate', async () => {
    if (!catalog) return;
    const url = readState(location.search);
    Object.assign(state, { q: url.q, types: url.types, tag: url.tag, plugin: url.plugin });
    $('q').value = state.q;
    const channel = resolveChannel({ fromUrl: url.channel ?? 'latest', stored: null, hasStable: Boolean(catalog.channels.stable) });
    try {
      if (channel !== state.channel && !(await selectChannel(channel))) return;
    } catch (err) {
      say(`Could not switch to ${channel}: ${err.message}`);
    }
    $('tag').value = state.tag; $('plugin').value = state.plugin;
    render();
  });
}

async function init() {
  try {
    const [c, m] = await Promise.all([loadCatalog(), loadMeta()]);
    catalog = c; meta = m;
    const url = readState(location.search);
    Object.assign(state, { q: url.q, types: url.types, tag: url.tag, plugin: url.plugin });
    $('channel').hidden = !catalog.channels.stable;
    const channel = resolveChannel({ fromUrl: url.channel, stored: getStoredChannel(), hasStable: Boolean(catalog.channels.stable) });
    await selectChannel(channel);
    $('tag').value = state.tag; $('plugin').value = state.plugin;
    $('q').value = state.q;
    $('news-list').innerHTML = newsHtml(catalog.releases.slice(0, 10), '');
    render();
    syncUrl(false);
  } catch (e) {
    catalog = undefined;
    $('results').innerHTML = tileHtml('error', { message: e.message });
  }
}

bindOnce();
init();
