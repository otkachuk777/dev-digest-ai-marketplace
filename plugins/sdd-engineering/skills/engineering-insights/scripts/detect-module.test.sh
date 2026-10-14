#!/usr/bin/env bash
# Self-check for detect-module.sh on a throwaway git repo.
set -uo pipefail
S="$(cd "$(dirname "$0")" && pwd)/detect-module.sh"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT; cd "$T" || exit 1
git init -q && git config user.email t@t && git config user.name t
mkdir -p api web docs tools; echo '{}' > api/package.json; echo '{}' > web/package.json; echo x > docs/a.md
git add -A; git commit -q -m init
touch api/a.ts web/a.ts; git add -A; git commit -q -m second
fail=0
expect() { # name, expected (newline-joined), actual
  if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: want [$2], got [$3]"; fail=1; fi; }

expect "no changes in the last commit -> modules touched there" "api/INSIGHTS.md
web/INSIGHTS.md
INSIGHTS.md" "$("$S" 2>/dev/null)"
echo a >> api/a.ts
expect "one module touched" "api/INSIGHTS.md" "$("$S")"
echo a >> web/a.ts
expect "two modules touched -> both plus root" "api/INSIGHTS.md
web/INSIGHTS.md
INSIGHTS.md" "$("$S")"
git checkout -q -- . ; echo a >> docs/a.md
expect "change outside modules -> root only" "INSIGHTS.md" "$("$S")"
git checkout -q -- . ; echo a >> tools/x.sh
expect "a directory with no manifest is not a module" "INSIGHTS.md" "$("$S")"
echo a >> api/a.ts
expect "module plus outside change -> module and root" "api/INSIGHTS.md
INSIGHTS.md" "$("$S")"
git checkout -q -- . ; rm -f tools/x.sh; echo a >> web/a.ts
expect "INSIGHTS_MODULES overrides discovery" "INSIGHTS.md" "$(INSIGHTS_MODULES="api" "$S")"
exit $fail
