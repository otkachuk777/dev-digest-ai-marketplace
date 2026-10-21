#!/usr/bin/env bash
# PreToolUse hook (matcher: Bash) that keeps read-only agents read-only.
#
#   readonly-bash-guard.sh <agent-name>...
#
# Claude Code ignores `hooks:` in the frontmatter of plugin agents, so this runs as a plugin-level
# hook (hooks/hooks.json) that fires for every Bash call. It acts ONLY when the hook input's
# `agent_type` is one of the names given as arguments (with or without a "<plugin>:" prefix);
# for the main session and every other agent it exits 0 and does nothing.
#
# It denies commands that write to the filesystem or git history, or install packages and run
# migrations. This is NOT a sandbox: it blocks known write shapes, not every way to mutate state.
set -uo pipefail

# Read stdin with a bash builtin so the guard needs no external tool just to identify the caller.
IFS= read -r -d '' INPUT || true

# ---- who is calling? (works without jq) ------------------------------------
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

# From here on the caller is a guarded read-only agent: fail closed.
command -v jq >/dev/null || { echo "readonly-bash-guard: jq not found, tool call blocked — install it (macOS: brew install jq; Debian/Ubuntu: sudo apt-get install jq) and retry" >&2; exit 2; }
deny() { jq -nc --arg r "readonly-bash-guard: $1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'; exit 0; }

CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null)
[ -n "$CMD" ] || exit 0

# ---- redirection -----------------------------------------------------------
# A `>` that is code, not redirection, is dropped first: the body of a heredoc
# with a QUOTED delimiter (<<'EOF' — no expansion inside), single-quoted strings,
# and double-quoted strings without $( or backticks (those still run commands).
# Then strip the allowed no-op redirections (discard to /dev/null, dup an existing
# fd like 2>&1); anything left with a bare `>`/`>>` writes a real file.
command -v perl >/dev/null || deny "perl not found, cannot parse quotes — command blocked: $CMD"
UNQUOTED=$(printf '%s' "$CMD" | perl -0777 -pe '
  s/<<-?[ \t]*([\x27"])(\w+)\1([^\n]*)\n.*?(?:\n[ \t]*\2[ \t]*(?=\n|\z)|\z)/<<$3/gs;
  s/(\x27[^\x27]*\x27)|"((?:[^"\\]|\\.)*)"/my $d = $2; defined $1 ? "" : ($d =~ m{\$\(|`} ? "\"$d\"" : "")/ge;
')
STRIPPED=$(printf '%s' "$UNQUOTED" | sed -E 's/[0-9]*>&[0-9]+//g; s/&>[[:space:]]*\/dev\/null//g; s/[0-9]*>>?[[:space:]]*\/dev\/null//g')
if printf '%s' "$STRIPPED" | grep -q '>'; then
  deny "redirection to a file is not allowed: $CMD"
fi

# ---- deny-listed write commands (matched as whole words) -------------------
DENY_WORDS='tee|rm|mv|cp|touch|mkdir|rmdir|chmod|chown|truncate'
if printf '%s' "$CMD" | grep -qE "(^|[|;&]|[[:space:]])($DENY_WORDS)([[:space:]]|\$)"; then
  deny "write command is not allowed for a read-only agent: $CMD"
fi

# sed -i / perl -i (in-place edit) — sed/perl themselves (no -i) are read-only.
if printf '%s' "$CMD" | grep -qE '(^|[|;&]|[[:space:]])(sed|perl)[[:space:]]+(-[a-zA-Z]*i|--in-place)'; then
  deny "in-place edit is not allowed for a read-only agent: $CMD"
fi

# find -delete (mutating flag; a plain `find` without it is read-only).
if printf '%s' "$CMD" | grep -qE '(^|[|;&]|[[:space:]])find[[:space:]].*-delete([[:space:]]|$)'; then
  deny "find -delete is not allowed for a read-only agent: $CMD"
fi

# ---- git: deny known-mutating subcommands, allow read-only ones ------------
GIT_DENY='commit|add|push|checkout|reset|stash|apply|rebase|merge|cherry-pick|revert|clean|branch|tag|rm|mv|restore'
# `git branch` lists OR creates/deletes depending on args — deny all forms, but
# name the read-only way to list branches so the agent can retry.
if printf '%s' "$CMD" | grep -qE "(^|[|;&]|[[:space:]])git[[:space:]]+branch([[:space:]|;&]|\$)"; then
  deny "git branch is not allowed for a read-only agent (to list branches use: git for-each-ref --format='%(refname:short)' refs/heads refs/remotes): $CMD"
fi
if printf '%s' "$CMD" | grep -qE "(^|[|;&]|[[:space:]])git[[:space:]]+($GIT_DENY)([[:space:]]|\$)"; then
  deny "git write command is not allowed for a read-only agent: $CMD"
fi

# ---- package managers: deny install/modify; allow test/typecheck/lint ------
# Global flags may sit before the subcommand (`npm --prefix x install`, `pnpm -C x add y`).
if printf '%s' "$CMD" | grep -qE '(^|[|;&]|[[:space:]])(npm|pnpm|yarn)([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:]]*)?)*[[:space:]]+(install|i|ci|add|remove|uninstall|update|upgrade|link|publish)([[:space:]|;&]|$)'; then
  deny "package install/modify is not allowed for a read-only agent: $CMD"
fi

# `audit` is read-only, `audit fix` / `audit --fix` rewrites package.json/lockfile.
if printf '%s' "$CMD" | grep -qE '(^|[|;&]|[[:space:]])(npm|pnpm)([[:space:]][^|;&]*)?[[:space:]]audit([[:space:]][^|;&]*)?[[:space:]](fix|--fix)([[:space:]|;&]|$)'; then
  deny "audit fix modifies package.json/lockfile: $CMD"
fi

# Python and Rust: installs and lock/manifest changes. `uv run`, `pytest`, `cargo test|clippy` stay allowed.
if printf '%s' "$CMD" | grep -qE '(^|[|;&]|[[:space:]])(pip3?|uv[[:space:]]+pip)[[:space:]]+(install|uninstall|download)([[:space:]|;&]|$)' \
   || printf '%s' "$CMD" | grep -qE '(^|[|;&]|[[:space:]])(uv|poetry)[[:space:]]+(add|remove|sync|lock|install|update|init)([[:space:]|;&]|$)' \
   || printf '%s' "$CMD" | grep -qE '(^|[|;&]|[[:space:]])cargo[[:space:]]+(add|remove|install|update|fix|new|init)([[:space:]|;&]|$)'; then
  deny "package install/modify is not allowed for a read-only agent: $CMD"
fi

# ---- Go and formatters: `go test|vet|list|build ./...` and `go mod graph|why|verify` stay allowed -----
if printf '%s' "$CMD" | grep -qE '(^|[|;&]|[[:space:]])go[[:space:]]+(get|install|generate|fmt|fix)([[:space:]|;&]|$)' \
   || printf '%s' "$CMD" | grep -qE '(^|[|;&]|[[:space:]])go[[:space:]]+mod[[:space:]]+(tidy|vendor|edit|init)([[:space:]|;&]|$)' \
   || printf '%s' "$CMD" | grep -qE '(^|[|;&]|[[:space:]])go[[:space:]]+work[[:space:]]+(init|use|edit|sync|vendor)([[:space:]|;&]|$)'; then
  deny "go command that changes code, go.mod/go.sum or installs binaries is not allowed for a read-only agent: $CMD"
fi
# `go build|test -o <file>` writes a binary; only -o /dev/null is a no-op.
for out in $(printf '%s' "$CMD" | grep -oE '(^|[|;&]|[[:space:]])go[[:space:]]+(build|test)[[:space:]][^|;&]*' | grep -oE '[[:space:]]-o([[:space:]]+|=)[^[:space:]]+' | sed -E 's/^[[:space:]]-o([[:space:]]+|=)//'); do
  [ "$out" = /dev/null ] || deny "go build/test -o writes a binary ($out); use -o /dev/null: $CMD"
done
# Formatters and linters that rewrite files.
if printf '%s' "$CMD" | grep -qE '(^|[|;&]|[[:space:]])(gofmt|goimports)([[:space:]][^|;&]*)?[[:space:]]-w([[:space:]|;&=]|$)' \
   || printf '%s' "$CMD" | grep -qE '(^|[|;&]|[[:space:]])golangci-lint([[:space:]][^|;&]*)?[[:space:]]--fix([[:space:]|;&=]|$)' \
   || { printf '%s' "$CMD" | grep -qE '(^|[|;&]|[[:space:]])cargo[[:space:]]+fmt([[:space:]|;&]|$)' \
        && ! printf '%s' "$CMD" | grep -qE '(^|[|;&]|[[:space:]])cargo[[:space:]]+fmt[[:space:]][^|;&]*--check'; }; then
  deny "formatter/linter that rewrites files is not allowed for a read-only agent (use its check/diff mode): $CMD"
fi

# ---- DB migrations/seeds ----------------------------------------------------
if printf '%s' "$CMD" | grep -qE 'db:(migrate|generate|seed|push|drop)'; then
  deny "database migration/seed command is not allowed for a read-only agent: $CMD"
fi

exit 0
