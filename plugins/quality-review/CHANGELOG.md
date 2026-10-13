# Changelog

## 1.0.0

- Initial release: `code-reviewer`, `security-reviewer`, `test-writer`, `doc-writer`, generalised to discover the repository's own conventions, docs and commands.
- Depends on `engineering-paved-path@^1.0.0` for the security, testing and diagram skills.
- Plugin-level hooks scoped by `agent_type`: read-only Bash guard for the reviewers, path guard (symlink-safe) for the test and doc writers.
- `mutation-probe.sh` for proving a test can fail.
