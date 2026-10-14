# Changelog

## 1.0.0

- Initial release of the Spec Driven Development workflow: `spec-creator`, `implementation-planner`, `implementer`, `plan-verifier`, and the skills `run-plan`, `ears-spec`, `workflow-retro`, `engineering-insights`.
- `run-plan` is the generalised `impl` orchestrator. It uses the reviewers and writers of `architecture-review` and `quality-review`, and the `researcher` and `brainstorm` agents of `research-tools`.
- No project paths: agents take explicit inputs and discover the repository's own docs, test locations and commands. `engineering-insights` discovers modules instead of using a fixed list.
- Plugin-level hooks scoped by `agent_type`: read-only Bash guard, path guard (specs and plans), sub-agent type guard, view-only browser guard.
- Behaviour evals: five positive and two negative cases.
