# Comprehensive Geometry Integration Test Plan

## Overview

A test suite that exercises all major operations and validates the resulting geometry against documented rules. Tests run operations in realistic sequences, then feed the object tree into validators that check global 3D alignment, relative dimensions, and joint correctness.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Test Scenarios                            │
│  (scale, outset, push-pull, subdivisions, combinations)     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Engine Operations                         │
│  engine.dispatch() → builds object tree                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Comprehensive Geometry Validator                │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Global    │  │  Relative   │  │   Joint     │         │
│  │  3D Space   │  │ Dimensions  │  │  Alignment  │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Finger    │  │   Parent/   │  │    Path     │         │
│  │   Points    │  │   Child     │  │  Validity   │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    Test Results + Diagnostics
```

## Validator Modules

### 1. Global 3D Space Validator
Checks that all geometry is correctly positioned in world space.

**Tests:**
- Assembly is centered at origin (or expected position)
- Face panels are at correct world positions (±width/2, ±height/2, ±depth/2)
- Face panel normals point outward from assembly center
- Divider panels are at their declared split positions
- No panels overlap in 3D space (except at joints)
- Panel thickness is consistent with material config

### 2. Relative Dimensions Validator
Checks that objects have correct sizes relative to each other.

**Tests:**
- Root void = assembly - 2×MT on each axis
- Child voids fit within parent void bounds
- Child void sizes sum to parent size minus divider thickness
- Divider body = void size (+ MT extensions to walls)
- Face panel body = assembly dimension on its plane
- Sub-assembly fits within parent void with clearance

### 3. Joint Alignment Validator
Checks that mating edges align in world space.

**Tests:**
- Face-to-face corners: mating edges at same world position
- Divider-to-face edges: divider edge at face inner surface
- Divider-to-divider edges: perpendicular dividers meet at intersection point
- Tab tips reach assembly boundary (through face slots)
- Slot bottoms at face inner surface

### 4. Finger Point Validator
Checks that finger patterns use shared reference points.

**Tests:**
- All panels on same axis use identical finger points
- Divider finger region = face finger region (both = maxJoint)
- Tab positions on divider match slot positions on face
- Finger pattern is symmetric (odd number of sections)
- Inner offset is consistent across mating edges

### 5. Parent/Child Intersection Validator
Checks that nested structures have correct relationships.

**Tests:**
- Divider slots exist where perpendicular dividers intersect
- Slot positions match intersecting divider's finger pattern
- Face slots exist for all dividers that reach that face
- Nested void boundaries align with parent void + divider positions
- Sub-assembly panels don't extend beyond parent void

### 6. Path Validity Validator
Checks that 2D outlines are valid for laser cutting.

**Tests:**
- Outline is counter-clockwise, holes are clockwise
- No duplicate consecutive points
- Holes are strictly inside outline bounds
- Slots don't touch panel boundary edges
- No degenerate geometry (zero area, collinear points)

---

## Test Scenarios

### Scenario 1: Basic Box
**Setup:** Create 200×150×100 box with MT=3

**Validations:**
- 6 face panels at correct positions
- All face-to-face joints align
- Finger patterns consistent on each axis
- No slots (no subdivisions)

---

### Scenario 2: Open Lid
**Setup:** Create box, toggle top face open

**Validations:**
- 5 face panels (top missing)
- Remaining joints still align
- Side panels extend to where top was (no inset)
- Finger gender changes appropriately

---

### Scenario 3: Single Subdivision
**Setup:** Create box, subdivide on X axis at center

**Validations:**
- 1 divider panel at X=100
- Divider body spans full void (Y and Z axes)
- Divider has tabs on all 4 edges (meeting solid faces)
- Face panels have slots for divider
- **Divider tab positions = face slot positions** (the current bug)
- 2 child voids created, each half the X dimension

---

### Scenario 4: Double Subdivision (Same Axis)
**Setup:** Create box, add 2 subdivisions on X axis

**Validations:**
- 2 divider panels
- 3 child voids
- Each divider's tabs align with face slots
- No divider-to-divider slots (parallel dividers)

---

### Scenario 5: Cross Subdivision
**Setup:** Create box, subdivide on X, then subdivide one child on Y

**Validations:**
- 2 divider panels (one X, one Y)
- Y-divider has slots where X-divider intersects
- X-divider has slots where Y-divider intersects
- 3 child voids (one split further)
- Nested void boundaries correct

---

### Scenario 6: Deep Nesting (3 levels)
**Setup:** Create box, subdivide X, subdivide child Y, subdivide grandchild Z

**Validations:**
- 3 divider panels on different axes
- All divider-to-divider intersections have slots
- All divider-to-face intersections have slots
- Void tree depth = 3
- Each level's voids sum to parent size

---

### Scenario 7: Subdivision with Open Face
**Setup:** Create box, open front face, subdivide on X

**Validations:**
- Divider's front edge has no tabs (open face)
- Divider body extends to where front face would be
- Finger pattern still aligns on remaining edges
- No slot in front face (doesn't exist)

---

### Scenario 8: Scale Operation
**Setup:** Create box with subdivision, scale to new dimensions

**Validations:**
- All panels resize proportionally
- Finger patterns recalculated for new dimensions
- Subdivision positions scale (if percentage mode)
- Joint alignment maintained after scale

---

### Scenario 9: Outset Operation
**Setup:** Create box, outset front face

**Validations:**
- Front panel body extends beyond bounding box
- Finger joints still anchored at original bounding box
- Adjacent panels unchanged
- No overlap with adjacent face panels

---

### Scenario 10: Push-Pull Operation
**Setup:** Create box, push-pull front face outward

**Validations:**
- Assembly depth increases
- All panels resize to new dimensions
- Finger patterns recalculated
- Subdivisions adjust to new space

---

### Scenario 11: Feet Addition
**Setup:** Create box, add feet to bottom

**Validations:**
- Bottom-adjacent panels have edge extensions
- Feet extend below bounding box
- Finger joints still at bounding box level
- Foot geometry valid (correct dimensions)

---

### Scenario 12: Sub-Assembly
**Setup:** Create box, subdivide, add sub-assembly (drawer) in one void

**Validations:**
- Sub-assembly fits within void with clearance
- Sub-assembly has own finger patterns
- No interference between parent and child panels
- Sub-assembly face positions correct relative to parent void

---

### Scenario 13: Complex Combined Operations
**Setup:**
1. Create 300×200×150 box
2. Open top (lid)
3. Subdivide X at 33% and 66%
4. Subdivide middle void on Y
5. Add sub-assembly in one void
6. Outset front face
7. Add feet

**Validations:**
- All previous validations apply
- No operation breaks previous geometry
- Final object tree is fully valid
- All joints align across the complex structure

---

## Implementation Structure

```typescript
// src/engine/integration/comprehensiveGeometry.test.ts

describe('Comprehensive Geometry Validation', () => {
  let engine: Engine;
  let validator: ComprehensiveValidator;

  beforeEach(() => {
    engine = createEngine();
    validator = new ComprehensiveValidator(engine);
  });

  describe('Scenario 1: Basic Box', () => {
    beforeEach(() => {
      engine.createAssembly(200, 150, 100, { thickness: 3, fingerWidth: 10, fingerGap: 1.5 });
    });

    it('passes all geometry validations', () => {
      const result = validator.validateAll();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  // ... more scenarios
});
```

```typescript
// src/engine/validators/ComprehensiveValidator.ts

export class ComprehensiveValidator {
  constructor(private engine: Engine) {}

  validateAll(): ValidationResult {
    const results: ValidationResult[] = [
      this.validateGlobal3DSpace(),
      this.validateRelativeDimensions(),
      this.validateJointAlignment(),
      this.validateFingerPoints(),
      this.validateParentChildIntersections(),
      this.validatePathValidity(),
    ];

    return this.mergeResults(results);
  }
}
```

---

## Priority Order

1. **Finger Point Validator** - Catches the current bug (divider/face mismatch)
2. **Joint Alignment Validator** - Catches world-space misalignment
3. **Relative Dimensions Validator** - Catches sizing errors
4. **Parent/Child Intersection Validator** - Catches slot generation errors
5. **Global 3D Space Validator** - Catches positioning errors
6. **Path Validity Validator** - Already exists, integrate it

---

## Success Criteria

- All 13 scenarios pass all validations
- Validator provides clear error messages identifying:
  - Which rule was violated
  - Which objects are involved
  - Expected vs actual values
  - Suggested fix direction
- Tests run in < 5 seconds total
- Easy to add new scenarios and validations
