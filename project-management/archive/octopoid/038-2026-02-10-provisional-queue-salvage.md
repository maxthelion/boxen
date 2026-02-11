---
**Processed:** 2026-02-10
**Mode:** human-guided
**Actions taken:**
- Completed full salvage operation (2026-02-10 evening)
- Pushed 9 orchestrator branches to origin (8 clean + 1 mixed)
- Merged 7 branches to orchestrator main (822/828 tests passing)
- Approved 12 tasks: e7e4147a, 8e85c0bf, fad87bf8, b7847ff9, 96b5252a, 0cf2ee0d, 095d29a4, 45d05555, 001cdbe2, 831d0d3f, e8f7282c, 5f9e6dfc
- Rejected 1 task: 4e0c2092 (incomplete work, sent back to incoming)
- Created audit: project-management/provisional-queue-audit-2026-02-10.md
**Outstanding items:** None - salvage complete
---

# Provisional Queue Salvage Operation

**Status:** Draft
**Created:** 2026-02-10
**Priority:** P0 - Blocking all forward progress
**Prerequisite for:** 037-ephemeral-worktrees.md

## Problem Statement

The provisional queue is clogged with tasks that have real commits in unexpected places. Due to persistent worktree reuse (see 037-ephemeral-worktrees.md), commits ended up on the wrong branches and agents can't self-merge.

**Current state:**
- Multiple tasks in provisional with `commits_count=0` in DB
- But commits actually exist on different branches in agent worktrees
- Some tasks have partial work (claimed "already done" but only some criteria met)
- Some tasks have complete work but on the wrong branch
- Self-merge can't proceed (requires commits > 0)
- Manual review is blocked (can't find the commits)

**Impact:**
- Can't schedule new work (provisional is full)
- Can't implement ephemeral worktrees until we clean up current state
- Risk of losing valuable work if we just delete provisional tasks
- Agents continue to claim work and add to the pile

**Example cases:**
- TASK-e7e4147a: Claims commit da72634, but it's on branch `orch/a95da6a1` not `orch/e7e4147a`
- TASK-a95da6a1: Self-merged with "0 commits" but has commit da72634 on its branch
- TASK-5f9e6dfc: 62 turns, 0 commits (may have done real work we can't find)
- TASK-fad87bf8: 65 turns, 0 commits (same issue)

## Root Cause

Persistent agent worktrees (`.orchestrator/agents/<agent>/worktree/`) accumulate state from multiple tasks:
1. Agent works on Task A → commits to `orch/task-a`
2. Task A completes, worktree NOT deleted
3. Agent works on Task B → worktree still has `orch/task-a` branch
4. Agent accidentally commits to `orch/task-a` instead of `orch/task-b`
5. Or agent sees commits from Task A and thinks "already done"
6. Task B submits with 0 commits (DB tracks wrong branch)
7. Commits exist but are orphaned on wrong branch

## Scope

This is a **one-time salvage operation** to clean up the current mess before implementing ephemeral worktrees.

**In scope:**
- Audit all tasks in provisional queue
- Find commits that actually exist (even if on wrong branch)
- Salvage valuable work (merge to main)
- Reject incomplete work (send back to incoming or fail)
- Document what we found (for postmortem)

**Out of scope:**
- Fixing the root cause (that's 037-ephemeral-worktrees.md)
- Preventing future occurrences (also 037)
- Cleaning up other queues (focus on provisional)

## Approach

### Phase 1: Inventory

Collect data on every task in provisional:
- Task ID, title, role, acceptance criteria
- DB data: commits_count, turns_used, claimed_at, submitted_at
- Agent notes: what did the agent claim to accomplish?
- Git branches: what branches exist in agent worktrees?
- Commits: what commits exist on each branch (even if wrong branch)?

**Output:** Spreadsheet/table with full inventory.

### Phase 2: Commit Hunt

For each task with `commits_count=0`, search for commits in:
1. **Agent worktree branches:** Check all branches in `.orchestrator/agents/<agent>/worktree/`
2. **Origin branches:** Check `origin/orch/<task-id>` and adjacent branches
3. **Main repo commits:** Check if commits went to main repo instead of submodule
4. **Git reflog:** Check reflog for lost commits
5. **Agent commit logs:** Check `.orchestrator/agents/<agent>/commits.log`

**Search heuristics:**
- Commit messages mentioning task ID
- Commits by author "Max Williams" in date range (claimed_at → submitted_at)
- File paths matching task scope (e.g., `orchestrator/` for orchestrator_impl tasks)
- Commits on branches with similar names (e.g., `orch/aaa` when expecting `orch/bbb`)

**Output:** For each task, list of commits found with:
- Commit hash
- Branch where found
- Files changed
- Match confidence (high/medium/low)

### Phase 3: Categorization

Classify each task into one of these buckets:

**A. Complete work on wrong branch**
- Commits exist and satisfy all acceptance criteria
- Just on the wrong branch due to worktree confusion
- **Action:** Cherry-pick or merge to main

**B. Partial work on wrong branch**
- Commits exist but don't satisfy all acceptance criteria
- **Action:** Reject with feedback, reference the orphaned commits

**C. No work found**
- No commits found anywhere
- Agent claimed "already done" falsely
- **Action:** Reject or send back to incoming

**D. Work in main repo (should be submodule)**
- Orchestrator task committed to main repo instead of submodule
- **Action:** Depends on what was changed (tooling files OK, orchestrator code bad)

**E. Legitimate provisional (rare)**
- Self-merge failed for valid reason (conflicts, test failures)
- Commits exist on correct branch
- **Action:** Manual review as intended

**Output:** Categorized list with proposed action for each task.

### Phase 4: Salvage Plan

For each category, define salvage procedure:

#### Category A: Complete Work on Wrong Branch

```bash
# Example: Task e7e4147a, complete work on branch orch/a95da6a1

# 1. Verify commits satisfy acceptance criteria
git log orch/a95da6a1 --oneline
git show <commits>

# 2. Cherry-pick to main (in review worktree)
cd .orchestrator/agents/review-worktree
git checkout main
git pull origin main
git cherry-pick <commit1> <commit2>

# 3. Run tests
cd orchestrator && ./venv/bin/python -m pytest tests/ -v

# 4. Push to main
git push origin main

# 5. Update task in DB
accept_completion(task_id, accepted_by='manual-salvage')

# 6. Document in task notes
echo "Salvaged from branch orch/a95da6a1, commits <list>" >> .orchestrator/shared/notes/TASK-<id>.md
```

#### Category B: Partial Work

```bash
# Example: Task with some commits but incomplete

# 1. Review commits
git log orch/<task-id> --oneline

# 2. Reject with detailed feedback
review_reject_task(
    task_path,
    feedback="Partial work found on branch orch/<id>: <commit list>. Still missing: <criteria>. Reference these commits when completing the work.",
    rejected_by="manual-salvage"
)

# 3. Task goes back to incoming
```

#### Category C: No Work Found

```bash
# Agent claimed done but no commits anywhere

# Option 1: Fail task (if tried and failed)
fail_task(task_id, reason="No commits found. Agent claimed work already done but evidence shows otherwise. False positive from worktree pollution.")

# Option 2: Reset to incoming (if worth retrying)
reset_task(task_id)  # New utility from 036
```

#### Category D: Wrong Repo

```bash
# Orchestrator task committed to main repo

# If tooling files (.claude/commands/, scripts/):
#   - Review and merge if good
#   - This is actually OK (tooling changes)

# If orchestrator code (orchestrator/):
#   - This should never happen
#   - Reject, ask agent to redo in submodule
```

### Phase 5: Execution

Work through categorized list systematically:
1. Start with Category A (complete work, easy wins)
2. Move to Category B (partial work, need rejection feedback)
3. Handle Category C (no work, fail or reset)
4. Handle Category D case-by-case
5. Verify Category E (should be rare, normal provisional flow)

**Safety:**
- Work in review worktree for all cherry-picks/merges
- Run full test suite before pushing to main
- Keep audit log of all actions taken
- Don't delete anything (tasks, branches, commits) until verified

### Phase 6: Documentation

Create postmortem document:
- What we found (inventory summary)
- How commits got on wrong branches (worktree reuse patterns)
- What we salvaged (list of merged work)
- What we lost (if any)
- Lessons learned
- Prevention (link to 037-ephemeral-worktrees.md)

## Detailed Inventory Procedure

### Script 1: List Provisional Tasks

```bash
.orchestrator/venv/bin/python -c "
import sys; sys.path.insert(0, 'orchestrator')
from orchestrator.db import list_tasks
import json

tasks = list_tasks('provisional')
for task in tasks:
    print(json.dumps({
        'id': task['id'],
        'title': task.get('title', 'NO TITLE'),
        'role': task.get('role', '?'),
        'commits': task.get('commits_count') or 0,
        'turns': task.get('turns_used') or 0,
        'claimed_at': task.get('claimed_at'),
        'submitted_at': task.get('submitted_at'),
        'claimed_by': task.get('claimed_by')
    }))
" > provisional_inventory.jsonl
```

### Script 2: Find Commits for Task

```bash
# For each task, search for commits

find_commits_for_task() {
    local task_id=$1

    echo "=== Task $task_id ===" >&2

    # 1. Check expected branch in all agent worktrees
    for worktree in .orchestrator/agents/*/worktree; do
        if [[ -d "$worktree" ]]; then
            cd "$worktree"
            if git show-ref --verify --quiet refs/heads/orch/$task_id; then
                echo "Found branch orch/$task_id in $worktree" >&2
                git log --oneline orch/$task_id -10
            fi
            cd - > /dev/null
        fi
    done

    # 2. Check origin
    git ls-remote origin "orch/$task_id" | grep -q . && {
        echo "Found on origin: orch/$task_id" >&2
        git log --oneline origin/orch/$task_id -10
    }

    # 3. Check all branches in agent worktrees for commits mentioning task_id
    for worktree in .orchestrator/agents/*/worktree; do
        if [[ -d "$worktree" ]]; then
            cd "$worktree"
            git log --all --oneline --grep="$task_id" -10
            cd - > /dev/null
        fi
    done
}

# Run for each task
jq -r '.id' provisional_inventory.jsonl | while read task_id; do
    find_commits_for_task "$task_id" > "commits_$task_id.txt"
done
```

### Script 3: Check Acceptance Criteria

For each task, read the task file and check if commits satisfy criteria:

```bash
check_acceptance_criteria() {
    local task_id=$1
    local task_file=$(find .orchestrator/shared/queue -name "TASK-$task_id.md")

    if [[ -z "$task_file" ]]; then
        echo "Task file not found for $task_id"
        return 1
    fi

    echo "=== Acceptance Criteria for $task_id ==="
    # Extract acceptance criteria section
    sed -n '/## Acceptance Criteria/,/^##/p' "$task_file" | grep -E '^\s*-\s*\['

    # TODO: Check if commits address these criteria
    # This requires human review
}
```

## Execution Checklist

### Preparation
- [ ] Pause scheduler (prevent new tasks from entering provisional)
- [ ] Create working branch for salvage scripts
- [ ] Set up audit log file (`salvage_audit.log`)

### Inventory
- [ ] Run Script 1: List all provisional tasks
- [ ] Run Script 2: Find commits for each task
- [ ] Run Script 3: Extract acceptance criteria
- [ ] Create spreadsheet with all data

### Categorization
- [ ] Review each task manually
- [ ] Categorize into A/B/C/D/E
- [ ] Assign confidence level (high/medium/low)
- [ ] Get user approval on categorization

### Salvage (Category A)
- [ ] For each Category A task:
  - [ ] Verify commits satisfy acceptance criteria
  - [ ] Cherry-pick to main in review worktree
  - [ ] Run tests
  - [ ] Push to main
  - [ ] Accept task in DB
  - [ ] Log action in audit log

### Reject (Category B & C)
- [ ] For each Category B task:
  - [ ] Write detailed rejection feedback (reference orphan commits)
  - [ ] Reject task (goes to incoming)
  - [ ] Log action

- [ ] For each Category C task:
  - [ ] Verify no commits found anywhere
  - [ ] Fail task (or reset to incoming if worth retry)
  - [ ] Log action

### Verify
- [ ] Check provisional queue is empty (or only Category E)
- [ ] Check main tests still pass
- [ ] Review audit log for any missed tasks
- [ ] Resume scheduler

### Document
- [ ] Create postmortem in `project-management/postmortems/`
- [ ] Update 037-ephemeral-worktrees.md with "Prerequisite: 038 complete"
- [ ] Commit all salvage documentation

## Risk Mitigation

### Risk 1: Merging Bad Code

**Mitigation:**
- Always run full test suite in review worktree before pushing
- Review diffs carefully (not just commit messages)
- If in doubt, reject instead of merge

### Risk 2: Losing Valuable Work

**Mitigation:**
- Don't delete any branches until salvage complete
- Archive agent worktrees before cleanup: `tar czf agents-backup-2026-02-10.tar.gz .orchestrator/agents/`
- Keep audit log of all actions

### Risk 3: Breaking Main

**Mitigation:**
- All merges go through review worktree + tests
- Can revert any commit if needed
- Main branch is protected (only ff-merges)

### Risk 4: Missing Commits

**Mitigation:**
- Multi-pronged search (agent worktrees, origin, reflog)
- Check multiple date ranges
- Ask user to review "no commits found" cases

## Success Criteria

- [ ] Provisional queue contains only legitimate reviews (or is empty)
- [ ] All valuable work salvaged and merged to main
- [ ] All incomplete work rejected with clear feedback
- [ ] Audit log documents all actions taken
- [ ] Postmortem written
- [ ] Main branch tests pass
- [ ] No orphaned commits left on wrong branches
- [ ] Ready to implement 037-ephemeral-worktrees.md

## Estimated Effort

- **Inventory:** 2-4 hours (scripting + running)
- **Categorization:** 4-6 hours (manual review of each task)
- **Salvage execution:** 4-8 hours (depends on how many Category A tasks)
- **Documentation:** 2 hours (postmortem)

**Total:** ~12-20 hours of focused work, ideally done in 1-2 day sprint.

## Tools Needed

### New Utility Functions

```python
# orchestrator/orchestrator/queue_utils.py

def find_commits_for_task(task_id):
    """Search for commits related to a task across all branches and worktrees"""
    # Check agent worktrees
    # Check origin branches
    # Check git log for commit messages mentioning task_id
    # Return list of (commit_hash, branch, files_changed)
    pass

def salvage_task_from_branch(task_id, branch_name, commit_hashes):
    """Cherry-pick commits from wrong branch and accept task"""
    # Cherry-pick in review worktree
    # Run tests
    # Push to main
    # Update DB
    # Log to audit
    pass
```

### Salvage Dashboard

Simple web page or script output showing:
- Total tasks in provisional
- Categorization breakdown (A/B/C/D/E counts)
- Progress: salvaged / rejected / remaining
- Audit log tail

## Dependencies

**Blocks:**
- 037-ephemeral-worktrees.md (can't implement until provisional is clean)
- All new orchestrator work (provisional queue full)

**Requires:**
- Review worktree (exists)
- Manual time from user (categorization decisions)
- Scheduler paused during execution

## Open Questions

1. **Should we pause all agents or just stop accepting new tasks?**
   - Leaning toward: pause scheduler entirely during salvage

2. **What to do with commits that fix tests for OTHER tasks?**
   - Example: Task A fixed tests for Task B's code
   - Probably: merge anyway (good work), note in audit log

3. **How to handle tasks where agent did different work than assigned?**
   - Example: Task said "add feature X" but agent fixed unrelated bug Y
   - Probably: merge if valuable, reject task, create new task for actual work

4. **Should we fix commit messages (wrong task ID in message)?**
   - Probably: no, just document in audit log

5. **Archive old agent worktrees or delete after salvage?**
   - Leaning toward: archive for 1 week, then delete if no issues

## Next Steps

1. **Review this draft with user**
2. **Get approval to pause scheduler for salvage operation**
3. **Schedule dedicated time block (4-8 hours uninterrupted)**
4. **Run inventory scripts**
5. **Categorize tasks together (user + Claude)**
6. **Execute salvage**
7. **Write postmortem**
8. **Proceed to 037-ephemeral-worktrees.md**
