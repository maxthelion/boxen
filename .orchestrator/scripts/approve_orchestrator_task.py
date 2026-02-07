#!/usr/bin/env python3
"""Approve an orchestrator specialist task (full automated flow).

This is a thin wrapper around orchestrator.approve_orch.  The module handles:

1. Look up the task in DB to find the agent and worktree path
2. Fetch the agent's commit(s) from the worktree submodule
3. Cherry-pick (or rebase) the agent's commits onto current main
4. Run pytest to verify
5. Push main to origin (with remote divergence detection)
6. Update submodule ref on main, commit, push
7. Accept in DB (queue=done, claimed_by=NULL, unblock dependents)

Usage:
    .orchestrator/venv/bin/python .orchestrator/scripts/approve_orchestrator_task.py <task-id-prefix>

Examples:
    approve_orchestrator_task.py 06b44db0
    approve_orchestrator_task.py 7bafe49f
"""

import sys
from pathlib import Path

# Ensure the orchestrator package is importable
REPO_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "orchestrator"))

from orchestrator.approve_orch import main

if __name__ == "__main__":
    main()
