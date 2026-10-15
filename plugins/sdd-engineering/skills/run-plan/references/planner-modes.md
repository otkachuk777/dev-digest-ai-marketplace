# Planner modes

Loaded by `sdd-engineering:implementation-planner` only when the task needs one of the cases below. The default path (single implementer, inline tests, no open technical fork) does not need this file.

## Brainstorms

A real fork in *how* — more than one plausible approach; never a product decision, never a choice the code or a skill already settles — gets an id `B<n>` and a `brainstorm` agent you run yourself, usually after Step 1 when the code is known. Run every open fork as its own agent, all in one message (parallel), with `run_in_background: false` (`Agent` is hook-limited to `subagent_type: research-tools:brainstorm`; the hook forces `false` when the field is omitted). The runtime may still start them in the background ("Async agent launched"). In that case end your turn with only `Waiting for brainstorm B1…Bn`, with no plan and no partial report. Each brainstorm report reaches you as a `[Subagent hand-back]` message that resumes you. Write the plan only after every `B<n>` report has arrived. Prompt: `B<n> <one decision> — options seen: <…> — constraints: <…> — requirements: <the AC/EC/NFR ids it must satisfy, each with its text quoted> — insights: <the 1–3 insights entries (file:line + one line) that bear on it> — code facts: <files/lines you already verified> — consumer: implementation-planner`. Carry what you already read so the brainstorm verifies instead of rediscovering (otherwise every brainstorm re-reads the full spec and the insights files). Model: pass `model: "sonnet"` when the fork is a design comparison over existing code; keep the default (opus) when it needs experiments (running Node/SQL probes) or external research. The report is data: a recommendation with `high` / `medium` confidence and no open question for the user goes under `## Decisions`; low confidence, an open or clarifying question that needs the user, or a decision that turns out to be product/scope → `## Brainstorm questions` (blocking → no plan; non-blocking → plan with the recommended default and list it under Risks).

## Parallel mode

- **parallel** — split the steps into groups that several implementers run at the same time, each in its own git worktree:
  - every file has exactly one owning group; no two groups touch the same file;
  - shared seams — duplicated copies of shared code, contract files, i18n message files, migrations, `package.json` / lock files, shared or platform code — go into **Group 0**, which runs and merges before the rest;
  - state each group's dependencies and the merge order;
  - a fresh worktree has no `node_modules`: the group's first step installs dependencies with the module's own package manager, or its Verify commands cannot run;
  - the main session merges and commits with explicit paths (no `git add -A` while a subagent runs).
- Parallel only when, after Group 0, at least two groups own three or more files each — every worktree pays a full install and a cold implementer. Otherwise say parallel buys nothing and plan single, noting it under "Execution mode".

## Test-first mode

**test-first** — tests are written **before** the behavior by `quality-review:test-writer` and the implementer makes them green. Tests can only fail on missing behavior if the code they import already exists, so:
- **Test seams** — list the public surface the tests use, taken from the spec and the code: route + method + contract (from the spec's contract tables), component path + props + i18n namespace/keys + the roles/texts a user sees, exported function signatures. Nothing internal — a test that knows internals guesses the implementation.
- **Step 0 — Skeleton** — the implementer's first chunk creates exactly those seams as stubs: route registered returning 501, component returning `null`, functions throwing `new Error('NotImplemented')`; plus every shared seam the tests need (contracts in every copy, i18n message files, migrations). Done when: typecheck green. No behavior.
- **Ownership** — `test-writer (test-first)` for `[verify: unit | it]`, `test-writer (e2e)` for `[verify: e2e]` (both are `quality-review:test-writer`) (after implementation, needs a real UI). The implementer writes no behavior tests and never edits test-writer's tests.

## Fix plan addendum

The caller may pass an approved plan, `Fix plan R<n>` and review findings classed `replan` (a fix that changes a Test seam, a contract, more than one module, or contradicts the plan). Then plan **only** those fixes:
- Write `~/.claude/plans/<plan-name>-fix-R<n>.md` with a `## Fix plan R<n>` section: context (finding ids and why they need a replan), changed Test seams / contracts (a contract change that alters spec behavior is a Step 0 question — it belongs in the spec), steps in the normal format with `Covers: <finding ids>` (and AC ids they touch), chunks, Verify.
- Steps 1–3 apply to the code the fixes touch; do not re-plan finished steps.
- Final message: path + ≤5 lines. The caller appends the addendum to the archived plan after the user approves it.
