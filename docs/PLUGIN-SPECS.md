# Plugin specifications

Source of the components: the DevDigest `.claude/` directory. This document fixes what each plugin contains, what must be removed or generalised before it can ship, and how the plugins depend on each other. It is the contract for the build pull requests that follow.

## Plugins

| Plugin | Version | Purpose |
|---|---|---|
| `engineering-paved-path` | 1.0.0 | Stack and architecture best-practice skills |
| `research-tools` | 1.0.0 | Read-only research and option comparison |
| `architecture-review` | 1.0.0 | Read-only architecture review driven by repo-local docs |
| `quality-review` | 1.0.0 | Code review, security review, test writing, documentation |
| `sdd-engineering` | 1.0.0 | Spec Driven Development workflow: spec, plan, implement, verify, retro |

## Dependency graph

```text
sdd-engineering@1.0.0
├── engineering-paved-path@^1.0.0
├── research-tools@^1.0.0
├── architecture-review@^1.0.0
│   └── engineering-paved-path@^1.0.0
└── quality-review@^1.0.0
    └── engineering-paved-path@^1.0.0
```

Release order: `engineering-paved-path`, then `research-tools`, `architecture-review`, `quality-review`, then `sdd-engineering`. Plugins cannot share files, so a script needed by several plugins is copied into each.

## engineering-paved-path

Skills, one source of truth for the whole marketplace:

| Skill | Origin | Work needed |
|---|---|---|
| react-best-practices | own | none |
| react-testing-library | own | none |
| fastify-best-practices | mcollina/skills (MIT) | NOTICE entry |
| drizzle-orm-patterns | giuseppe-trisciuoglio/developer-kit (MIT) | NOTICE entry |
| postgresql-table-design | wshobson/agents (MIT) | NOTICE entry |
| typescript-expert | sickn33/antigravity-awesome-skills (MIT) | NOTICE entry |
| zod | pproenca/dot-skills (MIT) | NOTICE entry |
| security | own | none |
| mermaid-diagram | own | none |
| onion-architecture | own | generalise: replace `server/`, `reviewer-core/` with generic layer names |
| frontend-ui-architecture | own | generalise: remove DevDigest module paths |

Excluded: `next-best-practices` (vercel-labs/next-skills has no licence, so it cannot be redistributed). The README tells users to install it separately from upstream.

Required files: `NOTICE` with the copyright line and licence text of every MIT upstream, `README.md`, `CHANGELOG.md`, `COMPATIBILITY.md`.

## research-tools

| Component | Work needed |
|---|---|
| agent `researcher` | none (1 DevDigest reference) |
| agent `brainstorm` | remove DevDigest examples; keep the "not `superpowers:brainstorming`" note generic |
| script `readonly-bash-guard.sh` | none; hook path becomes `${CLAUDE_PLUGIN_ROOT}/scripts/readonly-bash-guard.sh` |

## architecture-review

| Component | Work needed |
|---|---|
| agent `architecture-reviewer` | generalise: read the repository's own architecture docs and dependency-rule config instead of hard-coded `server/`, `reviewer-core/`, `@devdigest/shared`, `pnpm arch` |
| script `readonly-bash-guard.sh` | copy, plugin-root hook path |

Not taken: `architecture-reviewer-lite` (same role, duplicate).

## quality-review

| Component | Work needed |
|---|---|
| agent `code-reviewer` | remove module names; re-review mode kept for `run-plan` |
| agent `security-reviewer` | remove module names |
| agent `test-writer` | generalise test locations (see path guard) |
| agent `doc-writer` | generalise documentation locations (see path guard) |
| scripts `readonly-bash-guard.sh`, `path-guard.sh` | copy; plugin-root hook paths |

## sdd-engineering

| Component | Work needed |
|---|---|
| agent `spec-creator` | explicit inputs instead of DevDigest paths; document where specs are written |
| agent `implementation-planner` | document where plans are written; explicit inputs |
| agent `implementer` | remove module names; define behaviour when no test command is found |
| agent `plan-verifier` | plan location as input |
| skill `run-plan` | the generalised DevDigest `impl`; orchestrates implementer, plan-verifier, architecture-reviewer, code-reviewer, security-reviewer |
| skill `workflow-retro` | none beyond paths; scripts via `${CLAUDE_SKILL_DIR}` |
| skill `engineering-insights` | generalise: any module's `INSIGHTS.md`, no hard-coded module list |
| skill `ears-spec` | single source of the spec format; `spec-lint.sh` via `${CLAUDE_SKILL_DIR}` |
| scripts `readonly-bash-guard.sh`, `path-guard.sh` | copy; plugin-root hook paths |
| `evals/` | behaviour evals for the workflow, written for this plugin |

## Cross-cutting rules

- **Path guard.** DevDigest `path-guard.sh <tests|docs|plans|specs>` hard-codes directories. The shipped version takes the allowed path patterns as arguments, with documented defaults, and is covered by a test.
- **Hook paths.** Hooks reference `${CLAUDE_PLUGIN_ROOT}/scripts/...`, never `.claude/agents/scripts/...`.
- **No DevDigest leftovers.** No `devdigest`, `reviewer-core`, `@devdigest/*`, absolute paths, `CLAUDE.md` or `INSIGHTS.md` content. A CI grep enforces this for `plugins/`.
- **Single source of instructions.** A rule lives in a skill or an agent, not in both.
- **Namespaced references.** Agents and skills refer to dependencies as `engineering-paved-path:react-best-practices`, `research-tools:researcher`, and so on.
- **No credentials** in manifests, prompts, scripts or evals.
- **Third-party material** is included only with a permissive licence and a `NOTICE` entry.

## Not migrated

`pr-self-review`, `dependency-checker`, `architecture-reviewer-lite`, the DevDigest `evals/` harness, `CLAUDE.md`, `INSIGHTS.md`, `specs/`, and `.claude/settings.json`.

## Build order

1. `engineering-paved-path`
2. `research-tools`
3. `architecture-review`
4. `quality-review`
5. `sdd-engineering`

One pull request per plugin. Each passes `claude plugin validate` and `scripts/check-release.mjs` before merge.
