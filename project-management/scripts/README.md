# Project Management Scripts

This directory contains utility scripts for managing the Boxen project and Octopoid orchestrator.

## Database Snapshot Scripts

These scripts enable working on the Octopoid orchestrator across multiple machines by snapshotting the database to git.

### snapshot-db.sh

Creates a timestamped snapshot of the orchestrator database and commits it to git.

**Usage:**
```bash
./project-management/scripts/snapshot-db.sh
```

**What it does:**
1. Copies `.orchestrator/state.db` to `project-management/db-snapshots/state-YYYY-MM-DD-HHMMSS.db`
2. Commits the snapshot with message: "snapshot: orchestrator DB at YYYY-MM-DD HH:MM:SS"
3. Keeps only the 5 most recent snapshots (deletes older ones)
4. Does NOT automatically push (you need to run `git push` manually)

**When to use:**
- At the end of a work session before switching machines
- After making significant orchestrator state changes you want to preserve

**Example workflow on Machine A:**
```bash
# After working with the orchestrator
./project-management/scripts/snapshot-db.sh
git push
```

### restore-db.sh

Restores the orchestrator database from a snapshot.

**Usage:**
```bash
# Restore from latest snapshot
./project-management/scripts/restore-db.sh

# Restore from specific snapshot
./project-management/scripts/restore-db.sh state-2026-02-10-143022.db
```

**What it does:**
1. Finds the latest snapshot (or uses the one you specify)
2. Warns if the orchestrator scheduler is running (recommends stopping first)
3. Backs up the current database (if it exists)
4. Copies the snapshot to `.orchestrator/state.db`

**When to use:**
- Before starting work on a new machine
- After pulling the latest snapshots from git

**Example workflow on Machine B:**
```bash
# Before starting work
git pull
./project-management/scripts/restore-db.sh
# Now start the orchestrator
```

### Important Notes

**Concurrent usage warning:** These scripts enable moving orchestrator state between machines, but they do NOT support running the orchestrator on multiple machines simultaneously. The last machine to snapshot and push will overwrite the previous state.

**Workflow recommendation:**
1. Work on one machine at a time
2. Snapshot and push when done
3. Pull and restore on the next machine before starting work

**What gets snapshotted:**
- ✅ Task history and queue state (in the database)
- ❌ Queue files in `.orchestrator/shared/queue/` (gitignored)
- ❌ Agent worktrees in `.orchestrator/agents/*/worktree/` (gitignored)

**Merge conflicts:** If snapshots are created on different machines between pulls, you'll get merge conflicts in the `db-snapshots/` directory. Resolve by keeping both files (they have different timestamps) or choosing the most recent one.

## Other Scripts

### next-draft.sh

Creates a new draft file with auto-incrementing number.

### send-to-inbox.sh

Sends a proposal to the human inbox for review.
