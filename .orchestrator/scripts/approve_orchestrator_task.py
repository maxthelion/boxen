#!/usr/bin/env python3
"""Approve an orchestrator task: push submodule, update ref on main, accept in DB.

Orchestrator tasks commit directly to the submodule's sqlite-model branch
instead of creating PRs. Approval means:
1. Push submodule commits to origin/sqlite-model
2. Update the submodule ref on main
3. Commit and push main
4. Accept the task in the DB

Usage:
    .orchestrator/venv/bin/python .orchestrator/scripts/approve_orchestrator_task.py <task-id-prefix>

Examples:
    approve_orchestrator_task.py 06b44db0
    approve_orchestrator_task.py 32edc31a
"""

import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent.parent
SUBMODULE_DIR = REPO_ROOT / "orchestrator"
SUBMODULE_BRANCH = "sqlite-model"

sys.path.insert(0, str(REPO_ROOT / "orchestrator"))

from orchestrator.config import is_db_enabled
from orchestrator.db import get_connection, get_task
from orchestrator.queue_utils import accept_completion


def run(cmd, cwd=None, check=True):
    """Run a command and return stdout."""
    result = subprocess.run(
        cmd, capture_output=True, text=True, cwd=cwd or REPO_ROOT, timeout=60
    )
    if check and result.returncode != 0:
        raise RuntimeError(f"Command failed: {' '.join(cmd)}\n{result.stderr}")
    return result


def resolve_task_id(prefix):
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, role, queue FROM tasks WHERE id LIKE ?", (f"{prefix}%",)
        ).fetchall()
        if len(rows) == 1:
            return dict(rows[0])
        elif len(rows) > 1:
            print(f"Ambiguous prefix '{prefix}' matches {len(rows)} tasks")
            for r in rows:
                print(f"  {r['id']}")
            return None
        print(f"No task found for prefix '{prefix}'")
        return None


def main():
    if len(sys.argv) < 2:
        print("Usage: approve_orchestrator_task.py <task-id-prefix>")
        sys.exit(1)

    if not is_db_enabled():
        print("Error: Database mode required")
        sys.exit(1)

    task_info = resolve_task_id(sys.argv[1])
    if not task_info:
        sys.exit(1)

    task_id = task_info["id"]
    role = task_info["role"]
    queue = task_info["queue"]

    if role != "orchestrator_impl":
        print(f"Warning: Task {task_id[:8]} has role='{role}', not 'orchestrator_impl'")
        print("Use approve_task.py for regular tasks")
        sys.exit(1)

    if queue not in ("provisional", "review_pending"):
        print(f"Task {task_id[:8]} is in queue '{queue}', expected 'provisional' or 'review_pending'")
        sys.exit(1)

    print(f"Approving orchestrator task {task_id[:8]} (queue={queue})")

    # Step 1: Check we're on main
    branch = run(["git", "branch", "--show-current"]).stdout.strip()
    if branch != "main":
        print(f"Error: Must be on main branch (currently on '{branch}')")
        sys.exit(1)

    # Step 2: Check submodule is on sqlite-model
    sub_branch = run(
        ["git", "branch", "--show-current"], cwd=SUBMODULE_DIR
    ).stdout.strip()
    if sub_branch != SUBMODULE_BRANCH:
        print(f"Error: Submodule must be on {SUBMODULE_BRANCH} (currently on '{sub_branch}')")
        sys.exit(1)

    # Step 3: Push submodule
    print(f"\n1. Pushing submodule to origin/{SUBMODULE_BRANCH}...")
    push_result = run(
        ["git", "push", "origin", SUBMODULE_BRANCH], cwd=SUBMODULE_DIR, check=False
    )
    if push_result.returncode != 0:
        if "Everything up-to-date" in push_result.stderr:
            print("   Already up to date")
        else:
            print(f"   Push failed: {push_result.stderr}")
            sys.exit(1)
    else:
        print("   Pushed")

    # Step 4: Stage submodule ref update
    print("\n2. Updating submodule ref on main...")
    run(["git", "add", "orchestrator"])

    # Check if there's actually a diff
    diff_result = run(["git", "diff", "--cached", "--quiet"], check=False)
    if diff_result.returncode == 0:
        print("   Submodule ref already up to date")
    else:
        # Commit
        task = get_task(task_id)
        title = (task.get("title") or task_id[:8]) if task else task_id[:8]
        msg = f"chore: update orchestrator submodule ({title})"
        run(["git", "commit", "-m", msg])
        print(f"   Committed: {msg}")

        # Push main
        print("\n3. Pushing main...")
        push_main = run(["git", "push", "origin", "main"], check=False)
        if push_main.returncode != 0:
            if "fetch first" in push_main.stderr or "non-fast-forward" in push_main.stderr:
                print("   Main has diverged, pulling and retrying...")
                run(["git", "stash"])
                run(["git", "pull", "--rebase", "origin", "main"])
                stash_result = run(["git", "stash", "pop"], check=False)
                run(["git", "push", "origin", "main"])
                print("   Pushed (after rebase)")
            else:
                print(f"   Push failed: {push_main.stderr}")
                sys.exit(1)
        else:
            print("   Pushed")

    # Step 5: Accept task in DB
    print(f"\n4. Accepting task {task_id[:8]} in DB...")
    task = get_task(task_id)
    file_path = task.get("file_path", "") if task else ""
    if file_path:
        accept_completion(file_path, validator="human")
    else:
        from orchestrator.db import accept_completion as db_accept
        db_accept(task_id, validator="human")

    # Verify DB state
    task_after = get_task(task_id)
    if task_after:
        db_queue = task_after.get("queue", "unknown")
        db_claimed = task_after.get("claimed_by")
        if db_queue != "done":
            print(f"   WARNING: DB shows queue='{db_queue}', expected 'done'. Fixing...")
            with get_connection() as conn:
                conn.execute("UPDATE tasks SET queue = 'done', claimed_by = NULL WHERE id = ?", (task_id,))
                conn.commit()
        elif db_claimed:
            print(f"   WARNING: DB still shows claimed_by='{db_claimed}'. Clearing...")
            with get_connection() as conn:
                conn.execute("UPDATE tasks SET claimed_by = NULL WHERE id = ?", (task_id,))
                conn.commit()
        else:
            print("   Done (verified: queue=done, unclaimed)")
    else:
        print("   Done (task not found in DB — file-only mode)")

    print(f"\nTask {task_id[:8]} approved and merged.")


if __name__ == "__main__":
    main()
