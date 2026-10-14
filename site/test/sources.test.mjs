import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFixtureRepo } from '../dev/make-fixture-repo.mjs';
import { loadLatest, loadStable, collectReleases } from '../build/sources.mjs';
import { listReleases } from '../build/releases.mjs';

test('loadLatest reads main with six artifacts and a clean validation', () => {
  const { root, cleanup } = createFixtureRepo();
  try {
    const latest = loadLatest({ repoRoot: root });
    assert.equal(latest.channel, 'latest');
    assert.equal(latest.marketplace, 'dev-digest-ai-marketplace');
    assert.equal(latest.ref, 'main');
    const [p] = latest.plugins;
    assert.equal(p.version, '1.1.0');
    assert.equal(p.indexed, true);
    assert.equal(p.artifacts.length, 6);
    assert.deepEqual(p.validation, { passed: 6, total: 6, failures: [] });
    assert.equal(p.lastChange, '2026-10-14');
  } finally { cleanup(); }
});

test('loadStable reads pinned tags through git archive', () => {
  const { root, cleanup } = createFixtureRepo();
  const work = mkdtempSync(join(tmpdir(), 'work-'));
  try {
    const stable = loadStable({ repoRoot: root, ref: 'stable', workDir: work });
    assert.equal(stable.channel, 'stable');
    assert.equal(stable.marketplace, 'dev-digest-ai-marketplace-stable');
    const [p] = stable.plugins;
    assert.equal(p.version, '1.0.0');
    assert.equal(p.tag, 'demo-plugin--v1.0.0');
    assert.deepEqual(p.artifacts.map((a) => a.type), ['plugin', 'skill']);
    assert.equal(p.lastChange, '2026-10-09');
  } finally { cleanup(); rmSync(work, { recursive: true, force: true }); }
});

test('loadStable returns null when the stable ref does not exist', () => {
  const { root, cleanup } = createFixtureRepo({ stable: false });
  const work = mkdtempSync(join(tmpdir(), 'work-'));
  try {
    assert.equal(loadStable({ repoRoot: root, ref: 'stable', workDir: work }), null);
    assert.equal(loadStable({ repoRoot: root, ref: 'origin/stable', workDir: work }), null);
  } finally { cleanup(); rmSync(work, { recursive: true, force: true }); }
});

test('loadStable fails with a fetch hint when a pinned commit is missing', () => {
  const { root, cleanup } = createFixtureRepo();
  const work = mkdtempSync(join(tmpdir(), 'work-'));
  try {
    // rewrite the stable branch so it points at a sha that does not exist
    const git = (...a) => spawnSync('git', a, { cwd: root, encoding: 'utf8' });
    const shown = git('show', 'stable:.claude-plugin/marketplace.json');
    const mp = JSON.parse(shown.stdout);
    mp.plugins[0].source.sha = 'a'.repeat(40);
    git('checkout', '-q', 'stable');
    writeFileSync(join(root, '.claude-plugin/marketplace.json'), JSON.stringify(mp));
    git('-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', '-c', 'user.name=T', '-c', 'user.email=t@e.x', 'commit', '-qam', 'bad pin');
    git('checkout', '-q', 'main');
    assert.throws(() => loadStable({ repoRoot: root, ref: 'stable', workDir: work }), /git archive .* failed.*fetch/s);
  } finally { cleanup(); rmSync(work, { recursive: true, force: true }); }
});

test('listReleases and collectReleases read tags newest first', () => {
  const { root, cleanup } = createFixtureRepo();
  try {
    const rel = listReleases(root, { name: 'demo-plugin', path: 'plugins/demo-plugin' });
    assert.deepEqual(rel.map((r) => r.version), ['1.1.0', '1.0.0']);
    assert.equal(rel[0].tag, 'demo-plugin--v1.1.0');
    assert.equal(rel[0].summary, 'Add code-reviewer agent.');
    assert.equal(rel[1].summary, 'First release.');
    assert.match(rel[0].date, /^2026-10-14T/);
    const all = collectReleases(root, loadLatest({ repoRoot: root }).plugins);
    assert.equal(all.length, 2);
  } finally { cleanup(); }
});
