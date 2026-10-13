import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateTokens } from '../build/lib/tokens.mjs';

test('estimateTokens is ceil(chars / 4)', () => {
  assert.equal(estimateTokens(''), 0);
  assert.equal(estimateTokens(undefined), 0);
  assert.equal(estimateTokens('abcd'), 1);
  assert.equal(estimateTokens('abcde'), 2);
});
