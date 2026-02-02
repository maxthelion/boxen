# Edge Path Merge Fix Plan

## Problem Statement

When cutting a notch into an existing extension, the merge produces incorrect geometry with diagonal lines instead of proper axis-aligned shapes.

## Current System

### Edge Path Structure
```typescript
interface CustomEdgePath {
  edge: 'top' | 'bottom' | 'left' | 'right';
  baseOffset: number;
  points: { t: number; offset: number }[];  // t=0-1 along edge, offset=mm from edge
  mirrored: boolean;
}
```

### How Edge Paths Work
1. `t` = normalized position along edge (0 = start, 1 = end)
2. `offset` = perpendicular distance from panel body edge
   - Positive = extends outward (extension/tab)
   - Negative = cuts inward (notch)
   - Zero = at original panel body edge

### Current Merge Logic
The `mergeEdgePaths` function:
1. Extracts "modified regions" (where offset != 0) from each path
2. Combines regions with "new takes precedence" in overlapping areas
3. Builds final path from combined regions

## The Bug

When merging an extension path with a notch path, diagonal lines appear. This suggests:

1. **Point ordering issue**: Merged path points are not in correct t-order
2. **Missing intermediate points**: When transitioning between extension and notch, we need points at both offset levels at the transition t-value
3. **Region extraction issue**: The "modified region" concept doesn't properly handle transitions

## Test Scenarios

| Scenario | Extension | Notch | Expected Result |
|----------|-----------|-------|-----------------|
| A | None | Crosses original edge | Simple notch below edge |
| B | +15 offset | Crosses original edge | Extension with slot cut through |
| C | +15 offset | Entirely above original edge | Extension with partial notch |
| D | +15 offset | Goes below original edge | Extension with deep slot |

## Proposed Solution

### Option 1: Fix the Merge Algorithm

The merge needs to:
1. Sample both paths at all transition points (where either path changes)
2. At each t-value, determine the correct offset based on the operation:
   - For "cut notch": final offset = min(existing.offset, notch.offset)
   - For "extend": final offset = max(existing.offset, extension.offset)
3. Build path with proper transitions (vertical steps, not diagonals)

### Option 2: Rethink the Model

Instead of merging complete edge paths, treat modifications as operations:
- Store a list of modifications: `{ type: 'extension' | 'notch', tStart, tEnd, offset }`
- When rendering, evaluate all modifications at each point
- Final offset = base + sum of extensions - sum of notches (clamped appropriately)

### Option 3: Direct Boolean Operations

When cutting a notch:
1. Get the current rendered outline for the edge
2. Compute the notch shape in the same coordinate system
3. Perform geometric boolean subtraction
4. Convert result back to edge path format

## Recommended Approach: Option 1 (Fix Merge)

### Step 1: Understand Current Rendering

First, trace how edge path points become panel outline coordinates:
- `BasePanel.applyCustomEdgePath()` or similar
- Verify the conversion is correct for simple cases

### Step 2: Fix Region Extraction

The `extractModifiedRegions` function should:
- Include transition points (where offset goes from 0 to non-zero and vice versa)
- Preserve the exact offset values at each point

### Step 3: Fix Region Merging

The `mergeModifications` function should:
- Collect all t-values from both paths
- At each t-value, compute the correct offset:
  - If both have modifications: use the "winner" based on operation type
  - If only one has modification: use that value
- Ensure vertical transitions (same t, different offsets) are preserved

### Step 4: Fix Path Building

The `buildPathFromModifications` function should:
- Output points in strict t-order
- Include two points at each transition (one at each offset level)
- Never create diagonal lines (adjacent points should share either t or offset)

## Implementation Steps

1. [ ] Add debug logging to trace path values through the system
2. [ ] Write unit tests for each scenario (A, B, C, D above)
3. [ ] Fix `extractModifiedRegions` to properly capture transitions
4. [ ] Fix `mergeModifications` to handle overlapping regions correctly
5. [ ] Fix `buildPathFromModifications` to ensure no diagonals
6. [ ] Verify all scenarios work correctly

## Acceptance Criteria

- [ ] Scenario A: Notch on plain edge creates proper rectangular notch
- [ ] Scenario B: Notch through extension creates vertical slot with clean edges
- [ ] Scenario C: Partial notch into extension creates stepped shape
- [ ] Scenario D: Deep notch creates slot that goes below original edge
- [ ] No diagonal lines in any merged path
- [ ] All existing edge path tests still pass
