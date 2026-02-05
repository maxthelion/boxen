# Use allCornerEligibility Data

CREATED: 2026-02-04T14:35:00Z
PRIORITY: P1
COMPLEXITY: S
ROLE: implement
BRANCH: feature/fillet-all-corners-integration-tests
SKIP_PR: true
BLOCKED_BY: TASK-fillet-fix-3a-switch-palette

## Context

After switching to FilletAllCornersPalette, need to wire up the data source.

## Task

In `src/components/Viewport3D.tsx`:

1. Find where `panelCornerGroups` or similar is computed
2. Change from using `cornerEligibility` (4 fixed corners) to `allCornerEligibility` (dynamic corners from geometry)
3. The panel data from engine should already have `allCornerEligibility` - just need to use it

## Code Pattern

```typescript
// Old (4 fixed corners):
const corners = panel.cornerEligibility; // CornerEligibility[]

// New (all geometric corners):
const corners = panel.allCornerEligibility; // AllCornerEligibility[]
```

## Acceptance Criteria

- [ ] Viewport3D uses allCornerEligibility instead of cornerEligibility
- [ ] Corner list shows all detected corners (not just 4)
- [ ] Commit changes

CLAIMED_BY: impl-agent-1
CLAIMED_AT: 2026-02-04T14:41:42.863206

COMPLETED_AT: 2026-02-04T14:44:03.236156

## Result
Merged directly to feature/fillet-all-corners-integration-tests
