#!/bin/bash
# scripts/start.sh — Container entrypoint. Delegates to the framework.
#
# On first boot the framework may not be cloned yet (setup happens via
# docker exec). Wait for it to appear, then delegate to its start.sh. On
# later restarts the framework is already present, so it starts immediately.

AGENT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FRAMEWORK_DIR="/root/workspaces/agent-portal"

while [ ! -f "${FRAMEWORK_DIR}/scripts/start.sh" ]; do
  echo "Waiting for framework at ${FRAMEWORK_DIR}..."
  sleep 5
done

exec bash "${FRAMEWORK_DIR}/scripts/start.sh" "${AGENT_DIR}"
