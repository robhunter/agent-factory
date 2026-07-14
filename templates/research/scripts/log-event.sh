#!/bin/bash
# scripts/log-event.sh — Log a structured event to <dataDir>/logs/events.jsonl
# Provides the timestamp automatically. Resolves dataDir from portal.config.json
# so it writes to the same place the framework does (default ".").
#
# Usage:
#   bash scripts/log-event.sh <type> <summary> [project]
#
# Valid types: work, error, dissonance
# (cycle_start and cycle_end are logged by the framework's wake.sh)

set -e

AGENT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

TYPE="${1:?Usage: log-event.sh <type> <summary> [project]}"
SUMMARY="${2:?Usage: log-event.sh <type> <summary> [project]}"
PROJECT="${3:-}"

# Resolve dataDir (default ".") from portal.config.json without a JSON parser.
DATA_DIR="$(
  grep -o '"dataDir"[[:space:]]*:[[:space:]]*"[^"]*"' "$AGENT_DIR/portal.config.json" 2>/dev/null \
    | head -1 | sed 's/.*:[[:space:]]*"//; s/"$//'
)"
DATA_DIR="${DATA_DIR:-.}"

LOG_FILE="$AGENT_DIR/$DATA_DIR/logs/events.jsonl"
TS="$(date -Iseconds)"

mkdir -p "$AGENT_DIR/$DATA_DIR/logs"

if [ -n "$PROJECT" ]; then
  echo "{\"ts\":\"${TS}\",\"type\":\"${TYPE}\",\"summary\":\"${SUMMARY}\",\"project\":\"${PROJECT}\"}" >> "$LOG_FILE"
else
  echo "{\"ts\":\"${TS}\",\"type\":\"${TYPE}\",\"summary\":\"${SUMMARY}\"}" >> "$LOG_FILE"
fi
