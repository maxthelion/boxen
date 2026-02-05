# Update Fillet Operation for All Corners

CREATED: 2026-02-04T14:35:00Z
PRIORITY: P1
COMPLEXITY: S
ROLE: implement
BRANCH: feature/fillet-all-corners-integration-tests
SKIP_PR: true
BLOCKED_BY: TASK-fillet-fix-3b-use-all-corners-data

## Context

The operation registry needs to use the all-corners action instead of the 4-corner action.

## Task

In `src/operations/registry.ts`:

1. Find the `corner-fillet` operation
2. Change `createPreviewAction` to return `SET_ALL_CORNER_FILLETS_BATCH` instead of `SET_CORNER_FILLETS_BATCH`
3. Update the payload format to match the all-corners format

## Corner ID Format

```typescript
// Old (4 corners): 'left:top', 'right:top', 'bottom:left', 'bottom:right'
// New (all corners): 'outline:5', 'hole:cutout-1:2' (path:index format)
```

## Acceptance Criteria

- [ ] Operation uses SET_ALL_CORNER_FILLETS_BATCH action
- [ ] Corner IDs use new format
- [ ] Fillet preview works
- [ ] Commit changes

CLAIMED_BY: impl-agent-2
CLAIMED_AT: 2026-02-04T14:44:29.311050

COMPLETED_AT: 2026-02-04T14:48:30.453058

## Result
Merged directly to feature/fillet-all-corners-integration-tests
