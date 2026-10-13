---
name: onion-architecture
description: Use when writing or moving backend code in a layered TypeScript service — adding a module, route, service, repository, adapter, job handler, domain rule, constant or Zod contract; refactoring a fat routes file; calling another module; adding an external SDK (LLM, payments, git host, chat…); wrapping several writes in a transaction; deciding what a file may import. Enforces Onion Architecture (dependencies point inward only) for Fastify + Drizzle + Zod style services, checked by the repository's own dependency-rule tool.
metadata:
  version: "1.0.0"
---

# Onion Architecture

## Overview

**One rule:** source dependencies point **inward only**. The core (domain) knows nothing about the web framework, the ORM, the database or any SDK. The outer rings implement interfaces the inner rings define. The database is not the center. It is an outer detail.

Map the rings onto the file names the codebase already uses. **Don't add `domain/`, `application/` or `infrastructure/` folders.** The file's role decides its ring.

Out of scope, use the sibling skills: Fastify API details (`fastify-best-practices`), Drizzle query syntax (`drizzle-orm-patterns`), table design (`postgresql-table-design`), Zod API (`zod`). Per-tool rules for this architecture: [tools.md](tools.md).

## Step 0: learn this repository's layout

Before applying the defaults below, look for what the repository already says:

1. Architecture docs and ADRs (`docs/architecture*`, `docs/adr/`, a module `README`/`CLAUDE.md`).
2. The dependency-rule configuration and its command: `.dependency-cruiser.*`, ESLint boundary rules, `package.json` scripts such as `arch`, `lint:arch`, `depcruise`.
3. A frozen-violations baseline, if one exists.

Where the repository's names or rules differ from the defaults here, **the repository wins**. The table below is the fallback.

## Step 1: classify the code into a ring

| Ring | Typical files | May import | Must NOT import |
|---|---|---|---|
| **Domain** (center) | `model.ts`, pure `helpers.ts`, `constants.ts`, pure rule files, shared contracts, **ports** (interfaces for external systems), error types | other domain files, `zod`, `import type` of row types | web framework, ORM, db client/schema values, adapters, the container, any SDK |
| **Application** | `service.ts`, job handlers, executors | domain, ports, **its own** repository, the container (as the source of ports and shared repositories) | ORM, db schema, SDKs, another module's internals |
| **Infrastructure** | `repository.ts`, adapters, db client and schema | domain, ORM, SDKs | application, routes |
| **Presentation** | `routes.ts`, request context and schema helpers | its module's service, contracts, errors | ORM, db, adapters, SDKs |
| **Composition root** | container, app and server bootstrap, module registry | everything. The **only** place that `new`s concrete adapters | (nothing imports the app entry) |

Classifying a piece of code:
- **Would it still be true with no HTTP, no DB and no network?** ("stale after 7 days", cost = tokens × price, severity rollup.) → **Domain**. Put it in a pure function with its constants next to it.
- **Does it orchestrate:** load, decide, call a port, persist, enqueue? → **Application**.
- **Does it speak SQL or an SDK?** → **Infrastructure**: the repository for SQL, an adapter folder for an SDK.
- **Does it read `req`/`reply` or set status codes?** → **Presentation**, and nothing else goes there.

## Step 2: place it

- **New module** = one folder per feature with `routes.ts`, `service.ts`, `repository.ts`, and `helpers.ts`/`constants.ts` as needed. Register it in the single module registry. No other file registers routes.
- **Before you write a new schema or enum**, search the shared contracts and reuse what exists. If contracts are duplicated between server and client, diff the copies before editing one.
- **Every table has one owning module**, and only that module's repository **writes** it. A module that needs to change another module's rows **adds a method to the owner's repository** and calls it through the container. A read-only join or select for your own read model is fine inside your own repository. Dependency tools usually can't see this rule, so check it yourself.
- **A business rule that is naturally a `WHERE`** (accepted and not dismissed, stale > 7 days) lives in SQL, in a repository method **named after the rule** (`listStale`, `exportableItems`). The threshold constant sits in the owning module's `constants.ts` and the repository imports it. If the same rule is also needed in memory, add a pure predicate next to the constant and pin with a test that the two agree.
- **Every list query is bounded, in SQL.** A repository method that returns many rows takes a `limit` (plus `offset` or a cursor) and applies `Math.min(limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)`. Both constants live in the owning module's `constants.ts`, and the route's querystring schema caps the same value. Never fetch everything and `.slice()` in the service. The one exception is an aggregation that truly needs every row of one scoped entity. Name that method `…ForAggregate` so the intent is visible.
- **Row → DTO mapping** is a pure function in `helpers.ts`. It takes row types through `import type`. The repository returns rows, the service maps them, and the route returns the DTO.
- **A domain rule used by 2+ modules** stays in the owning module and is exported from its `index.ts`. It moves to a shared folder only when no module owns it.
- **Another module's data or behavior:** go through the container (shared repositories and facades) or the other module's `index.ts`. **Never** import another module's `repository`, `constants` or internal files. A module's `index.ts` is its **public API**: domain types, constants, pure rules and the facade or service. It doesn't re-export `repository.ts` or `routes.ts`.
- **New external system** (SDK, API, CLI): add a **port** (an interface in domain words), an **adapter** that implements it, a **mock** for tests, and a lazy getter plus an override hook in the container. The adapter translates SDK errors into the project's external-service error.
- **A shared library needs a capability** (token counting, clock, LLM): the library **defines the port itself** and receives it as a parameter. The host application passes its adapter in. Never add a host-application dependency to the library.

## Step 3: check the direction

Before you finish, list every new `import` and ask whether it points inward. Then run the repository's dependency-rule command found in Step 0. A failure names the rule. Move the code to the right ring. Don't silence the rule.

Existing code is **not** a reference just because it exists. Frozen violations in a baseline are debt, not a pattern to copy.

**Touching a module that has no service or repository yet?** Create them for the piece you add or change, and leave the rest as it is.

**Touching a file that's in the baseline?** Don't widen the violation. If your change is in the same function, move that piece to the right ring (a small extract is in scope). A full cleanup of the module is a separate task.

## Transactions

- The **service owns the boundary**: `container.db.transaction(async (tx) => { … })`. The repositories do the work inside it.
- Repository methods that must join a transaction take an **optional last parameter** `tx?: DbExecutor` and use `(tx ?? this.db)`. This works for other modules' repositories too: `container.ordersRepo.complete(id, patch, tx)`. You don't `new` another module's repository class.
- **No external I/O inside a transaction** (LLM, payments, git host, chat, queue enqueue). Call out first and write the DB in one short transaction afterwards, or write the DB first and enqueue after commit. A transaction that holds a pooled connection across the network starves the pool.
- **A loop of external side effects** (posting N comments, N LLM calls): **idempotency beats batch atomicity.** Persist each item's result right after its call succeeds (one small write per item, no wrapping transaction), and make the selection query skip items that are already done. A crash then leaves a consistent "done so far" state, and a retry doesn't duplicate anything. Use a single transaction only when **all** the writes are DB-only.

## Red flags

| You're about to… | Instead |
|---|---|
| import the ORM or db schema in `routes.ts` / `service.ts` / `helpers.ts` | Add a method to the module's `repository.ts`. |
| put an `if`/loop business decision in a route handler | Move it to the service or a pure domain function. The route does parse → context → service → status only. |
| `new` an SDK client, or read a secret, inside a module | Use the container's lazy getter. If a method is missing, add it to the port and the adapter. |
| import another module's `repository` or `constants` | Use the container, or that module's `index.ts`. |
| `new OtherRepository(tx)` inside another module | Pass `tx` to the container's repository method. |
| filter rows in JS after the query, or compare a tenant id in the service | Put the predicate and the tenant scope in the SQL `where`. |
| call an external service inside `db.transaction` | Call out first, then run a short transaction. |
| re-`parse` a Zod schema inside the service on validated data | Parse once at the boundary (route, adapter, env). Inside, use `z.infer` types. |
| hand-write a wire type | Use `z.infer` of the contract. |
| write an interface for a repository with one implementation | Don't. Ports exist for external systems. Repositories are concrete classes behind the service. |
| list rows with no limit, or take `limit` from the request without a max | Add `limit` with `DEFAULT_PAGE_SIZE` / `MAX_PAGE_SIZE` and cap it in the route schema too. |
| fetch all rows and `.slice()` in the service | Page in SQL with `.limit()` / `.offset()` in the repository method. |
| regenerate the violations baseline so your change passes | Fix the import. The baseline only shrinks. |
