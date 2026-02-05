#!/usr/bin/env python3
"""Diagnose tasks in the provisional queue (or by ID).

Usage:
    orchestrator/venv/bin/python .orchestrator/scripts/diagnose_provisional.py
    orchestrator/venv/bin/python .orchestrator/scripts/diagnose_provisional.py --recycle
    orchestrator/venv/bin/python .orchestrator/scripts/diagnose_provisional.py TASK-ID [TASK-ID ...]

Without --recycle: dry run showing what would happen.
With --recycle: actually recycle burned-out tasks and accept the rest.
With task IDs: diagnose specific tasks regardless of queue.
"""

import sys
from pathlib import Path

# Add orchestrator to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "orchestrator"))

from orchestrator.queue_utils import (
    list_tasks,
    accept_completion,
    is_burned_out,
    recycle_to_breakdown,
)
from orchestrator.config import is_db_enabled
from orchestrator.db import get_task


def diagnose_task(task_dict):
    """Print diagnosis for a single task."""
    task_id = task_dict.get("id", "unknown")
    commits = task_dict.get("commits_count", 0) or 0
    turns = task_dict.get("turns_used", 0) or 0
    queue = task_dict.get("queue", "?")
    project = task_dict.get("project_id") or "-"
    branch = task_dict.get("branch", "main")
    burned = is_burned_out(commits_count=commits, turns_used=turns)

    status = "BURNED OUT" if burned else "OK"
    action = "-> recycle" if burned else "-> accept"

    print(f"  {task_id}: {status}")
    print(f"    Queue:   {queue}")
    print(f"    Commits: {commits}, Turns: {turns}")
    print(f"    Branch:  {branch}")
    print(f"    Project: {project}")
    if queue == "provisional":
        print(f"    Action:  {action}")
    elif burned:
        print(f"    Note:    Would have been recycled (currently in '{queue}')")
    print()

    return burned


def main():
    do_recycle = "--recycle" in sys.argv
    task_ids = [a for a in sys.argv[1:] if not a.startswith("--")]

    if not is_db_enabled():
        print("DB mode not enabled")
        return 0

    # If specific task IDs provided, look them up directly
    if task_ids:
        print(f"Diagnosing {len(task_ids)} task(s):\n")
        for tid in task_ids:
            # Strip TASK- prefix if provided
            tid = tid.replace("TASK-", "")
            task = get_task(tid)
            if task:
                diagnose_task(task)
            else:
                print(f"  {tid}: not found in DB\n")
        return 0

    # Otherwise check provisional queue
    tasks = list_tasks("provisional")

    if not tasks:
        print("No tasks in provisional queue")
        return 0

    print(f"{'DRY RUN - ' if not do_recycle else ''}Found {len(tasks)} task(s) in provisional queue\n")

    accepted = 0
    recycled = 0

    for task in tasks:
        burned = diagnose_task(task)

        if do_recycle:
            file_path = task.get("file_path", "")
            if not file_path:
                continue
            fp = Path(file_path)
            if burned:
                try:
                    result = recycle_to_breakdown(fp)
                    if result and result.get("action") == "recycled":
                        print(f"    Result:  Recycled -> breakdown task {result['breakdown_task_id']}\n")
                        recycled += 1
                    elif result is None:
                        print(f"    Result:  Depth cap reached, accepting for human review\n")
                        accept_completion(fp, validator="manual-accept")
                        accepted += 1
                except Exception as e:
                    print(f"    Error:   {e}\n")
            else:
                try:
                    accept_completion(fp, validator="manual-accept")
                    print(f"    Result:  Accepted\n")
                    accepted += 1
                except Exception as e:
                    print(f"    Error:   {e}\n")

    if do_recycle:
        print(f"Done: {accepted} accepted, {recycled} recycled")
    else:
        print("This was a dry run. Use --recycle to execute.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
