#!/bin/bash
# PreCompact hook: capture agent progress before context compaction.
# Reads the agent's stdout log tail and uses Haiku to generate a brief
# progress summary, appending it to the task notes file.
#
# Silent no-op if AGENT_NAME is not set (interactive sessions).
# Falls back to raw log capture if Haiku call fails.

set -euo pipefail

# --- Guard: only run for orchestrator agents ---
if [[ -z "${AGENT_NAME:-}" ]]; then
  exit 0
fi

# --- Resolve task ID ---
TASK_ID="${CURRENT_TASK_ID:-}"

# Fallback: read from state.json
if [[ -z "$TASK_ID" ]]; then
  STATE_FILE="${ORCHESTRATOR_DIR:-}/agents/${AGENT_NAME}/state.json"
  if [[ -f "$STATE_FILE" ]]; then
    TASK_ID=$(jq -r '.current_task // empty' "$STATE_FILE" 2>/dev/null || true)
  fi
fi

# No task = nothing to checkpoint
if [[ -z "$TASK_ID" ]]; then
  exit 0
fi

# --- Resolve paths ---
NOTES_DIR="${SHARED_DIR:-}/notes"
NOTES_FILE="${NOTES_DIR}/TASK-${TASK_ID}.md"
STDOUT_LOG="${ORCHESTRATOR_DIR:-}/agents/${AGENT_NAME}/stdout.log"

# Ensure notes directory exists
mkdir -p "$NOTES_DIR"

# --- Read recent stdout for context ---
LOG_TAIL=""
if [[ -f "$STDOUT_LOG" ]]; then
  LOG_TAIL=$(tail -c 3000 "$STDOUT_LOG" 2>/dev/null || true)
fi

# If no log content, write a minimal checkpoint
if [[ -z "$LOG_TAIL" ]]; then
  TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  printf "\n## Checkpoint (%s)\n\n- Context compaction occurred (no log content available)\n" "$TIMESTAMP" >> "$NOTES_FILE"
  exit 0
fi

# --- Generate summary with Haiku ---
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

SUMMARY=$(claude -p "You are summarizing an AI agent's progress for a checkpoint. Based on the following log output, write 2-3 bullet points summarizing:
1. What the agent has accomplished so far
2. What it appears to be working on currently
3. What remains to be done (if apparent)

Be concise. Each bullet should be one sentence. Do not include any preamble.

--- LOG OUTPUT ---
${LOG_TAIL}
--- END LOG ---" --model haiku 2>/dev/null || true)

# --- Write checkpoint ---
if [[ -n "$SUMMARY" ]]; then
  printf "\n## Checkpoint (%s)\n\n%s\n" "$TIMESTAMP" "$SUMMARY" >> "$NOTES_FILE"
else
  # Fallback: write raw log tail if Haiku failed
  printf "\n## Checkpoint (%s)\n\n_Haiku summary unavailable. Raw log tail:_\n\n\`\`\`\n%s\n\`\`\`\n" "$TIMESTAMP" "$(echo "$LOG_TAIL" | tail -c 1000)" >> "$NOTES_FILE"
fi

exit 0
