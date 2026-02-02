# Boolean-Based Edge Path System

## Overview

Replace the manual edge path merge logic with proper boolean geometry operations. The safe area polygon becomes the source of truth, and custom edge paths are derived from it.

## Core Concept

```
┌─────────────────────────────┐
│      Safe Area Polygon      │  ← Start with this
│                             │
│  ┌───┐         ┌───┐        │
│  │ADD│         │SUB│        │  ← Apply boolean ops
│  └───┘         └───┘        │
│                             │
└─────────────────────────────┘
              ↓
┌──────┬─────┬────────────────┐
│      │     │                │  ← Result: modified safe area
│      │     └──┐             │
│      │        │             │
└──────┴────────┴─────────────┘
              ↓
    Extract edge boundary       ← Custom edge path
```

## Key Principles

1. **Safe Area = Source of Truth**: The safe area polygon defines the editable region
2. **Boolean Operations**: Union (add material) and Difference (cut material)
3. **Edge Path = Derived**: Extract the boundary along each edge from the safe area
4. **Composable**: Multiple operations naturally stack (extension + notch + another notch)

## Data Model

### Current Model (to be replaced for open edges)
```typescript
// Per-edge path with t,offset coordinates
interface CustomEdgePath {
  edge: EdgePosition;
  points: { t: number; offset: number }[];
}
```

### New Model
```typescript
// Store the modified safe area polygon directly
interface PanelEdgeModifications {
  // The modified safe area polygon (result of all boolean ops)
  // Stored as array of {x, y} points in panel coordinates
  modifiedSafeArea: PathPoint[] | null;

  // History of operations (optional, for undo)
  operations?: EdgeOperation[];
}

interface EdgeOperation {
  type: 'union' | 'difference';
  shape: PathPoint[];  // The shape that was added/subtracted
  edge: EdgePosition;  // Which edge this affects
}
```

## Implementation Plan

### Phase 1: Add Boolean Library

1. Install `polygon-clipping`:
   ```bash
   npm install polygon-clipping
   npm install -D @types/polygon-clipping
   ```

2. Create utility wrapper:
   ```typescript
   // src/utils/polygonBoolean.ts
   import polygonClipping from 'polygon-clipping';

   export function unionPolygons(a: PathPoint[], b: PathPoint[]): PathPoint[];
   export function differencePolygons(a: PathPoint[], b: PathPoint[]): PathPoint[];
   export function intersectPolygons(a: PathPoint[], b: PathPoint[]): PathPoint[];
   ```

### Phase 2: Safe Area as Editable Polygon

1. **Get initial safe area polygon** for a panel:
   - Already computed by `calculateSafeSpace()` → `resultPaths`
   - This is the starting polygon before any custom modifications

2. **Store modified safe area** on the assembly:
   ```typescript
   // In BaseAssembly
   protected _panelModifiedSafeAreas: Map<string, PathPoint[]> = new Map();

   getModifiedSafeArea(panelId: string): PathPoint[] | null;
   setModifiedSafeArea(panelId: string, polygon: PathPoint[]): void;
   ```

3. **Apply boolean operation**:
   ```typescript
   applyEdgeOperation(
     panelId: string,
     operation: 'union' | 'difference',
     shape: PathPoint[]
   ): void {
     const current = this.getModifiedSafeArea(panelId)
       ?? this.getDefaultSafeArea(panelId);

     const result = operation === 'union'
       ? unionPolygons(current, shape)
       : differencePolygons(current, shape);

     this.setModifiedSafeArea(panelId, result);
   }
   ```

### Phase 3: Extract Edge Path from Safe Area

Convert the modified safe area boundary back to edge path format for rendering:

```typescript
function extractEdgePath(
  safeArea: PathPoint[],
  edge: EdgePosition,
  panelWidth: number,
  panelHeight: number
): CustomEdgePath {
  const halfW = panelWidth / 2;
  const halfH = panelHeight / 2;

  // Find all points that are on or near this edge
  // Convert to t,offset format
  // Return the edge path
}
```

**Algorithm for top edge:**
1. Find all segments of the safe area polygon that have y ≈ halfH or y > halfH
2. These segments define the edge boundary
3. Convert x coordinates to t values: `t = (x + halfW) / panelWidth`
4. Convert y coordinates to offset: `offset = y - halfH`
5. Sort by t, ensure proper point ordering

### Phase 4: Update Panel Rendering

1. When generating panel outline:
   - Check if panel has modified safe area
   - If yes, use the modified safe area boundary for the relevant edge(s)
   - If no, use the standard panel outline

2. The `applyCustomEdgePath` logic in BasePanel can be simplified:
   - Just use the points from the modified safe area directly
   - No need for t,offset conversion during rendering

### Phase 5: Update UI Flow

1. **When user draws a shape on an open edge:**
   ```typescript
   // In SketchView2D.handleAdditiveModeApply

   // Convert drawn shape to panel coordinates
   const shapePolygon = shapeToPolygon(shape, panel);

   // Apply boolean operation
   engine.dispatch({
     type: 'APPLY_EDGE_OPERATION',
     targetId: 'main-assembly',
     payload: {
       panelId: panel.id,
       operation: mode === 'additive' ? 'union' : 'difference',
       shape: shapePolygon,
     },
   });
   ```

2. **Shape to polygon conversion:**
   - Rectangle: 4 corner points
   - Circle: Approximated as polygon with N points (e.g., 32)

## Migration Strategy

### Option A: Full Replacement
- Remove old CustomEdgePath system entirely
- All edge modifications use boolean operations
- Cleaner but more work

### Option B: Hybrid (Recommended)
- Keep CustomEdgePath for simple cases (single notch, single extension)
- Use boolean system when:
  - Modifying an edge that already has a custom path
  - Complex shapes (circles, polygons)
- Gradually migrate to full boolean system

### Migration for Existing Data
- On load, if panel has old-style CustomEdgePath:
  - Convert to polygon representation
  - Store as modifiedSafeArea
- Or: maintain backwards compatibility by supporting both formats

## Edge Cases to Handle

1. **Multiple disjoint regions**: Boolean difference can create multiple polygons
   - For edge paths, take the largest connected region
   - Or: warn user if operation would create islands

2. **Shape entirely outside safe area**:
   - Union: extends the safe area (valid)
   - Difference: no effect (shape doesn't intersect)

3. **Shape entirely inside safe area**:
   - Union: no effect (already contained)
   - Difference: creates a hole (valid for cutouts, not edge paths)

4. **Invalid results**:
   - Empty polygon after difference: reject operation
   - Self-intersecting result: shouldn't happen with proper library

## File Changes

| File | Change |
|------|--------|
| `package.json` | Add `polygon-clipping` dependency |
| `src/utils/polygonBoolean.ts` | New: Boolean operation utilities |
| `src/engine/nodes/BaseAssembly.ts` | Add modified safe area storage |
| `src/engine/types.ts` | Add `APPLY_EDGE_OPERATION` action |
| `src/engine/Engine.ts` | Handle new action |
| `src/engine/nodes/BasePanel.ts` | Use modified safe area in outline generation |
| `src/components/SketchView2D.tsx` | Update apply handler |
| `src/engine/safeSpace.ts` | Add edge extraction function, can remove merge functions |

## Testing

1. **Unit tests for boolean utilities**:
   - Union of overlapping rectangles
   - Difference creating notch
   - Multiple operations in sequence

2. **Integration tests**:
   - Add extension, verify outline changes
   - Cut notch into plain edge
   - Cut notch into existing extension
   - Multiple notches on same edge

3. **Visual tests**:
   - No diagonal lines
   - Clean axis-aligned edges
   - Proper rendering in 2D and 3D views

## Success Criteria

- [ ] Extension on plain edge works
- [ ] Notch on plain edge works
- [ ] Notch through extension creates clean vertical slot
- [ ] Multiple operations on same edge compose correctly
- [ ] Circle shapes work (approximated as polygons)
- [ ] No diagonal lines in any result
- [ ] Existing tests still pass
