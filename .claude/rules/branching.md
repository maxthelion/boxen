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
