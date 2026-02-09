# Postmortem: False Rejection of Orchestrator Tasks Due to Submodule Commit Lookup Failure

**Date:** 2026-02-07
**Severity:** Two valid task completions falsely rejected; agent work wasted on re-attempts

## Summary

The PM (Claude interactive session) twice accused `orch-impl-1` of fabricating commits when reviewing orchestrator_impl tasks. Both times the commits were real — they just weren't where the reviewer looked. TASK-78d13276 was committed locally but not pushed; TASK-f2da3c14 was committed to the main checkout's submodule instead of the worktree's submodule (which has a separate git object store). The reviewer jumped to "hallucinated" both times instead of investigating further.

## Timeline

1. **TASK-78d13276** (fix view-task script) submitted as provisional
2. Reviewer checked `origin/sqlite-model` — commit not there (not pushed yet)
3. Reviewer checked agent worktree submodule `git log` — HEAD was stale commit from previous task
4. Reviewer concluded the commit was fabricated, rejected the task with harsh feedback
5. Agent re-claimed, pushed the existing commit, resubmitted
6. Reviewer fetched remote, found the commit — it had existed all along
7. **TASK-f2da3c14** (review-orchestrator-task script) submitted as provisional
8. Reviewer checked agent worktree submodule — commit not found, file not found
9. Reviewer ran `git cat-file -t d6b8d97` in worktree submodule — "not a valid object"
10. Reviewer concluded fabrication again, rejected with stronger feedback
11. User pushed back: "did you check the submodule?"
12. Reviewer checked the **main checkout's submodule** (`/Users/maxwilliams/dev/boxen/orchestrator`) — commit exists, 764 lines of real code across 3 files

## Root Cause

### Immediate: Worktree and main submodules have separate git object stores

- Main submodule `.git` points to `.git/modules/orchestrator`
- Worktree submodule `.git` points to `.git/worktrees/worktree/modules/orchestrator`
- These are **separate object stores** — a commit in one is invisible from the other
- The agent committed to the main submodule, but the reviewer only checked the worktree submodule

### Structural: No tooling for reviewing orchestrator_impl commits

- The status script shows worktree state for the main repo, not the submodule
- There's no `review-orchestrator-task` script (TASK-f2da3c14 was creating one, ironically)
- The approval script (`approve_orchestrator_task.py`) knows where to find commits, but there's no read-only equivalent for review
- The reviewer had to improvise with raw git commands, and improvised wrong

### Misleading: "commits: 0" in status output and agent notes

- The status script reports "0 commits ahead of main" because it checks the main repo worktree, not the submodule
- Agent notes header showed "Turns: 0 | Commits: 0" — this comes from the orchestrator's tracking, which wasn't counting submodule commits
- Both signals reinforced the false conclusion that no work was done

### Bias: Jumped to "fabricated" instead of "can't find"

- After the first false rejection, the reviewer should have been MORE cautious on the second, not less
- The detailed agent notes (23 tests, acceptance criteria checked off) should have been a signal that work was done, not evidence of elaborate fabrication
- "I can't find the commit" is not the same as "the commit doesn't exist"

## What the actual fix requires

1. **Review-orchestrator-task script** — TASK-f2da3c14 is building this (the commit exists, just needs to be approved)
2. **Status script improvements** — show submodule commit state for orchestrator_impl tasks
3. **Understanding of submodule object stores** — the main and worktree submodules are separate; check both

## Lessons

### 1. Absence of evidence is not evidence of absence

Not finding a commit in one location doesn't mean it was fabricated. Git submodules in worktrees have separate object stores. Before concluding an agent is lying, exhaust all possible locations:
- Worktree submodule
- Main checkout submodule
- Remote (after fetch)
- Reflog

### 2. Build tooling before reviewing, not after

The entire session started because we lacked a proper review tool for orchestrator tasks. We then created a task to build one (f2da3c14), and immediately failed to review THAT task properly — for the same reason we needed the tool in the first place. Build review tooling first.

### 3. Strong claims require strong evidence

"The agent fabricated commits" is a strong claim. The evidence was "I can't find the commit in this one git object store." That's weak evidence. The reviewer should have checked multiple locations and asked for help before accusing.

## Remediation

### 1. Approve f2da3c14 from the main submodule

The commit `d6b8d97` exists in the main submodule and contains real work (764 lines). Cherry-pick it onto `sqlite-model` and approve the task. The false rejection needs to be un-done.

### 2. Add submodule checking to the review checklist

Update `.claude/rules/orchestration.md` to include:

```
## Reviewing Orchestrator Task Commits

Orchestrator_impl agents may commit to either the worktree's submodule or the main
checkout's submodule. These have SEPARATE git object stores. When looking for commits:

1. Check the worktree submodule: .orchestrator/agents/<agent>/worktree/orchestrator/
2. Check the main submodule: orchestrator/
3. Check the remote: git fetch origin sqlite-model

If a commit hash from agent notes doesn't resolve, try all three locations before
concluding it doesn't exist.
```

### 3. Fix the agent to commit in the right place

The orchestrator_impl role should commit to the worktree's submodule (where the approve script expects it), not the main checkout. Investigate why the agent is committing to the wrong location and fix the role's prompt or setup.

### 4. Status script: show submodule state

Already drafted in `project-management/drafts/status-script-improvements.md`. The status script should check the submodule branch and commits for orchestrator_impl worktrees.
