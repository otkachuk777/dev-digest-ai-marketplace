# architecture-review

A read-only agent that reviews a change against the repository's architectural boundaries and reports violations with evidence.

| Agent | Use it for |
|---|---|
| `architecture-review:architecture-reviewer` | After implementation or on any branch diff: dependency direction and layers, module public surfaces, code placement, framework boundaries, the repository's dependency-rule tool and its violations baseline. |

## How it works

1. **Scope.** Changed files against the merge base, plus staged and untracked files, or a narrower list you pass in.
2. **Learn the repository.** It reads `CLAUDE.md`/`AGENTS.md`, architecture docs and ADRs, optional `INSIGHTS.md` files, and finds the dependency-rule command (dependency-cruiser, ESLint boundaries, `package.json` scripts).
3. **Deterministic checks first.** Dependency rules, "baseline did not grow", "rules not weakened", duplicated shared code, contracts seam. A check that cannot run is reported as "could not run", never as a pass.
4. **Judgement.** Only what the checks cannot see, against the rules of `engineering-paved-path:onion-architecture` and `engineering-paved-path:frontend-ui-architecture` and any project skill about placement. The repository's own documents win over the defaults.
5. **Output.** Verdict, deterministic check table, findings with `file:line` evidence and severity, pre-existing drift, unknowns, and what was not verified. It supports a re-review mode against prior findings.

Nothing in the repository is hard-coded: no module names, paths or commands.

## Dependencies

`engineering-paved-path@^1.0.0`, installed automatically. The agent calls its architecture skills through the `Skill` tool, which is the only way to reach skills of another plugin. It is told to use `Skill` only for rules about placement and layering.

## Install

```bash
claude plugin marketplace add otkachuk777/dev-digest-ai-marketplace --scope project
claude plugin install architecture-review@dev-digest-ai-marketplace --scope project
```

## How "read-only" is enforced

The agent has no `Write`/`Edit` tools. A plugin-level `PreToolUse` hook (`hooks/hooks.json` → `scripts/readonly-bash-guard.sh`) denies write-shaped Bash commands, and acts only when the caller is `architecture-reviewer`. Claude Code ignores `hooks:` in a plugin agent's frontmatter, which is why the guard is a plugin-level hook. It is not a sandbox. The script is a copy of the one in `research-tools`; CI checks that the copies stay identical.

## Requirements

`bash`, `jq` and `perl`. If `jq` is missing, this agent's Bash calls are blocked with an install hint, while everything else keeps working.

## Tests

```bash
bash plugins/architecture-review/scripts/readonly-bash-guard.test.sh
```
