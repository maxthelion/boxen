#!/usr/bin/env python3
"""Update the shared bootstrap checkout to latest origin/main.

The bootstrap is a single shared read-only checkout that all agents use as their
working directory. This script updates it to the latest origin/main.

Usage:
    .orchestrator/venv/bin/python .orchestrator/scripts/update_bootstrap.py
"""

import sys
from pathlib import Path

# Add orchestrator submodule to path
repo_root = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(repo_root / "orchestrator"))

from orchestrator.git_utils import update_bootstrap, get_bootstrap_worktree_path


def main() -> None:
    """Update bootstrap checkout."""
    try:
        bootstrap_path = get_bootstrap_worktree_path()

        if not bootstrap_path.exists():
            print(f"Bootstrap does not exist at: {bootstrap_path}")
            print("The scheduler will create it automatically on next run.")
            print("Or run: .orchestrator/venv/bin/python -c \"from orchestrator.git_utils import ensure_bootstrap; ensure_bootstrap()\"")
            sys.exit(1)

        print(f"Updating bootstrap at: {bootstrap_path}")
        update_bootstrap()
        print("Bootstrap updated successfully")

    except Exception as e:
        print(f"Error updating bootstrap: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
