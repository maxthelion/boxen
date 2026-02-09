# Task Lifecycle — Canonical Reference

**Purpose:** Single source of truth for how tasks flow through Octopoid. For humans and agents.

**Destination:** `project-management/drafts/task-lifecycle.md` (once approved)

---

## Overview

```
             ┌─────────┐
  Human ───→ │ QUEUED  │ ◄─── Breakdown agent
             └────┬────┘
                  │ scheduler claims for matching agent
                  ▼
           ┌────────────┐
           │ IN PROGRESS │  LLM agent works (implementer / orch-impl)
           └──────┬─────┘
                  │ agent calls submit_for_review()
                  ▼
           ┌────────────┐
           │   CHECKS   │  Automated: validator + check_runner + gatekeepers
           └──────┬─────┘
                  │ all checks pass
                  ▼
           ┌────────────┐
           │  IN REVIEW  │  Human inspects
           └──────┬─────┘
                  │ human approves
                  ▼
             ┌────────┐
             │  DONE  │
             └────────┘
```

Each stage has specific rejection/recycling paths described below.

---

## 1. QUEUED (DB queue: `incoming`)

**Who creates tasks:**
- Human via `/enqueue` or `create_task()`
- Breakdown agent (decomposing a recycled task)

**Fields set at creation:**
- `role` — determines which agent can claim (`implement`, `orchestrator_impl`, `breakdown`, `check_runner`)
- `priority` — P0/P1/P2
- `branch` — base branch for worktree (`main` for all tasks)
- `checks` — list of automated checks to run after submission (e.g. `['pytest-submodule']`)
- `blocked_by` — comma-separated task IDs that must complete first

**Blocked tasks** stay in `incoming` but are invisible to the scheduler until all blockers are in `done`. The recycler periodically reconciles stale blockers (blocker already done but task not unblocked).

**Key functions:** `create_task()`, `reconcile_stale_blockers()`

---

## 2. IN PROGRESS (DB queue: `claimed`)

**What happens:** Scheduler finds the highest-priority unblocked task matching an idle agent's role. Creates a worktree, launches Claude Code.

**Agent types:**
| Role | Agent | What it does |
|------|-------|-------------|
| `implement` | impl-agent-1/2 | App code on feature branch in main repo |
| `orchestrator_impl` | orch-impl-1 | Orchestrator code, commits to `orch/<task-id>` branches in submodule |
| `breakdown` | breakdown agents | Decomposes tasks into subtasks (no code) |

**Turn limits:**
- Implementer: 100 turns
- Breakdown exploration: 50 turns
- Decomposition: 10 turns

**How it ends:** Agent calls `submit_for_review()` which moves task to `provisional` queue and records `commits_count` and `turns_used`.

**Key functions:** `claim_task()`, `submit_for_review()`

---

## 3. CHECKS (DB queue: `provisional`, checks pending)

This is where automated quality gates run. A task enters CHECKS immediately after submission. Three systems process it, roughly in order:

### 3a. Validator (lightweight, no LLM)

Runs every scheduler tick. Checks:

| Condition | Action |
|-----------|--------|
| Has commits → | Skip (leave for check_runner / human) |
| 0 commits + high turns → | **Burned out** — recycle to breakdown |
| 0 commits + many attempts → | **Recycle** or escalate to planning |
| 0 commits (first attempt) → | **Reject** back to incoming (`reject_completion`) |

"Burned out" heuristic: 0 commits + 80+ turns (threshold varies by role). Orchestrator tasks are exempt from the commit check because they commit to the submodule.

**Rejection path:** `reject_completion()` increments `attempt_count`, moves task back to `incoming`. Agent gets the same task again with feedback.

**Recycling path:** `recycle_to_breakdown()` creates a new breakdown task. Original task stays in provisional until the breakdown subtasks replace it. Depth cap: max 1 re-breakdown, then accept for human review.

### 3b. Check Runner (mechanical checks, no LLM)

Runs registered checks from the task's `checks` field. Currently supports:

| Check | What it does |
|-------|-------------|
| `pytest-submodule` | Cherry-picks agent commits into review worktree submodule, runs `pytest tests/ -v` |

For each check: `record_check_result(task_id, check_name, 'pass'|'fail', summary)`

**After all checks complete:**
- Any failures → `review_reject_task()` with aggregated feedback. Task goes back to `incoming` for the agent to fix.
- All pass → task stays in `provisional` but now shows in IN REVIEW on dashboard.

**Rejection path:** `review_reject_task()` increments `rejection_count` (distinct from `attempt_count`). After 3 rejections → escalates to `escalated` queue for human attention.

### 3c. LLM Gatekeepers (in progress — being built)

`gk-testing-octopoid` — For `orchestrator_impl` tasks:
1. Finds agent's commits in the submodule
2. Rebases onto current `origin/main`
3. Runs pytest on rebased code
4. Records result via `record_check_result()`

`gk-testing-app` — For app tasks (future):
1. Rebases feature branch onto current `main`
2. Runs vitest
3. Records result

These run as separate agent roles, not inside check_runner.

**Key functions:** `record_check_result()`, `review_reject_task()`, `are_checks_passed()`

---

## 4. IN REVIEW (DB queue: `provisional`, all checks passed)

**Who reviews:** Human, using the interactive session.

**Review steps:**
1. Check submodule commits (orchestrator tasks) or PR diff (app tasks)
2. Run tests in review worktree (`.orchestrator/agents/review-worktree/`)
3. Check for divergence from base branch
4. Visual verification if applicable (dev server on port 5176)

**Outcomes:**

| Decision | Action | Function |
|----------|--------|----------|
| Approve | Merge PR (app) or push submodule (orch), move to done | `accept_completion()` or approval script |
| Reject | Send back with feedback for agent to fix | `review_reject_task()` |

**Approval:**
- App tasks: `gh pr merge` + `accept_completion()`
- Orchestrator tasks: `.orchestrator/scripts/approve_orchestrator_task.py <task-id>` (pushes submodule → updates ref on main → accepts in DB)

**Rejection:** `review_reject_task()` appends `## Review Feedback` to task file, increments `rejection_count`, moves to `incoming`. Agent re-claims and sees the feedback. After 3 rejections → `escalated`.

**Key functions:** `accept_completion()`, `review_reject_task()`

---

## 5. DONE (DB queue: `done`)

Task is complete. `accept_completion()` also:
- Calls `_unblock_dependent_tasks()` — clears `blocked_by` on any task waiting for this one
- Calls `_rewire_dependencies()` for project tasks — points dependents at leaf subtasks
- Checks for project completion

---

## Rejection/Recycling Summary

There are **three distinct rejection counters**:

| Counter | Incremented by | Meaning |
|---------|---------------|---------|
| `attempt_count` | `reject_completion()` (validator) | Agent submitted with 0 commits |
| `rejection_count` | `review_reject_task()` (check_runner / human) | Code didn't pass checks or review |
| (burn-out) | `is_burned_out()` heuristic | 0 commits + 80+ turns = task too big |

**Rejection flows:**

```
                    ┌──────────────────────────────────────┐
                    │                                      │
  PROVISIONAL ──→ validator: 0 commits? ──→ reject_completion() ──→ INCOMING (retry)
       │                                          │
       │            burned out? ──→ recycle_to_breakdown() ──→ new BREAKDOWN task
       │                                          │
       │            too many attempts? ──→ escalate_to_planning() ──→ PLANNING
       │
       ├──→ check_runner: tests fail? ──→ review_reject_task() ──→ INCOMING (retry)
       │                                          │
       │            3+ rejections? ──→ ESCALATED (human attention)
       │
       └──→ human review: not right? ──→ review_reject_task() ──→ INCOMING (retry)
                                                  │
                    3+ rejections? ──→ ESCALATED (human attention)
```

---

## Special: Orchestrator Tasks

Orchestrator tasks (`role=orchestrator_impl`) differ from app tasks:

| Aspect | App tasks | Orchestrator tasks |
|--------|-----------|-------------------|
| Code location | Feature branch in main repo | `orch/<task-id>` branches in `orchestrator/` submodule, merged to `main` |
| PR | Yes, in main repo | No PR — direct submodule commits |
| Commit counting | Main repo commits | Always 0 in main repo (exempt from burn-out) |
| Approval | `gh pr merge` + `accept_completion()` | `approve_orchestrator_task.py` |
| Testing | vitest in review worktree | pytest in review worktree submodule |
| Check type | (future: `gk-testing-app`) | `pytest-submodule`, `gk-testing-octopoid` |

---

## Dashboard Columns

The TUI dashboard (`octopoid-dash.py`) maps DB state to columns:

| Column | DB state |
|--------|----------|
| QUEUED | `incoming` (unblocked) |
| IN PROGRESS | `claimed` |
| CHECKS | `provisional` with pending checks |
| IN REVIEW | `provisional` with all checks passed (or no checks) |
