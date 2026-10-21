#!/usr/bin/env bash
# Self-check for agent-type-guard.sh.
set -uo pipefail
S="$(cd "$(dirname "$0")" && pwd)"; G="$S/agent-type-guard.sh"; FAIL=0
ARGS=(spec-creator=researcher implementation-planner=brainstorm,researcher)

# run <caller|-> <subagent_type> <run_in_background JSON|omit>  -> allow | deny | forced
run() {
  local caller=$1 type=$2 bg=$3 json out
  json=$(jq -nc --arg t "$type" '{tool_input:{subagent_type:$t}}')
  [ "$bg" != omit ] && json=$(jq -c --argjson b "$bg" '.tool_input.run_in_background=$b' <<<"$json")
  [ "$caller" != - ] && json=$(jq -c --arg c "$caller" '.agent_type=$c' <<<"$json")
  out=$(printf '%s' "$json" | "$G" "${ARGS[@]}")
  if [ -z "$out" ]; then echo allow
  elif [[ "$out" == *'"permissionDecision":"allow"'* ]]; then echo forced
  else echo deny; fi
}
expect() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: expected $3, got $2"; FAIL=1; fi; }

expect "main session is not restricted"            "$(run - anything true)" allow
expect "other agent is not restricted"             "$(run other:implementer anything true)" allow
expect "allowed type, explicit false"              "$(run sdd-engineering:spec-creator research-tools:researcher false)" allow
expect "bare allowed type name"                    "$(run spec-creator researcher false)" allow
expect "type not on the allowlist"                 "$(run sdd-engineering:spec-creator research-tools:brainstorm false)" deny
expect "second caller, multiple types"             "$(run sdd-engineering:implementation-planner research-tools:brainstorm false)" allow
expect "background true is denied"                 "$(run sdd-engineering:spec-creator researcher true)" deny
expect "background omitted is forced to false"     "$(run sdd-engineering:spec-creator researcher omit)" forced
expect "empty type is denied"                      "$(run sdd-engineering:spec-creator '' false)" deny

NOJQ=$(mktemp -d); for t in grep sed head; do printf '#!/bin/sh\nexec "%s" "$@"\n' "$(command -v $t)" > "$NOJQ/$t"; chmod +x "$NOJQ/$t"; done
out=$(printf '{"agent_type":"spec-creator","tool_input":{}}' | env PATH="$NOJQ" /bin/bash "$G" "${ARGS[@]}" 2>&1); code=$?
if [ $code -eq 2 ] && [[ "$out" == *"brew install jq"* ]]; then echo "ok   no-jq blocks a guarded caller (exit 2)"; else echo "FAIL no-jq guarded: exit $code, out: $out"; FAIL=1; fi
out=$(printf '{"tool_input":{}}' | env PATH="$NOJQ" /bin/bash "$G" "${ARGS[@]}" 2>&1); code=$?
if [ -z "$out" ] && [ $code -eq 0 ]; then echo "ok   no-jq does not block the main session"; else echo "FAIL no-jq main: exit $code, out: $out"; FAIL=1; fi
rm -rf "$NOJQ"
exit $FAIL
