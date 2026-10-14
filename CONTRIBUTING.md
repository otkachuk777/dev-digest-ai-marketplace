# Contributing

## Workflow

1. Branch from `main`.
2. Change a plugin under `plugins/<name>/` or the catalog in `.claude-plugin/marketplace.json`.
3. Validate locally:
   ```bash
   claude plugin validate .
   claude plugin validate ./plugins/<name>
   node scripts/check-release.mjs
   node --test "scripts/test/*.test.mjs"
   (cd site && npm ci && npm test)  # when you change site/
   ```
4. Open a pull request. CI runs the same validation and must be green.
5. A code owner reviews and merges. Direct pushes to `main` are not allowed.

## Rules of thumb

- `plugin.json` is the source of truth for a plugin's version and components. Do not repeat `version` in the marketplace entry.
- Marketplace entry `name` must equal the `name` in the plugin's `plugin.json`.
- Plugin sources are relative paths from the repository root, written as `./plugins/<name>`.
- Never commit credentials, tokens or personal paths.

Full rules: [docs/PLUGIN-GUIDELINES.md](docs/PLUGIN-GUIDELINES.md).
