# Edge/Path Drawing Proposal Analysis

## Current Implementation vs Proposed Model

### Current State

**What we have:**

1. **Cutouts (Phase 5 - mostly complete)**
   - `RectCutout`, `CircleCutout`, `PathCutout` types
   - Cutouts are **always subtractive** (create holes)
   - Stored per-panel in `_panelCutouts` Map
   - Safe space validation prevents cutouts outside editable area
   - No connection to edge modification

2. **CustomEdgePath (partially implemented)**
   - `EdgePathPoint { t: number, offset: number }` - normalized position + offset
   - Stored per-panel in `_panelCustomEdgePaths` Map
   - Engine actions: `SET_EDGE_PATH`, `CLEAR_EDGE_PATH`
   - **Not connected to drawing tools** - exists in data model only

3. **Editor State Machine**
   - Draft modes: `polyline`, `polygon`, `rectangle`, `circle`, `edge-path`
   - Draft state: `{ type, target: { panelId, edge? }, points }`
   - Edit sessions for modifying existing geometry

4. **Safe Space System**
   - Calculates regions where geometry can be added
   - Accounts for joint margins (2×MT) and slot exclusions
   - Used for cutout validation

### Proposed Model (from images)

1. **Context-dependent path behavior:**
   - Path touching safe-space border edge → **modifies edge path**
   - Path wholly in safe space → **subtractive cutout** (default)
   - Path partly in safe space + open space → **subtractive by default**, toggle to additive

2. **Edge path positioning rules:**
   - Offset from outer face of joint
   - Start/end relative to offset
   - Edge with joint: min offset = MT
   - Open edge without extension: must clear joints
   - Open edge with extension: min offset = 0
   - **Offset bounds:**
     - Positive offset (outward): unlimited (feet, decorative extensions)
     - Negative offset (inward): limited by safe space depth at that edge

3. **Operation-based model:**
   - Paths become operations with parameters
   - Features not directly manipulable, but operation can be revisited
   - Mirroring to opposite side of edge
   - Copy/paste by reference with flip options (H/V)

---

## Key Differences

| Aspect | Current | Proposed |
|--------|---------|----------|
| **Path semantics** | Cutout = always subtractive | Context-dependent: edge mod vs cutout |
| **Mode detection** | Explicit tool selection | Automatic based on where path touches |
| **Additive shapes** | Not supported | Toggle available when path spans open edge |
| **Edge paths** | Separate data model | Unified with path drawing |
| **Feature editing** | Direct manipulation planned | Operation parameters, no direct manipulation |
| **Mirroring** | Not implemented | Built-in to edge operations |
| **Copy/paste** | Planned as Phase 8 | Core feature with reference + flip |

---

## Migration Path

### Phase A: Unify Path Semantics

1. **Add path position analysis**
   ```typescript
   interface PathAnalysis {
     touchesSafeSpaceBorder: boolean;
     borderedEdge?: EdgePosition;  // Which edge it borders
     whollyInSafeSpace: boolean;
     spansOpenEdge: boolean;       // Could be additive
   }

   function analyzePath(points: PathPoint[], safeSpace: SafeSpaceRegion): PathAnalysis
   ```

2. **Determine path type from position**
   - If `touchesSafeSpaceBorder` → convert to CustomEdgePath
   - Else → keep as Cutout

3. **Update drawing flow**
   - After completing draft, analyze path position
   - Route to appropriate storage (edge path vs cutout)

### Phase B: Edge Path Offset System

1. **Add offset calculation**
   ```typescript
   interface EdgePathConstraints {
     minOffset: number;  // Based on edge type (MT for joints, 0 for open+extended)
     maxNegativeOffset: number;  // How far inward (negative) - limited by safe space depth
     // maxPositiveOffset: unlimited (outward extensions have no structural limit)
     startBounds: { min: number; max: number };  // Where path can start
     endBounds: { min: number; max: number };    // Where path can end
   }

   function getEdgePathConstraints(
     edge: EdgePosition,
     panel: PanelPath,
     safeSpace: SafeSpaceRegion
   ): EdgePathConstraints
   ```

2. **Modify CustomEdgePath model**
   - Add `baseOffset: number` to the path (offset from joint face)
   - Points become relative to this offset
   - Validation enforces min offset rules

### Phase C: Additive/Subtractive Toggle

1. **Extend path data model**
   ```typescript
   interface PathCutout extends CutoutBase {
     type: 'path';
     points: Array<{ x: number; y: number }>;
     mode: 'additive' | 'subtractive';  // NEW
   }
   ```

2. **Add UI toggle** in drawing palette when `spansOpenEdge` is true

3. **Update outline generation** to handle additive paths (union vs subtract)

### Phase D: Operation Model

1. **Wrap paths in operations**
   ```typescript
   interface PathOperation {
     id: string;
     type: 'edge-path' | 'cutout';
     sourceParams: {
       drawingPoints: PathPoint[];  // Original drawing
       mode?: 'additive' | 'subtractive';
     };
     derivedGeometry: {
       // Computed from sourceParams
     };
   }
   ```

2. **Re-editable operations** - clicking feature opens parameter palette
3. **Remove direct manipulation** of path points (controversial?)

### Phase E: Mirror & Copy/Paste

1. **Mirror operation**
   ```typescript
   | { type: 'MIRROR_EDGE_OPERATION';
       targetId: string;
       payload: { panelId: string; sourceEdge: EdgePosition; targetEdge: EdgePosition } }
   ```

2. **Copy by reference**
   ```typescript
   interface EdgeOperationReference {
     sourceOperationId: string;
     flipHorizontal: boolean;
     flipVertical: boolean;
   }
   ```

---

## Proposed Tests

### Path Analysis Tests

```typescript
describe('PathAnalysis', () => {
  it('detects path touching top edge border', () => {
    const path = [{ x: -20, y: 44 }, { x: 0, y: 40 }, { x: 20, y: 44 }];
    const analysis = analyzePath(path, safeSpace);
    expect(analysis.touchesSafeSpaceBorder).toBe(true);
    expect(analysis.borderedEdge).toBe('top');
  });

  it('detects path wholly in safe space', () => {
    const path = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    const analysis = analyzePath(path, safeSpace);
    expect(analysis.whollyInSafeSpace).toBe(true);
  });

  it('detects path spanning open edge (additive candidate)', () => {
    // Path starts in safe space, extends beyond panel on open edge
    const path = [{ x: -40, y: 0 }, { x: -55, y: 0 }, { x: -55, y: 20 }, { x: -40, y: 20 }];
    const analysis = analyzePath(path, safeSpaceWithOpenLeft);
    expect(analysis.spansOpenEdge).toBe(true);
  });
});
```

### Edge Path Constraint Tests

```typescript
describe('EdgePathConstraints', () => {
  it('requires MT offset on edge with joint', () => {
    const constraints = getEdgePathConstraints('top', panel, safeSpace);
    expect(constraints.minOffset).toBe(3); // MT = 3mm
  });

  it('allows zero offset on open edge with extension', () => {
    const constraints = getEdgePathConstraints('left', panelWithLeftExtension, safeSpace);
    expect(constraints.minOffset).toBe(0);
  });

  it('constrains start/end to clear of joints', () => {
    const constraints = getEdgePathConstraints('top', panel, safeSpace);
    // Start must be >= MT from left corner
    expect(constraints.startBounds.min).toBeGreaterThanOrEqual(3);
  });

  it('limits negative offset by safe space depth', () => {
    const constraints = getEdgePathConstraints('top', panel, safeSpace);
    // Safe space depth from top edge determines max negative offset
    expect(constraints.maxNegativeOffset).toBe(safeSpace.topDepth);
  });

  it('allows unlimited positive offset (outward)', () => {
    const constraints = getEdgePathConstraints('top', panel, safeSpace);
    // No maxPositiveOffset field - outward extensions are unlimited
    expect(constraints.maxNegativeOffset).toBeDefined();
    // Positive direction has no constraint (feet, decorative edges)
  });
});
```

### Additive Path Tests

```typescript
describe('Additive paths', () => {
  it('generates outline with added geometry when mode=additive', () => {
    const cutout = { type: 'path', mode: 'additive', points: [...], center: {...} };
    const outline = generateOutlineWithCutouts(baseOutline, [cutout]);
    // Outline area should be larger
    expect(getPolygonArea(outline)).toBeGreaterThan(getPolygonArea(baseOutline));
  });

  it('generates outline with hole when mode=subtractive', () => {
    const cutout = { type: 'path', mode: 'subtractive', points: [...], center: {...} };
    const result = generateOutlineWithCutouts(baseOutline, [cutout]);
    expect(result.holes.length).toBe(1);
  });
});
```

### Mirror Tests

```typescript
describe('Edge operation mirroring', () => {
  it('mirrors horizontal edge path to opposite edge', () => {
    // Path on top edge: notch at x=10
    const topPath = { edge: 'top', points: [{t: 0.2, offset: -5}, {t: 0.3, offset: -5}] };
    const mirrored = mirrorEdgeOperation(topPath, 'bottom');
    // Should be on bottom with same t positions
    expect(mirrored.edge).toBe('bottom');
    expect(mirrored.points[0].t).toBe(0.2);
  });

  it('mirrors with horizontal flip', () => {
    const leftPath = { edge: 'left', points: [{t: 0.2, offset: -5}, {t: 0.8, offset: -5}] };
    const mirrored = mirrorEdgeOperation(leftPath, 'right', { flipVertical: true });
    // t values should be inverted (1 - t)
    expect(mirrored.points[0].t).toBe(0.8);
    expect(mirrored.points[1].t).toBe(0.2);
  });
});
```

---

## Resolved Questions

### 1. Path-to-Edge Detection Threshold ✓

**Decision:** Exact intersection (0 tolerance) with snap-to-edge UX.

- Snapping helps users hit exact intersection
- **Closed faces (joints on all sides):** Cannot have edge paths - no safe space borders them, would interfere with joint mechanism

### 2. Edge Path Storage Model ✓

**Decision:** One `CustomEdgePath` per edge. All drawing operations merge into it.

- Drawing a shape that touches an edge adds points to that edge's single path
- Unmodified segments remain straight
- Example: Circle partially over top edge → `straight → arc → straight`
- If shape extends past edge endpoint, the path's start/end adjusts accordingly

### 3. Edge Path Point Coordinate System ✓

**Decision:** Keep `{t, offset}` with `baseOffset` added.

- `t`: normalized position along edge (0-1)
- `baseOffset`: constant perpendicular offset from joint face for entire path
- `offset` in points: additional offset from baseOffset
- **Offset bounds:** positive (outward) unlimited, negative (inward) limited by safe space depth

### 4. Additive Path Constraints ✓

**Decision:** Additive paths must connect to panel edge.

- At least one edge of the additive shape must touch the safe space border
- No floating additions allowed

### 5. Operation vs Direct Manipulation ✓

**Decision:** Two distinct interaction modes:

- **Creating paths** = Operation (shows in history, undo as unit, triggers additive/subtractive)
- **Editing nodes** afterward = Direct manipulation (edit session, granular undo)

---

## Deferred Questions

### Operation Revisiting UX

How does user revisit an operation to change parameters? (Click feature? Select from list? Which params adjustable?)

*Deferred to future work.*

### Copy/Paste Reference Semantics

When copying by reference, should changes to source update copies? (Linked vs snapshot vs user choice?)

*Deferred to future work.*

---

## Recommended Next Steps

1. ~~**Decide on open questions**~~ ✓ Resolved above
2. **Update CustomEdgePath model** - add `baseOffset`, enforce one path per edge
3. **Implement PathAnalysis** - core logic for detecting path type from position
4. **Add integration tests** for path type detection
5. **Update drawing flow** - merge drawn shapes into edge's single path
6. **Add additive/subtractive toggle** when path spans open edge
7. **Defer operation model** until basic path routing works
8. **Defer mirror/copy** until edge paths fully functional
