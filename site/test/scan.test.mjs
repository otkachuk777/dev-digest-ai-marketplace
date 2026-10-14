import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { loadLatest, collectReleases } from '../build/sources.mjs';
import { buildCatalog } from '../build/catalog.mjs';
import { assertValidCatalog } from '../build/schema.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createFixtureRepo, FIXTURE_REPO } from '../dev/make-fixture-repo.mjs';
import { scanPlugin, splitList, normalizeDependencies } from '../build/scan.mjs';

test('splitList splits on commas outside parentheses and accepts arrays', () => {
  assert.deepEqual(splitList('Read, Grep, Bash(git diff:*, git log:*)'), ['Read', 'Grep', 'Bash(git diff:*, git log:*)']);
  assert.deepEqual(splitList(['a', ' b ']), ['a', 'b']);
  assert.deepEqual(splitList(undefined), []);
});

test('scanPlugin finds every artifact type in demo-plugin 1.1.0', () => {
  const { root, cleanup } = createFixtureRepo();
  try {
    const scan = scanPlugin({ dir: join(root, 'plugins/demo-plugin'), pluginPath: 'plugins/demo-plugin', entryName: 'demo-plugin' });
    assert.equal(scan.name, 'demo-plugin');
    assert.equal(scan.version, '1.1.0');
    assert.deepEqual(scan.problems, []);
    assert.deepEqual(scan.artifacts.map((a) => `${a.type}/${a.slug}`), [
      'plugin/demo-plugin', 'skill/code-review', 'agent/code-reviewer', 'command/review-pr', 'hook/pretooluse-1', 'mcp/github',
    ]);
    const skill = scan.artifacts.find((a) => a.type === 'skill');
    assert.deepEqual(skill.tags, ['review', 'git']);
    assert.deepEqual(skill.tools, ['Read', 'Grep', 'Bash(git diff:*)']);
    assert.equal(skill.path, 'plugins/demo-plugin/skills/code-review/SKILL.md');
    assert.equal(skill.tokens.always, Math.ceil(`${skill.name} ${skill.description}`.length / 4));
    assert.equal(skill.tokens.onInvoke, Math.ceil(skill.body.length / 4));
    const hook = scan.artifacts.find((a) => a.type === 'hook');
    assert.equal(hook.name, 'PreToolUse:Bash');
    assert.equal(hook.tokens, null);
    assert.deepEqual(scan.hooks, [{ event: 'PreToolUse', matcher: 'Bash', command: '${CLAUDE_PLUGIN_ROOT}/hooks/guard-diff.sh' }]);
    assert.deepEqual(scan.mcp, [{ name: 'github', command: 'npx -y @example/github-mcp' }]);
    assert.equal(scan.artifacts[0].type, 'plugin');
    assert.equal(scan.artifacts[0].tokens, null);
    assert.match(scan.readme, /Demo bundle/);
  } finally {
    cleanup();
  }
});

function withPlugin(manifest, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'scan-malformed-'));
  try {
    mkdirSync(join(dir, '.claude-plugin'), { recursive: true });
    writeFileSync(join(dir, '.claude-plugin', 'plugin.json'), JSON.stringify(manifest));
    fn(scanPlugin({ dir, pluginPath: 'plugins/p', entryName: 'p' }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('scanPlugin accepts string keywords', () => {
  withPlugin({ name: 'p', version: '1.0.0', keywords: 'Review, git' }, (scan) => {
    assert.deepEqual(scan.keywords, ['review', 'git']);
    assert.deepEqual(scan.artifacts[0].tags, ['review', 'git']);
  });
});

test('scanPlugin reports a missing name once, without a misleading entry-name problem', () => {
  withPlugin({ version: '1.0.0' }, (scan) => {
    assert.equal(scan.problems.filter((p) => p.rule === 'manifest').length, 1);
    assert.equal(scan.problems.filter((p) => p.rule === 'entry-name').length, 0);
  });
});

function tmpPlugin(files, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'scan-files-'));
  try {
    for (const [f, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, f)), { recursive: true });
      writeFileSync(join(dir, f), typeof text === 'string' ? text : JSON.stringify(text));
    }
    fn(scanPlugin({ dir, pluginPath: 'plugins/p', entryName: 'p' }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const MANIFEST = '.claude-plugin/plugin.json';
const hookGroup = (command) => [{ matcher: 'Bash', hooks: [{ type: 'command', command }] }];

test('inline manifest hooks are indexed (both shapes)', () => {
  tmpPlugin({ [MANIFEST]: { name: 'p', version: '1.0.0', hooks: { PreToolUse: hookGroup('a.sh') } } }, (scan) => {
    assert.deepEqual(scan.hooks, [{ event: 'PreToolUse', matcher: 'Bash', command: 'a.sh' }]);
    assert.equal(scan.artifacts.filter((a) => a.type === 'hook').length, 1);
  });
  tmpPlugin({ [MANIFEST]: { name: 'p', version: '1.0.0', hooks: { hooks: { Stop: [{ hooks: [{ command: 'b.sh' }] }] } } } }, (scan) => {
    assert.deepEqual(scan.hooks, [{ event: 'Stop', matcher: '', command: 'b.sh' }]);
  });
});

test('manifest hooks given as a path string or array of paths', () => {
  tmpPlugin({
    [MANIFEST]: { name: 'p', version: '1.0.0', hooks: ['./cfg/one.json', 'cfg/two.json'] },
    'cfg/one.json': { hooks: { Stop: [{ hooks: [{ command: 'one.sh' }] }] } },
    'cfg/two.json': { PostToolUse: hookGroup('two.sh') },
  }, (scan) => {
    assert.deepEqual(scan.hooks.map((h) => h.command), ['one.sh', 'two.sh']);
    assert.deepEqual(scan.problems, []);
  });
  tmpPlugin({
    [MANIFEST]: { name: 'p', version: '1.0.0', hooks: './cfg/one.json' },
    'cfg/one.json': { Stop: [{ hooks: [{ command: 'one.sh' }] }] },
  }, (scan) => assert.deepEqual(scan.hooks.map((h) => h.command), ['one.sh']));
});

test('inline and path-based manifest mcpServers are indexed', () => {
  tmpPlugin({ [MANIFEST]: { name: 'p', version: '1.0.0', mcpServers: { gh: { command: 'npx', args: ['-y', 'x'] }, web: { url: 'https://e.example/mcp' } } } }, (scan) => {
    assert.deepEqual(scan.mcp, [{ name: 'gh', command: 'npx -y x' }, { name: 'web', command: 'https://e.example/mcp' }]);
  });
  tmpPlugin({
    [MANIFEST]: { name: 'p', version: '1.0.0', mcpServers: './servers.json' },
    'servers.json': { mcpServers: { db: { command: 'db-mcp' } } },
  }, (scan) => assert.deepEqual(scan.mcp, [{ name: 'db', command: 'db-mcp' }]));
});

test('paths escaping the plugin dir are ignored with a problem', () => {
  tmpPlugin({ [MANIFEST]: { name: 'p', version: '1.0.0', hooks: '../x.json', mcpServers: '../y.json' } }, (scan) => {
    assert.deepEqual(scan.hooks, []);
    assert.deepEqual(scan.mcp, []);
    assert.equal(scan.problems.length, 2);
    assert.ok(scan.problems.every((p) => p.rule === 'json'));
    assert.match(scan.problems[0].message, /x\.json/);
    assert.match(scan.problems[1].message, /y\.json/);
  });
  tmpPlugin({ [MANIFEST]: { name: 'p', version: '1.0.0', hooks: './missing.json' } }, (scan) => {
    assert.equal(scan.problems.filter((p) => p.rule === 'json').length, 1);
  });
});

test('identical hooks and mcp servers from file and manifest are deduped', () => {
  tmpPlugin({
    [MANIFEST]: { name: 'p', version: '1.0.0', hooks: { PreToolUse: hookGroup('a.sh') }, mcpServers: { gh: { command: 'npx' } } },
    'hooks/hooks.json': { hooks: { PreToolUse: hookGroup('a.sh') } },
    '.mcp.json': { mcpServers: { gh: { command: 'npx' } } },
  }, (scan) => {
    assert.equal(scan.hooks.length, 1);
    assert.equal(scan.mcp.length, 1);
    assert.equal(scan.artifacts.filter((a) => a.type === 'hook' || a.type === 'mcp').length, 2);
  });
});

const FM = '---\ndescription: d\n---\nbody\n';

test('file and directory names are slugified into valid ids', () => {
  tmpPlugin({
    [MANIFEST]: { name: 'p', version: '1.0.0' },
    'agents/code reviewer.md': FM,
    'skills/my skill/SKILL.md': '---\nname: my skill\ndescription: d\n---\nbody\n',
    'commands/Run Tests!.md': FM,
  }, (scan) => {
    const slugs = scan.artifacts.map((a) => `${a.type}/${a.slug}`);
    assert.deepEqual(slugs, ['plugin/p', 'skill/my-skill', 'agent/code-reviewer', 'command/run-tests']);
    assert.equal(scan.artifacts.find((a) => a.type === 'agent').name, 'code reviewer');
    assert.ok(scan.artifacts.every((a) => /^[A-Za-z0-9._-]+$/.test(a.slug)));
  });
});

test('slug collisions are suffixed and reported, never thrown', () => {
  tmpPlugin({ [MANIFEST]: { name: 'p', version: '1.0.0' }, 'agents/Git Hub.md': FM, 'agents/git-hub.md': FM }, (scan) => {
    const slugs = scan.artifacts.filter((a) => a.type === 'agent').map((a) => a.slug).sort();
    assert.deepEqual(slugs, ['git-hub', 'git-hub-2']);
    const clash = scan.problems.filter((p) => p.rule === 'name');
    assert.equal(clash.length, 1);
    assert.match(clash[0].file, /^plugins\/p\/agents\/.+\.md$/);
    assert.match(clash[0].message, /^slug "git-hub" collides with plugins\/p\/agents\//);
  });
});

test('an uppercase plugin name passes the catalog schema', () => {
  const { root, cleanup } = createFixtureRepo();
  try {
    const latest = loadLatest({ repoRoot: root });
    const { catalog } = buildCatalog({ repo: FIXTURE_REPO, latest, stable: null, releases: collectReleases(root, latest.plugins) });
    for (const a of catalog.artifacts) a.id = a.id.replace('demo-plugin/', 'MyPlugin/');
    assertValidCatalog(catalog);
  } finally {
    cleanup();
  }
});

test('normalizeDependencies accepts strings and objects and drops junk', () => {
  assert.deepEqual(normalizeDependencies([
    'a', 'b@other', { name: 'c', version: '^1.0.0' }, { name: 'd', version: '~2.1.0', marketplace: 'other' }, { name: '' }, 7, null,
  ]), [
    { name: 'a', range: '*', marketplace: null },
    { name: 'b', range: '*', marketplace: 'other' },
    { name: 'c', range: '^1.0.0', marketplace: null },
    { name: 'd', range: '~2.1.0', marketplace: 'other' },
  ]);
  assert.deepEqual(normalizeDependencies(undefined), []);
  assert.deepEqual(normalizeDependencies('a'), []);
});

test('scanPlugin reads dependencies from plugin.json', () => {
  withPlugin({ name: 'p', version: '1.0.0', dependencies: [{ name: 'base', version: '^1.0.0' }] }, (scan) => {
    assert.deepEqual(scan.dependencies, [{ name: 'base', range: '^1.0.0', marketplace: null }]);
  });
  withPlugin({ name: 'p', version: '1.0.0' }, (scan) => assert.deepEqual(scan.dependencies, []));
});
