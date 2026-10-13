import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuard } from '../src/request-guard.js';

test('only the latest token is current', () => {
  const g = createGuard();
  const a = g.next();
  assert.equal(g.isCurrent(a), true);
  const b = g.next();
  assert.equal(g.isCurrent(a), false);
  assert.equal(g.isCurrent(b), true);
});
