# Database Snapshot Sync for Multi-Machine Work

**Status:** Idea
**Captured:** 2026-02-10

## Raw

> write a script that can dump the current state of octopoid database to the boxen repo, and commit it. Should be a new file with date and time rather than overwriting a single file. Create another script for loading the latest snapshot into boxen, overwriting what's in there. This is to enable working on multiple machines. Ideally there is a centralised source of truth outside the repo, but this will do for now.

## Idea

Create two scripts to enable working on Octopoid orchestrator state across multiple machines by snapshotting the database to git:

1. **Dump script** (`project-management/scripts/snapshot-db.sh`):
   - Exports current `.orchestrator/state.db` to a timestamped file
   - Location: `project-management/db-snapshots/state-YYYY-MM-DD-HHMMSS.db`
   - Commits to git with message: "snapshot: orchestrator DB at YYYY-MM-DD HH:MM:SS"
   - Can be run manually or on a schedule

2. **Load script** (`project-management/scripts/restore-db.sh`):
   - Finds the latest snapshot in `project-management/db-snapshots/`
   - Copies it to `.orchestrator/state.db` (overwrites current DB)
   - Warns if orchestrator is currently running (should stop first)
   - Optional: takes a snapshot filename as argument to restore specific version

## Context

The orchestrator DB (`.orchestrator/state.db`) is gitignored and local to each machine. When switching machines, the new machine has no task history, agent state, or queue information. This requires either:
- Recreating task state manually
- Running separate orchestrators on each machine (state divergence)
- Setting up a shared database server (complex)

A simpler interim solution: commit timestamped snapshots to git, pull on other machine, restore latest snapshot.

**Long-term:** A centralized database (PostgreSQL, S3-backed SQLite, etc.) would be better, but requires infrastructure.

## Open Questions

1. **Snapshot frequency?** Manual only, or automated (e.g., daily cron)?
2. **Snapshot retention?** Keep all snapshots, or prune old ones (>30 days)?
3. **Merge conflicts?** If both machines take snapshots and push, which wins?
4. **Queue file sync?** The DB references files in `.orchestrator/shared/queue/` — do those also need snapshotting?
5. **Agent worktrees?** Agent worktrees (`.orchestrator/agents/*/worktree/`) are large and machine-specific — exclude from snapshots?
6. **Safety checks?** Should restore script refuse to overwrite DB if scheduler is running?

## Possible Next Steps

### Phase 1: Basic Snapshot/Restore

Create two scripts:

```bash
# project-management/scripts/snapshot-db.sh
#!/bin/bash
set -euo pipefail

TIMESTAMP=$(date +%Y-%m-%d-%H%M%S)
SNAPSHOT_DIR="project-management/db-snapshots"
SNAPSHOT_FILE="$SNAPSHOT_DIR/state-$TIMESTAMP.db"

mkdir -p "$SNAPSHOT_DIR"
cp .orchestrator/state.db "$SNAPSHOT_FILE"

git add "$SNAPSHOT_FILE"
git commit -m "snapshot: orchestrator DB at $(date '+%Y-%m-%d %H:%M:%S')"

echo "Snapshot created: $SNAPSHOT_FILE"
echo "Push to origin: git push"
```

```bash
# project-management/scripts/restore-db.sh
#!/bin/bash
set -euo pipefail

SNAPSHOT_DIR="project-management/db-snapshots"
LATEST=$(ls -t "$SNAPSHOT_DIR"/state-*.db 2>/dev/null | head -1)

if [ -z "$LATEST" ]; then
    echo "No snapshots found in $SNAPSHOT_DIR"
    exit 1
fi

# Check if scheduler is running
if pgrep -f "orchestrator.scheduler" > /dev/null; then
    echo "ERROR: Orchestrator scheduler is running. Stop it first (kill-all-agents)."
    exit 1
fi

echo "Restoring from: $LATEST"
cp "$LATEST" .orchestrator/state.db

echo "Database restored. Restart scheduler if needed."
```

### Phase 2: Queue File Sync

The DB references task files in `.orchestrator/shared/queue/` — those need to be in git too. But they're currently gitignored.

Options:
- Keep queue files gitignored, accept that restoring DB on another machine will have broken references
- Commit queue files to a `queue-snapshots/` directory alongside DB snapshot
- Use a tarball: `snapshot-TIMESTAMP.tar.gz` contains both DB and queue files

### Phase 3: Automated Snapshots

Add a launchd job (macOS) or systemd timer (Linux) that runs snapshot script daily:

```xml
<!-- ~/Library/LaunchAgents/com.boxen.orchestrator-snapshot.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.boxen.orchestrator-snapshot</string>
    <key>ProgramArguments</key>
    <array>
        <string>/path/to/project-management/scripts/snapshot-db.sh</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>23</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
</dict>
</plist>
```

### Phase 4: Snapshot Pruning

Add logic to snapshot script to delete snapshots older than N days:

```bash
# In snapshot-db.sh, after creating new snapshot:
find "$SNAPSHOT_DIR" -name "state-*.db" -mtime +30 -delete
git add -u "$SNAPSHOT_DIR"
git commit --amend --no-edit  # Add deletions to same commit
```

## Related Work

- `.orchestrator/state.db` is the SQLite database (gitignored)
- `.orchestrator/shared/queue/` contains task files (gitignored)
- Agent worktrees are at `.orchestrator/agents/*/worktree/` (also gitignored)

## Example Usage

**On Machine A:**
```bash
# After a work session, snapshot the DB
project-management/scripts/snapshot-db.sh
git push
```

**On Machine B:**
```bash
# Before starting work, pull latest snapshot
git pull
project-management/scripts/restore-db.sh
# Start orchestrator
```

## Success Criteria

If this works:
- Can switch machines without losing orchestrator state
- Task queue, agent history, and completion status persist across machines
- Snapshots are timestamped and reversible (can restore older version)
- No manual SQL exports or file copying needed

## Risks

1. **State divergence:** If both machines run orchestrator simultaneously, snapshots will conflict
2. **Large repo growth:** DB snapshots could grow repo size over time (mitigation: prune old snapshots)
3. **Broken references:** If queue files aren't also snapshotted, DB will reference missing files
4. **Merge conflicts:** If two machines push snapshots at overlapping times, manual resolution needed

**Recommendation:** Start with Phase 1 (basic snapshot/restore) and see if queue file sync is actually needed in practice.
