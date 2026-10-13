# Specification: UI catalog on GitHub Pages

Date: 2026-10-14
Status: draft, awaiting review
Repo: `otkachuk777/dev-digest-ai-marketplace`
Site URL: `https://otkachuk777.github.io/dev-digest-ai-marketplace/`

## 1. Goal

A static site on GitHub Pages that lets users of the marketplace find and install artifacts
(plugins, skills, agents, commands, hooks) by typing what they need in plain English
("I need a skill for code review") and seeing matching artifacts as cards.

Success criteria:
- A query returns relevant cards in under 100 ms on the client, with no network call after page load.
- Every card has a working copy-paste install snippet for the selected channel (latest / stable).
- The catalog rebuilds and redeploys automatically on every merge to `main` or `stable`, with no manual step.
- The site works with zero backend, zero secrets, zero third-party runtime services.

## 2. Constraints and decisions

| Topic | Decision |
|---|---|
| Hosting | GitHub Pages, static files only, no backend, no secrets |
| Language | UI, artifact descriptions and queries: English only. No synonym dictionary |
| Stack | Vanilla JS (ES modules) + Node build scripts. Runtime dependencies: MiniSearch, a markdown renderer and DOMPurify (vendored into `dist/`, no CDN at runtime) |
| Token cost | Estimate `ceil(chars / 4)`, always displayed with a `≈` prefix |
| Channels | `main` = latest, branch `stable` = stable, each with its own `marketplace.json` (different `name`) in the same repo |
| Dev data | `plugins/` is empty today. A fixture plugin is used in dev and tests, never published |

## 3. Scope

### In v1
1. Keyword search over all artifact content, rendered as cards.
2. Filters: type, tag, plugin. Query and filters are stored in the URL.
3. Artifact detail page.
4. Copy-install snippets.
5. Cost baseline (token estimate per artifact).
6. Channel switch latest / stable.
7. Security panel (declared permissions, hooks, MCP, validation status).
8. What's new feed with an Atom file.
9. Issue buttons: "Request a skill", "Report a problem".

### Out of v1 (v2 candidates)
Bundle builder (`settings.json` generator), semantic search with embeddings, PWA/offline,
side-by-side plugin comparison, usage analytics, ratings, comments.

## 4. Architecture

```
git (main, stable)
   │
   ▼
GitHub Action (pages.yml)
   │  build: scan → parse → estimate tokens → validate → write JSON + feed
   ▼
site/dist/  ── catalog.json, search-index.json, feed.xml, html/js/css, vendored libs
   │
   ▼  upload-pages-artifact + deploy-pages
GitHub Pages ──► browser (search, filter, render, build snippets locally)
```

All logic that needs repo access runs at build time. The browser only reads static JSON.

## 5. Repo layout (new files)

```
site/
  build/
    scan.mjs          # find plugins and artifacts in a checkout
    parse.mjs         # frontmatter + body extraction
    tokens.mjs        # chars/4 estimate
    validate.mjs      # schema checks on collected data
    channels.mjs      # merge latest + stable into one catalog
    feed.mjs          # Atom generation
    index.mjs         # entry point: orchestrates, writes dist/
  src/
    index.html        # search page
    artifact.html     # detail page (?id=)
    app.js            # search page logic
    artifact.js       # detail page logic
    search.js         # MiniSearch wrapper + query normalization
    snippets.js       # install snippet builder per channel
    style.css
  fixtures/
    plugins/demo-plugin/...   # test and dev data only
  test/
    *.test.mjs        # node:test
.github/
  workflows/pages.yml
  ISSUE_TEMPLATE/
    request-skill.yml
    report-problem.yml
```

## 6. Build pipeline

### 6.1 Inputs
The workflow checks out two refs: `main` into `./_latest` and `stable` into `./_stable`.
If `stable` does not exist, the build continues with latest only and the channel switch is hidden.

### 6.2 Discovery (per channel)
Read `.claude-plugin/marketplace.json`. For each entry in `plugins`, resolve its directory
(local `source` paths only in v1; remote `source` entries are listed as plugin-level cards
with no deep indexing and a flag `indexed: false`). Inside a plugin directory:

| Artifact | Location | Source of metadata |
|---|---|---|
| plugin | `.claude-plugin/plugin.json` | json: name, description, version, keywords |
| skill | `skills/<name>/SKILL.md` | frontmatter: name, description, allowed-tools |
| agent | `agents/*.md` | frontmatter: name, description, tools, model |
| command | `commands/*.md` | frontmatter: description, allowed-tools |
| hook | `hooks/hooks.json` | event + matcher + command, no description |
| MCP server | `.mcp.json` | server names and commands |

Unknown files are ignored. A malformed artifact fails the build in either channel (see 11).

### 6.3 Artifact record

```jsonc
{
  "id": "plugin-name/skill/skill-name",     // stable, URL-safe, unique
  "type": "plugin|skill|agent|command|hook|mcp",
  "name": "skill-name",
  "plugin": "plugin-name",
  "description": "…",
  "tags": ["review","git"],                  // plugin keywords + frontmatter tags, lowercased
  "body": "…",                               // markdown, kept for the detail page
  "path": "plugins/plugin-name/skills/skill-name/SKILL.md",
  "channels": {
    "latest": { "version": "1.1.0", "marketplace": "dev-digest-ai-marketplace" },
    "stable": { "version": "1.0.0", "marketplace": "dev-digest-ai-marketplace-stable" }
  },
  "tokens": { "always": 42, "onInvoke": 1180 },
  "declared": {
    "tools": ["Read","Grep"],
    "hooks": [{"event":"PreToolUse","matcher":"Bash","command":"…"}],
    "mcp": [{"name":"x","command":"…"}]
  }
}
```

An artifact missing from a channel has no entry under that channel key. The card then shows
"not available in stable".

### 6.4 Token estimate
- `always` = estimate of `name + description` for skills, agents and commands (this is the part
  that sits in context permanently).
- `onInvoke` = estimate of the markdown body (loaded only when invoked).
- Plugin card: sums of children. Hooks and MCP: no estimate shown ("n/a"), because their
  runtime cost is not derivable from files.
- UI always shows `≈` and a footnote: "estimate = characters / 4, real tokenizer may differ by 10-20%".

### 6.5 Search index
One MiniSearch document per artifact. Fields and boosts: `name` ×5, `tags` ×3,
`description` ×2, `body` ×1 (body truncated to 4 000 chars for the index only).
Serialized with `MiniSearch.toJSON()` into `search-index.json`. The detail page uses
`catalog.json`, never the index.

### 6.6 Feed
`feed.xml` (Atom). One entry per version change of a plugin: title `"<plugin> <version>"`,
date from the commit date of the change to `plugin.json` version, summary from
`CHANGELOG.md` section if present, otherwise the commit subject. Entries cover the last
50 changes. Computed with `git log` on the checkouts (workflow uses `fetch-depth: 0`).

### 6.7 Output
`site/dist/`: `index.html`, `artifact.html`, `app.js`, `artifact.js`, `search.js`,
`snippets.js`, `style.css`, `vendor/*`, `catalog.json`, `search-index.json`, `feed.xml`,
`meta.json` (`{builtAt, commitLatest, commitStable, repo, marketplaces}`).
All internal links and fetches are relative so the site works under the `/dev-digest-ai-marketplace/`
base path and when served locally.

## 7. Client behavior

### 7.1 Search page
- Search box, focused on load. Debounce 120 ms.
- Query normalization before MiniSearch: lowercase, strip punctuation, remove a fixed English
  stopword list (e.g. "i", "need", "a", "for", "the", "me", "want", "help", "with").
  The words `skill`, `agent`, `plugin`, `command`, `hook` are not stopwords: when present they
  add a boost to artifacts of that type, they do not filter. So "I need a skill for code review"
  becomes terms `code review` with a boost for type `skill`.
- MiniSearch options: `prefix: true`, `fuzzy: 0.2`, `combineWith: 'OR'` with results sorted by score
  (AND matches naturally score higher).
- Empty query shows all artifacts grouped by plugin, newest version first.
- No results: message with the normalized terms, a hint to broaden the query, and the
  "Request a skill" button.
- Filters: type (multi), tag (multi), plugin (single). Filters apply after search.
- URL state: `?q=code+review&type=skill&tag=git&plugin=x&channel=stable`. Loading such a URL
  reproduces the view. History uses `replaceState` while typing and `pushState` on filter change.

### 7.2 Card
Type badge, name, plugin, description (2-line clamp), tags, `v<version>` for the active channel,
`≈N tokens always`, a Copy install button, link to the detail page. Matched terms highlighted
in name and description.

### 7.3 Detail page (`artifact.html?id=…`)
- Header like the card, plus link to the source on GitHub
  (`https://github.com/<repo>/blob/<ref>/<path>`, `<ref>` = `main` or `stable` per channel).
- Rendered markdown body (sanitized, see 10).
- Token panel: `always` and `onInvoke`.
- Security panel (7.5).
- Install block with the snippets for the active channel.
- Unknown `id`: 404-style message with a link back to search.

### 7.4 Channel switch
Toggle `latest | stable` in the header. Default `latest`. Persisted in `localStorage`
(wrapped in try/catch, falls back to URL param only). It changes:
- the version shown on cards,
- the marketplace name and ref used in install snippets,
- the source link ref.
Hidden entirely when the catalog has no stable data.

### 7.5 Install snippets (built in `snippets.js`)
```
/plugin marketplace add otkachuk777/dev-digest-ai-marketplace          # latest
/plugin install <plugin>@dev-digest-ai-marketplace

/plugin marketplace add otkachuk777/dev-digest-ai-marketplace#stable   # stable (ref syntax: see Open item 1)
/plugin install <plugin>@dev-digest-ai-marketplace-stable
```
Skill/agent/command cards give the snippet of their owning plugin (artifacts are not installable
separately) and say so.

### 7.6 Security panel
Shows, from `declared`:
- tools requested (`allowed-tools` / `tools`),
- hooks (event, matcher, command),
- MCP servers (name, command),
- build validation result (passed / failed per rule),
- date of the last change of the plugin.

Hooks and MCP entries are highlighted as "executes commands on your machine".
Fixed disclaimer: "Declared in the plugin files, not independently audited."
Panel also shows the commit sha of the build (`meta.json`).

### 7.7 What's new
A "What's new" section on the home page (below search, collapsed) listing the 10 latest feed
entries, plus a link to `feed.xml` and `<link rel="alternate" type="application/atom+xml">` in `<head>`.

### 7.8 Issue buttons
Header and no-results state link to
`https://github.com/otkachuk777/dev-digest-ai-marketplace/issues/new?template=request-skill.yml&title=<encoded>`
(prefilled with the current query) and `report-problem.yml` (prefilled with artifact id and version
on the detail page). No user data is sent anywhere except opening the GitHub URL the user clicks.

## 8. Workflow: `.github/workflows/pages.yml`

- Triggers: `push` to `main` and `stable`, `workflow_dispatch`.
- Permissions: `contents: read`, `pages: write`, `id-token: write`.
- Concurrency group `pages`, `cancel-in-progress: false`.
- Steps: checkout `main` → `_latest`, checkout `stable` → `_stable` (continue-on-error) →
  setup-node (pinned LTS) → `npm ci` in `site/` → `npm test` → `node site/build/index.mjs` →
  `actions/configure-pages` → `actions/upload-pages-artifact` (path `site/dist`) → `actions/deploy-pages`.
- Both `main` and `stable` pushes rebuild the whole site, so the two channels never go stale
  relative to each other.
- Actions pinned by full commit SHA.
- One-time manual setup (documented in README): repo Settings → Pages → Source = "GitHub Actions".

## 9. Data flow summary

1. Merge to `main` or `stable`.
2. Workflow builds `catalog.json`, `search-index.json`, `feed.xml`, `meta.json`.
3. Browser loads HTML, then fetches `catalog.json` and `search-index.json` once, caches in memory.
4. Typing runs MiniSearch locally; filters and channel are applied in memory; URL updated.
5. Copy buttons write the snippet to the clipboard (`navigator.clipboard`, fallback to
   selecting the text in a `<pre>`).

## 10. Security

- All markdown from artifacts is untrusted: rendered with a markdown library with raw HTML disabled,
  then passed through DOMPurify. Links get `rel="noopener noreferrer"`; `javascript:` URLs removed.
- Strict `Content-Security-Policy` meta tag: `default-src 'self'; img-src 'self' data: https:;
  style-src 'self'; script-src 'self'; base-uri 'self'; form-action 'none'`. No inline scripts.
- No cookies, no analytics, no external requests at runtime.
- Build treats repo content as data: no code from plugins is executed; hook commands are only displayed.

## 11. Error handling

| Situation | Behavior |
|---|---|
| `plugins/` empty | Build succeeds; site shows "No plugins published yet" and still renders |
| Missing/invalid frontmatter in an artifact | Build fails with file path and rule violated |
| Duplicate artifact `id` | Build fails |
| `stable` branch missing | Build succeeds, stable features hidden |
| Plugin version in `plugin.json` ≠ `marketplace.json` entry | Build fails |
| `catalog.json` fetch fails in browser | Error panel with retry button; no stale cache |
| `localStorage` unavailable | Channel kept via URL only |
| Clipboard API unavailable | Fallback to selectable text |

## 12. Testing

Using `node:test`, run in CI before deploy.
- `parse`: frontmatter variants (missing, extra keys, multiline description, CRLF).
- `tokens`: known strings → expected `ceil(n/4)`.
- `scan` + `index` against `site/fixtures`: expected artifact count, ids, tags, tokens.
- `channels`: artifact in both / only latest / only stable.
- `validate`: each failure row of section 11 produces a failing result with a clear message.
- `search`: normalization ("I need a skill for code review" → terms `code review`, boost `skill`);
  ranking smoke test on fixtures (name match outranks body match).
- `snippets`: latest vs stable output exact strings.
- `feed`: valid Atom (well-formed XML, required elements).
- A final CI check validates `catalog.json` against a JSON schema stored in `site/build/catalog.schema.json`.
- Manual acceptance on the deployed URL: search, filter, URL restore, channel switch, copy,
  detail page, feed, issue links (checklist in the implementation plan).

## 13. Accessibility and UX baseline

- Semantic HTML, labeled search input, visible focus, keyboard-operable cards and buttons.
- Results region is `aria-live="polite"` and announces the result count.
- Color contrast AA in light and dark (`prefers-color-scheme`).
- Responsive down to 360 px width, no horizontal scroll.

## 14. Open items to verify during implementation

1. Exact syntax to add a marketplace pinned to a branch (`owner/repo#stable` vs git URL with ref).
   If unsupported, the stable marketplace is added by its git URL plus the documented ref option.
   Verify with `claude plugin marketplace add` before finalizing `snippets.js`.
2. Remote (non-local) `source` plugins: v1 lists them as unindexed cards; confirm that is acceptable
   once real plugins exist.
3. Whether `claude plugin validate` can run in the Pages workflow; if so, its result replaces the
   homegrown validation status in the security panel.

## 15. Out of scope (reminder)

Analytics, ratings, comments, accounts, any server component, LLM-based or embedding search.
