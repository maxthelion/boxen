# Human Inbox

Show pending items that need your attention and discuss/approve them.

## Usage

```
/human-inbox [item]
```

- No argument: List all outbox items with summaries, then ask which to discuss
- With argument: Go directly to discussion mode for that item
  - Number (1, 2) → select by position
  - Partial match (1906) → find file containing that string
  - Full filename → use directly

## Instructions

### List Mode (no argument)

1. List files in `project-management/human-inbox/` (excluding .gitkeep)
2. For each file, show:
   - Position number
   - Filename
   - Type (detected from filename pattern)
   - Brief summary (first few lines)
3. Check for conflicts (multiple proposals covering same items)
4. Ask: "Which item would you like to discuss? (Enter number or filename)"

### Discussion Mode (with argument or after selection)

1. Read and display the full proposal content
2. Show summary of what's being proposed
3. Present options:

```
## Options

1. **Approve** - Execute the proposal as written
2. **Approve with changes** - Specify modifications before executing
3. **Reject items** - Remove specific items from this proposal
4. **Ask questions** - I'll answer questions about the proposal
5. **Edit proposal** - Rewrite specific sections
6. **Discard** - Delete without processing
```

## Item Types & Approval Actions

Detect type from filename pattern and handle approval differently:

### `*-inbox-triage.md` - Inbox Triage Proposals
**From:** inbox-poller agent
**Purpose:** Categorize and file inbox items

**On Approve:**
- Create summary files in `project-management/classified/` as specified
- Archive original inbox files to `project-management/processed/`
- Move proposal to `processed/`

---

### `*-implementation-proposal.md` - Implementation Plans
**From:** architect agent
**Purpose:** Proposed approach for implementing a feature

**On Approve:**
- Move plan to `docs/` with appropriate name
- Update `docs/plan_index.md` with status "approved"
- Optionally create tasks in the task queue
- Move proposal to `processed/`

---

### `*-test-proposal.md` - Test Plans
**From:** tester agent
**Purpose:** Proposed test coverage for a feature

**On Approve:**
- Move plan to `docs/` or keep inline if small
- Create test implementation tasks if requested
- Move proposal to `processed/`

---

### `*-refactor-proposal.md` - Refactoring Plans
**From:** architect agent
**Purpose:** Proposed code restructuring

**On Approve:**
- Move plan to `docs/`
- Update `docs/plan_index.md`
- Create refactoring tasks if requested
- Move proposal to `processed/`

---

### `*-question.md` - Questions from Agents
**From:** any agent
**Purpose:** Agent needs user input to proceed

**On Approve (Answer):**
- Record the answer in the question file
- Move to `processed/`
- If the question was blocking a task, that task can now proceed

---

### `*-decision.md` - Architecture/Design Decisions
**From:** architect agent
**Purpose:** Document a significant technical decision

**On Approve:**
- Move to `docs/decisions/` (create dir if needed)
- Update any related plans
- Move proposal to `processed/`

---

### Other files
**From:** various agents
**Purpose:** General messages or requests

**On Approve:**
- Ask user where to file it
- Move proposal to `processed/`

## Proposal Format

Agents should create proposals with this structure:

```markdown
# [Type]: [Title]

**Created:** [timestamp]
**From Agent:** [agent-name]
**Related To:** [feature/task/issue if applicable]

## Summary

[1-3 sentence overview]

## Proposal

[Detailed content]

## Questions for User (if any)

[Specific questions that need answers]

## Requested Actions

[What the agent wants to happen if approved]
```

## Handling User Response

**If "Approve":**
- Execute type-specific approval actions (see above)
- Report what was done

**If "Approve with changes":**
- Ask what changes they want
- Show the modified plan
- Confirm before executing

**If "Reject items":**
- Ask which items to reject
- Update the proposal
- Ask if they want to approve the remaining items

**If "Ask questions":**
- Answer based on the proposal content
- Read related files if needed for context
- After answering, return to options menu

**If "Edit proposal":**
- Ask what section to edit
- Make the changes
- Save updated proposal back to outbox
- Show the updated version

**If "Discard":**
- Confirm with user
- Delete the proposal file from outbox
- Do NOT process any items

## Example Session

```
User: /human-inbox

Claude: ## Outbox (3 items)

| # | Filename | Type | Summary |
|---|----------|------|---------|
| 1 | 2026-02-03-inbox-triage.md | Triage | 3 items → 5 features |
| 2 | 2026-02-03-snapping-implementation-proposal.md | Implementation | Snapping system for 2D view |
| 3 | 2026-02-03-fillet-question.md | Question | From: tester - "Should fillets work on sub-assembly panels?" |

Which item would you like to discuss?

User: 2

Claude: ## Reviewing: 2026-02-03-snapping-implementation-proposal.md

**Type:** Implementation Proposal
**From:** architect
**Related To:** 2D View Snapping feature

### Summary
Proposes a 3-phase implementation of the snapping system...

[Full proposal content]

### Options
1. Approve - Move to docs/, add to plan index
2. Approve with changes
3. Ask questions
4. Edit proposal
5. Discard

What would you like to do?
```
