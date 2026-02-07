#!/usr/bin/env python3
"""List gatekeeper agents and their configuration.

Usage:
    .orchestrator/venv/bin/python .orchestrator/scripts/list_gatekeepers.py

Shows:
- Gatekeeper global config (enabled/disabled, required checks)
- Each gatekeeper agent (name, focus, paused status)
- Check runner status
- Tasks with pending checks
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "orchestrator"))

from orchestrator.config import (
    get_agents,
    is_db_enabled,
    is_gatekeeper_enabled,
    get_orchestrator_dir,
)


def main():
    orch_dir = get_orchestrator_dir()
    config_path = orch_dir / "agents.yaml"

    # --- Global gatekeeper config ---
    import yaml
    config = {}
    if config_path.exists():
        with open(config_path) as f:
            config = yaml.safe_load(f) or {}

    gk_config = config.get("gatekeeper", {})
    enabled = gk_config.get("enabled", False)
    required_checks = gk_config.get("required_checks", [])
    max_rejections = gk_config.get("max_rejections", 3)
    skip_auto = gk_config.get("skip_if_auto_accept", True)

    print("=" * 60)
    print("GATEKEEPER SYSTEM STATUS")
    print("=" * 60)
    print()
    print(f"  Enabled:          {'YES' if enabled else 'NO'}")
    print(f"  Config:           {config_path}")
    print(f"  Required checks:  {', '.join(required_checks) if required_checks else '(none)'}")
    print(f"  Max rejections:   {max_rejections}")
    print(f"  Skip auto-accept: {skip_auto}")
    print()

    # --- Gatekeeper agents ---
    agents = get_agents()
    gk_agents = [a for a in agents if a.get("role") == "gatekeeper"]
    check_runners = [a for a in agents if a.get("role") == "check_runner"]

    print("-" * 60)
    print("GATEKEEPER AGENTS (Claude reviewers)")
    print("-" * 60)
    if not gk_agents:
        print("  (none configured)")
    else:
        for a in gk_agents:
            status = "PAUSED" if a.get("paused", False) else "ACTIVE"
            focus = a.get("focus", "general")
            interval = a.get("interval_seconds", "?")
            print(f"  {a['name']:20s}  focus={focus:15s}  {status:8s}  interval={interval}s")
    print()

    print("-" * 60)
    print("CHECK RUNNERS (automated test runners)")
    print("-" * 60)
    if not check_runners:
        print("  (none configured)")
        print()
        print("  To add a check runner, add to .orchestrator/agents.yaml:")
        print("    - name: check-runner")
        print("      role: check_runner")
        print("      interval_seconds: 60")
        print("      lightweight: true")
        print("      paused: false")
    else:
        for a in check_runners:
            status = "PAUSED" if a.get("paused", False) else "ACTIVE"
            print(f"  {a['name']:20s}  {status}")
    print()

    # --- Prompt files ---
    print("-" * 60)
    print("GATEKEEPER PROMPTS")
    print("-" * 60)
    prompts_dir = orch_dir / "prompts"
    if prompts_dir.exists():
        for p in sorted(prompts_dir.glob("gatekeeper*.md")):
            print(f"  {p.relative_to(orch_dir)}")
    else:
        print("  (no prompts directory)")
    print()

    # --- Tasks with checks ---
    if is_db_enabled():
        from orchestrator.db import get_connection
        print("-" * 60)
        print("TASKS WITH PENDING CHECKS")
        print("-" * 60)
        with get_connection() as conn:
            # check_results column may not exist yet (schema migration pending)
            cols = [row[1] for row in conn.execute("PRAGMA table_info(tasks)").fetchall()]
            has_results = "check_results" in cols
            if has_results:
                query = "SELECT id, queue, checks, check_results FROM tasks WHERE checks IS NOT NULL AND checks != '[]'"
            else:
                query = "SELECT id, queue, checks FROM tasks WHERE checks IS NOT NULL AND checks != '[]'"
            rows = conn.execute(query).fetchall()
            if not rows:
                print("  (no tasks have checks configured)")
            else:
                for r in rows:
                    task_id = r["id"]
                    queue = r["queue"]
                    checks = r["checks"] or "[]"
                    results = r["check_results"] if has_results else "(column missing)"
                    print(f"  TASK-{task_id}  queue={queue:12s}  checks={checks}  results={results}")
    print()

    # --- Key files ---
    print("-" * 60)
    print("KEY FILES")
    print("-" * 60)
    print(f"  Config:           .orchestrator/agents.yaml (gatekeeper: section)")
    print(f"  Check runner:     orchestrator/orchestrator/roles/check_runner.py")
    print(f"  Gatekeeper role:  orchestrator/orchestrator/roles/gatekeeper.py")
    print(f"  Coordinator:      orchestrator/orchestrator/roles/gatekeeper_coordinator.py")
    print(f"  Prompts:          .orchestrator/prompts/gatekeeper-*.md")
    print(f"  DB functions:     orchestrator/orchestrator/db.py (record_check_result, all_checks_passed)")
    print()


if __name__ == "__main__":
    main()
