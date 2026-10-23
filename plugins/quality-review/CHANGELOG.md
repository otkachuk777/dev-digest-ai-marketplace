# Changelog

## 1.1.1

- `path-guard.sh` matches a file in a linked worktree of the same repository that is nested inside it (run-plan keeps them in `.claude/worktrees/<name>`) from the worktree's own root. `doc-writer` can write that worktree's `docs/**` and READMEs again; its `.claude/`, specs, plan archives and agent instruction files stay denied. A plain folder or another repository keeps the outer root.

## 1.1.0

- `test-writer` uses the TypeScript stack skills only when the module uses those libraries, and follows Go (`t.Run` tables, `httptest`, `testdata/`) and Python (`pytest`) idiom otherwise.
- `readonly-bash-guard.sh` also denies Go, Yarn, Python and Rust write shapes: `go get|install|generate|fmt|fix`, `go mod tidy|vendor|edit|init`, `go work init|use|edit|sync`, `go build|test -o <file>` (only `-o /dev/null` passes), `gofmt|goimports -w`, `golangci-lint --fix`, `yarn add|install|…`, `pip install`, `uv add|sync|lock`, `poetry add|install|lock`, `cargo add|install|update|fix` and `cargo fmt` without `--check`. `go test|vet|build ./...`, `go mod graph|why|verify`, `task`/`make` targets, `pytest` and `cargo test|clippy` stay allowed.
- `path-guard.sh`: the `tests` profile accepts Go and Python test files (`*_test.go`, `test_*.py`, `*_test.py`, `conftest.py`) and `testdata/` directories; the `docs` profile also protects every plan archive named in `SDD_PLAN_DIRS`.
- Hooks run their scripts as `bash "<script>"`, so they no longer depend on the shebang or the executable bit, and the repository's `.gitattributes` checks scripts out with LF on every platform. A guard with CRLF line endings crashed outside Git for Windows' bash, and a crashed hook does not block the tool call.
- `path-guard.sh` works on Windows. It took a `C:\…` path from Claude Code (and git's `C:/…` root) as relative, so on Windows it denied specs and plans to `spec-creator` and `implementation-planner` and allowed `doc-writer` into the protected plan archives. Paths are now compared in POSIX form via `cygpath` when it is available.

## 1.0.0

- Initial release: `code-reviewer`, `security-reviewer`, `test-writer`, `doc-writer`, generalised to discover the repository's own conventions, docs and commands.
- Depends on `engineering-paved-path@^1.0.0` for the security, testing and diagram skills.
- Plugin-level hooks scoped by `agent_type`: read-only Bash guard for the reviewers, path guard (symlink-safe) for the test and doc writers.
- `mutation-probe.sh` for proving a test can fail.
