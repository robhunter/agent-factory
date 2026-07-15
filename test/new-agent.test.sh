#!/bin/bash
# test/new-agent.test.sh — end-to-end generator test.
# Generates an agent into a throwaway dir against a fixture fleet and asserts the
# output is structurally valid and fleet-aware. Requires: node, git.

set -u
FACTORY_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

PASS=0; FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }
check() { if eval "$2"; then pass "$1"; else fail "$1"; fi; }

# --- Fixture fleet: two agents on 8080/8081, cron minutes 0 and 30 -----------
FLEET="$WORK/fleet"
for spec in "alpha 8080 0" "beta 8081 30"; do
  set -- $spec
  mkdir -p "$FLEET/$1"
  printf 'name: %s\nport: %s\ncron-schedule: "%s */2 * * *"\n' "$1" "$2" "$3" > "$FLEET/$1/agent.yaml"
  echo '{}' > "$FLEET/$1/portal.config.json"
done

DEST="$WORK/fleethd-research"
echo "=== Generating agent ==="
node "$FACTORY_ROOT/new-agent.js" "FleetHD Research" \
  --agents-root "$FLEET" --dir "$DEST" --repo robhunter/fleethd-research || { echo "generator failed"; exit 1; }

echo; echo "=== Assertions ==="

# Name slugified.
check "dest dir created" "[ -d '$DEST' ]"

# Port allocated to next free (8082), staggered cron minute (not 0/30).
check "port allocated to 8082" "grep -q '^port: 8082$' '$DEST/agent.yaml'"
CRON_MIN="$(grep '^cron-schedule:' "$DEST/agent.yaml" | sed 's/.*"\([0-9]*\) .*/\1/')"
check "cron minute staggered (not 0 or 30)" "[ '$CRON_MIN' != '0' ] && [ '$CRON_MIN' != '30' ]"

# No leftover template tokens anywhere.
check "no unreplaced __TOKENS__ remain" "! grep -rq '__[A-Z_]*__' '$DEST' --include='*.yaml' --include='*.json' --include='*.md' --include='*.sh'"

# Config validity.
check "portal.config.json is valid JSON" "node -e \"JSON.parse(require('fs').readFileSync('$DEST/portal.config.json'))\""
check "portal.config dataDir is data" "node -e \"process.exit(JSON.parse(require('fs').readFileSync('$DEST/portal.config.json')).dataDir==='data'?0:1)\""
check "agent name is slugified to fleethd-research" "grep -q '^name: fleethd-research$' '$DEST/agent.yaml'"

# Playwright MCP ships with the template (matches the running fleet).
check ".mcp.json is present and valid JSON" "node -e \"JSON.parse(require('fs').readFileSync('$DEST/.mcp.json'))\""
check ".mcp.json registers playwright" "node -e \"process.exit(JSON.parse(require('fs').readFileSync('$DEST/.mcp.json')).mcpServers.playwright?0:1)\""

# Two-tier layout.
check "/data/ is gitignored in main repo" "grep -q '^/data/$' '$DEST/.gitignore'"
check "main repo initialized" "[ -d '$DEST/.git' ]"
check "local-only data git initialized" "[ -d '$DEST/data/.git' ]"
check "data/.gitignore excludes human feedback" "grep -q '^input/$' '$DEST/data/.gitignore'"
check "today.md lives under data/, not repo root" "[ -f '$DEST/data/today.md' ] && [ ! -f '$DEST/today.md' ]"
check "state skeleton dirs exist under data/" "[ -d '$DEST/data/journals' ] && [ -d '$DEST/data/output' ] && [ -d '$DEST/data/input/feedback/processed' ]"

# data/ is excluded from the main repo's tracked files.
TRACKED_DATA="$(git -C "$DEST" ls-files data/ | wc -l | tr -d ' ')"
check "main repo tracks zero files under data/" "[ '$TRACKED_DATA' = '0' ]"
check "main repo tracks memory/ (pushed tier)" "[ \"\$(git -C '$DEST' ls-files memory/ | wc -l | tr -d ' ')\" != '0' ]"

# Onboarding sentinel intact so first agentbox run onboards.
check "persona.yaml keeps uninitialized sentinel" "grep -q '^status: uninitialized' '$DEST/memory/persona.yaml'"
check "operational.yaml has no sentinel (not an onboarding topic)" "! grep -q '^status: uninitialized' '$DEST/memory/operational.yaml'"

# Shell scripts are valid.
SYNTAX_OK=1
for s in "$DEST"/scripts/*.sh "$DEST"/hooks/post-cycle.d/*.sh; do bash -n "$s" || SYNTAX_OK=0; done
check "all shipped shell scripts pass bash -n" "[ '$SYNTAX_OK' = '1' ]"

# --- push-all policy variant --------------------------------------------------
DEST2="$WORK/pushall"
node "$FACTORY_ROOT/new-agent.js" pushall --agents-root "$FLEET" --dir "$DEST2" --data-policy push-all >/dev/null
check "push-all: dataDir is '.'" "node -e \"process.exit(JSON.parse(require('fs').readFileSync('$DEST2/portal.config.json')).dataDir==='.'?0:1)\""
check "push-all: no separate data/.git" "[ ! -d '$DEST2/data/.git' ]"
check "push-all: /data/ NOT gitignored" "! grep -q '^/data/$' '$DEST2/.gitignore'"
check "push-all: today.md at repo root" "[ -f '$DEST2/today.md' ]"

echo; echo "=== Summary: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]
