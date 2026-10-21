#!/usr/bin/env bash
# Self-check for browser-url-guard.sh.
set -uo pipefail
S="$(cd "$(dirname "$0")" && pwd)"; G="$S/browser-url-guard.sh"; FAIL=0

# run <caller|-> <tool> [<url>] [<filename>] -> allow | deny
run() {
  local caller=$1 tool=$2 url=${3:-} file=${4:-} json
  json=$(jq -nc --arg t "$tool" --arg u "$url" --arg f "$file" '{tool_name:$t,tool_input:({} + (if $u!="" then {url:$u} else {} end) + (if $f!="" then {filename:$f} else {} end))}')
  [ "$caller" != - ] && json=$(jq -c --arg c "$caller" '.agent_type=$c' <<<"$json")
  [ -n "$(printf '%s' "$json" | "$G" spec-creator)" ] && echo deny || echo allow
}
expect() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: expected $3, got $2"; FAIL=1; fi; }
C=sdd-engineering:spec-creator
N=mcp__plugin_playwright_playwright__browser_navigate

expect "main session may browse anywhere"      "$(run - $N https://example.com)" allow
expect "other agent may browse anywhere"       "$(run other:agent $N https://example.com)" allow
expect "localhost is allowed"                  "$(run $C $N http://localhost:3000/page)" allow
expect "127.0.0.1 is allowed"                  "$(run $C $N http://127.0.0.1:5173)" allow
expect "figma is allowed"                      "$(run $C $N https://www.figma.com/file/abc)" allow
expect "other host is denied"                  "$(run $C $N https://example.com)" deny
expect "lookalike host is denied"              "$(run $C $N https://localhost.evil.com)" deny
expect "figma lookalike is denied"             "$(run $C $N https://notfigma.com)" deny
expect "any MCP prefix works for the allowlist" "$(run $C mcp__playwright__browser_snapshot)" allow
expect "click is allowed"                      "$(run $C mcp__plugin_playwright_playwright__browser_click)" allow
expect "typing is denied"                      "$(run $C mcp__plugin_playwright_playwright__browser_type)" deny
expect "form fill is denied"                   "$(run $C mcp__plugin_playwright_playwright__browser_fill_form)" deny
expect "evaluate is denied"                    "$(run $C mcp__plugin_playwright_playwright__browser_evaluate)" deny
expect "screenshot name must be one segment"   "$(run $C mcp__plugin_playwright_playwright__browser_take_screenshot '' ../x.png)" deny
expect "plain screenshot name is allowed"      "$(run $C mcp__plugin_playwright_playwright__browser_take_screenshot '' home.png)" allow

NOJQ=$(mktemp -d); for t in grep sed head; do printf '#!/bin/sh\nexec "%s" "$@"\n' "$(command -v $t)" > "$NOJQ/$t"; chmod +x "$NOJQ/$t"; done
out=$(printf '{"agent_type":"spec-creator","tool_name":"x"}' | env PATH="$NOJQ" /bin/bash "$G" spec-creator 2>&1); code=$?
if [ $code -eq 2 ] && [[ "$out" == *"brew install jq"* ]]; then echo "ok   no-jq blocks a guarded agent (exit 2)"; else echo "FAIL no-jq guarded: exit $code"; FAIL=1; fi
out=$(printf '{"tool_name":"x"}' | env PATH="$NOJQ" /bin/bash "$G" spec-creator 2>&1); code=$?
if [ -z "$out" ] && [ $code -eq 0 ]; then echo "ok   no-jq does not block the main session"; else echo "FAIL no-jq main: exit $code"; FAIL=1; fi
rm -rf "$NOJQ"
exit $FAIL
