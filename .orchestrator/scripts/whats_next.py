#!/usr/bin/env python3
"""What's Next — actionable items for idle moments.

Usage:
    .orchestrator/venv/bin/python .orchestrator/scripts/whats_next.py

Unlike status.py (raw system state), this script answers:
"What should we do next?"
"""

import json
import re
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

# Add orchestrator package to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "orchestrator"))

from orchestrator.config import (
    get_agents,
    get_agents_runtime_dir,
    get_notes_dir,
    get_orchestrator_dir,
    get_queue_dir,
    is_db_enabled,
)
from orchestrator.queue_utils import (
    get_queue_status,
    list_pending_breakdowns,
    list_tasks,
    parse_task_file,
)

ROOT = Path(__file__).parent.parent.parent
PM_DIR = ROOT / "project-management"

# ── Helpers ──────────────────────────────────────────────────────────────


def ago(iso_str: str | None) -> str:
    if not iso_str:
        return "never"
    try:
        cleaned = iso_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(cleaned)
        if dt.tzinfo is not None:
            dt = dt.replace(tzinfo=None)
        delta = datetime.now() - dt
        if delta < timedelta(minutes=1):
            return f"{int(delta.total_seconds())}s ago"
        if delta < timedelta(hours=1):
            return f"{int(delta.total_seconds() / 60)}m ago"
        if delta < timedelta(days=1):
            return f"{h}h ago" if (h := delta.seconds // 3600) else "<1h ago"
        return f"{delta.days}d ago"
    except (ValueError, TypeError):
        return str(iso_str)


def run(cmd: list[str], cwd: str | None = None) -> str:
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, cwd=cwd, timeout=10,
        )
        return result.stdout.strip()
    except (subprocess.SubprocessError, FileNotFoundError):
        return ""


def count_files(directory: Path, pattern: str = "*.md") -> int:
    if not directory.exists():
        return 0
    return len([f for f in directory.glob(pattern) if f.name != ".gitkeep"])


def list_files(directory: Path, pattern: str = "*.md") -> list[Path]:
    if not directory.exists():
        return []
    return sorted(
        [f for f in directory.glob(pattern) if f.name != ".gitkeep"],
        key=lambda f: f.stat().st_mtime,
        reverse=True,
    )


def resolve_task_title(task: dict) -> str:
    """Get a readable title for a task, falling back to file parsing."""
    title = task.get("title") or ""
    tid = task.get("id") or ""
    # If title is just the ID, try parsing the actual file
    if title == tid or not title:
        for subdir in ["provisional", "incoming", "claimed", "done", "failed",
                        "escalated", "breakdown", "recycled"]:
            task_file = get_queue_dir() / subdir / f"TASK-{tid}.md"
            if task_file.exists():
                info = parse_task_file(task_file)
                if info and info.get("title") and info["title"] != tid:
                    return info["title"][:55]
                break
    return title[:55] if title else tid[:8]


def title_from_file(path: Path) -> str:
    """Extract first heading or filename."""
    try:
        for line in path.read_text().split("\n")[:10]:
            m = re.match(r"^#+\s+(.+)", line)
            if m:
                return m.group(1).strip()[:60]
    except OSError:
        pass
    return path.stem.replace("-", " ").title()[:60]


# ── Data Collection ──────────────────────────────────────────────────────


def get_struggling_agents() -> list[dict]:
    """Find agents that may be stuck: running with high turns or no commits."""
    agents = get_agents()
    runtime_dir = get_agents_runtime_dir()
    struggling = []

    for agent in agents:
        name = agent["name"]
        if agent.get("paused"):
            continue

        state_path = runtime_dir / name / "state.json"
        if not state_path.exists():
            continue

        try:
            state = json.loads(state_path.read_text())
        except (json.JSONDecodeError, OSError):
            continue

        if not state.get("running"):
            continue

        # Check worktree for commits
        worktree = runtime_dir / name / "worktree"
        commits_ahead = 0
        if (worktree / ".git").exists():
            ahead_str = run(
                ["git", "rev-list", "--count", "main..HEAD"], cwd=str(worktree)
            )
            try:
                commits_ahead = int(ahead_str)
            except ValueError:
                pass

        # Check turn count from task if available
        turns = state.get("extra", {}).get("turns_used", 0) or 0
        started = state.get("last_started")

        # Flag if running long with no commits
        if started:
            try:
                cleaned = started.replace("Z", "+00:00")
                dt = datetime.fromisoformat(cleaned)
                if dt.tzinfo:
                    dt = dt.replace(tzinfo=None)
                running_mins = (datetime.now() - dt).total_seconds() / 60
            except (ValueError, TypeError):
                running_mins = 0

            if running_mins > 30 and commits_ahead == 0:
                struggling.append({
                    "name": name,
                    "task": (state.get("current_task") or "?")[:8],
                    "running_for": f"{int(running_mins)}m",
                    "commits": commits_ahead,
                    "turns": turns,
                })

    return struggling


def get_open_prs() -> list[dict]:
    pr_json = run([
        "gh", "pr", "list", "--state", "open", "--json",
        "number,title,headRefName,author,updatedAt,reviewDecision",
        "--limit", "20",
    ])
    if not pr_json:
        return []
    try:
        return json.loads(pr_json)
    except json.JSONDecodeError:
        return []


def get_idle_agents() -> list[str]:
    """Find agents that are idle and could take work."""
    agents = get_agents()
    runtime_dir = get_agents_runtime_dir()
    idle = []

    for agent in agents:
        name = agent["name"]
        if agent.get("paused"):
            continue

        state_path = runtime_dir / name / "state.json"
        state = {}
        if state_path.exists():
            try:
                state = json.loads(state_path.read_text())
            except (json.JSONDecodeError, OSError):
                pass

        if not state.get("running"):
            blocked = state.get("extra", {}).get("blocked_reason", "")
            if not blocked:
                idle.append(name)

    return idle


def get_recommendations() -> dict[str, list[Path]]:
    """Get agent recommendations by category."""
    recs: dict[str, list[Path]] = {}
    rec_dir = PM_DIR / "agent-recommendations"
    if not rec_dir.exists():
        return recs

    for cat_dir in sorted(rec_dir.iterdir()):
        if not cat_dir.is_dir():
            continue
        files = list_files(cat_dir)
        if files:
            recs[cat_dir.name] = files

    return recs


# ── Output ───────────────────────────────────────────────────────────────


def section(emoji: str, title: str) -> None:
    print(f"\n## {emoji} {title}\n")


def main() -> int:
    print(f"# What's Next?  ({datetime.now().strftime('%Y-%m-%d %H:%M')})\n")

    actions_found = 0

    # 1. PRs ready for review
    prs = get_open_prs()
    if prs:
        section("PR", f"Open PRs ({len(prs)})")
        for pr in prs:
            number = pr.get("number", "?")
            title = pr.get("title", "untitled")[:55]
            branch = pr.get("headRefName", "?")
            updated = ago(pr.get("updatedAt"))
            review = pr.get("reviewDecision") or "no review"
            print(f"- **#{number}** {title}")
            print(f"  `{branch}` -- {updated}, {review}")
        print(f"\nUse `/preview-pr <number>` to review.")
        actions_found += len(prs)

    # 2. Struggling agents
    struggling = get_struggling_agents()
    if struggling:
        section("!!", f"Struggling Agents ({len(struggling)})")
        for s in struggling:
            print(
                f"- **{s['name']}** on task `{s['task']}` "
                f"-- running {s['running_for']}, {s['commits']} commits"
            )
        print(f"\nConsider checking worktree output or recycling tasks.")
        actions_found += len(struggling)

    # 3. Provisional tasks (need human approval)
    status = get_queue_status()
    provisional = status.get("provisional", {}).get("tasks", [])
    if provisional:
        section(">>", f"Provisional Tasks ({len(provisional)})")
        for t in provisional:
            tid = (t.get("id") or "?")[:8]
            title = resolve_task_title(t)
            print(f"- `{tid}` {title}")
        print(f"\nReview and approve or reject these completed tasks.")
        actions_found += len(provisional)

    # 4. Breakdowns pending review
    try:
        breakdowns = list_pending_breakdowns()
    except Exception:
        breakdowns = []
    if breakdowns:
        section("<<", f"Breakdowns Awaiting Review ({len(breakdowns)})")
        for bd in breakdowns:
            title = bd.get("title", "untitled")[:55]
            task_count = bd.get("task_count", "?")
            print(f"- {title} ({task_count} tasks)")
        print(f"\nReview and approve to enqueue subtasks.")
        actions_found += len(breakdowns)

    # 5. Human inbox
    inbox_files = list_files(PM_DIR / "human-inbox")
    if inbox_files:
        section(">>", f"Human Inbox ({len(inbox_files)})")
        for f in inbox_files[:8]:
            print(f"- {title_from_file(f)}")
        if len(inbox_files) > 8:
            print(f"- ... and {len(inbox_files) - 8} more")
        print(f"\nUse `/human-inbox` to triage.")
        actions_found += len(inbox_files)

    # 6. Failed / escalated tasks
    failed = status.get("failed", {}).get("tasks", [])
    escalated = status.get("escalated", {}).get("tasks", [])
    if failed or escalated:
        section("!!", f"Failed/Escalated ({len(failed) + len(escalated)})")
        for t in failed:
            tid = (t.get("id") or "?")[:8]
            title = resolve_task_title(t)
            print(f"- [FAILED] `{tid}` {title}")
        for t in escalated:
            tid = (t.get("id") or "?")[:8]
            title = resolve_task_title(t)
            print(f"- [ESCALATED] `{tid}` {title}")
        print(f"\nUse `/retry-failed` or investigate manually.")
        actions_found += len(failed) + len(escalated)

    # 7. Agent recommendations
    recs = get_recommendations()
    if recs:
        total = sum(len(v) for v in recs.values())
        section(">>", f"Agent Recommendations ({total})")
        for cat, files in recs.items():
            print(f"- **{cat}**: {len(files)} item(s)")
            for f in files[:3]:
                print(f"  - {title_from_file(f)}")
        actions_found += total

    # 8. Queue capacity check
    incoming = status.get("incoming", {}).get("count", 0)
    claimed = status.get("claimed", {}).get("count", 0)
    breakdown = status.get("breakdown", {}).get("count", 0)
    idle_agents = get_idle_agents()

    if idle_agents and incoming == 0 and breakdown == 0:
        section(">>", "Queue Running Low")
        print(f"- {len(idle_agents)} idle agent(s): {', '.join(idle_agents)}")
        print(f"- {incoming} incoming, {claimed} claimed, {breakdown} in breakdown")
        print(f"\nConsider enqueuing work or creating a project breakdown.")
        actions_found += 1

    # 9. Awaiting clarification (blocked on user)
    ac_files = list_files(PM_DIR / "awaiting-clarification")
    if ac_files:
        section(">>", f"Awaiting Your Clarification ({len(ac_files)})")
        for f in ac_files[:6]:
            print(f"- {title_from_file(f)}")
        if len(ac_files) > 6:
            print(f"- ... and {len(ac_files) - 6} more")
        print(f"\nThese items are blocked waiting for your input.")
        actions_found += len(ac_files)

    # 10. Drafts that could be enacted
    draft_files = list_files(PM_DIR / "drafts")
    if draft_files:
        section(">>", f"Unenacted Drafts ({len(draft_files)})")
        for f in draft_files[:5]:
            print(f"- {title_from_file(f)}")
        if len(draft_files) > 5:
            print(f"- ... and {len(draft_files) - 5} more")

    # Summary
    print(f"\n---")
    if actions_found == 0:
        print(f"\nAll clear! Nothing needs immediate attention.")
    else:
        print(f"\n**{actions_found} item(s) could use attention.**")

    return 0


if __name__ == "__main__":
    sys.exit(main())
