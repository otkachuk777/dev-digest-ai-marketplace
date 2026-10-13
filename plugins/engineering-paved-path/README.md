# engineering-paved-path

Best-practice skills for a TypeScript web stack, packaged as one Claude Code plugin. Other plugins in this marketplace depend on it, so each practice has a single source.

## Skills

| Skill | Use it for |
|---|---|
| `react-best-practices` | React component and hook patterns |
| `react-testing-library` | Testing components and hooks with RTL and Vitest |
| `fastify-best-practices` | Fastify routes, plugins, hooks, schemas, performance |
| `drizzle-orm-patterns` | Drizzle schema, queries, relations, migrations |
| `postgresql-table-design` | Postgres table design, types, indexes |
| `zod` | Zod schemas, parsing, error handling |
| `typescript-expert` | TypeScript types, tsconfig, diagnostics |
| `security` | OWASP Top 10:2025 guidance for web apps |
| `mermaid-diagram` | Mermaid diagrams in Markdown |
| `onion-architecture` | Where backend code lives and what it may import |
| `frontend-ui-architecture` | Where frontend code lives and how to split it |

Skills are namespaced by the plugin, for example `engineering-paved-path:zod`.

## Install

```bash
claude plugin marketplace add otkachuk777/dev-digest-ai-marketplace --scope project
claude plugin install engineering-paved-path@dev-digest-ai-marketplace --scope project
```

## Not included

`next-best-practices`: its upstream repository (vercel-labs/next-skills) publishes no licence, so it cannot be redistributed here. Install it directly from upstream if you need it.

## Third-party content

The plugin is MIT licensed (see the repository `LICENSE`). Five skills come from MIT-licensed upstream repositories with their own copyright holders. See [NOTICE](NOTICE).

## Architecture skills and your repository

`onion-architecture` and `frontend-ui-architecture` start by reading the repository's own architecture docs and dependency-rule configuration, and fall back to conventional file names when none exist.
