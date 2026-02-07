# Dashboard Redesign: Project Management Focus

## Problem

The current `octopoid-dash.py` is a system monitoring tool — it shows agent health, logs, and runtime stats. But our actual workflow is project management: tracking work through stages, reviewing PRs, triaging proposals, and keeping agents fed with tasks.

The dashboard should answer "what's the state of the project?" not "are the processes running?"

## Proposal

Two changes:

### 1. Add a status report endpoint to Octopoid (the product)

Octopoid should expose a structured status report (JSON) that any frontend can consume. This decouples the data from the presentation and lets us build different views.

```python
# orchestrator/orchestrator/reports.py
def get_project_report() -> dict:
    """Structured report of all project state."""
    return {
        "work": {
            "incoming": [...],      # queued tasks
            "in_progress": [...],   # claimed by agents
            "in_review": [...],     # provisional + review_pending
            "done_today": [...],    # recently completed
        },
        "prs": [...],               # open PRs with review status
        "proposals": [...],         # human inbox items
        "messages": [...],          # pending messages from agents
        "agents": [...],            # agent status summary
        "health": {                 # system health (compact)
            "scheduler": "running",
            "idle_agents": 2,
            "queue_depth": 5,
        },
    }
```

This is useful beyond the dashboard — the `/whats-next` script, `/orchestrator-status`, and any future web UI could all consume it.

### 2. Replace the dashboard with a kanban-oriented TUI

New dashboard focused on work flow, with tabs for different views.

## ASCII Concept Sketches

### Main View: Work Board (Tab 1)

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  OCTOPOID                                    [W]ork [P]Rs [I]nbox [A]gents ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                            ║
║  QUEUED (3)        │ IN PROGRESS (2)   │ IN REVIEW (4)     │ DONE (5)     ║
║  ─────────         │ ───────────       │ ──────────        │ ────         ║
║                    │                   │                   │              ║
║  ┌──────────────┐  │ ┌──────────────┐  │ ┌──────────────┐  │ ✓ Toggle     ║
║  │ Snap system  │  │ │ Gatekeeper   │  │ │ Fix z-fight  │  │   face btns  ║
║  │ point fork   │  │ │ review D1+D2 │  │ │ PR #50       │  │ ✓ Task       ║
║  │ unification  │  │ │ orch-impl-1  │  │ │ 15h waiting  │  │   templates  ║
║  │              │  │ │ ██████░░ 74t │  │ │              │  │ ✓ Whats-next ║
║  └──────────────┘  │ └──────────────┘  │ └──────────────┘  │   script     ║
║  ┌──────────────┐  │ ┌──────────────┐  │ ┌──────────────┐  │ ✓ CLAUDE.md  ║
║  │ Queue manip  │  │ │ Void trans-  │  │ │ Rename Inset │  │   role def   ║
║  │ scripts      │  │ │ parency fix  │  │ │ PR #52       │  │ ✓ 2D snap    ║
║  │ orch-impl    │  │ │ impl-1       │  │ │ 15h waiting  │  │   system     ║
║  └──────────────┘  │ │ ██████░░ 45t │  │ └──────────────┘  │              ║
║  ┌──────────────┐  │ └──────────────┘  │ ┌──────────────┐  │              ║
║  │ Center line  │  │                   │ │ Axis arrow   │  │              ║
║  │ replacement  │  │                   │ │ PR #49       │  │              ║
║  └──────────────┘  │                   │ └──────────────┘  │              ║
║                    │                   │ ┌──────────────┐  │              ║
║                    │                   │ │ Void mesh    │  │              ║
║                    │                   │ │ PR #51       │  │              ║
║                    │                   │ └──────────────┘  │              ║
║                    │                   │                   │              ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  2 agents idle · queue low · 7 inbox items · 17 awaiting clarification     ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

Cards show:
- Task title (truncated)
- Agent assignment + progress bar (if in progress)
- PR number + wait time (if in review)
- Role badge for orchestrator tasks

### PRs View (Tab 2)

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  OCTOPOID                                    [W]ork [P]Rs [I]nbox [A]gents ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                            ║
║  OPEN PRs (6)                                                              ║
║  ─────────                                                                 ║
║                                                                            ║
║  #55  Queue manipulation scripts              agent/32edc31a   1h    ORCH  ║
║  #54  Gatekeeper review system                agent/06b44db0   1h    ORCH  ║
║  #52  Rename Inset tool to Offset             agent/d4063abb   15h         ║
║  #51  Fix void mesh transparency              agent/78606c45   15h         ║
║  #50  Fix z-fighting on bounding box          agent/f737dc48   15h         ║
║  #49  Replace axis arrow with center line     agent/251e9f63   16h         ║
║  #48  2D View Snapping System                 agent/a6f7f4cf   16h         ║
║                                                                            ║
║  ─────────────────────────────────────────────────────────────────────────  ║
║  [Enter] preview  [a] approve  [r] reject  [d] diff summary               ║
║                                                                            ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  7 open · 0 reviewed · 1 merged today                                      ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

### Inbox View (Tab 3)

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  OCTOPOID                                    [W]ork [P]Rs [I]nbox [A]gents ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                            ║
║  PROPOSALS (7)               │  MESSAGES (0)          │  DRAFTS (10)       ║
║  ─────────                   │  ────────              │  ──────            ║
║                              │                        │                    ║
║  • Store-to-Engine           │  No pending messages   │  • Gatekeeper      ║
║    Migration                 │                        │    review plan     ║
║  • Fix utils-to-store        │                        │  • Specialist      ║
║    dependency                │                        │    agents          ║
║  • Proposal Flow             │                        │  • Local env       ║
║    Redesign                  │                        │    config          ║
║  • Multi-Machine             │                        │  • Workflow        ║
║    Coordination              │                        │    improvements    ║
║  • Extract                   │                        │  • Interactive     ║
║    useOperationPalette       │                        │    role & gates    ║
║  • Eliminate Duplicate       │                        │  ...+5 more        ║
║    Model State               │                        │                    ║
║  • Modularize                │                        │                    ║
║    SketchView2D              │                        │                    ║
║                              │                        │                    ║
║  ─────────────────────────────────────────────────────────────────────────  ║
║  [Enter] read  [a] approve  [x] dismiss  [e] enqueue                      ║
║                                                                            ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  7 proposals · 0 messages · 10 drafts · 17 awaiting clarification          ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

### Agents View (Tab 4)

Master-detail layout: agent list on the left, detail pane on the right showing the selected agent's current work, notes, and recent log.

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  OCTOPOID                                    [W]ork [P]Rs [I]nbox [A]gents ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                            ║
║  AGENTS              │  impl-agent-1                                       ║
║  ──────              │  ─────────────                                      ║
║                      │                                                     ║
║  ▶ impl-agent-1  IDLE│  Role: implementer                                  ║
║    impl-agent-2  IDLE│  Status: IDLE · last run 2m ago                     ║
║    orch-impl-1   IDLE│  Claimed: none                                      ║
║    breakdown-1   IDLE│                                                     ║
║    inbox-poller  IDLE│  CURRENT TASK                                       ║
║    recycler      IDLE│  ────────────                                       ║
║                      │  (none)                                             ║
║                      │                                                     ║
║                      │  RECENT WORK                                        ║
║                      │  ───────────                                        ║
║                      │  ✓ 971e8e18 Toggle face buttons     PR #53 merged   ║
║                      │  ✓ 78606c45 Fix void transparency   PR #51 waiting  ║
║                      │  ✓ f737dc48 Fix z-fighting          PR #50 waiting  ║
║                      │                                                     ║
║                      │  NOTES                                              ║
║                      │  ─────                                              ║
║                      │  "PanelPathRenderer uses useMemo for geometry       ║
║                      │   computation. Consider extracting shared ops       ║
║                      │   infrastructure for 2D/3D views."                  ║
║                      │                                                     ║
║                      │  WORK LOG (last 10 lines)                           ║
║                      │  ────────                                           ║
║                      │  09:12 Claimed 971e8e18                             ║
║                      │  09:13 Branch: agent/971e8e18-20260206              ║
║                      │  09:15 Commit: feat: add toggle face buttons        ║
║                      │  09:18 Created PR #53                               ║
║                      │  09:18 Task → provisional                           ║
║                      │                                                     ║
║  ─────────────────────────────────────────────────────────────────────────  ║
║  [j/k] select  [p] pause/resume  [k] kill  [Enter] expand log             ║
║                                                                            ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  Scheduler: running · 6 agents · 3 idle · 0 running · 0 blocked           ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

When an agent is actively running:

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  OCTOPOID                                    [W]ork [P]Rs [I]nbox [A]gents ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                            ║
║  AGENTS              │  orch-impl-1                                        ║
║  ──────              │  ────────────                                       ║
║                      │                                                     ║
║    impl-agent-1  IDLE│  Role: orchestrator_impl                            ║
║    impl-agent-2  IDLE│  Status: RUNNING · 12m elapsed · 34/200 turns       ║
║  ▶ orch-impl-1   RUN│  Claimed: 06b44db0                                  ║
║    breakdown-1   IDLE│                                                     ║
║    inbox-poller  IDLE│  CURRENT TASK                                       ║
║    recycler      IDLE│  ────────────                                       ║
║                      │  06b44db0 Implement Gatekeeper Review System        ║
║                      │  Branch: agent/06b44db0-20260207                    ║
║                      │  Commits: 3 · +1689/-202 lines                      ║
║                      │  ██████████████░░░░░░ 34/200 turns                  ║
║                      │                                                     ║
║                      │  WORK LOG (live)                                    ║
║                      │  ────────                                           ║
║                      │  09:55 Claimed 06b44db0                             ║
║                      │  09:56 Created branch agent/06b44db0-20260207       ║
║                      │  10:01 Commit: feat: add rejection workflow         ║
║                      │  10:04 Commit: feat: add gatekeeper agent role      ║
║                      │  10:07 Commit: feat: implement review runners       ║
║                      │  10:07 Running tests... 177 passed                  ║
║                      │  10:08 Task → provisional                           ║
║                      │                                                     ║
║  ─────────────────────────────────────────────────────────────────────────  ║
║  [j/k] select  [p] pause/resume  [k] kill  [Enter] expand log             ║
║                                                                            ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  Scheduler: running · 6 agents · 1 running · 2 idle · 0 blocked           ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

Detail pane data sources:
- **Current task**: from `state.json` + DB task lookup
- **Recent work**: DB query for tasks previously claimed by this agent
- **Notes**: from `.orchestrator/shared/notes/<agent>/`
- **Work log**: from agent's log file, parsed for key events (claim, commit, PR, status change)

## Implementation Approach

### Phase 1: Structured report in Octopoid

Add `orchestrator/orchestrator/reports.py` with `get_project_report()`. This is a submodule change — good task for `orch-impl-1`.

### Phase 2: New dashboard

Rewrite `octopoid-dash.py` to consume the report and render the tabbed kanban UI. Still uses `curses` but with a completely different layout.

Key bindings:
- `W/P/I/A` or `1/2/3/4` — switch tabs
- `j/k` — navigate items
- `Enter` — expand/act on selected item
- `a` — approve (context-dependent)
- `r` — refresh
- `q` — quit

### Phase 3 (optional): Web dashboard

The structured report could also feed a simple web UI (e.g., served by a local Flask app). But the curses TUI is fine for now.

## What to keep from the current dashboard

- Agent status rendering (colors, progress bars) — move to Agents tab
- Auto-refresh on interval
- Demo mode for testing

## What to drop

- Scrollable log panel (use `tail -f` if needed)
- Statistics panel (success rates are nice but not actionable)
- Wide/medium/narrow adaptive layout (just pick one that works)

## Decision

Should this be:
1. **One task** for `orch-impl-1` — report + new dashboard together
2. **Two tasks** — report first (enables other consumers), dashboard second
3. **Something else** — e.g., just improve the existing dashboard incrementally
