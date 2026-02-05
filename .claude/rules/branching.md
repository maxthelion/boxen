# Git Branching Rules

## Feature Branches Required

All development work MUST happen in feature branches, not on `main`.

### Workflow

1. **Create feature branch** before starting work:
   ```bash
   git checkout -b feature/<descriptive-name>
   ```

2. **Make commits** on the feature branch

3. **Create PR** when ready for review/merge

4. **Merge via PR** - never push directly to main

### Branch Naming

- Features: `feature/<name>` (e.g., `feature/store-refactor`)
- Bug fixes: `fix/<name>` (e.g., `fix/panel-alignment`)
- Refactoring: `refactor/<name>` (e.g., `refactor/split-store`)

### Before Starting Work

Always check current branch:
```bash
git branch --show-current
```

If on `main`, create a feature branch first.

## What Goes Where

**Feature branches** are for feature code only:
- Source code changes (`src/`)
- Tests for the feature
- Feature-specific documentation

**Main branch** is for project-wide changes:
- Claude rules (`.claude/rules/`)
- Plan documents (`docs/`)
- Project management files
- Audits and recommendations
- Slash commands (`.claude/commands/`)

### When Unsure

If working on a feature branch and need to commit non-feature changes (rules, plans, etc.):
1. Ask whether to commit to main or the feature branch
2. If committing to main: stash, checkout main, commit, push, return to feature branch

This keeps feature branches focused and ensures project-wide changes are immediately available on main.

## Commit Practices

### Proactive Commits

Don't wait for the user to ask. Proactively suggest commits when:
- A logical unit of work is complete
- Before switching context to a different task
- After fixing a bug or completing a feature
- When there are meaningful changes that shouldn't be lost

### Focused Commits

Keep commits focused on logical chunks:
- **One concern per commit** - don't mix unrelated changes
- **Commit message describes the "what" and "why"**
- If changes span multiple concerns, split into separate commits

**Good:**
```
fix: wire all-corners fillet to apply geometry
docs: add multi-view testing rules
chore: archive completed orchestrator tasks
```

**Bad:**
```
fix fillet and update docs and clean up tasks
```

### When to Split

If you find yourself writing "and" in a commit message, consider splitting:
- `fix: X and Y` → two commits
- `feat: add X and refactor Y` → two commits
