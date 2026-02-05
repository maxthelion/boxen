# /decompose-task - Break Down Problematic Tasks

Break a complex or failing task into micro-tasks that agents can complete successfully.

## Usage

```
/decompose-task <task-id or description>
```

## When to Use

- Task has failed multiple times (exploration exhaustion)
- Task is marked done but has no commits
- Task is complex (M/L/XL complexity)
- Agent keeps re-exploring without making progress

## Process

### 1. Find Existing Documentation

Search for relevant design docs:

```bash
# Search for plans related to the feature
ls docs/*plan*.md
grep -l "<feature-keyword>" docs/*.md project-management/**/*.md
```

**If docs exist:** Reference them in tasks with "READ THESE FIRST"
**If no docs exist:** Consider creating a planning-only task first

### 2. Identify the Core Problem

Ask:
- What specific behavior is broken?
- What should happen vs what actually happens?
- What's the minimal test that would verify the fix?

### 3. Create Test-First Task

First task should write a failing test:

```markdown
# Write Failing Test for <Feature>

PRIORITY: P1
COMPLEXITY: S
BRANCH: <branch>
SKIP_PR: true

## Reference Documentation
**READ THESE FIRST:**
- `docs/<relevant-plan>.md` - Section "<relevant-section>"

## Task
Write a test that verifies the expected behavior. The test should FAIL initially.

## Test Template
```typescript
// Provide actual code template
```

## Acceptance Criteria
- [ ] Test file created
- [ ] Test runs (expected to fail)
- [ ] Commit the test
```

### 4. Create Fix Task (blocked by test)

```markdown
# Fix <Specific Issue>

BLOCKED_BY: <test-task-id>
COMPLEXITY: S
SKIP_PR: true

## Reference Documentation
**READ THESE FIRST:**
- `docs/<relevant-plan>.md` - Lines XX-YY contain the solution

## The Fix
<Include actual code snippet from docs>

## Task
1. Run the test: `npm run test:run -- <test-file>`
2. Read the error
3. Apply the fix from the docs
4. Re-run until passing
5. Commit

## DO NOT
- Do not explore the codebase
- Do not rewrite from scratch
- Just apply the documented fix
```

### 5. Create Additional Fix Tasks (if needed)

Each task should:
- Be COMPLEXITY: S (small)
- Have BLOCKED_BY dependency on previous task
- Reference specific doc sections
- Include code snippets when possible
- Have clear "DO NOT" section

### 6. Create Final PR Task

```markdown
# <Feature> Final Tests and PR

BLOCKED_BY: <last-fix-task>
COMPLEXITY: M

## Task
1. Run all tests: `npm run test:run -- <test-pattern>`
2. Run typecheck: `npm run typecheck`
3. Create PR with summary of all changes

## PR Description Template
```markdown
## Summary
<description>

## Changes
1. <task-1 change>
2. <task-2 change>
...

## Test Plan
- [ ] `npm run test:run -- <tests>`
```
```

## Task Chain Example

```
TASK-feature-1-write-test (incoming)
    ↓
TASK-feature-2-fix-issue-a (blocked)
    ↓
TASK-feature-3-fix-issue-b (blocked)
    ↓
TASK-feature-4-tests-and-pr (blocked)
```

## Key Principles

1. **Reference docs explicitly** - "READ THESE FIRST" with file paths and line numbers
2. **Include code snippets** - Don't make agents search for the solution
3. **Test first** - Verifies the problem exists and fix works
4. **Small tasks** - Each completable in <20 turns
5. **Clear boundaries** - "DO NOT" sections prevent scope creep
6. **Sequential dependencies** - BLOCKED_BY ensures order

## Output

After running this skill, you should have:
- [ ] 3-6 linked tasks in `.orchestrator/shared/queue/`
- [ ] First task in `incoming/`, rest in `blocked/`
- [ ] Each task references relevant documentation
- [ ] Test task comes before fix tasks
- [ ] Final task creates PR
