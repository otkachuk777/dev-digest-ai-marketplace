# Changelog

## 1.5.1

- `run-plan` "Where are we?" starts with `git worktree list` and runs `impl-status.sh` and all git commands from the matching worktree, so a resume from the main checkout no longer reports `blocked-spec`.
- `run-plan` Gate re-runs the cheap toolchain probes (`docker info`, `gcc --version` with the resolved PATH) before plan-verifier, and on any resume, instead of launching the verifier into a stopped dependency.
- `run-plan` "Git in a worktree": agent prompts name the `powershell.exe -NoProfile -Command "git -C <worktree> …"` fallback, since subagents have no PowerShell tool.

## 1.5.0

- `run-plan` model table for the Claude 5.5 generation: security-reviewer round 1 runs on sonnet with effort `high` instead of opus; every reviewer in re-review rounds, plan-verifier `pass: 2` and doc-writer run on haiku. implementer, test-writer, plan-verifier `pass: 1` and round-1 architecture and code review stay on sonnet. Opus stays with spec-creator and implementation-planner.
- `implementation-planner` runs brainstorms on the agent's default (sonnet, effort `high`) and no longer passes `model`.
- `spec-creator` passes `model: "haiku"` to `repo` research requests; `external` and `both` keep sonnet.
- `workflow-retro` rubric: model fit `up` / `down` covers haiku and effort, one tier at a time.

## 1.4.0

- `run-plan` Phase 0 preflights the plan's Verify toolchain from the worktree before Build: each distinct Verify command (race detector, vulnerability scanner, integration task) is dry-run once on the smallest target, and a tool or flag error stops the run before chunk 1 instead of surfacing mid-chunk.
- `implementer`: a formatter or lint check passes only when its output is empty; a listed file, including `<standard input>` from a piped check such as `tr -d '' < f | gofmt -l`, is a failure to fix before reporting.
- `workflow-retro` (`collect.py`) reads transcripts and writes `digest.md` / `digest.json` as UTF-8, so it no longer crashes on Windows (cp1252) on characters such as `≥`.
- `workflow-retro` (`collect.py`) takes an agent's final report from its last `SubagentHandback` message when there is one, instead of the last assistant text line after it.
- `path-guard.sh`: same worktree fix as `quality-review` 1.1.1 (shared copy).

## 1.3.0

- `run-plan` builds technical plans (tooling, scaffolding, refactor, infrastructure) without a spec. `implementation-planner` gives such a plan an id `TECH-NN` on its `- Source:` line (the caller's, else the next free number); `run-plan TECH-NN` (or the plan path) runs the same build, gate, review and final phases with `SDD(TECH-NN): <phase>` commits and a `feat/tech-nn-<slug>` branch. plan-verifier checks the plan alone, G3 shows the plan's Done-when items and marks the archived plan `- Plan status: implemented`, and the squash uses a fitting type (`build`, `chore`, `refactor`, `ci`). A review finding that would change behavior goes to the user.
- `impl-status.sh` accepts `TECH-NN`; a plan's Source id must now end at a non-digit, so `SPEC-07` no longer matches `SPEC-070`-style ids by prefix and `TECH-NN` works without a slug.
- `workflow-retro` (`collect.py`) accepts `TECH-NN`.

## 1.2.0

- Polyglot stacks. `implementer` finds Verify commands in order: the plan, the project docs, the task runner (`Taskfile.yml`, `Makefile`, `justfile`) or `package.json` scripts, then the toolchain default for the module's manifest (`go test ./...` and `go vet ./...` for `go.mod`, `pytest`, `cargo test`). It no longer stops with "no test command" on a Go or Python module. Go examples for Skeleton stubs, AC test names and per-step test runs.
- `implementer` and `implementation-planner` apply a stack skill only to files in that stack. The TypeScript skills of `engineering-paved-path` are listed as `not applicable — <stack>` for Go, Python or Rust files, whose rules come from the repository's docs and neighbouring code.
- `run-plan` archives the plan to the first directory in `SDD_PLAN_DIRS` when it is set.
- `ears-spec`: the `it` layer is any integration test against a real database or emulator, not only Postgres.
- `readonly-bash-guard.sh` also denies Go, Yarn, Python and Rust write shapes: `go get|install|generate|fmt|fix`, `go mod tidy|vendor|edit|init`, `go work init|use|edit|sync`, `go build|test -o <file>` (only `-o /dev/null` passes), `gofmt|goimports -w`, `golangci-lint --fix`, `yarn add|install|…`, `pip install`, `uv add|sync|lock`, `poetry add|install|lock`, `cargo add|install|update|fix` and `cargo fmt` without `--check`. `go test|vet|build ./...`, `go mod graph|why|verify`, `task`/`make` targets, `pytest` and `cargo test|clippy` stay allowed.
- `path-guard.sh`: the `tests` profile accepts Go and Python test files (`*_test.go`, `test_*.py`, `*_test.py`, `conftest.py`) and `testdata/` directories; the `docs` profile also protects every plan archive named in `SDD_PLAN_DIRS`.
- Hooks run their scripts as `bash "<script>"`, so they no longer depend on the shebang or the executable bit, and the repository's `.gitattributes` checks scripts out with LF on every platform. A guard with CRLF line endings crashed outside Git for Windows' bash, and a crashed hook does not block the tool call.
- `path-guard.sh` works on Windows. It took a `C:\…` path from Claude Code (and git's `C:/…` root) as relative, so on Windows it denied specs and plans to `spec-creator` and `implementation-planner` and allowed `doc-writer` into the protected plan archives. Paths are now compared in POSIX form via `cygpath` when it is available.

## 1.1.0

- `spec-creator` no longer finishes a spec while a mandatory requirement has no acceptance criterion. Every "must" / "shall", Goal, User-story outcome and stated limit needs an AC that tests it; a requirement that cannot be made testable stays a blocking open question (no invented number), the spec stays `draft` and the report says `Not finished`. The final report now lists `Requirements: <covered>/<total> covered by an AC`, and the self-check has an eleventh item for it.
- Evals: two new cases for this behaviour (nine in total; the seven existing cases are unchanged), and a `fileMatches` check in the eval runner.

## 1.0.0

- Initial release of the Spec Driven Development workflow: `spec-creator`, `implementation-planner`, `implementer`, `plan-verifier`, and the skills `run-plan`, `ears-spec`, `workflow-retro`, `engineering-insights`.
- `run-plan` is the generalised `impl` orchestrator. It uses the reviewers and writers of `architecture-review` and `quality-review`, and the `researcher` and `brainstorm` agents of `research-tools`.
- No project paths: agents take explicit inputs and discover the repository's own docs, test locations and commands. `engineering-insights` discovers modules instead of using a fixed list.
- Plugin-level hooks scoped by `agent_type`: read-only Bash guard, path guard (specs and plans), sub-agent type guard, view-only browser guard.
- Behaviour evals: five positive and two negative cases.
