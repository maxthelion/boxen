# Octopoid Operating Notes

Decisions, learnings, and operational notes from running Octopoid on the Boxen project.

## Agent Decisions

### Recycler agent: yes. Breakdown agent in scheduler: not yet. (2026-02-05)

**Context:** Tasks that burn through all turns without committing need to be detected and re-broken-down. The question was whether to add a full breakdown agent to the scheduler (polling the breakdown queue automatically) or handle it differently.

**Decision:** Create a dedicated `recycler` agent that:
- Polls the `provisional` queue for burned-out tasks (0 commits, max turns)
- Builds rich re-breakdown context (project state, completed siblings, feature branch diff)
- Creates new breakdown tasks in the breakdown queue

The main breakdown agent is NOT added to the scheduler yet. Breakdowns are still triggered manually (via `/decompose-task` or direct invocation). Reasons:
- Breakdowns need human review before approval — automating the trigger is fine, but auto-approving breakdowns is not
- The recycler is a narrow, well-defined job (detect → build context → create task). The breakdown agent does codebase exploration which is harder to get right unattended
- Keeping them separate means we can tune the recycler's polling and heuristics independently

The flow is: `recycler detects burned task` → `creates re-breakdown task in queue` → `human triggers breakdown agent or runs it manually` → `human reviews and approves breakdown` → `new subtasks enter incoming`

## Failure Patterns

### "Burned out" tasks (2026-02-05)

**Pattern:** Agent uses all 50 turns, produces 0 commits. Task lands in `provisional` with `COMMITS_COUNT: 0, TURNS_USED: 50`.

**Root cause:** Task scope too large for a single 50-turn session. Often the last task in a project chain (e.g., "verify tests pass and add edge cases") which combines verification + debugging + new work.

**Fix:** Recycle to re-breakdown with project context. See `project-management/drafts/task-recycling-re-breakdown.md`.

**Prevention:** Breakdown agent should be more conservative with final "verify everything" tasks — split verification and new test writing into separate tasks.

### Two-tier detection (2026-02-05)

Don't waste compute on blind alleys. Two catch points:
- **Immediate:** 0 commits + 40+ turns on first attempt → recycle, don't retry
- **Cumulative:** 3+ attempts regardless of commits → recycle (replaces existing escalate-to-planning for project tasks)

### Re-breakdown caps at one level (2026-02-05)

If a subtask from a re-breakdown also burns out, escalate to human. Don't recurse — it means the work needs human judgement to scope correctly.

### Scheduler creates worktrees on feature branches for breakdown (2026-02-05)

Agent turns are expensive. When the scheduler spawns a breakdown agent, it peeks at the task's BRANCH field and creates the worktree on that branch. The agent starts already on the right branch instead of wasting turns on git fetch/checkout.
