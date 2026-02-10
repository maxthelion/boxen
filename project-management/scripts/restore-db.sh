#!/bin/bash
set -euo pipefail

# Restore orchestrator database from a snapshot
# Usage: ./restore-db.sh [snapshot-filename]
# If no filename provided, restores from the latest snapshot

SNAPSHOT_DIR="project-management/db-snapshots"
DB_PATH=".orchestrator/state.db"

# If snapshot filename provided as argument, use it
if [ $# -gt 0 ]; then
    SNAPSHOT_TO_RESTORE="$SNAPSHOT_DIR/$1"
    if [ ! -f "$SNAPSHOT_TO_RESTORE" ]; then
        echo "ERROR: Snapshot not found: $SNAPSHOT_TO_RESTORE"
        exit 1
    fi
else
    # Find latest snapshot
    SNAPSHOT_TO_RESTORE=$(ls -t "$SNAPSHOT_DIR"/state-*.db 2>/dev/null | head -1)

    if [ -z "$SNAPSHOT_TO_RESTORE" ]; then
        echo "ERROR: No snapshots found in $SNAPSHOT_DIR"
        exit 1
    fi
fi

echo "Found snapshot: $SNAPSHOT_TO_RESTORE"
echo ""

# Check if scheduler is running
if pgrep -f "orchestrator.scheduler" > /dev/null; then
    echo "WARNING: Orchestrator scheduler appears to be running."
    echo "It's recommended to stop the scheduler before restoring the database."
    echo "You can stop it with: /kill-all-agents"
    echo ""
    read -p "Do you want to proceed anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Restore cancelled."
        exit 0
    fi
fi

# Create .orchestrator directory if it doesn't exist
mkdir -p .orchestrator

# Backup existing DB if it exists
if [ -f "$DB_PATH" ]; then
    BACKUP_PATH="$DB_PATH.backup-$(date +%Y-%m-%d-%H%M%S)"
    echo "Backing up current database to: $BACKUP_PATH"
    cp "$DB_PATH" "$BACKUP_PATH"
fi

# Restore snapshot
echo "Restoring from: $SNAPSHOT_TO_RESTORE"
cp "$SNAPSHOT_TO_RESTORE" "$DB_PATH"

echo ""
echo "Database restored successfully!"
echo "Snapshot: $SNAPSHOT_TO_RESTORE"
echo "Timestamp: $(basename "$SNAPSHOT_TO_RESTORE" | sed 's/state-\(.*\)\.db/\1/' | sed 's/-/ /' | sed 's/-/:/g')"
echo ""
echo "You can now restart the orchestrator scheduler if needed."
