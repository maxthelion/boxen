#!/bin/bash
# PostToolUse hook: count tool invocations for turn budgeting.
#
# Appends a single byte to .orchestrator/agents/$AGENT_NAME/tool_counter
# on each invocation. At task completion, the file size = number of tool calls.
#
# No-op if AGENT_NAME is unset (interactive sessions).

[ -z "$AGENT_NAME" ] && exit 0

COUNTER_DIR="${ORCHESTRATOR_DIR:-${CLAUDE_PROJECT_DIR:-.}/.orchestrator}/agents/$AGENT_NAME"
mkdir -p "$COUNTER_DIR" 2>/dev/null
printf '.' >> "$COUNTER_DIR/tool_counter"

exit 0
