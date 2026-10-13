import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { satisfies, compareVersions } from '../lib/common.mjs';
import { checkRepo } from '../check-release.mjs';
import { buildStable, toHttpsUrl } from '../build-stable.mjs';

const sh = (cwd, cmd, ...args) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, `${cmd} ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};
const write = (file, text) => {
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, text);
};
const json = (v) => `${JSON.stringify(v, null, 2)}\n`;

function addPlugin(root, name, version, dependencies = []) {
  const dir = join(root, 'plugins', name);
  write(join(dir, '.claude-plugin', 'plugin.json'), json({ name, version, description: `${name} plugin`, dependencies }));
  write(join(dir, 'README.md'), `# ${name}\n`);
  write(join(dir, 'CHANGELOG.md'), `# Changelog\n\n## ${version}\n- initial\n`);
  write(join(dir, 'COMPATIBILITY.md'), 'Claude Code >=2.1.110\n');
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mkt-'));
  const remote = mkdtempSync(join(tmpdir(), 'mkt-remote-'));
  sh(remote, 'git', 'init', '--bare', '-q');
  sh(root, 'git', 'init', '-q', '-b', 'main');
  sh(root, 'git', 'config', 'user.email', 'test@example.com');
  sh(root, 'git', 'config', 'user.name', 'Test');
  addPlugin(root, 'base', '1.0.0');
  addPlugin(root, 'app', '1.0.0', [{ name: 'base', version: '^1.0.0' }]);
  write(join(root, '.claude-plugin', 'marketplace.json'), json({
    name: 'demo',
    owner: { name: 'Owner' },
    plugins: [
      { name: 'base', source: './plugins/base' },
      { name: 'app', source: './plugins/app' },
    ],
  }));
  sh(root, 'git', 'add', '-A');
  sh(root, 'git', 'commit', '-q', '-m', 'init');
  sh(root, 'git', 'remote', 'add', 'origin', remote);
  sh(root, 'git', 'push', '-q', '-u', 'origin', 'main');
  return { root, remote };
}

test('satisfies handles exact, caret, tilde and >=', () => {
  assert.ok(satisfies('1.4.2', '^1.0.0'));
  assert.ok(!satisfies('2.0.0', '^1.0.0'));
  assert.ok(!satisfies('0.3.0', '^0.2.0'));
  assert.ok(satisfies('1.2.9', '~1.2.0'));
  assert.ok(!satisfies('1.3.0', '~1.2.0'));
  assert.ok(satisfies('1.0.0', '1.0.0'));
  assert.ok(satisfies('3.0.0', '>=2.0.0'));
  assert.ok(satisfies('1.0.0', '*'));
  assert.equal(compareVersions('1.10.0', '1.9.0'), 1);
});

test('toHttpsUrl normalises remotes', () => {
  assert.equal(toHttpsUrl('git@github.com:o/r.git'), 'https://github.com/o/r.git');
  assert.equal(toHttpsUrl('https://github.com/o/r'), 'https://github.com/o/r.git');
});

test('toHttpsUrl strips credentials from the remote URL', () => {
  const url = toHttpsUrl('https://user:ghp_SECRET@github.com/o/r.git');
  assert.equal(url, 'https://github.com/o/r.git');
  assert.ok(!/SECRET|user/.test(toHttpsUrl('https://x-access-token:ghp_SECRET@github.com/o/r')));
});

test('a consistent marketplace passes', () => {
  const { root } = fixture();
  const { errors } = checkRepo(root);
  assert.deepEqual(errors, []);
});

test('structural problems are reported', () => {
  const { root } = fixture();
  const file = join(root, '.claude-plugin', 'marketplace.json');
  const m = JSON.parse(readFileSync(file, 'utf8'));
  m.plugins[0].version = '1.0.0';
  write(file, json(m));
  write(join(root, 'plugins', 'app', 'CHANGELOG.md'), '# Changelog\n');
  write(join(root, 'plugins', 'base', '.claude-plugin', 'plugin.json'), json({ name: 'other', version: '2.0.0' }));
  const text = checkRepo(root).errors.join('\n');
  assert.match(text, /remove "version" from the marketplace entry/);
  assert.match(text, /CHANGELOG\.md has no "## 1\.0\.0" section/);
  assert.match(text, /manifest name "other" differs/);
  assert.match(text, /does not satisfy \^1\.0\.0/);
});

test('release requires released dependencies, a free tag and a clean main', () => {
  const { root } = fixture();
  let errors = checkRepo(root, { plugin: 'app' }).errors.join('\n');
  assert.match(errors, /no released tag of "base" satisfies \^1\.0\.0/);

  sh(root, 'git', 'tag', 'base--v1.0.0');
  assert.deepEqual(checkRepo(root, { plugin: 'app' }).errors, []);

  sh(root, 'git', 'tag', 'app--v1.0.0');
  errors = checkRepo(root, { plugin: 'app' }).errors.join('\n');
  assert.match(errors, /tag already exists/);

  write(join(root, 'dirty.txt'), 'x');
  assert.match(checkRepo(root, { plugin: 'base' }).errors.join('\n'), /working tree is not clean/);
});

test('release refuses HEAD that is not origin/main', () => {
  const { root } = fixture();
  write(join(root, 'note.txt'), 'x');
  sh(root, 'git', 'add', '-A');
  sh(root, 'git', 'commit', '-q', '-m', 'local only');
  assert.match(checkRepo(root, { plugin: 'base' }).errors.join('\n'), /HEAD is not origin\/main/);
});

test('build-stable pins entries to release tags', () => {
  const { root } = fixture();
  sh(root, 'git', 'tag', 'base--v1.0.0');
  const sha1 = sh(root, 'git', 'rev-parse', 'HEAD');
  addPlugin(root, 'base', '1.1.0');
  sh(root, 'git', 'add', '-A');
  sh(root, 'git', 'commit', '-q', '-m', 'base 1.1.0');
  sh(root, 'git', 'tag', 'base--v1.1.0');
  sh(root, 'git', 'tag', 'app--v1.0.0', sha1);

  const latest = buildStable(root);
  assert.equal(latest.name, 'demo-stable');
  const base = latest.plugins.find((p) => p.name === 'base');
  assert.equal(base.source.source, 'git-subdir');
  assert.equal(base.source.path, 'plugins/base');
  assert.equal(base.source.ref, 'base--v1.1.0');
  assert.match(base.source.sha, /^[0-9a-f]{40}$/);

  const pinned = buildStable(root, { pins: ['base@1.0.0'] });
  const old = pinned.plugins.find((p) => p.name === 'base');
  assert.equal(old.source.ref, 'base--v1.0.0');
  assert.equal(old.source.sha, sha1);

  assert.throws(() => buildStable(root, { pins: ['base@9.9.9'] }), /no released tag/);
});

test('--publish pushes a stable branch', () => {
  const { root, remote } = fixture();
  sh(root, 'git', 'tag', 'base--v1.0.0');
  sh(root, 'git', 'tag', 'app--v1.0.0');
  const cli = join(import.meta.dirname, '..', 'build-stable.mjs');
  sh(root, 'node', cli, '--publish');
  const published = JSON.parse(sh(remote, 'git', 'show', 'stable:.claude-plugin/marketplace.json'));
  assert.equal(published.name, 'demo-stable');
  assert.equal(published.plugins.length, 2);
  assert.match(sh(root, 'node', cli, '--publish'), /already up to date/);
});
