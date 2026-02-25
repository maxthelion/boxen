# Octopoid Tasks Leaking Into Boxen Pool

**Status:** Idea
**Captured:** 2026-02-25

## Raw

> You shouldn't be able to see octopoid tasks running. Nor should they count towards claimed for this project.

## Idea

Octopoid-scoped tasks (SDK client tests, TASK-prefix cleanup, etc.) are visible in the Boxen queue status and are being claimed by the same implementer agent pool. This means:

1. `/queue-status` in the Boxen PM session shows octopoid tasks in claimed/incoming/done
2. Octopoid tasks consume implementer pool capacity (`max_instances: 2`), blocking Boxen tasks from being claimed
3. The scheduler treats all tasks as one flat pool regardless of project scope

## Impact

With `max_instances: 2` and two octopoid tasks claimed, Boxen's P1 tasks (InteractionManager fix, sub-assembly push-pull) sit in incoming waiting for a slot — even though the octopoid work is unrelated.

## Expected Behaviour

- Boxen queue status should only show Boxen-scoped tasks
- Octopoid queue status should only show octopoid-scoped tasks
- Pool capacity should be per-scope (or at minimum, octopoid tasks shouldn't count against Boxen capacity)
- The `scope` field on tasks should be used for filtering in both the scheduler's capacity check and the SDK's list queries

## Investigation

- Tasks have a `scope` field (boxen vs octopoid) — is the scheduler using it for capacity checks?
- Is `guard_pool_capacity` filtering by scope, or counting all claimed tasks globally?
- Is `sdk.tasks.list()` filtering by scope, or returning everything?
- Are the agent configs per-scope or global?

## Possible Fixes

1. **Scheduler:** `guard_pool_capacity` should only count tasks matching the current orchestrator's scope
2. **SDK:** `tasks.list(queue=X)` should filter by scope by default
3. **Agent config:** Consider separate agent pools per scope, or a shared pool with per-scope capacity limits
