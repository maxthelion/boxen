# Cross-Lap Conflict: UI Investigation

## Problem Statement

When dividers intersect, they create cross-lap joints (half-depth slots that interlock). A conflict arises when subdividing voids on **either side of a divider** on the **same axis**:

```
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

The X-divider cannot have two cross-lap slots at the same Z position - they would overlap and create invalid geometry.

## Current Behavior

The system currently has validation rules (see `.claude/rules/cross-lap-subdivision-rules.md`) that should prevent this, but the UI experience for communicating this constraint to users needs investigation.

## Questions to Investigate

### 1. Detection & Prevention

- **When should we detect the conflict?** During preview, on apply, or proactively when selecting axes?
- **How do we calculate "sufficiently close" positions?** Current rule is `2 * materialThickness` minimum separation.
- **Should we prevent the operation entirely, or allow it with warnings?**

### 2. UI Presentation Options

#### Option A: Disable Conflicting Axes
When user selects a void to subdivide, gray out axes that would cause conflicts:
- Pros: Prevents invalid state entirely
- Cons: User may not understand why an axis is disabled

#### Option B: Warning Message
Allow the operation but show a warning explaining the conflict:
- Pros: User learns about the constraint
- Cons: May create invalid geometry if warning is ignored

#### Option C: Visual Conflict Indicator
Show the conflicting positions in the 3D preview:
- Highlight the shared divider in red/orange
- Show where the cross-lap slots would overlap
- Pros: Very clear visual feedback
- Cons: More complex to implement

#### Option D: Smart Position Adjustment
Automatically adjust positions to avoid conflicts:
- If user tries to add Z-divider at Z=50 on right void (conflicting with left void's Z=50), suggest Z=52 or Z=48
- Pros: Allows more flexibility
- Cons: May not match user's intent

### 3. Edge Cases

1. **Multiple conflicts**: What if several positions conflict?
2. **Near-misses**: Positions that are close but not exactly conflicting (e.g., Z=50 vs Z=51 with mt=3)
3. **Cascading effects**: If a conflict is detected, how do we communicate which existing subdivision caused it?

### 4. Alternative Approaches

#### Meta-Void Selection (Future Feature)
Allow selecting multiple adjacent voids and subdividing them together:
- Creates a "virtual" combined void for the operation
- Dividers span across all selected voids
- Avoids conflict by design (single divider instead of two)

#### Grid Subdivision Promotion
When detecting a potential conflict, offer to convert to grid subdivision:
- "This would conflict with an existing divider. Would you like to create a full-spanning grid instead?"
- Replaces the sequential subdivisions with a proper grid

## Recommended Approach

**Phase 1 (Short-term):**
1. Add validation that prevents conflicting subdivisions
2. Show clear error message: "Cannot subdivide on Z-axis: would conflict with existing Z-divider at position 50 on the adjacent void"
3. Highlight the conflicting divider in the 3D view

**Phase 2 (Medium-term):**
1. Proactively disable conflicting axes in the subdivision palette
2. Add tooltip explaining why axis is disabled
3. Show visual indicator on the shared divider showing existing cross-lap positions

**Phase 3 (Long-term):**
1. Implement meta-void selection for spanning subdivisions
2. Add "Convert to Grid" option when conflicts would occur
3. Smart position suggestions that avoid conflicts

## Related Files

- `.claude/rules/cross-lap-subdivision-rules.md` - Validation rules
- `src/engine/nodes/DividerPanelNode.ts` - Cross-lap slot calculation
- `src/engine/nodes/FacePanelNode.ts` - Face panel slot blocking
- `src/components/SubdividePalette.tsx` - Subdivision UI
- `src/operations/validators.ts` - Operation validation

## Next Steps

1. [ ] Audit current validation in `validators.ts` for cross-lap conflicts
2. [ ] Design mockups for conflict warning UI
3. [ ] Implement Phase 1 error messaging
4. [ ] User testing to determine best approach for Phase 2
