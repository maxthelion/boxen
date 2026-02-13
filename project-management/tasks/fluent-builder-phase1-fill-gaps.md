# Fill Operation Gaps in TestFixture Fluent Builder

**Priority:** Medium
**Source:** Draft #032 (fluent builder extraction)

## Context

`src/test/fixtures/TestFixture.ts` provides a fluent builder for setting up engine state in tests. Currently it only supports:
- `basicBox()` / `enclosedBox()` factory methods
- `withOpenFaces()`
- `panel(face)` selection with `PanelBuilder` for edge operations

Most tests (including the newly-added terminating divider joint tests) bypass the builder entirely and use raw `engine.dispatch()` + `engine.createAssembly()`. The builder is missing all subdivision, sub-assembly, and configuration operations.

## Goal

Add the missing builder methods so that test setup can be expressed as fluent chains instead of raw dispatch calls. This is Phase 1 only — filling gaps. Do NOT move files or refactor existing tests.

## Methods to Add

Add these chainable methods to `TestFixture`:

| Method | Engine Action | Notes |
|--------|--------------|-------|
| `.subdivide(voidSelector, axis, position)` | `ADD_SUBDIVISION` | `voidSelector` is `'root'` or a void ID |
| `.subdivideEvenly(voidSelector, axis, count)` | Multiple `ADD_SUBDIVISION` | Compute evenly-spaced positions from void bounds |
| `.grid(voidSelector, xCount, zCount)` | Calls `rootVoid.subdivideGrid()` | Uses the existing grid subdivision path |
| `.withDimensions({ width?, height?, depth? })` | `SET_DIMENSIONS` | Partial update |
| `.withMaterial(config)` | `SET_MATERIAL` | MaterialConfig partial |
| `.withFeet(config)` | `SET_FEET_CONFIG` | |
| `.withLid(face, config)` | `SET_LID_CONFIG` | |
| `.withAxis(axis)` | `SET_ASSEMBLY_AXIS` | |

### Void Selection

The tricky part is targeting voids. The builder needs a way to refer to child voids created by subdivision. Options:

- **By index:** `.subdivide('root', 'x', 100)` creates two child voids. `.subdivide(childVoid(0), 'z', 50)` targets the first child. Requires the builder to track void IDs from snapshot after each subdivision.
- **By path:** `.void('root/0')` or `.void('root').child(0)`.
- **Simplest approach:** After each subdivision, expose the child void IDs so the next operation can reference them. E.g., `fixture.subdivide('root', 'x', 100)` internally snapshots the engine, finds the new child voids, and stores them as `fixture.lastChildVoids`.

Recommend the simplest approach — store child void IDs after each subdivision and provide a `.childVoid(index)` accessor. Keep it minimal; don't over-design.

## Success Criteria

1. All new methods are implemented and chainable
2. Each method has a unit test in `src/test/fixtures/TestFixture.test.ts`
3. A new integration test demonstrates a subdivision scenario built entirely with the fluent API (e.g., the terminating divider scenario from `tests/integration/joints/terminatingDividerJoints.test.ts` rewritten as a builder chain)
4. Existing tests are NOT modified (that's a separate Phase 2/3 task)
5. All existing tests still pass

## Example of Desired API

```typescript
// Current (raw dispatch):
const engine = createEngine();
engine.createAssembly(200, 150, 100, { thickness: 6, fingerWidth: 10, fingerGap: 1.5 });
engine.dispatch({ type: 'ADD_SUBDIVISION', targetId: 'main-assembly', payload: { voidId: 'root', axis: 'x', position: 100 } });
const snapshot = engine.getSnapshot();
// ... find child void ID from snapshot ...
engine.dispatch({ type: 'ADD_SUBDIVISION', targetId: 'main-assembly', payload: { voidId: childVoidId, axis: 'z', position: 50 } });

// Desired (fluent):
const { engine, panels } = TestFixture.basicBox(200, 150, 100, { thickness: 6, fingerWidth: 10, fingerGap: 1.5 })
  .subdivide('root', 'x', 100)
  .subdivide(f => f.childVoid(0), 'z', 50)
  .build();
```

## Files to Modify

- `src/test/fixtures/TestFixture.ts` — Add new methods
- `src/test/fixtures/TestFixture.test.ts` — Add tests for new methods
- `src/test/fixtures/types.ts` — Add any new types needed

## What NOT to Do

- Do not move files out of `src/test/fixtures/`
- Do not refactor existing tests to use the new methods
- Do not add operations that don't exist in the engine yet
- Do not over-engineer void selection — keep it simple
