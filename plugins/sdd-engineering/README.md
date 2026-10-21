# sdd-engineering

A Spec Driven Development workflow for Claude Code: write a testable spec, plan from it, implement in chunks, verify against the plan, review, and learn from the run.

## The flow

```text
spec-creator ──▶ approved SPEC ──▶ implementation-planner ──▶ approved plan ──▶ run-plan
                                                                                   │
                  implementer (fresh per chunk) ◀── build ◀────────────────────────┤
                  plan-verifier (gate) ◀── review loop: architecture · code · security
                  plan-verifier (final) ──▶ G3 (you approve) ──▶ squash ──▶ PR ──▶ retro · insights
```

Spec and plan are made by hand, one human gate each; `run-plan` refuses to start without both.

## Agents

| Agent | Access | Role |
|---|---|---|
| `sdd-engineering:spec-creator` | writes spec files only | Turns a feature idea and its design sources into an EARS spec. Round 1 returns questions and writes nothing. |
| `sdd-engineering:implementation-planner` | writes a plan file only | Reviews the requirements, asks what is unclear, runs a brainstorm per open technical fork, produces a Development Plan with chunks. |
| `sdd-engineering:implementer` | edits code | Executes one chunk of the plan, test first, and reports evidence. Never commits. |
| `sdd-engineering:plan-verifier` | read-only | Checks every plan item and requirement against the code and re-runs the plan's Verify commands. |

## Skills

| Skill | Use it for |
|---|---|
| `/sdd-engineering:run-plan <SPEC-NN \| plan path>` | Orchestrates build, gate, review-and-fix rounds, final verification and the PR. Started only by you, never by the model. |
| `ears-spec` | The spec format: template, ids, `[verify:]` tags, traceability, and `spec-lint.sh`. The single source for spec and plan agents. |
| `workflow-retro` | Retrospective of a multi-agent run from the Claude Code transcripts: tokens, duplicated reads, rework, human interventions. |
| `engineering-insights` | Read a module's `INSIGHTS.md` at session start, append a lesson at wrap-up. |

## Install

```bash
claude plugin marketplace add otkachuk777/dev-digest-ai-marketplace --scope project
claude plugin install sdd-engineering@dev-digest-ai-marketplace --scope project
```

The four dependencies install automatically: `engineering-paved-path`, `research-tools`, `architecture-review`, `quality-review`.

## Where things are written

| Artifact | Location |
|---|---|
| Spec | `<module>/specs/SPEC-NN-<slug>.md`, or `specs/SPEC-NN-<slug>.md` for cross-module features |
| Plan (draft) | `~/.claude/plans/<name>.md`; archived to `docs/plans/<date>+spec-nn-<slug>.md` by `run-plan` (`docs/cc-plans/` is also searched). Set `SDD_PLAN_DIRS` (space-separated, first one is the archive) in the project's `.claude/settings.json` `env` to use other directories |
| Insights | `<module>/INSIGHTS.md`, or `INSIGHTS.md` at the root |

## When no test command is found

The implementer takes commands from, in order: the plan, the project docs, the task runner (`Taskfile.yml`, `Makefile`, `justfile`) or `package.json` scripts, then the toolchain default for the module's manifest (`go.mod` → `go test ./...` and `go vet ./...`; `pyproject.toml` → `pytest`; `Cargo.toml` → `cargo test`). If it still cannot find a test command, it says so under "Not done / blocked" and does not claim the module passes.

## Other stacks

The workflow is stack-neutral. The TypeScript skills of `engineering-paved-path` (Fastify, Drizzle, Zod, onion-architecture…) apply only to files in that stack; for Go, Python or Rust code the agents take rules from the repository's architecture docs and neighbouring code and report the skill as `not applicable`. `security` and `mermaid-diagram` apply everywhere.

## How the limits are enforced

Claude Code ignores `hooks:` in a plugin agent's frontmatter, so the limits are plugin-level hooks (`hooks/hooks.json`) that fire for every matching tool call but act only when the caller is the named agent.

| Script | Agents | Rule |
|---|---|---|
| `readonly-bash-guard.sh` | `spec-creator`, `implementation-planner`, `plan-verifier` | Denies write-shaped Bash commands. |
| `path-guard.sh` | `spec-creator` (specs), `implementation-planner` (plans) | Allows writes only to spec files or draft plan files. |
| `agent-type-guard.sh` | `spec-creator`, `implementation-planner` | May start only `researcher` and `brainstorm`, always in the foreground. |
| `browser-url-guard.sh` | `spec-creator` | View-only browsing of `localhost`, `127.0.0.1` and `*.figma.com`. Needs the Playwright plugin. |

The three shared scripts are copies; CI checks they stay identical to the other plugins' copies.

## Requirements

`bash`, `jq`, `perl`, `git`; `gh` for the PR step; `python3` 3.9+ for `spec-lint.sh` and `workflow-retro`. If `jq` is missing, a guarded agent's tool calls are blocked with an install hint, while everything else keeps working.

## Tests

```bash
for t in plugins/sdd-engineering/scripts/*.test.sh plugins/sdd-engineering/skills/*/scripts/*.test.sh; do bash "$t"; done
python3 plugins/sdd-engineering/skills/workflow-retro/scripts/collect.test.py
node plugins/sdd-engineering/evals/run.mjs --validate
```

Behaviour evals: see [evals/README.md](evals/README.md).
