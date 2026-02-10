# /enqueue - Create New Task

Create a new task in the orchestrator queue.

## Usage

Run `/enqueue` to interactively create a task, or provide details:

```
/enqueue "Add rate limiting to API"
```

## Check for Duplicates

Before creating anything, scan existing tasks for duplicates:

1. Run the status script or list tasks in `incoming/`, `claimed/`, and `provisional/` queues
2. Compare the proposed title and description against existing task titles
3. If a duplicate or near-duplicate exists:
   - Tell the user which task already covers this work (show task ID and title)
   - Ask whether to: proceed anyway, or skip creation
   - Do **not** create a task until the user confirms

This prevents the same task being enqueued twice, which wastes agent turns.

## Interactive Mode

When run without arguments, I'll ask for:

1. **Title** - Brief, descriptive title
2. **Role** - Who should handle this:
   - `implement` - Code changes
   - `test` - Testing tasks
   - `review` - Code review
   - `breakdown` - Task decomposition
   - `orchestrator_impl` - Orchestrator infrastructure changes
3. **Priority** - How urgent (defaults to P1):
   - `P0` - Critical (security, broken builds)
   - `P1` - High (important features)
   - `P2` - Normal (improvements)
4. **Branch** - Base branch (usually `main`)
5. **Context** - Background and motivation
6. **Acceptance Criteria** - Specific requirements (checklist format)

## Creating the Task

Use the canonical task creation script:

```bash
orchestrator/venv/bin/python orchestrator/scripts/create_task.py \
  --title "Your task title" \
  --role "implement" \
  --priority "P1" \
  --branch "main" \
  --context "Background and context for the task" \
  --acceptance-criteria "- [ ] First criterion
- [ ] Second criterion
- [ ] Third criterion"
```

**Required arguments:**
- `--title` - Task title
- `--role` - Target role (implement, test, review, breakdown, orchestrator_impl)
- `--branch` - Base branch
- `--context` - Context description
- `--acceptance-criteria` - Newline-separated checklist

**Optional arguments:**
- `--priority` - P0, P1, or P2 (default: P1)
- `--created-by` - Who created the task (default: human)
- `--blocked-by` - Comma-separated task IDs that block this task
- `--project-id` - Parent project ID
- `--checks` - Comma-separated gatekeeper check names

**Output:** The script prints the task ID (e.g., `TASK-abc12345`) on success.

## Example

```bash
orchestrator/venv/bin/python orchestrator/scripts/create_task.py \
  --title "Add rate limiting to API" \
  --role "implement" \
  --priority "P1" \
  --branch "main" \
  --context "Our API endpoints have no rate limiting, making them vulnerable to abuse and DoS attacks. We need to add rate limiting to protect the service." \
  --acceptance-criteria "- [ ] Rate limiting middleware added to all API routes
- [ ] Default limit: 100 requests per minute per IP
- [ ] Returns 429 Too Many Requests when exceeded
- [ ] Rate limit headers included in responses
- [ ] Configuration via environment variables"
```

## After Creation

The task will be:
1. Picked up by the scheduler on next tick
2. Claimed by an agent with matching role
3. Worked on and moved to done/failed

Check status with `/queue-status`.
