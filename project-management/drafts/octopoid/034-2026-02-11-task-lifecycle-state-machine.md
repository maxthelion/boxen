# Task Lifecycle State Machine

**Status:** Idea
**Captured:** 2026-02-11

## Raw

> "use a state machine in octopoid. Make everything more predictable. Especially the end of task lifecycle"

## Idea

Replace the current implicit task lifecycle with an explicit state machine. Make every transition named, validated, and auditable. This would make the end-of-task flow—particularly the dance between provisional, self-merge, push failures, and acceptance—predictable and debuggable.

## Context

The current task lifecycle is a mix of:
- File movements between queue directories (incoming → claimed → provisional/done/failed)
- DB `queue` column updates
- Agent-driven transitions (submit_completion, accept_completion, fail_task)
- Scheduler-driven transitions (claiming tasks)
- Review-driven transitions (approve, reject, recycle)

Transitions happen in multiple places without a clear contract. The result:
- **Hard to debug**: "How did this task get here?" requires reading code, not state
- **Easy to get stuck**: Tasks in provisional with unclear next steps
- **Implicit rules**: Self-merge succeeds → accept. Push fails → submit. No commits + high turns → recycle.
- **No audit trail**: You know the task moved, but not why or when exactly

The end-of-task lifecycle is especially fraught:
- orchestrator_impl tries self-merge → may succeed locally but fail on push
- On push failure, falls back to submit_completion → provisional
- Human reviews → may approve or reject
- On rejection → back to incoming, or if rejected 3x → escalated
- If burned out → recycled to breakdown

Each branch point has implicit logic. A state machine would make all of this explicit.

## What a State Machine Would Look Like

### States (superset of current queues)

```
CREATED         — task exists, not yet queued
INCOMING        — ready to be claimed
CLAIMED         — agent is working on it
SUBMITTED       — agent finished, awaiting human review
SELF_MERGED     — orchestrator_impl auto-approved
APPROVED        — human approved
REJECTED        — sent back for rework
RECYCLED        — too many turns, needs breakdown
ESCALATED       — too many rejections, needs human attention
FAILED          — agent crashed or task impossible
DONE            — fully complete
```

### Transitions (with explicit triggers)

```
scheduler.claim(task)          : INCOMING → CLAIMED
agent.submit_completion()      : CLAIMED → SUBMITTED
agent.accept_completion()      : CLAIMED → SELF_MERGED (if self-merge enabled)
agent.fail_task()              : CLAIMED → FAILED
human.approve_task()           : SUBMITTED → APPROVED
human.reject_task()            : SUBMITTED → REJECTED (or ESCALATED if count >= 3)
scheduler.recycle_task()       : CLAIMED → RECYCLED (if burned out)
scheduler.finalize()           : APPROVED | SELF_MERGED → DONE
scheduler.retry()              : FAILED | REJECTED | RECYCLED → INCOMING
```

Each transition is a function that:
1. Validates current state
2. Performs side effects (move file, git operations, notifications)
3. Updates DB state + transition log
4. Returns success or error

### Benefits

1. **Explicit validation**: Can't approve a task that's not in SUBMITTED
2. **Clear flow**: Look at the state, know what comes next
3. **Audit trail**: Every transition logged with timestamp and trigger
4. **Easier to debug**: "Why is this task in RECYCLED?" → check transition log
5. **Testable**: Mock transitions, verify state changes
6. **Self-documenting**: The allowed transitions ARE the lifecycle docs

### Implementation Sketch

```python
class TaskState(Enum):
    CREATED = "created"
    INCOMING = "incoming"
    CLAIMED = "claimed"
    SUBMITTED = "submitted"
    SELF_MERGED = "self_merged"
    APPROVED = "approved"
    REJECTED = "rejected"
    RECYCLED = "recycled"
    ESCALATED = "escalated"
    FAILED = "failed"
    DONE = "done"

class TaskStateMachine:
    def __init__(self, task_id):
        self.task = db.get_task(task_id)
        self.state = TaskState(self.task['queue'])

    def transition(self, to_state: TaskState, *, trigger: str, metadata: dict = None):
        """Execute a state transition with validation and audit trail."""
        if to_state not in self._allowed_transitions[self.state]:
            raise InvalidTransition(f"Cannot go from {self.state} to {to_state}")

        # Log transition
        log_transition(self.task['id'], self.state, to_state, trigger, metadata)

        # Update DB
        db.update_task_state(self.task['id'], to_state.value, metadata)

        # Side effects (file moves, notifications, etc.)
        self._handle_side_effects(self.state, to_state, metadata)

        self.state = to_state

    _allowed_transitions = {
        TaskState.INCOMING: {TaskState.CLAIMED},
        TaskState.CLAIMED: {TaskState.SUBMITTED, TaskState.SELF_MERGED, TaskState.FAILED, TaskState.RECYCLED},
        TaskState.SUBMITTED: {TaskState.APPROVED, TaskState.REJECTED, TaskState.ESCALATED},
        TaskState.SELF_MERGED: {TaskState.DONE},
        TaskState.APPROVED: {TaskState.DONE},
        TaskState.REJECTED: {TaskState.INCOMING},
        TaskState.RECYCLED: {TaskState.INCOMING},  # after breakdown
        TaskState.ESCALATED: {TaskState.INCOMING},  # after human intervention
        TaskState.FAILED: {TaskState.INCOMING},
        # DONE is terminal
    }
```

## Open Questions

- How to handle the transition from current system to state machine? (Big-bang rewrite or gradual migration?)
- Should state live in `queue` column or new `state` column?
- What granularity for states? (Too many = complexity, too few = lose expressiveness)
- Should transitions be synchronous or async? (E.g., APPROVED → DONE requires git merge)
- How to handle multi-step transitions (e.g., self-merge involves rebase, pytest, push, accept)?
- Should the state machine be enforced at the DB level (triggers) or application level?

## Possible Next Steps

- Enumerate all current task transitions (code audit)
- Map them to proposed states
- Identify gaps where implicit logic needs to become explicit
- Design transition log schema
- Prototype the state machine for one flow (e.g., incoming → claimed → submitted → approved → done)
- Measure complexity: would this actually simplify or just formalize existing mess?
