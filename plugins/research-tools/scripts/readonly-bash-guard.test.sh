#!/usr/bin/env bash
# Self-check for readonly-bash-guard.sh: only guarded agents are restricted, read-only commands
# pass through, write-shaped commands are denied.
set -uo pipefail
S="$(cd "$(dirname "$0")" && pwd)"
G="$S/readonly-bash-guard.sh"
FAIL=0

# run <agent_type|-> <command>: prints "deny" when the guard emits a decision, else "allow"
run() {
  local agent="$1" cmd="$2" json
  if [ "$agent" = "-" ]; then json=$(jq -nc --arg c "$cmd" '{tool_input:{command:$c}}')
  else json=$(jq -nc --arg c "$cmd" --arg a "$agent" '{agent_type:$a,tool_input:{command:$c}}'); fi
  [ -n "$(printf '%s' "$json" | "$G" researcher brainstorm)" ] && echo deny || echo allow
}
check() { # <command> <allow|deny>  (as a guarded agent)
  local got; got=$(run "research-tools:researcher" "$1")
  if [ "$got" = "$2" ]; then echo "ok   $2  $1"; else echo "FAIL expected $2, got $got: $1"; FAIL=1; fi
}
expect() { # <label> <actual> <expected>
  if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: expected $3, got $2"; FAIL=1; fi
}

# ---- scoping: only the named agents are restricted -------------------------
expect "main session (no agent_type) is not restricted" "$(run - 'rm -rf /tmp/x')" allow
expect "other agent is not restricted"                  "$(run other-plugin:implementer 'rm -rf /tmp/x')" allow
expect "namespaced guarded agent is restricted"         "$(run research-tools:researcher 'rm -rf /tmp/x')" deny
expect "bare guarded agent name is restricted"          "$(run brainstorm 'touch f')" deny

# ---- must stay allowed (a researcher's own toolkit) ------------------------
check "grep -rn foo src" allow
check "cat src/app.ts" allow
check "git diff" allow
check "git diff --stat" allow
check "git log --oneline -20" allow
check "git show HEAD~1" allow
check "git status" allow
check "cd app && pnpm typecheck" allow
check "cd app && pnpm test" allow
check "cd lib && npm test" allow
check "cd lib && npm run typecheck" allow
check "diff -r a/src b/src" allow
check "ls -la docs" allow
check "find . -name '*.test.ts'" allow
check "pnpm test 2>&1" allow
check "pnpm lint > /dev/null" allow
check "some-cmd 2>&1 | tail -50" allow
check "npx vitest run 2>&1 | tail -100" allow
check "cd app && pnpm audit" allow
check "cd lib && npm audit --json" allow
check "git diff main -U0 | grep -nE '^\+.*AKIA[0-9A-Z]{16}'" allow
check "git ls-files --others --exclude-standard | xargs grep -nE 'gh[ps]_[A-Za-z0-9]{36,}'" allow
check "git for-each-ref --format='%(refname:short)' refs/heads refs/remotes" allow
check "npm audit --json | grep fix" allow
check "cd app && pnpm -C . test" allow
check "cd app && pnpm vitest run -t add" allow

# ---- must be denied (write-shaped) -----------------------------------------
check "echo hi > f.txt" deny
check "echo hi >> f.txt" deny
check "pnpm lint > out.log" deny
check "rm -rf /tmp/x" deny
check "git rm foo.ts" deny
check "mv a.ts b.ts" deny
check "cp a.ts b.ts" deny
check "touch new-file.ts" deny
check "mkdir new-dir" deny
check "chmod +x script.sh" deny
check "sed -i 's/a/b/' file.ts" deny
check "perl -i -pe 's/a/b/' file.ts" deny
check "git commit -m 'x'" deny
check "git add -A" deny
check "git push" deny
check "git checkout main" deny
check "git reset --hard" deny
check "git stash" deny
check "git apply patch.diff" deny
check "git branch -a" deny
check "git branch -d old" deny
check "pnpm install" deny
check "npm install" deny
check "cd app && pnpm db:generate" deny
check "cd app && pnpm db:migrate" deny
check "some_cmd | tee out.txt" deny
check "find . -name '*.log' -delete" deny
check "find . -name '*.tmp' -exec rm {} \;" deny
check "npm audit fix" deny
check "cd app && pnpm audit --fix" deny
check "npm audit fix --force" deny
check "npm --prefix lib audit fix" deny
check "pnpm -C app audit --fix" deny
check "npm audit fix; echo done" deny
check "npm audit fix&& echo done" deny
check "npm --prefix lib install" deny
check "pnpm -C app add zod" deny
check "pnpm --filter app install" deny
check "npm install; echo done" deny

# ---- `>` inside quotes / a quoted-delimiter heredoc is code, not redirection --
check "node -e 'console.log(a>b)'" allow
check "grep -v '=>' src/a.ts" allow
check 'python3 -c "print(1>0)"' allow
check $'python3 - <<\'EOF\'\nprint(1>0)\nEOF' allow
check $'python3 - <<"EOF" | head\nprint(1>0)\nEOF' allow
check 'echo "x" > f.txt' deny
check "echo 'x' >> f.txt" deny
check 'echo "$(date > f.txt)"' deny
check 'echo "`date > f.txt`"' deny
check $'cat <<\'EOF\' > f.txt\nx\nEOF' deny
check $'cat <<EOF\n$(date > f.txt)\nEOF' deny
check $'python3 - <<\'EOF\' > out.txt\nprint(1)\nEOF' deny

# the git branch deny names the read-only alternative
jq -nc '{agent_type:"researcher",tool_input:{command:"git branch -a"}}' | "$G" researcher | grep -q 'for-each-ref' \
  && echo "ok   git branch deny reason names for-each-ref" \
  || { echo "FAIL git branch deny reason lacks for-each-ref hint"; FAIL=1; }

# without perl the quote stripper can't run → fail closed for a guarded agent
NOPERL=$(mktemp -d); for t in jq sed grep; do ln -s "$(command -v $t)" "$NOPERL/$t"; done
out=$(jq -nc '{agent_type:"researcher",tool_input:{command:"echo x > f.txt"}}' | env PATH="$NOPERL" /bin/bash "$G" researcher)
rm -rf "$NOPERL"
[[ "$out" == *'perl not found'* ]] && echo "ok   no-perl → deny" || { echo "FAIL no-perl: $out"; FAIL=1; }

# without jq (grep/sed/head still present): a guarded agent is blocked (exit 2, install hint) ...
NOJQ=$(mktemp -d); for t in grep sed head; do ln -s "$(command -v $t)" "$NOJQ/$t"; done
out=$(printf '{"agent_type":"research-tools:researcher","tool_input":{"command":"ls"}}' | env PATH="$NOJQ" /bin/bash "$G" researcher 2>&1); code=$?
if [ $code -eq 2 ] && [[ "$out" == *"brew install jq"* ]]; then echo "ok   no-jq blocks a guarded agent (exit 2)"; else echo "FAIL no-jq guarded: exit $code, out: $out"; FAIL=1; fi
# ... but the main session and other agents keep working
for payload in '{"tool_input":{"command":"rm x"}}' '{"agent_type":"other:agent","tool_input":{"command":"rm x"}}'; do
  out=$(printf '%s' "$payload" | env PATH="$NOJQ" /bin/bash "$G" researcher 2>&1); code=$?
  if [ -z "$out" ] && [ $code -eq 0 ]; then echo "ok   no-jq does not block an unguarded caller"; else echo "FAIL no-jq unguarded: exit $code, out: $out"; FAIL=1; fi
done
rm -rf "$NOJQ"

exit $FAIL
