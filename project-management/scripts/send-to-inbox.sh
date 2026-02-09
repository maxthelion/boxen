#!/bin/bash
# Send a message to the human inbox.
#
# Usage:
#   project-management/scripts/send-to-inbox.sh --title "Title" --body "Body text"
#   project-management/scripts/send-to-inbox.sh --title "Title" --body "Body" --from "agent-name"
#   project-management/scripts/send-to-inbox.sh --title "Title" --body "Body" --type "notification"
#
# Options:
#   --title   Message title (required)
#   --body    Message body (required)
#   --from    Sender name (optional, default: "system")
#   --type    Message type suffix for filename (optional, default: "notification")
#
# Creates a timestamped .md file in project-management/human-inbox/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INBOX_DIR="$SCRIPT_DIR/../human-inbox"

TITLE=""
BODY=""
FROM="system"
TYPE="notification"

while [ $# -gt 0 ]; do
    case "$1" in
        --title)
            TITLE="$2"
            shift 2
            ;;
        --body)
            BODY="$2"
            shift 2
            ;;
        --from)
            FROM="$2"
            shift 2
            ;;
        --type)
            TYPE="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1" >&2
            echo "Usage: send-to-inbox.sh --title \"Title\" --body \"Body\" [--from \"agent\"] [--type \"notification\"]" >&2
            exit 1
            ;;
    esac
done

if [ -z "$TITLE" ]; then
    echo "Error: --title is required" >&2
    exit 1
fi

if [ -z "$BODY" ]; then
    echo "Error: --body is required" >&2
    exit 1
fi

# Create inbox dir if it doesn't exist
mkdir -p "$INBOX_DIR"

# Generate filename: YYYY-MM-DD-HHMM-<type>.md
TIMESTAMP=$(date +%Y-%m-%d-%H%M)
FILENAME="${TIMESTAMP}-${TYPE}.md"
FILEPATH="${INBOX_DIR}/${FILENAME}"

# Avoid collisions by appending a suffix
if [ -f "$FILEPATH" ]; then
    COUNTER=1
    while [ -f "${INBOX_DIR}/${TIMESTAMP}-${TYPE}-${COUNTER}.md" ]; do
        COUNTER=$((COUNTER + 1))
    done
    FILENAME="${TIMESTAMP}-${TYPE}-${COUNTER}.md"
    FILEPATH="${INBOX_DIR}/${FILENAME}"
fi

# Write the message
cat > "$FILEPATH" <<EOF
# ${TITLE}

**Created:** $(date -u +%Y-%m-%dT%H:%M:%SZ)
**From:** ${FROM}

## Message

${BODY}
EOF

echo "$FILEPATH"
