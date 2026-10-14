#!/usr/bin/env bash
# Print the INSIGHTS.md file(s) this session should read and write.
#
# Deciding the target from git is cheaper and more reliable than asking the model
# to guess from the conversation: the working tree already knows what was touched.
#
# Modules are discovered: a top-level directory that has its own package manifest
# (package.json, pyproject.toml, go.mod, Cargo.toml) or already has an INSIGHTS.md.
# Set INSIGHTS_MODULES="api web" to name them explicitly instead.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

MODULES=()
if [ -n "${INSIGHTS_MODULES:-}" ]; then
  read -ra MODULES <<< "$INSIGHTS_MODULES"
else
  for d in */; do
    d="${d%/}"
    case "$d" in node_modules|dist|build|vendor) continue ;; esac
    if [ -f "$d/INSIGHTS.md" ] || [ -f "$d/package.json" ] || [ -f "$d/pyproject.toml" ] \
       || [ -f "$d/go.mod" ] || [ -f "$d/Cargo.toml" ]; then
      MODULES+=("$d")
    fi
  done
fi

# Uncommitted work is the session's own footprint. Deliberately NOT diffing against
# main: on a long-lived branch that returns every module the branch ever touched,
# which drowns the actual signal.
# INSIGHTS.md files are excluded: a wrap-up that appends to api/INSIGHTS.md would
# otherwise look like "this session touched api", and once several are edited the
# script points at every module at once.
# `|| true` on each grep: an empty result is a legitimate answer here, but grep exits 1
# on no-match and `set -o pipefail` would otherwise abort the script.
strip_meta() {
  { grep -v '/INSIGHTS\.md$' || true; } | { grep -v '^INSIGHTS\.md$' || true; }
}

CHANGED="$(git status --porcelain | sed 's/^...//' | sed 's/.* -> //' | tr -d '"' | strip_meta | sort -u)"

# Nothing pending usually means the session just committed. Look at that commit
# rather than giving up and defaulting to root.
if [ -z "$CHANGED" ]; then
  CHANGED="$(git diff --name-only HEAD~1..HEAD 2>/dev/null | strip_meta || true)"
fi

if [ -z "$CHANGED" ]; then
  echo "INSIGHTS.md"
  echo "detect-module: no changes found; defaulted to root. Override if you know the module." >&2
  exit 0
fi

HIT=()
OUTSIDE=0
while IFS= read -r file; do
  [ -z "$file" ] && continue
  matched=0
  for m in ${MODULES[@]+"${MODULES[@]}"}; do
    case "$file" in
      "$m"/*) HIT+=("$m"); matched=1; break ;;
    esac
  done
  [ "$matched" -eq 0 ] && OUTSIDE=1
done <<< "$CHANGED"

UNIQ=()
if [ ${#HIT[@]} -gt 0 ]; then
  while IFS= read -r m; do UNIQ+=("$m"); done < <(printf '%s\n' ${HIT[@]+"${HIT[@]}"} | sort -u)
fi

for m in ${UNIQ[@]+"${UNIQ[@]}"}; do echo "$m/INSIGHTS.md"; done

# Root gets the lesson when it spans modules, or when the change sits outside them
# all (build config, scripts/, docs/) — that knowledge belongs to nobody's module.
if [ ${#UNIQ[@]} -ne 1 ] || [ "$OUTSIDE" -eq 1 ]; then
  echo "INSIGHTS.md"
fi
