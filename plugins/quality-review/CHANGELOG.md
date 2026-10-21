# Changelog

## 1.1.0

- `test-writer` uses the TypeScript stack skills only when the module uses those libraries, and follows Go (`t.Run` tables, `httptest`, `testdata/`) and Python (`pytest`) idiom otherwise.
- `readonly-bash-guard.sh` also denies Go, Yarn, Python and Rust write shapes: `go get|install|generate|fmt|fix`, `go mod tidy|vendor|edit|init`, `go work init|use|edit|sync`, `go build|test -o <file>` (only `-o /dev/null` passes), `gofmt|goimports -w`, `golangci-lint --fix`, `yarn add|install|…`, `pip install`, `uv add|sync|lock`, `poetry add|install|lock`, `cargo add|install|update|fix` and `cargo fmt` without `--check`. `go test|vet|build ./...`, `go mod graph|why|verify`, `task`/`make` targets, `pytest` and `cargo test|clippy` stay allowed.
- `path-guard.sh`: the `tests` profile accepts Go and Python test files (`*_test.go`, `test_*.py`, `*_test.py`, `conftest.py`) and `testdata/` directories; the `docs` profile also protects every plan archive named in `SDD_PLAN_DIRS`.
- Hooks run their scripts as `bash "<script>"`, so they no longer depend on the shebang or the executable bit, and the repository's `.gitattributes` checks scripts out with LF on every platform. A guard with CRLF line endings crashed outside Git for Windows' bash, and a crashed hook does not block the tool call.

## 1.0.0

- Initial release: `code-reviewer`, `security-reviewer`, `test-writer`, `doc-writer`, generalised to discover the repository's own conventions, docs and commands.
- Depends on `engineering-paved-path@^1.0.0` for the security, testing and diagram skills.
- Plugin-level hooks scoped by `agent_type`: read-only Bash guard for the reviewers, path guard (symlink-safe) for the test and doc writers.
- `mutation-probe.sh` for proving a test can fail.
