# Compatibility

- Claude Code >= 2.1.110. The guards rely on `agent_type` in the hook input; it is verified on 2.1.296.
- Requires `engineering-paved-path`, `research-tools`, `architecture-review` and `quality-review`, all `^1.0.0` (resolved by Claude Code from this marketplace).
- Requires `bash`, `jq`, `perl` and `git`; `gh` for the PR step; `python3` 3.9+ for `spec-lint.sh` and `workflow-retro`; `workflow-retro` also needs local Claude Code transcripts in `~/.claude/projects`.
- Optional: the Playwright plugin (`mcp__plugin_playwright_playwright__*` tools) for `spec-creator`'s view-only browsing. Without it the agent asks for screenshots.
- No credentials in any manifest.
