#!/usr/bin/env python3
"""Diagnose and fix queue health issues.

Detects three categories of queue health problems:
1. File-DB mismatches: Task files in different queue than database says
2. Orphan files: Task files on disk with no database record
3. Zombie claims: Tasks claimed for >2 hours with inactive agents

Phase 2: Safe auto-fixes with logging.
- File-DB sync: Update DB to match file location
- Orphan registration: Parse and register orphan files in DB
- Stale error cleanup: Remove FAILED_AT sections from retried tasks
- Zombie claims: Detect and escalate (no auto-fix)
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import TypedDict


class FileMismatch(TypedDict):
    """File-DB mismatch issue."""
    task_id: str
    db_queue: str
    file_queue: str
    file_path: str
    file_mtime: str
    age_seconds: float


class OrphanFile(TypedDict):
    """Orphan file issue."""
    task_id: str
    file_queue: str
    file_path: str
    file_mtime: str
    age_seconds: float


class ZombieClaim(TypedDict):
    """Zombie claim issue."""
    task_id: str
    claimed_by: str
    claimed_at: str
    claim_duration_seconds: float
    agent_last_active: str | None
    agent_inactive_seconds: float | None


class DiagnosticResult(TypedDict):
    """Complete diagnostic result."""
    timestamp: str
    file_db_mismatches: list[FileMismatch]
    orphan_files: list[OrphanFile]
    zombie_claims: list[ZombieClaim]


# Add orchestrator to Python path
SCRIPT_DIR = Path(__file__).parent
ORCHESTRATOR_DIR = SCRIPT_DIR.parent.parent / "orchestrator"
sys.path.insert(0, str(ORCHESTRATOR_DIR))

from orchestrator import db  # noqa: E402
from orchestrator.config import get_queue_dir, get_agents_runtime_dir  # noqa: E402
from orchestrator.queue_utils import ALL_QUEUE_DIRS  # noqa: E402
from orchestrator.state_utils import load_state  # noqa: E402
from orchestrator.queue_manager_logging import QueueManagerLogger, get_recent_fixes  # noqa: E402


# Thresholds
MIN_FILE_AGE_SECONDS = 300  # 5 minutes - avoid races with create_task()
ZOMBIE_CLAIM_HOURS = 2  # Claims older than this are suspect
AGENT_INACTIVE_HOURS = 1  # Agent must be inactive for this long


def find_all_task_files() -> dict[str, tuple[str, Path]]:
    """Scan all queue directories and find all task files.

    Returns:
        Dict mapping task_id -> (queue_name, file_path)
    """
    queue_dir = get_queue_dir()
    files: dict[str, tuple[str, Path]] = {}

    for queue_name in ALL_QUEUE_DIRS:
        queue_path = queue_dir / queue_name
        if not queue_path.exists():
            continue

        for task_file in queue_path.glob("TASK-*.md"):
            # Extract task ID from filename
            task_id = task_file.stem.replace("TASK-", "")
            files[task_id] = (queue_name, task_file)

    return files


def get_file_age_seconds(file_path: Path) -> float:
    """Get file age in seconds since last modification."""
    mtime = file_path.stat().st_mtime
    return (datetime.now().timestamp() - mtime)


def detect_file_db_mismatches(min_age_seconds: float = MIN_FILE_AGE_SECONDS) -> list[FileMismatch]:
    """Detect tasks where file location doesn't match database queue.

    Args:
        min_age_seconds: Only report files older than this (avoid races)

    Returns:
        List of file-DB mismatch issues
    """
    issues: list[FileMismatch] = []

    # Get all files on disk
    task_files = find_all_task_files()

    # Get all tasks from database
    with db.get_connection() as conn:
        cursor = conn.execute("SELECT id, queue FROM tasks")
        db_tasks = {row["id"]: row["queue"] for row in cursor}

    # Check for mismatches
    for task_id, (file_queue, file_path) in task_files.items():
        if task_id not in db_tasks:
            # This is an orphan, not a mismatch
            continue

        db_queue = db_tasks[task_id]

        # Check if file location matches DB
        if file_queue != db_queue:
            age_seconds = get_file_age_seconds(file_path)

            # Only report if file is old enough (avoid race conditions)
            if age_seconds >= min_age_seconds:
                # Try to make path relative to cwd, fall back to absolute
                try:
                    relative_path = file_path.relative_to(Path.cwd())
                except ValueError:
                    relative_path = file_path

                issues.append({
                    "task_id": task_id,
                    "db_queue": db_queue,
                    "file_queue": file_queue,
                    "file_path": str(relative_path),
                    "file_mtime": datetime.fromtimestamp(file_path.stat().st_mtime).isoformat(),
                    "age_seconds": age_seconds,
                })

    return issues


def detect_orphan_files(min_age_seconds: float = MIN_FILE_AGE_SECONDS) -> list[OrphanFile]:
    """Detect task files that have no database record.

    Args:
        min_age_seconds: Only report files older than this (avoid races)

    Returns:
        List of orphan file issues
    """
    issues: list[OrphanFile] = []

    # Get all files on disk
    task_files = find_all_task_files()

    # Get all task IDs from database
    with db.get_connection() as conn:
        cursor = conn.execute("SELECT id FROM tasks")
        db_task_ids = {row["id"] for row in cursor}

    # Check for orphans
    for task_id, (file_queue, file_path) in task_files.items():
        if task_id not in db_task_ids:
            age_seconds = get_file_age_seconds(file_path)

            # Only report if file is old enough
            if age_seconds >= min_age_seconds:
                # Try to make path relative to cwd, fall back to absolute
                try:
                    relative_path = file_path.relative_to(Path.cwd())
                except ValueError:
                    relative_path = file_path

                issues.append({
                    "task_id": task_id,
                    "file_queue": file_queue,
                    "file_path": str(relative_path),
                    "file_mtime": datetime.fromtimestamp(file_path.stat().st_mtime).isoformat(),
                    "age_seconds": age_seconds,
                })

    return issues


def detect_zombie_claims(
    claim_hours: float = ZOMBIE_CLAIM_HOURS,
    inactive_hours: float = AGENT_INACTIVE_HOURS
) -> list[ZombieClaim]:
    """Detect tasks claimed for too long by inactive agents.

    Args:
        claim_hours: Claims older than this are suspect
        inactive_hours: Agent must be inactive for this long

    Returns:
        List of zombie claim issues
    """
    issues: list[ZombieClaim] = []
    now = datetime.now()

    # Get all claimed tasks
    with db.get_connection() as conn:
        cursor = conn.execute("""
            SELECT id, claimed_by, claimed_at
            FROM tasks
            WHERE queue = 'claimed'
            AND claimed_by IS NOT NULL
            AND claimed_at IS NOT NULL
        """)
        claimed_tasks = list(cursor)

    # Check each claim
    for row in claimed_tasks:
        task_id = row["id"]
        claimed_by = row["claimed_by"]
        claimed_at_str = row["claimed_at"]

        # Parse claim timestamp
        try:
            claimed_at = datetime.fromisoformat(claimed_at_str)
        except (ValueError, TypeError):
            continue

        # Check claim age
        claim_duration = now - claimed_at
        if claim_duration.total_seconds() < claim_hours * 3600:
            continue  # Not old enough to be zombie

        # Check agent last_active
        agents_dir = get_agents_runtime_dir()
        agent_state_path = agents_dir / claimed_by / "state.json"

        agent_last_active = None
        agent_inactive_seconds = None

        if agent_state_path.exists():
            state = load_state(agent_state_path)
            if state.last_finished:
                agent_last_active = state.last_finished
                try:
                    last_active_dt = datetime.fromisoformat(state.last_finished)
                    agent_inactive_seconds = (now - last_active_dt).total_seconds()
                except (ValueError, TypeError):
                    pass

        # If agent is inactive for too long, it's a zombie
        if agent_inactive_seconds is None or agent_inactive_seconds >= inactive_hours * 3600:
            issues.append({
                "task_id": task_id,
                "claimed_by": claimed_by,
                "claimed_at": claimed_at_str,
                "claim_duration_seconds": claim_duration.total_seconds(),
                "agent_last_active": agent_last_active,
                "agent_inactive_seconds": agent_inactive_seconds,
            })

    return issues


# ============================================================================
# AUTO-FIX FUNCTIONS (Phase 2)
# ============================================================================


def parse_task_metadata(task_file: Path) -> dict | None:
    """Parse metadata from a task file.

    Args:
        task_file: Path to task file

    Returns:
        Dict with metadata or None if parsing fails
    """
    try:
        content = task_file.read_text()

        # Extract task ID from filename
        task_id = task_file.stem.replace("TASK-", "")

        # Parse metadata fields
        metadata = {"id": task_id}

        # Extract title from first line
        title_match = re.search(r"^# \[TASK-[^\]]+\] (.+)$", content, re.MULTILINE)
        if title_match:
            metadata["title"] = title_match.group(1).strip()

        # Extract other fields
        for field in ["ROLE", "PRIORITY", "BRANCH", "CREATED", "CREATED_BY", "PROJECT", "BLOCKED_BY", "CHECKS"]:
            pattern = rf"^{field}: (.+)$"
            match = re.search(pattern, content, re.MULTILINE)
            if match:
                metadata[field.lower()] = match.group(1).strip()

        # Ensure required fields exist
        if "role" not in metadata or "title" not in metadata:
            return None

        return metadata
    except Exception:
        return None


def fix_file_db_mismatch(issue: FileMismatch, logger: QueueManagerLogger) -> bool:
    """Fix a file-DB mismatch by updating the database to match the file location.

    Args:
        issue: File-DB mismatch issue
        logger: Logger for recording the fix

    Returns:
        True if fixed, False if failed
    """
    task_id = issue["task_id"]
    file_queue = issue["file_queue"]
    db_queue = issue["db_queue"]
    file_path = Path(issue["file_path"])

    # Verify file still exists
    if not file_path.exists():
        logger.log("escalate", f"Task {task_id}: File disappeared before fix (was at {file_path})")
        return False

    # Update DB to match file location
    try:
        db.update_task_queue(
            task_id,
            file_queue,
            history_event="file_db_sync",
            history_agent="queue-manager",
            history_details=f"Synced DB queue from '{db_queue}' to '{file_queue}' to match file location"
        )
        logger.log("file-db-sync", f"Task {task_id}: DB said '{db_queue}', file in '{file_queue}' -> updated DB to '{file_queue}'")
        return True
    except Exception as e:
        logger.log("escalate", f"Task {task_id}: Failed to sync DB: {e}")
        return False


def fix_orphan_file(issue: OrphanFile, logger: QueueManagerLogger) -> bool:
    """Fix an orphan file by registering it in the database.

    Args:
        issue: Orphan file issue
        logger: Logger for recording the fix

    Returns:
        True if fixed, False if failed
    """
    task_id = issue["task_id"]
    file_queue = issue["file_queue"]
    file_path = Path(issue["file_path"])

    # Verify file still exists
    if not file_path.exists():
        logger.log("escalate", f"Orphan {task_id}: File disappeared before fix (was at {file_path})")
        return False

    # Parse metadata from file
    metadata = parse_task_metadata(file_path)
    if not metadata:
        # Move to quarantine if can't parse
        quarantine_dir = get_queue_dir().parent / "quarantine"
        quarantine_dir.mkdir(exist_ok=True)
        quarantine_path = quarantine_dir / file_path.name

        try:
            os.rename(file_path, quarantine_path)
            logger.log("escalate", f"Orphan {task_id}: Could not parse file, moved to quarantine: {quarantine_path}")
        except Exception as e:
            logger.log("escalate", f"Orphan {task_id}: Could not parse and failed to quarantine: {e}")
        return False

    # Register in database
    try:
        age_days = issue["age_seconds"] / 86400
        db.create_task(
            task_id=task_id,
            file_path=str(file_path),
            role=metadata.get("role", "implement"),
            priority=metadata.get("priority", "P1"),
            branch=metadata.get("branch", "main"),
            blocked_by=metadata.get("blocked_by"),
            project_id=metadata.get("project"),
        )
        logger.log("orphan-fix", f"Registered {task_id} from {file_queue}/TASK-{task_id}.md (created {age_days:.1f}d ago)")
        return True
    except Exception as e:
        logger.log("escalate", f"Orphan {task_id}: Failed to register in DB: {e}")
        return False


def fix_stale_errors(logger: QueueManagerLogger) -> int:
    """Remove stale FAILED_AT sections from retried tasks.

    Args:
        logger: Logger for recording the fixes

    Returns:
        Number of tasks fixed
    """
    fixed_count = 0

    # Get all tasks that have been retried (attempt_count > 0)
    with db.get_connection() as conn:
        cursor = conn.execute("""
            SELECT id, queue, attempt_count
            FROM tasks
            WHERE attempt_count > 0
            AND queue IN ('incoming', 'claimed')
        """)
        retried_tasks = list(cursor)

    for row in retried_tasks:
        task_id = row["id"]
        queue = row["queue"]

        # Find the task file
        task_file = get_queue_dir() / queue / f"TASK-{task_id}.md"
        if not task_file.exists():
            continue

        # Check if file has FAILED_AT section
        try:
            content = task_file.read_text()
            if "## FAILED_AT" not in content:
                continue

            # Extract failed timestamp for logging
            failed_match = re.search(r"## FAILED_AT: (.+)", content)
            failed_at = failed_match.group(1) if failed_match else "unknown"

            # Remove FAILED_AT section (everything from ## FAILED_AT to next ## or end)
            new_content = re.sub(
                r"\n## FAILED_AT:.*?(?=\n##|\Z)",
                "",
                content,
                flags=re.DOTALL
            )

            # Write back
            task_file.write_text(new_content)

            logger.log("stale-error", f"Removed stale FAILED_AT from {task_id} (failed {failed_at}, retried)")
            fixed_count += 1

        except Exception as e:
            logger.log("escalate", f"Task {task_id}: Failed to clean stale error: {e}")

    return fixed_count


def escalate_zombie_claims(issues: list[ZombieClaim], logger: QueueManagerLogger) -> None:
    """Escalate zombie claims to human inbox (no auto-fix).

    Args:
        issues: List of zombie claim issues
        logger: Logger for recording escalations
    """
    for issue in issues:
        task_id = issue["task_id"]
        claimed_by = issue["claimed_by"]
        claim_hours = issue["claim_duration_seconds"] / 3600

        if issue["agent_inactive_seconds"]:
            inactive_hours = issue["agent_inactive_seconds"] / 3600
            logger.log(
                "escalate",
                f"Task {task_id}: zombie claim (claimed {claim_hours:.1f}h ago by {claimed_by}, "
                f"agent inactive {inactive_hours:.1f}h)"
            )
        else:
            logger.log(
                "escalate",
                f"Task {task_id}: zombie claim (claimed {claim_hours:.1f}h ago by {claimed_by}, "
                f"no agent state)"
            )


def run_diagnostics() -> DiagnosticResult:
    """Run all queue health diagnostics.

    Returns:
        Complete diagnostic result
    """
    return {
        "timestamp": datetime.now().isoformat(),
        "file_db_mismatches": detect_file_db_mismatches(),
        "orphan_files": detect_orphan_files(),
        "zombie_claims": detect_zombie_claims(),
    }


def run_auto_fixes(logger: QueueManagerLogger | None = None) -> dict:
    """Run auto-fixes for safe issues.

    Args:
        logger: Logger for recording fixes (creates one if None)

    Returns:
        Dict with counts of fixes applied
    """
    if logger is None:
        logger = QueueManagerLogger()

    # Detect all issues
    result = run_diagnostics()

    counts = {
        "file_db_syncs": 0,
        "orphans_registered": 0,
        "stale_errors_cleaned": 0,
        "zombies_escalated": len(result["zombie_claims"]),
    }

    # Fix file-DB mismatches
    for issue in result["file_db_mismatches"]:
        if fix_file_db_mismatch(issue, logger):
            counts["file_db_syncs"] += 1

    # Fix orphan files
    for issue in result["orphan_files"]:
        if fix_orphan_file(issue, logger):
            counts["orphans_registered"] += 1

    # Fix stale errors
    counts["stale_errors_cleaned"] = fix_stale_errors(logger)

    # Escalate zombie claims (no fix)
    escalate_zombie_claims(result["zombie_claims"], logger)

    return counts


def main() -> int:
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Diagnose and fix queue health issues",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Diagnose only (no fixes)
  %(prog)s

  # Apply auto-fixes
  %(prog)s --fix

  # Show recent fixes from last 24 hours
  %(prog)s --recent

  # Show recent fixes from last 48 hours
  %(prog)s --recent --hours 48
        """
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output as JSON (default: human-readable)"
    )
    parser.add_argument(
        "--fix",
        action="store_true",
        help="Apply auto-fixes for safe issues (Phase 2)"
    )
    parser.add_argument(
        "--recent",
        action="store_true",
        help="Show recent fixes from logs instead of diagnosing"
    )
    parser.add_argument(
        "--hours",
        type=int,
        default=24,
        help="How many hours to look back for --recent (default: 24)"
    )
    args = parser.parse_args()

    # Handle --recent flag
    if args.recent:
        actions = get_recent_fixes(hours=args.hours)
        if args.json:
            print(json.dumps({"recent_fixes": actions}, indent=2))
            return 0

        print(f"Recent Queue Manager Fixes (last {args.hours}h)")
        print()
        if not actions:
            print("No fixes recorded in the last {} hours.".format(args.hours))
            return 0

        # Group by fix type
        by_type: dict[str, list] = {}
        for action in actions:
            fix_type = action["fix_type"]
            if fix_type not in by_type:
                by_type[fix_type] = []
            by_type[fix_type].append(action)

        print("Summary:")
        for fix_type, items in by_type.items():
            print(f"  {fix_type}: {len(items)}")
        print()

        print("Actions:")
        for action in actions:
            print(f"  [{action['timestamp']}] [{action['fix_type']}]")
            print(f"    {action['message']}")
        print()

        return 0

    # Handle --fix flag
    if args.fix:
        logger = QueueManagerLogger()
        counts = run_auto_fixes(logger)

        # Write notes summary
        notes_file = logger.write_notes_summary()

        if args.json:
            print(json.dumps({
                "timestamp": datetime.now().isoformat(),
                "fixes_applied": counts,
                "notes_file": str(notes_file),
                "log_file": str(logger.log_file),
            }, indent=2))
            return 0

        print("Queue Manager Auto-Fix Report")
        print(f"Generated: {datetime.now().isoformat()}")
        print()
        print("Fixes Applied:")
        print(f"  File-DB syncs: {counts['file_db_syncs']}")
        print(f"  Orphans registered: {counts['orphans_registered']}")
        print(f"  Stale errors cleaned: {counts['stale_errors_cleaned']}")
        print(f"  Zombies escalated: {counts['zombies_escalated']}")
        print()
        print(f"Log: {logger.log_file}")
        print(f"Notes: {notes_file}")
        print()

        return 0

    # Default: Diagnostics only
    result = run_diagnostics()

    # Check if any issues were found
    has_issues = (
        result['file_db_mismatches'] or
        result['orphan_files'] or
        result['zombie_claims']
    )

    if args.json:
        print(json.dumps(result, indent=2))
        return 1 if has_issues else 0

    # Human-readable output
    print("Queue Health Diagnostic Report")
    print(f"Generated: {result['timestamp']}")
    print()

    print("Summary:")
    print(f"  File-DB mismatches: {len(result['file_db_mismatches'])}")
    print(f"  Orphan files: {len(result['orphan_files'])}")
    print(f"  Zombie claims: {len(result['zombie_claims'])}")
    print()

    if result['file_db_mismatches']:
        print("File-DB Mismatches:")
        for issue in result['file_db_mismatches']:
            print(f"  Task {issue['task_id']}:")
            print(f"    DB queue: {issue['db_queue']}")
            print(f"    File location: {issue['file_path']}")
            print(f"    Age: {issue['age_seconds']:.0f} seconds")
        print()

    if result['orphan_files']:
        print("Orphan Files:")
        for issue in result['orphan_files']:
            print(f"  File {issue['file_path']}:")
            print(f"    Task ID: {issue['task_id']}")
            print(f"    Queue: {issue['file_queue']}")
            print(f"    Age: {issue['age_seconds']:.0f} seconds")
        print()

    if result['zombie_claims']:
        print("Zombie Claims:")
        for issue in result['zombie_claims']:
            print(f"  Task {issue['task_id']}:")
            print(f"    Claimed by: {issue['claimed_by']}")
            print(f"    Claim duration: {issue['claim_duration_seconds'] / 3600:.1f} hours")
            if issue['agent_inactive_seconds']:
                print(f"    Agent inactive: {issue['agent_inactive_seconds'] / 3600:.1f} hours")
            else:
                print(f"    Agent state: no state file")
        print()

    if has_issues:
        print("Note: Use --fix to apply auto-fixes for safe issues")
        print()

    # Exit code: 0 if no issues, 1 if issues found
    return 1 if has_issues else 0


if __name__ == "__main__":
    sys.exit(main())
