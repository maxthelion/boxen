# Fix Edge Path Detection With Extensions

CREATED: 2026-02-04T17:15:00Z
PRIORITY: P1
COMPLEXITY: S
ROLE: implement
BRANCH: main
SKIP_PR: true

## Root Cause

In `src/engine/safeSpace.ts`, the `analyzePath` function checks if a drawn path touches the panel edge to determine if it should modify the edge (vs create a cutout).

**The bug:** When an edge has an extension, the body boundary is still calculated from the original panel dimensions, NOT including the extension.

```typescript
// Lines 1063-1067 - PROBLEM: doesn't account for extensions
const bodyMinX = -halfW;
const bodyMaxX = halfW;
const bodyMinY = -halfH;
const bodyMaxY = halfH;
```

When user draws at the extended edge position, the path doesn't match the body boundary because extensions aren't included.

## Task

1. Open `src/engine/safeSpace.ts`
2. Find the `analyzePath` function (around line 1035)
3. The function receives `panelWidth` and `panelHeight` - but needs extension info too
4. Either:
   - **Option A:** Add extension parameters to `analyzePath` and adjust body boundaries
   - **Option B:** Pass the extended panel dimensions (including extensions) as width/height

## The Fix Pattern

```typescript
// Add extension info to function signature
export function analyzePath(
  points: PathPoint[],
  safeSpace: SafeSpaceRegion,
  edgeMargins: Record<EdgePosition, number>,
  panelWidth: number,
  panelHeight: number,
  extensions?: Record<EdgePosition, number>,  // NEW
  tolerance: number = 0.001
): PathAnalysis {
  // ...

  // Adjust body boundary for extensions
  const bodyMinX = -halfW - (extensions?.left ?? 0);
  const bodyMaxX = halfW + (extensions?.right ?? 0);
  const bodyMinY = -halfH - (extensions?.bottom ?? 0);
  const bodyMaxY = halfH + (extensions?.top ?? 0);
```

## Also Update Callers

Find where `analyzePath` is called (likely in `SketchView2D.tsx`) and pass extension info.

## Acceptance Criteria

- [ ] `analyzePath` accounts for edge extensions
- [ ] Drawing path at extended edge triggers edge modification (not cutout)
- [ ] Tests pass
- [ ] Commit changes

CLAIMED_BY: impl-agent-1
CLAIMED_AT: 2026-02-04T17:13:41.639209

CLAIMED_BY: impl-agent-1
CLAIMED_AT: 2026-02-04T17:14:44.397908

COMPLETED_AT: 2026-02-04T17:17:49.653125

## Result
Merged directly to main
