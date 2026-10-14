# quality-review

Four agents that check and document a change after it is built. Two review read-only; two write, but only into their own kind of file.

| Agent | Access | Use it for |
|---|---|---|
| `quality-review:code-reviewer` | read-only | Bugs and logic errors in a diff: wrong behaviour against acceptance criteria, edge cases, state and ordering, error paths, contract mismatches. Every finding has a failure scenario. Re-review mode for review loops. |
| `quality-review:security-reviewer` | read-only | Exploitable vulnerabilities in a diff: injection, access control, path traversal, SSRF, secrets, supply chain, LLM-specific risks. Runs dependency audit and secret scan first; every finding has a source, sink and attack path. |
| `quality-review:test-writer` | writes tests only | Tests that fail when behaviour breaks: test-first from a plan, backfill on committed code, end-to-end flows. Proves each test can fail (red run or the mutation probe). |
| `quality-review:doc-writer` | writes docs only | Developer documentation for implemented behaviour, with Mermaid diagrams and ADRs. Every claim is checked against the code. |

Nothing in the agents is tied to a repository layout: they discover docs, conventions, test locations and commands in the project they run in.

## Install

```bash
claude plugin marketplace add otkachuk777/dev-digest-ai-marketplace --scope project
claude plugin install quality-review@dev-digest-ai-marketplace --scope project
```

## Dependencies

`engineering-paved-path@^1.0.0`, installed automatically. Agents call its skills (`security`, `react-testing-library`, `mermaid-diagram` and the stack skills) through the `Skill` tool, which is the only way to reach skills of another plugin.

## How the limits are enforced

Claude Code ignores `hooks:` in a plugin agent's frontmatter, so the limits are plugin-level hooks (`hooks/hooks.json`) that fire for every matching tool call but act only when the caller is one of these agents. The main session and other agents are untouched.

| Hook | Agents | Rule |
|---|---|---|
| `scripts/readonly-bash-guard.sh` | `code-reviewer`, `security-reviewer` | Denies write-shaped Bash: file redirection, `rm`/`mv`/`cp`, in-place `sed`, mutating `git`, package installs, migrations. Not a sandbox. |
| `scripts/path-guard.sh` | `test-writer` (profile `tests`), `doc-writer` (profile `docs`) | Allows writes only to test files and test support, or to documentation locations. Resolves symlinks, so a link inside the repository cannot lead outside it. |

Both scripts are copies shared with other plugins; CI checks that the copies stay identical.

`scripts/mutation-probe.sh` is the one script `test-writer` may use on production code: it mutates one line of a committed file, expects the test to fail, restores the file from git and verifies its hash.

## Requirements

`bash`, `jq`, `perl` and `git`. If `jq` is missing, a guarded agent's tool calls are blocked with an install hint, while everything else keeps working.

## Tests

```bash
bash plugins/quality-review/scripts/readonly-bash-guard.test.sh
bash plugins/quality-review/scripts/path-guard.test.sh
```
