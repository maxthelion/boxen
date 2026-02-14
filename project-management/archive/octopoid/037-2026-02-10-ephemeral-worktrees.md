---
**Processed:** 2026-02-13
**Mode:** human-guided
**Actions taken:**
- Verified core functions implemented (get_task_worktree_path, get_task_branch, cleanup_task_worktree)
- Confirmed scheduler still uses old agent-level worktrees for creation — hybrid state is acceptable
- No tasks enqueued — current state works well enough
**Outstanding items:** Scheduler migration to task-scoped creation deferred indefinitely
---

# Ephemeral Worktrees for All Tasks

**Status:** Partially Implemented
**Created:** 2026-02-10
**Problem:** Persistent agent-level worktrees cause state pollution, leading to false commit attribution and agents claiming work they didn't do

## Problem Statement

Currently, agents have persistent worktrees at `.orchestrator/agents/<agent>/worktree/` that are reused across multiple tasks. This causes:

### 1. False Commit Attribution
- Agent working on Task B sees commits from Task A (previous work in same worktree)
- Claims credit for commits made by different agents/tasks
- Example: TASK-e7e4147a claimed commit da72634, which was actually made on branch `orch/a95da6a1` by a different task

### 2. "Already Done" False Positives
- Agents find work "partially complete" because worktree contains:
  - Stale branches from previous tasks
  - Commits that look relevant but aren't on the current task's branch
- Submit with 0 commits, claiming work is already done

### 3. Branch Confusion
- Worktree contains dozens of stale branches from previous tasks
- Agent may checkout wrong branch accidentally
- Git operations become ambiguous (which branch? which commits?)

### 4. State Pollution
- Uncommitted changes from failed tasks carry over
- Test state, node_modules, build artifacts accumulate
- "Works in my worktree, fails elsewhere" mysteries

### 5. Difficult Debugging
- Can't tell which commits belong to current task vs previous tasks
- DB shows COMMITS=0 but self-merge succeeded (counting wrong branch?)
- Agent notes reference commits that aren't on their feature branch

## Root Cause

**The worktree scope is wrong.** Agent-level persistence means a single worktree is shared across:
- Unrelated standalone tasks
- Different projects
- Different breakdowns

The worktree accumulates state from ALL tasks the agent has ever worked on.

## Solution: Ephemeral Worktrees

**Every task gets a fresh worktree, regardless of project/breakdown/standalone.**

```
Worktree lifetime = Task lifetime
```

- Task claimed → create worktree from origin
- Task complete → push commits, delete worktree
- Next task → fresh worktree, clean slate

**The branch (on origin) is the shared state, not the worktree.**

## How It Works

### Task-Scoped Worktree Paths

```
.orchestrator/tasks/<task-id>/worktree/
```

Every task, regardless of type, gets its own ephemeral worktree under this path.

### Branch Selection Logic

**Standalone Task:**
- Branch: `orch/<task-id>` (or `agent/<task-id>` for app tasks)
- Base: `origin/main`
- Creates new feature branch for this task

**Project Task:**
- Branch: `<project.branch>` (e.g., `feature/dashboard-redesign`)
- Base: `origin/<project.branch>` (pull latest from origin)
- All tasks in project commit to same branch

**Breakdown Task:**
- Branch: `breakdown/<breakdown-id>`
- Base: `origin/breakdown/<breakdown-id>`
- All tasks in breakdown commit to same branch

### Lifecycle

```python
# 1. Task Claimed
def on_task_claimed(task):
    worktree_path = f".orchestrator/tasks/{task.id}/worktree/"

    # Determine branch
    if task.project_id:
        branch = get_project(task.project_id).branch
    elif task.breakdown_id:
        branch = f"breakdown/{task.breakdown_id}"
    else:
        branch = f"orch/{task.id}"

    # Create worktree from origin
    if branch_exists_on_origin(branch):
        # Pull existing branch (project/breakdown continuation)
        git worktree add {worktree_path} -b {branch} origin/{branch}
    else:
        # Create new branch from main (first task in project/standalone)
        git worktree add {worktree_path} -b {branch} origin/main

    # Init submodule
    cd {worktree_path} && git submodule update --init orchestrator

# 2. Task Completes
def on_task_complete(task):
    worktree_path = f".orchestrator/tasks/{task.id}/worktree/"

    # Push commits if any
    cd {worktree_path}
    if git rev-list @{u}..HEAD --count > 0:
        git push origin HEAD

    # Delete worktree (always)
    cd /Users/maxwilliams/dev/boxen
    git worktree remove {worktree_path} --force

# 3. Next Task
# Fresh worktree, pulls latest from origin, no pollution
```

## Examples

### Standalone Task

```
Task: TASK-4e0c2092 (Add timestamps to status script)
  - No project_id, no breakdown_id
  - Branch: orch/4e0c2092

Lifecycle:
  1. Create .orchestrator/tasks/4e0c2092/worktree/
  2. Checkout orch/4e0c2092 from origin/main
  3. Agent works, commits 2 commits
  4. Push to origin/orch/4e0c2092
  5. Self-merge to main (in separate worktree)
  6. Delete .orchestrator/tasks/4e0c2092/worktree/

Next standalone task (TASK-5f9e6dfc):
  - Fresh worktree .orchestrator/tasks/5f9e6dfc/worktree/
  - No branches from 4e0c2092
  - No commits from 4e0c2092
  - Clean slate
```

### Project with Sequential Tasks

```
Project: dashboard-redesign
  - Branch: feature/dashboard-redesign
  - Tasks: Add filters → Add sorting → Add detail view

Task A: Add filters (blocked_by: none)
  1. Create .orchestrator/tasks/task-a/worktree/
  2. Checkout feature/dashboard-redesign from origin/main (branch doesn't exist yet)
  3. Work, commit, push to origin/feature/dashboard-redesign
  4. DELETE worktree
  5. Task marked complete, Task B unblocked

Task B: Add sorting (blocked_by: Task A)
  1. Create .orchestrator/tasks/task-b/worktree/
  2. Checkout feature/dashboard-redesign from origin (gets Task A's commits automatically)
  3. Work, commit, push to origin/feature/dashboard-redesign
  4. DELETE worktree
  5. Task marked complete, Task C unblocked

Task C: Add detail view (blocked_by: Task B)
  1. Create .orchestrator/tasks/task-c/worktree/
  2. Checkout feature/dashboard-redesign from origin (gets A + B commits)
  3. Work, commit, push
  4. DELETE worktree

Project complete:
  - Merge feature/dashboard-redesign → main
  - All worktrees already deleted
```

**Key:** Each task pulls the latest project branch from origin, works, pushes, dies. Origin is the shared state.

### Breakdown Task

```
Breakdown: auth-oauth (breakdown/abc123)
  - Subtasks: Provider config → Endpoints → Frontend

Same pattern as project tasks:
  - Each subtask gets ephemeral worktree
  - All checkout breakdown/abc123 from origin
  - Sequential execution (blocked_by chain)
  - Each task sees previous tasks' commits via origin
```

## Benefits

### 1. No State Pollution
- Every task starts from clean checkout of origin
- Can't see commits from unrelated tasks
- Can't inherit uncommitted changes from failed tasks

### 2. Accurate Commit Attribution
- Agent can ONLY see commits on its task's branch
- If commit exists in worktree, the current agent made it
- No false "already done" claims

### 3. Simpler Model
- One rule: ephemeral worktrees for all tasks
- No special cases for projects vs breakdowns vs standalone
- Easier to implement, test, debug

### 4. Better Git Hygiene
- Forces pull-before-work (fresh checkout does this automatically)
- Forces push-after-commit (cleanup requires it)
- No long-lived local branches with uncommitted changes

### 5. Easier Debugging
- Commit count is unambiguous: `git rev-list origin/main..HEAD`
- Git log shows only relevant commits
- Agent notes can't reference phantom commits

### 6. Test Isolation
- Each test run starts from clean checkout
- No stale node_modules or build artifacts
- "Works in CI" == "works locally" (both use fresh checkout)

## Implementation

### Phase 1: Update Worktree Creation

**File:** `orchestrator/orchestrator/scheduler.py` (or wherever worktrees are created)

**Changes:**
- Remove agent-level worktree paths (`.orchestrator/agents/<agent>/worktree/`)
- Add task-level worktree paths (`.orchestrator/tasks/<task-id>/worktree/`)
- Pull from origin, not local branches
- Create branch from origin/main if it doesn't exist

**New functions:**
```python
def get_task_branch(task):
    """Determine which branch this task should work on"""
    if task.project_id:
        return get_project(task.project_id).branch
    elif task.breakdown_id:
        return f"breakdown/{task.breakdown_id}"
    else:
        return f"orch/{task.id}"  # or agent/<task-id> for app tasks

def create_task_worktree(task):
    """Create ephemeral worktree for task"""
    worktree_path = f".orchestrator/tasks/{task.id}/worktree/"
    branch = get_task_branch(task)

    # Check if branch exists on origin
    result = subprocess.run(
        ["git", "ls-remote", "--heads", "origin", branch],
        capture_output=True
    )
    branch_exists = len(result.stdout) > 0

    if branch_exists:
        # Pull existing branch
        base = f"origin/{branch}"
    else:
        # Create from main
        base = "origin/main"

    subprocess.run(["git", "worktree", "add", worktree_path, "-b", branch, base])
    subprocess.run(["git", "-C", worktree_path, "submodule", "update", "--init", "orchestrator"])

    return worktree_path
```

### Phase 2: Update Cleanup Logic

**Changes:**
- Always delete worktree after task completion (success or failure)
- Push commits before deleting
- Don't assume worktree persists

**New function:**
```python
def cleanup_task_worktree(task):
    """Delete task worktree, push commits if any"""
    worktree_path = f".orchestrator/tasks/{task.id}/worktree/"

    if not os.path.exists(worktree_path):
        return  # Already cleaned up

    # Check for unpushed commits
    result = subprocess.run(
        ["git", "-C", worktree_path, "rev-list", "@{u}..HEAD", "--count"],
        capture_output=True, text=True
    )
    unpushed_count = int(result.stdout.strip())

    if unpushed_count > 0:
        # Push before deleting
        subprocess.run(["git", "-C", worktree_path, "push", "origin", "HEAD"])

    # Delete worktree
    subprocess.run(["git", "worktree", "remove", worktree_path, "--force"])
```

**Hook into:**
- Task completion (accept_completion, fail_task, etc.)
- Task recycling (recycle_to_breakdown)
- Scheduler cleanup on exit

### Phase 3: Update Self-Merge Logic

**Problem:** Self-merge currently operates in the agent's worktree, which may have stale state.

**Solution:** Use a separate ephemeral worktree for merge operations.

**Changes:**
```python
def self_merge_to_main(task, feature_branch):
    """Merge feature branch to main using fresh worktree"""
    merge_worktree = f".orchestrator/tasks/{task.id}/merge-worktree/"

    try:
        # Create temporary worktree from main
        subprocess.run(["git", "worktree", "add", merge_worktree, "origin/main"])

        # Fetch latest feature branch
        subprocess.run(["git", "fetch", "origin", feature_branch])

        # Merge with ff-only
        result = subprocess.run(
            ["git", "-C", merge_worktree, "merge", "--ff-only", f"origin/{feature_branch}"],
            capture_output=True
        )

        if result.returncode != 0:
            return False  # Merge failed, not ff

        # Push to main
        subprocess.run(["git", "-C", merge_worktree, "push", "origin", "main"])
        return True

    finally:
        # Always clean up merge worktree
        subprocess.run(["git", "worktree", "remove", merge_worktree, "--force"])
```

### Phase 4: Update Agent Prompts

**File:** `.orchestrator/prompts/orchestrator-impl.md` (and others)

**Changes:**
- Update worktree paths in examples
- Remove references to persistent agent worktrees
- Emphasize: "Your worktree is ephemeral and will be deleted after task completion"

**Example:**
```markdown
Your worktree is at: /Users/.../dev/boxen/.orchestrator/tasks/{task-id}/worktree/

This worktree is EPHEMERAL. It will be deleted when your task completes.
- Commit ALL your work before finishing
- Push your commits (cleanup script will do this automatically)
- Don't rely on worktree state persisting to future tasks
```

### Phase 5: Commit Counting Simplification

**Current problem:** Commit counting is complicated because worktree has multiple branches.

**New approach:** Only one branch exists in worktree, so counting is trivial.

```python
def get_commit_count(worktree_path):
    """Count commits on current branch vs origin/main"""
    result = subprocess.run(
        ["git", "-C", worktree_path, "rev-list", "origin/main..HEAD", "--count"],
        capture_output=True, text=True
    )
    return int(result.stdout.strip())
```

No need to specify branch or worry about HEAD being detached.

### Phase 6: Migration - Clean Up Old Worktrees

**One-time cleanup:**

```bash
# Archive old persistent worktrees for debugging
mv .orchestrator/agents .orchestrator/agents.old.2026-02-10

# Create new agent directories (without worktrees)
for agent in orch-impl-1 impl-agent-1 impl-agent-2; do
    mkdir -p .orchestrator/agents/$agent
done

# Update scheduler to use new ephemeral model
# (Phase 1-4 changes)

# After validation (1 week), delete archives
rm -rf .orchestrator/agents.old.2026-02-10
```

## Edge Cases

### Task Fails Without Pushing

**Behavior:** Commits stay in local reflog, worktree is deleted.

**Intentional:** Forces "commit AND push" as atomic success. If agent didn't push, commits were probably bad.

**Recovery:** If needed, commits can be recovered from reflog in main .git directory.

### Concurrent Tasks in Same Project (Future)

**Current:** Projects use `blocked_by` to enforce sequential execution.

**If we allow parallel tasks:**
- Each gets its own ephemeral worktree
- Both checkout same branch from origin
- Both push to origin
- Last to push may hit conflict (git rejects push)
- Agent can pull, rebase, retry push

### First Task in Project/Breakdown

**Branch doesn't exist on origin yet:**
- Create worktree from `origin/main`
- Agent creates commits
- Push creates the branch on origin
- Next task pulls from `origin/<branch>` (now exists)

### Rebasing/Force-Pushing to Project Branch

**If origin branch gets rebased:**
- Next task pulls rebased version (fresh worktree)
- Clean slate, no stale state
- Just works

## Testing Strategy

### Unit Tests
- `test_get_task_branch()` - branch selection logic
- `test_create_task_worktree()` - worktree creation
- `test_cleanup_task_worktree()` - deletion and push

### Integration Tests
- Create task, claim, work, complete → verify worktree deleted
- Project task sequence → verify each task sees previous commits
- Failure case → verify worktree cleaned up even on error

### Manual Validation
1. Run scheduler with ephemeral model
2. Claim task, verify worktree created at `.orchestrator/tasks/<id>/worktree/`
3. Complete task, verify worktree deleted
4. Check `git worktree list` → should only show active task worktrees

## Rollout Plan

### Week 1: Implement and Test
- [ ] Phase 1: Update worktree creation
- [ ] Phase 2: Update cleanup logic
- [ ] Phase 3: Update self-merge
- [ ] Phase 4: Update agent prompts
- [ ] Phase 5: Simplify commit counting
- [ ] Write tests
- [ ] Test on orchestrator_impl tasks (low risk)

### Week 2: Production Trial
- [ ] Deploy to scheduler
- [ ] Monitor for issues (failed cleanups, orphan worktrees)
- [ ] Verify commit attribution is accurate
- [ ] Verify no "already done" false positives

### Week 3: Full Migration
- [ ] Phase 6: Clean up old persistent worktrees
- [ ] Update documentation
- [ ] Archive old agent directories
- [ ] Monitor for 1 week, then delete archives

## Success Metrics

- **Zero false "already done" claims** (tasks with 0 commits claiming completion)
- **Zero false commit attribution** (agents claiming commits from other tasks)
- **Commit count matches reality** (DB commits_count == actual commits on feature branch)
- **No orphan worktrees** (`.orchestrator/tasks/` empty when no tasks running)
- **Self-merge success rate** (should improve with clean state)

## Open Questions

1. **Performance:** Does creating/deleting worktrees per task add significant overhead?
   - Worktree creation: ~1s
   - Submodule init: ~2s
   - npm install: ~30s (can we cache node_modules?)

2. **Disk space:** Peak usage when many tasks running simultaneously?
   - Probably fine (tasks are short-lived)
   - Can add cleanup job if needed

3. **Recovery:** How to recover commits from failed task that didn't push?
   - Reflog in main .git directory
   - Or: add safety push before worktree deletion

4. **Agent identity:** Should agents be ephemeral too?
   - Current: persistent agent (orch-impl-1) uses ephemeral worktrees
   - Alternative: spawn ephemeral agent per task
   - Probably not needed if worktrees are ephemeral

## Related Work

- **Persistent review worktree:** Should stay persistent (used by humans for ad-hoc review)
- **Rebaser worktree:** Should become ephemeral (one rebaser task = one worktree)
- **Gatekeeper worktrees:** Should be ephemeral (one check = one worktree)

## Summary

Replace agent-level persistent worktrees with task-level ephemeral worktrees. Every task gets a fresh checkout from origin, works, pushes, and dies. Origin is the source of truth, not the worktree.

**Impact:** Eliminates state pollution, false commit attribution, and "already done" false positives. Simplifies git operations and debugging. Forces good git hygiene (pull before work, push after).

**Effort:** ~3-5 days implementation + testing, ~2 weeks validation in production.

**Risk:** Low. Ephemeral worktrees are simpler and safer than persistent ones.
