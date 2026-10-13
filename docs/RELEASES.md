# Releases and rollback

## Versioning

- Each plugin is versioned independently with SemVer in its `plugin.json`.
- Patch: wording or bug fixes. Minor: new behaviour, backwards compatible. Major: breaking change.
- Users get an update only when `version` changes, so every release bumps it.

## Release checklist

1. Update the plugin's `CHANGELOG.md` and bump `version` in `plugin.json`.
2. Run `claude plugin validate .` and the plugin's evals.
3. Merge the pull request after CI is green.
4. From the plugin directory, tag the merged commit:
   ```bash
   claude plugin tag --dry-run
   claude plugin tag --push
   ```
   The tag name is `<plugin>--v<version>`, for example `sdd-engineering--v1.0.0`.
5. Release dependencies first, then the plugins that depend on them.

Tags are immutable. A tag always points at a commit that passed CI. Never move or reuse a tag; ship a new version instead.

## Rollback

Claude Code has no `plugin rollback` command. Roll back through a stable marketplace pinned to a known-good release:

1. Keep a second marketplace whose `name` differs from the main one (a marketplace name must be unique per user), for example `dev-digest-ai-marketplace-stable`.
2. Its entries pin `ref` and `sha` of the last verified release tag.
3. To roll back: disable or uninstall the current plugin, install it from the stable marketplace, run `/reload-plugins`, and run the smoke eval.
4. Return to the main marketplace only after the cause is fixed and plugin data is confirmed intact.

## Users and auto-update

Auto-update is off by default. Users enable it in `/plugin` under Marketplaces, or run:

```bash
claude plugin marketplace update dev-digest-ai-marketplace
claude plugin update <plugin>@dev-digest-ai-marketplace --scope project
```
