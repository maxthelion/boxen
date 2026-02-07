#!/usr/bin/env python3
"""Approve a task and merge its PR.

Usage:
    python approve_task.py <task-id> [--method merge|squash|rebase]
"""

import argparse
import sys
from pathlib import Path

# Add orchestrator to path
project_root = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(project_root / "orchestrator"))

from orchestrator.queue_utils import approve_and_merge


def main():
    parser = argparse.ArgumentParser(description="Approve a task and merge its PR")
    parser.add_argument("task_id", help="Task ID to approve")
    parser.add_argument(
        "--method",
        choices=["merge", "squash", "rebase"],
        default="merge",
        help="Merge method (default: merge)",
    )
    args = parser.parse_args()

    result = approve_and_merge(args.task_id, merge_method=args.method)

    if result.get("error"):
        print(f"Error: {result['error']}")
        sys.exit(1)

    if result.get("merged"):
        print(f"Task {args.task_id} approved and PR merged.")
    else:
        merge_error = result.get("merge_error", "")
        print(f"Task {args.task_id} approved (moved to done).")
        if merge_error:
            print(f"PR merge failed: {merge_error}")
        elif not result.get("pr_url"):
            print("No PR associated with this task.")

    if result.get("pr_url"):
        print(f"PR: {result['pr_url']}")


if __name__ == "__main__":
    main()
