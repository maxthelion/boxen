# [TASK-pr-review-coordinator] Implement PR Review Coordinator

ROLE: implement
PRIORITY: P1
BRANCH: main
CREATED: 2026-02-03T23:20:00Z
CREATED_BY: human

## Context

Currently when an implementer creates a PR, nothing triggers a review. We need a coordinator that watches for new/unreviewed PRs and creates review tasks.

## Requirements

### New Role: `pr_coordinator`

Create a new role in `orchestrator/orchestrator/roles/pr_coordinator.py` that:

1. **Polls for open PRs** that need review
2. **Creates review tasks** in the queue for each unreviewed PR
3. **Tracks which PRs have been queued** to avoid duplicates

### Detection Logic

A PR needs review if:
- State is `open`
- No review task exists in `incoming/`, `claimed/`, or `done/` queues for that PR
- PR was created by an agent (branch starts with `agent/`)

Use `gh pr list --json number,headRefName,title,createdAt --state open` to get PRs.

### Task Creation

For each unreviewed PR, create a task file:
```
.orchestrator/shared/queue/incoming/TASK-review-pr{N}.md
```

With content:
```markdown
# [TASK-review-pr{N}] Review PR #{N}: {title}

ROLE: review
PRIORITY: P1
BRANCH: main
CREATED: {timestamp}
CREATED_BY: pr_coordinator

## Context

Review the implementation in PR #{N}.

PR: https://github.com/{owner}/{repo}/pull/{N}
Branch: {branch}

## Instructions

1. Use `gh pr diff {N}` to see the changes
2. Review for code quality, correctness, and test coverage
3. Use `gh pr review {N}` to approve or request changes
```

### Duplicate Prevention

Check existing tasks before creating:
```python
def pr_has_review_task(pr_number: int) -> bool:
    """Check if a review task exists for this PR."""
    pattern = f"TASK-review-pr{pr_number}.md"
    for queue in ["incoming", "claimed", "done"]:
        queue_dir = get_queue_subdir(queue)
        if (queue_dir / pattern).exists():
            return True
    return False
```

### Agent Configuration

Add to `agents.yaml`:
```yaml
- name: pr-coordinator
  role: pr_coordinator
  interval_seconds: 120  # Check every 2 minutes
  pre_check: "gh pr list --state open --json number --jq 'length'"
  pre_check_trigger: non_empty
```

## Acceptance Criteria

- [ ] New role `pr_coordinator` in `orchestrator/orchestrator/roles/`
- [ ] Detects open PRs from agent branches
- [ ] Creates review tasks for unreviewed PRs
- [ ] Doesn't create duplicate tasks
- [ ] Configured in agents.yaml (paused by default)
- [ ] Logs actions clearly

## Files to Create/Modify

- `orchestrator/orchestrator/roles/pr_coordinator.py` (new)
- `orchestrator/orchestrator/roles/__init__.py` (add export)
- `.orchestrator/agents.yaml` (add agent config)

CLAIMED_BY: impl-agent-2
CLAIMED_AT: 2026-02-04T06:19:20.641520

COMPLETED_AT: 2026-02-04T06:22:55.690105

## Result
PR created: https://github.com/maxthelion/boxen/pull/4

COMPLETED_AT: 2026-02-04T06:49:11.261908

## Result
PR created: https://github.com/maxthelion/boxen/pull/4
