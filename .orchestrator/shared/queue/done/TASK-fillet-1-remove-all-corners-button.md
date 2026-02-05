# Remove ALL CORNERS Toolbar Button

CREATED: 2026-02-04T12:20:00Z
PRIORITY: P1
COMPLEXITY: S
ROLE: implement
BRANCH: feature/fillet-all-corners-integration-tests
SKIP_PR: true

## Context

This is part 1 of fixing the fillet feature. See related tasks:
- Part 2: TASK-fillet-2-fix-corner-detection (BLOCKED_BY this task)
- Part 3: TASK-fillet-3-fix-eligibility (BLOCKED_BY part 2)
- Part 4: TASK-fillet-4-fix-fillet-operation (BLOCKED_BY part 3)
- Part 5: TASK-fillet-5-integration-tests (BLOCKED_BY part 4, creates PR)

## Task

Remove the separate "ALL CORNERS" tool from the toolbar. There should be ONE chamfer/fillet tool, not two.

## Specific Changes

1. In `src/components/EditorToolbar.tsx`:
   - Remove the "all-corners" or "fillet-all" tool entry from the tools array
   - Remove any related type definitions

2. In `src/components/Viewport3D.tsx`:
   - Remove the ALL CORNERS palette component and its state
   - Remove any conditional rendering for the all-corners tool

3. Search for and remove any other references to "all-corners" or "fillet-all" tool

## Acceptance Criteria

- [ ] Only one chamfer/fillet tool in the toolbar
- [ ] No "ALL CORNERS" button visible
- [ ] TypeScript compiles without errors
- [ ] App runs without console errors

## Notes

- Keep any useful utility functions from the all-corners code - just remove the separate UI entry point
- The existing chamfer/fillet tool will be enhanced in later tasks to detect more corners

CLAIMED_BY: impl-agent-1
CLAIMED_AT: 2026-02-04T12:10:48.528715

COMPLETED_AT: 2026-02-04T12:14:26.822457

## Result
Merged directly to feature/fillet-all-corners-integration-tests
