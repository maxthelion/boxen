#!/usr/bin/env python3
"""Mark a task for rebase manually.

Usage:
    .orchestrator/venv/bin/python .orchestrator/scripts/mark_for_rebase.py <task-id>

This sets the needs_rebase flag in the DB so the rebaser agent (or scheduler)
picks it up on the next tick.
"""

import sys
from pathlib import Path

# Add the orchestrator submodule to the Python path
project_root = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(project_root / "orchestrator"))

from orchestrator.config import get_orchestrator_dir
from orchestrator.db import get_task, mark_for_rebase


def main():
    if len(sys.argv) < 2:
        print("Usage: mark_for_rebase.py <task-id>")
        print()
        print("Marks a task for rebase by setting needs_rebase=True in the DB.")
        print("The rebaser agent will pick it up on the next scheduler tick.")
        sys.exit(1)

    task_id = sys.argv[1]

    # Normalize task ID
    if not task_id.startswith("TASK-"):
        # Try with and without prefix
        pass

    task = get_task(task_id)
    if not task:
        print(f"Error: Task '{task_id}' not found in database")
        sys.exit(1)

    if task.get("needs_rebase"):
        print(f"Task {task_id} is already marked for rebase")
        sys.exit(0)

    if task.get("role") == "orchestrator_impl":
        print(f"Warning: Task {task_id} is an orchestrator_impl task.")
        print("The rebaser agent (v1) does not handle submodule rebasing.")
        print("Marking anyway — you may need to rebase manually.")

    result = mark_for_rebase(task_id, reason="manual")
    if result:
        print(f"Marked task {task_id} for rebase")
        print(f"  Queue: {result.get('queue')}")
        print(f"  Branch: {result.get('branch', 'main')}")
        print(f"  Role: {result.get('role', 'N/A')}")
        print()
        print("The rebaser agent will process this on the next scheduler tick.")
        print("Or you can run the rebaser directly:")
        print(f"  .orchestrator/venv/bin/python -m orchestrator.roles.rebaser")
    else:
        print(f"Error: Failed to mark task {task_id} for rebase")
        sys.exit(1)


if __name__ == "__main__":
    main()
