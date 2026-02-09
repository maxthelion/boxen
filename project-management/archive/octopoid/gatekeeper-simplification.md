# Gatekeeper Simplification

**Status:** Draft
**Date:** 2026-02-07

## Problem

The current post-submission review system has three overlapping layers:

1. **Validator** — Scheduler-tick check for "did the agent actually do anything?" (burn-out detection, zero-commit rejection). Confusing name — sounds like a generic quality gate but is really agent health monitoring.
2. **Check runner** — Mechanical rebase+pytest automation. No LLM. Duplicates what a gatekeeper could do, but can't interpret results or give intelligent feedback.
3. **Gatekeepers** — LLM-based Claude agents that review work. The actual concept we want. Currently implemented but disabled.

These three things evolved separately and now overlap in confusing ways. `gk-testing-octopoid` ended up implemented as a check_runner check type (mechanical) when the design intent was always for it to be an LLM gatekeeper (intelligent).

## Desired Model

**At task creation, you specify which gatekeepers should review the work before the human sees it.** That's it.

```
Agent submits work → gatekeepers review → human reviews
```

```python
create_task(
    title="Fix the thing",
    role="implement",
    checks=["gk-testing-octopoid"],   # ← these are gatekeeper agents
)
```

Each gatekeeper is a Claude agent with a specific focus. It checks out the agent's work, does its review, and either passes or rejects with feedback. Only after all specified gatekeepers approve does the task appear in the human's review queue.

## What Changes

### Burn-out detection → scheduler pre-check

The "did the agent actually do anything?" logic stays, but it's not a "check" or a "validator" — it's a **scheduler-level pre-check** that runs before gatekeepers are even invoked.

```
Agent submits
    │
    ▼
Scheduler pre-check:
    0 commits + 80+ turns? → recycle to breakdown (burned out)
    0 commits + low turns?  → reject back to agent (didn't try)
    Has commits?            → proceed to gatekeeper review
    │
    ▼
Gatekeeper review (if checks specified)
    │
    ▼
Human review
```

This is mostly what the validator already does. We just stop calling it a "validator" and recognise it for what it is — the scheduler deciding whether the submission is worth reviewing at all.

### check_runner → removed

The check_runner role and `VALID_CHECK_TYPES` go away. If you want tests run and interpreted, that's what `gk-testing-octopoid` does — it's a gatekeeper agent whose specialty happens to be running tests. The difference is it can also *reason* about the results:

- "These 2 test failures are in files the agent didn't touch — pre-existing, not a blocker"
- "This test failure is directly caused by the agent's change to `queue_utils.py` line 45"
- "Tests pass, but the agent didn't add tests for the new feature — rejecting"

A mechanical check_runner can't do any of that.

### Gatekeepers become the only review layer

| Before (3 layers) | After (1 layer + pre-check) |
|---|---|
| Validator (scheduler tick, no LLM) | Scheduler pre-check (same logic, clearer name) |
| Check runner (mechanical, no LLM) | Removed — absorbed into gatekeepers |
| Gatekeepers (LLM, disabled) | **Gatekeepers (LLM, the only review layer)** |

## Gatekeeper Agent Design

### Definition (agents.yaml)

```yaml
agents:
  - name: gk-testing-octopoid
    role: gatekeeper
    focus: testing
    target_roles: [orchestrator_impl]  # which task roles this gatekeeper reviews
    interval_seconds: 120
    paused: false

  - name: gk-testing-app
    role: gatekeeper
    focus: testing
    target_roles: [implement]
    interval_seconds: 120
    paused: true  # future

  - name: gk-architecture
    role: gatekeeper
    focus: architecture
    target_roles: [implement, orchestrator_impl]
    interval_seconds: 300
    paused: true  # future
```

### What a gatekeeper does

Each gatekeeper is a Claude Code session that:

1. **Claims a task** from the provisional queue (only tasks with this gatekeeper in their `checks` list, where this gatekeeper hasn't already recorded a result)
2. **Checks out the work** — for orchestrator tasks, fetches the agent's submodule branch; for app tasks, checks out the PR branch
3. **Runs its review** — guided by its prompt file (`.orchestrator/prompts/gatekeeper-testing.md`, etc.)
4. **Records its result** via `record_check_result(task_id, gatekeeper_name, 'pass'|'fail', reasoning)`
5. **If rejecting**, the reasoning becomes feedback that the implementing agent sees on retry

### Auto-assignment

When `create_task()` is called, gatekeepers can be auto-assigned based on `target_roles`:

- Task with `role=orchestrator_impl` → automatically gets `checks=['gk-testing-octopoid']`
- Task with `role=implement` → automatically gets `checks=['gk-testing-app']` (when enabled)
- Additional gatekeepers can be added manually at creation time

### Rejection flow

```
Gatekeeper rejects (1st time)
    → task goes back to implementing agent with gatekeeper's feedback
    → agent retries, resubmits
    → gatekeeper reviews again

Gatekeeper rejects (3rd time)
    → escalated to human
    → human decides: fix it themselves, give better guidance, or close the task
```

This is the same `rejection_count` mechanism that exists today, just driven by gatekeepers instead of check_runner.

## Task Lifecycle (Simplified)

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
           │ PRE-CHECK  │  Scheduler: has commits? burned out?
           └──────┬─────┘
                  │ passes pre-check
                  ▼
           ┌────────────┐
           │ GATEKEEPER │  LLM gatekeepers review (if any specified)
           │   REVIEW   │  Each can reject → back to IN PROGRESS
           └──────┬─────┘
                  │ all gatekeepers approve (or no gatekeepers specified)
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

## Implementation Plan

### Phase 1: Enable gk-testing-octopoid as an LLM gatekeeper

This is the first concrete step. Get one gatekeeper working end-to-end.

1. **Refactor gk-testing-octopoid** from a check_runner check type to a proper gatekeeper agent
   - It still does rebase+pytest, but as a Claude session that can interpret results
   - Prompt: `.orchestrator/prompts/gatekeeper-testing-octopoid.md`
   - Records result with reasoning, not just pass/fail
2. **Wire up auto-assignment** — orchestrator_impl tasks automatically get `checks=['gk-testing-octopoid']`
3. **Test with a real task** — submit an orchestrator_impl task and verify the gatekeeper reviews it before it appears in human review

### Phase 2: Clean up the old layers

4. **Rename validator logic** — move burn-out/zero-commit detection into a clearly-named scheduler function (e.g., `_pre_check_submission()`) instead of the confusingly-named validator
5. **Remove check_runner role** — delete `VALID_CHECK_TYPES`, remove `pytest-submodule` as a check type
6. **Remove check_runner agent slot** from agents.yaml

### Phase 3: More gatekeepers (future)

7. **gk-testing-app** — same concept for app tasks (vitest instead of pytest)
8. **gk-architecture** — reviews code structure, not just tests
9. **gk-qa** — checks acceptance criteria are met

## Decisions

1. **Sequential gatekeepers.** If a task has multiple gatekeepers, they run one at a time. Avoids wasted work if an earlier one rejects.
2. **20-turn budget** per gatekeeper review session.
3. **Gatekeepers don't see each other's results.** Each reviews independently.
4. **Fix commit counting for orchestrator tasks.** Don't exempt them — actually check the submodule feature branch (`orch/<task-id>`) for commits. The exemption was a workaround for broken counting.
