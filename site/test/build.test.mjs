import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFixtureRepo, FIXTURE_REPO } from '../dev/make-fixture-repo.mjs';
import { build } from '../build/index.mjs';

const read = (out, f) => readFileSync(join(out, f), 'utf8');

test('build writes the full data set for the fixture repo', () => {
  const { root, cleanup } = createFixtureRepo();
  const out = mkdtempSync(join(tmpdir(), 'dist-'));
  try {
    const r = build({ repoRoot: root, stableRef: 'stable', repo: FIXTURE_REPO, out });
    assert.deepEqual(r, { artifacts: 6, stable: true });
    for (const f of ['catalog.json', 'search-latest.json', 'search-stable.json', 'feed.xml', 'meta.json',
      'vendor/minisearch.js', 'vendor/marked.js', 'vendor/purify.js', 'fonts/geist-latin-400-normal.woff2',
      'bodies/latest/demo-plugin__skill__code-review.md', 'bodies/stable/demo-plugin__skill__code-review.md', 'search-options.js']) {
      assert.ok(existsSync(join(out, f)), `missing ${f}`);
    }
    const meta = JSON.parse(read(out, 'meta.json'));
    assert.equal(meta.repo, FIXTURE_REPO);
    assert.equal(meta.siteUrl, 'https://otkachuk777.github.io/dev-digest-ai-marketplace/');
    assert.match(meta.commit, /^[0-9a-f]{7,}$/);
    assert.doesNotMatch(read(out, 'vendor/minisearch.js'), /sourceMappingURL/);
    assert.match(read(out, 'feed.xml'), /demo-plugin 1\.1\.0/);
  } finally { cleanup(); rmSync(out, { recursive: true, force: true }); }
});

test('build works for an empty marketplace and without a stable branch', () => {
  const { root, cleanup } = createFixtureRepo({ empty: true });
  const out = mkdtempSync(join(tmpdir(), 'dist-'));
  try {
    const r = build({ repoRoot: root, stableRef: 'origin/stable', repo: FIXTURE_REPO, out });
    assert.deepEqual(r, { artifacts: 0, stable: false });
    assert.ok(!existsSync(join(out, 'search-stable.json')));
    assert.deepEqual(JSON.parse(read(out, 'catalog.json')).artifacts, []);
  } finally { cleanup(); rmSync(out, { recursive: true, force: true }); }
});

test('build fails when the latest channel does not validate', () => {
  const { root, cleanup } = createFixtureRepo();
  const out = mkdtempSync(join(tmpdir(), 'dist-'));
  try {
    writeBroken(root);
    assert.throws(() => build({ repoRoot: root, stableRef: 'none', repo: FIXTURE_REPO, out }), /Latest channel failed validation[\s\S]*\[changelog\]/);
  } finally { cleanup(); rmSync(out, { recursive: true, force: true }); }
});

function writeBroken(root) {
  rmSync(join(root, 'plugins/demo-plugin/CHANGELOG.md'));
}
