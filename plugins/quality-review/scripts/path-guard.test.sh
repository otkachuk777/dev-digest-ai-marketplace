#!/usr/bin/env bash
# Self-check for path-guard.sh: only the named agents are restricted, each profile allows its own
# locations and denies everything else.
set -uo pipefail
S="$(cd "$(dirname "$0")" && pwd)"
G="$S/path-guard.sh"
FAIL=0
REPO=$(mktemp -d); git -C "$REPO" init -q; cd "$REPO" || exit 1
ARGS=(test-writer=tests doc-writer=docs implementation-planner=plans spec-creator=specs)

# run <agent_type|-> <file>: prints "deny" when the guard emits a decision, else "allow"
run() {
  local json
  if [ "$1" = "-" ]; then json=$(jq -nc --arg f "$2" '{tool_input:{file_path:$f}}')
  else json=$(jq -nc --arg f "$2" --arg a "$1" '{agent_type:$a,tool_input:{file_path:$f}}'); fi
  [ -n "$(printf '%s' "$json" | "$G" "${ARGS[@]}")" ] && echo deny || echo allow
}
check() { # <agent> <file> <allow|deny>
  local got; got=$(run "$1" "$2")
  if [ "$got" = "$3" ]; then echo "ok   $3  $1 $2"; else echo "FAIL expected $3, got $got: $1 $2"; FAIL=1; fi
}

# ---- scoping ---------------------------------------------------------------
check -                         "$REPO/src/app.ts" allow
check other-plugin:implementer  "$REPO/src/app.ts" allow
check quality-review:test-writer "$REPO/src/app.ts" deny
check test-writer               "$REPO/src/app.ts" deny

T=quality-review:test-writer
check $T "$REPO/src/app.test.ts" allow
check $T "$REPO/src/app.test.tsx" allow
check $T "src/app.spec.js" allow
check $T "$REPO/test/helpers/db.ts" allow
check $T "$REPO/pkg/__tests__/a.ts" allow
check $T "$REPO/pkg/__fixtures__/data.json" allow
check $T "$REPO/e2e/flows/01-login.flow.json" allow
check $T "$REPO/src/app.ts" deny
check $T "$REPO/package.json" deny
check $T "$REPO/CLAUDE.md" deny
check $T "$REPO/src/../src/app.ts" deny
check $T "/etc/passwd" deny

D=quality-review:doc-writer
check $D "$REPO/docs/architecture.md" allow
check $D "$REPO/docs/adr/0001-choice.md" allow
check $D "$REPO/pkg/docs/README.md" allow
check $D "$REPO/README.md" allow
check $D "$REPO/pkg/README.md" allow
check $D "$REPO/docs/plans/x.md" deny
check $D "$REPO/docs/cc-plans/x.md" deny
check $D "$REPO/specs/SPEC-01-a.md" deny
check $D "$REPO/pkg/specs/SPEC-01-a.md" deny
check $D "$REPO/CLAUDE.md" deny
check $D "$REPO/pkg/INSIGHTS.md" deny
check $D "$REPO/AGENTS.md" deny
check $D "$REPO/.claude/agents/x.md" deny
check $D "$REPO/src/app.ts" deny

P=sdd-engineering:implementation-planner
check $P "$HOME/.claude/plans/my-plan.md" allow
check $P "$HOME/.claude/plans/sub/my-plan.md" deny
check $P "$HOME/.claude/plans/my-plan.txt" deny
check $P "$REPO/docs/plans/x.md" deny

SP=sdd-engineering:spec-creator
check $SP "$REPO/specs/SPEC-01-login.md" allow
check $SP "$REPO/api/specs/SPEC-12-rate-limit.md" allow
check $SP "$REPO/docs/designs/extracted/home-screen.html" allow
check $SP "$REPO/specs/notes.md" deny
check $SP "$REPO/specs/SPEC-1-short.md" deny
check $SP "$REPO/src/app.ts" deny

# a symlink inside the repository must not lead the agent outside it
OUT=$(mktemp -d); ln -s "$OUT" "$REPO/escape"
check $T "$REPO/escape/evil.test.ts" deny
rm -rf "$OUT"

# unknown profile fails closed
out=$(jq -nc --arg f "$REPO/x" '{agent_type:"a",tool_input:{file_path:$f}}' | "$G" a=nonsense)
[[ "$out" == *"unknown profile"* ]] && echo "ok   unknown profile denied" || { echo "FAIL unknown profile: $out"; FAIL=1; }

# without jq: a guarded agent is blocked, others keep working
NOJQ=$(mktemp -d); for t in grep sed head git; do ln -s "$(command -v $t)" "$NOJQ/$t"; done
out=$(printf '{"agent_type":"quality-review:test-writer","tool_input":{"file_path":"x"}}' | env PATH="$NOJQ" /bin/bash "$G" "${ARGS[@]}" 2>&1); code=$?
if [ $code -eq 2 ] && [[ "$out" == *"brew install jq"* ]]; then echo "ok   no-jq blocks a guarded agent (exit 2)"; else echo "FAIL no-jq guarded: exit $code, out: $out"; FAIL=1; fi
out=$(printf '{"tool_input":{"file_path":"x"}}' | env PATH="$NOJQ" /bin/bash "$G" "${ARGS[@]}" 2>&1); code=$?
if [ -z "$out" ] && [ $code -eq 0 ]; then echo "ok   no-jq does not block the main session"; else echo "FAIL no-jq main: exit $code, out: $out"; FAIL=1; fi
rm -rf "$NOJQ" "$REPO"

exit $FAIL
