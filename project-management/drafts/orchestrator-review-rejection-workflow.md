# Orchestrator: Review Rejection Workflow

**Source:** PR #48 review cycle (2026-02-06)

## Problem

When reviewing agent-produced PRs, there's no clean way to send a task back with feedback. Current workaround: create a new follow-up task on the same branch. This works but creates disconnected task history — two task IDs for one logical piece of work.

## Current State

| Status | Meaning |
|--------|---------|
| `incoming` | Awaiting claim |
| `claimed` | Agent working on it |
| `provisional` | PR created, awaiting human acceptance |
| `done` | Accepted |
| `failed` | Agent couldn't complete |
| `needs_continuation` | Agent ran out of turns, uncommitted work |

Missing: **`rejected`** — "PR reviewed, changes requested, send back to agent."

## Approach: Hybrid (GitHub-aware + filesystem fallback)

Two ways feedback enters the system — both produce the same result (a rejected task with actionable notes for the agent).

### Trigger 1: GitHub PR review state (automatic)

The scheduler already creates PRs via `gh pr create`, so GitHub is not a new dependency. Extend this:

1. Scheduler polls provisional tasks' PRs on each tick (or on a slower interval, e.g., every 5 minutes)
2. If a PR has **"Changes Requested"** review status → auto-transition task to `rejected`
3. Pull review comments via `gh api repos/{owner}/{repo}/pulls/{N}/reviews` and `gh api repos/{owner}/{repo}/pulls/{N}/comments`
4. Format comments into the task's `## Review Feedback` section
5. Line-specific comments include file path and line number for agent context

This lets humans review PRs the normal way (GitHub UI) and the orchestrator picks it up automatically.

### Trigger 2: `/reject-task` command (manual)

For cases where the reviewer wants to give structured, agent-optimized instructions without using the GitHub UI:

```bash
/reject-task <task-id> "Fix fork snap, dedup mouse handler, dedup SVG rendering"
```

Writes feedback directly to the task file and transitions to `rejected`. Useful for:
- Offline development
- Distilling scattered PR comments into clear action items
- Adding context the agent needs but that doesn't belong on the PR

### What the agent sees

Either way, the agent's prompt includes a `## Review Feedback` section when picking up a rejected task:

```markdown
## Review Feedback (rejection #1)

### From GitHub PR review (2026-02-06T16:30:00Z)

**src/components/SketchView2D.tsx:1709** (BLOCKING)
Fork start uses raw svgPos instead of snapResult. Should snap like polygon/rect/circle.

**src/components/SketchView2D.tsx:1826** (suggestion)
Snap computation is duplicated 3 times in handleMouseMove. Compute once at the top.

### From /reject-task command
Fix the 3 issues from code review. Do NOT create a new PR — push to existing branch.
```

## Trade-offs Considered

### Why not GitHub-only?

- Couples orchestrator to GitHub for a core workflow (currently filesystem + SQLite only)
- Rate limits on `gh api` with many tasks polling
- Offline development breaks
- Reviewer may want to give structured instructions that don't fit PR comment format
- Agent has to interpret freeform review comments — risk of misunderstanding vague feedback

### Why not filesystem-only?

- Disconnected from the actual PR — reviewer writes feedback twice
- Misses line-specific context that PR reviews provide naturally
- Custom workflow that nobody else uses

### Why hybrid works

- GitHub review is the **trigger** and **content source** — orchestrator reads but doesn't write
- Filesystem is the **storage** and **fallback** — always works, structured format
- `/reject-task` serves as a "distill and clarify" step when GitHub comments are scattered or ambiguous
- No new external dependencies — `gh` CLI is already used for PR creation

## Handling ambiguous feedback

Risk: reviewer leaves 5 comments, 2 nits and 3 blocking. Agent needs to distinguish.

Mitigations:
- GitHub review comment severity is already available (COMMENT vs REQUEST_CHANGES)
- Convention: prefix blocking comments with `BLOCKING:` for clarity
- Agent prompt instruction: "Focus on changes marked as blocking. Address suggestions if time permits."
- After N rejections (e.g., 3), escalate to human via `.orchestrator/messages/` rather than looping

## DB Changes

- Add `rejected` as valid queue value
- Add `rejection_count` INTEGER column (default 0)
- Add `pr_number` INTEGER column (if not already tracked — needed for GitHub polling)

Review feedback stored in the task markdown file under `## Review Feedback`, not in the DB. This keeps the content human-readable and version-controlled.

## Scheduler Changes

- **PR polling**: on each tick (or slower interval), check provisional tasks' PRs for "Changes Requested" state
- **Rejection handling**: rejected tasks get priority over incoming (fix before starting new work)
- **Agent prompt**: include `## Review Feedback` section when assigning rejected tasks
- **Escalation**: after 3 rejections, post to `.orchestrator/messages/` for human attention
- **Branch reuse**: agent checks out existing branch, no new worktree needed

## Task lifecycle with rejections

```
incoming → claimed → provisional → rejected → claimed → provisional → done
                                      ↑                      |
                                      └──────────────────────-┘
                                       (can cycle N times)
```

## Implementation Order

1. **Add `rejected` queue + `rejection_count` to DB** — schema migration
2. **`reject_task()` in queue_utils** — filesystem trigger path
3. **`/reject-task` slash command** — human-facing interface
4. **Scheduler picks up rejected tasks** — priority over incoming, includes feedback in prompt
5. **PR state polling** — GitHub trigger path (can ship independently)
6. **Escalation after N rejections** — safety valve

Steps 1-4 are the MVP (filesystem-only). Step 5 adds GitHub awareness. Step 6 is polish.

## Complexity

Medium. Main changes:
- `queue_utils.py`: add `reject_task()`, update `claim_task()` to prioritize rejected
- `scheduler.py`: PR polling loop, rejected queue handling
- Implementer role prompt: read and act on `## Review Feedback`
- New script/command for manual rejection
- DB migration for new columns
