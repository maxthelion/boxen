# Cross-Lap Joint Subdivision Rules

## Problem: Conflicting Cross-Lap Slots

When dividers intersect, they create cross-lap joints (half-depth slots that interlock). A critical constraint arises when subdividing voids on either side of a divider:

```
Example of INVALID subdivision:

Initial state: Box split by X-divider at X=50
┌─────────┬─────────┐
│  Left   │  Right  │
│  Void   │  Void   │
└─────────┴─────────┘

If Left Void is subdivided on Z-axis at Z=50:
┌─────────┬─────────┐
│    │    │         │
│────┼────│  Right  │   <- Z-divider in left half has cross-lap with X-divider
│    │    │  Void   │
└─────────┴─────────┘

If Right Void is ALSO subdivided on Z-axis at Z=50:
┌─────────┬─────────┐
│    │    │    │    │
│────┼────│────┼────│   <- PROBLEM: Both Z-dividers want cross-lap slots
│    │    │    │    │      at the SAME position on the X-divider!
└─────────┴─────────┘
```

The X-divider cannot have two cross-lap slots at the same Z position (or sufficiently close) - they would overlap and create invalid geometry.

## Rule 1: No Conflicting Cross-Lap Positions

Voids on either side of a divider **cannot** be subdivided on the same axis with spacing that would cause cross-lap slots to align (collide) on the shared parent divider.

**Validation**: Before allowing a subdivision, check if any sibling void (sharing the same parent divider) already has subdivisions that would create conflicting cross-lap positions.

**Minimum separation**: Cross-lap slots must be separated by at least `2 * materialThickness` to avoid overlap.

## Rule 2: Use Multi-Axis Subdivision for Grids

To create proper grid patterns (like Grid Organizer), use **multi-axis subdivision from the root void** rather than sequential subdivisions of child voids.

**Correct approach for 2x2 grid:**
```
1. Select root void
2. Choose both X and Z axes
3. Set compartments: X=2, Z=2
4. Result: Full-spanning X and Z dividers that properly interlock
```

This creates dividers that span the full interior, with cross-lap joints at each intersection.

## Implementation: Multi-Axis Subdivision Operation

### UI Changes

The subdivision palette should support:
1. **Axis selection**: Allow selecting 1 or 2 axes (e.g., checkboxes for X, Y, Z where max 2 can be selected)
2. **Compartment counts**: Two sliders/spinners
   - Primary axis: Always enabled when an axis is selected
   - Secondary axis: Disabled if only one axis is selected
3. **Labels**: Show which slider controls which axis (e.g., "X Compartments", "Z Compartments")

### Engine Changes

1. **New action or extended payload**: `ADD_SUBDIVISIONS` should accept multiple axes:
   ```typescript
   {
     type: 'ADD_MULTI_AXIS_SUBDIVISION',
     targetId: 'main-assembly',
     payload: {
       voidId: 'root',
       axes: [
         { axis: 'x', compartments: 2 },
         { axis: 'z', compartments: 3 }
       ]
     }
   }
   ```

2. **Key principle**: All dividers on each axis span the **full void dimensions**, not just sub-regions.

   **Example: 2×2 grid (2 compartments on X, 2 on Z)**
   - Creates 1 X-divider (spans full Z depth)
   - Creates 1 Z-divider (spans full X width)
   - Creates 4 voids (the quadrants)
   - 1 cross-lap intersection where dividers meet

   **Example: 3×3 grid (3 compartments on X, 3 on Z)**
   - Creates 2 X-dividers (both span full Z depth)
   - Creates 2 Z-dividers (both span full X width)
   - Creates 9 voids
   - 4 cross-lap intersections (2×2 grid of crossings)

3. **Void tree structure**: The resulting voids are all direct children of the subdivided void, not nested. The dividers form a grid where each divider spans the full extent of its perpendicular dimension.

### Validation

Before applying subdivision:
1. Check if the void has sibling voids (shares a parent divider)
2. If so, check if any sibling has subdivisions on the same axis
3. Compare positions - reject if any would create conflicting cross-lap slots

## Future Extension: Meta-Void Selection

Allow selecting multiple **adjacent** voids for a subdivision operation. This creates a "meta void" that encompasses:
- Combined outer bounds of selected voids
- Plus the material thickness of dividers separating them

**Use case**: User has already subdivided part of the box, but wants to add a spanning divider across multiple existing compartments.

**Implementation considerations**:
- UI for multi-select voids (shift-click or drag selection)
- Compute meta-void bounds from selected voids
- Validate that selected voids are actually adjacent
- Create divider(s) that span the meta-void bounds
