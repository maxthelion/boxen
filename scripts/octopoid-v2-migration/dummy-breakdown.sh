#!/bin/bash
# Dummy breakdown - creates fake subtasks

set -e

TASK_ID=$1
if [ -z "$TASK_ID" ]; then
  echo "Usage: $0 <task-id>"
  exit 1
fi

echo "🔨 Dummy breakdown agent analyzing task $TASK_ID"

# Simulate analysis
sleep 3

# Create dummy breakdown
echo "📝 Creating 2 dummy subtasks"

# Note: Actual commands will depend on v2.0 API
echo "   Subtask 1: Subtask 1 from $TASK_ID"
echo "   Subtask 2: Subtask 2 from $TASK_ID"

# npx octopoid task create "Subtask 1 from $TASK_ID" --role implement --parent "$TASK_ID"
# npx octopoid task create "Subtask 2 from $TASK_ID" --role implement --parent "$TASK_ID"

echo "✅ Breakdown complete"
