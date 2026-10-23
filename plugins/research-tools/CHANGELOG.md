# Changelog

## 1.2.0

- `brainstorm` runs on sonnet with effort `high` instead of opus.

## 1.1.0

- `readonly-bash-guard.sh` also denies Go, Yarn, Python and Rust write shapes: `go get|install|generate|fmt|fix`, `go mod tidy|vendor|edit|init`, `go work init|use|edit|sync`, `go build|test -o <file>` (only `-o /dev/null` passes), `gofmt|goimports -w`, `golangci-lint --fix`, `yarn add|install|…`, `pip install`, `uv add|sync|lock`, `poetry add|install|lock`, `cargo add|install|update|fix` and `cargo fmt` without `--check`. `go test|vet|build ./...`, `go mod graph|why|verify`, `task`/`make` targets, `pytest` and `cargo test|clippy` stay allowed.
- Hooks run their scripts as `bash "<script>"`, so they no longer depend on the shebang or the executable bit, and the repository's `.gitattributes` checks scripts out with LF on every platform. A guard with CRLF line endings crashed outside Git for Windows' bash, and a crashed hook does not block the tool call.

## 1.0.0

- Initial release: `researcher` and `brainstorm` agents.
- `readonly-bash-guard.sh` as a plugin-level `PreToolUse` hook scoped by `agent_type`, because plugin agents cannot declare hooks in their frontmatter.
