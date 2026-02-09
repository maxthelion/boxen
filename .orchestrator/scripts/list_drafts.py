#!/usr/bin/env python3
"""List all draft documents with their status and age.

Usage:
    orchestrator/venv/bin/python .orchestrator/scripts/list_drafts.py
"""

import re
from datetime import datetime, timezone
from pathlib import Path


def _find_project_root() -> Path:
    """Walk up from script location to find project root."""
    p = Path(__file__).resolve()
    while p != p.parent:
        if (p / "CLAUDE.md").exists():
            return p
        p = p.parent
    return Path.cwd()


def _extract_metadata(filepath: Path) -> dict:
    """Extract status and captured date from a draft file."""
    meta = {"status": "-", "captured": None, "title": filepath.stem}
    try:
        content = filepath.read_text()
        title_match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
        if title_match:
            meta["title"] = title_match.group(1).strip()

        status_match = re.search(r"\*\*Status:\*\*\s*(.+)", content)
        if status_match:
            meta["status"] = status_match.group(1).strip()

        captured_match = re.search(r"\*\*Captured:\*\*\s*(.+)", content)
        if captured_match:
            meta["captured"] = captured_match.group(1).strip()
    except (IOError, OSError):
        pass
    return meta


def _creation_date(filepath: Path, metadata: dict) -> datetime:
    """Best-effort creation date: captured header > filename date > mtime."""
    # 1. Captured header
    if metadata.get("captured"):
        try:
            return datetime.strptime(metadata["captured"], "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            pass

    # 2. Filename date pattern: 030-2026-02-09-topic.md
    m = re.match(r"^\d{3}-(\d{4}-\d{2}-\d{2})-", filepath.name)
    if m:
        try:
            return datetime.strptime(m.group(1), "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            pass

    # 3. Fallback to mtime
    return datetime.fromtimestamp(filepath.stat().st_mtime, tz=timezone.utc)


def _age_str(filepath: Path, metadata: dict) -> str:
    """Human-readable age based on creation date."""
    created = _creation_date(filepath, metadata)
    age = datetime.now(timezone.utc) - created
    days = age.days
    if days == 0:
        hours = age.seconds // 3600
        if hours == 0:
            return "<1h"
        return f"{hours}h"
    elif days == 1:
        return "1d"
    else:
        return f"{days}d"


def list_drafts():
    root = _find_project_root()
    drafts_dir = root / "project-management" / "drafts"

    if not drafts_dir.exists():
        print("No drafts directory found.")
        return

    # Collect all .md files from subdirectories
    drafts = []
    for subdir in drafts_dir.iterdir():
        if not subdir.is_dir() or subdir.name.startswith(".") or subdir.name == "proposed-tasks":
            continue
        for f in subdir.glob("*.md"):
            meta = _extract_metadata(f)
            drafts.append({
                "category": subdir.name,
                "file": f.name,
                "path": f,
                **meta,
            })

    # Also check root-level drafts
    for f in drafts_dir.glob("*.md"):
        meta = _extract_metadata(f)
        drafts.append({
            "category": "-",
            "file": f.name,
            "path": f,
            **meta,
        })

    if not drafts:
        print("No drafts found.")
        return

    # Sort by creation date descending (newest first)
    drafts.sort(key=lambda d: _creation_date(d["path"], d), reverse=True)

    # Truncate helpers
    def trunc(s, n):
        return s[:n - 3] + "..." if len(s) > n else s

    def parse_filename(name):
        """Split '030-2026-02-09-topic.md' into ('030', '2026-02-09', 'topic.md')."""
        m = re.match(r"^(\d{3})-(\d{4}-\d{2}-\d{2})-(.+)$", name)
        if m:
            return m.group(1), m.group(2), m.group(3)
        return "", "", name

    # Print table
    print(f"{'AGE':>4s}  {'CAT':<9s}  {'#':<3s}  {'DATE':<10s}  {'STATUS':<16s}  TITLE")
    print(f"{'---':>4s}  {'---':<9s}  {'--':<3s}  {'----':<10s}  {'---':<16s}  ---")
    for d in drafts:
        age = _age_str(d["path"], d)
        cat = d["category"]
        status = trunc(d["status"], 16)
        title = trunc(d["title"], 50)
        num, date, _ = parse_filename(d["file"])
        print(f"{age:>4s}  {cat:<9s}  {num:<3s}  {date:<10s}  {status:<16s}  {title}")

    print(f"\n{len(drafts)} drafts total")


if __name__ == "__main__":
    list_drafts()
