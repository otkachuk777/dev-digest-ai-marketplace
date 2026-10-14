# Compatibility

- Claude Code >= 2.1.110. The guards rely on `agent_type` in the hook input; it is verified on 2.1.296.
- Requires `engineering-paved-path@^1.0.0` (resolved by Claude Code from this marketplace).
- Requires `bash`, `jq`, `perl` and `git`.
- `security-reviewer` runs `pnpm audit`, `npm audit` or `yarn npm audit` when a lockfile is in scope; registry access is needed for that check only.
- No MCP servers or credentials.
