# Batch Fillet All Eligible Corners

**Status:** Ready to Implement
**Source:** IMG_8247.jpeg

## Summary

Allow filleting **all corners** that are eligible - not just the panel's 4 outer corners, but ANY corner in the geometry:
- Corners of cutout holes (square cutout = 4 fillettable corners)
- Corners created by custom edge paths
- Corners from boolean operations (union/difference results)
- Any point where 2 line segments meet at an angle

## Current State

The existing fillet implementation (`docs/panel-corner-fillet-plan.md`) only handles the 4 outer corners of a panel, with eligibility based on edge extensions and adjacent panels.

This is a **different feature** - it's about filleting arbitrary corners anywhere in the panel geometry.

## Questions

1. **Corner detection**: How should corners be identified?

   **ANSWERED:** Both convex and concave corners are fillettable.
   (Any point where angle ≠ 180°)

2. **Eligibility rules**: What makes a corner eligible?

   **ANSWERED:**
   - Corners that are part of mechanical joints **cannot** be filleted
   - Anything in a forbidden area (even on the boundary) **cannot** be filleted

   **Radius constraint (geometry-based):**
   A fillet of radius R at angle θ consumes `R × tan(θ/2)` along each adjacent edge.

   Max radius = `min(edge1_length, edge2_length) / tan(θ/2)`

   Examples:
   - 90° corner, 10mm edges → max radius ≈ 10mm
   - 45° corner, 10mm edges → max radius ≈ 4.1mm (acute = smaller max)
   - 135° corner, 10mm edges → max radius ≈ 24mm (obtuse = larger max)

3. **"Batch" behavior**: What does "batch" mean here?

   **ANSWERED:** User makes a selection of corners, then applies fillet to selection.
   Not a "fillet all" button - requires explicit selection.

4. **Radius constraints per corner**:

   **ANSWERED:** Same radius for entire selection. Applied as single transaction (all selected corners filleted at once with same radius).

5. **Interior vs exterior corners**:

   **ANSWERED:** Both convex and concave → both interior and exterior corners are fillettable.

6. **UX for selecting corners in complex geometry**:

   **ANSWERED:**
   - Click individual corners to select
   - UI highlights eligible corners so user knows what can be selected

7. **Interaction with existing outer corner fillets**:

   **ANSWERED:** Unified system - replaces/extends existing fillet tool to handle all corners (outer panel corners + cutout corners + custom path corners). Available in both 2D and 3D views.

## Examples

**Square cutout:**
```
Panel with square hole:
┌─────────────────────┐
│                     │
│    ┌─────────┐      │
│    │ ○     ○ │      │  ○ = fillettable corner
│    │         │      │
│    │ ○     ○ │      │
│    └─────────┘      │
│                     │
└─────────────────────┘
```

**Custom edge path with notch:**
```
Panel edge with notch:
────○─────○────
    │     │
    └──○──┘

3 corners created, all potentially fillettable
```

## Ready to Implement

All questions answered. Summary of decisions:

| Aspect | Decision |
|--------|----------|
| Corner types | Both convex and concave |
| Eligibility | Not in forbidden areas, not part of mechanical joints |
| Max radius | `min(edge1, edge2) / tan(angle/2)` - geometry-based |
| Selection | Click individual corners; UI highlights eligible |
| Batch behavior | Same radius for all selected, applied as single transaction |
| Views | Available in both 2D and 3D |
| Existing system | Unified - extends current fillet tool to all corners |
