# dev-digest-ai-marketplace

Claude Code plugin marketplace with the reusable AI engineering harness extracted from DevDigest:
spec-driven development agents, research tools, architecture review and engineering best-practice skills.

> Status: skeleton. Plugins are added in follow-up pull requests.

## Install

Add the marketplace, then install a plugin from it:

```bash
claude plugin marketplace add otkachuk777/dev-digest-ai-marketplace --scope project
claude plugin install <plugin>@dev-digest-ai-marketplace --scope project
claude plugin list --json
```

Start a new session or run `/reload-plugins` afterwards.

## Repository layout

```text
.claude-plugin/marketplace.json   marketplace catalog (name, owner, plugin entries)
plugins/<name>/                   one directory per plugin, each with .claude-plugin/plugin.json
docs/                             guidelines, security and release documentation
.github/workflows/                CI (validation) and the Pages deploy
site/                             catalog site (search UI and build)
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md), [docs/PLUGIN-GUIDELINES.md](docs/PLUGIN-GUIDELINES.md) and [docs/SECURITY.md](docs/SECURITY.md).

## Catalog

Search the marketplace in the browser: https://otkachuk777.github.io/dev-digest-ai-marketplace/

The site lives in [`site/`](site/README.md), is built from `main` (latest) and from the release tags pinned in the `stable` branch, and is deployed by `.github/workflows/pages.yml`.
