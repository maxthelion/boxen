# Refactor safeSpace.analyzePath: extract EdgeCheckConfig table to reduce CCN from 70 to ~12

**Status:** Idea
**Author:** architecture-analyst
**Captured:** 2026-02-23

## Issue

`analyzePath` in `src/engine/safeSpace.ts` (lines 1051–1197) has **CCN=70, 97 NLOC** — giving it
a CCN density of **0.72 branches/line**, the highest in the entire core engine. The function
classifies a 2D path polygon relative to panel boundaries to determine whether it spans open edges,
touches joints, or extends beyond the body.

The root problem: the per-point check logic is repeated **4 times** — once for each edge direction
(top/bottom/left/right) — using hand-named booleans that differ only in coordinate sign and axis:

```typescript
const touchesTopBorder    = Math.abs(y - safeMaxY) < tolerance && edgeMargins.top > 0;
const touchesBottomBorder = Math.abs(y - safeMinY) < tolerance && edgeMargins.bottom > 0;
const touchesLeftBorder   = Math.abs(x - safeMinX) < tolerance && edgeMargins.left > 0;
const touchesRightBorder  = Math.abs(x - safeMaxX) < tolerance && edgeMargins.right > 0;
```

Then 4 more for body checks, then 4 `if`-blocks to update state, then 4 more `beyondEdge` booleans,
then 4 more `if`-blocks, then a 4-case `switch` for closed-edge detection — **a total of ~40
per-edge expressions** where the structural pattern is identical and only the coordinate
sign/axis/threshold name changes. This makes the function:

1. **Impossible to audit without checking all 4 directions** — a bug in the `left` edge handling
   is invisible until you compare it to the other three.
2. **Fragile to new requirements** — adding e.g. diagonal tolerance requires 4 identical changes.
3. **Untestable at the edge level** — you can't test whether "top edge detection" works correctly
   without exercising the entire function call.

## Current Code

The core of the repetition (showing top vs bottom — left/right follow the same pattern on X):

```typescript
for (const point of points) {
  const { x, y } = point;

  // 8 manually-named booleans — 4 border, 4 body
  const touchesTopBorder    = Math.abs(y - safeMaxY) < tolerance && edgeMargins.top > 0;
  const touchesBottomBorder = Math.abs(y - safeMinY) < tolerance && edgeMargins.bottom > 0;
  const touchesLeftBorder   = Math.abs(x - safeMinX) < tolerance && edgeMargins.left > 0;
  const touchesRightBorder  = Math.abs(x - safeMaxX) < tolerance && edgeMargins.right > 0;

  const touchesTopBody    = Math.abs(y - bodyMaxY) < tolerance && edgeMargins.top === 0;
  const touchesBottomBody = Math.abs(y - bodyMinY) < tolerance && edgeMargins.bottom === 0;
  const touchesLeftBody   = Math.abs(x - bodyMinX) < tolerance && edgeMargins.left === 0;
  const touchesRightBody  = Math.abs(x - bodyMaxX) < tolerance && edgeMargins.right === 0;

  // 4 near-identical if-blocks — only edge name changes
  if (touchesTopBorder || touchesTopBody) {
    if (!borderedEdges.includes('top')) borderedEdges.push('top');
    if (touchesTopBorder) touchesSafeSpaceBorder = true;
    if (touchesTopBody) {
      if (!openEdgesSpanned.includes('top')) openEdgesSpanned.push('top');
    }
  }
  if (touchesBottomBorder || touchesBottomBody) { /* ... identical body ... */ }
  if (touchesLeftBorder   || touchesLeftBody)   { /* ... identical body ... */ }
  if (touchesRightBorder  || touchesRightBody)  { /* ... identical body ... */ }

  // 4 more beyondEdge booleans
  const beyondTop    = y > bodyMaxY + tolerance;
  const beyondBottom = y < bodyMinY - tolerance;
  const beyondLeft   = x < bodyMinX - tolerance;
  const beyondRight  = x > bodyMaxX + tolerance;

  if (beyondTop    && edgeMargins.top    === 0) { spansOpenEdge = true; /* push 'top' */ }
  if (beyondBottom && edgeMargins.bottom === 0) { spansOpenEdge = true; /* push 'bottom' */ }
  if (beyondLeft   && edgeMargins.left   === 0) { spansOpenEdge = true; /* push 'left' */ }
  if (beyondRight  && edgeMargins.right  === 0) { spansOpenEdge = true; /* push 'right' */ }

  // 4-case switch for closed edge detection
  for (const edge of closedEdges) {
    switch (edge) {
      case 'top':    if (y > safeMaxY - tolerance) touchesClosedEdge = true; break;
      case 'bottom': if (y < safeMinY + tolerance) touchesClosedEdge = true; break;
      case 'left':   if (x < safeMinX + tolerance) touchesClosedEdge = true; break;
      case 'right':  if (x > safeMaxX - tolerance) touchesClosedEdge = true; break;
    }
  }
}
```

## Proposed Refactoring

**Pattern: Table-Driven EdgeCheckConfig** — extract an `EdgeCheckConfig` interface that captures the
coordinate semantics for each edge direction. Replace all 4-fold repetitions with a single loop
over a table of 4 configs.

```typescript
/** Encodes the coordinate geometry for one edge direction */
interface EdgeCheckConfig {
  edge: EdgePosition;
  /** Extract the relevant coordinate from a point */
  getCoord: (p: PathPoint) => number;
  /** Inner boundary of the joint margin (safe space border) */
  safeThreshold: number;
  /** Outer body edge (including extensions) */
  bodyThreshold: number;
  /** True for top/right (check >=), false for bottom/left (check <=) */
  isPositive: boolean;
  /** The edge margin value for this direction */
  margin: number;
}

// Built once before the per-point loop:
const edgeConfigs: EdgeCheckConfig[] = [
  { edge: 'top',    getCoord: p => p.y, safeThreshold: safeMaxY, bodyThreshold: bodyMaxY, isPositive: true,  margin: edgeMargins.top    },
  { edge: 'bottom', getCoord: p => p.y, safeThreshold: safeMinY, bodyThreshold: bodyMinY, isPositive: false, margin: edgeMargins.bottom  },
  { edge: 'left',   getCoord: p => p.x, safeThreshold: safeMinX, bodyThreshold: bodyMinX, isPositive: false, margin: edgeMargins.left    },
  { edge: 'right',  getCoord: p => p.x, safeThreshold: safeMaxX, bodyThreshold: bodyMaxX, isPositive: true,  margin: edgeMargins.right   },
];

// The refactored per-point loop (CCN drops to ~12):
for (const point of points) {
  const inSafeSpace = isPointInSafeSpace(point.x, point.y, safeSpace);
  if (!inSafeSpace) whollyInSafeSpace = false;

  for (const cfg of edgeConfigs) {
    const coord = cfg.getCoord(point);
    const touchesBorder = Math.abs(coord - cfg.safeThreshold) < tolerance && cfg.margin > 0;
    const touchesBody   = Math.abs(coord - cfg.bodyThreshold) < tolerance && cfg.margin === 0;
    const beyond = cfg.isPositive
      ? coord > cfg.bodyThreshold + tolerance
      : coord < cfg.bodyThreshold - tolerance;
    const inClosedRegion = cfg.isPositive
      ? coord > cfg.safeThreshold - tolerance
      : coord < cfg.safeThreshold + tolerance;

    if (touchesBorder || touchesBody) {
      if (!borderedEdges.includes(cfg.edge)) borderedEdges.push(cfg.edge);
      if (touchesBorder) touchesSafeSpaceBorder = true;
      if (touchesBody && !openEdgesSpanned.includes(cfg.edge)) openEdgesSpanned.push(cfg.edge);
    }
    if (beyond && cfg.margin === 0) {
      spansOpenEdge = true;
      if (!openEdgesSpanned.includes(cfg.edge)) openEdgesSpanned.push(cfg.edge);
    }
    if (cfg.margin > 0 && inClosedRegion) touchesClosedEdge = true;
  }
}
```

The 40 per-edge expressions collapse to 4 table entries + 1 shared loop body of ~12 lines.

## Why This Matters

1. **Auditability**: The 4 directional differences (sign, axis, threshold) are now visible as
   a single column in the config table (`isPositive` + `getCoord`). A mirroring bug in `left`
   is immediately visible by comparing its row to `right`'s row — no need to scan 80 lines of
   parallel `if`-blocks.

2. **Testability**: Each `EdgeCheckConfig` is a pure-data object. You can write:
   ```typescript
   const cfg = edgeConfigs.find(c => c.edge === 'left')!;
   expect(cfg.isPositive).toBe(false);
   expect(cfg.getCoord({ x: -5, y: 3 })).toBe(-5);
   ```
   No engine setup or panel generation required.

3. **Extensibility**: Adding a new check (e.g. tolerance scaling, diagonal edge detection)
   means editing the shared loop body once — not 4 separate `if`-blocks.

4. **Alignment with existing pattern**: This mirrors the Table-Driven approach already proposed
   for `generateDividerSlotHoles` (draft 95), establishing a consistent idiom for 4-directional
   geometry in the codebase.

## Metrics

- **File:** `src/engine/safeSpace.ts`
- **Function:** `analyzePath` (lines 1051–1197)
- **Current CCN:** 70 / NLOC: 97 (density: 0.72 CCN/line — highest in the core engine)
- **Estimated CCN after:** ~12 in the main function (inner loop body ~6, outer structure ~6)
- **Related candidate:** `computeResultPaths` (lines 539–839, CCN=64) follows the same
  4-fold edge pattern and could be refactored with the same `EdgeCheckConfig` approach in a
  follow-up; the two functions share the same conceptual boundary model.
