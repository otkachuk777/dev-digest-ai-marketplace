import test from 'node:test';
import assert from 'node:assert/strict';
import MiniSearch from 'minisearch';
import { searchOptions } from '../src/search-options.js';
import { search } from '../src/search.js';

const docs = [
  { id: 'p/skill/code-review', type: 'skill', name: 'code-review', plugin: 'p', description: 'Structured review of a diff.', tags: 'review git', body: '' },
  { id: 'p/agent/code-reviewer', type: 'agent', name: 'code-reviewer', plugin: 'p', description: 'Read-only review agent.', tags: 'review', body: '' },
  { id: 'p/skill/notes', type: 'skill', name: 'notes', plugin: 'p', description: 'Take notes.', tags: 'docs', body: '' },
  { id: 'q/hook/pretooluse-1', type: 'hook', name: 'PreToolUse:Bash', plugin: 'q', description: 'Guards bash.', tags: 'safety', body: '' },
];
const items = docs.map((d) => ({ ...d, tags: d.tags.split(' '), version: '1.0.0', tokens: null }));
const ms = new MiniSearch(searchOptions);
ms.addAll(docs);

test('a natural-language query finds review artifacts and boosts the named type', () => {
  const { query, hits } = search({ ms, items, query: 'I need a skill for code review', filters: {} });
  assert.equal(query.typeBoost, 'skill');
  assert.equal(hits[0].item.id, 'p/skill/code-review');
  assert.ok(hits.some((h) => h.item.id === 'p/agent/code-reviewer'));
});

test('only filler and type words lists that type first, not "no results"', () => {
  const { hits } = search({ ms, items, query: 'I need a skill', filters: {} });
  assert.equal(hits.length, items.length);
  assert.deepEqual(hits.slice(0, 2).map((h) => h.item.type), ['skill', 'skill']);
});

test('an empty query lists everything', () => {
  assert.equal(search({ ms, items, query: '', filters: {} }).hits.length, 4);
});

test('filters apply after search: type, tag and plugin', () => {
  assert.deepEqual(search({ ms, items, query: 'review', filters: { types: ['agent'] } }).hits.map((h) => h.item.id), ['p/agent/code-reviewer']);
  assert.ok(search({ ms, items, query: '', filters: { tag: 'safety' } }).hits.every((h) => h.item.tags.includes('safety')));
  assert.ok(search({ ms, items, query: '', filters: { plugin: 'q' } }).hits.every((h) => h.item.plugin === 'q'));
});

const hostile = ['c++ (test', '[', '\\', '<img onerror=x>', '*', '(((', '-', '_', '--'];

test('hostile queries do not throw', () => {
  for (const q of hostile) {
    assert.doesNotThrow(() => search({ ms, items, query: q, filters: {} }));
  }
});

test('raw hostile strings do not throw MiniSearch directly', () => {
  for (const q of hostile) assert.doesNotThrow(() => ms.search(q), q);
});

test('symbol-only queries behave like an empty query', () => {
  for (const q of ['-', '_', '--']) {
    assert.equal(search({ ms, items, query: q, filters: {} }).hits.length, items.length, q);
  }
});

test('type boost decides ties between otherwise identical artifacts', () => {
  const twin = (type) => ({ id: `p/${type}/twin`, type, name: 'twin', plugin: 'p', description: 'Review helper.', tags: 'review', body: '' });
  const tdocs = [twin('agent'), twin('skill')];
  const titems = tdocs.map((d) => ({ ...d, tags: d.tags.split(' '), version: '1.0.0', tokens: null }));
  const tms = new MiniSearch(searchOptions);
  tms.addAll(tdocs);
  const boosted = search({ ms: tms, items: titems, query: 'skill review', filters: {} });
  assert.equal(boosted.hits[0].item.type, 'skill');
  const plain = search({ ms: tms, items: titems, query: 'review', filters: {} });
  assert.equal(plain.hits[0].score, plain.hits[1].score);
});
