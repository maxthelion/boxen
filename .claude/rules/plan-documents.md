# Plan Document Management

## Plan Index

All plan documents must be tracked in `docs/plan_index.md`.

## Workflow

### When creating a plan document:
1. Create the plan in `docs/` (e.g., `docs/my-feature-plan.md`)
2. Add an entry to `docs/plan_index.md` with status `draft`

### When starting implementation:
1. Update the plan's status in `docs/plan_index.md` to `in-progress`

### When completing a plan:
1. Update the plan's status in `docs/plan_index.md` to `complete`

## Index Format

```markdown
# Plan Index

| Plan | Status | Created | Description |
|------|--------|---------|-------------|
| [color-system-plan.md](color-system-plan.md) | draft | 2025-01-31 | Centralized color configuration |
| [second-operations-plan.md](second-operations-plan.md) | complete | 2025-01-31 | Second operation behavior for inset/fillet |
```

## Status Values

- `draft` - Plan created, not yet started
- `in-progress` - Implementation underway
- `complete` - Fully implemented
- `abandoned` - No longer relevant
