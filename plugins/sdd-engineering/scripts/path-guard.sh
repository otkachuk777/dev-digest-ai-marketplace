#!/usr/bin/env bash
# PreToolUse hook (matcher: Write|Edit) that confines write-capable agents to their own files.
#
#   path-guard.sh <agent>=<profile> [<agent>=<profile> ...]
#
# Claude Code ignores `hooks:` in the frontmatter of plugin agents, so this runs as a plugin-level
# hook (hooks/hooks.json) that fires for every Write/Edit. It acts ONLY when the hook input's
# `agent_type` matches one of the given agent names (with or without a "<plugin>:" prefix); for the
# main session and every other agent it exits 0 and does nothing.
#
# Profiles:
#   tests — test files and test-only support: *.test.*, *.spec.*, *_test.go, test_*.py, *_test.py,
#           conftest.py, test/ tests/ __tests__/ __mocks__/ __fixtures__/ fixtures/ testdata/ e2e/ directories
#   docs  — documentation: docs/**, <dir>/docs/**, README.md, <dir>/README.md; never agent
#           instructions (CLAUDE.md, AGENTS.md, INSIGHTS.md), specs, plan archives or .claude/
#   plans — draft plan files: ~/.claude/plans/<name>.md (outside the repository)
#   specs — specs: specs/SPEC-NN-<slug>.md or <dir>/specs/SPEC-NN-<slug>.md, plus decoded design
#           extracts docs/designs/extracted/<kebab>.(jsx|tsx|html|md)
#
# Covers Edit/Write only. Bash writes are limited by the agent prompt, not here.
set -uo pipefail

IFS= read -r -d '' INPUT || true

# ---- who is calling? (works without jq) ------------------------------------
if command -v jq >/dev/null; then
  AGENT=$(printf '%s' "$INPUT" | jq -r '.agent_type // empty' 2>/dev/null)
else
  AGENT=$(printf '%s' "$INPUT" | grep -o '"agent_type"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*:[[:space:]]*"([^"]*)"$/\1/')
fi
PROFILE=""
for pair in "$@"; do
  name=${pair%%=*}
  if [ "$AGENT" = "$name" ] || [[ "$AGENT" == *":$name" ]]; then PROFILE=${pair#*=}; fi
done
[ -n "$PROFILE" ] || exit 0

# From here on the caller is a guarded agent: fail closed.
command -v jq >/dev/null || { echo "path-guard: jq not found, tool call blocked — install it (macOS: brew install jq; Debian/Ubuntu: sudo apt-get install jq) and retry" >&2; exit 2; }
deny() { jq -nc --arg r "path-guard($PROFILE): $1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'; exit 0; }

FILE=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null)
[ -n "$FILE" ] || deny "no file_path in tool input"

# On Windows (Git Bash, MSYS, Cygwin) Claude Code passes C:\… paths and git prints C:/…; compare
# everything in POSIX form, or a Windows path is taken as relative and matched against the wrong rules.
to_posix() { if command -v cygpath >/dev/null; then cygpath -u -- "$1"; else printf '%s' "$1"; fi; }
FILE=$(to_posix "$FILE")

if [ "$PROFILE" = plans ]; then
  # Checked before the repo root: drafts live in the harness plan dir, outside the working tree.
  PLANS="$(to_posix "$HOME")/.claude/plans"
  case "$FILE" in "$PLANS"/*.md) NAME=${FILE#"$PLANS"/};; *) deny "$FILE is not a draft plan in $PLANS/*.md";; esac
  [[ "$NAME" =~ ^[A-Za-z0-9._+-]+\.md$ ]] && [[ "$NAME" != *..* ]] && exit 0
  deny "$NAME: plan file name must be a single path segment of [A-Za-z0-9._+-]"
fi

ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || deny "not inside a git repository"
ROOT=$(to_posix "$ROOT")
case "$FILE" in /*) ;; *) FILE="$PWD/$FILE";; esac
case "/$FILE/" in */../*|*/./*) deny "$FILE: relative segments are not allowed";; esac

# Resolve symlinks in the directory part (the file itself may not exist yet) so that a repository
# reached through a symlink (/tmp, /var) matches `git rev-parse` and a symlink cannot lead outside it.
resolve() {
  local p=$1 tail=""
  while [ ! -d "$p" ] && [ "$p" != / ]; do tail="/${p##*/}$tail"; p=${p%/*}; [ -n "$p" ] || p=/; done
  printf '%s%s' "$(cd -P "$p" 2>/dev/null && pwd -P)" "$tail"
}
FILE=$(resolve "$FILE")
ROOT=$(cd -P "$ROOT" && pwd -P)
case "$FILE" in "$ROOT"/*) REL=${FILE#"$ROOT"/};; *) deny "$FILE is outside the repository";; esac

case "$PROFILE" in
  tests)
    case "$REL" in
      *.test.*|*.spec.*) exit 0;;
      *_test.go|test_*.py|*/test_*.py|*_test.py|conftest.py|*/conftest.py) exit 0;;
      test/*|*/test/*|tests/*|*/tests/*|__tests__/*|*/__tests__/*|__mocks__/*|*/__mocks__/*|__fixtures__/*|*/__fixtures__/*|fixtures/*|*/fixtures/*|testdata/*|*/testdata/*|e2e/*|*/e2e/*) exit 0;;
    esac
    deny "$REL is not a test file. This agent may only write tests (*.test.*, *.spec.*, *_test.go, test_*.py, *_test.py, conftest.py) and test support in test/, tests/, __tests__/, __mocks__/, __fixtures__/, fixtures/, testdata/ or e2e/ directories; prove fail-ability with the mutation probe instead of editing production code."
    ;;
  docs)
    # Plan archives named by run-plan's SDD_PLAN_DIRS are protected like docs/plans.
    for d in ${SDD_PLAN_DIRS:-}; do
      d=${d%/}
      case "$REL" in "$d"/*) deny "$REL is a protected docs area (plan archive in SDD_PLAN_DIRS)";; esac
    done
    case "$REL" in
      .claude/*) deny "$REL is agent configuration, not documentation";;
      docs/plans/*|docs/cc-plans/*|docs/reports/*) deny "$REL is a protected docs area (plans and reports)";;
      specs/*|*/specs/*) deny "$REL is a spec, not documentation";;
      CLAUDE.md|*/CLAUDE.md|AGENTS.md|*/AGENTS.md|INSIGHTS.md|*/INSIGHTS.md) deny "$REL holds agent instructions or insights, not documentation";;
    esac
    [[ "$REL" =~ ^(docs/.+|.+/docs/.+|README\.md|.+/README\.md)$ ]] && exit 0
    deny "$REL is outside the documentation locations (docs/, <dir>/docs/, README.md, <dir>/README.md)"
    ;;
  specs)
    [[ "$REL" =~ ^([A-Za-z0-9._-]+/)*specs/SPEC-[0-9]{2,}-[a-z0-9]+(-[a-z0-9]+)*\.md$ ]] && exit 0
    # Decoded design screens extracted from an encoded design bundle.
    [[ "$REL" =~ ^docs/designs/extracted/[a-z0-9]+(-[a-z0-9]+)*\.(jsx|tsx|html|md)$ ]] && exit 0
    deny "$REL is not a spec file. This agent may only write <dir>/specs/SPEC-NN-<kebab-slug>.md, specs/SPEC-NN-<kebab-slug>.md for cross-module specs, or docs/designs/extracted/<kebab-name>.(jsx|tsx|html|md)"
    ;;
  *) deny "unknown profile '$PROFILE' (expected tests|docs|plans|specs)";;
esac
