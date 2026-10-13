#!/usr/bin/env bash
# PreToolUse hook (matcher: Agent) that limits which sub-agents an agent may start.
#
#   agent-type-guard.sh <caller>=<type>[,<type>...] [<caller>=<type>...]
#
# The `Agent(type, …)` allowlist in `tools` is ignored for subagents, and Claude Code ignores `hooks:`
# in the frontmatter of plugin agents, so this runs as a plugin-level hook that fires for every Agent
# call. It acts ONLY when the hook input's `agent_type` is one of the given callers (with or without
# a "<plugin>:" prefix); for the main session and every other agent it exits 0 and does nothing.
#
# For a guarded caller: `subagent_type` must be one of its allowed types (a bare name also matches
# "<plugin>:<name>"), and `run_in_background` must be an explicit false. An omitted value is forced
# to false, because a background child's report would bypass the caller.
set -uo pipefail

IFS= read -r -d '' INPUT || true

if command -v jq >/dev/null; then
  CALLER=$(printf '%s' "$INPUT" | jq -r '.agent_type // empty' 2>/dev/null)
else
  CALLER=$(printf '%s' "$INPUT" | grep -o '"agent_type"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*:[[:space:]]*"([^"]*)"$/\1/')
fi
ALLOWED=""; FOUND=0
for pair in "$@"; do
  name=${pair%%=*}
  if [ "$CALLER" = "$name" ] || [[ "$CALLER" == *":$name" ]]; then FOUND=1; ALLOWED=${pair#*=}; fi
done
[ "$FOUND" = 1 ] || exit 0

command -v jq >/dev/null || { echo "agent-type-guard: jq not found, Agent call blocked — install it (macOS: brew install jq; Debian/Ubuntu: sudo apt-get install jq) and retry" >&2; exit 2; }
deny() { jq -nc --arg r "agent-type-guard: $1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'; exit 0; }

[ -n "$ALLOWED" ] || deny "no allowed sub-agent types configured for $CALLER"
TYPE=$(jq -r '.tool_input.subagent_type // ""' <<<"$INPUT" 2>/dev/null)
BG=$(jq -c '.tool_input.run_in_background' <<<"$INPUT" 2>/dev/null)  # JSON: false | true | null | "…"

ok=0
IFS=',' read -r -a TYPES <<<"$ALLOWED"
for t in "${TYPES[@]}"; do
  if [ "$TYPE" = "$t" ] || [[ "$TYPE" == *":$t" ]]; then ok=1; fi
done
[ "$ok" = 1 ] || deny "subagent_type '${TYPE:-<none>}' is not allowed for $CALLER; allowed: ${ALLOWED//,/ }"
[ "$BG" = false ] && exit 0
if [ "$BG" = null ]; then
  jq -c '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"allow",permissionDecisionReason:"agent-type-guard: run_in_background forced to false",updatedInput:(.tool_input + {run_in_background:false})}}' <<<"$INPUT"
  exit 0
fi
deny "run_in_background must be false (got: $BG): wait for the $TYPE report yourself"
