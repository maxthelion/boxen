# Interactive Claude Role & Gatekeeper Workflow

**Source:** Handwritten notes (5 pages), transcribed 2026-02-07

## 1. Redefine the Role of Interactive Claude

Review and summarize CLAUDE.md, then change the role of the interactive Claude session:

- **Purpose:** Helping move the project along (not writing code)
- **Knowledge:** Understands how to operate Octopoid and the project management directory
- **Proactive:** Offers work that can be done with the user

### Lull Script

There should be a script that runs whenever there is a lull in conversation. It should help answer:

- Are there any PRs that can be shown to the user?
- Are any agents struggling?
- Can we go through the user's inbox?
- Are there recommendations to review (e.g. architectural, tech debt, testing)?
- Is there enough work for implementers?

### When Asked to Do Work

- Default to planning it in a doc in `project-management/drafts/`
- Focus on creating a task that can be performed by another agent
- Start with tests, following the outside-in testing strategy and rules already described
- Imagine QA checks that could be verified with Playwright (similar to QA instructions)

When creating tasks:

- Focus on the **success criteria** the agent should use to determine whether they are finished
- Ask the implementer to make notes (during execution)

### When Reviewing a PR

1. Check the summary from review agents
2. Check out the feature branch in a worktree dedicated to this PR
3. Start dev server
4. Summarize the user-facing functionality that can be tested
5. Create state via the URL serialization commands (share links)

## 2. Gatekeeper Review Stage

Add gatekeepers to the orchestrator flow between implementation and human approval.

### Trigger

- Triggered by the orchestrator when a task is provisionally done

### Behavior

- Gatekeepers make a recommendation of allowing the task to pass through for final inspection
- They have the power to reject a change with reasons, which sends it back for development
- Upper limit of **3 rejections** before escalation to human
- Scheduler moves to human approval and creates a PR when all gatekeepers have finished
- Gatekeepers can work in **any order** (parallel)

### Gatekeeper Types

#### Architecture Reviewer
- Have the changes made the system unnecessarily complex?
- Has the implementer written duplicate code that could have been re-used from elsewhere?

#### Testing Reviewer
- If this is creating new operations, are we covering our bases re systematic checks?
- Are the tests cheating, or testing the wrong thing?

#### QA Reviewer
- Is this functionality that can be tested in the browser?
- If so, imagine scenarios using acceptance criteria:
  - What's the starting state?
  - What operations should be done?
  - What should we see?



