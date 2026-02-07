#!/bin/bash
# PostToolUse hook: detect git commit commands and log them.
# Fires after Bash tool calls complete. If the command was a git commit
# and AGENT_NAME is set, appends a timestamped entry to the agent's commits.log.
#
# Silent no-op if:
#   - AGENT_NAME is not set (interactive sessions)
#   - Command is not a git commit
#   - The commit appears to have failed

# --- Guard: only run for orchestrator agents ---
if [[ -z "${AGENT_NAME:-}" ]]; then
  exit 0
fi

# --- Parse input ---
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

# --- Check if this is a git commit command ---
if ! echo "$COMMAND" | grep -q "git commit"; then
  exit 0
fi

# --- Check if the commit succeeded ---
TOOL_OUTPUT=$(echo "$INPUT" | jq -r '.tool_output // empty' 2>/dev/null)
if echo "$TOOL_OUTPUT" | grep -qiE "^(error|fatal|abort)"; then
  exit 0
fi

# --- Extract commit message from git output ---
# Successful git commit output looks like: [branch hash] commit message
# e.g., "[sqlite-model abc1234] fix: add feature X"
COMMIT_MSG=""

# Try to extract from the git output line "[branch hash] message"
# Use sed to capture everything after "] " on lines starting with "["
COMMIT_MSG=$(echo "$TOOL_OUTPUT" | sed -n 's/^ *\[.*\] *//p' | head -1 | cut -c1-80)

# Fallback: just note a commit happened
if [[ -z "$COMMIT_MSG" ]]; then
  COMMIT_MSG="(commit detected)"
fi

# --- Resolve log path ---
AGENTS_DIR="${ORCHESTRATOR_DIR:-${CLAUDE_PROJECT_DIR}/.orchestrator}/agents/${AGENT_NAME}"
LOG_FILE="${AGENTS_DIR}/commits.log"

# Ensure agent directory exists
if [[ ! -d "$AGENTS_DIR" ]]; then
  exit 0
fi

# --- Get working directory ---
CWD=$(echo "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)
if [[ -z "$CWD" ]]; then
  CWD="(unknown)"
fi

# --- Append log entry ---
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
printf "%s | %s | %s\n" "$TIMESTAMP" "$COMMIT_MSG" "$CWD" >> "$LOG_FILE"

exit 0
