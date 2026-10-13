# Marketplace catalog site

Static catalog for the marketplace, published to GitHub Pages. Self-contained: it reads the repository at build time and imports nothing from `../scripts`.

## Develop

```bash
cd site
npm ci
npm test
npm run dev        # builds a fixture repo (demo-plugin 1.0.0 / 1.1.0 + stable branch) and serves http://127.0.0.1:4173/dev-digest-ai-marketplace/
```

## Build against the real repository

```bash
npm run build      # reads ../ (main working tree) and origin/stable, writes dist/
npm run serve      # serves dist/ under the Pages base path
```

## Refreshing after a stable update

A push to the `stable` branch does not trigger the Pages workflow (that branch has no workflow file). Refresh the site with:

```bash
gh workflow run pages.yml
```

A daily scheduled run does the same, so stable changes appear within a day.

## How it works

- `build/` produces `dist/catalog.json`, `search-latest.json`, `search-stable.json`, `bodies/`, `feed.xml`, `meta.json`.
- `src/` is the client, copied into `dist/` as is. Libraries and fonts are vendored into `dist/vendor` and `dist/fonts`.
- `latest` = `main`. `stable` = release tags pinned in the `stable` branch (`scripts/build-stable.mjs --publish` creates it).
- Deployed by `.github/workflows/pages.yml`. One-time setup: repo Settings → Pages → Source = GitHub Actions.

## Known limitations (v1)

- Commands in nested folders (`commands/<dir>/*.md`) are not indexed.
- Custom component paths in `plugin.json` (`commands`, `agents`, `skills` fields) are not indexed.
- Relative links and images inside README/SKILL markdown resolve against the Pages site, not the repository.
- Pages caches static files for about 10 minutes after a deploy.
- A command or agent without a frontmatter `description` fails the latest build (spec section 11).
