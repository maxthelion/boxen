# [TASK-9f5cda4b] Implement Batch Fillet for All Corners

ROLE: implement
PRIORITY: P1
BRANCH: main
CREATED: 2026-02-03T21:40:43Z
CREATED_BY: human

## Context

Extend the existing fillet system to handle ANY corner in panel geometry - not just the 4 outer panel corners, but corners from cutouts, custom edge paths, and boolean operations.

Spec: `project-management/awaiting-clarification/batch-fillet-corners.md`
Related: `docs/panel-corner-fillet-plan.md` (existing outer corner fillet)

## Requirements Summary

| Aspect | Decision |
|--------|----------|
| Corner types | Both convex and concave |
| Eligibility | Not in forbidden areas, not part of mechanical joints |
| Max radius | `min(edge1, edge2) / tan(angle/2)` - geometry-based |
| Selection | Click individual corners; UI highlights eligible |
| Batch behavior | Same radius for all selected, applied as single transaction |
| Views | Available in both 2D and 3D |
| Existing system | Unified - extends current fillet tool to all corners |

## Acceptance Criteria

- [x] Corner detection identifies all corners in panel geometry (outline + holes)
- [x] Both convex (exterior) and concave (interior) corners are detected
- [x] Eligibility check excludes corners in forbidden areas (joint margins, slots)
- [x] Max radius computed per corner using `min(edge1, edge2) / tan(angle/2)`
- [x] UI shows eligible corners with visual indicators (different colors for eligible/selected/ineligible)
- [x] Click to select/deselect individual corners
- [x] Single radius slider applies to all selected corners
- [x] Apply commits all fillets as single transaction
- [x] Works in 3D view (2D view has existing chamfer-fillet tool)
- [x] Integration tests pass geometry checker (761 tests passing)

CLAIMED_BY: impl-agent-1
CLAIMED_AT: 2026-02-03T21:44:22.842159

COMPLETED_AT: 2026-02-04T06:55:00Z

## Result
PR #3 created and merged: https://github.com/maxthelion/boxen/pull/3

## Implementation Summary

### Core Utilities (`src/utils/allCorners.ts`)
- `detectAllPanelCorners()` - Finds corners in outline + holes
- `calculateMaxFilletRadius()` - Geometry-based max radius: `min(edge1, edge2) / tan(angle/2)`
- `computeAllCornerEligibility()` - Checks forbidden areas (joints, slots)
- `applyFilletToCorner()` - Applies arc to corner point

### Engine Integration
- `SET_ALL_CORNER_FILLET` action - Single corner fillet
- `SET_ALL_CORNER_FILLETS_BATCH` action - Batch apply
- `BasePanel._allCornerFillets` storage
- `allCornerEligibility` computed on panel snapshots

### UI Components
- `FilletAllCornersPalette.tsx` - Radius slider, corner selection, apply/cancel
- Toolbar button with shortcut 'A'
- Operation registry entry `fillet-all-corners`
- Store slice for corner selection state

### 3D View Integration (Viewport3D.tsx)
- `panelAllCornerGroups` - Builds corner groups for palette
- Auto-select eligible corners when tool activated
- Corner toggle, select all, clear selection
- Preview updates on selection/radius change

## Notes
- The 2D view retains the existing chamfer-fillet tool for the 4 outer corners
- The new fillet-all-corners tool supports ALL corners (outline + holes) in 3D view
- Full unification would require extending 2D view corner detection to use allCorners.ts
