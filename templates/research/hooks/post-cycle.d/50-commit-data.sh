#!/bin/bash
# post-cycle hook — snapshot the local-only data/ tier.
#
# The data/ directory (journals, logs, output, today.md, uploads) is gitignored
# from the main repo and carries its OWN git repo that is never pushed. This
# hook commits a snapshot each cycle so the human can "reset to yesterday" if a
# cycle goes wrong, without polluting the remote's history with per-cycle churn.
#
# Run by the framework's run-hooks.sh with no arguments, so resolve paths from
# this script's own location. No-ops cleanly for agents on the push-all policy
# (no data/.git present).

set -u

AGENT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
DATA_GIT="$AGENT_DIR/data"

# Push-all policy (dataDir=".") or uninitialized — nothing to do.
[ -d "$DATA_GIT/.git" ] || exit 0

cd "$DATA_GIT" || exit 0

git add -A
if git diff --cached --quiet; then
  exit 0   # no state changed this cycle
fi

# Identity falls back to a local default if the container env didn't set one.
# This repo is never pushed, so the author is cosmetic.
git \
  -c user.name="${GIT_AUTHOR_NAME:-agent}" \
  -c user.email="${GIT_AUTHOR_EMAIL:-agent@localhost}" \
  commit -q -m "data snapshot $(date -Iseconds)" || true
