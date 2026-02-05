# Fix Fillet/Chamfer Operation

CREATED: 2026-02-04T12:20:03Z
PRIORITY: P1
COMPLEXITY: M
ROLE: implement
BRANCH: feature/fillet-all-corners-integration-tests
SKIP_PR: true
BLOCKED_BY: TASK-fillet-3-fix-eligibility

## Context

This is part 4 of fixing the fillet feature.
- Part 3: TASK-fillet-3-fix-eligibility (must complete first)
- Part 5: TASK-fillet-5-integration-tests (BLOCKED_BY this task, creates final PR)

## IMPORTANT - What NOT to do

**DO NOT re-add the "fillet-all" or "ALL CORNERS" toolbar button.** Task 1 intentionally removed it. There should be ONE unified chamfer/fillet tool, which is the existing `chamfer` tool in the toolbar.

The `FilletAllCornersPalette.tsx` component still exists in the codebase but is intentionally NOT wired up. Leave it disconnected.

## Problem

The fillet operation doesn't work. With corners selected and radius set:
- No preview appears
- Clicking Apply does nothing
- The geometry doesn't change

## Task

Debug and fix the fillet/chamfer operation so it actually modifies geometry.

## Investigation Steps

1. Check the operation flow:
   - Is the operation starting correctly? (check `operationState`)
   - Is `createPreviewAction` returning a valid action?
   - Is the engine receiving and processing the action?

2. Check the engine action:
   - Is there a `FILLET_CORNERS` or `CHAMFER_CORNERS` action type?
   - Is the handler implemented in `Engine.ts dispatch()`?
   - Does it actually modify the panel geometry?

3. Check the geometry modification:
   - How should a fillet modify `panel.outline.points`?
   - A fillet replaces a corner point with an arc (multiple points)
   - A chamfer replaces a corner point with a diagonal line (2 points)

## Expected Behavior

**Preview:**
- Select corners + set radius → panel outline should show rounded corners in preview
- Changing radius should update preview in real-time

**Apply:**
- Commits the preview geometry
- Panel outline points array should have more points (arc segments replace single corner)

## Acceptance Criteria

- [ ] Selecting corners and setting radius shows preview
- [ ] Preview updates when radius changes
- [ ] Apply commits the geometry change
- [ ] Panel outline has more points after fillet (arc approximation)
- [ ] Chamfer mode creates diagonal cuts instead of arcs
- [ ] TypeScript compiles without errors

CLAIMED_BY: impl-agent-1
CLAIMED_AT: 2026-02-04T13:11:14.656367

COMPLETED_AT: 2026-02-04T13:16:58.498728

## Result
Merged directly to feature/fillet-all-corners-integration-tests
