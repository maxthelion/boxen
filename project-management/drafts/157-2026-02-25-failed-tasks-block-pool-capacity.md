# Failed Tasks Retaining claimed_by Blocks Agent Pool Capacity

**Status:** Idea
**Captured:** 2026-02-25

## Raw

> Failed tasks still had `claimed_by=implementer` with expired leases — the scheduler's lease recovery wasn't clearing these, so the pool capacity (1/1) was permanently exhausted. This is a recurring pattern.

## Idea

When a task moves to the `failed` queue, it retains its `claimed_by` field. The scheduler's `guard_pool_capacity` check counts all tasks with `claimed_by=<agent>` regardless of queue. This means failed tasks with stale claims permanently consume pool capacity, preventing the agent from picking up new work.

On 2026-02-25, 4 failed tasks all had `claimed_by=implementer` with expired leases from hours/days ago. The implementer pool capacity is 1, so the agent was permanently blocked from claiming any incoming tasks. Manual intervention was needed to clear the claims.

## Incidents

| Task | Queue | Claimed By | Lease Expired |
|------|-------|------------|---------------|
| e663c1de | failed | implementer | 2026-02-24T00:29 |
| 450ce847 | failed | implementer | expired |
| bfd3e2af | failed | implementer | expired |
| 4457b5df | failed | implementer | expired |

All four were blocking the pool simultaneously.

## Root Cause

The lease recovery code (`check_and_requeue_expired_leases` in scheduler.py) handles `claimed` and `provisional` queues but does NOT clear `claimed_by` when a task transitions to `failed`. The `fail_task()` function moves the task to the failed queue but preserves the claim metadata.

## Proposed Fix

One or both of:

### Option A: Clear claimed_by on fail

When `fail_task()` moves a task to the `failed` queue, also clear `claimed_by` and `lease_expires_at`. The task is no longer being worked on — there's no reason to retain the claim.

```python
def fail_task(task_id, error=None):
    sdk._request('PATCH', f'/api/v1/tasks/{task_id}', json={
        'queue': 'failed',
        'claimed_by': '',
        'lease_expires_at': '',
        'error': error,
    })
```

### Option B: Exclude failed queue from capacity check

Modify `guard_pool_capacity` to only count tasks in `claimed` and `provisional` queues, not `failed`:

```python
def guard_pool_capacity(agent):
    active = [t for t in all_tasks
              if t.claimed_by == agent.name
              and t.queue in ('claimed', 'provisional')]
    return len(active) < agent.pool_capacity
```

### Recommendation

Do both. Option A fixes the data at source. Option B adds defense-in-depth so the pool can't be blocked even if metadata cleanup is missed.

## Also Related

- Draft #145: Lease recovery provisional bug (similar theme — stale lease metadata)
- The scheduler's `check_and_requeue_expired_leases` should also sweep the `failed` queue for stale claims as a safety net

## Open Questions

- Should `claimed_by` on failed tasks be preserved for audit/debugging purposes? (Could copy to a separate field like `last_claimed_by` before clearing)
- Are there other queue transitions that should clear claim metadata?
