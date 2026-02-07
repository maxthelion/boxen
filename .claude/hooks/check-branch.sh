#!/bin/bash
# Guard rails for Bash commands:
# 1. Block git commits on agent worktree branches (interactive sessions)
# 2. Block pip install -e that targets the shared orchestrator venv

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Block pip install -e from agent worktrees (they hijack the shared venv)
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
if echo "$COMMAND" | grep -qE "pip install.*-e|pip install.*--editable"; then
  if [[ "$CWD" == *"/agents/"*"/worktree"* ]]; then
    echo "BLOCKED: Do not run pip install -e from an agent worktree. It will corrupt the shared scheduler venv." >&2
    exit 2
  fi
fi

# Block git commits on agent branches
if echo "$COMMAND" | grep -q "git commit"; then
  BRANCH=$(git branch --show-current 2>/dev/null)
  if [[ "$BRANCH" == agent/* ]]; then
    echo "BLOCKED: On agent branch '$BRANCH'. Switch to main first: git checkout main" >&2
    exit 2
  fi
fi

exit 0
