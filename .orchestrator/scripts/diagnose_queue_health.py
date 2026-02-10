#!/usr/bin/env python3
"""Diagnose queue health issues.

Detects three categories of queue health problems:
1. File-DB mismatches: Task files in different queue than database says
2. Orphan files: Task files on disk with no database record
3. Zombie claims: Tasks claimed for >2 hours with inactive agents

This is Phase 1 - diagnostics only. No fixes are applied automatically.
"""

import argparse
import json
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


def main() -> int:
    """CLI entry point."""
    parser = argparse.ArgumentParser(description="Diagnose queue health issues")
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output as JSON (default: human-readable)"
    )
    args = parser.parse_args()

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

    # Exit code: 0 if no issues, 1 if issues found
    return 1 if has_issues else 0


if __name__ == "__main__":
    sys.exit(main())
