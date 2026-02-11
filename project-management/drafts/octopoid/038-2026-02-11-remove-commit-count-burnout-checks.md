# Remove Commit Count and Burnout Checks

**Status:** Idea
**Captured:** 2026-02-11

## Raw

> "do away with all commit count checks. We haven't seen the same kind of burnout issues requiring recycling for a long time. False positives are disrupting our process"

## Idea

Remove or significantly relax the commit count and burnout detection heuristics from the orchestrator. The checks designed to catch stuck agents are now causing more false positives than they prevent real problems.

## Context

**Original purpose:** Detect when agents are spinning their wheels without making progress (high turn count + zero commits = burned out → recycle to breakdown).

**Current reality:**
- Haven't seen genuine burnout issues in a long time
- Commit counting bugs create false 0-commit reports
- Tasks with real work get recycled unnecessarily
- Examples of false positives from recent work:
  - TASK-e11a484b reported 0 commits but had commit 4bff386
  - TASK-f7b4d710 reported 0 commits but had commit ed944f9
  - TASK-58e22e70 reported 0 commits but self-merged to main

**Root cause of false positives:**
- Commit counting checks HEAD position, which changes during agent work
- Agents switch branches to compare or investigate
- Persistent worktrees accumulate state from multiple tasks
- Git operations return 0 when checking wrong branch/ref

**Trade-off:**
- **Cost:** False recycling wastes agent turns, creates duplicate breakdown tasks, disrupts flow
- **Benefit:** Catching stuck agents (hasn't happened recently)
- **Current state:** Cost >> Benefit

## Options

### Option 1: Remove All Commit Checks

**Remove:**
- `is_burned_out()` check in recycler
- Commit count parameter from `submit_completion()`
- All logic that compares commits to turns

**Result:**
- Agents never recycled based on commit count
- Only recycle on explicit failure or rejection
- Simpler code, fewer edge cases

**Risk:** If an agent genuinely gets stuck, it won't be auto-detected

### Option 2: Relax Thresholds Dramatically

**Current:** 0 commits + 80+ turns = burned out

**New:** 0 commits + 200+ turns = burned out (or higher)

**Result:**
- Very high bar for auto-recycling
- Reduces false positives significantly
- Keeps safety net for extreme cases

**Risk:** Still has false positives, just fewer

### Option 3: Wait for Ephemeral Worktrees

**Rationale:** Ephemeral task-scoped worktrees (draft 037, TASK-f7b4d710) will eliminate the root cause of commit counting bugs:
- One branch per worktree
- No state pollution from previous tasks
- Commit count becomes trivial: `git rev-list origin/main..HEAD --count`

**Action:** Disable burnout checks temporarily, re-enable after ephemeral worktrees land

**Result:**
- Clean slate once infrastructure is fixed
- No false positives from persistent worktree issues
- Commit counting becomes reliable

### Option 4: Change Detection Method

Instead of counting commits, detect burnout by:
- **File changes:** Has the worktree been modified? (check git status)
- **Branch existence:** Does the feature branch exist on origin?
- **Test failures:** Did pytest fail repeatedly?

**Result:** More direct signal of progress vs spinning

## Recommendation

**Go with Option 1 (Remove All Commit Checks) for now, re-evaluate after ephemeral worktrees.**

**Reasoning:**
1. False positives are actively disrupting work (happened 3+ times this week)
2. Haven't seen genuine burnout in recent memory
3. Other signals exist for stuck agents:
   - High turn count alone is visible in dashboard/status
   - Human can intervene if task is taking too long
   - Rejection flow handles bad work
4. Ephemeral worktrees (in progress) will make commit counting reliable
5. Can re-introduce smarter checks after infrastructure stabilizes

## Implementation

### Phase 1: Disable Burnout Detection

```python
# orchestrator/orchestrator/recycler.py

def is_burned_out(task_path: Path) -> bool:
    """Check if task has burned out (high turns, no progress)."""
    # DISABLED 2026-02-11: Too many false positives from commit counting bugs
    # Re-enable after ephemeral worktrees land (TASK-f7b4d710)
    return False
```

### Phase 2: Remove Commit Count from Submissions

```python
# orchestrator/roles/orchestrator_impl.py (and others)

# OLD:
submit_completion(task_path, commits_count=total_commits, ...)

# NEW:
submit_completion(task_path, ...)  # No commits_count parameter
```

### Phase 3: Clean Up Dead Code

After confirming the change works:
- Remove `get_commit_count()` function (or mark as unused)
- Remove `BURNED_OUT_TURN_THRESHOLD` constant
- Remove commit count columns from DB (optional, can keep for historical data)
- Remove commit count from task file metadata

## Open Questions

1. **Should we keep commit count for informational purposes?**
   - Display in dashboard/status but don't use for decisions?
   - Or remove entirely?

2. **What's the new signal for "agent is stuck"?**
   - Pure turn count threshold?
   - Time-based (task claimed >24h)?
   - Manual only (human reviews dashboard)?

3. **Re-enable after ephemeral worktrees?**
   - If ephemeral worktrees make commit counting reliable, bring checks back?
   - Or trust other signals long-term?

## Possible Next Steps

- [ ] Create task: Disable `is_burned_out()` check
- [ ] Monitor for 1 week: did any task actually burn out?
- [ ] If no issues: remove commit count entirely
- [ ] After ephemeral worktrees: decide whether to re-enable with reliable counting

## Related Work

- **Draft 037:** Ephemeral worktrees (will fix commit counting root cause)
- **TASK-f7b4d710:** Implement ephemeral worktrees (in progress, rejected for completion)
- Commit counting fix from 2026-02-08 (1e4bebd) - added branch parameter, but still not reliable
