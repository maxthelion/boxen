# Test Fixtures Rollout Plan

**Created:** 2026-02-04
**Status:** Ready for implementation
**Base Branch:** feature/fillet-all-corners-integration-tests
**Feature Branch:** feature/composable-test-fixtures

## Overview

Implement a composable test fixture system for matrix-driven testing of panel operations. The goal is to easily test operations across all permutations of panel state (extensions, cutouts, subdivisions, etc.).

## Phase 1: Build the Fixture System

### Task 1.1: Core TestFixture Class
**Size:** S
**Files:** `src/test/fixtures/TestFixture.ts`, `src/test/fixtures/types.ts`

Create the basic `TestFixture` class with:
- `static basicBox(w, h, d)` - Creates engine with open-top box
- `static enclosedBox(w, h, d)` - Creates engine with all faces
- `withOpenFaces(faces: FaceId[])` - Configure which faces are open
- `panel(face: FaceId)` - Returns PanelBuilder for the face panel
- `clone()` - Deep clone for branching
- `build()` - Execute queued operations, return FixtureResult

**Key detail:** Store `faceId` not `panelId` for panel selection. Re-resolve panel by face after build.

```typescript
interface FixtureResult {
  engine: Engine;
  panels: PanelPath[];
  panel?: PanelPath;
}
```

**Acceptance criteria:**
- [ ] Can create basic box with `TestFixture.basicBox(100, 80, 60)`
- [ ] Can select panel with `.panel('front')`
- [ ] `clone()` creates independent copy
- [ ] `build()` returns engine and panels

---

### Task 1.2: PanelBuilder Class
**Size:** S
**Files:** `src/test/fixtures/PanelBuilder.ts`

Create `PanelBuilder` for chaining panel operations:
- `withExtension(edge: EdgeId, amount: number)` - Queue extension operation
- `withExtensions(edges: EdgeId[], amount?: number)` - Multiple extensions
- `withCutout(shape: Shape)` - Queue cutout operation
- `withCutouts(shapes: Shape[])` - Multiple cutouts
- `withFillet(corners: string[], radius: number)` - Queue fillet
- `withChamfer(corners: string[], size: number)` - Queue chamfer
- `and()` - Return to TestFixture for more config
- `build()` - Delegate to fixture.build()

**Key detail:** Operations are queued (lazy), not executed immediately.

**Acceptance criteria:**
- [ ] Can chain `.withExtension('top', 30).withCutout(rect(...))`
- [ ] Operations queue until `.build()` is called
- [ ] `and()` returns to fixture for further configuration

---

### Task 1.3: Shape Helpers
**Size:** S
**Files:** `src/test/fixtures/shapes.ts`

Create shape helper functions:
- `rect(x, y, width, height)` - Rectangle shape
- `polygon(...points)` - Arbitrary polygon

```typescript
interface Shape {
  toPath(): Point2D[];
  points: number;  // Corner count for eligibility calculations
}
```

**Acceptance criteria:**
- [ ] `rect(10, 10, 20, 20).toPath()` returns 4 points
- [ ] `rect(...).points` equals 4
- [ ] `polygon([0,0], [10,0], [5,10]).points` equals 3

---

### Task 1.4: Permutation Generator
**Size:** S
**Files:** `src/test/fixtures/permute.ts`

Create `permute()` function for matrix generation:

```typescript
const matrix = permute({
  extensions: [[], ['top'], ['top', 'left']],
  cutouts: [[], [rect(10, 10, 20, 20)]],
});
// Returns: [
//   ['extensions:[], cutouts:[]', { extensions: [], cutouts: [] }],
//   ['extensions:[], cutouts:[...]', { extensions: [], cutouts: [...] }],
//   ...
// ]
```

**Acceptance criteria:**
- [ ] Generates all combinations (cartesian product)
- [ ] Returns array of [name, config] tuples for `describe.each()`
- [ ] Name string is human-readable

---

### Task 1.5: Index and Exports
**Size:** S
**Files:** `src/test/fixtures/index.ts`

Create public API:
```typescript
export { TestFixture } from './TestFixture';
export { rect, polygon } from './shapes';
export { permute } from './permute';
export type { Shape, FixtureResult } from './types';
```

**Acceptance criteria:**
- [ ] All exports available from `'../test/fixtures'`
- [ ] TypeScript types exported

---

## Phase 2: Fillet Eligible Points Testing

### Task 2.1: Basic Eligible Points Tests
**Size:** M
**Files:** `src/test/fixtures/filletEligibility.test.ts`

Write tests for fillet corner eligibility using fixtures:

```typescript
describe('Fillet corner eligibility', () => {
  it('basic panel has 4 eligible corners', () => {
    const { panel } = TestFixture.basicBox(100, 80, 60)
      .panel('front')
      .build();
    expect(panel.allCornerEligibility.length).toBe(4);
  });

  it('panel with 1 extension has 6 eligible corners', () => {
    const { panel } = TestFixture.basicBox(100, 80, 60)
      .panel('front')
      .withExtension('top', 30)
      .build();
    expect(panel.allCornerEligibility.length).toBe(6);
  });

  // ... more cases
});
```

Test cases to cover:
- [ ] Basic panel (0 extensions) → 4 corners
- [ ] 1 extension → 6 corners
- [ ] 2 adjacent extensions → 8 corners
- [ ] 2 opposite extensions → 8 corners
- [ ] 4 extensions → 12 corners
- [ ] Panel with cutout → 4 + cutout corners
- [ ] Panel with extension + cutout

**Acceptance criteria:**
- [ ] Tests pass or fail with clear error messages
- [ ] Any failures indicate bugs to fix

---

### Task 2.2: Extension Permutation Matrix
**Size:** M
**Files:** `src/test/fixtures/extensionMatrix.test.ts`

Matrix test across extension combinations:

```typescript
const extensionMatrix = permute({
  edges: [
    [],
    ['top'],
    ['top', 'bottom'],
    ['top', 'left'],
    ['top', 'right', 'bottom', 'left'],
  ],
});

describe.each(extensionMatrix)('extensions: %s', (name, { edges }) => {
  it('has correct corner count', () => {
    const { panel } = TestFixture.basicBox(100, 80, 60)
      .panel('front')
      .withExtensions(edges, 20)
      .build();

    const expected = 4 + (edges.length * 2);
    expect(panel.allCornerEligibility.length).toBe(expected);
  });

  it('produces valid geometry', () => {
    const { engine } = TestFixture.basicBox(100, 80, 60)
      .panel('front')
      .withExtensions(edges, 20)
      .build();

    const result = checkEngineGeometry(engine);
    expect(result.valid).toBe(true);
  });
});
```

**Acceptance criteria:**
- [ ] All 5 extension combinations tested
- [ ] Each verifies corner count AND geometry validity
- [ ] Any failures documented as bugs

---

## Phase 3: Documentation

### Task 3.1: Testing Guide Documentation
**Size:** S
**Files:** `docs/testing-with-fixtures.md`

Write documentation for the fixture system:
1. Why composable fixtures (the problem they solve)
2. Core API reference (TestFixture, PanelBuilder, permute)
3. Example: testing a new operation
4. Best practices:
   - Use branching for before/after tests
   - Use matrix for permutation coverage
   - Always check geometry validity

**Acceptance criteria:**
- [ ] New developers can understand and use fixtures
- [ ] Examples are copy-pasteable

---

### Task 3.2: Update CLAUDE.md
**Size:** S
**Files:** `CLAUDE.md`

Add section on test fixtures to CLAUDE.md:
- Reference `docs/testing-with-fixtures.md`
- Update "Test-First Development" section to mention fixtures
- Add fixture usage to "Adding New Operations" checklist

**Acceptance criteria:**
- [ ] CLAUDE.md references fixture system
- [ ] New operation checklist includes fixture tests

---

## Phase 4: Migrate Existing Tests

### Task 4.1: Identify Migration Candidates
**Size:** S
**Files:** None (analysis task)

Review existing integration tests and identify which would benefit from fixture rewrite:
- `src/engine/integration/comprehensiveGeometry.test.ts`
- Any tests with repetitive engine setup
- Tests that could use matrix coverage

Create list in `docs/fixture-migration-candidates.md`.

**Acceptance criteria:**
- [ ] List of files with migration benefit
- [ ] Priority order (high/medium/low)

---

### Task 4.2: Migrate One Test File (Proof of Concept)
**Size:** M
**Files:** TBD based on 4.1

Pick highest-priority candidate and rewrite using fixtures.

**Acceptance criteria:**
- [ ] Tests still pass
- [ ] Code is more readable
- [ ] Coverage unchanged or improved

---

## Phase 5: Gap Analysis

### Task 5.1: Coverage Gap Analysis
**Size:** S
**Files:** `docs/test-coverage-gaps.md`

Using the permutation matrix as a guide, identify untested scenarios:
- Which extension combinations lack tests?
- Which operation combinations lack tests?
- Which panel states (cutouts, subdivisions) lack coverage?

**Acceptance criteria:**
- [ ] List of untested permutations
- [ ] Priority for adding coverage

---

## Task Dependency Graph

```
Phase 1 (Build System):
  1.1 → 1.2 → 1.5
  1.3 → 1.5
  1.4 → 1.5

Phase 2 (Testing):
  1.5 → 2.1 → 2.2

Phase 3 (Docs):
  2.2 → 3.1 → 3.2

Phase 4 (Migration):
  2.2 → 4.1 → 4.2

Phase 5 (Gaps):
  2.2 → 5.1
```

## Agent Task Files

Create these task files in `.orchestrator/shared/queue/incoming/`:

1. `TASK-test-fixtures-1-1-core-class.md` (Task 1.1)
2. `TASK-test-fixtures-1-2-panel-builder.md` (Task 1.2)
3. `TASK-test-fixtures-1-3-shapes.md` (Task 1.3)
4. `TASK-test-fixtures-1-4-permute.md` (Task 1.4)
5. `TASK-test-fixtures-1-5-exports.md` (Task 1.5)

Start with Phase 1 tasks. Phase 2+ tasks created after Phase 1 complete.
