# research-tools

Two read-only agents that answer technical questions with evidence and never change anything.

| Agent | Use it for |
|---|---|
| `research-tools:researcher` | A concrete question answered from the repository (code, git history) or from external sources (docs, release notes). Returns findings with evidence and an explicit "Not found" list. |
| `research-tools:brainstorm` | One technical decision with more than one plausible approach. Compares at least three distinct options against criteria declared first, then recommends one with confidence. Not for product or scope decisions. |

## Install

```bash
claude plugin marketplace add otkachuk777/dev-digest-ai-marketplace --scope project
claude plugin install research-tools@dev-digest-ai-marketplace --scope project
```

## How "read-only" is enforced

Both agents have no `Write`/`Edit` tools. `Bash` stays available for read commands, so the plugin ships a `PreToolUse` hook (`hooks/hooks.json` → `scripts/readonly-bash-guard.sh`) that denies write-shaped Bash commands: file redirection, `rm`/`mv`/`cp`/`touch`/`mkdir`, in-place `sed`/`perl`, mutating `git` subcommands, package installs, and database migrations.

- The hook fires for every `Bash` call but acts only when the caller is `researcher` or `brainstorm`. The main session and other agents are untouched.
- Claude Code ignores `hooks:` in a plugin agent's frontmatter, which is why the guard is a plugin-level hook that checks `agent_type`.
- It is not a sandbox. It blocks known write shapes, not every possible way to change state.

## Requirements

`bash`, `jq` and `perl` on the machine. If `jq` is missing, a guarded agent's Bash calls are blocked with an install hint, while everything else keeps working.

## Tests

```bash
bash plugins/research-tools/scripts/readonly-bash-guard.test.sh
```
