#!/usr/bin/env python3
"""Daily activity summary — "What did we do today?"

Usage:
    .orchestrator/venv/bin/python .orchestrator/scripts/today.py

Aggregates activity from git, the task DB, and project-management files
into a human-readable markdown summary.
"""

import subprocess
import sys
from datetime import datetime
from pathlib import Path

# Add orchestrator package to path (same pattern as status.py)
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "orchestrator"))

from orchestrator.config import (
    get_orchestrator_dir,
    get_queue_dir,
    is_db_enabled,
)
from orchestrator.queue_utils import parse_task_file

ROOT = Path(__file__).parent.parent.parent
PM_DIR = ROOT / "project-management"
ORCH_SUBMODULE = ROOT / "orchestrator"


# ── Helpers ──────────────────────────────────────────────────────────────


def run(cmd: list[str], cwd: str | None = None) -> str:
    """Run a command and return stdout, or empty string on failure."""
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, cwd=cwd, timeout=10,
        )
        return result.stdout.strip()
    except (subprocess.SubprocessError, FileNotFoundError):
        return ""


def header(title: str) -> None:
    print(f"\n{'=' * 60}")
    print(f"  {title}")
    print(f"{'=' * 60}")


def subheader(title: str) -> None:
    print(f"\n  -- {title} --")


def resolve_task_title(task_id: str) -> str:
    """Get a readable title for a task from the task file."""
    for subdir in [
        "incoming", "claimed", "provisional", "done", "failed",
        "escalated", "breakdown", "recycled",
    ]:
        task_file = get_queue_dir() / subdir / f"TASK-{task_id}.md"
        if task_file.exists():
            info = parse_task_file(task_file)
            if info and info.get("title") and info["title"] != task_id:
                return info["title"][:55]
            break
    return task_id[:8]


# ── Git Activity ─────────────────────────────────────────────────────────


def print_git_activity() -> None:
    header("GIT ACTIVITY")

    # Main repo commits today
    subheader("Main repo")
    main_log = run(
        ["git", "log", "--since=midnight", "--oneline", "--no-merges"],
        cwd=str(ROOT),
    )
    if main_log:
        for line in main_log.split("\n"):
            print(f"    {line}")
    else:
        print("    No commits today")

    # Orchestrator submodule commits today
    subheader("Orchestrator submodule")
    if ORCH_SUBMODULE.exists() and (ORCH_SUBMODULE / ".git").exists():
        orch_log = run(
            ["git", "log", "--since=midnight", "--oneline", "--no-merges"],
            cwd=str(ORCH_SUBMODULE),
        )
        if orch_log:
            for line in orch_log.split("\n"):
                print(f"    {line}")
        else:
            print("    No commits today")
    else:
        print("    Submodule not available")


# ── Task Summary ─────────────────────────────────────────────────────────


def print_task_summary() -> None:
    header("TASKS")

    if not is_db_enabled():
        print("  DB not enabled — skipping task summary")
        return

    try:
        from orchestrator.db import get_connection, get_database_path

        if not get_database_path().exists():
            print("  DB file not found — skipping task summary")
            return
    except ImportError:
        print("  orchestrator.db not available")
        return

    today_col = lambda col: f"date({col}, 'localtime') = date('now', 'localtime')"

    try:
        with get_connection() as conn:
            # Tasks completed today (moved to done queue today)
            subheader("Completed today")
            rows = conn.execute(f"""
                SELECT DISTINCT t.id, t.role, t.priority
                FROM task_history h
                JOIN tasks t ON t.id = h.task_id
                WHERE h.event IN ('accepted', 'completed', 'auto_accepted')
                  AND {today_col('h.timestamp')}
                ORDER BY h.timestamp DESC
            """).fetchall()

            if rows:
                for row in rows:
                    tid = row["id"][:8]
                    role = row["role"] or "implement"
                    priority = row["priority"] or "?"
                    title = resolve_task_title(row["id"])
                    print(f"    {priority} {tid}  {title}  ({role})")
            else:
                print("    No tasks completed today")

            # Tasks created today
            subheader("Created today")
            rows = conn.execute(f"""
                SELECT id, role, priority
                FROM tasks
                WHERE {today_col('created_at')}
                ORDER BY created_at DESC
            """).fetchall()

            if rows:
                for row in rows:
                    tid = row["id"][:8]
                    role = row["role"] or "implement"
                    priority = row["priority"] or "?"
                    title = resolve_task_title(row["id"])
                    print(f"    {priority} {tid}  {title}  ({role})")
            else:
                print("    No tasks created today")

            # Tasks currently in progress
            subheader("In progress")
            rows = conn.execute("""
                SELECT id, role, priority, claimed_by
                FROM tasks
                WHERE queue = 'claimed'
                ORDER BY priority ASC
            """).fetchall()

            if rows:
                for row in rows:
                    tid = row["id"][:8]
                    role = row["role"] or "implement"
                    priority = row["priority"] or "?"
                    agent = row["claimed_by"] or "?"
                    title = resolve_task_title(row["id"])
                    print(f"    {priority} {tid}  {title}  ({role}, {agent})")
            else:
                print("    No tasks in progress")

    except Exception as e:
        print(f"  Error querying DB: {e}")


# ── Agent Activity ───────────────────────────────────────────────────────


def print_agent_activity() -> None:
    header("AGENT ACTIVITY")

    if not is_db_enabled():
        print("  DB not enabled — skipping agent activity")
        return

    try:
        from orchestrator.db import get_connection, get_database_path

        if not get_database_path().exists():
            print("  DB file not found")
            return
    except ImportError:
        print("  orchestrator.db not available")
        return

    today_col = lambda col: f"date({col}, 'localtime') = date('now', 'localtime')"

    try:
        with get_connection() as conn:
            # Events per agent today
            subheader("DB events per agent")
            rows = conn.execute(f"""
                SELECT h.agent,
                       COUNT(*) as event_count,
                       GROUP_CONCAT(DISTINCT h.event) as events
                FROM task_history h
                WHERE h.agent IS NOT NULL
                  AND h.agent != ''
                  AND {today_col('h.timestamp')}
                GROUP BY h.agent
                ORDER BY event_count DESC
            """).fetchall()

            if rows:
                for row in rows:
                    agent = row["agent"]
                    count = row["event_count"]
                    events = row["events"]
                    print(f"    {agent:<20} {count} event(s): {events}")
            else:
                print("    No agent activity today")

    except Exception as e:
        print(f"  Error querying DB: {e}")

    # Per-agent commit counts from worktrees
    subheader("Commits per agent worktree")
    agents_dir = get_orchestrator_dir() / "agents"
    if agents_dir.exists():
        found_any = False
        for agent_dir in sorted(agents_dir.iterdir()):
            if not agent_dir.is_dir():
                continue
            worktree = agent_dir / "worktree"
            if not (worktree / ".git").exists():
                continue
            commits_today = run(
                ["git", "log", "--since=midnight", "--oneline", "--no-merges"],
                cwd=str(worktree),
            )
            if commits_today:
                count = len(commits_today.split("\n"))
                print(f"    {agent_dir.name:<20} {count} commit(s)")
                found_any = True
        if not found_any:
            print("    No agent commits today")
    else:
        print("    No agents directory")


# ── Project Management Changes ───────────────────────────────────────────


def print_pm_changes() -> None:
    header("PROJECT MANAGEMENT CHANGES")

    if not PM_DIR.exists():
        print("  project-management/ directory not found")
        return

    # Files committed today that touch project-management/
    committed_today = run(
        ["git", "log", "--since=midnight", "--name-only", "--pretty=format:",
         "--", "project-management/"],
        cwd=str(ROOT),
    )

    # Uncommitted changes in project-management/
    status_output = run(
        ["git", "status", "--short", "project-management/"],
        cwd=str(ROOT),
    )

    has_output = False

    if committed_today:
        files = sorted(set(f for f in committed_today.split("\n") if f.strip()))
        if files:
            subheader("Committed today")
            for f in files:
                print(f"    {f}")
            has_output = True

    if status_output:
        subheader("Uncommitted changes")
        for line in status_output.split("\n"):
            if line.strip():
                print(f"    {line}")
        has_output = True

    if not has_output:
        print("  No changes today")


# ── Main ─────────────────────────────────────────────────────────────────


def main() -> int:
    today_str = datetime.now().strftime("%Y-%m-%d")
    print(f"\n# What Did We Do Today?  ({today_str})")
    print("-" * 60)

    print_git_activity()
    print_task_summary()
    print_agent_activity()
    print_pm_changes()

    print(f"\n{'=' * 60}")
    print("Done.\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
