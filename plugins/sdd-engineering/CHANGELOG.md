# Changelog

## 1.1.0

- `spec-creator` no longer finishes a spec while a mandatory requirement has no acceptance criterion. Every "must" / "shall", Goal, User-story outcome and stated limit needs an AC that tests it; a requirement that cannot be made testable stays a blocking open question (no invented number), the spec stays `draft` and the report says `Not finished`. The final report now lists `Requirements: <covered>/<total> covered by an AC`, and the self-check has an eleventh item for it.
- Evals: two new cases for this behaviour (nine in total; the seven existing cases are unchanged), and a `fileMatches` check in the eval runner.

## 1.0.0

- Initial release of the Spec Driven Development workflow: `spec-creator`, `implementation-planner`, `implementer`, `plan-verifier`, and the skills `run-plan`, `ears-spec`, `workflow-retro`, `engineering-insights`.
- `run-plan` is the generalised `impl` orchestrator. It uses the reviewers and writers of `architecture-review` and `quality-review`, and the `researcher` and `brainstorm` agents of `research-tools`.
- No project paths: agents take explicit inputs and discover the repository's own docs, test locations and commands. `engineering-insights` discovers modules instead of using a fixed list.
- Plugin-level hooks scoped by `agent_type`: read-only Bash guard, path guard (specs and plans), sub-agent type guard, view-only browser guard.
- Behaviour evals: five positive and two negative cases.
