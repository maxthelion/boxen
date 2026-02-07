#!/bin/bash
# Write a UTC timestamp to the agent's heartbeat file after each response.
# Silent no-op if AGENT_NAME is not set (interactive sessions).

if [[ -z "$AGENT_NAME" ]]; then
  exit 0
fi

HEARTBEAT_DIR="${CLAUDE_PROJECT_DIR}/.orchestrator/agents/${AGENT_NAME}"
if [[ -d "$HEARTBEAT_DIR" ]]; then
  date -u +"%Y-%m-%dT%H:%M:%SZ" > "${HEARTBEAT_DIR}/heartbeat"
fi

exit 0
