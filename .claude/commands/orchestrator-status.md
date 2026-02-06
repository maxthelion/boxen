Show comprehensive orchestrator status.

Run:

```bash
.orchestrator/venv/bin/python .orchestrator/scripts/status.py
```

For verbose output (expanded agent notes):

```bash
.orchestrator/venv/bin/python .orchestrator/scripts/status.py --verbose
```

Display the output to the user. Highlight any issues:
- Agents that are paused but have incoming work
- Failed tasks
- Worktrees with uncommitted changes
- Pending breakdowns awaiting review
- Stale PRs
