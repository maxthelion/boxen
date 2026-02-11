#!/bin/bash
# Dummy implementer - simulates agent work without Claude API

set -e

TASK_ID=$1
if [ -z "$TASK_ID" ]; then
  echo "Usage: $0 <task-id>"
  exit 1
fi

echo "🤖 Dummy implementer claiming task $TASK_ID"

# Check if worktree exists
WORKTREE=".octopoid/tasks/$TASK_ID/worktree"
if [ ! -d "$WORKTREE" ]; then
  echo "❌ Worktree not found: $WORKTREE"
  echo "   Task must be claimed first"
  exit 1
fi

# Simulate work
echo "   Working on task..."
sleep 5

# Create dummy commit
cd "$WORKTREE"
echo "Dummy fix for task $TASK_ID" > dummy-change.txt
git add dummy-change.txt
git commit -m "fix: dummy implementation for $TASK_ID"

echo "   Created 1 commit"

# Go back to project root
cd - >/dev/null

# Report completion (adjust command based on actual v2.0 API)
echo "✅ Dummy implementer completed task $TASK_ID"
echo "   Next: Run dummy-gatekeeper.sh to approve"

# Note: Actual completion command will depend on v2.0 API
# npx octopoid task complete "$TASK_ID" --commits 1 --turns 0
