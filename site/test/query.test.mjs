import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuery } from '../src/query.js';

test('strips filler words and extracts the type boost', () => {
  assert.deepEqual(parseQuery('I need a skill for code review'), { terms: ['code', 'review'], text: 'code review', typeBoost: 'skill' });
});

test('plural and uppercase type words map to the singular type', () => {
  assert.equal(parseQuery('Agents for testing').typeBoost, 'agent');
  assert.equal(parseQuery('mcp servers').typeBoost, 'mcp');
});

test('a query of only filler and type words has no terms but keeps the boost', () => {
  assert.deepEqual(parseQuery('I need a skill'), { terms: [], text: '', typeBoost: 'skill' });
  assert.deepEqual(parseQuery('   '), { terms: [], text: '', typeBoost: null });
  assert.deepEqual(parseQuery(undefined), { terms: [], text: '', typeBoost: null });
});

test('keeps slash commands and strips regex-ish punctuation', () => {
  assert.deepEqual(parseQuery('/review-pr').terms, ['review-pr']);
  assert.deepEqual(parseQuery('c++ (test [').terms, ['c', 'test']);
});
