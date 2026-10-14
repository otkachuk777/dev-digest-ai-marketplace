#!/usr/bin/env bash
# PreToolUse hook (matcher: a Playwright MCP tool) that keeps a browsing agent view-only.
#
#   browser-url-guard.sh <agent-name>...
#
# Plugin-level hook scoped by `agent_type` (see readonly-bash-guard.sh for why): it acts only when the
# caller is one of the given agents; the main session and other agents are untouched.
# For a guarded agent: allowlisted tools only (navigate, snapshot, screenshot, click, hover, wait, tabs,
# close, resize), navigation only to localhost, 127.0.0.1 and *.figma.com, and screenshot file names
# that are a single path segment. The MCP server prefix is ignored, so any Playwright plugin name works.
set -uo pipefail

IFS= read -r -d '' INPUT || true

if command -v jq >/dev/null; then
  AGENT=$(printf '%s' "$INPUT" | jq -r '.agent_type // empty' 2>/dev/null)
else
  AGENT=$(printf '%s' "$INPUT" | grep -o '"agent_type"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*:[[:space:]]*"([^"]*)"$/\1/')
fi
GUARDED=0
for name in "$@"; do
  if [ "$AGENT" = "$name" ] || [[ "$AGENT" == *":$name" ]]; then GUARDED=1; fi
done
[ "$GUARDED" = 1 ] || exit 0

command -v jq >/dev/null || { echo "browser-url-guard: jq not found, tool call blocked — install it (macOS: brew install jq; Debian/Ubuntu: sudo apt-get install jq) and retry" >&2; exit 2; }
deny() { jq -nc --arg r "browser-url-guard: $1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'; exit 0; }

TOOL=$(jq -r '.tool_name // ""' <<<"$INPUT" 2>/dev/null)
case "${TOOL##*__}" in
  browser_navigate|browser_navigate_back|browser_snapshot|browser_take_screenshot|browser_click|browser_hover|browser_wait_for|browser_tabs|browser_close|browser_resize) ;;
  *) deny "$TOOL is not allowed: this agent browses view-only (navigate/snapshot/screenshot/click/hover/wait/tabs/close/resize)";;
esac

URL=$(jq -r '.tool_input.url // ""' <<<"$INPUT" 2>/dev/null)
if [ -n "$URL" ]; then
  [[ "$URL" =~ ^https?://(localhost|127\.0\.0\.1|([a-z0-9-]+\.)*figma\.com)(:[0-9]+)?([/?#]|$) ]] \
    || deny "$URL is not allowed: only http(s)://localhost, 127.0.0.1 and *.figma.com; for other sources ask the caller for screenshots"
fi

NAME=$(jq -r '.tool_input.filename // ""' <<<"$INPUT" 2>/dev/null)
if [ -n "$NAME" ]; then
  [[ "$NAME" != */* && "$NAME" != *..* ]] || deny "$NAME: screenshot filename must be a single path segment"
fi
exit 0
