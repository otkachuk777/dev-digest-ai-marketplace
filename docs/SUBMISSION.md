# Submission: L08 homework

## Links

| What | Link |
|---|---|
| Marketplace repository | https://github.com/otkachuk777/dev-digest-ai-marketplace |
| Catalog (GitHub Pages) | https://otkachuk777.github.io/dev-digest-ai-marketplace/ |
| Release tags | `<plugin>--v1.0.0` for all five plugins, plus `sdd-engineering--v1.1.0` |
| Release PR for 1.1.0 | https://github.com/otkachuk777/dev-digest-ai-marketplace/pull/14 |
| Project with the plugin installed | https://github.com/otkachuk777/sdd-sandbox, install PR https://github.com/otkachuk777/sdd-sandbox/pull/1 |
| Cost baseline | [COST-BASELINE.md](COST-BASELINE.md) |
| Releases and rollback | [RELEASES.md](RELEASES.md) |

## Acceptance criteria and where they are shown

| Criterion | Evidence |
|---|---|
| `sdd-engineering@1.0.0` works without local DevDigest files | The sandbox has only `.claude/settings.json` from PR 1. A full SPEC-01 run (planner, implementer, verifier, code, security and architecture review) used the plugin from `~/.claude/plugins/cache/dev-digest-ai-marketplace/sdd-engineering/1.0.0`: 9 unit tests and 5 hidden acceptance tests green, verifier 13/13 Met, all reviewers `pass`. |
| Dependencies resolve without errors | `claude plugin list --json`: five plugins enabled, no `errors`. |
| Catalog shows the current composition and version | Catalog lists 39 artifacts; `sdd-engineering` shows v1.1.0 after the release; the `stable` channel shows 1.0.0. |
| Trace shows the active version | The `init` event of every `claude -p` run lists each plugin with its cache path, which ends in the version (`.../sdd-engineering/1.0.0`, later `.../1.1.0`, and `dev-digest-ai-marketplace-stable/.../1.0.0` after the rollback). |
| 1.1.0 behaviour passes its eval | `spec-creator-covers-every-mandatory-requirement` and `spec-creator-does-not-finish-with-an-untestable-requirement`. The second one fails on the 1.0.0 agent and passes on 1.1.0, in the sandbox too (`Requirements: 1/2`, `Not finished`, no invented number). |
| Cost per successful workflow before and after the optimization | [COST-BASELINE.md](COST-BASELINE.md): $1.61 per successful workflow at baseline; the optimization was within the noise and is recorded as such. |
| Stable channel returns a verified 1.0.0 and a smoke check is green | Rollback rehearsal below. |

## Rollback rehearsal (done in the sandbox)

```bash
node scripts/build-stable.mjs --pin sdd-engineering@1.0.0          # identical to the published stable branch
claude plugin uninstall sdd-engineering@dev-digest-ai-marketplace --scope project --keep-data
claude plugin marketplace add otkachuk777/dev-digest-ai-marketplace#stable --scope project
claude plugin install sdd-engineering@dev-digest-ai-marketplace-stable --scope project
claude plugin prune --scope project -y                              # drop the duplicate dependencies of the main marketplace
claude plugin list --json                                           # sdd-engineering 1.0.0 from -stable, no errors
```

Smoke check: the same `spec-creator` prompt on the rolled-back plugin gives the 1.0.0 behaviour (no `Requirements:` line, a 10-item self-check). Return to latest: uninstall the stable plugin, `claude plugin prune`, `claude plugin marketplace remove dev-digest-ai-marketplace-stable`, install `sdd-engineering@dev-digest-ai-marketplace` (1.1.0).

Plugin data: the data directory is named after the marketplace (`sdd-engineering-dev-digest-ai-marketplace` and `...-stable`). `--keep-data` leaves the old one in place. `sdd-engineering` wrote nothing there in this run, so there was nothing to lose; a plugin that stores state would start with an empty `-stable` directory.

## Known issues found on the way

- `workflow-retro` `collect.py` does not recognise namespaced agent types (`sdd-engineering:implementer`), so `SPEC-NN` lookup finds no session and phases show as `other`; a session id works.
- `plan-verifier` labels the unprovable "seen failing first" claim inconsistently (the cause of baseline run 3 failing the strict gate).
- `ears-spec` links to a non-existent `specs/README.md`.
- Two older evals are flaky: `spec-creator-asks-before-writing` (the agent is sometimes started in the background and its report never reaches the headless session) and `planner-refuses-a-draft-spec` (wording).

## Demo video outline

1. Repository: `.claude-plugin/marketplace.json`, `plugins/`, `docs/`, tags (`git tag -l`), the CI checks.
2. Catalog UI: search, `sdd-engineering` page with dependencies, `latest` and `stable` channels.
3. Install 1.0.0 in the sandbox (PR 1 diff, `claude plugin list --json`).
4. Verified workflow: SPEC-01 through the installed plugin (branch `demo/clear-completed`, tests green, verifier report).
5. Release and update to 1.1.0: PR 14, tag, `claude plugin marketplace update dev-digest-ai-marketplace`, `claude plugin update sdd-engineering@dev-digest-ai-marketplace --scope project`, the new behaviour.
6. Return through stable: the commands above, then back to latest.
