# Implementation Plan: Finger Joint System v2

## Overview

This is a significant refactor that changes finger joint calculation from per-edge to per-axis at the assembly level. The approach is to build the new system alongside the old, then switch over.

---

## Phase 1: Core Data Structures

### 1.1 Add Types (`src/types.ts`)

```typescript
// Finger points for one axis
interface AxisFingerPoints {
  axis: 'x' | 'y' | 'z';
  points: number[];           // Transition positions along axis
  innerOffset: number;        // Distance from MT-inset to first finger
  fingerLength: number;       // Actual finger length used
}

// Assembly-level finger configuration
interface AssemblyFingerData {
  x: AxisFingerPoints;
  y: AxisFingerPoints;
  z: AxisFingerPoints;
}

// Joint gender
type JointGender = 'male' | 'female';

// Edge joint specification
interface EdgeJoint {
  axis: 'x' | 'y' | 'z';
  gender: JointGender;
  startPos: number;           // Start position along axis (after MT inset)
  endPos: number;             // End position along axis
}
```

### 1.2 Create Finger Point Calculator (`src/utils/fingerPoints.ts`)

New file with:
- `calculateAxisFingerPoints(axisLength, config)` - Core algorithm
- `calculateAssemblyFingerPoints(assembly)` - All 3 axes
- `getFingerPointsInRange(points, start, end)` - Filter for inset panels

---

## Phase 2: Assembly Integration

### 2.1 Extend Store (`src/store/useBoxStore.ts`)

Add to state:
- `mainAssemblyFingerData: AssemblyFingerData | null`
- `subAssemblyFingerData: Map<string, AssemblyFingerData>`

Add actions:
- `calculateFingerPoints()` - Recalculate on config change
- `getFingerPointsForEdge(assemblyId, axis)` - Lookup

### 2.2 Trigger Recalculation

Call `calculateFingerPoints()` when:
- Box dimensions change
- Material thickness changes
- Finger width changes
- Min distance (corner gap) changes

---

## Phase 3: Panel Generation Refactor

### 3.1 Simplify `generateFingerJointPath()` (`src/utils/fingerJoints.ts`)

Current function calculates positions. New version:
- Takes finger points array as input
- Takes gender (male/female) as input
- Filters points to edge range
- Generates path based on gender

```typescript
function generateFingerJointPathV2(
  start: Point,
  end: Point,
  fingerPoints: number[],  // Pre-calculated from assembly
  gender: JointGender,
  materialThickness: number,
  edgeStartPos: number,    // Where this edge starts on the axis
  edgeEndPos: number,      // Where this edge ends on the axis
): Point[]
```

### 3.2 Refactor `panelGenerator.ts`

Remove:
- `fingerCorners` calculation
- Canonical direction swap logic
- `invertPerpendicular` flag
- Per-edge corner gap calculation

Replace with:
- Get finger points from assembly for edge's axis
- Determine gender from rules (lid config, priority)
- Filter points to edge range
- Call simplified `generateFingerJointPathV2()`

---

## Phase 4: Gender Assignment

### 4.1 Create Gender Rules (`src/utils/genderRules.ts`)

```typescript
function getEdgeGender(
  faceId: FaceId,
  edgePosition: 'top' | 'bottom' | 'left' | 'right',
  adjacentFaceId: FaceId,
  assembly: AssemblyConfig,
): JointGender | null  // null = straight edge (no joint)
```

Logic:
1. If adjacent face is open → null (straight edge)
2. If this face is a lid → use lid gender config
3. If adjacent face is a lid → opposite of lid gender
4. Otherwise → wall priority system

### 4.2 Divider Gender

Dividers are always male. Receiving panels have female slots aligned to assembly finger points.

---

## Phase 5: Sub-Assembly Support

### 5.1 Independent Finger Points

Each sub-assembly calculates its own finger points based on its bounding box.

### 5.2 Divider Inheritance

Dividers use the finger points of their containing assembly (not sub-assembly).

---

## Phase 6: Remove Old Code

### Files to Clean Up

1. **`src/utils/fingerJoints.ts`**
   - Remove old `generateFingerJointPath()` or rename to legacy
   - Remove `originalLength`, `patternOffset`, `invertPerpendicular` params

2. **`src/utils/panelGenerator.ts`**
   - Remove `fingerCorners` calculation
   - Remove canonical direction swap
   - Remove `shouldTabOut()` (replaced by gender rules)

3. **`src/components/Box3D.tsx`**
   - Update debug anchor positions if needed

---

## Implementation Order

```
Week 1: Foundation
├── Day 1-2: Types and fingerPoints.ts
├── Day 3-4: Store integration
└── Day 5: Unit tests for finger point calculation

Week 2: Panel Generation
├── Day 1-2: New generateFingerJointPathV2
├── Day 3-4: Gender rules
└── Day 5: Refactor panelGenerator.ts

Week 3: Integration & Cleanup
├── Day 1-2: Wire everything together
├── Day 3: Sub-assembly support
├── Day 4: Remove old code
└── Day 5: Full acceptance testing
```

---

## Testing Strategy

### Unit Tests

1. **Finger point calculation**
   - Correct number of points for various dimensions
   - Symmetric distribution
   - Proper inner offset with remainder

2. **Gender assignment**
   - Lid gender propagation
   - Wall priority
   - Divider always male

3. **Path generation**
   - Points filtered to range
   - Male produces tabs out
   - Female produces slots in

### Integration Tests

1. **Mating edges align**
   - Same finger positions on both sides
   - Tabs meet slots

2. **Inset panels**
   - Correct finger point filtering
   - No fingers outside valid range

3. **Sub-assemblies**
   - Independent finger points
   - Don't inherit from parent

### Visual Tests

1. Run app, create boxes, verify:
   - Joints look correct
   - No gaps or overlaps
   - Extensions still work

---

## Rollback Plan

Keep old code in place with feature flag until new system is verified:

```typescript
const USE_NEW_FINGER_SYSTEM = true;  // Toggle to roll back

if (USE_NEW_FINGER_SYSTEM) {
  // New assembly-level system
} else {
  // Old per-edge system
}
```

Remove flag and old code once confident.

---

## Files Changed Summary

| File | Change Type |
|------|-------------|
| `src/types.ts` | Add new types |
| `src/utils/fingerPoints.ts` | **NEW FILE** |
| `src/utils/genderRules.ts` | **NEW FILE** |
| `src/utils/fingerJoints.ts` | Major refactor |
| `src/utils/panelGenerator.ts` | Major refactor |
| `src/store/useBoxStore.ts` | Add finger point state |
| `src/utils/edgeMating.test.ts` | Update tests |
| `src/utils/panelGenerator.test.ts` | Update tests |
