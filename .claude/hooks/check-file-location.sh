#!/bin/bash
# Block edits to files inside agent worktrees.
# Agent worktrees are managed by the orchestrator — editing them
# directly from an interactive session causes conflicts.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

if [[ "$FILE_PATH" == */.orchestrator/agents/*/worktree/* ]] || \
   [[ "$FILE_PATH" == *agents/*/worktree/* ]]; then
  echo "BLOCKED: File is inside an agent worktree. Edit in the main repo instead." >&2
  exit 2
fi

exit 0
