import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuard, shouldIgnoreChannelClick } from '../src/request-guard.js';

test('shouldIgnoreChannelClick compares against the pending target first', () => {
  assert.equal(shouldIgnoreChannelClick('stable', null, 'stable'), true);
  assert.equal(shouldIgnoreChannelClick('latest', null, 'stable'), false);
  // committed latest, stable pending: clicking latest must go through
  assert.equal(shouldIgnoreChannelClick('latest', 'stable', 'latest'), false);
  assert.equal(shouldIgnoreChannelClick('stable', 'stable', 'latest'), true);
});

test('only the latest token is current', () => {
  const g = createGuard();
  const a = g.next();
  assert.equal(g.isCurrent(a), true);
  const b = g.next();
  assert.equal(g.isCurrent(a), false);
  assert.equal(g.isCurrent(b), true);
});
