# Code Duplication & Refactoring Candidates

Analysis date: 2026-01-26

## Overview

This document identifies code duplication patterns in the Boxen codebase that could lead to maintenance issues and bugs when one copy is updated but not the others.

---

## CRITICAL Priority

### 1. Region Bounds Calculation (3 locations)

**Files and Locations:**
- `src/store/useBoxStore.ts` lines 315-336 (in `recalculateVoidBounds`)
- `src/store/useBoxStore.ts` lines 863-912 (in `applySubdivision`)
- `src/store/useBoxStore.ts` lines 3020-3069 (in `updatePreviewSubdivision`)

**Duplicated Pattern:**
```typescript
const regionStart = i === 0 ? dimStart : positions[i - 1] + mt / 2;
const regionEnd = i === count ? dimStart + dimSize : positions[i] - mt / 2;
const regionSize = regionEnd - regionStart;

switch (axis) {
  case 'x':
    childBounds = { ...bounds, x: regionStart, w: regionSize };
    break;
  case 'y':
    childBounds = { ...bounds, y: regionStart, h: regionSize };
    break;
  case 'z':
    childBounds = { ...bounds, z: regionStart, d: regionSize };
    break;
}
```

**Risk:** Any bug fix or enhancement to region boundary calculation must be applied in three places. This is likely the source of the divider-to-divider slot alignment bug after extend operations.

**Recommendation:** Extract to `calculateVoidRegionBounds(bounds, axis, positions, index, mt)` utility function.

---

## HIGH Priority

### 2. Nested Bounds Recalculation

**Files and Locations:**
- `src/store/useBoxStore.ts` lines 2329-2360 (in `recalculateNestedBounds` helper within `setDividerPosition`)
- `src/store/useBoxStore.ts` lines 315-336 (in `recalculateVoidBounds`)

**Issue:** Both functions calculate region boundaries accounting for material thickness dividers, but with slight differences in how they access child boundaries:
- One uses `children[idx - 1].splitPosition`
- Other uses `splitPositions[i - 1]`

**Risk:** Subtle differences could cause sync bugs if one implementation is updated.

**Recommendation:** Consolidate into single `recalculateNestedBounds` implementation.

---

### 3. findVoid Duplication

**Files and Locations:**
- `src/store/useBoxStore.ts` lines 210-222 (private implementation)
- `src/components/SubdivisionControls.tsx` lines 289-301 (duplicated implementation)

**Issue:** Identical tree traversal function exists in two files.

**Recommendation:** Export `findVoid` from store or create shared utility in `src/utils/voidOperations.ts`.

---

## MEDIUM Priority

### 4. Axis-Based Bounds Access (13+ locations)

**Pattern appears in:**
- `src/store/useBoxStore.ts` at lines: 279-280, 324-327, 454-464, 856-858, 2324-2327, 3008-3010
- `src/utils/panelGenerator.ts` (multiple locations)

**Duplicated Pattern:**
```typescript
const dimStart = axis === 'x' ? bounds.x : axis === 'y' ? bounds.y : bounds.z;
const dimSize = axis === 'x' ? bounds.w : axis === 'y' ? bounds.h : bounds.d;
```

**Recommendation:** Create helpers in `src/types.ts`:
```typescript
export const getBoundsStart = (bounds: Bounds, axis: 'x' | 'y' | 'z'): number =>
  axis === 'x' ? bounds.x : axis === 'y' ? bounds.y : bounds.z;

export const getBoundsSize = (bounds: Bounds, axis: 'x' | 'y' | 'z'): number =>
  axis === 'x' ? bounds.w : axis === 'y' ? bounds.h : bounds.d;

export const setBoundsRegion = (
  bounds: Bounds,
  axis: 'x' | 'y' | 'z',
  start: number,
  size: number
): Bounds => {
  switch (axis) {
    case 'x': return { ...bounds, x: start, w: size };
    case 'y': return { ...bounds, y: start, h: size };
    case 'z': return { ...bounds, z: start, d: size };
  }
};
```

---

### 5. Vector Normalization in Corner Finish

**Files and Locations:**
- `src/utils/cornerFinish.ts` lines 186-197 (in `applyChamfer`)
- `src/utils/cornerFinish.ts` lines 228-239 (in `applyFillet`)

**Duplicated Pattern:**
```typescript
const inVec = { x: corner.x - prevPoint.x, y: corner.y - prevPoint.y };
const outVec = { x: nextPoint.x - corner.x, y: nextPoint.y - corner.y };
const inLen = Math.sqrt(inVec.x * inVec.x + inVec.y * inVec.y);
const outLen = Math.sqrt(outVec.x * outVec.x + outVec.y * outVec.y);
if (inLen === 0 || outLen === 0) return [corner];
const inNorm = { x: inVec.x / inLen, y: inVec.y / inLen };
const outNorm = { x: outVec.x / outLen, y: outVec.y / outLen };
```

**Recommendation:** Extract to `normalizeEdgeVectors(prevPoint, corner, nextPoint)` helper.

---

### 6. Finger Joint Unit Vector Calculation

**Files and Locations:**
- `src/utils/fingerJoints.ts` lines 33-46 (in `generateFingerJointPath` V1)
- `src/utils/fingerJoints.ts` lines 263-286 (in `generateFingerJointPathV2`)

**Duplicated Pattern:**
```typescript
const dx = end.x - start.x;
const dy = end.y - start.y;
const actualLength = Math.sqrt(dx * dx + dy * dy);
const unitX = dx / actualLength;
const unitY = dy / actualLength;
const perpX = config.yUp ? -unitY : unitY;
const perpY = config.yUp ? unitX : -unitX;
```

**Note:** V2 has additional flexibility for explicit outward direction, but base calculation is duplicated.

**Recommendation:** Extract to `computeEdgeDirection(start, end, yUp?)` helper.

---

## LOW Priority

### 7. Extension Area Calculation

**Files and Locations:**
- `src/utils/editableAreas.ts` lines 261-282, 286-305, 309-328, 331-351

**Issue:** Same pattern repeated for top, bottom, left, right directions with only coordinate/dimension differences.

**Recommendation:** Consider parameterized approach for edge directions.

---

### 8. Tree Traversal Patterns

**Files and Locations:**
- `src/store/useBoxStore.ts` lines 210-222 (`findVoid`)
- `src/store/useBoxStore.ts` lines 225-238 (`findParent`)
- `src/store/useBoxStore.ts` lines 368-373 (`getVoidSubtreeIds`)
- `src/store/useBoxStore.ts` lines 377-393 (`getVoidAncestorIds`)

**Issue:** All follow same recursive pattern with sub-assembly checking.

**Recommendation:** Document pattern or extract base traversal utility with callback.

---

## Summary Table

| Priority | Pattern | Locations | Status |
|----------|---------|-----------|--------|
| CRITICAL | Region bounds calculation | 3 in useBoxStore | ✅ Done - `calculateChildRegionBounds()` |
| HIGH | Nested bounds recalculation | 2 in useBoxStore | ✅ Done - uses `setBoundsRegion()` |
| HIGH | findVoid duplication | store + SubdivisionControls | ✅ Done - exported from store |
| MEDIUM | Axis-based bounds access | 13+ locations | ✅ Done - `getBoundsStart/Size/setBoundsRegion` |
| MEDIUM | Vector normalization | cornerFinish.ts x2 | ✅ Done - `computeCornerVectors()` |
| MEDIUM | Finger joint unit vectors | fingerJoints.ts x2 | ✅ Done - `computeEdgeDirection()` |
| LOW | Extension area calculation | editableAreas.ts x4 | ✅ Done - `calculateExtensionArea()` helper |
| LOW | Tree traversal patterns | useBoxStore x4 | ⏭️ Reviewed - abstraction not warranted |

---

## Completed Refactoring (2026-01-26)

All items have been addressed:

1. **Region bounds calculation** - Extracted `calculateChildRegionBounds()` helper
2. **findVoid duplication** - Now exported from useBoxStore, removed duplicate in SubdivisionControls
3. **Axis-based bounds access** - Created `getBoundsStart()`, `getBoundsSize()`, `setBoundsRegion()` helpers
4. **Nested bounds recalculation** - Refactored to use `setBoundsRegion()` helper
5. **Vector normalization** - Created `computeCornerVectors()` in cornerFinish.ts
6. **Finger joint unit vectors** - Created `computeEdgeDirection()` in fingerJoints.ts
7. **Extension area calculation** - Created `calculateExtensionArea()` helper with loop over directions
8. **Tree traversal patterns** - Reviewed; functions are short, clear, and serve different purposes. Creating abstraction would add complexity without benefit.

---

## Namespace Consolidation (2026-01-26)

To address the root cause of duplication bugs ("if two UI actions should produce identical results, they must call the same function"), two namespace modules were created:

### `src/utils/bounds.ts` - BoundsOps Namespace

THE single way to perform bounds operations:

```typescript
export const BoundsOps = {
  // Accessors
  getStart,        // Get start position along axis
  getSize,         // Get size along axis
  getEnd,          // Get end position (start + size)

  // Mutators (immutable)
  setRegion,       // Create new bounds with region set
  clone,           // Deep copy bounds

  // Subdivision
  calculateChildRegion,     // Calculate child void bounds
  calculateEvenDivisions,   // Calculate evenly spaced divider positions

  // Inset operations
  calculateInsetRegions,    // Calculate lid inset regions (main + caps)
} as const;
```

### `src/utils/voidTree.ts` - VoidTree Namespace

THE single way to perform void tree operations:

```typescript
export const VoidTree = {
  // Traversal
  find,              // Find void by ID
  findParent,        // Find parent of a void
  getSubtreeIds,     // Get all IDs in subtree
  getAncestorIds,    // Get ancestor path to void
  findSubAssembly,   // Find sub-assembly by ID
  getAllSubAssemblies,

  // Mutation (immutable)
  clone,             // Deep clone tree
  update,            // Update void immutably

  // Subdivision
  createSubdivisionChildren,  // Create child voids
  subdivide,         // Subdivide a void in tree
  removeSubdivision, // Remove subdivision

  // Utilities
  generateId,        // Generate unique void ID
} as const;
```

### Other Consolidations

- **`defaultFaces`** constant in `types.ts` - eliminates repeated `{ id: 'front', solid: true }, ...` patterns
- **`createAllSolidFaces()`** helper - creates fresh copy of default faces
- **`BoundsOps.calculateInsetRegions()`** - consolidates `mainBounds` switch statements for lid inset calculations
