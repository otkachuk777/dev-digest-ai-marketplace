# Compatibility

- Claude Code >= 2.1.110. The Bash guard relies on `agent_type` in the hook input; it is verified on 2.1.296.
- Requires `bash`, `jq` and `perl` for the Bash guard.
- No MCP servers, network services of its own, or credentials. `researcher` and `brainstorm` may use `WebSearch` and `WebFetch`.
