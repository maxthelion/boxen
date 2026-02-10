#!/bin/bash
set -euo pipefail

# Snapshot the orchestrator database to git
# Usage: ./snapshot-db.sh

TIMESTAMP=$(date +%Y-%m-%d-%H%M%S)
SNAPSHOT_DIR="project-management/db-snapshots"
SNAPSHOT_FILE="$SNAPSHOT_DIR/state-$TIMESTAMP.db"
DB_PATH=".orchestrator/state.db"

# Check if DB exists
if [ ! -f "$DB_PATH" ]; then
    echo "ERROR: Database not found at $DB_PATH"
    exit 1
fi

# Create snapshot directory if it doesn't exist
mkdir -p "$SNAPSHOT_DIR"

# Copy database to snapshot
echo "Creating snapshot: $SNAPSHOT_FILE"
cp "$DB_PATH" "$SNAPSHOT_FILE"

# Add snapshot to git
git add "$SNAPSHOT_FILE"

# Commit snapshot
COMMIT_TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
git commit -m "snapshot: orchestrator DB at $COMMIT_TIMESTAMP"

echo "Snapshot created and committed: $SNAPSHOT_FILE"
echo ""
echo "Note: Snapshot is committed locally but NOT pushed."
echo "To share with other machines, run: git push"
echo ""

# Keep only the 5 most recent snapshots
echo "Cleaning up old snapshots (keeping 5 most recent)..."
SNAPSHOTS=($(ls -t "$SNAPSHOT_DIR"/state-*.db 2>/dev/null || true))
NUM_SNAPSHOTS=${#SNAPSHOTS[@]}

if [ $NUM_SNAPSHOTS -gt 5 ]; then
    # Delete snapshots beyond the 5 most recent
    for (( i=5; i<$NUM_SNAPSHOTS; i++ )); do
        SNAPSHOT_TO_DELETE="${SNAPSHOTS[$i]}"
        echo "Deleting old snapshot: $SNAPSHOT_TO_DELETE"
        git rm "$SNAPSHOT_TO_DELETE"
    done

    # Amend the commit to include deletions
    git commit --amend -m "snapshot: orchestrator DB at $COMMIT_TIMESTAMP"
    echo "Old snapshots deleted and commit updated."
fi

echo ""
echo "Done. Current snapshots:"
ls -lh "$SNAPSHOT_DIR"/state-*.db 2>/dev/null | tail -5 || echo "(no snapshots found)"
