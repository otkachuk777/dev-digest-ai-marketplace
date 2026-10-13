import test from 'node:test';
import assert from 'node:assert/strict';
import MiniSearch from 'minisearch';
import { searchOptions } from '../src/search-options.js';
import { buildSearchIndex } from '../build/searchindex.mjs';

const docs = [
  { id: 'p/skill/code-review', type: 'skill', name: 'code-review', plugin: 'p', description: 'Run a structured review of a diff.', tags: 'review git', body: 'Read the diff.' },
  { id: 'p/skill/notes', type: 'skill', name: 'notes', plugin: 'p', description: 'Take notes.', tags: 'docs', body: 'When you review a meeting, write notes about code review.' },
];

test('the serialized index loads with the shared options and ranks name above body', () => {
  const ms = MiniSearch.loadJSON(buildSearchIndex(docs), searchOptions);
  const res = ms.search('code review');
  assert.equal(res[0].id, 'p/skill/code-review');
  assert.equal(res[0].type, 'skill');
});

test('prefix and fuzzy matching find partial and misspelled words', () => {
  const ms = MiniSearch.loadJSON(buildSearchIndex(docs), searchOptions);
  assert.equal(ms.search('revi')[0].id, 'p/skill/code-review');
  assert.equal(ms.search('reviw').length > 0, true);
});
