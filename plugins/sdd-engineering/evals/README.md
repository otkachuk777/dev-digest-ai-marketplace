# Behaviour evals

Seven cases that check what the SDD workflow does, not just that its files are valid.

| Kind | Cases |
|---|---|
| Positive | `spec-creator` asks questions and writes nothing in round 1 · `implementation-planner` refuses a draft spec · `researcher` leaves the repository unchanged on a write request · `test-writer` may write a test but not a production file · `run-plan` stops when there is no approved spec |
| Negative | An ordinary edit request starts no SDD skill or agent · A plain question triggers no retrospective or insights write |

Each case builds a throwaway git repository from its fixture, runs `claude -p` with all five marketplace plugins loaded (`--plugin-dir`), and grades deterministic signals only: files, tool calls, and tool results. The main session answers in the user's language, so cases prefer tool results (agent reports and hook messages are English) over free text.

```bash
node plugins/sdd-engineering/evals/run.mjs --validate         # check cases.json, no model calls (CI)
node plugins/sdd-engineering/evals/run.mjs                    # run every case
node plugins/sdd-engineering/evals/run.mjs --case <id> --model sonnet
EVAL_SHOW_OUTPUT=1 node plugins/sdd-engineering/evals/run.mjs --case <id>   # print the model's output and tool results
```

The child process gets an explicit tool allowlist (no `bypassPermissions`), no web tools, Bash limited to `git`, `ls`, `cat`, `grep`, `touch` and `wc`, and only the environment `claude` needs (PATH, HOME, `ANTHROPIC_*`, `CLAUDE_*`, proxy and certificate variables), so unrelated tokens are not inherited. Run it on a machine you trust anyway: it executes a model.

Running the cases calls the model and costs tokens, so CI only validates the file. Run the cases before every release and record the result in the release notes.

## What the evals do not prove

- Hook mechanics (denying a write-shaped command, scoping by `agent_type`) are proven by the script tests in `scripts/*.test.sh`. A model eval cannot force an agent to break its own rules, so the `researcher` case checks the outcome (nothing changed), not which layer stopped the write.
- `[verify: manual]` behaviour of a full `run-plan` cycle is checked by hand before a release.

## Adding a case

Add an object to `cases.json` with an `id`, `kind` (`positive` or `negative`), `fixture` (path → file content), `prompt`, optional `maxTurns`, and `expect` (each item has exactly one check: `outputMatches`, `outputNotMatches`, `toolResultMatches`, `toolResultNotMatches`, `fileExists`, `fileAbsent`, `noNewFilesUnder`, `noNewCommits`, `toolUsed`, `toolNotUsed`). A negative case must assert `toolNotUsed`.
