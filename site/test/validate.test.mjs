import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createFixtureRepo } from '../dev/make-fixture-repo.mjs';
import { scanPlugin } from '../build/scan.mjs';
import { evaluate, RULES } from '../build/validate.mjs';

function plugin(files) {
  const dir = mkdtempSync(join(tmpdir(), 'plugin-'));
  for (const [f, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    writeFileSync(join(dir, f), text);
  }
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
const manifest = (extra = {}) => JSON.stringify({ name: 'p', version: '1.0.0', description: 'd', ...extra });
const good = { '.claude-plugin/plugin.json': manifest(), 'CHANGELOG.md': '## 1.0.0\n- x\n' };
const run = (files, entryName = 'p') => {
  const p = plugin(files);
  try { return evaluate(scanPlugin({ dir: p.dir, pluginPath: 'plugins/p', entryName })); } finally { p.cleanup(); }
};

test('there are six rules', () => assert.equal(RULES.length, 6));

test('the fixture plugin passes all rules', () => {
  const { root, cleanup } = createFixtureRepo();
  try {
    const r = evaluate(scanPlugin({ dir: join(root, 'plugins/demo-plugin'), pluginPath: 'plugins/demo-plugin', entryName: 'demo-plugin' }));
    assert.deepEqual(r, { passed: 6, total: 6, failures: [] });
  } finally { cleanup(); }
});

test('missing manifest fails the manifest rule', () => {
  const r = run({ 'CHANGELOG.md': '## 1.0.0\n' });
  assert.equal(r.passed, 5);
  assert.match(r.failures[0], /^\[manifest\]/);
});

test('entry name mismatch fails entry-name', () => {
  assert.match(run(good, 'other').failures.join('\n'), /\[entry-name\]/);
});

test('skill without description fails description; name mismatch fails name', () => {
  const r = run({ ...good, 'skills/x/SKILL.md': '---\nname: y\n---\nbody' });
  const text = r.failures.join('\n');
  assert.match(text, /\[description\]/);
  assert.match(text, /\[name\]/);
});

test('changelog without the version section fails changelog', () => {
  assert.match(run({ ...good, 'CHANGELOG.md': '## 0.9.0\n' }).failures.join('\n'), /\[changelog\]/);
  assert.match(run({ '.claude-plugin/plugin.json': manifest() }).failures.join('\n'), /CHANGELOG.md is missing/);
});

test('broken hooks.json fails json', () => {
  assert.match(run({ ...good, 'hooks/hooks.json': '{nope' }).failures.join('\n'), /\[json\]/);
});
