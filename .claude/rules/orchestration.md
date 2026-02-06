# Octopoid (Orchestrator) Debugging

The project uses **Octopoid**, an automated orchestrator that manages background agents. Full docs: `docs/orchestrator-usage.md`. Submodule: `orchestrator/` (branch `sqlite-model`, venv at `orchestrator/venv/`).

## First Point of Entry

When investigating agent issues, task failures, queue problems, or anything Octopoid-related, **always start with the status script**:

```bash
.orchestrator/venv/bin/python .orchestrator/scripts/status.py
```

Or use the slash command: `/orchestrator-status`

This gives a single-page overview of: scheduler health, queue state, agent status, worktree branches/commits/diffs, agent notes, breakdowns, projects, open PRs, and messages.

**Do not** manually inspect individual agent directories, worktrees, state files, or queue folders. The status script aggregates all of this. If it doesn't show what you need, add a section to the script rather than doing ad-hoc investigation.

## When to Use

- User asks about agent progress or why something isn't running
- A task seems stuck or hasn't been picked up
- Debugging why an agent produced the wrong result
- Before unpausing agents or making queue changes
- After enqueuing work, to verify it appeared

## Creating Tasks

**Never create task files manually.** Always use `/enqueue` or the `create_task()` function from `orchestrator.queue_utils`. Manually writing a `.md` file into the queue directory creates a file that exists on disk but is not registered in the DB — the scheduler cannot see it, and it will sit in `incoming/` forever.

If you find an orphan file (the status script flags these), register it in the DB or recreate it via `/enqueue`.

## Other Useful Scripts

Scripts in `orchestrator/scripts/` (run with `.orchestrator/venv/bin/python`):

| Script | Purpose |
|--------|---------|
| `list-tasks [queue]` | List tasks in a queue (incoming, claimed, done, etc.) |
| `view-task <id>` | Show full task details |
| `project-status [id]` | Show project with task breakdown |
| `list-breakdowns` | Show pending breakdowns awaiting review |
| `view-breakdown <id>` | Show breakdown details |

Scripts in `.orchestrator/scripts/`:

| Script | Purpose |
|--------|---------|
| `status.py` | Comprehensive one-shot status report |
| `accept_all.py` | Accept all provisional tasks |

## Extending the Status Script

If you find yourself doing manual investigation that the status script doesn't cover, **add it to the script** at `.orchestrator/scripts/status.py` so the next person benefits. Examples of things worth adding:

- New queue types or agent roles
- Deeper task content inspection
- Cross-referencing worktree state with task assignments
- Checking for common failure patterns
