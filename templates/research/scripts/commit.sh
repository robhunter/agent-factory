#!/bin/bash
# scripts/commit.sh — Thin wrapper around the framework's commit.sh.
#
# Commits and pushes the MAIN repo (code, config, memory/, skills/). The
# local-only data/ tier (journals, logs, output) is gitignored from the main
# repo and snapshotted separately by hooks/post-cycle.d/50-commit-data.sh, so
# it never reaches the remote.
#
# Usage: bash scripts/commit.sh ["commit message"]

AGENT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FRAMEWORK_DIR="/root/workspaces/agent-portal"

exec bash "${FRAMEWORK_DIR}/scripts/commit.sh" "${AGENT_DIR}" "$@"
