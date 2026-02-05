# Switch to FilletAllCornersPalette

CREATED: 2026-02-04T14:35:00Z
PRIORITY: P1
COMPLEXITY: S
ROLE: implement
BRANCH: feature/fillet-all-corners-integration-tests
SKIP_PR: true

## Context

From agent exploration: The engine already has `allCornerEligibility` which detects corners from actual geometry. The UI still uses the old 4-corner `FilletPalette`. Need to switch.

## Task

In `src/components/Viewport3D.tsx`:

1. Change import from `FilletPalette` to `FilletAllCornersPalette`
2. Change component usage from `<FilletPalette>` to `<FilletAllCornersPalette>`
3. Update props if needed (check FilletAllCornersPalette interface)

## DO NOT

- Do not modify FilletAllCornersPalette.tsx
- Do not change the operation registry yet
- Just swap the component in Viewport3D

## Acceptance Criteria

- [ ] Viewport3D imports FilletAllCornersPalette
- [ ] Viewport3D renders FilletAllCornersPalette instead of FilletPalette
- [ ] App compiles (may have runtime errors - that's ok for now)
- [ ] Commit changes

CLAIMED_BY: impl-agent-1
CLAIMED_AT: 2026-02-04T14:36:21.091053

COMPLETED_AT: 2026-02-04T14:41:01.545681

## Result
Merged directly to feature/fillet-all-corners-integration-tests
