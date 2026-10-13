import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFixtureRepo, FIXTURE_REPO } from '../dev/make-fixture-repo.mjs';
import { loadLatest, loadStable, collectReleases } from '../build/sources.mjs';
import { buildCatalog, bodyFile } from '../build/catalog.mjs';
import { assertValidCatalog } from '../build/schema.mjs';

function fixtureCatalog(opts) {
  const { root, cleanup } = createFixtureRepo(opts);
  const work = mkdtempSync(join(tmpdir(), 'work-'));
  try {
    const latest = loadLatest({ repoRoot: root });
    const stable = loadStable({ repoRoot: root, ref: 'stable', workDir: work });
    const releases = collectReleases(root, latest.plugins);
    return buildCatalog({ repo: FIXTURE_REPO, latest, stable, releases });
  } finally { cleanup(); rmSync(work, { recursive: true, force: true }); }
}

test('bodyFile flattens slashes', () => {
  assert.equal(bodyFile('latest', 'p/skill/x'), 'bodies/latest/p__skill__x.md');
});

test('catalog merges both channels and validates against the schema', () => {
  const { catalog, bodies, searchDocs } = fixtureCatalog();
  assertValidCatalog(catalog);
  assert.equal(catalog.artifacts.length, 6);
  assert.deepEqual(catalog.channels, {
    latest: { marketplace: 'dev-digest-ai-marketplace', ref: 'main' },
    stable: { marketplace: 'dev-digest-ai-marketplace-stable', ref: 'stable' },
  });
  const skill = catalog.artifacts.find((a) => a.id === 'demo-plugin/skill/code-review');
  assert.equal(skill.channels.latest.version, '1.1.0');
  assert.equal(skill.channels.stable.version, '1.0.0');
  assert.equal(skill.channels.stable.ref, 'demo-plugin--v1.0.0');
  assert.equal(skill.channels.latest.body, 'bodies/latest/demo-plugin__skill__code-review.md');
  assert.ok(bodies.has('bodies/stable/demo-plugin__skill__code-review.md'));
  const agent = catalog.artifacts.find((a) => a.type === 'agent');
  assert.equal(agent.channels.stable, undefined);
  assert.equal(searchDocs.latest.length, 6);
  assert.equal(searchDocs.stable.length, 2);
});

test('plugin tokens are the sum of skills, agents and commands; hooks have none', () => {
  const { catalog } = fixtureCatalog();
  const get = (id) => catalog.artifacts.find((a) => a.id === id).channels.latest;
  const sum = ['skill/code-review', 'agent/code-reviewer', 'command/review-pr'].reduce((n, k) => n + get(`demo-plugin/${k}`).tokens.always, 0);
  assert.equal(get('demo-plugin/plugin/demo-plugin').tokens.always, sum);
  assert.equal(get('demo-plugin/hook/pretooluse-1').tokens, null);
  assert.equal(get('demo-plugin/hook/pretooluse-1').declared.hooks[0].command, '${CLAUDE_PLUGIN_ROOT}/hooks/guard-diff.sh');
  assert.deepEqual(get('demo-plugin/skill/code-review').declared.tools, ['Read', 'Grep', 'Bash(git diff:*)']);
});

test('empty marketplace gives an empty valid catalog', () => {
  const { catalog } = fixtureCatalog({ empty: true });
  assertValidCatalog(catalog);
  assert.deepEqual(catalog.artifacts, []);
  assert.equal(catalog.channels.stable, null);
});

test('duplicate ids fail the build', () => {
  const dupe = { type: 'skill', slug: 'x', name: 'x', description: 'd', tags: [], body: '', path: 'p', tools: [], tokens: { always: 1, onInvoke: 1 } };
  const plugin = { name: 'p', version: '1.0.0', artifacts: [dupe, dupe], hooks: [], mcp: [], indexed: true, validation: null, lastChange: null, tag: null };
  assert.throws(() => buildCatalog({ repo: 'o/r', latest: { channel: 'latest', marketplace: 'm', ref: 'main', plugins: [plugin] }, stable: null, releases: [] }), /Duplicate artifact id "p\/skill\/x"/);
});

test('schema rejects a malformed catalog', () => {
  assert.throws(() => assertValidCatalog({ schema: 1 }), /catalog.json is invalid/);
});
