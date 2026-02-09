#!/usr/bin/env python3
"""List all draft documents with their status and age.

Usage:
    orchestrator/venv/bin/python .orchestrator/scripts/list_drafts.py
"""

import os
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
    meta = {"status": "unknown", "captured": None, "title": filepath.stem}
    try:
        content = filepath.read_text()
        # Title from first heading
        title_match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
        if title_match:
            meta["title"] = title_match.group(1).strip()

        # Status field
        status_match = re.search(r"\*\*Status:\*\*\s*(.+)", content)
        if status_match:
            meta["status"] = status_match.group(1).strip()

        # Captured date
        captured_match = re.search(r"\*\*Captured:\*\*\s*(.+)", content)
        if captured_match:
            meta["captured"] = captured_match.group(1).strip()
    except (IOError, OSError):
        pass
    return meta


def _age_str(filepath: Path) -> str:
    """Human-readable age based on file mtime."""
    mtime = filepath.stat().st_mtime
    age = datetime.now(timezone.utc) - datetime.fromtimestamp(mtime, tz=timezone.utc)
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
    for subdir in sorted(drafts_dir.iterdir()):
        if not subdir.is_dir():
            continue
        if subdir.name.startswith("."):
            continue
        for f in sorted(subdir.glob("*.md")):
            meta = _extract_metadata(f)
            drafts.append({
                "category": subdir.name,
                "file": f.name,
                "path": f,
                **meta,
            })

    # Also check root-level drafts
    for f in sorted(drafts_dir.glob("*.md")):
        meta = _extract_metadata(f)
        drafts.append({
            "category": "",
            "file": f.name,
            "path": f,
            **meta,
        })

    if not drafts:
        print("No drafts found.")
        return

    # Group by category
    categories = {}
    for d in drafts:
        cat = d["category"] or "(root)"
        categories.setdefault(cat, []).append(d)

    for cat in sorted(categories.keys()):
        items = categories[cat]
        print(f"\n{'='*60}")
        print(f"  {cat.upper()} ({len(items)} drafts)")
        print(f"{'='*60}")
        for item in items:
            age = _age_str(item["path"])
            status = item["status"]
            title = item["title"]
            # Truncate title if too long
            if len(title) > 50:
                title = title[:47] + "..."
            print(f"  [{status:10s}] {age:>4s}  {title}")
            print(f"             {item['file']}")

    print(f"\nTotal: {len(drafts)} drafts")


if __name__ == "__main__":
    list_drafts()
