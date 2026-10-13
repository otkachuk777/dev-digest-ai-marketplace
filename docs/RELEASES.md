# Releases and rollback

## Versioning

- Each plugin is versioned independently with SemVer in its `plugin.json`.
- Patch: wording or bug fixes. Minor: new behaviour, backwards compatible. Major: breaking change.
- Users get an update only when `version` changes, so every release bumps it.

## Release checklist

1. Update the plugin's `CHANGELOG.md` (add a `## <version>` section) and bump `version` in `plugin.json`.
2. Merge the pull request after CI is green. CI runs `claude plugin validate`, `scripts/check-release.mjs` and the script tests.
3. Pull `main`, then release from the repository root:
   ```bash
   git switch main && git pull
   node scripts/release.mjs <plugin>
   ```
   The script runs the release checks, shows a dry run of `claude plugin tag`, asks for confirmation, then creates and pushes the tag `<plugin>--v<version>`, for example `sdd-engineering--v1.0.0`.
4. Release dependencies first. The check refuses a plugin whose dependency range has no matching tag yet.

Tags are immutable. A tag always points at a commit that passed CI. Never move or reuse a tag; ship a new version instead.

### What the checks cover

`node scripts/check-release.mjs` (all plugins) fails when:

- a marketplace entry name differs from the `name` in `plugin.json`, or the entry repeats `version`;
- `version` is not SemVer, or `CHANGELOG.md` has no `## <version>` section, or `README.md`/`CHANGELOG.md` is missing;
- a dependency is not in this marketplace, its local version does not satisfy the range, or dependencies form a cycle.

With `--plugin <name>` it also fails when the working tree is dirty, the tag already exists, HEAD is not `origin/main`, or a dependency has no released tag satisfying its range.

## Rollback

Claude Code has no `plugin rollback` command. Roll back through a stable marketplace pinned to released tags. It has its own `name`, `<marketplace>-stable`, because a marketplace name must be unique per user.

Build and publish it with `scripts/build-stable.mjs`:

```bash
node scripts/build-stable.mjs                                # print the stable catalog (latest release of every plugin)
node scripts/build-stable.mjs --pin sdd-engineering@1.0.0    # pin one plugin to an older release
node scripts/build-stable.mjs --pin sdd-engineering@1.0.0 --publish   # commit it to the "stable" branch and push
```

The catalog site refreshes via `gh workflow run pages.yml` or the daily schedule (a push to `stable` does not trigger it).

Every plugin is listed, so dependencies resolve inside the stable marketplace. Each entry is a `git-subdir` source pinned to the release tag and its commit SHA.

To roll back a project:

```bash
claude plugin marketplace add otkachuk777/dev-digest-ai-marketplace#stable --scope project
claude plugin uninstall sdd-engineering@dev-digest-ai-marketplace --scope project
claude plugin install sdd-engineering@dev-digest-ai-marketplace-stable --scope project
```

Then run `/reload-plugins` and the smoke eval. Return to the main marketplace only after the cause is fixed and plugin data is confirmed intact.

## Users and auto-update

Auto-update is off by default. Users enable it in `/plugin` under Marketplaces, or run:

```bash
claude plugin marketplace update dev-digest-ai-marketplace
claude plugin update <plugin>@dev-digest-ai-marketplace --scope project
```
