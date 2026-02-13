# Fix: Terminating Divider Joints (Cross-Lap vs Normal)

## Problem

When a second subdivision is added to a child void, the resulting shorter divider **terminates** at the first divider but is incorrectly treated as a **crossing** divider. This produces cross-lap notches where there should be normal finger joints.

### Visual

```
Grid subdivision (both dividers cross — correct cross-lap):
┌─────────┬─────────┐
│    │    │    │    │
│────┼────│────┼────│   ← Both dividers span full interior, they CROSS
│    │    │    │    │      Cross-lap notches are correct here
└─────────┴─────────┘

Sequential subdivision (shorter divider terminates — wrong cross-lap):
┌─────────┬─────────┐
│    │    │         │
│────┤    │  Right  │   ← Z-divider only spans left half, TERMINATES at X-divider
│    │    │  Void   │      Should have normal finger joint, not cross-lap
└─────────┴─────────┘
```

### Root Cause

Three issues in `DividerPanelNode.ts`:

1. **`computeCrossLapSlots()` (line ~830)**: Only checks if the other divider's mt-extended bounds reach this divider's position. Does NOT check whether the other divider actually crosses THROUGH (exists on both sides). A terminating divider's body reaches the position via the `+mt` body extension, fooling the check.

2. **`computeEdgeConfigs()` (line 149)**: `meetsDividerId` is always `null`. When a shorter divider terminates at a longer one, that edge should be `male` (tabs out), just like meeting a face panel. Instead it gets `null` (straight/open edge).

3. **`computeHoles()` (line 278)**: All divider-to-divider intersections are skipped with `continue` and a comment saying "cross-lap slots handle this now." But for terminating dividers, the longer panel needs SLOTS for the shorter panel's finger tabs — same as a face panel gets slots for a divider.

## Rules to Codify

### Rule 1: Crossing vs Terminating

A divider **crosses** another if its void bounds extend past the other divider's position on **both sides**. It **terminates** if its void bounds end at (or within `mt` of) the other divider's position.

```
Crossing:  otherVoidLow < myPosition - tolerance  AND  otherVoidHigh > myPosition + tolerance
Terminating: otherVoidLow or otherVoidHigh is near myPosition (within mt)
```

### Rule 2: Cross-Lap Joints Only for Crossing Dividers

Cross-lap notches (half-depth interlocking slots) are ONLY generated when two dividers physically cross through each other. Both dividers get complementary notches (one from top, one from bottom).

### Rule 3: Terminating Dividers Get Normal Finger Joints

When a shorter divider terminates at a longer one:
- The **shorter divider's terminating edge** gets `gender: 'male'` (tabs out), same as if it were meeting a face panel
- The **longer divider** gets slot holes where the shorter divider's tabs pass through, same as a face panel gets slots for dividers
- The shorter divider's body extends `mt` past its void bounds to reach the longer divider's far surface (this already works correctly via `computeBodySpan`)

### Rule 4: Finger Points Must Align

The shorter divider's finger tabs at the terminating edge must use the same finger point generation as the longer divider's slot holes. Both should derive from the same world-space anchor (the assembly's axis-aligned finger points), ensuring tabs and slots align.

## Failure Tests (to write before implementing)

These tests should FAIL initially, proving the feature doesn't exist yet:

| Test | Verifies | Expected Failure |
|------|----------|------------------|
| Terminating divider has NO cross-lap notch points | Z-divider outline has no half-depth notch at X-divider position | Will fail: `computeCrossLapSlots()` doesn't distinguish crossing vs terminating |
| Terminating divider edge has `male` gender | Edge config for right edge of Z-divider (facing X-divider) has `gender: 'male'` | Will fail: `meetsDividerId` is null, gender is null |
| Terminating divider has finger tabs on terminating edge | Z-divider outline has finger joint pattern on the edge facing X-divider | Will fail: gender is null, no fingers generated |
| Longer divider has slot holes for terminating divider | X-divider has a hole at the Z-divider's position (where tabs pass through) | Will fail: `computeHoles()` skips all divider-to-divider with `continue` |
| Crossing dividers still get cross-lap notches | Grid subdivision: both dividers have half-depth notch points | Should pass: existing behavior, regression guard |
| Mixed scenario: one crossing, one terminating | X-divider with full-span Z-divider AND half-span Z-divider: crossing gets cross-lap, terminating gets finger joint | Will fail: all treated as cross-lap |

### Test Setup

```typescript
// Terminating scenario
const engine = createEngineWithAssembly({ width: 200, height: 150, depth: 100, materialThickness: 6 });
engine.dispatch({ type: 'ADD_SUBDIVISION', payload: { voidId: rootVoid, axis: 'x', position: 100 } });
// Subdivide only the LEFT child void on Z
engine.dispatch({ type: 'ADD_SUBDIVISION', payload: { voidId: leftChildVoid, axis: 'z', position: 50 } });
const panels = generatePanelsFromNodes(engine._scene);
// Find the Z-divider and X-divider panels
// Assert: Z-divider has finger tabs on its right edge (facing X-divider)
// Assert: Z-divider has NO cross-lap notch points
// Assert: X-divider has slot holes where Z-divider meets it

// Crossing scenario (regression guard)
const engine2 = createEngineWithAssembly({ width: 200, height: 150, depth: 100, materialThickness: 6 });
engine2.dispatch({ type: 'ADD_GRID_SUBDIVISION', payload: { voidId: rootVoid, axes: [{ axis: 'x', compartments: 2 }, { axis: 'z', compartments: 2 }] } });
const panels2 = generatePanelsFromNodes(engine2._scene);
// Assert: both dividers have cross-lap notch points
```

## Implementation Plan

### Step 1: Add `isCrossingDivider()` utility

In `DividerPanelNode.ts` or a shared utility, add a function that takes two subdivision records and determines whether they cross or one terminates at the other.

```typescript
function isCrossingDivider(
  myAxis: Axis,
  myPosition: number,
  otherSub: Subdivision,
  mt: number
): boolean {
  // Get the other divider's VOID bounds along my axis (no mt extension)
  const [otherVoidLow, otherVoidHigh] = getVoidExtent(otherSub, myAxis);

  // Crosses if the other divider's void extends past my position on BOTH sides
  const tolerance = 0.1;
  return otherVoidLow < myPosition - tolerance && otherVoidHigh > myPosition + tolerance;
}
```

### Step 2: Filter cross-lap slots to crossing dividers only

In `computeCrossLapSlots()`, after the existing extent check, add the crossing check. Skip slots for terminating dividers.

### Step 3: Detect terminating edges in `computeEdgeConfigs()`

When computing edge configs, check if any subdivision on a perpendicular axis exists adjacent to this divider's edge. If so:
- Set `meetsDividerId` to the subdivision ID
- Set `gender: 'male'` (tabs out into the longer divider)

The check: for each edge of this divider (left, right for an X-divider's Z-axis edges), look through `getSubdivisions()` for a perpendicular divider whose position aligns with this edge's position. A divider's "left" or "right" edge corresponds to the start or end of its body span on the perpendicular axis.

### Step 4: Generate slot holes on longer divider for terminating shorter divider

In `computeHoles()`, change the `continue` on line 278 to be conditional:
- If the other divider **crosses** this one → `continue` (handled by cross-lap)
- If the other divider **terminates** at this one → generate slot holes (same logic as face panels use for divider slots)

The slot position, width, and finger pattern should match the shorter divider's finger tabs at its terminating edge.

### Step 5: Validate finger point alignment

Ensure the terminating divider's finger tabs and the longer divider's slots use the same world-space finger point anchor. This is how face-to-divider joints work — both derive from `computeEdgeAxisPosition()` on their respective nodes.

## Files to Modify

| File | Change |
|------|--------|
| `src/engine/nodes/DividerPanelNode.ts` | `computeCrossLapSlots()`: add crossing check; `computeEdgeConfigs()`: detect terminating edges; `computeHoles()`: conditional slot generation |
| `src/utils/faceGeometry.ts` | Possibly: add helper for determining which divider edge faces which other divider |
| `tests/integration/joints/crossLapSlots.test.ts` | Add terminating vs crossing tests; fix existing tests that validate incorrect cross-lap behavior |
| New: `tests/integration/joints/terminatingDividerJoints.test.ts` | Dedicated test file for terminating divider scenarios |

## QA Checks (Playwright)

1. **Sequential subdivision visual**: Create box → subdivide X → subdivide left void on Z → screenshot divider junction. The shorter divider should show finger tabs (not cross-lap notch) where it meets the longer divider.
2. **Grid subdivision visual**: Create box → grid subdivide 2x2 → screenshot intersection. Both dividers should show cross-lap notches.
3. **SVG export**: Export both scenarios to SVG and verify the cut paths show correct joint geometry.

## Risk

- Finger point alignment between divider-to-divider joints is new territory. Face-to-divider joints have a well-tested anchor system; divider-to-divider needs to use the same system or risk misalignment.
- The longer divider's slot holes for terminating dividers need to account for existing finger joint patterns on the longer divider's edges (the slots cut into the body, not the edge fingers).
