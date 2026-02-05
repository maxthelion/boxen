# Orchestrator Usage Guide

This document describes how Boxen uses the Octopoid orchestrator for automated task management.

## Overview

The orchestrator manages background agents that implement features, run tests, and review code. It uses SQLite for state management with file-based queues maintained in parallel for visibility and rollback capability.

**Key design decisions:**
- SQLite mode enabled for ACID transactions (no race conditions)
- Manual validation instead of automated validator
- Tasks complete to `provisional` queue → manually accepted when ready

## Architecture

```
.orchestrator/
├── agents.yaml              # Agent configuration
├── state.db                 # SQLite database (source of truth)
├── scripts/                 # Utility scripts
│   └── accept_all.py        # Accept provisional tasks
├── agents/                  # Per-agent runtime state
│   └── {agent-name}/
│       ├── state.json       # Running/idle status, PID
│       ├── status.json      # Current task progress
│       ├── worktree/        # Git worktree for isolated work
│       └── stderr.log       # Agent output logs
├── shared/
│   ├── queue/               # Task queue directories
│   │   ├── incoming/        # Tasks waiting to be claimed
│   │   ├── claimed/         # Tasks being worked on
│   │   ├── provisional/     # Completed, awaiting acceptance
│   │   ├── done/            # Accepted tasks
│   │   └── failed/          # Failed tasks
│   └── proposals/           # Proposal system directories
│       ├── active/          # Proposals awaiting curation
│       ├── promoted/        # Approved proposals
│       └── deferred/        # Postponed proposals
├── prompts/                 # Custom agent prompts
├── messages/                # Agent messages (warnings, questions)
└── logs/                    # Scheduler and agent logs
```

## Important Rules

### Agent Worktrees Must Not Checkout Main

Agent worktrees should **never** be on the `main` branch. This blocks the main repo from checking out main and violates isolation principles.

**If an agent worktree is on main:**
```bash
# Detach it
cd .orchestrator/agents/{agent-name}/worktree
git checkout --detach HEAD
```

**Correct states for agent worktrees:**
- Detached HEAD (idle)
- Feature branch for current task (working)

**Never:** Checked out on `main`

See [Issue 003](issues/003-agent-worktree-on-main.md) for details.

## Task Flow

### With SQLite Mode (Current)

```
incoming → claimed → provisional → done
                          ↓
                      (manual accept)
```

1. **Create task** → appears in `incoming/`
2. **Agent claims** → DB updated atomically, file moved to `claimed/`
3. **Agent completes** → DB updated, file moved to `provisional/`
4. **Manual accept** → run `accept_all.py`, moves to `done/`

### Validation Workflow

We use manual validation instead of the automated validator:

```bash
# Accept all completed tasks
source .orchestrator/venv/bin/activate
python .orchestrator/scripts/accept_all.py
```

This is intentional - we have existing tooling to detect "lying agents" (agents that mark tasks done without actually completing them).

## Configured Agents

| Name | Role | Status | Purpose |
|------|------|--------|---------|
| `inbox-poller` | proposer | Active | Classifies and routes inbox items |
| `curator` | curator | Paused | Evaluates proposals, queues tasks |
| `impl-agent-1` | implementer | Active | Implements tasks |
| `impl-agent-2` | implementer | Active | Implements tasks (parallel) |
| `backlog-groomer` | proposer | Paused | Processes docs into proposals |
| `test-checker` | proposer | Paused | Proposes test improvements |
| `architect` | proposer | Paused | Proposes structural improvements |
| `plan-reader` | proposer | Paused | Executes documented plans |
| `review-agent` | reviewer | Active | Reviews code/PRs |
| `pr-coordinator` | pr_coordinator | Paused | Creates review tasks for new PRs |

## Scripts

### `.orchestrator/scripts/accept_all.py`

Accept all tasks in the provisional queue:

```bash
source .orchestrator/venv/bin/activate
python .orchestrator/scripts/accept_all.py
```

## Slash Commands

Commands available via Claude Code:

| Command | Description |
|---------|-------------|
| `/queue-status` | Show task queue state |
| `/agent-status` | Show all agent states |
| `/enqueue` | Create a new task |
| `/pause-agent` | Pause/resume specific agent |
| `/pause-system` | Pause/resume entire orchestrator |
| `/retry-failed` | Retry failed tasks |
| `/add-agent` | Add a new agent |
| `/tune-intervals` | Adjust agent wake intervals |
| `/tune-backpressure` | Adjust queue limits |
| `/kill-agent` | Kill and clean up an agent |
| `/kill-all-agents` | Kill all running agents |
| `/audit-completions` | Detect failed explorer tasks |
| `/decompose-task` | Break down problematic tasks |

## Scheduler Control

The scheduler runs via launchd:

```bash
# Check status
launchctl list | grep boxen

# Stop scheduler
launchctl stop com.boxen.orchestrator

# Start scheduler
launchctl start com.boxen.orchestrator

# Disable entirely (persists across reboots)
launchctl unload ~/Library/LaunchAgents/com.boxen.orchestrator.plist

# Re-enable
launchctl load ~/Library/LaunchAgents/com.boxen.orchestrator.plist
```

## Migration Commands

SQLite migration tools:

```bash
source .orchestrator/venv/bin/activate

# Check migration status
python -m orchestrator.orchestrator.migrate status

# Import existing tasks (idempotent)
python -m orchestrator.orchestrator.migrate import --verbose

# Rollback to file-based mode
python -m orchestrator.orchestrator.migrate rollback --force
# Then comment out database: section in agents.yaml
```

## Debugging

### View Logs

```bash
# Scheduler activity
tail -f .orchestrator/logs/launchd-stdout.log

# Specific agent logs
tail -f .orchestrator/agents/impl-agent-1/stderr.log
```

### Check Queue Status

```bash
# File-based view
ls .orchestrator/shared/queue/incoming/
ls .orchestrator/shared/queue/claimed/
ls .orchestrator/shared/queue/provisional/

# Database view
source .orchestrator/venv/bin/activate
python -m orchestrator.orchestrator.migrate status
```

### Kill Stuck Agent

```bash
kill $(cat .orchestrator/agents/impl-agent-1/state.json | jq -r .pid)
```

## Configuration

### Database Mode

In `.orchestrator/agents.yaml`:

```yaml
database:
  enabled: true
  path: state.db  # Relative to .orchestrator/
```

### Proposal Limits

Control how many proposals each proposer type can create:

```yaml
proposal_limits:
  inbox-poller:
    max_active: 1
    max_per_run: 10
  architect:
    max_active: 3
    max_per_run: 1
```

### Queue Limits

```yaml
queue_limits:
  max_incoming: 20
  max_claimed: 5
  max_open_prs: 10
```

## Differences from Upstream Octopoid

| Feature | Upstream | Our Usage |
|---------|----------|-----------|
| Validation | Automated validator agent | Manual acceptance |
| Planning escalation | Auto-escalate after N failures | Manual decomposition |
| Task completion | `provisional` → validator → `done` | `provisional` → manual → `done` |

We chose manual validation because we have existing tooling to detect agents that falsely claim task completion.
