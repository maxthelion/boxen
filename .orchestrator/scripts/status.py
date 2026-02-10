#!/usr/bin/env python3
"""Comprehensive orchestrator status report.

Usage:
    source .orchestrator/venv/bin/activate
    python .orchestrator/scripts/status.py [--verbose]

One-shot overview of: queue state, agent status, worktree state,
agent notes, open PRs, scheduler health, breakdowns, and projects.
"""

import json
import re
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

# Add orchestrator package to path (same pattern as orchestrator/scripts/*)
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "orchestrator"))

from orchestrator.config import (
    get_agents,
    get_agents_runtime_dir,
    get_notes_dir,
    get_orchestrator_dir,
    get_queue_dir,
    is_db_enabled,
    is_system_paused,
)
from orchestrator.git_utils import get_submodule_status
from orchestrator.queue_utils import (
    count_open_prs,
    get_queue_status,
    list_pending_breakdowns,
    list_tasks,
    parse_task_file,
)

VERBOSE = "--verbose" in sys.argv or "-v" in sys.argv

# --task <id> flag: show event log for a specific task
TASK_ID = None
for i, arg in enumerate(sys.argv):
    if arg == "--task" and i + 1 < len(sys.argv):
        TASK_ID = sys.argv[i + 1]
        break

# ── Helpers ──────────────────────────────────────────────────────────────


def ago(iso_str: str | None) -> str:
    """Convert ISO timestamp to human-readable 'X ago' string."""
    if not iso_str:
        return "never"
    try:
        # Handle timezone-aware timestamps (strip trailing Z or +00:00)
        cleaned = iso_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(cleaned)
        # Compare naive to naive
        if dt.tzinfo is not None:
            dt = dt.replace(tzinfo=None)
        delta = datetime.now() - dt
        if delta < timedelta(minutes=1):
            return f"{int(delta.total_seconds())}s ago"
        if delta < timedelta(hours=1):
            return f"{int(delta.total_seconds() / 60)}m ago"
        if delta < timedelta(days=1):
            h = delta.seconds // 3600
            return f"{h}h ago"
        return f"{delta.days}d ago"
    except (ValueError, TypeError):
        return str(iso_str)


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


# ── Sections ─────────────────────────────────────────────────────────────


def print_scheduler_health() -> None:
    header("SCHEDULER")

    launchctl_out = run(["launchctl", "list", "com.boxen.orchestrator"])
    if "LastExitStatus" in launchctl_out:
        exit_match = re.search(r"LastExitStatus.*?=\s*(\d+)", launchctl_out)
        exit_code = exit_match.group(1) if exit_match else "?"
        print(f"  launchd:        loaded (last exit: {exit_code})")
    else:
        print("  launchd:        NOT LOADED")

    if is_system_paused():
        print("  system pause:   PAUSED (all agents stopped)")
    else:
        print("  system pause:   not paused")

    # Last scheduler tick from log
    log_path = get_orchestrator_dir() / "logs" / "launchd-stdout.log"
    if log_path.exists():
        try:
            # Read last 4KB to avoid reading huge logs
            with open(log_path, "rb") as f:
                f.seek(0, 2)
                size = f.tell()
                f.seek(max(0, size - 4096))
                tail = f.read().decode("utf-8", errors="replace")
            for line in reversed(tail.strip().split("\n")):
                ts_match = re.search(
                    r"\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})", line
                )
                if ts_match:
                    print(f"  last tick:      {ago(ts_match.group(1))}")
                    break
        except OSError:
            pass


def print_queue_status() -> None:
    header("QUEUE")

    status = get_queue_status()

    # Summary counts
    queues_display = [
        ("incoming", status.get("incoming", {}).get("count", 0)),
        ("claimed", status.get("claimed", {}).get("count", 0)),
        ("breakdown", status.get("breakdown", {}).get("count", 0)),
        ("provisional", status.get("provisional", {}).get("count", 0)),
        ("done", status.get("done", {}).get("count", 0)),
        ("failed", status.get("failed", {}).get("count", 0)),
        ("escalated", status.get("escalated", {}).get("count", 0)),
    ]
    parts = [f"{name}: {count}" for name, count in queues_display if count > 0]
    print(f"  {' | '.join(parts) if parts else 'all queues empty'}")

    limits = status.get("limits", {})
    open_prs = status.get("open_prs", 0)
    print(f"  open PRs: {open_prs} (limit: {limits.get('max_open_prs', '?')})")

    # Task details per active queue
    for queue_name in [
        "incoming", "claimed", "breakdown", "provisional", "escalated", "failed",
    ]:
        queue_data = status.get(queue_name, {})
        tasks = queue_data.get("tasks", [])
        if not tasks:
            continue

        subheader(f"{queue_name} ({len(tasks)})")
        for task in tasks:
            tid = (task.get("id") or "?")[:8]
            title = (task.get("title") or task.get("id") or "untitled")[:50]
            priority = task.get("priority") or "?"
            role = task.get("role") or "implement"
            branch = task.get("branch") or ""
            blocked_by = task.get("blocked_by") or ""

            line = f"    {priority} {tid}  {title}"
            extras = []
            if role != "implement":
                extras.append(role)
            if branch and branch != "main":
                extras.append(f"branch:{branch}")
            if blocked_by:
                extras.append(f"blocked:{blocked_by}")
            if extras:
                line += f"  ({', '.join(extras)})"
            print(line)

    # Needs continuation
    needs_cont_dir = get_queue_dir() / "needs_continuation"
    if needs_cont_dir.exists():
        cont_tasks = list(needs_cont_dir.glob("TASK-*.md"))
        if cont_tasks:
            subheader(f"needs_continuation ({len(cont_tasks)})")
            for tf in cont_tasks:
                task_info = parse_task_file(tf)
                if task_info:
                    print(
                        f"    {task_info.get('id', '?')[:8]}"
                        f"  {task_info.get('title', '?')[:50]}"
                    )

    # Recycled count
    recycled_dir = get_queue_dir() / "recycled"
    if recycled_dir.exists():
        recycled = list(recycled_dir.glob("TASK-*.md"))
        if recycled:
            print(f"\n  recycled: {len(recycled)} task(s)")

    # Orphan detection: files on disk but not in DB
    if is_db_enabled():
        try:
            from orchestrator.db import get_task
            orphans = []
            for subdir_name in ["incoming", "claimed", "breakdown"]:
                subdir = get_queue_dir() / subdir_name
                if not subdir.exists():
                    continue
                for task_file in subdir.glob("TASK-*.md"):
                    file_id = task_file.stem.replace("TASK-", "")
                    if get_task(file_id) is None:
                        orphans.append((subdir_name, file_id, task_file.name))
            if orphans:
                subheader(f"ORPHAN FILES ({len(orphans)}) - on disk but NOT in DB!")
                for q, tid, fname in orphans:
                    print(f"    {q}/{fname}  (invisible to scheduler)")
        except ImportError:
            pass

    # Stale blocker detection: tasks blocked by tasks that are already done
    if is_db_enabled():
        try:
            from orchestrator.db import get_task, list_tasks as db_list_tasks
            stale = []
            blocked = db_list_tasks(include_blocked=True)
            for task in blocked:
                blocked_by = task.get("blocked_by")
                if not blocked_by:
                    continue
                blockers = [b.strip() for b in blocked_by.split(",") if b.strip()]
                stale_ids = []
                for bid in blockers:
                    bt = get_task(bid)
                    if bt and bt.get("queue") == "done":
                        stale_ids.append(bid)
                if stale_ids:
                    stale.append((task["id"], task.get("queue", "?"), stale_ids))
            if stale:
                subheader(f"STALE BLOCKERS ({len(stale)}) - blocked by done tasks!")
                for tid, queue, stale_ids in stale:
                    print(f"    {tid[:8]} ({queue}) blocked by done: {', '.join(s[:8] for s in stale_ids)}")
        except ImportError:
            pass


def print_agent_status() -> None:
    header("AGENTS")

    agents = get_agents()
    runtime_dir = get_agents_runtime_dir()

    fmt = "  {:<20} {:<14} {:<12} {:<12} {}"
    print(fmt.format("NAME", "ROLE", "STATUS", "LAST ACTIVE", "TASK"))
    print(fmt.format("-" * 20, "-" * 14, "-" * 12, "-" * 12, "-" * 8))

    for agent in agents:
        name = agent["name"]
        role = agent.get("role", "?")
        paused = agent.get("paused", False)

        state_path = runtime_dir / name / "state.json"
        state = {}
        if state_path.exists():
            try:
                state = json.loads(state_path.read_text())
            except (json.JSONDecodeError, OSError):
                pass

        if paused:
            status_str = "paused"
        elif state.get("running"):
            status_str = "RUNNING"
        else:
            blocked = state.get("extra", {}).get("blocked_reason", "")
            status_str = f"idle({blocked[:8]})" if blocked else "idle"

        # Prefer heartbeat file (written by Stop hook) over state.json timestamps
        heartbeat_path = runtime_dir / name / "heartbeat"
        heartbeat_ts = None
        if heartbeat_path.exists():
            try:
                heartbeat_ts = heartbeat_path.read_text().strip()
            except OSError:
                pass
        last_active = ago(
            heartbeat_ts
            or state.get("last_finished")
            or state.get("last_started")
        )
        current_task = (state.get("current_task") or "-")[:8]

        print(fmt.format(name, role, status_str, last_active, current_task))

    paused_count = sum(1 for a in agents if a.get("paused"))
    active_count = len(agents) - paused_count
    print(f"\n  {active_count} active, {paused_count} paused of {len(agents)} total")


def _get_agent_roles() -> dict[str, str]:
    """Build a mapping of agent name → role from config."""
    agents = get_agents()
    return {a["name"]: a.get("role", "implementer") for a in agents}


def print_worktree_status() -> None:
    header("WORKTREES")

    runtime_dir = get_agents_runtime_dir()
    if not runtime_dir.exists():
        print("  No agents directory")
        return

    agent_roles = _get_agent_roles()

    found = False
    for agent_dir in sorted(runtime_dir.iterdir()):
        if not agent_dir.is_dir():
            continue

        worktree = agent_dir / "worktree"
        if not (worktree / ".git").exists():
            continue

        found = True
        name = agent_dir.name
        wt = str(worktree)
        is_orch_impl = agent_roles.get(name) == "orchestrator_impl"

        branch = run(["git", "branch", "--show-current"], cwd=wt) or run(
            ["git", "rev-parse", "--short", "HEAD"], cwd=wt
        )
        commits_ahead = run(["git", "rev-list", "--count", "main..HEAD"], cwd=wt)
        diff_shortstat = run(["git", "diff", "--shortstat"], cwd=wt)
        staged_shortstat = run(["git", "diff", "--cached", "--shortstat"], cwd=wt)
        untracked_raw = run(
            ["git", "ls-files", "--others", "--exclude-standard"], cwd=wt
        )
        untracked_count = len(untracked_raw.split("\n")) if untracked_raw else 0

        role_tag = f" [{agent_roles.get(name, '?')}]" if is_orch_impl else ""
        subheader(f"{name}{role_tag}")
        print(f"    branch:     {branch}")
        print(f"    ahead:      {commits_ahead or '0'} commit(s) ahead of main")

        if diff_shortstat:
            print(f"    unstaged:   {diff_shortstat}")
        if staged_shortstat:
            print(f"    staged:     {staged_shortstat}")
        if untracked_count:
            print(f"    untracked:  {untracked_count} file(s)")

        # Show recent commit log
        try:
            n = min(int(commits_ahead or "0"), 5)
        except ValueError:
            n = 0
        if n > 0:
            log = run(["git", "log", "--oneline", f"-{n}"], cwd=wt)
            if log:
                print("    recent:")
                for line in log.split("\n"):
                    print(f"      {line}")

        # For orchestrator_impl agents, show submodule state
        if is_orch_impl:
            sub_status = get_submodule_status(worktree)
            if sub_status["exists"]:
                print("    --- orchestrator/ submodule ---")
                print(f"    sub branch: {sub_status['branch']}")
                sub_ahead = sub_status["commits_ahead"]
                print(f"    sub ahead:  {sub_ahead} commit(s) ahead of origin")
                if sub_status["diff_shortstat"]:
                    print(f"    sub unstg:  {sub_status['diff_shortstat']}")
                if sub_status["staged_shortstat"]:
                    print(f"    sub staged: {sub_status['staged_shortstat']}")
                if sub_status["untracked_count"]:
                    print(f"    sub untrk:  {sub_status['untracked_count']} file(s)")
                for commit_line in sub_status.get("recent_commits", []):
                    print(f"      {commit_line}")
                for warning in sub_status.get("warnings", []):
                    print(f"    !! {warning}")
            else:
                print("    !! orchestrator/ submodule NOT FOUND in worktree")

        # Show recent entries from commits.log (written by PostToolUse hook)
        commits_log = agent_dir / "commits.log"
        if commits_log.exists():
            try:
                lines = commits_log.read_text().strip().split("\n")
                recent = lines[-5:]  # last 5 entries
                print(f"    hook log:   ({len(lines)} total)")
                for entry in recent:
                    parts = entry.split(" | ", 2)
                    if len(parts) >= 2:
                        ts = ago(parts[0].strip())
                        msg = parts[1].strip()[:60]
                        print(f"      {ts}: {msg}")
                    else:
                        print(f"      {entry[:70]}")
            except OSError:
                pass

    if not found:
        print("  No worktrees found")


def print_agent_notes() -> None:
    header("AGENT NOTES")

    notes_dir = get_notes_dir()
    notes = sorted(notes_dir.glob("TASK-*.md")) if notes_dir.exists() else []

    if not notes:
        print("  No agent notes")
        return

    print(f"  {len(notes)} note(s):\n")
    for note_path in notes:
        task_id = note_path.stem.replace("TASK-", "")
        content = note_path.read_text().strip()
        lines = content.split("\n")
        preview = lines[0][:80] if lines else "(empty)"
        print(f"  {task_id}: {preview}")
        if len(lines) > 1:
            print(f"    ({len(lines)} lines total)")
        if VERBOSE:
            for line in lines[1:6]:
                print(f"    {line[:80]}")
            if len(lines) > 6:
                print(f"    ... ({len(lines) - 6} more lines)")


def print_breakdowns() -> None:
    header("BREAKDOWNS")

    try:
        breakdowns = list_pending_breakdowns()
    except Exception:
        breakdowns = []

    breakdowns_dir = get_orchestrator_dir() / "shared" / "breakdowns"
    if not breakdowns_dir.exists():
        print("  No breakdowns directory")
        return

    files = sorted(breakdowns_dir.glob("*.md"))
    if not files:
        print("  No breakdown files")
        return

    for f in files:
        content = f.read_text()
        status_match = re.search(r"\*\*Status:\*\*\s*(\S+)", content)
        status = status_match.group(1) if status_match else "unknown"
        title_match = re.search(r"^# Breakdown:\s*(.+)$", content, re.MULTILINE)
        title = title_match.group(1).strip() if title_match else f.stem
        task_count = len(re.findall(r"^## Task \d+:", content, re.MULTILINE))

        marker = {
            "pending_review": "?",
            "approved": "+",
            "rejected": "x",
        }.get(status, " ")
        print(f"  [{marker}] {f.name}")
        print(f"      {title} ({task_count} tasks, {status})")


def print_projects() -> None:
    header("PROJECTS")

    if not is_db_enabled():
        print("  DB not enabled")
        return

    try:
        from orchestrator.queue_utils import list_projects, get_project_status
    except ImportError:
        print("  list_projects not available")
        return

    projects = list_projects()
    if not projects:
        print("  No projects")
        return

    for p in projects:
        pid = p["id"]
        title = p["title"][:50]
        status = p.get("status", "?")
        file_path = p.get("file_path", "(no file)")
        created = p.get("created_at")
        age = ago(created) if created else "?"
        
        ps = get_project_status(pid)
        if ps:
            by_queue = ps.get("tasks_by_queue", {})
            done = by_queue.get("done", 0)
            total = ps.get("task_count", 0)
            tasks_str = f"{done}/{total} done"
        else:
            tasks_str = "0 tasks"
        
        print(f"  {pid}")
        print(f"    Title: {title}")
        print(f"    Status: {status} | Tasks: {tasks_str} | Age: {age}")
        print(f"    File: {file_path}")


def print_open_prs() -> None:
    header("OPEN PRs")

    pr_json = run([
        "gh", "pr", "list", "--state", "open", "--json",
        "number,title,headRefName,author,updatedAt", "--limit", "20",
    ])
    if not pr_json:
        print("  No open PRs (or gh CLI unavailable)")
        return

    try:
        prs = json.loads(pr_json)
    except json.JSONDecodeError:
        print("  Failed to parse PR list")
        return

    if not prs:
        print("  No open PRs")
        return

    print(f"  {len(prs)} open PR(s):\n")
    for pr in prs:
        number = pr.get("number", "?")
        title = pr.get("title", "untitled")[:50]
        branch = pr.get("headRefName", "?")
        author = pr.get("author", {}).get("login", "?")
        updated = ago(pr.get("updatedAt"))
        print(f"  #{number:<5} {title}")
        print(f"         {branch} (by {author}, {updated})")


def print_messages() -> None:
    header("MESSAGES")

    msg_dir = get_orchestrator_dir() / "messages"
    if not msg_dir.exists():
        print("  No messages directory")
        return

    messages = sorted(msg_dir.glob("*.md"))
    if not messages:
        print("  No pending messages")
        return

    print(f"  {len(messages)} message(s):\n")
    for msg_path in messages:
        content = msg_path.read_text().strip()
        preview = content.split("\n")[0][:70]
        print(f"  {msg_path.name}: {preview}")


def print_task_detail(task_id: str) -> None:
    """Print detailed info for a specific task, including event log."""
    header(f"TASK: {task_id}")

    if not is_db_enabled():
        print("  DB not enabled")
        return

    from orchestrator.db import get_task, get_task_events

    task = get_task(task_id)
    if not task:
        print(f"  Task {task_id} not found")
        return

    # Task summary
    print(f"  queue:        {task.get('queue', '?')}")
    print(f"  priority:     {task.get('priority', '?')}")
    print(f"  role:         {task.get('role', '?')}")
    print(f"  branch:       {task.get('branch', '?')}")
    print(f"  claimed_by:   {task.get('claimed_by') or '-'}")
    print(f"  commits:      {task.get('commits_count', 0)}")
    print(f"  turns:        {task.get('turns_used') or '-'}")
    print(f"  attempts:     {task.get('attempt_count', 0)}")
    print(f"  rejections:   {task.get('rejection_count', 0)}")
    if task.get('project_id'):
        print(f"  project:      {task['project_id']}")
    if task.get('blocked_by'):
        print(f"  blocked_by:   {task['blocked_by']}")

    # Lifecycle timestamps
    subheader("Lifecycle Timestamps")
    print(f"  created_at:   {task.get('created_at') or '-'}")
    print(f"  claimed_at:   {task.get('claimed_at') or '-'}")
    print(f"  submitted_at: {task.get('submitted_at') or '-'}")
    print(f"  completed_at: {task.get('completed_at') or '-'}")
    print(f"  updated_at:   {task.get('updated_at') or '-'}")

    # Event log
    events = get_task_events(task_id)
    subheader(f"Event Log ({len(events)} events)")
    if not events:
        print("  No events recorded")
    else:
        fmt = "  {:<20} {:<18} {:<14} {}"
        print(fmt.format("TIMESTAMP", "EVENT", "ACTOR", "DETAILS"))
        print(fmt.format("-" * 20, "-" * 18, "-" * 14, "-" * 20))
        for ev in events:
            ts = ev.get("timestamp") or "?"
            # Truncate timestamp for display
            if len(ts) > 19:
                ts = ts[:19]
            event_name = ev.get("event") or "?"
            actor = ev.get("actor") or "-"
            details = (ev.get("details") or "")[:50]
            print(fmt.format(ts, event_name, actor, details))


# ── Main ─────────────────────────────────────────────────────────────────


def main() -> int:
    # If --task flag is provided, show task detail only
    if TASK_ID:
        print(f"\nOrchestrator Task Detail -- {datetime.now().strftime('%Y-%m-%d %H:%M')}")
        print("-" * 60)
        print_task_detail(TASK_ID)
        print(f"\n{'-' * 60}")
        print("Done.\n")
        return 0

    print(f"\nOrchestrator Status Report -- {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("-" * 60)

    print_scheduler_health()
    print_queue_status()
    print_agent_status()
    print_worktree_status()
    print_agent_notes()
    print_breakdowns()
    print_projects()
    print_open_prs()
    print_messages()

    print(f"\n{'-' * 60}")
    print("Done.\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
