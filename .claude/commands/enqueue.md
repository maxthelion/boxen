# /enqueue - Create New Task

Create a new task in the orchestrator queue.

## Usage

Run `/enqueue` to interactively create a task, or provide details:

```
/enqueue "Add rate limiting to API"
```

## Interactive Mode

When run without arguments, I'll ask for:

1. **Title** - Brief, descriptive title
2. **Role** - Who should handle this:
   - `implement` - Code changes
   - `test` - Testing tasks
   - `review` - Code review
3. **Priority** - How urgent:
   - `P0` - Critical (security, broken builds)
   - `P1` - High (important features)
   - `P2` - Normal (default)
   - `P3` - Low (nice-to-have)
4. **Context** - Background and motivation
5. **Acceptance Criteria** - Specific requirements

## Flow Selection

Two flows are available. Default is `fast`. Prompt the user to use `qa` when appropriate.

| Flow | Pipeline | Use when |
|------|----------|----------|
| `fast` | implement → sanity check → auto-merge | Default. Refactors, bug fixes, internal changes, non-visual work |
| `qa` | implement → sanity check → visual QA → human review → merge | UI features, geometry changes, rendering fixes, anything user-visible |

**Prompt the user to use `qa` flow when the task involves:**
- Changes to components (React, SVG, 3D rendering)
- Geometry modifications (panel outlines, finger joints, slots, extensions)
- New or modified operations visible in the 2D/3D editors
- Bug fixes that affect visual output
- Any change where "does it look right?" matters

## Implementation

Use `create_task()` from `orchestrator.tasks` to create tasks. This function writes the task file to `.octopoid/tasks/` **and** registers it on the server in one step:

```python
from octopoid.tasks import create_task

create_task(
    title="Add rate limiting to API",
    role="implement",
    priority="P1",
    context="Our API endpoints have no rate limiting...",
    acceptance_criteria=[
        "Rate limiting middleware added to all API routes",
        "Default limit: 100 requests per minute per IP",
        "Returns 429 Too Many Requests when exceeded",
    ],
    flow="fast",  # or "qa" for visual/UI tasks
    # branch is optional — defaults to repo.base_branch from config
)
```

Do **not** write task files manually or place them in any queue directory. Always use `create_task()`.

## Task File Location

Tasks are written to:
```
.octopoid/tasks/TASK-{uuid}.md
```

## After Creation

The task will be:
1. Registered on the server and visible in the queue immediately
2. Claimed by an agent with matching role on next scheduler tick
3. Worked on and moved through the flow's pipeline

Check status with `/queue-status`.
