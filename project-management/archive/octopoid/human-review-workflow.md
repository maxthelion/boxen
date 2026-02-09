# Human Review Workflow

**Source:** Discussion during task validation model Phase 2 planning (2026-02-07)

## Context

The task validation model (Phase 1 done, Phase 2 in flight) covers automated checks before human review. But it doesn't cover what happens *after* the human looks at the work. Three gaps identified:

## Gap 1: `/reject-task` command for human use

`review_reject_task()` exists in queue_utils.py and handles:
- Appending `## Review Feedback` to the task file
- Moving task back to incoming with `rejection_count` incremented
- `claim_task()` already prioritizes tasks with `rejection_count > 0`
- Escalation after 3 rejections

But there's no human-facing command. The interactive session needs a `/reject-task <task-id> "feedback"` slash command that calls this function. Small piece of work.

## Gap 2: Accept-partial for project tasks

Two different rejection patterns depending on context:

**Standalone tasks** (no project): Human rejects with feedback → agent fixes on same branch → re-review. The `/reject-task` flow handles this.

**Project tasks**: The work might be partially correct but missing things. Rather than reject and explain the gaps, it's often easier to:
1. Accept the task as done (partial credit)
2. Create new tasks in the same project covering the gaps

This "accept and create follow-ups" pattern isn't formalised. Questions:
- Should there be an `/accept-partial <task-id>` command that accepts + prompts for follow-up task creation?
- Or is the existing `/approve-task` + manual `/enqueue` sufficient?
- Should the project track that some tasks were accepted-partial vs fully accepted?

## Gap 3: End-to-end pipeline formalisation

The full pipeline from task completion to resolution:

```
Agent finishes → provisional
    │
    Has checks? ──No──→ IN REVIEW (human)
    │
    Yes
    │
    Gatekeeper runs checks
    │
    ├── Pass → IN REVIEW (human)
    └── Fail → reject to agent with output

Human reviews (IN REVIEW)
    │
    ├── Approve → approval script → done
    │
    ├── Reject standalone → /reject-task with feedback → incoming
    │                        (agent gets branch + feedback, fixes, re-submits)
    │
    └── Accept partial (project) → done + create follow-up tasks
```

This pipeline exists in pieces but isn't documented as a coherent flow. The dashboard should reflect it — currently CHECKS and IN REVIEW columns exist but the human decision outcomes aren't visible.

### Open questions

- Should rejected tasks appear in their own column, or go back to QUEUED?
- How does the agent know it's picking up a rejected task vs a fresh one? (Currently: `rejection_count > 0` and `## Review Feedback` in the file)
- Should the dashboard show rejection history on task cards?
- For project tasks, should we track a "coverage" metric (what % of the project's intent has been delivered)?
