#!/bin/bash
# Inject a warning into context if we're on an agent branch.
# This runs on every prompt submission so Claude always knows
# which branch it's on.

BRANCH=$(git branch --show-current 2>/dev/null)
if [[ "$BRANCH" == agent/* ]]; then
  echo "WARNING: Current git branch is '$BRANCH' (an agent worktree branch). You should switch to main before making changes: git checkout main"
fi
