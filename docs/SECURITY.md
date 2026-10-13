# Security

## Reporting a vulnerability

Open a private security advisory on GitHub (Security tab, "Report a vulnerability") or contact the code owners directly.
Do not file public issues for vulnerabilities.

## Plugin review checklist

Plugins run with the user's permissions, so every pull request is reviewed for:

- **Hooks and scripts**: what runs, when, and with which arguments. No network calls or `curl | sh`.
- **Agent tools**: each agent lists only the tools it needs. Read-only agents have no write tools.
- **MCP servers and network access**: optional, documented, and off by default.
- **Credentials**: none in manifests, prompts, scripts or evals. Use `userConfig` with `"sensitive": true`.
- **Paths**: no absolute or personal paths.
- **Dependencies**: version ranges are explicit and resolve inside this marketplace.

## Supply chain

- Plugin sources are relative paths inside this repository.
- Releases are immutable git tags `<plugin>--v<version>` that point at a commit that passed CI.
- Changes require review by a code owner (see `CODEOWNERS`).
