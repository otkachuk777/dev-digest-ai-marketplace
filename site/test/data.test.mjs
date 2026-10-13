import test from 'node:test';
import assert from 'node:assert/strict';
import { viewItems, facets, displayName, tokenLabel, versionLabel } from '../src/data.js';

const rec = (v, tags = ['a']) => ({ version: v, description: 'd', tags, tokens: { always: 5, onInvoke: 9 } });
const catalog = { artifacts: [
  { id: 'p/skill/x', type: 'skill', name: 'x', plugin: 'p', channels: { latest: rec('1.1.0', ['b', 'a']), stable: rec('1.0.0') } },
  { id: 'p/command/y', type: 'command', name: 'y', plugin: 'p', channels: { latest: rec('1.1.0') } },
] };

test('viewItems returns only artifacts present in the channel', () => {
  assert.equal(viewItems(catalog, 'latest').length, 2);
  const s = viewItems(catalog, 'stable');
  assert.deepEqual(s.map((i) => [i.id, i.version]), [['p/skill/x', '1.0.0']]);
});

test('facets collect sorted unique tags and plugins', () => {
  assert.deepEqual(facets(viewItems(catalog, 'latest')), { tags: ['a', 'b'], plugins: ['p'] });
});

test('labels', () => {
  assert.equal(displayName({ type: 'command', name: 'y' }), '/y');
  assert.equal(displayName({ type: 'skill', name: 'x' }), 'x');
  assert.equal(tokenLabel({ always: 42 }), '≈42 tokens always');
  assert.equal(tokenLabel(null), 'tokens n/a');
  assert.equal(versionLabel('1.1.0'), 'v1.1.0');
  assert.equal(versionLabel(null), 'n/a');
});
