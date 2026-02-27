# /fast-task - Create Fast-Track Task

Shortcut for `/enqueue` with `flow=fast` (the default). Sanity check only, auto-merges.

## Usage

```
/fast-task "Fix typo in panel labels"
```

## When to Use

Use `/fast-task` for:
- Small, low-risk changes (typos, config tweaks, simple bug fixes)
- Pure refactors with no behavioral change
- Tooling, infrastructure, and build changes
- Engine internals with no visual impact

Use `/enqueue` with `qa` flow for anything user-visible (UI, geometry, rendering).

## Flow Comparison

| Step | `fast` (default) | `qa` |
|------|------------------|------|
| Implementation | Yes | Yes |
| Push + Tests + PR | Yes | Yes |
| Sanity check | Yes | Yes |
| Visual QA | No | **Yes** |
| Human approval | No | **Yes** |
| Auto-merge | **Yes** | No (human merges) |

## Implementation

```python
from octopoid.tasks import create_task

create_task(
    title="Fix typo in panel labels",
    role="implement",
    priority="P2",
    context="...",
    acceptance_criteria=["..."],
    flow="fast",
)
```

## Interactive Mode

When run without arguments, ask for:

1. **Title** - Brief, descriptive title
2. **Priority** - How urgent (default P2)
3. **Context** - Background and motivation
4. **Acceptance Criteria** - Specific requirements

Role is always `implement` for fast tasks.

## After Creation

The task will be:
1. Claimed by an implementer on next scheduler tick
2. After implementation: push, test, create PR
3. Sanity checker reviews automatically
4. If passes: **auto-merged**
5. If fails: returned to incoming for another attempt

Check status with `/queue-status`.
