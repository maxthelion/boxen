#!/bin/bash
# Dummy gatekeeper - auto-approves everything

set -e

TASK_ID=$1
if [ -z "$TASK_ID" ]; then
  echo "Usage: $0 <task-id>"
  exit 1
fi

echo "🔍 Dummy gatekeeper reviewing task $TASK_ID"

# Simulate review
sleep 2

# Auto-approve
echo "   Review complete: APPROVED"
echo "✅ Dummy gatekeeper approving task $TASK_ID"

# Note: Actual approval command will depend on v2.0 API
# npx octopoid task approve "$TASK_ID"
echo "   (Run: npx octopoid task approve $TASK_ID)"
