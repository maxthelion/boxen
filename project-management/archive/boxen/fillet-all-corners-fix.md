# Draft Task: Fix Fillet All Corners Feature

**Status:** Draft - collecting requirements
**Branch:** feature/fillet-all-corners-integration-tests (existing WIP code)

## Background

The fillet-all-corners feature was reverted from main due to:
- TypeScript errors
- Incomplete implementation
- Possible geometry issues

The code still exists on the feature branch.

## Issues to Address

### 1. Cutout corners not detected

The existing chamfer/fillet tool only shows the 4 outer panel corners (Top Left, Top Right, Bottom Right, Bottom Left). Corners from cutout shapes are not detected or selectable.

**Expected:** All corners in the panel geometry should be detected, including:
- Corners of cutout holes/shapes
- Corners created by custom edge paths
- Both convex and concave corners

**Current:** Only the 4 outer panel corners appear in the palette and have selection circles.

### 2. No separate "All Corners" button

Don't want a separate "ALL CORNERS" tool in the toolbar. The existing chamfer/fillet tool should simply detect and list all corners (including cutout corners) in its normal palette. One unified tool, not two.

### 3. Tests for corner detection

Need integration tests that verify corner detection count using an eligible corner validator. For example:
- Panel with a 4-corner cutout → validator should report 8 eligible corners (4 panel + 4 cutout)
- Tests should fail if cutout corners are not detected
- Similar pattern to existing geometry validators (e.g., `ComprehensiveValidator`, `PathChecker`)
- This ensures the feature actually works before merging

### 4. "All Corners" button is broken and should be removed

The "ALL CORNERS" toolbar button doesn't appear to do anything when pressed. Remove it entirely. Any useful functionality that was implemented (corner detection utilities, eligibility calculation) should be rolled into the existing chamfer/fillet tool flow - not a separate tool.

### 5. Fillet/chamfer not working at all

The fillet process itself appears broken. With corners selected and radius set (e.g., 8mm), nothing happens - no preview, no visual change to the corners. Unclear if:
- Preview is broken
- Apply is broken
- The new "all corners" code broke existing functionality
- It was already broken

**Needs integration tests** that verify:
- Selecting corners + setting radius shows preview with rounded corners
- Apply commits the fillet to the panel geometry
- Panel outline points change appropriately after fillet applied

### 6. Eligibility calculation is wrong

Bottom corners are listed as eligible even though they sit on edges with finger joints (should be ineligible). Top corners are correctly eligible because the top edge has been extended (open edge, borders safe area).

**Rule:** Corners on edges with joints should NOT be eligible. Only corners that border the safe area (on open/extended edges) should be fillettable.

**Needs integration tests for eligibility:**
- Corner on joint edge → ineligible
- Corner on open/extended edge → eligible
- Corner where one edge has joint, other is open → ineligible (both edges must be safe)
- Cutout corner fully inside safe area → eligible

