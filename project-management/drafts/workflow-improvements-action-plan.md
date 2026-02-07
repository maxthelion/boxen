# Action Plan: Workflow Improvements

**Goal:** Implement the changes described in [interactive-claude-and-gatekeeper-workflow.md](interactive-claude-and-gatekeeper-workflow.md).

## Actions

### A. Update CLAUDE.md Role Definition

Update CLAUDE.md to reframe the interactive Claude session as a **project manager**, not a coder.

Key changes:
- Add a section defining the interactive role: move the project along, don't write code directly
- When asked to do work, default to creating a plan in `project-management/drafts/` and enqueuing it for an agent
- Tasks should emphasize success criteria and ask the implementer to make notes
- Start with tests (outside-in), imagine Playwright QA checks

**Depends on:** Nothing
**Who:** Interactive session (us)

---

### B. Create a "Lull Script"

A script (or slash command) that runs during idle moments and surfaces actionable items:

- PRs ready for human review
- Struggling agents (high turn count, no commits)
- Inbox items to triage
- Recommendations to review (architectural notes, tech debt, testing gaps)
- Whether implementers have enough queued work

This is similar to `/orchestrator-status` but oriented toward "what should we do next?" rather than raw system state. Could be a new slash command (`/whats-next` or similar) that calls `.orchestrator/scripts/status.py` and post-processes the output.

**Depends on:** Nothing
**Who:** Interactive session (us) to design; could be an agent task for the script itself

---

### C. Enhance PR Review Workflow

The `/preview-pr` command already exists and handles checkout + dev server. The [visual-pr-review-command.md](visual-pr-review-command.md) draft proposes a `/review-pr` that adds visual verification. Combine these with the notes:

1. Check review agent summaries (architecture, testing, QA -- see action D)
2. Check out branch in review worktree
3. Start dev server
4. Summarize user-facing functionality that can be tested
5. Create state via share link serialization commands
6. Walk through scenarios with user

This is mostly a prompt refinement of the existing `/preview-pr` command plus the `/review-pr` proposal.

**Depends on:** D (gatekeepers produce the summaries this step reads)
**Who:** Interactive session (us)

---

### D. Implement Gatekeeper Review Stage

This is the largest piece. Add automated reviewer agents that run when a task reaches `provisional`.

#### D1. Implement rejection workflow (prerequisite)

The [orchestrator-review-rejection-workflow.md](orchestrator-review-rejection-workflow.md) draft already has a full design. Implement that first:

- Add `rejected` queue status + `rejection_count` to DB
- `reject_task()` in queue_utils
- Scheduler picks up rejected tasks with priority
- 3-rejection escalation limit

**Who:** Agent task

#### D2. Add gatekeeper agent role

New agent role in the orchestrator that:
- Is triggered when a task moves to `provisional`
- Runs three reviewers (can be parallel): architecture, testing, QA
- Each produces a pass/fail recommendation with reasons
- If any fail: auto-reject the task (feeding reasons back via the rejection workflow from D1)
- If all pass: task proceeds to human approval + PR

Gatekeeper prompts to define:

| Reviewer | Key Questions |
|----------|--------------|
| **Architecture** | Unnecessary complexity? Duplicate code that could be reused? |
| **Testing** | Systematic checks covered for new operations? Tests cheating or testing the wrong thing? |
| **QA** | Can this be tested in browser? If so: what starting state, what operations, what should we see? |

**Depends on:** D1
**Who:** Agent task (orchestrator changes)

---

### E. Update Task Creation Templates

Update the breakdown/task-creation prompts to emphasize:

- Success criteria the implementing agent should use to know when they're done
- Ask the implementer to make notes during execution (for future debugging/postmortems)

Check current breakdown prompts and agent instructions for where to add this.

**Depends on:** Nothing
**Who:** Interactive session (us) -- small prompt edits

---

## Suggested Order

1. **A** (CLAUDE.md update) -- quick, sets the tone for everything else
2. **E** (task creation templates) -- quick, improves all future tasks
3. **B** (lull script) -- medium, immediately useful
4. **D1** (rejection workflow) -- agent task, prerequisite for gatekeepers
5. **D2** (gatekeeper agents) -- agent task, the main deliverable
6. **C** (PR review enhancement) -- depends on D, refines existing commands
