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
