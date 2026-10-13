# Pages Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static, backend-free catalog site for the marketplace on GitHub Pages: natural-language search over every plugin, skill, agent, command, hook and MCP server, with install snippets, token cost, latest/stable channels, a security panel and a releases feed.

**Architecture:** A Node build step (in `site/build/`) reads the repo at build time (`main` working tree for `latest`, pinned release tags listed in the `stable` branch for `stable`), produces `catalog.json`, per-channel MiniSearch indexes, markdown bodies, `feed.xml` and `meta.json`. A vanilla-JS client (in `site/src/`) loads those static files and does all search, filtering and rendering in the browser. A GitHub Actions workflow builds and deploys `site/dist` to Pages. **Everything lives under `site/` and nothing in it imports from `scripts/`**, so the catalog stays separate from the marketplace and can be moved out later.

**Tech Stack:** Node 22, ES modules, `node:test`, MiniSearch, marked, DOMPurify (all vendored into `dist/vendor`), Geist fonts via `@fontsource` (self-hosted), ajv + jsdom for tests only.

**Spec:** `docs/superpowers/specs/2026-10-14-pages-catalog-design.md` (already on `main` via PR #2). Plan-phase amendments to the spec are in Task 1.
**Design:** Claude Design canvas `https://claude.ai/artifact/BRG2mPCg2wCgNre7pX3Rek` (screens: search, detail, mobile 390 px, states, dark).

## Global Constraints

- Hosting: GitHub Pages, static files only, no backend, no secrets, no cookies, no analytics.
- Site URL: `https://otkachuk777.github.io/dev-digest-ai-marketplace/`. All links and fetches are **relative** (site is served under `/dev-digest-ai-marketplace/`).
- Language: UI, descriptions and queries English only. No synonym dictionary.
- Stack: vanilla JS (ES modules) + Node build scripts. Runtime libs MiniSearch, marked, DOMPurify are copied into `dist/vendor/`, no CDN at runtime.
- Token estimate: `ceil(chars / 4)`, always shown with a `≈` prefix and the footnote "≈ = characters / 4. A real tokenizer may differ by 10-20%."
- Channels: `latest` = `main`; `stable` = branch `stable` whose only file is `.claude-plugin/marketplace.json` (name `<marketplace>-stable`) with `git-subdir` entries pinned to tags `<plugin>--v<version>`.
- CSP on every page: `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'`. Therefore **no inline scripts, no `style="…"` attributes, no external fonts**.
- Markdown from artifacts is untrusted: marked then DOMPurify, links get `rel="noopener noreferrer"`.
- Accessibility: semantic HTML, labelled inputs, visible focus, `aria-live="polite"` on result count and copy status, touch targets ≥ 44 px, AA contrast in light and dark (`prefers-color-scheme`), works at 360 px width.
- Do not touch `scripts/`, `plugins/` or `.claude-plugin/` (marketplace files).
- Commits: Conventional Commits, end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Work on branch `feat/pages-catalog`, merge by PR (direct pushes to `main` are not allowed).

## Review Focus

Failure modes the spec implies but a feature-by-feature reading would miss. Each is pinned by a test in the named task.

1. **Empty marketplace** (`plugins: []`, today's real state): build must succeed and the UI must show "No plugins published yet", not crash. (Task 8 build test, Task 10 `emptyHtml`.)
2. **Query made only of filler and type words** ("I need a skill", "hooks"): must list artifacts of that type first, never "No results". (Task 9 `search` test.)
3. **Regex and HTML metacharacters in the query or in artifact text** (`c++ (test`, `[`, `<img onerror>` in a description): no exception, no raw HTML in the DOM. (Task 9 `highlight`/`ui`/`markdown` tests.)
4. **Channel mismatches**: `?channel=stable` with no `stable` branch, an artifact only in `latest`, a `stable` pin whose commit is missing locally: fall back to latest / show "Not available in stable" / fail the build with a message that says to fetch tags. (Task 5, Task 9 `resolveChannel`, Task 11.)
5. **Hostile artifact content in the security panel** (hook command with `<script>`, MCP command with quotes): shown as escaped text only. (Task 11 `securityHtml` test.)

---

## File Structure

```
site/
  package.json  package-lock.json  README.md
  build/
    index.mjs          # build(): orchestrates everything, CLI entry
    scan.mjs           # scanPlugin(): one plugin dir -> artifacts + problems
    validate.mjs       # RULES, evaluate(): 6 build-time checks
    sources.mjs        # loadLatest, loadStable, collectReleases, lastChangeDate
    releases.mjs       # listReleases(): tags -> release entries
    catalog.mjs        # buildCatalog(): channels merged, bodies, search docs
    catalog.schema.json
    schema.mjs         # assertValidCatalog()
    searchindex.mjs    # buildSearchIndex()
    feed.mjs           # buildAtom()
    vendor.mjs         # copyVendor(): libs + fonts into dist
    lib/ semver.mjs git.mjs tokens.mjs frontmatter.mjs changelog.mjs
  src/                 # copied verbatim into dist/
    index.html artifact.html style.css
    app.js artifact.js loader.js
    search-options.js query.js search.js state.js data.js
    snippets.js issues.js highlight.js markdown.js clipboard.js ui.js
  dev/
    make-fixture-repo.mjs   # git repo with demo-plugin 1.0.0/1.1.0 + stable branch
    serve.mjs  serve-fixture.mjs
  test/  *.test.mjs
.github/workflows/pages.yml
.github/ISSUE_TEMPLATE/request-skill.yml  report-problem.yml
```

---

### Task 1: Branch, scaffold and spec amendments

**Files:**
- Create: `site/package.json`, `site/README.md`
- Modify: `docs/superpowers/specs/2026-10-14-pages-catalog-design.md` (append section 16, fix section 14)

**Interfaces:**
- Produces: `npm test` / `npm run build` / `npm run dev` / `npm run serve` scripts in `site/`; installed devDependencies.

- [ ] **Step 1: Create the branch**

```bash
cd /Users/olehtkachuk/_Projects/GoIT/dev-digest-ai-marketplace
git switch main && git pull --ff-only && git switch -c feat/pages-catalog
```

- [ ] **Step 2: Write `site/package.json`**

```json
{
  "name": "marketplace-catalog-site",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "node --test \"test/*.test.mjs\"",
    "build": "node build/index.mjs --repo-root .. --stable-ref origin/stable --out dist",
    "dev": "node dev/serve-fixture.mjs",
    "serve": "node dev/serve.mjs dist 4173"
  },
  "devDependencies": {
    "@fontsource/geist": "^5.1.0",
    "@fontsource/geist-mono": "^5.1.0",
    "ajv": "^8.17.1",
    "dompurify": "^3.2.0",
    "jsdom": "^25.0.0",
    "marked": "^14.1.0",
    "minisearch": "^7.1.0"
  }
}
```

- [ ] **Step 3: Install and verify the files the vendor step will copy exist**

```bash
cd site && npm install
ls node_modules/minisearch/dist/es/index.js \
   node_modules/marked/lib/marked.esm.js \
   node_modules/dompurify/dist/purify.es.mjs \
   node_modules/@fontsource/geist/files/geist-latin-400-normal.woff2 \
   node_modules/@fontsource/geist/files/geist-latin-500-normal.woff2 \
   node_modules/@fontsource/geist/files/geist-latin-600-normal.woff2 \
   node_modules/@fontsource/geist-mono/files/geist-mono-latin-400-normal.woff2 \
   node_modules/@fontsource/geist-mono/files/geist-mono-latin-500-normal.woff2
```
Expected: all eight paths printed, no "No such file". If a path differs in the installed version, note the real path and use it in Task 8's `VENDOR`/`FONTS` lists (that is the only place paths are written).

- [ ] **Step 4: Write `site/README.md`**

```markdown
# Marketplace catalog site

Static catalog for the marketplace, published to GitHub Pages. Self-contained: it reads the repository at build time and imports nothing from `../scripts`.

## Develop

```bash
cd site
npm ci
npm test
npm run dev        # builds a fixture repo (demo-plugin 1.0.0 / 1.1.0 + stable branch) and serves http://localhost:4173/dev-digest-ai-marketplace/
```

## Build against the real repository

```bash
npm run build      # reads ../ (main working tree) and origin/stable, writes dist/
npm run serve      # serves dist/ under the Pages base path
```

## How it works

- `build/` produces `dist/catalog.json`, `search-latest.json`, `search-stable.json`, `bodies/`, `feed.xml`, `meta.json`.
- `src/` is the client, copied into `dist/` as is. Libraries and fonts are vendored into `dist/vendor` and `dist/fonts`.
- `latest` = `main`. `stable` = release tags pinned in the `stable` branch (`scripts/build-stable.mjs --publish` creates it).
- Deployed by `.github/workflows/pages.yml`. One-time setup: repo Settings → Pages → Source = GitHub Actions.
```

- [ ] **Step 5: Amend the spec.** Replace section 14 of the spec with the block below, and append section 16.

Section 14 becomes:

```markdown
## 14. Open items to verify during implementation

1. Remote (non-local) `source` plugins: v1 lists them as unindexed cards; confirm that is acceptable once real plugins exist.

Resolved during planning: the stable marketplace is added with `claude plugin marketplace add otkachuk777/dev-digest-ai-marketplace#stable` (documented in `docs/RELEASES.md`); `claude plugin validate` already runs in `.github/workflows/validate.yml`, so the Pages build only runs its own six checks.
```

Append:

```markdown
## 16. Amendments from the planning phase (2026-10-14)

Found after reading `docs/RELEASES.md`, `scripts/build-stable.mjs` and the Claude Design canvas.

1. **Stable source.** The `stable` branch contains only `.claude-plugin/marketplace.json` with `git-subdir` entries pinned to `ref` (tag `<plugin>--v<version>`) and `sha`. The build therefore reads stable plugin files with `git archive <sha> <path>`, not from a checkout of `stable`. Affects 6.1 and 6.2.
2. **Checkout.** The Pages workflow always builds from `main` (`fetch-depth: 0`, tags included) and reads `origin/stable` via git. Pushes to `stable` also trigger a rebuild.
3. **Feed.** Releases come from tags `<plugin>--v<version>` (tag date, summary from the CHANGELOG section at that tag, fallback tag subject), not from `git log` on `plugin.json`. Affects 6.6.
4. **Data layout.** `catalog.json` holds metadata only, per channel. Markdown bodies are separate files `bodies/<channel>/<id with / as __>.md`. There are two search indexes, `search-latest.json` and `search-stable.json`. Affects 6.3, 6.5, 6.7.
5. **Validation.** Failures in `latest` fail the build. Failures in `stable` are recorded and shown in the security panel, because pinned tags are immutable and cannot be fixed. Affects 11.
6. **Fonts.** The design uses Geist; it is self-hosted (`@fontsource`) because CSP forbids external fonts. All styling is in `style.css`; no inline `style` attributes.
7. **Type chips.** Chips are explicit multi-select filters, none pressed by default. The "Understood as … boost for type" row shows the parsed query. Affects 7.1.
8. **Not available in stable.** Shown on the detail page when an id exists only in `latest` (for example from a shared link). The stable search list contains stable artifacts only.
9. **Workflow actions** use major-version tags (`@v4`), matching `validate.yml`, not commit SHAs. Affects 8.
10. **Isolation.** All site code, tests, fixtures and tooling live in `site/`; only the workflow and issue templates live in `.github/`.
```

- [ ] **Step 6: Commit**

```bash
cd .. && git add site/package.json site/package-lock.json site/README.md docs/superpowers/specs/2026-10-14-pages-catalog-design.md
git commit -m "chore(site): scaffold catalog site and amend spec" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Library helpers (semver, git, tokens, frontmatter, changelog)

**Files:**
- Create: `site/build/lib/semver.mjs`, `site/build/lib/git.mjs`, `site/build/lib/tokens.mjs`, `site/build/lib/frontmatter.mjs`, `site/build/lib/changelog.mjs`
- Test: `site/test/frontmatter.test.mjs`, `site/test/tokens.test.mjs`, `site/test/changelog.test.mjs`

**Interfaces:**
- Produces:
  - `parseVersion(v): [n,n,n] | null`, `compareVersions(a, b): -1|0|1`
  - `git(cwd, ...args): { ok: boolean, stdout: string, stderr: string }` (stdout loses trailing newlines only)
  - `extractTree(cwd, ref, path, destDir): void` (throws with a hint to fetch tags)
  - `estimateTokens(text): number`
  - `parseFrontmatter(text): { data: object, body: string, hasFrontmatter: boolean }`
  - `escapeRe(s): string`, `hasSection(text, version): boolean`, `changelogSummary(text, version): string | null`

- [ ] **Step 1: Write the failing tests**

`site/test/tokens.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateTokens } from '../build/lib/tokens.mjs';

test('estimateTokens is ceil(chars / 4)', () => {
  assert.equal(estimateTokens(''), 0);
  assert.equal(estimateTokens(undefined), 0);
  assert.equal(estimateTokens('abcd'), 1);
  assert.equal(estimateTokens('abcde'), 2);
});
```

`site/test/frontmatter.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter } from '../build/lib/frontmatter.mjs';

test('parses scalars, quoted strings and booleans', () => {
  const { data, body, hasFrontmatter } = parseFrontmatter('---\nname: code-review\ndescription: "Review: bugs, tests."\nflag: true\n---\n# Body\n');
  assert.equal(hasFrontmatter, true);
  assert.deepEqual(data, { name: 'code-review', description: 'Review: bugs, tests.', flag: true });
  assert.equal(body, '# Body\n');
});

test('keeps colons inside unquoted values', () => {
  assert.equal(parseFrontmatter('---\ndescription: Use when: reviewing\n---\n').data.description, 'Use when: reviewing');
});

test('parses inline and block lists', () => {
  const { data } = parseFrontmatter('---\ntags: [a, "b c", d]\nitems:\n  - one\n  - two\n---\n');
  assert.deepEqual(data.tags, ['a', 'b c', 'd']);
  assert.deepEqual(data.items, ['one', 'two']);
});

test('folds > and keeps | blocks', () => {
  const { data } = parseFrontmatter('---\nfolded: >\n  line one\n  line two\nkept: |\n  a\n  b\nnext: x\n---\n');
  assert.equal(data.folded, 'line one line two');
  assert.equal(data.kept, 'a\nb');
  assert.equal(data.next, 'x');
});

test('handles CRLF, BOM and empty frontmatter', () => {
  assert.equal(parseFrontmatter('\uFEFF---\r\nname: x\r\n---\r\nbody').data.name, 'x');
  assert.deepEqual(parseFrontmatter('---\n---\nbody').data, {});
});

test('text without frontmatter is all body', () => {
  const r = parseFrontmatter('# Title\n');
  assert.equal(r.hasFrontmatter, false);
  assert.equal(r.body, '# Title\n');
  assert.deepEqual(r.data, {});
});
```

`site/test/changelog.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { hasSection, changelogSummary } from '../build/lib/changelog.mjs';

const text = '# Changelog\n\n## 1.1.0\n- Add code-reviewer agent.\n- Other.\n\n## 1.0.0\n- First release.\n';

test('hasSection matches the exact version heading', () => {
  assert.equal(hasSection(text, '1.1.0'), true);
  assert.equal(hasSection(text, '1.1'), false);
  assert.equal(hasSection(text, '1.0.0'), true);
  assert.equal(hasSection(null, '1.0.0'), false);
  assert.equal(hasSection('## 1x0y0\n', '1.0.0'), false);
});

test('changelogSummary returns the first bullet of the section', () => {
  assert.equal(changelogSummary(text, '1.1.0'), 'Add code-reviewer agent.');
  assert.equal(changelogSummary(text, '1.0.0'), 'First release.');
  assert.equal(changelogSummary(text, '9.9.9'), null);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd site && npm test`
Expected: FAIL, "Cannot find module" for the lib files.

- [ ] **Step 3: Implement the helpers**

`site/build/lib/semver.mjs`:

```js
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseVersion(v) {
  const m = SEMVER.exec(String(v));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}
```

`site/build/lib/git.mjs`:

```js
import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

export function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, stdout: (r.stdout ?? '').replace(/\n+$/, ''), stderr: (r.stderr ?? '').trim() };
}

/** Exports `path` from `ref` into destDir (keeps the repo-relative path under destDir). */
export function extractTree(cwd, ref, path, destDir) {
  mkdirSync(destDir, { recursive: true });
  const a = spawnSync('git', ['archive', '--format=tar', ref, path], { cwd, maxBuffer: 256 * 1024 * 1024 });
  if (a.status !== 0) {
    throw new Error(`git archive ${ref} ${path} failed: ${String(a.stderr).trim()}. Fetch full history and tags first (git fetch --tags --unshallow).`);
  }
  const t = spawnSync('tar', ['-x', '-C', destDir], { input: a.stdout });
  if (t.status !== 0) throw new Error(`tar failed: ${String(t.stderr).trim()}`);
}
```

`site/build/lib/tokens.mjs`:

```js
export function estimateTokens(text) {
  return Math.ceil(String(text ?? '').length / 4);
}
```

`site/build/lib/frontmatter.mjs`:

```js
function unquote(s) {
  if (s.length >= 2 && ((s[0] === '"' && s.at(-1) === '"') || (s[0] === "'" && s.at(-1) === "'"))) {
    const inner = s.slice(1, -1);
    return s[0] === '"'
      ? inner.replace(/\\(["\\nt])/g, (_, c) => ({ n: '\n', t: '\t' })[c] ?? c)
      : inner.replace(/''/g, "'");
  }
  return s;
}

function splitInline(s) {
  const out = [];
  let cur = '';
  let quote = null;
  for (const ch of s) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function scalar(raw) {
  const s = raw.trim();
  if (s.startsWith('[') && s.endsWith(']')) {
    return splitInline(s.slice(1, -1)).map((x) => x.trim()).filter(Boolean).map(scalar);
  }
  if (s === 'true') return true;
  if (s === 'false') return false;
  return unquote(s);
}

function parseYaml(src) {
  const lines = src.split('\n');
  const data = {};
  for (let i = 0; i < lines.length; i++) {
    const m = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const [, key, rest] = m;
    if (/^[>|][+-]?$/.test(rest)) {
      const block = [];
      while (i + 1 < lines.length && (/^\s+/.test(lines[i + 1]) || lines[i + 1] === '')) block.push(lines[++i]);
      const text = block.map((l) => l.replace(/^\s+/, ''));
      data[key] = rest[0] === '>' ? text.join(' ').replace(/\s+/g, ' ').trim() : text.join('\n').trim();
    } else if (rest === '') {
      const items = [];
      while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) items.push(scalar(lines[++i].replace(/^\s*-\s+/, '')));
      data[key] = items.length ? items : '';
    } else {
      data[key] = scalar(rest);
    }
  }
  return data;
}

export function parseFrontmatter(text) {
  const src = String(text ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const m = /^---\n(?:([\s\S]*?)\n)?---[ \t]*(?:\n|$)/.exec(src);
  if (!m) return { data: {}, body: src, hasFrontmatter: false };
  return { data: parseYaml(m[1] ?? ''), body: src.slice(m[0].length), hasFrontmatter: true };
}
```

`site/build/lib/changelog.mjs`:

```js
export const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const heading = (version) => new RegExp(`^##\\s+\\[?v?${escapeRe(version)}\\]?(\\s|$)`);

export function hasSection(text, version) {
  return String(text ?? '').replace(/\r\n/g, '\n').split('\n').some((l) => heading(version).test(l));
}

export function changelogSummary(text, version) {
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((l) => heading(version).test(l));
  if (start < 0) return null;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break;
    const t = lines[i].trim().replace(/^[-*]\s+/, '');
    if (t && !t.startsWith('#')) return t;
  }
  return null;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd site && npm test`
Expected: PASS, all tests in the three files.

- [ ] **Step 5: Commit**

```bash
git add site/build/lib site/test
git commit -m "feat(site): add build helpers for frontmatter, tokens, git and changelog" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Fixture repo and plugin scanner

**Files:**
- Create: `site/dev/make-fixture-repo.mjs`, `site/build/scan.mjs`
- Test: `site/test/scan.test.mjs`

**Interfaces:**
- Consumes: `parseFrontmatter`, `estimateTokens`.
- Produces:
  - `createFixtureRepo({ empty?: boolean, stable?: boolean }): { root: string, cleanup(): void }` and `FIXTURE_REPO = 'otkachuk777/dev-digest-ai-marketplace'`. The repo has branch `main` (demo-plugin 1.1.0), tags `demo-plugin--v1.0.0` (2026-10-09) and `demo-plugin--v1.1.0` (2026-10-14), and branch `stable` pinned to 1.0.0 (unless `stable:false`). `empty:true` gives a marketplace with `plugins: []`.
  - `splitList(value): string[]` (paren-aware comma split, accepts arrays)
  - `scanPlugin({ dir, pluginPath, entryName }): Scan` where
    `Scan = { name, version|null, description, keywords: string[], readme, changelog|null, path, artifacts: RawArtifact[], hooks: {event,matcher,command}[], mcp: {name,command}[], problems: {rule,file,message}[] }`
    `RawArtifact = { type: 'plugin'|'skill'|'agent'|'command'|'hook'|'mcp', slug, name, description, tags: string[], body, path, tools: string[], tokens: {always,onInvoke}|null }`. The plugin artifact is first; its `tokens` is `null` (the catalog sums children). Hook and MCP artifacts have `tokens: null`.

- [ ] **Step 1: Write the fixture helper `site/dev/make-fixture-repo.mjs`**

```js
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

export const FIXTURE_REPO = 'otkachuk777/dev-digest-ai-marketplace';
const D1 = '2026-10-09T10:00:00+00:00';
const D2 = '2026-10-14T10:00:00+00:00';
const json = (v) => `${JSON.stringify(v, null, 2)}\n`;

function put(root, file, text) {
  const p = join(root, file);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
}

function sh(root, date, ...args) {
  const r = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date,
      GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

const marketplace = (empty) => ({
  name: 'dev-digest-ai-marketplace',
  description: 'Fixture marketplace',
  owner: { name: 'AI Engineering' },
  plugins: empty ? [] : [{ name: 'demo-plugin', source: './plugins/demo-plugin', description: 'Demo bundle for code quality.' }],
});

function writeDemoPlugin(root, version) {
  const base = 'plugins/demo-plugin';
  put(root, `${base}/.claude-plugin/plugin.json`, json({ name: 'demo-plugin', version, description: 'Demo bundle for code quality.', keywords: ['review', 'git'] }));
  put(root, `${base}/README.md`, '# demo-plugin\n\nDemo bundle used by the catalog tests.\n');
  put(root, `${base}/CHANGELOG.md`, version === '1.0.0'
    ? '# Changelog\n\n## 1.0.0\n- First release.\n'
    : '# Changelog\n\n## 1.1.0\n- Add code-reviewer agent.\n\n## 1.0.0\n- First release.\n');
  put(root, `${base}/skills/code-review/SKILL.md`, [
    '---',
    'name: code-review',
    'description: "Run a structured review of a diff: bugs, risky changes, missing tests."',
    'allowed-tools: Read, Grep, Bash(git diff:*)',
    '---',
    '# Code review',
    '',
    '## When to use',
    'Use before opening a pull request, or when asked to review a branch.',
    '',
    '## Steps',
    '- Read the diff against the base branch.',
    '- List bugs first, then risky changes, then missing tests.',
    '',
  ].join('\n'));
  if (version === '1.0.0') return;
  put(root, `${base}/agents/code-reviewer.md`, '---\nname: code-reviewer\ndescription: Read-only agent that does a review pass in its own context and returns findings.\ntools: Read, Grep\n---\nYou review code and report findings only.\n');
  put(root, `${base}/commands/review-pr.md`, '---\ndescription: Fetch a pull request and start a review with the skill above.\nallowed-tools: Bash(gh pr view:*)\n---\nReview the pull request $ARGUMENTS.\n');
  put(root, `${base}/hooks/hooks.json`, json({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: '${CLAUDE_PLUGIN_ROOT}/hooks/guard-diff.sh' }] }] } }));
  put(root, `${base}/.mcp.json`, json({ mcpServers: { github: { command: 'npx', args: ['-y', '@example/github-mcp'] } } }));
}

export function createFixtureRepo({ empty = false, stable = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'catalog-fixture-'));
  sh(root, D1, 'init', '-q', '-b', 'main');
  put(root, '.claude-plugin/marketplace.json', json(marketplace(empty)));
  if (empty) {
    sh(root, D1, 'add', '-A');
    sh(root, D1, 'commit', '-q', '-m', 'chore: empty marketplace');
  } else {
    writeDemoPlugin(root, '1.0.0');
    sh(root, D1, 'add', '-A');
    sh(root, D1, 'commit', '-q', '-m', 'feat: demo-plugin 1.0.0');
    sh(root, D1, 'tag', 'demo-plugin--v1.0.0');
    const sha1 = sh(root, D1, 'rev-parse', 'HEAD');
    writeDemoPlugin(root, '1.1.0');
    sh(root, D2, 'add', '-A');
    sh(root, D2, 'commit', '-q', '-m', 'feat: demo-plugin 1.1.0');
    sh(root, D2, 'tag', 'demo-plugin--v1.1.0');
    if (stable) {
      sh(root, D2, 'checkout', '-q', '--orphan', 'stable');
      sh(root, D2, 'rm', '-rf', '-q', '.');
      put(root, '.claude-plugin/marketplace.json', json({
        name: 'dev-digest-ai-marketplace-stable',
        description: 'Pinned, verified releases of dev-digest-ai-marketplace. Used for rollback.',
        owner: { name: 'AI Engineering' },
        plugins: [{
          name: 'demo-plugin',
          description: 'Demo bundle for code quality.',
          source: { source: 'git-subdir', url: `https://github.com/${FIXTURE_REPO}.git`, path: 'plugins/demo-plugin', ref: 'demo-plugin--v1.0.0', sha: sha1 },
        }],
      }));
      sh(root, D2, 'add', '-A');
      sh(root, D2, 'commit', '-q', '-m', 'chore(stable): pin demo-plugin@1.0.0');
      sh(root, D2, 'checkout', '-q', 'main');
    }
  }
  sh(root, D2, 'remote', 'add', 'origin', `https://github.com/${FIXTURE_REPO}.git`);
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
```

- [ ] **Step 2: Write the failing scan test `site/test/scan.test.mjs`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createFixtureRepo } from '../dev/make-fixture-repo.mjs';
import { scanPlugin, splitList } from '../build/scan.mjs';

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
```

- [ ] **Step 3: Run to verify failure**

Run: `cd site && node --test test/scan.test.mjs`
Expected: FAIL, "Cannot find module '../build/scan.mjs'".

- [ ] **Step 4: Implement `site/build/scan.mjs`**

```js
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrontmatter } from './lib/frontmatter.mjs';
import { estimateTokens } from './lib/tokens.mjs';

const read = (p) => readFileSync(p, 'utf8');
const uniq = (list) => [...new Set(list.map((s) => String(s).trim().toLowerCase()).filter(Boolean))];

export function splitList(value) {
  if (Array.isArray(value)) return value.map((s) => String(s).trim()).filter(Boolean);
  if (typeof value !== 'string') return [];
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of value) {
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

function readJson(file, shownPath, problems) {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(read(file));
  } catch (e) {
    problems.push({ rule: 'json', file: shownPath, message: `invalid JSON: ${e.message}` });
    return null;
  }
}

function readHooks(dir, pluginPath, problems) {
  const json = readJson(join(dir, 'hooks', 'hooks.json'), `${pluginPath}/hooks/hooks.json`, problems);
  const out = [];
  for (const [event, groups] of Object.entries(json?.hooks ?? {})) {
    for (const g of Array.isArray(groups) ? groups : []) {
      for (const h of Array.isArray(g?.hooks) ? g.hooks : []) {
        if (h?.command) out.push({ event, matcher: g.matcher ?? '', command: String(h.command) });
      }
    }
  }
  return out;
}

function readMcp(dir, pluginPath, problems) {
  const json = readJson(join(dir, '.mcp.json'), `${pluginPath}/.mcp.json`, problems);
  if (!json) return [];
  const servers = json.mcpServers ?? json;
  return Object.entries(servers)
    .filter(([, v]) => v && typeof v === 'object')
    .map(([name, v]) => ({ name, command: v.command ? [v.command, ...(v.args ?? [])].join(' ') : String(v.url ?? '') }));
}

function make({ type, slug, name, description, tags, body, path, tools = [], tokens }) {
  return { type, slug, name, description: String(description ?? '').trim(), tags, body: body ?? '', path, tools, tokens };
}

const fullTokens = (name, description, body) => ({
  always: estimateTokens(`${name} ${description}`),
  onInvoke: estimateTokens(body),
});

export function scanPlugin({ dir, pluginPath, entryName }) {
  const problems = [];
  const manifestPath = `${pluginPath}/.claude-plugin/plugin.json`;
  let manifest = null;
  const manifestFile = join(dir, '.claude-plugin', 'plugin.json');
  if (!existsSync(manifestFile)) {
    problems.push({ rule: 'manifest', file: manifestPath, message: 'plugin.json is missing' });
  } else {
    try {
      manifest = JSON.parse(read(manifestFile));
    } catch (e) {
      problems.push({ rule: 'manifest', file: manifestPath, message: `plugin.json is not valid JSON: ${e.message}` });
    }
  }
  const name = manifest?.name ?? entryName;
  const version = manifest?.version ?? null;
  if (manifest) {
    if (!manifest.name || !/^\d+\.\d+\.\d+/.test(String(version))) {
      problems.push({ rule: 'manifest', file: manifestPath, message: 'plugin.json needs "name" and a SemVer "version"' });
    }
    if (manifest.name !== entryName) {
      problems.push({ rule: 'entry-name', file: manifestPath, message: `marketplace entry "${entryName}" differs from plugin.json name "${manifest.name}"` });
    }
  }
  const keywords = uniq(manifest?.keywords ?? []);
  const readmeFile = join(dir, 'README.md');
  const changelogFile = join(dir, 'CHANGELOG.md');
  const readme = existsSync(readmeFile) ? read(readmeFile) : '';
  const changelog = existsSync(changelogFile) ? read(changelogFile) : null;

  const artifacts = [
    make({ type: 'plugin', slug: name, name, description: manifest?.description ?? '', tags: keywords, body: readme, path: manifestPath, tokens: null }),
  ];

  const skillsDir = join(dir, 'skills');
  if (existsSync(skillsDir)) {
    for (const d of readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = join(skillsDir, d.name, 'SKILL.md');
      if (!existsSync(file)) continue;
      const shown = `${pluginPath}/skills/${d.name}/SKILL.md`;
      const { data, body } = parseFrontmatter(read(file));
      if (data.name && data.name !== d.name) {
        problems.push({ rule: 'name', file: shown, message: `skill name "${data.name}" differs from directory "${d.name}"` });
      }
      if (!String(data.description ?? '').trim()) problems.push({ rule: 'description', file: shown, message: 'description is missing' });
      const skillName = String(data.name || d.name);
      const description = String(data.description ?? '');
      artifacts.push(make({
        type: 'skill', slug: d.name, name: skillName, description,
        tags: uniq([...keywords, ...splitList(data.tags)]), body, path: shown,
        tools: splitList(data['allowed-tools']), tokens: fullTokens(skillName, description.trim(), body),
      }));
    }
  }

  for (const [type, folder, toolKey] of [['agent', 'agents', 'tools'], ['command', 'commands', 'allowed-tools']]) {
    const folderPath = join(dir, folder);
    if (!existsSync(folderPath)) continue;
    for (const f of readdirSync(folderPath).filter((n) => n.endsWith('.md')).sort()) {
      const slug = f.slice(0, -3);
      const shown = `${pluginPath}/${folder}/${f}`;
      const { data, body } = parseFrontmatter(read(join(folderPath, f)));
      if (!String(data.description ?? '').trim()) problems.push({ rule: 'description', file: shown, message: 'description is missing' });
      const name = String(data.name || slug);
      const description = String(data.description ?? '');
      artifacts.push(make({
        type, slug, name, description, tags: uniq([...keywords, ...splitList(data.tags)]), body, path: shown,
        tools: splitList(data[toolKey]), tokens: fullTokens(name, description.trim(), body),
      }));
    }
  }

  const hooks = readHooks(dir, pluginPath, problems);
  hooks.forEach((h, i) => {
    artifacts.push(make({
      type: 'hook', slug: `${h.event.toLowerCase()}-${i + 1}`, name: h.matcher ? `${h.event}:${h.matcher}` : h.event,
      description: `Runs on ${h.event}${h.matcher ? ` when the tool matches ${h.matcher}` : ''}: ${h.command}`,
      tags: keywords, body: '', path: `${pluginPath}/hooks/hooks.json`, tokens: null,
    }));
  });

  const mcp = readMcp(dir, pluginPath, problems);
  for (const s of mcp) {
    artifacts.push(make({
      type: 'mcp', slug: s.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-'), name: s.name,
      description: `MCP server started with: ${s.command}`, tags: keywords, body: '', path: `${pluginPath}/.mcp.json`, tokens: null,
    }));
  }

  return { name, version, description: manifest?.description ?? '', keywords, readme, changelog, path: pluginPath, artifacts, hooks, mcp, problems };
}
```

- [ ] **Step 5: Run to verify pass**

Run: `cd site && node --test test/scan.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add site/dev site/build/scan.mjs site/test/scan.test.mjs
git commit -m "feat(site): add fixture repo and plugin scanner" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Build-time validation rules

**Files:**
- Create: `site/build/validate.mjs`
- Test: `site/test/validate.test.mjs`

**Interfaces:**
- Consumes: `Scan` from Task 3, `hasSection`.
- Produces: `RULES: {id,title}[]` (6 entries: `manifest`, `entry-name`, `description`, `name`, `changelog`, `json`) and `evaluate(scan): { passed: number, total: 6, failures: string[] }` where each failure is `"[rule] file: message"`.

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run to verify failure**

Run: `cd site && node --test test/validate.test.mjs`
Expected: FAIL, "Cannot find module '../build/validate.mjs'".

- [ ] **Step 3: Implement `site/build/validate.mjs`**

```js
import { hasSection } from './lib/changelog.mjs';

export const RULES = [
  { id: 'manifest', title: 'plugin.json is valid' },
  { id: 'entry-name', title: 'Marketplace entry name matches plugin.json' },
  { id: 'description', title: 'Every skill, agent and command has a description' },
  { id: 'name', title: 'Skill names match their directories' },
  { id: 'changelog', title: 'CHANGELOG.md has a section for the version' },
  { id: 'json', title: 'hooks.json and .mcp.json parse' },
];

export function evaluate(scan) {
  const problems = [...scan.problems];
  if (scan.version && !hasSection(scan.changelog, scan.version)) {
    problems.push({
      rule: 'changelog',
      file: `${scan.path}/CHANGELOG.md`,
      message: scan.changelog == null ? 'CHANGELOG.md is missing' : `CHANGELOG.md has no "## ${scan.version}" section`,
    });
  }
  const failures = [];
  let passed = 0;
  for (const rule of RULES) {
    const mine = problems.filter((p) => p.rule === rule.id);
    if (mine.length === 0) passed++;
    for (const p of mine) failures.push(`[${rule.id}] ${p.file}: ${p.message}`);
  }
  return { passed, total: RULES.length, failures };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd site && node --test test/validate.test.mjs`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add site/build/validate.mjs site/test/validate.test.mjs
git commit -m "feat(site): add six build-time validation rules" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Channel sources and releases

**Files:**
- Create: `site/build/releases.mjs`, `site/build/sources.mjs`
- Test: `site/test/sources.test.mjs`

**Interfaces:**
- Consumes: `git`, `extractTree`, `scanPlugin`, `evaluate`, `changelogSummary`, `compareVersions`, `parseVersion`.
- Produces:
  - `listReleases(repoRoot, { name, path }): { plugin, version, tag, date, summary }[]` (newest first; `date` is ISO-8601 strict)
  - `lastChangeDate(repoRoot, ref, path): 'YYYY-MM-DD' | null`
  - `PluginData = { name, version|null, description, keywords, readme, path, artifacts, hooks, mcp, indexed: boolean, validation: {passed,total,failures}|null, lastChange: string|null, tag: string|null }`
  - `ChannelData = { channel: 'latest'|'stable', marketplace: string, ref: string, plugins: PluginData[] }`
  - `loadLatest({ repoRoot }): ChannelData`
  - `loadStable({ repoRoot, ref, workDir }): ChannelData | null` (null when `ref:.claude-plugin/marketplace.json` cannot be read)
  - `collectReleases(repoRoot, plugins): release[]` (merged, newest first, max 50)

- [ ] **Step 1: Write the failing test `site/test/sources.test.mjs`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
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
    const bad = 'a'.repeat(40);
    const run = (...a) => import('node:child_process').then(({ spawnSync }) => spawnSync('git', a, { cwd: root, encoding: 'utf8' }));
    return run('show', 'stable:.claude-plugin/marketplace.json').then(async (r) => {
      const mp = JSON.parse(r.stdout);
      mp.plugins[0].source.sha = bad;
      const { writeFileSync } = await import('node:fs');
      await run('checkout', '-q', 'stable');
      writeFileSync(join(root, '.claude-plugin/marketplace.json'), JSON.stringify(mp));
      await run('-c', 'commit.gpgsign=false', '-c', 'user.name=T', '-c', 'user.email=t@e.x', 'commit', '-qam', 'bad pin');
      await run('checkout', '-q', 'main');
      assert.throws(() => loadStable({ repoRoot: root, ref: 'stable', workDir: work }), /git archive .* failed.*fetch/s);
    });
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
```

- [ ] **Step 2: Run to verify failure**

Run: `cd site && node --test test/sources.test.mjs`
Expected: FAIL, "Cannot find module '../build/sources.mjs'".

- [ ] **Step 3: Implement `site/build/releases.mjs`**

```js
import { git } from './lib/git.mjs';
import { parseVersion, compareVersions } from './lib/semver.mjs';
import { changelogSummary } from './lib/changelog.mjs';

/** Releases of one plugin from tags named `<plugin>--v<version>`, newest first. */
export function listReleases(repoRoot, { name, path }) {
  const r = git(repoRoot, 'for-each-ref', '--format=%(refname:short)%09%(creatordate:iso-strict)%09%(contents:subject)', `refs/tags/${name}--v*`);
  if (!r.ok || !r.stdout) return [];
  return r.stdout
    .split('\n')
    .map((line) => {
      const [tag, date, subject] = line.split('\t');
      const version = tag.slice(`${name}--v`.length);
      if (!parseVersion(version)) return null;
      const changelog = git(repoRoot, 'show', `${tag}:${path}/CHANGELOG.md`);
      const summary = changelogSummary(changelog.ok ? changelog.stdout : '', version) ?? subject ?? `${name} ${version}`;
      return { plugin: name, version, tag, date, summary };
    })
    .filter(Boolean)
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || compareVersions(b.version, a.version));
}
```

- [ ] **Step 4: Implement `site/build/sources.mjs`**

```js
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { git, extractTree } from './lib/git.mjs';
import { scanPlugin } from './scan.mjs';
import { evaluate } from './validate.mjs';
import { listReleases } from './releases.mjs';

export function lastChangeDate(repoRoot, ref, path) {
  const r = git(repoRoot, 'log', '-1', '--format=%cs', ref, '--', path);
  return r.ok && r.stdout ? r.stdout : null;
}

function indexed(scan, extra) {
  return {
    name: scan.name, version: scan.version, description: scan.description, keywords: scan.keywords, readme: scan.readme,
    path: scan.path, artifacts: scan.artifacts, hooks: scan.hooks, mcp: scan.mcp, indexed: true,
    validation: evaluate(scan), ...extra,
  };
}

/** A plugin the build cannot read (remote source): one card, no deep indexing. */
function unindexed(entry) {
  const keywords = [...new Set((entry.keywords ?? []).map((k) => String(k).trim().toLowerCase()).filter(Boolean))];
  return {
    name: entry.name, version: entry.version ?? null, description: entry.description ?? '', keywords, readme: '', path: '',
    artifacts: [{ type: 'plugin', slug: entry.name, name: entry.name, description: entry.description ?? '', tags: keywords, body: '', path: '.claude-plugin/marketplace.json', tools: [], tokens: null }],
    hooks: [], mcp: [], indexed: false, validation: null, lastChange: null, tag: null,
  };
}

export function loadLatest({ repoRoot }) {
  const mp = JSON.parse(readFileSync(join(repoRoot, '.claude-plugin', 'marketplace.json'), 'utf8'));
  const plugins = (mp.plugins ?? []).map((entry) => {
    if (typeof entry.source !== 'string') return unindexed(entry);
    const pluginPath = entry.source.replace(/^\.\//, '').replace(/\/$/, '');
    const scan = scanPlugin({ dir: join(repoRoot, pluginPath), pluginPath, entryName: entry.name });
    return indexed(scan, { lastChange: lastChangeDate(repoRoot, 'HEAD', pluginPath), tag: null });
  });
  return { channel: 'latest', marketplace: mp.name, ref: 'main', plugins };
}

export function loadStable({ repoRoot, ref, workDir }) {
  const r = git(repoRoot, 'show', `${ref}:.claude-plugin/marketplace.json`);
  if (!r.ok) return null;
  let mp;
  try {
    mp = JSON.parse(r.stdout);
  } catch (e) {
    throw new Error(`${ref}:.claude-plugin/marketplace.json is not valid JSON: ${e.message}`);
  }
  const plugins = (mp.plugins ?? []).map((entry) => {
    const s = entry.source;
    if (!s || typeof s !== 'object' || s.source !== 'git-subdir' || !s.sha || !s.path) return unindexed(entry);
    const dest = join(workDir, entry.name);
    extractTree(repoRoot, s.sha, s.path, dest);
    const scan = scanPlugin({ dir: join(dest, s.path), pluginPath: s.path, entryName: entry.name });
    return indexed(scan, { lastChange: lastChangeDate(repoRoot, s.sha, s.path), tag: s.ref ?? null });
  });
  return { channel: 'stable', marketplace: mp.name, ref: 'stable', plugins };
}

export function collectReleases(repoRoot, plugins) {
  return plugins
    .filter((p) => p.indexed)
    .flatMap((p) => listReleases(repoRoot, { name: p.name, path: p.path }))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, 50);
}
```

- [ ] **Step 5: Run to verify pass**

Run: `cd site && node --test test/sources.test.mjs`
Expected: PASS (5 tests). If the "missing commit" test is flaky on your git version, keep the assertion on `/git archive .* failed/` and drop `fetch` only if the hint text is genuinely absent (it is produced by `extractTree`).

- [ ] **Step 6: Commit**

```bash
git add site/build/releases.mjs site/build/sources.mjs site/test/sources.test.mjs
git commit -m "feat(site): load latest and stable channels and releases from git" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Catalog assembly and JSON schema

**Files:**
- Create: `site/build/catalog.mjs`, `site/build/catalog.schema.json`, `site/build/schema.mjs`
- Test: `site/test/catalog.test.mjs`

**Interfaces:**
- Consumes: `ChannelData`, `PluginData`, release list.
- Produces:
  - `bodyFile(channel, id): 'bodies/<channel>/<id with / as __>.md'`
  - `buildCatalog({ repo, latest, stable, releases }): { catalog, bodies: Map<path, markdown>, searchDocs: { latest: Doc[], stable: Doc[] } }`
  - `Doc = { id, type, name, plugin, description, tags: string (space-joined), body: string (≤ 4000 chars) }`
  - `catalog = { schema: 1, repo, channels: { latest: {marketplace, ref}, stable: {marketplace, ref} | null }, artifacts: Artifact[], releases }`
  - `Artifact = { id: '<plugin>/<type>/<slug>', type, name, plugin, channels: { latest?: ChannelRecord, stable?: ChannelRecord } }`
  - `ChannelRecord = { version|null, description, tags, tokens: {always,onInvoke}|null, declared: {tools, hooks:[{event,matcher,command}], mcp:[{name,command}]}, path, ref, body: string|null, validation: {passed,total,failures}|null, lastChange: string|null, indexed: boolean }`
  - `assertValidCatalog(catalog): void` (throws listing ajv errors)
  - Plugin tokens = sum of `skill`/`agent`/`command` children (`null` for unindexed plugins). `ref` is `main` for latest, the pinned tag for stable.

- [ ] **Step 1: Write the failing test `site/test/catalog.test.mjs`**

```js
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
```

- [ ] **Step 2: Run to verify failure**

Run: `cd site && node --test test/catalog.test.mjs`
Expected: FAIL, "Cannot find module '../build/catalog.mjs'".

- [ ] **Step 3: Write `site/build/catalog.schema.json`**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "additionalProperties": false,
  "required": ["schema", "repo", "channels", "artifacts", "releases"],
  "properties": {
    "schema": { "const": 1 },
    "repo": { "type": "string", "pattern": "^[^/]+/[^/]+$" },
    "channels": {
      "type": "object",
      "additionalProperties": false,
      "required": ["latest", "stable"],
      "properties": {
        "latest": { "$ref": "#/definitions/channel" },
        "stable": { "anyOf": [{ "$ref": "#/definitions/channel" }, { "type": "null" }] }
      }
    },
    "artifacts": { "type": "array", "items": { "$ref": "#/definitions/artifact" } },
    "releases": { "type": "array", "items": { "$ref": "#/definitions/release" } }
  },
  "definitions": {
    "channel": {
      "type": "object",
      "additionalProperties": false,
      "required": ["marketplace", "ref"],
      "properties": { "marketplace": { "type": "string", "minLength": 1 }, "ref": { "type": "string", "minLength": 1 } }
    },
    "release": {
      "type": "object",
      "additionalProperties": false,
      "required": ["plugin", "version", "tag", "date", "summary"],
      "properties": {
        "plugin": { "type": "string" }, "version": { "type": "string" }, "tag": { "type": "string" },
        "date": { "type": "string" }, "summary": { "type": "string" }
      }
    },
    "artifact": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "type", "name", "plugin", "channels"],
      "properties": {
        "id": { "type": "string", "pattern": "^[a-z0-9._-]+/(plugin|skill|agent|command|hook|mcp)/[A-Za-z0-9._-]+$" },
        "type": { "enum": ["plugin", "skill", "agent", "command", "hook", "mcp"] },
        "name": { "type": "string", "minLength": 1 },
        "plugin": { "type": "string", "minLength": 1 },
        "channels": {
          "type": "object",
          "additionalProperties": false,
          "minProperties": 1,
          "properties": { "latest": { "$ref": "#/definitions/record" }, "stable": { "$ref": "#/definitions/record" } }
        }
      }
    },
    "record": {
      "type": "object",
      "additionalProperties": false,
      "required": ["version", "description", "tags", "tokens", "declared", "path", "ref", "body", "validation", "lastChange", "indexed"],
      "properties": {
        "version": { "type": ["string", "null"] },
        "description": { "type": "string" },
        "tags": { "type": "array", "items": { "type": "string" } },
        "tokens": {
          "anyOf": [
            { "type": "null" },
            { "type": "object", "additionalProperties": false, "required": ["always", "onInvoke"], "properties": { "always": { "type": "integer", "minimum": 0 }, "onInvoke": { "type": "integer", "minimum": 0 } } }
          ]
        },
        "declared": {
          "type": "object",
          "additionalProperties": false,
          "required": ["tools", "hooks", "mcp"],
          "properties": {
            "tools": { "type": "array", "items": { "type": "string" } },
            "hooks": { "type": "array", "items": { "type": "object", "additionalProperties": false, "required": ["event", "matcher", "command"], "properties": { "event": { "type": "string" }, "matcher": { "type": "string" }, "command": { "type": "string" } } } },
            "mcp": { "type": "array", "items": { "type": "object", "additionalProperties": false, "required": ["name", "command"], "properties": { "name": { "type": "string" }, "command": { "type": "string" } } } }
          }
        },
        "path": { "type": "string" },
        "ref": { "type": "string" },
        "body": { "type": ["string", "null"] },
        "validation": {
          "anyOf": [
            { "type": "null" },
            { "type": "object", "additionalProperties": false, "required": ["passed", "total", "failures"], "properties": { "passed": { "type": "integer" }, "total": { "type": "integer" }, "failures": { "type": "array", "items": { "type": "string" } } } }
          ]
        },
        "lastChange": { "type": ["string", "null"] },
        "indexed": { "type": "boolean" }
      }
    }
  }
}
```

- [ ] **Step 4: Implement `site/build/schema.mjs`**

```js
import { readFileSync } from 'node:fs';
import Ajv from 'ajv';

const schema = JSON.parse(readFileSync(new URL('./catalog.schema.json', import.meta.url), 'utf8'));
const validate = new Ajv({ allErrors: true }).compile(schema);

export function assertValidCatalog(catalog) {
  if (validate(catalog)) return;
  const lines = validate.errors.slice(0, 10).map((e) => `  ${e.instancePath || '/'} ${e.message}`);
  throw new Error(`catalog.json is invalid:\n${lines.join('\n')}`);
}
```

- [ ] **Step 5: Implement `site/build/catalog.mjs`**

```js
const TYPE_ORDER = ['plugin', 'skill', 'agent', 'command', 'hook', 'mcp'];
const SIZED = new Set(['skill', 'agent', 'command']);

export const bodyFile = (channel, id) => `bodies/${channel}/${id.replaceAll('/', '__')}.md`;

export function buildCatalog({ repo, latest, stable, releases }) {
  const records = new Map();
  const bodies = new Map();
  const searchDocs = { latest: [], stable: [] };

  for (const ch of [latest, stable]) {
    if (!ch) continue;
    const seen = new Set();
    for (const plugin of ch.plugins) {
      const kids = plugin.artifacts.filter((a) => SIZED.has(a.type));
      const sum = (k) => kids.reduce((n, a) => n + a.tokens[k], 0);
      const allTools = [...new Set(plugin.artifacts.flatMap((a) => a.tools))];
      for (const a of plugin.artifacts) {
        const id = `${plugin.name}/${a.type}/${a.slug}`;
        if (seen.has(id)) throw new Error(`Duplicate artifact id "${id}" in channel ${ch.channel}`);
        seen.add(id);
        const isPlugin = a.type === 'plugin';
        const tokens = isPlugin ? (plugin.indexed ? { always: sum('always'), onInvoke: sum('onInvoke') } : null) : a.tokens;
        const text = (a.body ?? '').trim();
        const file = text ? bodyFile(ch.channel, id) : null;
        if (file) bodies.set(file, `${text}\n`);
        const rec = records.get(id) ?? { id, type: a.type, name: a.name, plugin: plugin.name, channels: {} };
        rec.channels[ch.channel] = {
          version: plugin.version,
          description: a.description,
          tags: a.tags,
          tokens,
          declared: { tools: isPlugin ? allTools : a.tools, hooks: plugin.hooks, mcp: plugin.mcp },
          path: a.path,
          ref: ch.channel === 'latest' ? 'main' : (plugin.tag ?? 'stable'),
          body: file,
          validation: plugin.validation,
          lastChange: plugin.lastChange,
          indexed: plugin.indexed,
        };
        records.set(id, rec);
        searchDocs[ch.channel].push({
          id, type: a.type, name: a.name, plugin: plugin.name, description: a.description,
          tags: a.tags.join(' '), body: text.slice(0, 4000),
        });
      }
    }
  }

  const artifacts = [...records.values()].sort((a, b) =>
    a.plugin.localeCompare(b.plugin) || TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.name.localeCompare(b.name));

  return {
    catalog: {
      schema: 1,
      repo,
      channels: {
        latest: { marketplace: latest.marketplace, ref: latest.ref },
        stable: stable ? { marketplace: stable.marketplace, ref: stable.ref } : null,
      },
      artifacts,
      releases,
    },
    bodies,
    searchDocs,
  };
}
```

- [ ] **Step 6: Run to verify pass**

Run: `cd site && node --test test/catalog.test.mjs`
Expected: PASS (6 tests).

- [ ] **Step 7: Commit**

```bash
git add site/build/catalog.mjs site/build/catalog.schema.json site/build/schema.mjs site/test/catalog.test.mjs
git commit -m "feat(site): assemble per-channel catalog with JSON schema" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Search options, search index and Atom feed

**Files:**
- Create: `site/src/search-options.js`, `site/build/searchindex.mjs`, `site/build/feed.mjs`
- Test: `site/test/searchindex.test.mjs`, `site/test/feed.test.mjs`

**Interfaces:**
- Consumes: `Doc[]`, release list.
- Produces:
  - `searchOptions` (shared by build and browser): `{ idField: 'id', fields: ['name','tags','description','body'], storeFields: ['type'], searchOptions: { boost: {name:5,tags:3,description:2,body:1}, prefix: true, fuzzy: 0.2, combineWith: 'OR' } }`
  - `buildSearchIndex(docs): string` (JSON, loadable with `MiniSearch.loadJSON(text, searchOptions)`)
  - `buildAtom({ siteUrl, repo, releases, updated }): string` (`siteUrl` ends with `/`)

- [ ] **Step 1: Write the failing tests**

`site/test/searchindex.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import MiniSearch from 'minisearch';
import { searchOptions } from '../src/search-options.js';
import { buildSearchIndex } from '../build/searchindex.mjs';

const docs = [
  { id: 'p/skill/code-review', type: 'skill', name: 'code-review', plugin: 'p', description: 'Run a structured review of a diff.', tags: 'review git', body: 'Read the diff.' },
  { id: 'p/skill/notes', type: 'skill', name: 'notes', plugin: 'p', description: 'Take notes.', tags: 'docs', body: 'When you review a meeting, write notes about code review.' },
];

test('the serialized index loads with the shared options and ranks name above body', () => {
  const ms = MiniSearch.loadJSON(buildSearchIndex(docs), searchOptions);
  const res = ms.search('code review');
  assert.equal(res[0].id, 'p/skill/code-review');
  assert.equal(res[0].type, 'skill');
});

test('prefix and fuzzy matching find partial and misspelled words', () => {
  const ms = MiniSearch.loadJSON(buildSearchIndex(docs), searchOptions);
  assert.equal(ms.search('revi')[0].id, 'p/skill/code-review');
  assert.equal(ms.search('reveiw').length > 0, true);
});
```

`site/test/feed.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { buildAtom } from '../build/feed.mjs';

const releases = [
  { plugin: 'demo-plugin', version: '1.1.0', tag: 'demo-plugin--v1.1.0', date: '2026-10-14T10:00:00+00:00', summary: 'Add <b>agent</b> & more.' },
  { plugin: 'demo-plugin', version: '1.0.0', tag: 'demo-plugin--v1.0.0', date: '2026-10-09T10:00:00+00:00', summary: 'First release.' },
];

test('buildAtom returns well-formed Atom with escaped text and absolute links', () => {
  const xml = buildAtom({ siteUrl: 'https://o.github.io/r/', repo: 'o/r', releases, updated: '2026-10-14T10:00:00+00:00' });
  const doc = new (new JSDOM('').window.DOMParser)().parseFromString(xml, 'application/xml');
  assert.equal(doc.querySelector('parsererror'), null);
  assert.equal(doc.documentElement.localName, 'feed');
  const entries = doc.getElementsByTagName('entry');
  assert.equal(entries.length, 2);
  assert.equal(entries[0].getElementsByTagName('title')[0].textContent, 'demo-plugin 1.1.0');
  assert.equal(entries[0].getElementsByTagName('summary')[0].textContent, 'Add <b>agent</b> & more.');
  assert.equal(entries[0].getElementsByTagName('link')[0].getAttribute('href'), 'https://o.github.io/r/artifact.html?id=demo-plugin%2Fplugin%2Fdemo-plugin');
});

test('buildAtom works with no releases', () => {
  const xml = buildAtom({ siteUrl: 'https://o.github.io/r/', repo: 'o/r', releases: [], updated: '2026-10-14T10:00:00+00:00' });
  const doc = new (new JSDOM('').window.DOMParser)().parseFromString(xml, 'application/xml');
  assert.equal(doc.querySelector('parsererror'), null);
  assert.equal(doc.getElementsByTagName('entry').length, 0);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd site && node --test test/searchindex.test.mjs test/feed.test.mjs`
Expected: FAIL, missing modules.

- [ ] **Step 3: Implement**

`site/src/search-options.js`:

```js
// Shared by the build (to create the index) and the browser (to load it). Keep them identical.
export const searchOptions = {
  idField: 'id',
  fields: ['name', 'tags', 'description', 'body'],
  storeFields: ['type'],
  searchOptions: {
    boost: { name: 5, tags: 3, description: 2, body: 1 },
    prefix: true,
    fuzzy: 0.2,
    combineWith: 'OR',
  },
};
```

`site/build/searchindex.mjs`:

```js
import MiniSearch from 'minisearch';
import { searchOptions } from '../src/search-options.js';

export function buildSearchIndex(docs) {
  const ms = new MiniSearch(searchOptions);
  ms.addAll(docs);
  return JSON.stringify(ms);
}
```

`site/build/feed.mjs`:

```js
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

export function buildAtom({ siteUrl, repo, releases, updated }) {
  const entries = releases.map((r) => {
    const link = `${siteUrl}artifact.html?id=${encodeURIComponent(`${r.plugin}/plugin/${r.plugin}`)}`;
    return `  <entry>
    <id>tag:github.com,${esc(repo)}:${esc(r.tag)}</id>
    <title>${esc(`${r.plugin} ${r.version}`)}</title>
    <updated>${esc(r.date)}</updated>
    <link href="${esc(link)}"/>
    <summary>${esc(r.summary)}</summary>
  </entry>`;
  });
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>tag:github.com,${esc(repo)}:releases</id>
  <title>${esc(repo)} releases</title>
  <updated>${esc(updated)}</updated>
  <link rel="self" href="${esc(`${siteUrl}feed.xml`)}"/>
  <link href="${esc(siteUrl)}"/>
${entries.join('\n')}
</feed>
`;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd site && node --test test/searchindex.test.mjs test/feed.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add site/src/search-options.js site/build/searchindex.mjs site/build/feed.mjs site/test/searchindex.test.mjs site/test/feed.test.mjs
git commit -m "feat(site): add search index builder and Atom feed" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Build entry point, vendoring and dev servers

**Files:**
- Create: `site/build/vendor.mjs`, `site/build/index.mjs`, `site/dev/serve.mjs`, `site/dev/serve-fixture.mjs`, `site/src/.gitkeep` (removed in Task 10)
- Test: `site/test/build.test.mjs`

**Interfaces:**
- Consumes: everything from Tasks 3-7.
- Produces:
  - `copyVendor(outDir): void` writes `vendor/minisearch.js`, `vendor/marked.js`, `vendor/purify.js` and `fonts/*.woff2` (strips `//# sourceMappingURL` lines; throws if a source file is missing)
  - `build({ repoRoot, stableRef?: string, repo: string, out: string, builtAt?: string }): { artifacts: number, stable: boolean }` writes `catalog.json`, `search-latest.json`, `search-stable.json` (only when stable exists), `bodies/**`, `feed.xml`, `meta.json` (`{ builtAt, commit, repo, siteUrl }`) and copies `src/` into `out`. `stableRef` default `origin/stable`; `'none'` skips stable.
  - `detectRepo(repoRoot): string` (`GITHUB_REPOSITORY` env, else parsed `origin` URL)
  - CLI: `node build/index.mjs --repo-root .. --stable-ref origin/stable --out dist [--repo owner/name]`
  - Dev: `node dev/serve.mjs <dir> <port>` serves `<dir>` under `/dev-digest-ai-marketplace/`; `serve({dir, port})` is exported.

- [ ] **Step 1: Write the failing test `site/test/build.test.mjs`**

```js
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
```

- [ ] **Step 2: Run to verify failure**

Run: `cd site && node --test test/build.test.mjs`
Expected: FAIL, "Cannot find module '../build/index.mjs'". Also `src/` must exist for `cpSync`; create `site/src/.gitkeep` first (`mkdir -p src && touch src/.gitkeep`). `search-options.js` already lives there from Task 7.

- [ ] **Step 3: Implement `site/build/vendor.mjs`**

```js
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULES = fileURLToPath(new URL('../node_modules/', import.meta.url));

const VENDOR = [
  ['minisearch/dist/es/index.js', 'vendor/minisearch.js'],
  ['marked/lib/marked.esm.js', 'vendor/marked.js'],
  ['dompurify/dist/purify.es.mjs', 'vendor/purify.js'],
];

const FONTS = [
  '@fontsource/geist/files/geist-latin-400-normal.woff2',
  '@fontsource/geist/files/geist-latin-500-normal.woff2',
  '@fontsource/geist/files/geist-latin-600-normal.woff2',
  '@fontsource/geist-mono/files/geist-mono-latin-400-normal.woff2',
  '@fontsource/geist-mono/files/geist-mono-latin-500-normal.woff2',
];

function need(rel) {
  const p = join(MODULES, rel);
  if (!existsSync(p)) throw new Error(`Missing ${p}. Run "npm ci" in site/.`);
  return p;
}

export function copyVendor(out) {
  for (const [from, to] of VENDOR) {
    const dest = join(out, to);
    mkdirSync(dirname(dest), { recursive: true });
    const text = readFileSync(need(from), 'utf8').replace(/^\/\/# sourceMappingURL=.*$/gm, '');
    writeFileSync(dest, text);
  }
  for (const from of FONTS) {
    const dest = join(out, 'fonts', from.split('/').at(-1));
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(need(from), dest);
  }
}
```

- [ ] **Step 4: Implement `site/build/index.mjs`**

```js
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { git } from './lib/git.mjs';
import { loadLatest, loadStable, collectReleases } from './sources.mjs';
import { buildCatalog } from './catalog.mjs';
import { assertValidCatalog } from './schema.mjs';
import { buildSearchIndex } from './searchindex.mjs';
import { buildAtom } from './feed.mjs';
import { copyVendor } from './vendor.mjs';

const SRC_DIR = fileURLToPath(new URL('../src/', import.meta.url));

export function parseRepoUrl(url) {
  const m = /github\.com[:/]+([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(String(url).trim());
  return m ? `${m[1]}/${m[2]}` : null;
}

export function detectRepo(repoRoot) {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  const r = git(repoRoot, 'remote', 'get-url', 'origin');
  const repo = r.ok ? parseRepoUrl(r.stdout) : null;
  if (!repo) throw new Error('Cannot detect the GitHub repo. Pass --repo owner/name.');
  return repo;
}

function write(out, file, text) {
  const p = join(out, file);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
}

export function build({ repoRoot, stableRef = 'origin/stable', repo, out, builtAt = new Date().toISOString() }) {
  const work = mkdtempSync(join(tmpdir(), 'catalog-build-'));
  try {
    const latest = loadLatest({ repoRoot });
    const failed = latest.plugins.filter((p) => p.validation && p.validation.failures.length > 0);
    if (failed.length > 0) {
      const lines = failed.flatMap((p) => p.validation.failures.map((f) => `  ${p.name}: ${f}`));
      throw new Error(`Latest channel failed validation:\n${lines.join('\n')}`);
    }
    const stable = stableRef && stableRef !== 'none' ? loadStable({ repoRoot, ref: stableRef, workDir: work }) : null;
    const releases = collectReleases(repoRoot, latest.plugins);
    const { catalog, bodies, searchDocs } = buildCatalog({ repo, latest, stable, releases });
    assertValidCatalog(catalog);

    rmSync(out, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });
    cpSync(SRC_DIR, out, { recursive: true, filter: (p) => !p.endsWith('.gitkeep') });
    copyVendor(out);

    const [owner, name] = repo.split('/');
    const siteUrl = `https://${owner.toLowerCase()}.github.io/${name}/`;
    const commit = git(repoRoot, 'rev-parse', '--short', 'HEAD').stdout || 'unknown';
    write(out, 'catalog.json', JSON.stringify(catalog));
    write(out, 'search-latest.json', buildSearchIndex(searchDocs.latest));
    if (stable) write(out, 'search-stable.json', buildSearchIndex(searchDocs.stable));
    for (const [file, text] of bodies) write(out, file, text);
    write(out, 'feed.xml', buildAtom({ siteUrl, repo, releases, updated: releases[0]?.date ?? builtAt }));
    write(out, 'meta.json', JSON.stringify({ builtAt, commit, repo, siteUrl }));
    return { artifacts: catalog.artifacts.length, stable: Boolean(stable) };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { values } = parseArgs({
      options: { 'repo-root': { type: 'string' }, 'stable-ref': { type: 'string' }, out: { type: 'string' }, repo: { type: 'string' } },
    });
    const repoRoot = resolve(values['repo-root'] ?? '..');
    const result = build({
      repoRoot,
      stableRef: values['stable-ref'] ?? 'origin/stable',
      repo: values.repo ?? detectRepo(repoRoot),
      out: resolve(values.out ?? 'dist'),
    });
    console.log(`Built ${result.artifacts} artifact(s); stable channel: ${result.stable ? 'yes' : 'no'}`);
  } catch (e) {
    console.error(`error: ${e.message}`);
    process.exit(1);
  }
}
```

- [ ] **Step 5: Implement the dev servers**

`site/dev/serve.mjs`:

```js
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const BASE = '/dev-digest-ai-marketplace/';
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.xml': 'application/atom+xml; charset=utf-8',
  '.woff2': 'font/woff2',
};

/** Serves `dir` under /dev-digest-ai-marketplace/ exactly like GitHub Pages, so absolute-path bugs show up locally. */
export function serve({ dir, port }) {
  const root = resolve(dir);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith(BASE)) {
      res.writeHead(302, { location: BASE });
      return res.end();
    }
    let rel = decodeURIComponent(url.pathname.slice(BASE.length)) || 'index.html';
    if (rel.endsWith('/')) rel += 'index.html';
    const file = normalize(join(root, rel));
    if (!file.startsWith(root)) {
      res.writeHead(403);
      return res.end('forbidden');
    }
    try {
      const data = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    }
  });
  return new Promise((ok) => server.listen(port, () => {
    console.log(`Serving ${root} at http://localhost:${port}${BASE}`);
    ok(server);
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dir = 'dist', port = '4173'] = process.argv.slice(2);
  serve({ dir, port: Number(port) });
}
```

`site/dev/serve-fixture.mjs`:

```js
import { resolve } from 'node:path';
import { build } from '../build/index.mjs';
import { createFixtureRepo, FIXTURE_REPO } from './make-fixture-repo.mjs';
import { serve } from './serve.mjs';

const { root } = createFixtureRepo();
const out = resolve('dist');
const r = build({ repoRoot: root, stableRef: 'stable', repo: FIXTURE_REPO, out });
console.log(`Fixture build: ${r.artifacts} artifacts, stable: ${r.stable}`);
await serve({ dir: out, port: 4173 });
```

- [ ] **Step 6: Run to verify pass**

Run: `cd site && node --test test/build.test.mjs`
Expected: PASS (3 tests). If `vendor` copy fails with "Missing …", fix the path in `VENDOR`/`FONTS` to what `ls` showed in Task 1 Step 3.

- [ ] **Step 7: Run the whole suite and commit**

Run: `cd site && npm test`
Expected: PASS, all files.

```bash
git add site/build site/dev site/src site/test
git commit -m "feat(site): add build entry point, vendoring and dev servers" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Client logic modules (pure, unit-tested)

**Files:**
- Create: `site/src/query.js`, `site/src/search.js`, `site/src/state.js`, `site/src/data.js`, `site/src/snippets.js`, `site/src/issues.js`, `site/src/highlight.js`, `site/src/markdown.js`, `site/src/clipboard.js`
- Test: `site/test/query.test.mjs`, `site/test/search.test.mjs`, `site/test/state.test.mjs`, `site/test/data.test.mjs`, `site/test/snippets.test.mjs`, `site/test/highlight.test.mjs`, `site/test/markdown.test.mjs`

**Interfaces:**
- Produces:
  - `parseQuery(raw): { terms: string[], text: string, typeBoost: string|null }`
  - `search({ ms, items, query, filters: { types, tag, plugin } }): { query, hits: { item, score, terms }[] }` where `ms` is a MiniSearch instance (injected) and `items` come from `viewItems`
  - `TYPES`, `readState(search): { q, types, tag, plugin, channel: 'stable'|null }`, `writeState({ q, types, tag, plugin, channel }): string`, `resolveChannel({ fromUrl, stored, hasStable }): 'latest'|'stable'`
  - `viewItems(catalog, channel)`, `facets(items): { tags, plugins }`, `displayName(item)`, `tokenLabel(tokens)`, `versionLabel(v)`
  - `installSteps({ repo, plugin, channel, marketplace }): { comment, command }[]`
  - `requestSkillUrl(repo, query)`, `reportProblemUrl(repo, { id, version, channel })`
  - `esc(text)`, `highlight(text, terms)`
  - `createRenderer({ marked, purify }): (md) => string`
  - `copyText(text): Promise<boolean>`

- [ ] **Step 1: Write the failing tests**

`site/test/query.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuery } from '../src/query.js';

test('strips filler words and extracts the type boost', () => {
  assert.deepEqual(parseQuery('I need a skill for code review'), { terms: ['code', 'review'], text: 'code review', typeBoost: 'skill' });
});

test('plural and uppercase type words map to the singular type', () => {
  assert.equal(parseQuery('Agents for testing').typeBoost, 'agent');
  assert.equal(parseQuery('mcp servers').typeBoost, 'mcp');
});

test('a query of only filler and type words has no terms but keeps the boost', () => {
  assert.deepEqual(parseQuery('I need a skill'), { terms: [], text: '', typeBoost: 'skill' });
  assert.deepEqual(parseQuery('   '), { terms: [], text: '', typeBoost: null });
  assert.deepEqual(parseQuery(undefined), { terms: [], text: '', typeBoost: null });
});

test('keeps slash commands and strips regex-ish punctuation', () => {
  assert.deepEqual(parseQuery('/review-pr').terms, ['review-pr']);
  assert.deepEqual(parseQuery('c++ (test [').terms, ['c', 'test']);
});
```

`site/test/search.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import MiniSearch from 'minisearch';
import { searchOptions } from '../src/search-options.js';
import { search } from '../src/search.js';

const docs = [
  { id: 'p/skill/code-review', type: 'skill', name: 'code-review', plugin: 'p', description: 'Structured review of a diff.', tags: 'review git', body: '' },
  { id: 'p/agent/code-reviewer', type: 'agent', name: 'code-reviewer', plugin: 'p', description: 'Read-only review agent.', tags: 'review', body: '' },
  { id: 'p/skill/notes', type: 'skill', name: 'notes', plugin: 'p', description: 'Take notes.', tags: 'docs', body: '' },
  { id: 'q/hook/pretooluse-1', type: 'hook', name: 'PreToolUse:Bash', plugin: 'q', description: 'Guards bash.', tags: 'safety', body: '' },
];
const items = docs.map((d) => ({ ...d, tags: d.tags.split(' '), version: '1.0.0', tokens: null }));
const ms = new MiniSearch(searchOptions);
ms.addAll(docs);

test('a natural-language query finds review artifacts and boosts the named type', () => {
  const { query, hits } = search({ ms, items, query: 'I need a skill for code review', filters: {} });
  assert.equal(query.typeBoost, 'skill');
  assert.equal(hits[0].item.id, 'p/skill/code-review');
  assert.ok(hits.some((h) => h.item.id === 'p/agent/code-reviewer'));
});

test('only filler and type words lists that type first, not "no results"', () => {
  const { hits } = search({ ms, items, query: 'I need a skill', filters: {} });
  assert.equal(hits.length, items.length);
  assert.deepEqual(hits.slice(0, 2).map((h) => h.item.type), ['skill', 'skill']);
});

test('an empty query lists everything', () => {
  assert.equal(search({ ms, items, query: '', filters: {} }).hits.length, 4);
});

test('filters apply after search: type, tag and plugin', () => {
  assert.deepEqual(search({ ms, items, query: 'review', filters: { types: ['agent'] } }).hits.map((h) => h.item.id), ['p/agent/code-reviewer']);
  assert.ok(search({ ms, items, query: '', filters: { tag: 'safety' } }).hits.every((h) => h.item.tags.includes('safety')));
  assert.ok(search({ ms, items, query: '', filters: { plugin: 'q' } }).hits.every((h) => h.item.plugin === 'q'));
});

test('hostile queries do not throw', () => {
  for (const q of ['c++ (test', '[', '\\', '<img onerror=x>', '*', '(((']) {
    assert.doesNotThrow(() => search({ ms, items, query: q, filters: {} }));
  }
});
```

`site/test/state.test.mjs`:

```js
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

test('resolveChannel falls back to latest when stable is unavailable', () => {
  assert.equal(resolveChannel({ fromUrl: 'stable', stored: null, hasStable: false }), 'latest');
  assert.equal(resolveChannel({ fromUrl: 'stable', stored: null, hasStable: true }), 'stable');
  assert.equal(resolveChannel({ fromUrl: null, stored: 'stable', hasStable: true }), 'stable');
  assert.equal(resolveChannel({ fromUrl: null, stored: null, hasStable: true }), 'latest');
  assert.equal(resolveChannel({ fromUrl: 'latest', stored: 'stable', hasStable: true }), 'latest');
});
```

`site/test/data.test.mjs`:

```js
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
```

`site/test/snippets.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { installSteps } from '../src/snippets.js';
import { requestSkillUrl, reportProblemUrl } from '../src/issues.js';

test('latest install uses the main marketplace', () => {
  const steps = installSteps({ repo: 'o/r', plugin: 'p', channel: 'latest', marketplace: 'm' });
  assert.deepEqual(steps.map((s) => s.command), ['/plugin marketplace add o/r', '/plugin install p@m']);
});

test('stable install pins the stable branch and the stable marketplace name', () => {
  const steps = installSteps({ repo: 'o/r', plugin: 'p', channel: 'stable', marketplace: 'm-stable' });
  assert.deepEqual(steps.map((s) => s.command), ['/plugin marketplace add o/r#stable', '/plugin install p@m-stable']);
});

test('issue links are prefilled and encoded', () => {
  assert.equal(requestSkillUrl('o/r', 'pdf converter'),
    'https://github.com/o/r/issues/new?template=request-skill.yml&title=Request%3A+pdf+converter&query=pdf+converter');
  assert.match(requestSkillUrl('o/r', ''), /title=Request%3A\+$/);
  assert.equal(reportProblemUrl('o/r', { id: 'p/skill/x', version: '1.1.0', channel: 'latest' }),
    'https://github.com/o/r/issues/new?template=report-problem.yml&title=Problem%3A+p%2Fskill%2Fx&artifact=p%2Fskill%2Fx+1.1.0+%28latest%29');
});
```

`site/test/highlight.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { esc, highlight } from '../src/highlight.js';

test('esc escapes HTML', () => assert.equal(esc(`<a href="x">&'</a>`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;'));

test('highlight wraps matches case-insensitively and escapes the rest', () => {
  assert.equal(highlight('Code <Review>', ['review']), 'Code &lt;<mark>Review</mark>&gt;');
});

test('highlight survives regex metacharacters and empty terms', () => {
  assert.equal(highlight('a+b (c)', ['+', '(']), 'a<mark>+</mark>b <mark>(</mark>c)');
  assert.equal(highlight('plain', []), 'plain');
  assert.equal(highlight('plain', ['']), 'plain');
  assert.equal(highlight('x', ['[']), 'x');
});
```

`site/test/markdown.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';
import { marked } from 'marked';
import { createRenderer } from '../src/markdown.js';

const render = createRenderer({ marked, purify: createDOMPurify(new JSDOM('').window) });

test('renders markdown', () => {
  assert.match(render('## When to use\n\n- one\n- two'), /<h2>When to use<\/h2>[\s\S]*<li>one<\/li>/);
});

test('strips scripts, event handlers, styles and javascript: links', () => {
  const html = render('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n<div style="x:y">t</div>\n\n[bad](javascript:alert(1))');
  assert.doesNotMatch(html, /<script|onerror|style=|javascript:/i);
});

test('external links get rel="noopener noreferrer"', () => {
  assert.match(render('[x](https://example.com)'), /<a href="https:\/\/example.com" rel="noopener noreferrer">x<\/a>/);
});

test('forms and iframes are removed', () => {
  assert.doesNotMatch(render('<form action="x"><input name="p"></form><iframe src="x"></iframe>'), /<form|<input|<iframe/i);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd site && node --test test/query.test.mjs test/search.test.mjs test/state.test.mjs test/data.test.mjs test/snippets.test.mjs test/highlight.test.mjs test/markdown.test.mjs`
Expected: FAIL, missing `../src/*.js` modules.

- [ ] **Step 3: Implement the modules**

`site/src/query.js`:

```js
const STOP = new Set([
  'i', 'me', 'my', 'we', 'you', 'need', 'needs', 'want', 'wants', 'a', 'an', 'the', 'for', 'to', 'of', 'with', 'that', 'this',
  'is', 'are', 'be', 'some', 'any', 'please', 'help', 'find', 'show', 'looking', 'something', 'can', 'could', 'would', 'like',
  'there', 'give', 'get', 'and', 'or', 'in', 'on', 'it',
]);

const TYPE_WORDS = {
  skill: 'skill', skills: 'skill', agent: 'agent', agents: 'agent', plugin: 'plugin', plugins: 'plugin',
  command: 'command', commands: 'command', hook: 'hook', hooks: 'hook', mcp: 'mcp',
};

export function parseQuery(raw) {
  const words = String(raw ?? '').toLowerCase().replace(/[^\p{L}\p{N}\s/_-]+/gu, ' ').split(/\s+/).filter(Boolean);
  let typeBoost = null;
  const terms = [];
  for (const w of words) {
    if (TYPE_WORDS[w]) {
      typeBoost ??= TYPE_WORDS[w];
      continue;
    }
    if (STOP.has(w)) continue;
    const t = w.replace(/^\/+/, '');
    if (t) terms.push(t);
  }
  return { terms, text: terms.join(' '), typeBoost };
}
```

`site/src/search.js`:

```js
import { parseQuery } from './query.js';

const TYPE_ORDER = ['plugin', 'skill', 'agent', 'command', 'hook', 'mcp'];

function matches(item, { types = [], tag = '', plugin = '' }) {
  return (!types.length || types.includes(item.type)) && (!tag || item.tags.includes(tag)) && (!plugin || item.plugin === plugin);
}

export function search({ ms, items, query, filters = {} }) {
  const q = parseQuery(query);
  let hits;
  if (q.terms.length > 0) {
    const byId = new Map(items.map((i) => [i.id, i]));
    const results = ms.search(q.text, {
      boostDocument: (_id, _term, stored) => (q.typeBoost && stored?.type === q.typeBoost ? 2 : 1),
    });
    hits = results.filter((r) => byId.has(r.id)).map((r) => ({ item: byId.get(r.id), score: r.score, terms: q.terms }));
  } else {
    hits = items
      .map((item) => ({ item, score: 0, terms: [] }))
      .sort((a, b) =>
        Number(b.item.type === q.typeBoost) - Number(a.item.type === q.typeBoost) ||
        a.item.plugin.localeCompare(b.item.plugin) ||
        TYPE_ORDER.indexOf(a.item.type) - TYPE_ORDER.indexOf(b.item.type) ||
        a.item.name.localeCompare(b.item.name));
  }
  return { query: q, hits: hits.filter((h) => matches(h.item, filters)) };
}
```

`site/src/state.js`:

```js
export const TYPES = ['skill', 'agent', 'command', 'hook', 'mcp', 'plugin'];

export function readState(search) {
  const p = new URLSearchParams(search);
  return {
    q: p.get('q') ?? '',
    types: (p.get('type') ?? '').split(',').filter((t) => TYPES.includes(t)),
    tag: p.get('tag') ?? '',
    plugin: p.get('plugin') ?? '',
    channel: p.get('channel') === 'stable' ? 'stable' : null,
  };
}

export function writeState({ q, types, tag, plugin, channel }) {
  const p = new URLSearchParams();
  if (q) p.set('q', q);
  if (types?.length) p.set('type', types.join(','));
  if (tag) p.set('tag', tag);
  if (plugin) p.set('plugin', plugin);
  if (channel === 'stable') p.set('channel', 'stable');
  return p.toString();
}

export function resolveChannel({ fromUrl, stored, hasStable }) {
  const want = fromUrl ?? stored ?? 'latest';
  return want === 'stable' && hasStable ? 'stable' : 'latest';
}
```

`site/src/data.js`:

```js
export function viewItems(catalog, channel) {
  return catalog.artifacts
    .filter((a) => a.channels[channel])
    .map((a) => {
      const c = a.channels[channel];
      return { id: a.id, type: a.type, name: a.name, plugin: a.plugin, version: c.version, description: c.description, tags: c.tags, tokens: c.tokens };
    });
}

export function facets(items) {
  const uniq = (list) => [...new Set(list)].sort((a, b) => a.localeCompare(b));
  return { tags: uniq(items.flatMap((i) => i.tags)), plugins: uniq(items.map((i) => i.plugin)) };
}

export const displayName = (item) => (item.type === 'command' ? `/${item.name}` : item.name);
export const tokenLabel = (tokens) => (tokens ? `≈${tokens.always} tokens always` : 'tokens n/a');
export const versionLabel = (v) => (v ? `v${v}` : 'n/a');
```

`site/src/snippets.js`:

```js
export function installSteps({ repo, plugin, channel, marketplace }) {
  const stable = channel === 'stable';
  return [
    { comment: `# add the marketplace (${channel})`, command: `/plugin marketplace add ${repo}${stable ? '#stable' : ''}` },
    { comment: '# install the plugin', command: `/plugin install ${plugin}@${marketplace}` },
  ];
}
```

`site/src/issues.js`:

```js
const base = (repo, template, params) => {
  const p = new URLSearchParams({ template, ...params });
  return `https://github.com/${repo}/issues/new?${p.toString()}`;
};

export function requestSkillUrl(repo, query) {
  const q = String(query ?? '').trim();
  const params = { title: `Request: ${q}` };
  if (q) params.query = q;
  return base(repo, 'request-skill.yml', params);
}

export function reportProblemUrl(repo, { id, version, channel }) {
  return base(repo, 'report-problem.yml', { title: `Problem: ${id}`, artifact: `${id} ${version ?? 'n/a'} (${channel})` });
}
```

Note: `URLSearchParams` encodes `(`/`)` as `%28`/`%29` and space as `+`, matching the expected strings in the test. The `requestSkillUrl('o/r', '')` result ends with `title=Request%3A+` as asserted.

`site/src/highlight.js`:

```js
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function highlight(text, terms) {
  const list = (terms ?? []).filter((t) => t && t.length > 0);
  if (list.length === 0) return esc(text);
  const re = new RegExp(`(${list.map(reEscape).join('|')})`, 'gi');
  return String(text ?? '').split(re).map((part, i) => (i % 2 === 1 ? `<mark>${esc(part)}</mark>` : esc(part))).join('');
}
```

`site/src/markdown.js`:

```js
export function createRenderer({ marked, purify }) {
  purify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') node.setAttribute('rel', 'noopener noreferrer');
  });
  return (md) => {
    const html = marked.parse(String(md ?? ''), { async: false, gfm: true });
    return purify.sanitize(html, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe', 'object', 'embed', 'textarea', 'select'],
      FORBID_ATTR: ['style'],
    });
  };
}
```

`site/src/clipboard.js`:

```js
/** Resolves true when the text reached the clipboard. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Selects the contents of an element so the user can press Ctrl/Cmd+C. */
export function selectContents(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd site && npm test`
Expected: PASS, all suites. If `highlight('a+b (c)', ['+','('])` expectation differs, fix the implementation, not the test; the contract is "each term wrapped, the rest escaped".

- [ ] **Step 5: Commit**

```bash
git add site/src site/test
git commit -m "feat(site): add client search, state, snippet and sanitizing modules" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Styles, UI templates and the search page

**Files:**
- Create: `site/src/style.css`, `site/src/ui.js`, `site/src/loader.js`, `site/src/app.js`, `site/src/index.html`
- Delete: `site/src/.gitkeep`
- Test: `site/test/ui.test.mjs`, `site/test/site-html.test.mjs`

**Interfaces:**
- Consumes: Task 9 modules, `catalog.json`, `meta.json`, `search-<channel>.json`.
- Produces:
  - `cardHtml(item, { terms, channel }): string`
  - `tileHtml(kind, ctx): string` for `kind` in `'empty' | 'no-results' | 'error' | 'not-found' | 'not-in-stable'` (ctx fields: `requestUrl`, `query`, `message`, `id`, `switchUrl`)
  - `newsHtml(releases, siteBase): string`
  - `loadCatalog()`, `loadMeta()`, `loadIndexText(channel)`, `loadText(path)`, `getStoredChannel()`, `storeChannel(v)`
  - Element ids in `index.html`: `channel`, `request`, `q`, `understood`, `types`, `tag`, `plugin`, `count`, `results`, `eyebrow`, `news-list`, `footer-build`, `status`.

- [ ] **Step 1: Write the failing tests**

`site/test/ui.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { cardHtml, tileHtml, newsHtml } from '../src/ui.js';

const item = { id: 'p/skill/x', type: 'skill', name: 'x', plugin: 'p', version: '1.1.0', description: 'Run a <img src=x onerror=alert(1)> review', tags: ['review', 'git'], tokens: { always: 42, onInvoke: 10 } };

test('cardHtml escapes artifact text and builds a detail link', () => {
  const html = cardHtml(item, { terms: ['review'], channel: 'latest' });
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /<mark>review<\/mark>/);
  assert.match(html, /href="artifact\.html\?id=p%2Fskill%2Fx"/);
  assert.match(html, /≈42 tokens always/);
  assert.match(html, /data-copy="p"/);
});

test('cardHtml keeps the stable channel in the link', () => {
  assert.match(cardHtml(item, { terms: [], channel: 'stable' }), /artifact\.html\?id=p%2Fskill%2Fx&amp;channel=stable/);
});

test('tiles', () => {
  assert.match(tileHtml('empty', {}), /No plugins published yet/);
  assert.match(tileHtml('no-results', { query: 'pdf <b>', requestUrl: 'https://x/y' }), /Nothing matches &quot;pdf &lt;b&gt;&quot;/);
  assert.match(tileHtml('error', { message: 'HTTP 500' }), /role="alert"[\s\S]*HTTP 500[\s\S]*data-action="retry"/);
  assert.match(tileHtml('not-found', { id: 'p/skill/old' }), /No artifact with id[\s\S]*p\/skill\/old/);
  assert.match(tileHtml('not-in-stable', { switchUrl: 'artifact.html?id=a' }), /Not available in stable/);
});

test('newsHtml lists releases or says there are none', () => {
  assert.match(newsHtml([], ''), /No releases yet/);
  const html = newsHtml([{ plugin: 'p', version: '1.0.0', tag: 't', date: '2026-10-14T10:00:00+00:00', summary: 'S <b>' }], '');
  assert.match(html, /2026-10-14/);
  assert.match(html, /p 1\.0\.0/);
  assert.match(html, /S &lt;b&gt;/);
});
```

`site/test/site-html.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = new URL('../src/', import.meta.url).pathname;
const pages = readdirSync(SRC).filter((f) => f.endsWith('.html'));

test('there are two pages', () => assert.deepEqual(pages.sort(), ['artifact.html', 'index.html']));

for (const page of pages) {
  const html = readFileSync(join(SRC, page), 'utf8');
  test(`${page} carries the strict CSP`, () => {
    assert.match(html, /http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'"/);
  });
  test(`${page} has no inline styles, inline scripts, handlers or absolute local paths`, () => {
    assert.doesNotMatch(html, /\sstyle=/i);
    assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)[^>]*>/i);
    assert.doesNotMatch(html, /\son[a-z]+=/i);
    assert.doesNotMatch(html, /(?:href|src)="\/(?!\/)/);
    assert.doesNotMatch(html, /googleapis|gstatic|cdn\./);
  });
  test(`${page} is responsive and accessible`, () => {
    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
    assert.match(html, /<html lang="en">/);
  });
}

test('style.css uses only relative font urls and no inline-only tricks', () => {
  const css = readFileSync(join(SRC, 'style.css'), 'utf8');
  assert.doesNotMatch(css, /url\((?!\.\/fonts\/)/);
  assert.doesNotMatch(css, /@import/);
  assert.match(css, /prefers-color-scheme:\s*dark/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd site && node --test test/ui.test.mjs test/site-html.test.mjs`
Expected: FAIL (modules and pages missing).

- [ ] **Step 3: Write `site/src/style.css`**

```css
@font-face{font-family:'Geist';font-style:normal;font-weight:400;font-display:swap;src:url(./fonts/geist-latin-400-normal.woff2) format('woff2')}
@font-face{font-family:'Geist';font-style:normal;font-weight:500;font-display:swap;src:url(./fonts/geist-latin-500-normal.woff2) format('woff2')}
@font-face{font-family:'Geist';font-style:normal;font-weight:600;font-display:swap;src:url(./fonts/geist-latin-600-normal.woff2) format('woff2')}
@font-face{font-family:'Geist Mono';font-style:normal;font-weight:400;font-display:swap;src:url(./fonts/geist-mono-latin-400-normal.woff2) format('woff2')}
@font-face{font-family:'Geist Mono';font-style:normal;font-weight:500;font-display:swap;src:url(./fonts/geist-mono-latin-500-normal.woff2) format('woff2')}

:root{--bg:#F5F6F8;--surface:#FFFFFF;--ink:#12151A;--muted:#566070;--line:#DADEE5;--accent:#0A6B55;--accent-ink:#FFFFFF;--accent-soft:#E2F3EE;--mark:#FFE9A8;--code:#0F1319;--code-ink:#E6E9EF;--code-dim:#8C95A5;--warn-bg:#FFF4E0;--warn-fg:#7A4300;--ok-fg:#0A6B55;--err-bg:#FDE8E8;--err-fg:#B91C1C;
--skill-fg:#1D4ED8;--skill-bg:#E6EEFF;--agent-fg:#6D28D9;--agent-bg:#EFE8FF;--command-fg:#8A4A0B;--command-bg:#FDF0D5;--hook-fg:#B91C1C;--hook-bg:#FDE8E8;--mcp-fg:#0F766E;--mcp-bg:#DDF5F1;--plugin-fg:#374151;--plugin-bg:#E8EAEE}
@media (prefers-color-scheme:dark){:root{--bg:#0E1115;--surface:#161A20;--ink:#ECEEF2;--muted:#9AA3B2;--line:#272D36;--accent:#3DDBA8;--accent-ink:#06251C;--accent-soft:#12302A;--mark:#5A4A12;--code:#0A0D11;--code-ink:#E6E9EF;--code-dim:#8C95A5;--warn-bg:#3A2A10;--warn-fg:#F2C77C;--ok-fg:#3DDBA8;--err-bg:#40191B;--err-fg:#FFA3A3;
--skill-fg:#9DBBFF;--skill-bg:#1B2748;--agent-fg:#C9B0FF;--agent-bg:#2A2048;--command-fg:#F2C77C;--command-bg:#3A2D14;--hook-fg:#FFA3A3;--hook-bg:#40191B;--mcp-fg:#7FE3D4;--mcp-bg:#12332F;--plugin-fg:#C6CCD6;--plugin-bg:#242A33}}

*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;color-scheme:light dark}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 'Geist',system-ui,sans-serif}
a{color:var(--accent)}a:hover{text-decoration:underline}
:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
mark{background:var(--mark);color:inherit;border-radius:3px;padding:0 1px}
.mono{font-family:'Geist Mono',ui-monospace,monospace}
.muted{color:var(--muted)}.small{font-size:13px}.grow{flex:1}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.wrap{max-width:1160px;margin:0 auto;padding-left:24px;padding-right:24px}
.page{min-height:100vh;display:flex;flex-direction:column}.page main{flex:1}

/* header */
.site-header{border-bottom:1px solid var(--line);background:var(--surface)}
.site-header .wrap{padding-top:12px;padding-bottom:12px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px}
.brand{display:flex;align-items:center;gap:10px;color:var(--ink);font-weight:600;font-size:16px;text-decoration:none}
.brand:hover{text-decoration:none}.brand svg{stroke:var(--accent)}.brand-sub{font-weight:400}
.header-actions{display:flex;flex-wrap:wrap;align-items:center;gap:12px}

/* controls */
.btn{font:500 14px 'Geist',sans-serif;min-height:44px;padding:0 16px;border-radius:10px;border:1px solid var(--line);background:var(--surface);color:var(--ink);cursor:pointer;display:inline-flex;align-items:center;gap:8px;text-decoration:none}
.btn:hover{border-color:var(--ink);text-decoration:none}
.btn-p{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
.btn[hidden],.seg[hidden]{display:none}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:10px;background:var(--surface);padding:3px}
.seg button{font:500 14px 'Geist',sans-serif;min-height:38px;min-width:44px;padding:0 14px;border:0;border-radius:7px;background:transparent;color:var(--muted);cursor:pointer}
.seg button[aria-pressed="true"]{background:var(--ink);color:var(--bg)}
.chip{font:500 14px 'Geist',sans-serif;min-height:44px;padding:0 14px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--ink);cursor:pointer;display:inline-flex;align-items:center;gap:8px;flex:none}
.chip[aria-pressed="true"]{background:var(--accent-soft);border-color:var(--accent);color:var(--accent)}
select.chip{padding-right:10px;max-width:180px}
.b{font:500 12px 'Geist Mono',monospace;padding:2px 8px;border-radius:6px;letter-spacing:.02em}
.b-skill{color:var(--skill-fg);background:var(--skill-bg)}.b-agent{color:var(--agent-fg);background:var(--agent-bg)}.b-command{color:var(--command-fg);background:var(--command-bg)}
.b-hook{color:var(--hook-fg);background:var(--hook-bg)}.b-mcp{color:var(--mcp-fg);background:var(--mcp-bg)}.b-plugin{color:var(--plugin-fg);background:var(--plugin-bg)}

/* hero + search */
.hero{padding-top:56px;padding-bottom:24px}
.eyebrow{margin:0 0 12px;color:var(--accent);font:400 13px 'Geist Mono',monospace;letter-spacing:.06em;text-transform:uppercase}
.hero h1{margin:0 0 24px;font-size:44px;line-height:1.1;font-weight:600;letter-spacing:-.02em;max-width:760px}
.search{display:flex;flex-direction:column;gap:12px;max-width:820px}
.searchbox{display:flex;align-items:center;gap:12px;background:var(--surface);border:2px solid var(--ink);border-radius:14px;padding:0 16px;min-height:60px}
.searchbox svg{flex:none;stroke:var(--muted)}
.searchbox input{flex:1;min-width:0;border:0;background:transparent;color:var(--ink);font:400 18px 'Geist',sans-serif;min-height:56px;outline-offset:6px}
.kbd{font:400 12px 'Geist Mono',monospace;color:var(--muted);border:1px solid var(--line);border-radius:6px;padding:2px 8px}
.understood{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:14px;color:var(--muted);min-height:28px}
.understood .term{background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:2px 8px;color:var(--ink)}
.understood .note{margin-left:auto}

/* filters */
.filters{padding-top:8px;padding-bottom:16px;display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.filters .label{font-size:13px;color:var(--muted)}
.divider{width:1px;height:28px;background:var(--line);margin:0 6px}
.chips{display:flex;flex-wrap:wrap;gap:10px}
.count{margin-left:auto;font:400 13px 'Geist Mono',monospace;color:var(--muted)}

/* cards */
.grid{padding-top:8px;padding-bottom:32px;display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:20px;display:flex;flex-direction:column;gap:12px;min-width:0}
.card:hover{border-color:var(--ink)}
.card-top{display:flex;align-items:center;justify-content:space-between;gap:8px}
.card-title{margin:0;font:600 19px 'Geist Mono',monospace;overflow-wrap:anywhere}
.card-title a{color:var(--ink);text-decoration:none}
.card p{margin:0}
.clamp{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.tags{display:flex;flex-wrap:wrap;gap:4px 12px}.tag{font:400 13px 'Geist Mono',monospace;color:var(--muted)}
.card-foot{margin-top:auto;display:flex;align-items:center;gap:10px;padding-top:12px;border-top:1px solid var(--line)}

/* tiles (empty / error states) */
.tile{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:24px;display:flex;flex-direction:column;gap:12px;grid-column:1/-1;max-width:520px}
.tile .lbl{font:500 12px 'Geist Mono',monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.tile h2{margin:0;font-size:20px;font-weight:600}.tile p{margin:0;color:var(--muted)}
.tile .actions{display:flex;flex-wrap:wrap;gap:10px}
.alert{background:var(--err-bg);color:var(--err-fg);border-radius:10px;padding:14px}
.warn{background:var(--warn-bg);color:var(--warn-fg);border-radius:8px;padding:10px 12px;font-size:13.5px}

/* what's new */
.news{padding-bottom:56px}
.news details{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:4px 20px}
.news summary{min-height:52px;display:flex;align-items:center;cursor:pointer;font-weight:600;font-size:17px;gap:12px}
.news summary a{margin-left:auto;font-weight:400;font-size:14px}
.news ul{list-style:none;margin:0;padding:0 0 12px}
.news li{display:grid;grid-template-columns:130px 1fr auto;gap:8px 16px;padding:12px 0;border-top:1px solid var(--line);align-items:baseline}

/* footer */
.site-footer{border-top:1px solid var(--line);background:var(--surface)}
.site-footer .wrap{padding-top:20px;padding-bottom:20px;display:flex;flex-wrap:wrap;gap:8px 24px;font-size:13px;color:var(--muted)}
.site-footer .end{margin-left:auto}
.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:10px 16px;border-radius:10px;font-size:14px;max-width:calc(100vw - 32px)}
.toast:empty{display:none}

/* detail page */
.detail{padding-top:24px;padding-bottom:56px}
.crumbs{font-size:14px;color:var(--muted);margin-bottom:20px}
.dhead{display:flex;flex-wrap:wrap;gap:16px 24px;align-items:flex-start;justify-content:space-between;margin-bottom:28px}
.dhead .info{max-width:720px}
.dhead .meta{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.dhead h1{margin:0 0 8px;font:500 38px 'Geist Mono',monospace;letter-spacing:-.02em;overflow-wrap:anywhere}
.dhead .lead{margin:0;font-size:18px;color:var(--muted)}
.dhead .tags{margin-top:12px}
.dhead .actions{display:flex;flex-wrap:wrap;gap:10px}
.cols{display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start}
.col-main{flex:999 1 600px;min-width:0;display:flex;flex-direction:column;gap:20px}
.col-side{flex:1 1 340px;min-width:0;display:flex;flex-direction:column;gap:20px}
.panel{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:20px}
.panel h2{margin:0 0 12px;font-size:16px;font-weight:600}
.panel h3{margin:18px 0 8px;font-size:14px;display:flex;align-items:center;gap:8px}
.panel .hint{margin:0 0 12px;font-size:14px;color:var(--muted)}
pre.sn{margin:0;background:var(--code);color:var(--code-ink);border-radius:10px;padding:16px;overflow-x:auto;font:400 13.5px/1.7 'Geist Mono',monospace;user-select:all}
pre.sn .c{color:var(--code-dim)}
.copyrow{margin-top:12px;display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.ok{color:var(--ok-fg);font-weight:500}.bad{color:var(--err-fg);font-weight:500}
.stats{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.stat{border:1px solid var(--line);border-radius:10px;padding:12px}
.stat .n{font:500 26px 'Geist Mono',monospace}.stat .d{font-size:13px;color:var(--muted)}
.foot{margin:12px 0 0;font-size:12.5px;color:var(--muted)}
.kv{display:grid;grid-template-columns:110px 1fr;gap:6px 12px;font-size:14px;margin:0}
.kv dt{color:var(--muted)}.kv dd{margin:0;overflow-wrap:anywhere}
.risk{border:1px solid var(--hook-fg);border-radius:10px;padding:12px;font:400 13px 'Geist Mono',monospace;overflow-wrap:anywhere;margin-bottom:8px}
.risk.mcp{border-color:var(--mcp-fg)}.risk .k{color:var(--muted)}
.failures{margin:8px 0 0;padding-left:18px;font-size:13px;color:var(--err-fg)}
.md h1,.md h2,.md h3{margin:24px 0 8px;font-size:17px}.md>:first-child{margin-top:0}
.md p{margin:0 0 12px}.md ul,.md ol{margin:0 0 12px;padding-left:20px}
.md code{font:400 13px 'Geist Mono',monospace;background:var(--bg);border:1px solid var(--line);border-radius:5px;padding:1px 6px}
.md pre{background:var(--code);color:var(--code-ink);border-radius:10px;padding:14px;overflow-x:auto}
.md pre code{background:none;border:0;padding:0;color:inherit}
.md img{max-width:100%}.md table{border-collapse:collapse}.md th,.md td{border:1px solid var(--line);padding:6px 10px}

@media (max-width:640px){
  .wrap{padding-left:16px;padding-right:16px}
  .hero{padding-top:24px}.hero h1{font-size:30px}
  .searchbox input{font-size:16px}.searchbox .kbd,.understood .note{display:none}
  .filters .chips{flex-wrap:nowrap;overflow-x:auto;width:100%;margin:0;padding-bottom:2px}
  .filters .label,.divider{display:none}
  .count{margin-left:0;width:100%}
  .news li{grid-template-columns:1fr}
  .dhead h1{font-size:28px}.card{padding:16px}
}
```

- [ ] **Step 4: Write `site/src/loader.js`**

```js
async function fetchOk(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}

export const loadCatalog = async () => (await fetchOk('./catalog.json')).json();
export const loadMeta = async () => (await fetchOk('./meta.json')).json();
export const loadIndexText = async (channel) => (await fetchOk(`./search-${channel}.json`)).text();
export const loadText = async (path) => (await fetchOk(`./${path}`)).text();

export function getStoredChannel() {
  try {
    const v = localStorage.getItem('channel');
    return v === 'stable' || v === 'latest' ? v : null;
  } catch {
    return null;
  }
}

export function storeChannel(value) {
  try {
    localStorage.setItem('channel', value);
  } catch {
    /* blocked storage: the channel then lives in the URL only */
  }
}
```

- [ ] **Step 5: Write `site/src/ui.js`**

```js
import { esc, highlight } from './highlight.js';
import { displayName, tokenLabel, versionLabel } from './data.js';

export const COPY_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/></svg>';

export function detailHref(id, channel) {
  return `artifact.html?id=${encodeURIComponent(id)}${channel === 'stable' ? '&channel=stable' : ''}`;
}

export function cardHtml(item, { terms, channel }) {
  const href = esc(detailHref(item.id, channel));
  const tags = item.tags.slice(0, 4).map((t) => `<span class="tag">#${esc(t)}</span>`).join('');
  return `<article class="card">
<div class="card-top"><span class="b b-${esc(item.type)}">${esc(item.type)}</span><span class="mono muted small">${esc(versionLabel(item.version))}</span></div>
<div><h2 class="card-title"><a href="${href}">${highlight(displayName(item), terms)}</a></h2><div class="small muted">in <span class="mono">${esc(item.plugin)}</span></div></div>
<p class="clamp">${highlight(item.description, terms)}</p>
<div class="tags">${tags}</div>
<div class="card-foot"><span class="mono muted small grow">${esc(tokenLabel(item.tokens))}</span><a class="small" href="${href}">Details</a><button class="btn" type="button" data-copy="${esc(item.plugin)}" aria-label="Copy install snippet for ${esc(item.plugin)}">${COPY_ICON} Copy install</button></div>
</article>`;
}

export function tileHtml(kind, ctx = {}) {
  switch (kind) {
    case 'empty':
      return `<section class="tile"><span class="lbl">Empty marketplace</span><h2>No plugins published yet</h2><p>The marketplace is live and the catalog builds. Plugins will appear here after they are merged to main.</p>${ctx.requestUrl ? `<div class="actions"><a class="btn" href="${esc(ctx.requestUrl)}">Request a skill</a></div>` : ''}</section>`;
    case 'no-results':
      return `<section class="tile"><span class="lbl">No results</span><h2>Nothing matches &quot;${esc(ctx.query)}&quot;</h2><p>Try fewer or broader words, or remove a filter.</p><div class="actions"><button class="btn" type="button" data-action="clear">Clear filters</button><a class="btn btn-p" href="${esc(ctx.requestUrl)}">Request a skill</a></div><span class="small muted">Opens a prefilled GitHub issue with your query.</span></section>`;
    case 'error':
      return `<section class="tile"><span class="lbl">Load failed</span><div class="alert" role="alert"><strong>Could not load the catalog.</strong><br><span class="small">${esc(ctx.message)} Nothing is cached.</span></div><div class="actions"><button class="btn btn-p" type="button" data-action="retry">Retry</button></div></section>`;
    case 'not-found':
      return `<section class="tile"><span class="lbl">Unknown artifact id</span><h2>Artifact not found</h2><p>No artifact with id <span class="mono">${esc(ctx.id)}</span> in this channel. It may have been renamed or removed.</p><div class="actions"><a class="btn btn-p" href="./">Back to search</a></div></section>`;
    case 'not-in-stable':
      return `<section class="tile"><span class="lbl">Channel stable</span><h2>Not available in stable</h2><p class="warn">This artifact has no stable version. Switch to latest to install.</p><div class="actions"><a class="btn btn-p" href="${esc(ctx.switchUrl)}">Open in latest</a><a class="btn" href="./">Back to search</a></div></section>`;
    default:
      return '';
  }
}

export function newsHtml(releases, siteBase) {
  if (!releases.length) return '<li class="muted">No releases yet.</li>';
  return releases.map((r) => {
    const href = esc(detailHref(`${r.plugin}/plugin/${r.plugin}`, 'latest'));
    return `<li><span class="mono muted small">${esc(String(r.date).slice(0, 10))}</span><span><strong class="mono">${esc(`${r.plugin} ${r.version}`)}</strong> <span class="muted">${esc(r.summary)}</span></span><a class="small" href="${siteBase}${href}">Open</a></li>`;
  }).join('');
}
```

- [ ] **Step 6: Write `site/src/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'">
<title>Marketplace catalog</title>
<meta name="description" content="Search skills, agents, commands and plugins in the dev-digest AI marketplace.">
<link rel="stylesheet" href="./style.css">
<link rel="alternate" type="application/atom+xml" title="Marketplace releases" href="./feed.xml">
</head>
<body>
<div class="page">
<header class="site-header">
<div class="wrap">
<a class="brand" href="./">
<svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="9" height="9" rx="2"/><rect x="16" y="3" width="9" height="9" rx="2"/><rect x="3" y="16" width="9" height="9" rx="2"/><path d="M20.5 16v9M16 20.5h9"/></svg>
dev-digest <span class="mono muted brand-sub">marketplace</span>
</a>
<div class="header-actions">
<div class="seg" id="channel" role="group" aria-label="Channel" hidden>
<button type="button" data-channel="latest" aria-pressed="true">latest</button><button type="button" data-channel="stable" aria-pressed="false">stable</button>
</div>
<a class="btn" href="#new">What's new</a>
<a class="btn btn-p" id="request" href="#">Request a skill</a>
</div>
</div>
</header>

<main>
<section class="wrap hero">
<p class="eyebrow" id="eyebrow">Catalog</p>
<h1>Say what you need. Get the artifact and the install line.</h1>
<form class="search" id="search-form" role="search" autocomplete="off">
<label class="sr-only" for="q">Search the catalog</label>
<div class="searchbox">
<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
<input id="q" type="search" placeholder="e.g. I need a skill for code review" spellcheck="false">
<span class="kbd" aria-hidden="true">/</span>
</div>
<div class="understood" id="understood"></div>
</form>
</section>

<section class="wrap filters" aria-label="Filters">
<span class="label">Type</span>
<div class="chips" id="types" role="group" aria-label="Type filters"></div>
<span class="divider"></span>
<label class="label" for="tag">Tag</label>
<select id="tag" class="chip"><option value="">any</option></select>
<label class="label" for="plugin">Plugin</label>
<select id="plugin" class="chip"><option value="">all</option></select>
<span class="count" id="count" role="status" aria-live="polite"></span>
</section>

<section class="wrap grid" id="results" aria-label="Results"><p class="muted">Loading the catalog…</p></section>
<noscript><section class="wrap"><p>The catalog needs JavaScript to search. The release feed is available at <a href="./feed.xml">feed.xml</a>.</p></section></noscript>

<section class="wrap news" id="new">
<details open>
<summary>What's new <a href="./feed.xml">feed.xml (Atom)</a></summary>
<ul id="news-list"></ul>
</details>
</section>
</main>

<footer class="site-footer">
<div class="wrap">
<span>≈ = characters / 4. A real tokenizer may differ by 10-20%.</span>
<span class="mono" id="footer-build"></span>
<span class="end">Declared in plugin files, not independently audited.</span>
</div>
</footer>
</div>
<div class="toast" id="status" role="status" aria-live="polite"></div>
<script type="module" src="./app.js"></script>
</body>
</html>
```

- [ ] **Step 7: Write `site/src/app.js`**

```js
import MiniSearch from './vendor/minisearch.js';
import { searchOptions } from './search-options.js';
import { search } from './search.js';
import { readState, writeState, resolveChannel, TYPES } from './state.js';
import { viewItems, facets } from './data.js';
import { loadCatalog, loadMeta, loadIndexText, getStoredChannel, storeChannel } from './loader.js';
import { cardHtml, tileHtml, newsHtml } from './ui.js';
import { installSteps } from './snippets.js';
import { requestSkillUrl } from './issues.js';
import { copyText } from './clipboard.js';
import { esc } from './highlight.js';

const $ = (id) => document.getElementById(id);
const state = { q: '', types: [], tag: '', plugin: '', channel: 'latest' };
const indexCache = new Map();
let catalog;
let meta;
let items = [];
let ms = null;
let statusTimer;

function say(text) {
  const el = $('status');
  el.textContent = text;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { el.textContent = ''; }, 4000);
}

async function indexFor(channel) {
  if (!indexCache.has(channel)) indexCache.set(channel, MiniSearch.loadJSON(await loadIndexText(channel), searchOptions));
  return indexCache.get(channel);
}

async function selectChannel(channel) {
  state.channel = channel;
  items = viewItems(catalog, channel);
  ms = items.length ? await indexFor(channel) : null;
  const { tags, plugins } = facets(items);
  fillSelect($('tag'), tags, 'any', state.tag);
  fillSelect($('plugin'), plugins, 'all', state.plugin);
  if (!tags.includes(state.tag)) state.tag = '';
  if (!plugins.includes(state.plugin)) state.plugin = '';
  for (const b of $('channel').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.channel === channel));
  $('footer-build').textContent = `build ${meta.commit} · ${channel}`;
  $('eyebrow').textContent = `Catalog · ${items.length} artifact${items.length === 1 ? '' : 's'} · channel ${channel}`;
}

function fillSelect(select, values, anyLabel, current) {
  select.innerHTML = `<option value="">${anyLabel}</option>${values.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('')}`;
  select.value = values.includes(current) ? current : '';
}

function renderTypeChips() {
  const present = new Set(items.map((i) => i.type));
  $('types').innerHTML = TYPES.filter((t) => present.has(t))
    .map((t) => `<button class="chip" type="button" data-type="${t}" aria-pressed="${state.types.includes(t)}">${t}</button>`).join('');
}

function renderUnderstood(query) {
  const el = $('understood');
  if (!state.q.trim()) { el.innerHTML = ''; return; }
  const terms = query.terms.length ? `<span class="term mono">${esc(query.text)}</span>` : '<span class="term mono">no search terms</span>';
  const boost = query.typeBoost ? `<span>boost for type</span><span class="b b-${esc(query.typeBoost)}">${esc(query.typeBoost)}</span>` : '';
  el.innerHTML = `<span>Understood as</span>${terms}${boost}<span class="note">Matches run in your browser. No network call.</span>`;
}

function render() {
  $('request').href = requestSkillUrl(catalog.repo, state.q);
  renderTypeChips();
  if (items.length === 0) {
    $('results').innerHTML = tileHtml('empty', { requestUrl: requestSkillUrl(catalog.repo, '') });
    $('count').textContent = '0 results';
    $('understood').innerHTML = '';
    return;
  }
  const { query, hits } = search({ ms, items, query: state.q, filters: state });
  renderUnderstood(query);
  $('count').textContent = `${hits.length} result${hits.length === 1 ? '' : 's'}${query.terms.length ? ' · sorted by score' : ''}`;
  $('results').innerHTML = hits.length
    ? hits.map((h) => cardHtml(h.item, { terms: query.terms, channel: state.channel })).join('')
    : tileHtml('no-results', { query: state.q || 'these filters', requestUrl: requestSkillUrl(catalog.repo, state.q) });
}

function syncUrl(push) {
  const qs = writeState({ ...state, channel: state.channel });
  const url = `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`;
  if (push) history.pushState(null, '', url); else history.replaceState(null, '', url);
}

function bind() {
  let timer;
  $('q').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.q = e.target.value; render(); syncUrl(false); }, 120);
  });
  $('search-form').addEventListener('submit', (e) => e.preventDefault());
  $('types').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-type]');
    if (!b) return;
    const t = b.dataset.type;
    state.types = state.types.includes(t) ? state.types.filter((x) => x !== t) : [...state.types, t];
    render(); syncUrl(true);
  });
  $('tag').addEventListener('change', (e) => { state.tag = e.target.value; render(); syncUrl(true); });
  $('plugin').addEventListener('change', (e) => { state.plugin = e.target.value; render(); syncUrl(true); });
  $('channel').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-channel]');
    if (!b || b.dataset.channel === state.channel) return;
    storeChannel(b.dataset.channel);
    await selectChannel(b.dataset.channel);
    render(); syncUrl(true);
  });
  $('results').addEventListener('click', async (e) => {
    const copy = e.target.closest('button[data-copy]');
    if (copy) {
      const plugin = copy.dataset.copy;
      const text = installSteps({ repo: catalog.repo, plugin, channel: state.channel, marketplace: catalog.channels[state.channel].marketplace }).map((s) => s.command).join('\n');
      say((await copyText(text)) ? `Copied install snippet for ${plugin}` : 'Clipboard is not available. Open Details and copy the snippet by hand.');
      return;
    }
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'clear') {
      state.q = ''; state.types = []; state.tag = ''; state.plugin = '';
      $('q').value = '';
      $('tag').value = ''; $('plugin').value = '';
      render(); syncUrl(true);
    }
    if (action === 'retry') init();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName ?? '')) {
      e.preventDefault();
      $('q').focus();
    }
  });
  window.addEventListener('popstate', async () => {
    const url = readState(location.search);
    Object.assign(state, { q: url.q, types: url.types, tag: url.tag, plugin: url.plugin });
    $('q').value = state.q;
    const channel = resolveChannel({ fromUrl: url.channel ?? 'latest', stored: null, hasStable: Boolean(catalog.channels.stable) });
    if (channel !== state.channel) await selectChannel(channel);
    $('tag').value = state.tag; $('plugin').value = state.plugin;
    render();
  });
}

let bound = false;
async function init() {
  try {
    [catalog, meta] = await Promise.all([loadCatalog(), loadMeta()]);
    const url = readState(location.search);
    Object.assign(state, { q: url.q, types: url.types, tag: url.tag, plugin: url.plugin });
    $('channel').hidden = !catalog.channels.stable;
    const channel = resolveChannel({ fromUrl: url.channel, stored: getStoredChannel(), hasStable: Boolean(catalog.channels.stable) });
    await selectChannel(channel);
    $('tag').value = state.tag; $('plugin').value = state.plugin;
    $('q').value = state.q;
    $('news-list').innerHTML = newsHtml(catalog.releases.slice(0, 10), '');
    render();
    if (!bound) { bind(); bound = true; }
  } catch (e) {
    $('results').innerHTML = tileHtml('error', { message: e.message });
  }
}

init();
```

- [ ] **Step 8: Delete `.gitkeep`, run tests and look at the page**

```bash
rm -f site/src/.gitkeep
cd site && npm test
```
Expected: PASS (all suites including `ui` and `site-html`).

Then run the dev server and look:

```bash
npm run dev
```
Open `http://localhost:4173/dev-digest-ai-marketplace/`. Check: 6 cards, search "I need a skill for code review" shows the "Understood as" row and `code-review` first, channel toggle switches to stable (2 cards, version v1.0.0), no console errors, no CSP violations in the console. Stop the server with Ctrl+C.

- [ ] **Step 9: Commit**

```bash
git add site/src site/test
git commit -m "feat(site): add styles, card templates and the search page" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Artifact detail page and security panel

**Files:**
- Create: `site/src/artifact.html`, `site/src/artifact.js`
- Modify: `site/src/ui.js` (append `installHtml`, `securityHtml`, `tokensHtml`, `sourceUrl`), `site/src/style.css` (append one rule)
- Test: `site/test/detail-ui.test.mjs`

**Interfaces:**
- Consumes: `ChannelRecord`, `installSteps`, `reportProblemUrl`, `createRenderer`, `loadText`.
- Produces (all return HTML strings, all text escaped):
  - `installHtml({ steps, plugin, ownerNote }): string` (pre with `.c` comment spans, copy button `id="copy"`, status `id="copy-status"`)
  - `tokensHtml(tokens): string`
  - `securityHtml(record): string` (tools, validation, last change, build is added by page, hooks, MCP)
  - `sourceUrl(repo, record): string` = `https://github.com/<repo>/blob/<record.ref>/<record.path>`

- [ ] **Step 1: Write the failing test `site/test/detail-ui.test.mjs`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { installHtml, tokensHtml, securityHtml, sourceUrl } from '../src/ui.js';

const record = {
  version: '1.1.0', description: 'd', tags: [], tokens: { always: 42, onInvoke: 1180 }, path: 'plugins/p/skills/x/SKILL.md', ref: 'main', body: null,
  declared: {
    tools: ['Read', 'Bash(git diff:*)'],
    hooks: [{ event: 'PreToolUse', matcher: 'Bash', command: '<script>alert(1)</script> "quoted"' }],
    mcp: [{ name: 'gh<b>', command: "npx -y 'x'" }],
  },
  validation: { passed: 6, total: 6, failures: [] }, lastChange: '2026-10-14', indexed: true,
};

test('securityHtml escapes hostile hook and mcp text', () => {
  const html = securityHtml(record);
  assert.doesNotMatch(html, /<script|<b>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &quot;quoted&quot;/);
  assert.match(html, /gh&lt;b&gt;/);
  assert.match(html, /Declared in the plugin files, not independently audited\./);
  assert.match(html, /Runs commands on your machine/);
  assert.match(html, /Passed[\s\S]*6 of 6 rules/);
  assert.match(html, /2026-10-14/);
});

test('securityHtml shows failures and unchecked remote plugins', () => {
  const failed = securityHtml({ ...record, validation: { passed: 5, total: 6, failures: ['[changelog] p/CHANGELOG.md: missing'] } });
  assert.match(failed, /Failed[\s\S]*5 of 6 rules/);
  assert.match(failed, /\[changelog\] p\/CHANGELOG.md: missing/);
  assert.match(securityHtml({ ...record, validation: null, indexed: false }), /Not checked \(remote source\)/);
  assert.match(securityHtml({ ...record, declared: { tools: [], hooks: [], mcp: [] } }), /None declared/);
});

test('tokensHtml shows both numbers and a not-available state', () => {
  assert.match(tokensHtml({ always: 42, onInvoke: 1180 }), /≈42[\s\S]*≈1,180/);
  assert.match(tokensHtml(null), /not available/i);
});

test('installHtml renders comment spans and a copy button', () => {
  const html = installHtml({ steps: [{ comment: '# add', command: '/plugin marketplace add o/r' }, { comment: '# install', command: '/plugin install p@m' }], plugin: 'p', ownerNote: true });
  assert.match(html, /<span class="c"># add<\/span>/);
  assert.match(html, /id="copy"/);
  assert.match(html, /owning plugin[\s\S]*p/);
});

test('sourceUrl points at the pinned ref', () => {
  assert.equal(sourceUrl('o/r', record), 'https://github.com/o/r/blob/main/plugins/p/skills/x/SKILL.md');
  assert.equal(sourceUrl('o/r', { ...record, ref: 'p--v1.0.0' }), 'https://github.com/o/r/blob/p--v1.0.0/plugins/p/skills/x/SKILL.md');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd site && node --test test/detail-ui.test.mjs`
Expected: FAIL, "does not provide an export named 'installHtml'".

- [ ] **Step 3: Append to `site/src/ui.js`**

```js
export const sourceUrl = (repo, record) => `https://github.com/${repo}/blob/${record.ref}/${record.path}`;

export function installHtml({ steps, plugin, ownerNote }) {
  const pre = steps.map((s) => `<span class="c">${esc(s.comment)}</span>\n${esc(s.command)}`).join('\n');
  const note = ownerNote ? `<p class="hint">Artifacts are not installed on their own. This is the snippet for the owning plugin, <span class="mono">${esc(plugin)}</span>.</p>` : '';
  return `<h2>Install</h2>${note}<pre class="sn" id="snippet" tabindex="0">${pre}</pre><div class="copyrow"><button class="btn btn-p" type="button" id="copy">Copy snippet</button><span id="copy-status" class="ok" role="status" aria-live="polite"></span></div>`;
}

export function tokensHtml(tokens) {
  if (!tokens) return '<h2>Token cost</h2><p class="hint">Token cost is not available for this artifact type.</p><p class="foot">Estimate = characters / 4. A real tokenizer may differ by 10-20%.</p>';
  const n = (v) => `≈${v.toLocaleString('en-US')}`;
  return `<h2>Token cost</h2><div class="stats"><div class="stat"><div class="n">${n(tokens.always)}</div><div class="d">always in context<br>name + description</div></div><div class="stat"><div class="n">${n(tokens.onInvoke)}</div><div class="d">on invoke<br>markdown body</div></div></div><p class="foot">Estimate = characters / 4. A real tokenizer may differ by 10-20%.</p>`;
}

export function securityHtml(record) {
  const d = record.declared;
  const v = record.validation;
  const validation = !record.indexed || !v
    ? 'Not checked (remote source)'
    : v.failures.length === 0
      ? `<span class="ok">Passed</span> · ${v.passed} of ${v.total} rules`
      : `<span class="bad">Failed</span> · ${v.passed} of ${v.total} rules`;
  const failures = v && v.failures.length ? `<ul class="failures">${v.failures.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : '';
  const tools = d.tools.length ? esc(d.tools.join(', ')) : 'None declared';
  const hooks = d.hooks.map((h) => `<div class="risk"><div class="k">${esc(h.event)}${h.matcher ? ` · matcher ${esc(h.matcher)}` : ''}</div><div>${esc(h.command)}</div></div>`).join('');
  const mcp = d.mcp.map((m) => `<div class="risk mcp"><div class="k">server: ${esc(m.name)}</div><div>${esc(m.command)}</div></div>`).join('');
  return `<h2 id="sec">Security</h2><p class="warn">Declared in the plugin files, not independently audited.</p>
<dl class="kv"><dt>Tools</dt><dd class="mono small">${tools}</dd><dt>Validation</dt><dd>${validation}${failures}</dd><dt>Last change</dt><dd class="mono small">${esc(record.lastChange ?? 'unknown')}</dd><dt>Version</dt><dd class="mono small">${esc(record.version ?? 'n/a')} · ${esc(record.ref)}</dd></dl>
${hooks ? `<h3><span class="b b-hook">hook</span> Runs commands on your machine</h3>${hooks}` : ''}
${mcp ? `<h3><span class="b b-mcp">mcp</span> Runs commands on your machine</h3>${mcp}` : ''}`;
}
```

- [ ] **Step 4: Write `site/src/artifact.html`**

Copy `index.html` and change: `<title>Artifact detail</title>`; remove the `hero`, `filters`, results, news sections, the search form and the `#request` ordering stays; replace `<main>…</main>` with:

```html
<main class="wrap detail" id="main"><p class="muted">Loading…</p></main>
```

Keep the same header (brand, `#channel` seg, `#request` button), the same footer (`#footer-build`), the toast `#status`, and use `<script type="module" src="./artifact.js"></script>`. Remove the "What's new" header link (not on this page).

- [ ] **Step 5: Write `site/src/artifact.js`**

```js
import { marked } from './vendor/marked.js';
import DOMPurify from './vendor/purify.js';
import { createRenderer } from './markdown.js';
import { loadCatalog, loadMeta, loadText, getStoredChannel, storeChannel } from './loader.js';
import { resolveChannel } from './state.js';
import { installSteps } from './snippets.js';
import { reportProblemUrl, requestSkillUrl } from './issues.js';
import { copyText, selectContents } from './clipboard.js';
import { displayName, versionLabel } from './data.js';
import { esc } from './highlight.js';
import { tileHtml, installHtml, tokensHtml, securityHtml, sourceUrl, detailHref } from './ui.js';

const $ = (id) => document.getElementById(id);
const render = createRenderer({ marked, purify: DOMPurify });
const params = new URLSearchParams(location.search);
const id = params.get('id') ?? '';

function setChannelButtons(channel) {
  for (const b of $('channel').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.channel === channel));
}

async function main() {
  const root = $('main');
  let catalog;
  let meta;
  try {
    [catalog, meta] = await Promise.all([loadCatalog(), loadMeta()]);
  } catch (e) {
    root.innerHTML = tileHtml('error', { message: e.message });
    root.addEventListener('click', (ev) => { if (ev.target.closest('[data-action="retry"]')) location.reload(); });
    return;
  }
  const hasStable = Boolean(catalog.channels.stable);
  const channel = resolveChannel({ fromUrl: params.get('channel'), stored: getStoredChannel(), hasStable });
  $('channel').hidden = !hasStable;
  setChannelButtons(channel);
  $('footer-build').textContent = `build ${meta.commit} · ${channel}`;
  $('request').href = requestSkillUrl(catalog.repo, '');
  $('channel').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-channel]');
    if (!b) return;
    storeChannel(b.dataset.channel);
    location.href = detailHref(id, b.dataset.channel);
  });

  const art = catalog.artifacts.find((a) => a.id === id);
  document.title = art ? `${displayName(art)} · catalog` : 'Artifact not found';
  if (!art) {
    root.innerHTML = tileHtml('not-found', { id });
    return;
  }
  const rec = art.channels[channel];
  if (!rec) {
    const other = channel === 'stable' ? 'latest' : 'stable';
    root.innerHTML = tileHtml('not-in-stable', { switchUrl: detailHref(id, other) });
    return;
  }

  const steps = installSteps({ repo: catalog.repo, plugin: art.plugin, channel, marketplace: catalog.channels[channel].marketplace });
  const tags = rec.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join('');
  const bodyTitle = art.type === 'skill' ? 'SKILL.md' : art.type === 'plugin' ? 'README.md' : `${art.type} file`;
  root.innerHTML = `
<nav class="crumbs" aria-label="Breadcrumb"><a href="./">Catalog</a> / <span class="mono">${esc(art.plugin)}</span> / <span class="mono">${esc(displayName(art))}</span></nav>
<div class="dhead">
<div class="info">
<div class="meta"><span class="b b-${esc(art.type)}">${esc(art.type)}</span><span class="mono muted small">${esc(versionLabel(rec.version))} · ${esc(channel)}</span></div>
<h1>${esc(displayName(art))}</h1>
<p class="lead">${esc(rec.description)}</p>
<div class="tags">${tags}</div>
</div>
<div class="actions">
<a class="btn" href="${esc(sourceUrl(catalog.repo, rec))}">View source on GitHub</a>
<a class="btn" href="${esc(reportProblemUrl(catalog.repo, { id, version: rec.version, channel }))}">Report a problem</a>
</div>
</div>
<div class="cols">
<div class="col-main">
<section class="panel" id="install">${installHtml({ steps, plugin: art.plugin, ownerNote: art.type !== 'plugin' })}</section>
${rec.body ? `<section class="panel md" aria-label="Artifact body" id="body"><h2>${esc(bodyTitle)}</h2><div id="md">Loading…</div></section>` : ''}
</div>
<aside class="col-side">
<section class="panel">${tokensHtml(rec.tokens)}</section>
<section class="panel" aria-labelledby="sec">${securityHtml(rec)}</section>
<section class="panel"><h2>Source</h2><p class="mono small muted">${esc(`github.com/${catalog.repo}/blob/${rec.ref}/${rec.path}`)}</p></section>
</aside>
</div>`;

  $('copy').addEventListener('click', async () => {
    const text = steps.map((s) => s.command).join('\n');
    const ok = await copyText(text);
    if (!ok) selectContents($('snippet'));
    $('copy-status').textContent = ok ? 'Copied' : 'Clipboard is not available. Press Ctrl/Cmd+C to copy the selected text.';
  });
  $('snippet').addEventListener('focus', () => selectContents($('snippet')));

  if (rec.body) {
    try {
      $('md').innerHTML = render(await loadText(rec.body));
    } catch (e) {
      $('md').textContent = `Could not load the documentation (${e.message}).`;
    }
  }
}

main();
```

Also append `.panel p.mono{overflow-wrap:anywhere}` to `style.css` so the long source path wraps.

- [ ] **Step 6: Run tests**

Run: `cd site && npm test`
Expected: PASS, including `detail-ui` and `site-html` (which now sees `artifact.html`; it must have CSP, no inline style/script).

- [ ] **Step 7: Verify in the browser**

```bash
npm run dev
```
Open `…/artifact.html?id=demo-plugin%2Fskill%2Fcode-review` and check: header, install block with Copy (button text "Copied"), token tiles (≈ numbers), security panel (hook and MCP boxes), rendered SKILL.md body, source link; `?channel=stable` shows v1.0.0; `?id=demo-plugin%2Fagent%2Fcode-reviewer&channel=stable` shows "Not available in stable"; `?id=nope` shows "Artifact not found". No console errors or CSP violations.

- [ ] **Step 8: Commit**

```bash
git add site/src site/test
git commit -m "feat(site): add artifact detail page and security panel" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Pages workflow, issue templates and docs

**Files:**
- Create: `.github/workflows/pages.yml`, `.github/ISSUE_TEMPLATE/request-skill.yml`, `.github/ISSUE_TEMPLATE/report-problem.yml`
- Modify: `README.md` (append a Catalog section), `CONTRIBUTING.md` (one line)

**Interfaces:**
- Consumes: `npm ci`, `npm test`, `npm run build` in `site/`.
- Produces: Pages artifact `site/dist` deployed by `actions/deploy-pages`.

- [ ] **Step 1: Write `.github/workflows/pages.yml`**

```yaml
name: pages

on:
  push:
    branches: [main, stable]
  pull_request:
    paths:
      - 'site/**'
      - 'plugins/**'
      - '.claude-plugin/**'
      - '.github/workflows/pages.yml'
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: ${{ github.event_name == 'pull_request' && format('pages-pr-{0}', github.ref) || 'pages' }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          # Always build from main (pushes to "stable" must not check out a branch that only holds marketplace.json).
          ref: ${{ github.event_name == 'pull_request' && github.sha || 'main' }}
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: site/package-lock.json

      - name: Install
        working-directory: site
        run: npm ci

      - name: Test
        working-directory: site
        run: npm test

      - name: Build catalog
        working-directory: site
        run: npm run build

      - uses: actions/configure-pages@v5
        if: github.event_name != 'pull_request'

      - uses: actions/upload-pages-artifact@v3
        if: github.event_name != 'pull_request'
        with:
          path: site/dist

  deploy:
    needs: build
    if: github.event_name != 'pull_request'
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Write the issue templates**

`.github/ISSUE_TEMPLATE/request-skill.yml`:

```yaml
name: Request a skill
description: Ask for a skill, agent, command or plugin the marketplace does not have yet.
title: "Request: "
labels: ["request"]
body:
  - type: input
    id: query
    attributes:
      label: What were you searching for?
      description: The words you typed into the catalog.
    validations:
      required: false
  - type: textarea
    id: need
    attributes:
      label: What do you need it to do?
      description: The task, the inputs and what a good result looks like.
    validations:
      required: true
```

`.github/ISSUE_TEMPLATE/report-problem.yml`:

```yaml
name: Report a problem
description: Something is wrong with an artifact or with the catalog site.
title: "Problem: "
labels: ["bug"]
body:
  - type: input
    id: artifact
    attributes:
      label: Artifact
      description: Id, version and channel (prefilled from the catalog).
    validations:
      required: false
  - type: textarea
    id: problem
    attributes:
      label: What happened?
      description: What you did, what you expected and what you saw.
    validations:
      required: true
```

- [ ] **Step 3: Document it.** Append to `README.md`:

```markdown
## Catalog

Search the marketplace in the browser: https://otkachuk777.github.io/dev-digest-ai-marketplace/

The site lives in [`site/`](site/README.md), is built from `main` (latest) and from the release tags pinned in the `stable` branch, and is deployed by `.github/workflows/pages.yml`.
```

Append to the list under "Validate locally" in `CONTRIBUTING.md` step 3 one more command line inside the code block: `(cd site && npm ci && npm test)` with the note "when you change `site/`".

- [ ] **Step 4: Validate the workflow syntax locally**

```bash
cd /Users/olehtkachuk/_Projects/GoIT/dev-digest-ai-marketplace
node -e "const y=require('node:fs').readFileSync('.github/workflows/pages.yml','utf8'); if(!/deploy-pages@v4/.test(y)) process.exit(1)"
```
Expected: exit 0. (There is no yaml parser dependency; GitHub validates the file on the PR run.)

- [ ] **Step 5: Commit**

```bash
git add .github README.md CONTRIBUTING.md
git commit -m "ci: add Pages workflow, issue templates and catalog docs" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Real-repo build, acceptance, PR and Pages

**Files:** none new (fixes found during acceptance go in their own commits).

- [ ] **Step 1: Full suite and a real-repo build**

```bash
cd site && npm test && npm run build
```
Expected: tests PASS. Build prints `Built 0 artifact(s); stable channel: no` (the real marketplace has no plugins yet and no `stable` branch; `origin/stable` is absent, which must not be an error).

- [ ] **Step 2: Serve the real build and check the empty state**

```bash
npm run serve
```
Open `http://localhost:4173/dev-digest-ai-marketplace/`. Expected: eyebrow "Catalog · 0 artifacts · channel latest", the "No plugins published yet" tile, no channel toggle, empty "No releases yet." in What's new, no console errors. Stop the server.

- [ ] **Step 3: Fixture acceptance in the Browser pane** (`npm run dev`), checking each item once:
  - Search `I need a skill for code review`: "Understood as `code review` boost for type `skill`", `code-review` first, count text, highlighted matches.
  - `?q=...&type=skill&channel=stable` loaded directly restores the same view.
  - Type chips toggle and are `aria-pressed`; Tag and Plugin selects filter; Clear filters works.
  - Query `pdf converter` shows "Nothing matches"; Request a skill link opens an issue URL containing `query=pdf+converter`.
  - Copy install on a card shows the toast; the detail page Copy shows "Copied".
  - Channel switch persists after reload (localStorage) and `?channel=` overrides it.
  - Detail page of every type (plugin, skill, agent, command, hook, mcp) renders; hook and MCP show the "Runs commands on your machine" boxes.
  - Resize to 390 px: no horizontal scroll, type chips scroll horizontally, cards single column.
  - Emulate dark colour scheme: all text readable, badges legible.
  - Keyboard: `/` focuses search, Tab order is logical, focus ring visible.
  - `feed.xml` opens and lists two entries.
  Record any defect, fix it test-first, commit separately.

- [ ] **Step 4: Push the branch and open the PR**

```bash
cd /Users/olehtkachuk/_Projects/GoIT/dev-digest-ai-marketplace
git push -u origin feat/pages-catalog
gh pr create --title "feat: catalog site on GitHub Pages" --body "$(cat <<'EOF'
## What

Static catalog for the marketplace in `site/`: natural-language search, cards, detail pages, install snippets, token cost, latest/stable channels, security panel, releases feed. Spec: `docs/superpowers/specs/2026-10-14-pages-catalog-design.md` (see section 16 for plan-phase amendments). Plan: `docs/cc-plans/2026-10-14+pages-catalog.md`.

## Checks

- `cd site && npm test`
- `pages.yml` builds on this PR (no deploy); deploy runs after merge to `main`

## After merge

Repo Settings → Pages → Source = GitHub Actions (one time).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Then use the ccd_pr tools: `get_status`, and `bind_pr` if the PR is not reported. Read CI and offer Auto-fix; do not poll CI yourself.

- [ ] **Step 5: Enable Pages (needs the user's explicit yes, it changes repo settings)**

Ask the user, then run:

```bash
gh api -X POST repos/otkachuk777/dev-digest-ai-marketplace/pages -f build_type=workflow
```
If the API says Pages already exists, use `gh api -X PUT repos/otkachuk777/dev-digest-ai-marketplace/pages -f build_type=workflow`. Alternative for the user: Settings → Pages → Source = GitHub Actions.

- [ ] **Step 6: After the PR is merged and `pages` has deployed**, open `https://otkachuk777.github.io/dev-digest-ai-marketplace/` in the Browser pane and check: the page loads under the sub-path, `catalog.json` and the fonts return 200, console is clean, empty state is shown. Report the URL to the user.

---

## Self-Review (done while writing)

**Spec coverage:** search + cards (T9, T10); filters and URL state (T9 state, T10 app); detail page (T11); copy-install and channel snippets (T9 snippets, T10, T11); cost baseline (T3 tokens, T6 sums, T11 tiles); latest/stable (T5, T6, T10, T11); security panel incl. validation, hooks, MCP, disclaimer, build sha (T4, T11); What's new + Atom (T5 releases, T7 feed, T10 news); issue buttons and templates (T9 issues, T12); workflow and Pages (T12, T13); CSP, sanitization, relative paths (T9, T10 `site-html` test, T8 dev server under the sub-path); error handling table (T5 missing sha/stable, T8 empty/invalid, T10 tiles, T11 not found/not in stable); accessibility (T10 CSS + manual T13); tests (each task) and schema check (T6, enforced in T8 build).

**Placeholders:** none; no TBD/TODO and no "similar to task N". Inline styles are forbidden by the `site-html` test, so a leftover would fail Task 10/11.

**Type consistency:** `RawArtifact`, `PluginData`, `ChannelData`, `ChannelRecord` fields are used with the same names in T3, T5, T6, T9, T10, T11. `viewItems` item shape matches `cardHtml`. `installSteps` returns `{comment, command}` used by `installHtml` and the copy handlers. `tileHtml` kinds match their callers.

**Known design deviations (all listed in spec section 16):** chips are filters, not auto-pressed from the boost; the "Not available in stable" state appears on the detail page, not as a card in the stable list; Geist is self-hosted; stable validation failures are non-fatal.
