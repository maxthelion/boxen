# Formalized Test Matrix — Standard Scenarios for Geometry Validation

**Status:** Idea
**Captured:** 2026-02-24
**Source:** draft 103 (Problems Holding Back Speed)

## Problem

Tests use ad-hoc box configurations. There's no standard set of scenarios that every geometry-affecting feature should be validated against. The `permute()` utility in `src/builder/` enables matrix testing, but no one has defined the matrix.

## Proposed Matrix

Standard scenarios that any geometry change should pass:

| Scenario | Config | Tests |
|----------|--------|-------|
| Basic open-top | 100×80×60, top open | Panels, joints, outline points |
| Enclosed | 100×80×60, all closed | All 6 panels, all joints male/female |
| Subdivided X | 100×80×60, 2 compartments on X | Divider panels, slots, void bounds |
| Subdivided Z | 100×80×60, 2 compartments on Z | Divider panels, slots, void bounds |
| Grid 2×2 | 200×100×150, 2×2 grid | Cross-lap joints, 4 voids, intersection |
| With extensions | 100×80×60, front bottom extended 15mm | Extension geometry, corner ownership |
| With cutout | 100×80×60, rect cutout on front | Hole in panel, winding order |
| With fillet | 100×80×60, bottom corners filleted 5mm | Arc points, tangency |
| Sub-assembly | 200×150×100, drawer in subdivided void | Nested panels, joint alignment |
| Tall axis-Z | 100×80×60, axis=z | Lid assignment changes, joint genders |

## Implementation

Create `tests/fixtures/standardScenarios.ts`:

```typescript
export const STANDARD_SCENARIOS = [
  { name: 'basic-open-top', builder: () => AssemblyBuilder.basicBox(100, 80, 60) },
  { name: 'enclosed', builder: () => AssemblyBuilder.enclosedBox(100, 80, 60) },
  // ...
];
```

Then a `tests/integration/standardMatrix.test.ts` that runs ComprehensiveValidator against each.

New features would add scenario-specific assertions to this matrix.

## What Exists

- `src/builder/permute.ts` — `permute()`, `permuteNamed()` for test matrices
- `src/engine/validators/ComprehensiveValidator.ts` — all-in-one geometry validation
- `src/engine/integration/comprehensiveGeometry.test.ts` — existing integration tests (but not matrix-structured)

## Deliverable

- `tests/fixtures/standardScenarios.ts` with 10+ standard configurations
- `tests/integration/standardMatrix.test.ts` running validator against all
- Documentation in `docs/testing.md` (or new section) explaining the matrix approach
