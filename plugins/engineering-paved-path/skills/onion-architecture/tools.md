# Onion rules per tool

The rules of [SKILL.md](SKILL.md), applied to each library in a Fastify + Drizzle + Zod service. Adapt names to the repository (see Step 0 in SKILL.md).

## Fastify: presentation ring and composition root

- **A module is a plugin.** `routes.ts` default-exports an async plugin, and one registry file registers it. Prefer static registration over autoload: one import and one entry.
- **DI goes through a `container` decorator** on the app instance. The route builds its service from `app.container`. It never imports a concrete adapter or repository class from outside its module.
- **Handler shape:** schema-validated `params`/`body` (Zod type provider) → request context → **one** service call → status code. The status may depend on a service result flag (`created ? 201 : 200`).

  ```ts
  app.post('/orders', { schema: { body: OrderInput } }, async (req, reply) => {
    const { tenantId, userId } = await getContext(app.container, req);
    const { order, created } = await service.place(tenantId, userId, req.body);
    reply.status(created ? 201 : 200);
    return order;
  });
  ```
- **Errors:** services throw typed application errors (`NotFoundError`, `ValidationError`, `ExternalServiceError`, `ConfigError`). One global error handler serializes them. Routes don't `try/catch` just to set a status.
- **Hooks and decorators** carry cross-cutting concerns (auth context, rate limits, logging). Business rules never go in `onRequest`/`preHandler`.
- **Logging from services:** a service never imports Fastify to get a logger. It takes a structural `Logger` (`{ info, warn, error }`) in its constructor, and the route passes `app.log`.
- **SSE and streaming** are transport. The service emits domain events, and the route only pipes them.

## Drizzle: infrastructure ring only

- ORM and db schema/client **values** are imported only in repositories and the db folder. Other rings may use `import type` of row types.
- **One repository per module.** It **writes** only tables its module owns, and it may read or join other modules' tables for its own read model. A shared entity gets its repository exposed through the container.
- **Every query is tenant-scoped:** the tenant id goes into the `where`, not into a post-query `if`. Filtering goes into SQL, not `.filter()` afterwards.
- **Every list query is bounded** with `limit`/`offset` in SQL and both page-size constants in the module's `constants.ts`.
- **Repositories return rows or `undefined`/`boolean`.** They never throw `NotFoundError`. The service decides what a missing row means.
- **Aggregations** ("reduce on read"): the repository fetches the minimal rows and a pure domain function reduces them. The reducer is unit-tested without a DB.
- **Transactions:** the service owns them, repositories accept an optional `tx`, and no network I/O happens inside.
- **Schema changes:** edit the schema files and generate the migration with the project's tool. Never hand-edit generated migrations.

## Zod: parse at every edge, trust inside

"Parse, don't validate": validation happens once where untrusted data enters, and it produces a precise type.

| Edge | Where | How |
|---|---|---|
| HTTP in | `routes.ts` | `schema: { body, params, querystring }` with the contract |
| HTTP out | contract types | return `z.infer<typeof X>`-typed DTOs |
| External API / LLM response | the adapter | `schema.safeParse`, then an external-service error on failure |
| Env / config | config module | parsed once at startup |
| Job payload | job handler entry | parse the payload with a Zod schema, because queues round-trip payloads through JSON |

- Contracts live in one shared folder: a PascalCase export plus `z.infer` of the same name. Keep duplicated copies in sync.
- Inside the domain and application rings, **don't re-parse** and **don't hand-write** wire types.
- Zod is the one library the domain ring may import, because contracts are domain types.

## External SDKs: adapters behind ports

Third-party clients for external systems (LLM providers, payment, git host, chat, search, browser/AST tooling) are imported **only** inside adapter folders. Pure in-memory libraries with no external system (`zod`, graph and queue helpers) are not SDKs and may be used in any ring that needs them.

Adding one:
1. **Port:** an interface in domain words (`createComment`), not SDK words.
2. **Adapter:** implements the port, maps SDK types to port types, applies timeout/retry like the other adapters, and turns SDK errors into the external-service error.
3. **Mock:** register it with the other test mocks.
4. **Wiring:** a lazy getter in the container, secrets read there (never in a module), and an override field for tests.
5. **Use:** the service calls `await this.container.<name>()`. A secret-gated adapter throws a config error when the secret is missing.

## Dependency-rule enforcement

- The forbidden-import rules live in the repository's tool config (dependency-cruiser, ESLint boundaries, or similar). Run it the way the repository documents.
- Typical rule set: no ORM/db outside infrastructure, routes stay thin, domain stays pure, SDKs only in adapters, other modules only through their `index.ts`, nothing imports the app entry, no cycles.
- A **baseline** of known violations may only shrink. Regenerate it only after removing violations, and say so in the commit.
- Rules usually key on file names. Use the conventional names and the rules apply automatically.

## Tests per ring

| Ring | Test type | Tools |
|---|---|---|
| Domain | plain unit, no mocks | test runner only |
| Application | service with mocked ports | container with overrides and adapter mocks |
| Infrastructure | repository against a real database | integration tests, containerised Postgres |
| Presentation | route smoke through the framework's inject | `app.inject` |

If a domain function needs a mock to be tested, it isn't domain yet. Push the I/O out.
