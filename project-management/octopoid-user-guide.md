# Octopoid User Guide

**Status:** Living Document
**Last Updated:** 2026-02-08

A practical guide for human operators of the Octopoid orchestration system.

---

## 1. What Octopoid Does

Octopoid is an automated task orchestration system that uses Claude Code agents to do development work in the background. It:

- Accepts tasks you create (feature requests, bug fixes, refactors, orchestrator improvements)
- Breaks complex tasks down into smaller subtasks via a dedicated breakdown agent
- Assigns tasks to implementer agents that write code in isolated git worktrees
- Creates pull requests for completed app work
- Self-merges orchestrator changes when tests pass
- Rebases stale branches automatically (when the rebaser agent is enabled)
- Recycles burned-out tasks (agents that spin without producing commits)
- Manages dependencies between tasks so work flows in the right order

You interact with it through slash commands in your Claude Code interactive session. The interactive session acts as a project manager -- it plans work, creates tasks, and reviews output, but does not write code itself.

---

## 2. What You Can Do (Slash Commands)

All commands are typed in the Claude Code interactive session. Run `/list-skills` to see the full list.

### Status and Awareness

| Command | What It Does |
|---------|-------------|
| `/orchestrator-status` | Full system health report: scheduler, queues, agents, worktrees, PRs, breakdowns |
| `/queue-status` | Show task counts per queue (incoming, claimed, done, failed) with limits |
| `/agent-status` | Show each agent's role, status (idle/running/paused), last run, and next due time |
| `/today` | Summary of today's activity: tasks completed, tasks in progress, git activity, uncommitted drafts |
| `/whats-next` | Prioritized list of actionable items: PRs to review, struggling agents, provisional tasks, inbox items |
| `/list-skills` | List all available slash commands with descriptions |

### Creating and Managing Tasks

| Command | What It Does |
|---------|-------------|
| `/enqueue` | Create a new task with title, role, priority, branch, context, and acceptance criteria |
| `/approve-task <id>` | Approve a completed task: merge its PR, move to done, clean up |
| `/reject-task <id> "<feedback>"` | Reject a task with specific feedback; sends it back to an agent for rework |
| `/retry-failed [id or --all]` | Move failed tasks back to the incoming queue for another attempt |
| `/decompose-task <id>` | Break a complex or repeatedly-failing task into small, sequential micro-tasks |
| `/set-priorities` | Update project-wide priorities that guide what agents work on |
| `/audit-completions` | Find tasks marked "done" that show signs of no real work (0 commits, exploration exhaustion) |

### Agent Management

| Command | What It Does |
|---------|-------------|
| `/pause-agent <name>` | Toggle an individual agent on/off; paused agents stop getting scheduled |
| `/kill-agent <name>` | Kill an agent's process, clean up its worktree and state |
| `/kill-all-agents` | Kill all agents, return claimed tasks to incoming, prune worktrees |
| `/add-agent` | Add a new agent to the configuration (name, role, interval) |
| `/pause-system` | Toggle the entire orchestrator on/off; no agents will be spawned while paused |

### Review

| Command | What It Does |
|---------|-------------|
| `/preview-pr <id or PR#>` | Show what a PR changes, its staging URL, and how to test it |
| `/check-orchestrator-task <id>` | Review an orchestrator-impl task: check submodule commits, run tests, assess readiness |
| `/approve-triage` | Process an approved inbox triage proposal (file items, archive originals) |
| `/human-inbox` | Show pending items from agents that need your attention (proposals, questions, decisions) |

### Tuning

| Command | What It Does |
|---------|-------------|
| `/tune-intervals` | Adjust how often agents wake up and check for work (edit `interval_seconds`) |
| `/tune-backpressure` | Adjust queue limits: max incoming tasks, max concurrent claims, max open PRs |

### Meta and Process

| Command | What It Does |
|---------|-------------|
| `/reflect` | Assess whether the last task was harder than it needed to be; propose prevention |
| `/postmortem` | Create a structured postmortem for a process failure (wrong output, wasted cycles) |
| `/draft-idea` | Capture an idea as a draft in `project-management/drafts/boxen/` or `octopoid/` |
| `/process-draft` | Archive a draft that has been acted on; extract rules and outstanding work |
| `/clarify` | Work through unanswered questions on a feature awaiting clarification |

---

## 3. Dashboard

Octopoid includes a terminal-based dashboard (`octopoid-dash.py`) that gives a live visual overview of the system. It runs separately from your Claude Code session.

### Launching

```bash
.orchestrator/venv/bin/python orchestrator/octopoid-dash.py
```

### Layout

The dashboard has four tabs, each showing a kanban-style column view:

| Tab | Key | Shows |
|-----|-----|-------|
| **Work** | `W` | Tasks across queues: Queued, In Progress, Checks, In Review, Done |
| **PRs** | `P` | Open pull requests with staging URLs |
| **Inbox** | `I` | Items from agents waiting for your attention |
| **Agents** | `A` | Agent roster with master-detail: select an agent to see its current task, last run, turn count |

### Keyboard Navigation

| Key | Action |
|-----|--------|
| `W` / `P` / `I` / `A` | Switch tabs |
| `j` / `k` or `↓` / `↑` | Move cursor up/down in the current list |
| `q` | Quit |

The footer shows summary stats: total tasks, agent count, queue health.

### Demo Mode

Pass `--demo` to populate the dashboard with sample data for testing the UI without a running orchestrator:

```bash
.orchestrator/venv/bin/python orchestrator/octopoid-dash.py --demo
```

### Known Limitations

- **Actions are display-only.** The dashboard shows action hints (Enter, a, r, d) but these are not yet wired to perform approvals, rejections, or other operations. Use slash commands in your interactive session for actions.
- **No agent work log.** The agent detail view shows current task and turn count but not a log of recent actions.
- **No agent control.** Pausing or killing agents must be done via slash commands, not from the dashboard.

---

## 4. What to Expect

- **Agents work asynchronously.** After you `/enqueue` a task, you do not need to wait. Agents will claim it, work on it, and produce output in the background.
- **App tasks produce PRs.** Implementer agents create feature branches and open GitHub pull requests. You review these like any other PR.
- **Orchestrator tasks do not produce PRs.** Agents working on the orchestrator submodule commit to `orch/<task-id>` branches inside the submodule. They self-merge when tests pass.
- **Failed self-merges go to provisional.** If an orchestrator task's self-merge fails (rebase conflict, test failure), the task moves to the provisional queue for your manual review.
- **Burned-out tasks get recycled automatically.** If an agent uses 80+ turns with 0 commits, the recycler agent detects this and sends the task for re-breakdown into smaller pieces.
- **Stale branches get rebased.** When a task branch falls 5+ commits behind main, the scheduler flags it. If the rebaser agent is enabled, it rebases automatically and re-runs tests.
- **The interactive session is your project manager.** It plans work, creates tasks, reviews output, and surfaces what needs attention -- but it does not write code directly.
- **Tasks can have dependencies.** A task with `BLOCKED_BY` will not be picked up until its prerequisite completes. The system manages this automatically.

---

## 5. Daily Workflow

A suggested routine for checking in on the system:

1. **`/orchestrator-status`** -- Check overall system health. Look for paused agents that have incoming work, failed tasks, or stale PRs.

2. **`/whats-next`** -- See the top actionable items ranked by priority. This is your main entry point for "what needs me right now?"

3. **Review PRs** -- The `/whats-next` output will call out open PRs. Use `/preview-pr <number>` to get a summary and staging URL. Approve with `/approve-task` or reject with `/reject-task`.

4. **`/human-inbox`** -- Check for escalated items: proposals from agents, architectural questions, triage suggestions. Approve, reject, or discuss each item.

5. **`/enqueue` new work** -- If the queue is running low or you have new ideas, create tasks. The system will handle breakdown, assignment, and execution.

6. **`/today`** -- At the end of a session, review what happened: tasks completed, tasks in progress, uncommitted drafts that represent decisions waiting to be made.

### During Lulls

When there is nothing urgent, the interactive session will proactively surface:
- PRs ready for review
- Agents that appear stuck (high turn count, no commits)
- Drafts in `project-management/drafts/` (boxen or octopoid) that could become tasks
- Whether the queue has enough work for implementers

---

## 6. Customization

### Adding or Removing Agents

- `/add-agent` -- interactive wizard for adding a new agent
- `/pause-agent <name>` -- toggle an agent on/off without removing it
- `/agent-status` -- see the live roster with current state
- Or edit `.orchestrator/agents.yaml` directly

### Turn Limits

Agents have per-role turn limits that control how long they work before stopping:

| Role | Max Turns |
|------|-----------|
| Implementer | 100 (initial), 50 (continuation) |
| Orchestrator impl | 200 |
| Breakdown | 50 (exploration), 10 (decomposition) |
| Reviewer | 20 |
| Proposer | 20 |
| Gatekeeper | 15 |

Burned-out threshold: 80 turns with 0 commits triggers automatic recycling.

### Wake Intervals

Control how often agents check for work via `/tune-intervals` or by editing `interval_seconds` in `.orchestrator/agents.yaml`.

- Lower interval = more responsive, more API usage
- Higher interval = less responsive, lower cost
- Currently: implementers at 30s, breakdown at 60s, inbox-poller at 10s

### Queue Backpressure

Control task flow limits via `/tune-backpressure` or by editing `queue_limits` in `.orchestrator/agents.yaml`.

| Limit | Default | What It Controls |
|-------|---------|-----------------|
| `max_incoming` | 20 | Max tasks in incoming + claimed queues |
| `max_claimed` | 5 | Max tasks being worked on simultaneously |
| `max_open_prs` | 10 | Max open pull requests before agents stop creating new ones |

### Gatekeeper System

Currently **disabled** (`gatekeeper.enabled: false` in agents.yaml). When enabled, gatekeeper agents review PRs for architecture, testing quality, and QA before they can be merged.

To enable: set `gatekeeper.enabled: true` in `.orchestrator/agents.yaml`, unpause the gatekeeper agents.

### Interactive Session Behavior

The interactive Claude session's role and defaults are defined in `project-management/claude-interactive-role.md` (symlinked as `CLAUDE.local.md`). Edit that file to change:
- Default behavior when idle
- How tasks are created and reviewed
- What the session proactively surfaces

---

## 7. Troubleshooting

### Task stuck in "claimed"

The claiming agent may have crashed or been killed without cleanup.
- `/kill-agent <name>` to clean up the agent's state
- `/retry-failed` or manually move the task back to incoming
- Check if the system is paused (`/pause-system` toggles)

### "0 commits" shown for orchestrator task

This is a **known display issue**. The status script counts commits in the main repo, but orchestrator tasks commit inside the `orchestrator/` submodule. Use `/check-orchestrator-task <id>` to inspect the actual submodule commits.

### Agent burned out (high turns, no commits)

The recycler agent handles this automatically. It detects tasks with 80+ turns and 0 commits, then sends them for re-breakdown into smaller subtasks. Check `/orchestrator-status` to see recycled tasks and their new breakdowns.

### Self-merge failed (task in provisional queue)

Orchestrator tasks attempt self-merge: rebase onto main, run pytest, fast-forward merge, push. If any step fails, the task goes to provisional for manual review.

- `/check-orchestrator-task <id>` to review what happened
- Fix and approve manually: `.orchestrator/venv/bin/python .orchestrator/scripts/approve_orchestrator_task.py <task-id>`
- Or `/reject-task <id> "feedback"` to send it back

Common self-merge failure causes:
- **Rebase conflict:** Another task merged to main since the agent started
- **Test failure:** Agent's changes break existing tests
- **Push failure:** Network issue or branch protection (non-fatal; local merge is kept)

### PR has merge conflicts

- `/reject-task <id> "Rebase needed — conflicts with main"` to send it back
- Or manually rebase in the review worktree (`.orchestrator/agents/review-worktree/`)

### System paused unexpectedly

Check `.orchestrator/agents.yaml` for `paused: true` at the top level. `/pause-system` toggles this flag. Running agents will finish their current work but no new agents will be spawned.

### Agent keeps failing on the same task

After 3 rejections, a task escalates to human attention. If an agent is repeatedly stuck:
1. `/kill-agent <name>` to stop it
2. Read the task file to understand what is being asked
3. `/decompose-task <id>` to break it into simpler pieces
4. Or rework the task description with clearer instructions and `/retry-failed`

### Breakdown produces wrong subtasks

If a breakdown misses the original intent (helper functions created but never wired up, tests at the wrong layer):
1. `/reject-task` the problematic subtasks
2. Consider running `/postmortem` to document what went wrong
3. Re-decompose with more specific instructions using `/decompose-task`

---

## 8. Scripts Reference

### Domain Scripts (`.orchestrator/scripts/`)

Run with `.orchestrator/venv/bin/python`:

| Script | Purpose |
|--------|---------|
| `status.py` | Comprehensive one-shot status report (used by `/orchestrator-status`) |
| `status.py --verbose` | Same, with expanded agent notes |
| `approve_orchestrator_task.py <id>` | Approve an orchestrator task (cherry-pick to main, push, update submodule ref) |
| `approve_task.py <id>` | Approve a regular app task (merge PR, update DB) |
| `accept_all.py` | Batch-accept all provisional tasks |
| `diagnose_provisional.py` | Diagnose why tasks are stuck in provisional |
| `list_gatekeepers.py` | Show gatekeeper config, agents, checks, and key files |
| `today.py` | Today's activity summary (used by `/today`) |
| `whats_next.py` | Actionable items list (used by `/whats-next`) |

### Orchestrator Submodule Scripts (`orchestrator/scripts/`)

Run with `.orchestrator/venv/bin/python` or the submodule's own venv:

| Script | Purpose |
|--------|---------|
| `list-tasks [queue]` | List tasks in a queue (incoming, claimed, done, etc.) |
| `view-task <id>` | Show full task details |
| `project-status [id]` | Show project with task breakdown |
| `list-breakdowns` | Show pending breakdowns awaiting review |
| `view-breakdown <id>` | Show breakdown details |
| `approve-breakdown` | Approve a pending breakdown |
| `run-breakdown` | Manually trigger a breakdown |
| `send-to-breakdown` | Send a task to the breakdown queue |
| `kill-agent.sh <name>` | Kill a specific agent process and clean up |
| `kill-all-agents.sh` | Kill all agent processes and clean up |
| `agent-status.sh` | Show agent process status |
| `agent-worktree.sh` | Show agent worktree info |
| `move_task.py` | Move a task between queues |
| `cancel_task.py` | Cancel a task |
| `unclaim_task.py` | Release a claimed task back to incoming |
| `update_task.py` | Update task metadata |
| `reset-task` | Reset a task to initial state |
| `review-orchestrator-task <id>` | Review an orchestrator task's commits and changes |
| `delete-project` | Delete a project and its tasks |

---

## 9. Key File Locations

| Path | What It Is |
|------|-----------|
| `.orchestrator/agents.yaml` | Agent configuration, queue limits, gatekeeper settings |
| `.orchestrator/state.db` | SQLite database tracking all tasks, agents, and history |
| `.orchestrator/shared/queue/` | Task files organized by state (incoming, claimed, done, failed, provisional, etc.) |
| `.orchestrator/shared/breakdowns/` | Pending task breakdowns awaiting review |
| `.orchestrator/shared/notes/` | Persistent notes agents leave for future runs |
| `.orchestrator/agents/<name>/` | Per-agent runtime state (worktree, state.json, current_task.json) |
| `.orchestrator/agents/review-worktree/` | Dedicated worktree for reviewing agent branches without touching main |
| `project-management/drafts/boxen/` | App feature drafts (geometry, UI, operations) |
| `project-management/drafts/octopoid/` | Orchestrator/project management drafts |
| `project-management/human-inbox/` | Items from agents awaiting your attention |
| `project-management/claude-interactive-role.md` | Interactive session role config (symlinked as CLAUDE.local.md) |
| `.claude/commands/` | All slash command definitions |
| `.claude/rules/` | Rules that all Claude sessions (agents and interactive) follow |
| `orchestrator/docs/architecture.md` | Architecture reference (kept updated by orchestrator agents) |
