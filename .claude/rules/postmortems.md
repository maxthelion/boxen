# Process Failure Recognition

## When to Trigger a Postmortem

Proactively suggest writing a postmortem (`/postmortem`) when you notice any of these patterns:

### 1. Work Completed But Problem Persists

Signs:
- Agent commits exist on a branch but the original bug still reproduces
- Tests pass but the user reports the feature doesn't work
- Multiple tasks marked "done" for the same problem
- A task was recycled (burned out) and re-broken down

**Action:** Investigate the gap between what was built and what was needed before enqueuing more work.

### 2. Tests at the Wrong Layer

Signs:
- Integration tests manually construct intermediate state instead of calling the actual user-facing function
- Tests prove helpers work but don't exercise the code path the user triggers
- All tests pass but the feature is visibly broken in the browser
- Test code does `const state = { ...original, field: value }` instead of letting the production code produce `state`

**Action:** Flag that tests are unit tests masquerading as integration tests.

### 3. Commit Message Doesn't Match Diff

Signs:
- Commit says "wire X to Y" but X's function body is unchanged
- Commit says "update function Z" but only imports were added
- Commit lists 5+ changes but the diff is <20 lines

**Action:** Compare commit claims against actual file changes.

### 4. Infrastructure Without Wiring

Signs:
- Helper functions were created but never called from the entry point
- Types were defined but never used in the data flow
- Engine supports a feature but the store/UI never invokes it
- Import statements added but the imported symbols aren't used in function bodies

**Action:** Trace the data flow from user action to user-visible result and identify the gap.

### 5. Breakdown Lost Intent

Signs:
- Original bug report says "X doesn't work when user does Y"
- Breakdown tasks say "create helper for X" and "add type for X" but no task says "modify Y to use X"
- The "wiring" task is vague ("integrate X") without specifying which function bodies to change
- Acceptance criteria can be satisfied without the bug being fixed

**Action:** Compare the original intent against what the breakdown actually asked agents to do.

## How to Respond

When you detect a pattern above:

1. **Tell the user what you noticed** — be specific about the gap
2. **Suggest a postmortem** if the failure involved wasted agent cycles or multiple tasks
3. **For smaller issues**, just flag it and fix it directly
4. **Always propose rule/template updates** that would have prevented the failure

## Remediation Checklist

After each postmortem, check whether updates are needed to:

- [ ] `.claude/rules/testing.md` — testing philosophy or failure modes
- [ ] `.orchestrator/prompts/breakdown.md` — breakdown rules and templates
- [ ] `.claude/rules/` — new rules for the specific failure pattern
- [ ] Task acceptance criteria template — verification requirements
