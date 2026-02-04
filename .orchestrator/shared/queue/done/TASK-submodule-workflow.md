# [TASK-submodule-workflow] Fix Submodule Workflow for Agent Changes

ROLE: implement
PRIORITY: P1
BRANCH: main
CREATED: 2026-02-04T06:30:00Z
CREATED_BY: human

## Problem

When agents modify code in the `orchestrator/` submodule, they create PRs in the boxen repo that reference submodule commits that don't exist on the orchestrator remote. This breaks `git submodule update` for anyone who clones after the PR is merged.

**Current broken flow:**
1. Agent modifies files in `orchestrator/` submodule
2. Agent commits in submodule (local only)
3. Agent commits submodule pointer change in boxen
4. Agent creates PR in boxen
5. PR merged → boxen points to submodule commit that doesn't exist on remote
6. Clone fails: "Could not find commit 3791d45e..."

## Solution

**Skip PR stage for submodule changes.** Push orchestrator changes directly to main.

The orchestrator is internal tooling infrastructure. Changes to it:
- Are low-risk (if broken, only affects the dev workflow)
- Need to be on the remote before any boxen PR can work
- Don't need the same review rigor as product code

## Implementation

### 1. Update Agent Instructions

Add to `.orchestrator/agent-instructions.md` or create if it doesn't exist:

```markdown
## Submodule Changes

When your task involves modifying files in the `orchestrator/` directory (which is a git submodule):

1. **Push submodule changes directly to main** - Don't create a branch/PR for orchestrator
2. **Then create the boxen PR** - Which will reference the now-public submodule commits

Steps:
1. Make your changes in `orchestrator/`
2. Commit in the submodule: `cd orchestrator && git add . && git commit -m "message"`
3. Push to orchestrator main: `cd orchestrator && git push origin HEAD:main`
4. Back in boxen, the submodule pointer is now valid
5. Continue with normal PR workflow for boxen changes
```

### 2. Update Implementer Role

In `orchestrator/orchestrator/roles/implementer.py`, add detection for submodule changes:

```python
def _has_submodule_changes(self, worktree_path: Path) -> bool:
    """Check if changes include the orchestrator submodule."""
    result = subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=worktree_path,
        capture_output=True, text=True
    )
    # Submodule changes show as " M orchestrator" (modified submodule)
    return "orchestrator" in result.stdout

def _push_submodule_to_main(self, worktree_path: Path) -> bool:
    """Push submodule changes directly to orchestrator main."""
    submodule_path = worktree_path / "orchestrator"

    # Commit any uncommitted changes in submodule
    subprocess.run(["git", "add", "."], cwd=submodule_path)
    subprocess.run(
        ["git", "commit", "-m", "Agent changes (auto-pushed)"],
        cwd=submodule_path
    )

    # Push to main
    result = subprocess.run(
        ["git", "push", "origin", "HEAD:main"],
        cwd=submodule_path,
        capture_output=True, text=True
    )
    return result.returncode == 0
```

### 3. Modify PR Creation Flow

Before creating the boxen PR, check for and handle submodule changes:

```python
def complete_task(self, ...):
    # ... existing code ...

    # Handle submodule changes first
    if self._has_submodule_changes(worktree_path):
        logger.info("Detected submodule changes, pushing to orchestrator main")
        if not self._push_submodule_to_main(worktree_path):
            logger.error("Failed to push submodule changes")
            return False

        # Update boxen's submodule pointer to the pushed commit
        subprocess.run(["git", "add", "orchestrator"], cwd=worktree_path)

    # Continue with normal PR creation
    # ...
```

## Alternative: Detect at Prompt Level

Instead of code changes, add this to the Claude prompt for implementer agents:

```
## Submodule Handling

If you modify any files in the `orchestrator/` directory, you MUST:
1. After committing, run: `cd orchestrator && git push origin HEAD:main`
2. This pushes orchestrator changes directly (no PR needed for internal tooling)
3. Then continue with the normal boxen PR workflow
```

## Acceptance Criteria

- [ ] Agents detect when they've modified submodule files
- [ ] Submodule commits are pushed to orchestrator remote before boxen PR
- [ ] Boxen PRs with submodule changes can be cloned/merged without errors
- [ ] Instructions documented for agents to follow

## Files to Modify

- `orchestrator/orchestrator/roles/implementer.py` - Add submodule detection and push
- `.orchestrator/agent-instructions.md` - Document submodule workflow (create if needed)
- Potentially the Claude prompt in implementer role

## Notes

This is a P1 because current PRs (#3, #4) have broken submodule references that will cause issues when merged.

CLAIMED_BY: impl-agent-2
CLAIMED_AT: 2026-02-04T06:51:00.558951

COMPLETED_AT: 2026-02-04T06:55:23.618340

## Result
PR created: https://github.com/maxthelion/boxen/pull/6
