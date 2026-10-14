import test from 'node:test';
import assert from 'node:assert/strict';
import { readState, writeState, resolveChannel } from '../src/state.js';

test('readState and writeState round-trip', () => {
  const s = { q: 'code review', types: ['skill', 'agent'], tag: 'git', plugin: 'demo-plugin', channel: 'stable' };
  assert.deepEqual(readState(`?${writeState(s)}`), s);
});

test('defaults write an empty string and unknown types are dropped', () => {
  assert.equal(writeState({ q: '', types: [], tag: '', plugin: '', channel: null }), '');
  assert.deepEqual(readState('?type=skill,bogus').types, ['skill']);
  assert.equal(readState('').channel, null);
});

test('readState keeps an explicit latest channel; writeState still omits it', () => {
  assert.equal(readState('?channel=latest').channel, 'latest');
  assert.equal(readState('?channel=stable').channel, 'stable');
  assert.equal(readState('?channel=other').channel, null);
  assert.equal(writeState({ q: '', types: [], tag: '', plugin: '', channel: 'latest' }), '');
});

test('resolveChannel falls back to latest when stable is unavailable', () => {
  assert.equal(resolveChannel({ fromUrl: 'stable', stored: null, hasStable: false }), 'latest');
  assert.equal(resolveChannel({ fromUrl: 'stable', stored: null, hasStable: true }), 'stable');
  assert.equal(resolveChannel({ fromUrl: null, stored: 'stable', hasStable: true }), 'stable');
  assert.equal(resolveChannel({ fromUrl: null, stored: null, hasStable: true }), 'latest');
  assert.equal(resolveChannel({ fromUrl: 'latest', stored: 'stable', hasStable: true }), 'latest');
});
