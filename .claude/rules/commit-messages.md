# Commit Message Rules

## Include Task IDs

When working on an orchestrator task, **always include the task ID in the commit message**.

### Format

Use the task ID in square brackets at the start of the commit subject:

```
[TASK-abc123] feat: add bounding box depth rendering fix

Fixes z-fighting by adding renderOrder and depthTest properties
to the bounding box line material.
```

Or as a footer:

```
feat: add bounding box depth rendering fix

Fixes z-fighting by adding renderOrder and depthTest properties
to the bounding box line material.

Task-ID: TASK-abc123
```

### Why This Matters

Including task IDs enables:
- **Traceability**: Link commits back to original requirements and context
- **Debugging**: Find what task introduced a change
- **Review**: Quickly look up the task to understand intent
- **Metrics**: Track which tasks led to which changes
- **Archaeology**: Future investigation of why code was written

### When to Include

✅ **Always include task ID:**
- When working as an orchestrator agent (implement, review, test roles)
- When the work was directly requested via a task
- When fixing issues found during task execution

❌ **Skip task ID:**
- Interactive PM sessions (not tied to a specific task)
- Manual fixes by humans
- Chores and housekeeping unrelated to tasks

### Examples

**Good:**
```
[TASK-f737dc48] fix: prevent z-fighting on bounding box edges

Added renderOrder={1} and depthTest={true} to lineBasicMaterial
to fix visual artifacts where bounding box lines disappeared
behind panels.
```

**Good (footer style):**
```
fix: prevent z-fighting on bounding box edges

Added renderOrder={1} and depthTest={true} to lineBasicMaterial
to fix visual artifacts where bounding box lines disappeared
behind panels.

Task-ID: TASK-f737dc48
Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

**Also acceptable:**
```
feat: add bounding box depth rendering fix

Task: TASK-f737dc48

Fixes z-fighting by adding renderOrder and depthTest properties
to the bounding box line material.
```

### Integration with Git Tooling

Task IDs in commits enable:

```bash
# Find all commits for a task
git log --all --grep="TASK-abc123"

# Find what task introduced a file
git log --all --grep="TASK-" -- path/to/file.ts

# See task context for a commit
git show abc123 | grep "TASK-" | xargs -I {} gh issue view {} --repo maxthelion/boxen
```

### Enforcement

This is a guideline, not enforced by hooks. Agents should follow it automatically when working on tasks. Humans can follow it when convenient but it's not required.
