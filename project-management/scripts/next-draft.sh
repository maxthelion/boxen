#!/bin/bash
# Generate the next draft filename.
#
# Usage: next-draft.sh <boxen|octopoid> <topic-slug>
# Output: Full path to the new draft file
#
# Example:
#   ./project-management/scripts/next-draft.sh boxen agent-progress-tracking
#   → project-management/drafts/boxen/025-2026-02-08-agent-progress-tracking.md

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COUNTER_FILE="$SCRIPT_DIR/../drafts/.counter"

if [ $# -ne 2 ]; then
    echo "Usage: next-draft.sh <boxen|octopoid> <topic-slug>" >&2
    exit 1
fi

SUBDIR="$1"
TOPIC="$2"

if [ "$SUBDIR" != "boxen" ] && [ "$SUBDIR" != "octopoid" ]; then
    echo "Error: first argument must be 'boxen' or 'octopoid'" >&2
    exit 1
fi

# Read current counter
if [ ! -f "$COUNTER_FILE" ]; then
    echo "0" > "$COUNTER_FILE"
fi
CURRENT=$(tr -d '[:space:]' < "$COUNTER_FILE")

# Increment
NEXT=$((CURRENT + 1))

# Write back
echo "$NEXT" > "$COUNTER_FILE"

# Format
NUMBER=$(printf "%03d" "$NEXT")
DATE=$(date +%Y-%m-%d)

echo "project-management/drafts/${SUBDIR}/${NUMBER}-${DATE}-${TOPIC}.md"
