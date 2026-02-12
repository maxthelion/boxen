# Octopoid Roadmap

**Status:** Living Document
**Last Updated:** 2026-02-08

What's built, what's next, and where we're headed — framed against the [Octopoid philosophy](https://github.com/maxthelion/octopoid/blob/main/philosophy.md).

---

## Philosophy Scorecard

How well the current system delivers on each goal:

| Goal | Status | Gap |
|------|--------|-----|
| **More gets done concurrently** | Working | Multiple agents run in parallel, pull from shared queue |
| **Work is pull-based** | Working | Agents claim tasks when idle; backpressure prevents overload |
| **Specialised agents** | Partial | Implementers and orch-impl active; proposers and gatekeepers mostly paused |
| **Suggestions made ahead of time** | Partial | Inbox-poller triages; other proposers paused; no curator selecting from pool |
| **Wasted work doesn't accumulate** | Partial | Backpressure + recycler work; but no quality gate catches bad code before merge |
| **Quality maintained** | Weak | Self-merge runs tests for orch tasks; app tasks have no automated quality check |
| **Interactive agent delegates** | Working | PM session plans and enqueues; doesn't write code |
| **Big projects sequenced** | Working | Projects, breakdowns, dependencies all functional (breakdown reliability shaky) |
| **Ideas get organised** | Partial | Drafts exist; proposals fragmented across directories; no unified recommendation pool |

The biggest gaps are **quality gates** (gatekeepers disabled) and **idea organisation** (proposals/recommendations not consolidated).

### Where the Delta Actually Is

Most of the philosophy is already built as infrastructure — the delta is less "build new things" and more "turn things on and fix reliability."

**Fix reliability (1 item):** The breakdown agent has never succeeded autonomously (0/3). This blocks the entire "big projects get sequenced" promise. Everything downstream — proposers surfacing work, breakdown decomposing it, agents executing it — depends on this pipeline flowing end-to-end.

**Turn things on (3 items):** The rebaser, gatekeeper, and proposer agents all exist as working code with tests. They're paused because they were built before the supporting infrastructure was ready. The infrastructure is now ready (checks system, review rejection, backpressure). Deploying them is configuration, not construction.

**Consolidate (1 item):** Proposer output is fragmented across `.orchestrator/shared/proposals/`, `project-management/agent-recommendations/`, and `project-management/classified/`. Until this is a single pool with backpressure, turning on proposers will just create more mess. The recommendation consolidation is the prerequisite for the "ideas get organised" goal.

**Genuinely unbuilt (2 items):** Agent messaging and auditor agents. These are real new features that need design and implementation. They're medium-term, not blockers. (The dashboard is built and operational — only action handlers remain unwired.)

---

## What's Working

The core loop is operational:

```
Human creates task → agent claims → agent implements → self-merge or PR → done
```

Specifically:
- **Task queue** with priorities, dependencies, and blocking
- **Implementer agents** producing PRs for app work
- **Orchestrator specialist** committing to the submodule with self-merge on test pass
- **Breakdown agent** decomposing complex tasks into subtasks (reliability issues — see below)
- **Recycler** detecting burned-out tasks (0 commits + 80 turns) and sending them for re-breakdown
- **Rebaser** automatically rebasing stale app branches (implemented, not yet deployed as agent)
- **Pre-check** rejecting empty submissions, escalating after repeated failures
- **Project system** grouping related tasks with shared branches and dependencies
- **Review rejection** (`/reject-task`) sending work back with feedback, escalating after 3 rejections
- **Interactive PM session** with 30+ slash commands for managing the system

## Known Issues

| Issue | Impact | Notes |
|-------|--------|-------|
| Breakdown agent unreliable | 0/3 automated breakdowns succeeded | Timeout issues; `fail_task()` bloating task files is fixed but untested at scale |
| LLM gatekeepers disabled | No automated code quality review | Mechanical check_runner removed; gatekeeper agents exist but are paused |
| Rebaser not deployed | Stale branches flagged but not auto-rebased | Role code exists (30 tests pass), needs agent slot in agents.yaml |
| Turn counting is coarse | `turns_used` = max allocation, not actual | No visibility into real resource consumption |
| Proposers mostly paused | System doesn't surface opportunities proactively | Only inbox-poller active; architect, test-checker, backlog-groomer all paused |

---

## Near-Term (Ready to Do)

These close the most visible gaps in the philosophy.

### Deploy rebaser agent
Add `rebaser` to agents.yaml. The role code and tests exist. Just needs a config entry and testing in production.
**Philosophy:** reduces wasted work (stale branches cause merge conflicts and re-work).

### Fix breakdown agent reliability
The truncation fix (32fd6460) landed. Need to verify breakdowns work end-to-end with a real task. Consider reducing exploration budget if timeouts persist.
**Philosophy:** "big projects get scheduled and sequenced properly" requires reliable breakdown.

### Enable LLM gatekeeper for orchestrator tasks
`gk-testing-octopoid` exists but runs mechanically. Converting it to a Claude session that can interpret test results and give intelligent feedback would close the quality gap. See archived `gatekeeper-simplification.md` for the full design.
**Philosophy:** "quality is maintained, not sacrificed" — the biggest gap right now.

---

## Medium-Term (Needs Design)

### Dashboard action handlers
The dashboard (`octopoid-dash.py`) is built and operational — four tabs, kanban layout, keyboard nav, agent detail. Three gaps remain: action handlers (Enter/a/r/d/p/k hints shown but not wired to perform operations), work log in agent detail view, and agent pause/kill from the dashboard. See [`dashboard-redesign.md`](dashboard-redesign.md) for the original design.
**Philosophy:** visibility into the whole system — essential for the human to "stay at the level of intent."

### Agent turn budgeting
Real turn counting (via hooks), periodic "are you done?" nudges, and estimation for right-sized allocations. See [`agent-turn-budgeting.md`](agent-turn-budgeting.md).
**Philosophy:** "wasted work doesn't accumulate" — prevents agents from over-polishing or scope-creeping.

### Agent messaging system
Threaded, addressable messages between agents and humans. Replaces ad-hoc inbox files with structured communication. See [`agent-messaging-system.md`](agent-messaging-system.md).
**Philosophy:** enables the feedback loop between human intent and agent execution.

### Recommendation consolidation
Unified pool for agent recommendations (architecture, testing, backlog) with DB backing, backpressure, and lifecycle tracking. See [`recommendation-consolidation.md`](recommendation-consolidation.md).
**Philosophy:** "your ideas get organised" + "suggestions made ahead of time" — the missing piece for proposer agents to be useful.

### Enable proposer agents
Unpause architect, test-checker, backlog-groomer. Depends on recommendation consolidation to avoid flooding.
**Philosophy:** "specialised agents tackle different facets" — currently only implementers and inbox-poller are active.

---

## Longer-Term (Exploratory)

### Explorer/auditor agents
Random sampling agents that continuously maintain quality — auditing docs, tests, code, and drafts for staleness. See [`explorer-auditor-agents.md`](explorer-auditor-agents.md).
**Philosophy:** "some things just need to happen regularly."

### LLM gatekeepers for app tasks
Extend gatekeeper review to app PRs: vitest, architecture review, QA checks. Depends on getting orchestrator gatekeeper working first.
**Philosophy:** "PRs go through gatekeepers that check for bugs, test coverage, and style."

### Dashboard improvements
Staging URLs on task cards, richer task detail views, rejection history. TASK-80e957b6 covers staging URL.

---

## Dependency Map

```
Deploy rebaser ─────────────────────────── (standalone)

Fix breakdown reliability ──────────────── (standalone)

Enable LLM gatekeeper (orch) ───────────── (standalone)
    └── LLM gatekeeper (app) ───────────── (depends on orch gatekeeper working)

Agent turn budgeting ───────────────────── (standalone)

Recommendation consolidation ───────────── (standalone)
    └── Enable proposers ───────────────── (depends on consolidated pool)
        └── Explorer/auditor agents ────── (outputs go to recommendation pool)

Messaging system ───────────────────────── (standalone, but benefits recommendations)

Dashboard action handlers ──────────────── (standalone, dashboard itself is built)
```
