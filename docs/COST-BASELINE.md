# Cost baseline

What the SDD workflow costs on a fixed scenario, measured before any optimization. The raw data is [`cost-baseline/baseline.json`](cost-baseline/baseline.json); the harness is [`scripts/cost-baseline/`](../scripts/cost-baseline/).

## What was measured

| | |
|---|---|
| Plugins | this repository at `50d9434`; `plugins/` is identical to `main` at `ad8d029` (the commits in between only add the harness) |
| Project | `otkachuk777/sdd-sandbox` at `1334018`: a tiny Node todo library with `npm test` |
| Scenario | SPEC-01 "Clear completed todos" (approved, lint-clean, 3 AC, 1 EC, 1 NFR). No human in the loop. |
| Stages | `plan` (implementation-planner) → `implement` (implementer, one chunk) → `verify` (plan-verifier, pass 1) → `review` (code-reviewer and security-reviewer in parallel) |
| Model | `sonnet` for the session and every subagent (`CLAUDE_CODE_SUBAGENT_MODEL`), so no routing differences |
| Runs | 3, each in a fresh clone, the same prompts and the same tool allowlist |
| Counted | the CLI's `total_cost_usd` and `modelUsage` (includes subagents), wall-clock latency, turns, tool calls, permission refusals |

## Quality gate

A run passes only if all of these hold:

1. `npm test` is green.
2. The **hidden acceptance tests** pass. They are copied in after the implementation stage, so the agents never see them: passing proves the spec was met, not that the agents satisfied their own tests.
3. The plan-verifier's report is clean: no item `Not met` or `Partially met`, and the spec is "ready for `implemented`".
4. No agent committed.
5. No false negative: the verifier must not call a run clean when the acceptance tests fail.

## Result

| Metric | Value |
|---|---|
| Runs / passed (strict gate) | 3 / 2 (67%) |
| Runs / acceptance tests green | 3 / 3 |
| Critical failures | 0 |
| Median cost per run | **$1.08** (spread $0.03, about 3%) |
| Cost per successful workflow (all spend / passed runs) | **$1.61** |
| Median cost of a passed run | $1.08 |
| Median latency | 139 s |
| Median tokens: input / output | 60 / 13.0k |
| Median tokens: cache read / cache write | 847.2k / 197.3k |
| Median turns / tool calls | 7 / 25 |
| Median permission refusals | 1 (see Known friction) |

| Stage | Median cost | Share | Median latency | Context tokens in | Tokens out | Turns |
|---|---|---|---|---|---|---|
| plan | $0.35 | 32% | 51 s | 277.9k | 4.6k | 1 |
| review | $0.34 | 31% | 33 s | 332.9k | 3.6k | 1 |
| implement | $0.22 | 20% | 31 s | 338.5k | 2.8k | 3 |
| verify | $0.16 | 15% | 23 s | 122.8k | 2.4k | 2 |

"Context tokens in" is the sum over every model call of the tokens read or written to the prompt cache, so a long context re-read on many turns counts many times.

### Why run 3 is "failed", and why that says little about the plugins

Run 3 passed everything except the verifier check. The verifier listed the plan's claim "the test was seen failing before the code" as **Partially met**, where runs 1 and 2 listed it as **Not verifiable**. That claim cannot be proven from the final state in either wording. All AC, EC and NFR were `Met` and the spec was "ready for `implemented`" in all three runs.

So the strict pass rate is 2 of 3, and counting only the spec-level verdict it is 3 of 3. The gate is reported as it was defined before the runs; it was not loosened afterwards. The cause is a real, separate finding: **in inline test mode the plan-verifier gets an item it can never prove and labels it inconsistently**, which makes "gaps" noise. A follow-up is to make the planner not emit that item, or the verifier to classify it as informational.

## Where the money goes

A control run (the prompt "reply OK", one turn, `sonnet`) shows the fixed price of one `claude -p` process in this environment:

| Control | Cost | Cache write |
|---|---|---|
| with the five marketplace plugins | $0.104 to $0.119 | 25k to 29k |
| without them | $0.103 to $0.104 | 25k |

- **A bare process costs about $0.10 and the marketplace plugins add almost nothing to it** (the difference is inside the run-to-run noise). The base context is the system prompt, the tool definitions and whatever the user's global setup injects.
- The scenario starts four `claude -p` processes plus several subagents, each with its own context. Roughly $0.4 to $0.5 of the $1.08 is therefore this fixed per-context overhead, which does not depend on the plugins and is the same before and after any change to them. In a real interactive session there is one process, so the scenario overstates this share.
- Only `engineering-paved-path:security` was ever loaded as a skill in the nine stage sessions. Skill text is not what costs money.
- Cache writes (197k tokens, about $0.7 at list prices) are the largest single component, ahead of cache reads and output. Anything that makes a context smaller pays off through writes first.

### What an optimization can reach

The agent prompts that actually run in this scenario are the planner (about 4.9k tokens), implementer (2.5k), verifier (1.6k) and the two reviewers (4.6k): about 13.6k tokens, written to cache once per subagent and re-read on each turn. That is roughly $0.09 per run, 8% of the cost. Static analysis found only about 170 of the 26,000 prompt tokens repeated word for word across the eleven agents (under 1%).

Cutting the loaded prompts by a third would save about $0.03 per run (about 3%), which is the size of the run-to-run spread. **With three runs a saving of that size cannot be told apart from noise.** Detecting it would take roughly ten runs per side (about $11 each). The experiment will state this plainly if the result is within the spread, as the lab asks.

## Known friction in the scenario

- **One permission refusal per run, always in `implement`:** `npm test 2>&1 | grep ...` is rewritten by the user's RTK hook to `rtk grep`, which is not in the tool allowlist. It is the same in every run and the implementer recovers, so it does not bias a before/after comparison. The allowlist is intentionally left unchanged for the "after" runs.
- **Plan files:** Claude Code treats `~/.claude/` as sensitive, so a headless planner cannot save its plan without approval. The `plan` stage alone runs with `bypassPermissions` (edits and web tools denied, the plugin hooks still enforce the planner's limits), standing in for the click a person would make.
- **Token and latency accounting:** the CLI's `usage` covers the main session only and `duration_ms` omits late subagents. The harness uses `modelUsage` and wall-clock time. An earlier run with main-session-only tokens was discarded.

## Reproduce

```bash
node scripts/cost-baseline/run.mjs --label baseline --runs 3
node scripts/cost-baseline/run.mjs --report docs/cost-baseline/baseline.json
```

Running it spends real money (about $1.1 per run). A one-turn preflight fails fast, spending nothing, when the login or API is unusable.
