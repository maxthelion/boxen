# Add integration tests for safeSpace.ts: calculateSafeSpace result paths don't overlap finger joint regions

**Status:** Idea
**Author:** testing-analyst
**Captured:** 2026-02-24

## Gap

`src/engine/safeSpace.ts` is a 2361-line core module with **zero tests**. It calculates the "safe space" — the regions on a panel where users can add cutouts, holes, and edge paths without destroying the structural finger joints and cross-lap slots that hold the box together.

The module was recently put to work by TASK-71882470 (2D editing for divider panels) and exposes a large public API:
- `calculateSafeSpace()` — main entry point, returns result paths (rectangles where drawing is allowed)
- `isPointInSafeSpace()`, `isRectInSafeSpace()`, `isCircleInSafeSpace()` — geometry hit tests
- `analyzePath()` — classifies drawn polygons as interior/boundary/exterior
- `mergeEdgePaths()`, `extractEdgePathFromPolygon()`, `rectToEdgePath()` etc. — complex path operations

None of these have any test coverage.

## Proposed Test

Write integration tests in `src/engine/integration/safeSpace.test.ts` using `AssemblyBuilder` and `generatePanelsFromNodes()` so tests run against real panels with finger joints (100+ points each).

**Scenario 1 — face panel safe space excludes joint margins:**
```typescript
const builder = AssemblyBuilder.enclosedBox(200, 150, 100);
const { engine, panels } = builder.build();
const frontPanel = panels.find(p => p.source.faceId === 'front')!;
const safeSpace = calculateSafeSpace(frontPanel, faces, config);

// Result paths must not extend into joint margin (MT=6 from each joined edge)
const MT = 6;
for (const path of safeSpace.resultPaths) {
  const minX = Math.min(...path.map(p => p.x));
  const maxX = Math.max(...path.map(p => p.x));
  const minY = Math.min(...path.map(p => p.y));
  const maxY = Math.max(...path.map(p => p.y));
  expect(minX).toBeGreaterThanOrEqual(MT);   // left edge joint excluded
  expect(maxX).toBeLessThanOrEqual(frontPanel.width - MT);  // right edge
  expect(minY).toBeGreaterThanOrEqual(MT);   // top edge joint excluded
  expect(maxY).toBeLessThanOrEqual(frontPanel.height - MT); // bottom edge
}
```

**Scenario 2 — divider panel with slot excludes slot region:**
```typescript
const builder = AssemblyBuilder.enclosedBox(200, 150, 100).subdivideEvenly('root', 'z', 2);
const { engine, panels } = builder.build();
const divider = panels.find(p => p.source.type === 'divider')!;
const safeSpace = calculateSafeSpace(divider, faces, config);

// Panel has slot holes where faces intersect; safe space must exclude them
expect(divider.holes.length).toBeGreaterThan(0); // panel has slots
// The result paths should be split around the slot
expect(safeSpace.resultPaths.length).toBeGreaterThan(1); // slot divides safe area
```

**Scenario 3 — isRectInSafeSpace rejects shape overlapping joint margin:**
```typescript
// A rect that crosses the joint boundary must be rejected
const inJointMargin = isRectInSafeSpace(
  { x: 0, y: 50, width: 20, height: 20 }, // starts at left edge (inside joint)
  safeSpace
);
expect(inJointMargin).toBe(false);

// A rect fully inside the safe area must be accepted
const fullyInside = isRectInSafeSpace(
  { x: 20, y: 50, width: 30, height: 20 }, // starts after MT margin
  safeSpace
);
expect(fullyInside).toBe(true);
```

Use the `AssemblyBuilder` fixture from `src/builder/` and call `generatePanelsFromNodes(engine._scene)` to get realistic panels with full finger joint geometry.

## Why This Matters

`calculateSafeSpace()` is the gatekeeper between user drawing input and the structural constraints of the box. If it returns incorrect result paths:

- Users can place cutouts inside finger joint regions, silently destroying the structural connections
- The box becomes uncut-able or will fall apart when assembled
- No test will catch it — all other geometry tests would still pass

The module is large (2361 lines), handles multiple panel types (face/divider) and edge cases (open edges, edge extensions, cross-lap slots), and was extended for divider editing in TASK-71882470. The risk of a regression in this untested module is high.
