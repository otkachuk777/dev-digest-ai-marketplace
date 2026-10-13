# Compatibility

- Claude Code >= 2.1.110. The Bash guard relies on `agent_type` in the hook input; it is verified on 2.1.296.
- Requires `engineering-paved-path@^1.0.0` (resolved by Claude Code from this marketplace).
- Requires `bash`, `jq` and `perl` for the Bash guard, and `git` for the review scope.
- No MCP servers, network access or credentials.
