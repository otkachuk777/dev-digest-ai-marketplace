# onion-architecture

Onion Architecture for layered TypeScript backends (Fastify + Drizzle + Zod style), mapped onto conventional file names so no new folders are needed.

- `SKILL.md`: rings, placement rules, transactions, red flags. Starts by discovering the repository's own layout and dependency-rule command.
- `tools.md`: the same rules per library (Fastify, Drizzle, Zod, SDK adapters, enforcement, tests per ring).

Scope split with sibling skills:

| Topic | Owner |
|---|---|
| Ring classification, import direction, cross-module access, ports and adapters, transaction boundaries, Zod at the edges, enforcement | `onion-architecture` |
| Fastify plugins, hooks, schemas, performance | `fastify-best-practices` |
| Drizzle queries, relations, migrations | `drizzle-orm-patterns` |
| Table design, indexes, types | `postgresql-table-design` |
| Zod API details | `zod` |
| Frontend code placement | `frontend-ui-architecture` |
