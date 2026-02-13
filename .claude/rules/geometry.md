# Geometry Rules

Quick reference for geometry constraints. Full documentation in `docs/geometry rules/geometry-rules.md`.

## Physical Constraints

- **No overlapping material**: Two panels must never occupy the same physical space
- **All paths axis-aligned**: Horizontal and vertical segments only, no diagonals
- **Material thickness (MT)**: Uniform for an entire assembly

## Assembly Bounding Box

- 6 planes defining outer faces, 3 axes with shared finger points
- Face panel body dimensions match bounding box on the face's plane
- Face panels can extend beyond bounding box (feet, edge extensions)
- **Finger joints stay anchored to bounding box** even when panels extend
- Push-pull changes bounding box dimensions; extensions do not

## Joint System

### Edge States
- **Male** (tabs out) — tabs pass through slots in the mating panel
- **Female** (slots) — receives tabs from the mating panel
- **Open** (straight) — no joint, adjacent face is open/removed

### Gender Determination
- **Face-to-face**: Wall priority (lower = male, higher = female). Lids have configurable gender.
- **Divider-to-face**: Divider is always male; face gets slots
- **Divider-to-divider**: Depends on crossing vs terminating (see below)

### Wall Priority
front(1) < back(2) < left(3) < right(4) < top(5) < bottom(6). Lower = male = occupies corners.

### Finger Alignment
- All panels on same axis use identical finger points (from assembly)
- maxJointLength = axis dimension - 2×MT
- Minimum 3 sections required (finger-hole-finger)
- **Tab positions on dividers must match slot positions on faces**

## Voids and Subdivisions

- Root void = assembly - 2×MT on each axis
- Void boundary = face panel inner surface
- Child voids fit within parent bounds (share up to 5 planes with parent)
- Grid subdivision: dividers span full parent void, cross each other
- Sequential subdivision: child dividers span only their parent child void

## Divider-to-Divider Joints

### Crossing vs Terminating
- **Crossing**: Divider exists on BOTH sides of the other (void bounds extend past in both directions) → cross-lap joint
- **Terminating**: Divider exists on ONE side only (void bounds end at the other divider) → normal finger joint

### Cross-Lap Joints (crossing only)
- Half-depth notches from opposite edges, interlocking
- Axis priority: alphabetically lower axis from top (X < Y < Z)
- Only when void bounds extend past the other divider on BOTH sides

### Normal Joints (terminating)
- Shorter divider's terminating edge gets male gender (tabs out)
- Longer divider gets slot holes (same as face-to-divider)
- Body extends MT beyond void to reach longer divider's far surface

## Divider Body Span

- `bodyStart = atLowWall ? 0 : boundsLow - MT`
- `bodyEnd = atHighWall ? axisDim : boundsLow + boundsSize + MT`
- At face wall: extends to assembly boundary (finger region matches face)
- At divider: extends MT beyond void to reach adjacent divider
- **Divider finger region must equal face finger region** (both = maxJoint)

## Edge Extensions

- **Eligibility**: Only open or female edges can be extended (not male)
- **Full width**: Extension sides span full panel dimension
- **Far edge open**: Extension cap has no finger joints (straight line)
- **Corner ownership**: When two adjacent panels both extend, female yields by MT
- **Long extensions**: Should develop finger joints when > cornerGap + fingerWidth + MT

## Path Geometry

- Outline: CCW winding; Holes: CW winding
- Holes must be strictly inside outline bounds
- Minimum 3 points per path; no consecutive duplicates
- All segments horizontal or vertical

## Testing

Run comprehensive geometry tests:
```bash
npm run test:run -- src/engine/integration/comprehensiveGeometry.test.ts
```

Validators:
- `src/engine/geometryChecker.ts` — void bounds, panel sizes, joints, slots, paths
- `src/engine/validators/ComprehensiveValidator.ts` — integration test validation
- `src/engine/validators/PathChecker.ts` — axis-aligned, no duplicates, minimum points
- `src/engine/validators/EdgeExtensionChecker.ts` — extension eligibility, width, corners
