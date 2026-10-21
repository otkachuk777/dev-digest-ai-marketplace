# Changelog

## 1.1.0

- `architecture-reviewer` loads `onion-architecture` only for a layered TypeScript backend. Backend code in other languages is judged against the repository's docs and package layout, and the skill is reported as `not applicable — <stack>`.
- `readonly-bash-guard.sh` also denies Go, Yarn, Python and Rust write shapes: `go get|install|generate|fmt|fix`, `go mod tidy|vendor|edit|init`, `go work init|use|edit|sync`, `go build|test -o <file>` (only `-o /dev/null` passes), `gofmt|goimports -w`, `golangci-lint --fix`, `yarn add|install|…`, `pip install`, `uv add|sync|lock`, `poetry add|install|lock`, `cargo add|install|update|fix` and `cargo fmt` without `--check`. `go test|vet|build ./...`, `go mod graph|why|verify`, `task`/`make` targets, `pytest` and `cargo test|clippy` stay allowed.
- Hooks run their scripts as `bash "<script>"`, so they no longer depend on the shebang or the executable bit, and the repository's `.gitattributes` checks scripts out with LF on every platform. A guard with CRLF line endings crashed outside Git for Windows' bash, and a crashed hook does not block the tool call.

## 1.0.0

- Initial release: `architecture-reviewer`, generalised to discover the repository's own architecture docs, dependency-rule command and baseline instead of assuming a layout.
- Depends on `engineering-paved-path@^1.0.0` for the placement skills.
- Read-only Bash guard as a plugin-level `PreToolUse` hook scoped by `agent_type`.
