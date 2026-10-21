#!/usr/bin/env bash
# Self-check for impl-status.sh on a throwaway git repo.
set -uo pipefail
S="$(cd "$(dirname "$0")" && pwd)/impl-status.sh"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT; cd "$T" || exit 1
git init -q && git config user.email t@t && git config user.name t && git commit -q --allow-empty -m init
BASE=$(git rev-parse HEAD)
fail=0
check() { # arg, regex, name
  local out; out=$("$S" "$1"); echo "$out" | grep -qE "$2" && echo "ok   $3" || { echo "FAIL $3: want /$2/, got: $out"; fail=1; }; }
expect() { check SPEC-07 "$1" "$2"; }
mark() { git commit -q --allow-empty -m "SDD(SPEC-07): $1"; }

expect 'phase=blocked-spec spec=none' 'no spec'
mkdir -p specs docs/plans docs/cc-plans drafts
printf '# Spec: x\nSpec ID: SPEC-07\nStatus: draft\n' > specs/SPEC-07-x.md
expect 'phase=blocked-spec .*status=draft' 'draft spec'
sed -i.bak 's/Status: draft/Status: approved/' specs/SPEC-07-x.md && rm specs/*.bak
expect 'phase=blocked-plan' 'approved, no plan'
printf '# Plan\n- Source: specs/SPEC-070-y.md\nVerify SPEC-07 later\n' > docs/plans/2026-10-01+other.md
expect 'phase=blocked-plan' 'SPEC-070 source / bare mention do not count'
printf '# Plan\n- Source: `specs/SPEC-07-x.md` (Status: approved)\n' > drafts/spec-07-x.md
check drafts/spec-07-x.md 'phase=setup .*plan=drafts/spec-07-x.md' 'draft plan path given'
printf '# Plan\n- Source: specs/SPEC-07-x.md\n' > docs/plans/2026-10-02+x.md
expect 'phase=setup .*plan=docs/plans/2026-10-02\+x.md' 'archived plan, nothing done'
mv docs/plans/2026-10-02+x.md docs/cc-plans/2026-10-02+x.md
expect 'phase=setup .*plan=docs/cc-plans/2026-10-02\+x.md' 'plan archived under the alternative directory'
out=$(SDD_PLAN_DIRS="elsewhere" "$S" SPEC-07); echo "$out" | grep -q 'phase=blocked-plan' && echo "ok   SDD_PLAN_DIRS overrides the search" || { echo "FAIL SDD_PLAN_DIRS: $out"; fail=1; }
mark plan
expect 'phase=build .*last=plan' 'plan committed'
mark chunk-2
expect 'phase=build .*last=chunk-2' 'mid build'
mark gate
expect 'phase=review .*review_round=1' 'gate passed'
mark review-2
expect 'phase=review .*review_round=3' 'after review-2'
sed -i.bak 's/Status: approved/Status: implemented/' specs/SPEC-07-x.md && rm specs/*.bak
expect 'phase=final' 'implemented, markers present'
git reset -q --soft "$BASE" && git commit -q --allow-empty -m "feat: x (SPEC-07)"
expect 'phase=done' 'implemented, squashed'

# ---- technical plans: TECH-NN, no spec ----
BASE=$(git rev-parse HEAD)
tech() { check TECH-03 "$1" "$2"; }
tmark() { git commit -q --allow-empty -m "SDD(TECH-03): $1"; }
tech 'phase=blocked-plan spec=none status=technical plan=none' 'tech: no plan'
printf '# Plan\n- Source: technical task from the caller, no behavior change (TECH-030)\n' > docs/plans/2026-10-03+other.md
tech 'phase=blocked-plan' 'tech: TECH-030 does not count'
printf '# Plan\n- Source: technical task from the caller, no behavior change (TECH-03)\n' > drafts/tech-03.md
check drafts/tech-03.md 'phase=setup spec=none status=technical plan=drafts/tech-03.md' 'tech: draft plan path given'
P=docs/plans/2026-10-04+foundation.md
printf '# Plan\n## Requirements\n- Source: technical task from the caller, no behavior change (TECH-03)\n## Requirements review\n- Status: approved\n' > "$P"
tech "phase=setup spec=none status=technical plan=$(printf '%s' "$P" | sed 's/+/\\+/')" 'tech: archived plan, nothing done'
tmark plan
tech 'phase=build .*last=plan' 'tech: plan committed'
tmark chunk-1
tmark gate
tech 'phase=review .*review_round=1' 'tech: gate passed'
sed -i.bak 's/^- Source: \(.*\)$/- Source: \1\n- Plan status: implemented/' "$P" && rm "$P.bak"
tech 'phase=final .*status=implemented' 'tech: implemented, markers present'
git reset -q --soft "$BASE" && git commit -q --allow-empty -m "build: foundation (TECH-03)"
tech 'phase=done' 'tech: implemented, squashed'
out=$("$S" FOO-1 2>&1); code=$?
[ $code -eq 64 ] && [[ "$out" == *"SPEC-NN or TECH-NN"* ]] && echo "ok   unknown id → usage error" || { echo "FAIL unknown id: exit $code, $out"; fail=1; }
exit $fail
