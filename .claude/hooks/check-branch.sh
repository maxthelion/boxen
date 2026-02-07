#!/bin/bash
# Block git commits on agent worktree branches.
# Agent branches are named agent/<task-id>-<timestamp> and belong to
# orchestrator agents — interactive sessions should never commit there.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Only check git commit commands
if ! echo "$COMMAND" | grep -q "git commit"; then
  exit 0
fi

BRANCH=$(git branch --show-current 2>/dev/null)
if [[ "$BRANCH" == agent/* ]]; then
  echo "BLOCKED: On agent branch '$BRANCH'. Switch to main first: git checkout main" >&2
  exit 2
fi

exit 0
