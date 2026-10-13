# Plugin guidelines

## Naming

- Plugin and marketplace names are kebab-case: letters, digits, `.`, `_`, `-`; start with a letter or digit.
- Do not start a plugin name with `claude-`, `anthropic-`, `anthropics-` or `cc-plugin-`, and do not use `claude` or `anthropic` as a standalone word. Claude Code treats these as reserved.
- The marketplace entry `name` and the `name` in `plugin.json` must be identical.

## Layout

```text
plugins/<name>/
├── .claude-plugin/plugin.json   only the manifest lives here
├── skills/<skill>/SKILL.md
├── agents/<agent>.md
├── hooks/hooks.json
├── evals/
├── README.md
├── CHANGELOG.md
└── COMPATIBILITY.md
```

Every component directory sits at the plugin root, never inside `.claude-plugin/`.
A `CLAUDE.md` at the plugin root is not loaded as context; put instructions in a skill.

## Versioning

- Set `version` in `plugin.json` only. Use SemVer.
- Users receive an update only when `version` changes. Bump it on every release.
- Dependencies use version ranges, for example `{ "name": "research-tools", "version": "^1.0.0" }`.

## Paths and state

- Reference bundled files with `${CLAUDE_PLUGIN_ROOT}` (changes on every update).
- Store state that must survive updates in `${CLAUDE_PLUGIN_DATA}`.
- No absolute or user-specific paths, no product-specific module names.

## Hooks

Declare hooks in `hooks/hooks.json`. File-path or array hooks inside a marketplace entry never run.

## Validation

`claude plugin validate .` must pass before merge. Warnings are reviewed, not ignored.
