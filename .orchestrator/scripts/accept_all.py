#!/usr/bin/env python3
"""Accept all tasks in the provisional queue.

Usage:
    source .orchestrator/venv/bin/activate
    python .orchestrator/scripts/accept_all.py

Tasks with commits are accepted (provisional -> done).
Burned-out tasks (0 commits, many turns) are recycled to re-breakdown.
"""

import sys
from pathlib import Path

# Add orchestrator to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "orchestrator"))

from orchestrator.orchestrator.queue_utils import (
    list_tasks,
    accept_completion,
    is_burned_out,
    recycle_to_breakdown,
)
from orchestrator.orchestrator.config import is_db_enabled


def main():
    if not is_db_enabled():
        print("DB mode not enabled - no provisional queue exists")
        return 0

    tasks = list_tasks("provisional")

    if not tasks:
        print("No tasks in provisional queue")
        return 0

    print(f"Found {len(tasks)} task(s) in provisional queue\n")

    accepted = 0
    recycled = 0
    errors = 0

    for task in tasks:
        task_id = task.get("id", "unknown")
        file_path = task.get("file_path")
        commits = task.get("commits_count", 0) or 0
        turns = task.get("turns_used", 0) or 0

        if not file_path:
            print(f"  Skipping {task_id} - no file path")
            continue

        # Check if task is burned out
        if is_burned_out(commits_count=commits, turns_used=turns):
            print(f"  Recycling: {task_id} (0 commits, {turns} turns - burned out)")
            try:
                result = recycle_to_breakdown(file_path)
                if result and result.get("action") == "recycled":
                    print(f"    -> Created breakdown task: {result['breakdown_task_id']}")
                    recycled += 1
                elif result is None:
                    print(f"    -> Depth cap reached, accepting as-is (needs human review)")
                    accept_completion(file_path, validator="manual-accept")
                    accepted += 1
            except Exception as e:
                print(f"    Error recycling: {e}")
                errors += 1
        else:
            print(f"  Accepting: {task_id} ({commits} commits)")
            try:
                accept_completion(file_path, validator="manual-accept")
                accepted += 1
            except Exception as e:
                print(f"    Error: {e}")
                errors += 1

    print(f"\nDone: {accepted} accepted, {recycled} recycled, {errors} errors")
    return 0


if __name__ == "__main__":
    sys.exit(main())
