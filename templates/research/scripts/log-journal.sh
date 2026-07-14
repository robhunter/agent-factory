#!/bin/bash
# scripts/log-journal.sh — Append a journal entry to <dataDir>/journals/YYYY-MM.md
# Reads the agent's name from agent.yaml at runtime for attribution, and resolves
# dataDir from portal.config.json so entries land where the portal reads them.
#
# Usage:
#   bash scripts/log-journal.sh <tag> "content here"
#
# Valid tags: cycle, output, feedback, observation, direction, note, question

set -e

AGENT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

TAG="${1:?Usage: log-journal.sh <tag> \"content\"}"
CONTENT="${2:?Usage: log-journal.sh <tag> \"content\"}"

case "$TAG" in
  cycle|output|feedback|observation|direction|note|question) ;;
  *) echo "Error: invalid tag '$TAG'. Must be one of: cycle, output, feedback, observation, direction, note, question" >&2; exit 1 ;;
esac

# Runtime-read the agent name from agent.yaml (attribution survives renames).
AUTHOR="$(
  grep '^name:' "$AGENT_DIR/agent.yaml" 2>/dev/null \
    | head -1 \
    | sed 's/^name:[[:space:]]*//' \
    | sed 's/[[:space:]]*#.*//' \
    | sed 's/^["'\'']//' \
    | sed 's/["'\'']$//' \
    | sed 's/[[:space:]]*$//'
)"
AUTHOR="${AUTHOR:-agent}"

# Resolve dataDir (default ".") from portal.config.json.
DATA_DIR="$(
  grep -o '"dataDir"[[:space:]]*:[[:space:]]*"[^"]*"' "$AGENT_DIR/portal.config.json" 2>/dev/null \
    | head -1 | sed 's/.*:[[:space:]]*"//; s/"$//'
)"
DATA_DIR="${DATA_DIR:-.}"

TS="$(date -Iseconds)"
YYYY_MM="$(date +%Y-%m)"
JOURNALS_DIR="$AGENT_DIR/$DATA_DIR/journals"
JOURNAL_FILE="$JOURNALS_DIR/$YYYY_MM.md"

mkdir -p "$JOURNALS_DIR"

if [ ! -f "$JOURNAL_FILE" ]; then
  printf '# Journal — %s\n\n---\n' "$YYYY_MM" > "$JOURNAL_FILE"
fi

printf '\n### %s | %s | %s\n%s\n' "$TS" "$AUTHOR" "$TAG" "$CONTENT" >> "$JOURNAL_FILE"
