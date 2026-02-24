# Canonical Patterns

This document describes the correct patterns to follow when writing new code in Boxen. Read it before writing any new operation, geometry code, or model mutation.

For step-by-step instructions on adding a new operation, see `docs/adding-operations.md`.
For the full geometry rules, see `.claude/rules/geometry.md`.

---

## Reference Implementations

Three operations have been tagged as reference implementations with `// REFERENCE IMPLEMENTATION` at the top of their files:

| Type | File | Why It's a Good Example |
|------|------|------------------------|
| Parameter op | `src/components/ScalePalette.tsx` | Shows startOperation → updateOperationParams → applyOperation/cancelOperation cleanly |
| Immediate op | `src/store/slices/panelSlice.ts` | Shows direct engine dispatch without preview, notifying React after |
| 2D drawing op | `src/components/SketchView2D.tsx` | Shows sketchCoordinates.ts usage, path tool, and engine dispatch from 2D context |

**Before writing a new operation, read the reference impl for your type.**

---

## Pattern 1: Adding Operations (Store → Engine → Snapshot → UI)

Operations follow a strict pipeline. Every operation goes through the same flow:

```
Tool selected
    ↓
Palette mounts → checks selection validity
    ↓
startOperation(operationId)   ← store action, creates engine preview clone
    ↓
updateOperationParams({ ...values })  ← triggers createPreviewAction in registry
    ↓
registry.createPreviewAction(params)  → returns EngineAction | null
    ↓
engine.dispatch(action, { preview: true })  ← mutates preview scene
    ↓
useEnginePanels() returns preview panels → React re-renders
    ↓
User adjusts params → repeat from updateOperationParams
    ↓
Apply: applyOperation()    → engine.commitPreview() → React sees new main scene
Cancel: cancelOperation()  → engine.discardPreview() → React reverts
```

### Required files for each new operation

| File | What to add |
|------|------------|
| `src/operations/types.ts` | New ID in `OperationId` union |
| `src/operations/registry.ts` | `OperationDefinition` with `createPreviewAction` |
| `src/engine/types.ts` | New `EngineAction` union member |
| `src/engine/Engine.ts` | New `case` in `dispatch()` |
| `src/components/EditorToolbar.tsx` | Tool button entry |
| `src/components/XxxPalette.tsx` | Palette component (see ScalePalette.tsx reference) |
| `src/components/Viewport3D.tsx` | Mount palette in JSX |

### Palette component pattern (parameter ops)

```typescript
// Read ScalePalette.tsx for the complete reference implementation

const MyPalette: React.FC<Props> = ({ visible, position, onPositionChange, onClose, containerRef }) => {
  // 1. Read operation state from store
  const operationState = useBoxStore((s) => s.operationState);
  const startOperation = useBoxStore((s) => s.startOperation);
  const updateOperationParams = useBoxStore((s) => s.updateOperationParams);
  const applyOperation = useBoxStore((s) => s.applyOperation);
  const cancelOperation = useBoxStore((s) => s.cancelOperation);

  const isActive = operationState.activeOperation === 'my-op';

  // 2. Auto-start when valid selection exists
  useEffect(() => {
    if (visible && !isActive && canStart) {
      startOperation('my-op');
      updateOperationParams({ value: initialValue });
    }
  }, [visible, isActive, canStart]);

  // 3. Forward param changes to store (triggers preview)
  const handleChange = (value: number) => {
    if (isActive) updateOperationParams({ value });
  };

  // 4. Apply or cancel
  const handleApply = () => { if (isActive) applyOperation(); onClose(); };
  const handleCancel = () => { if (isActive) cancelOperation(); onClose(); };

  return (
    <FloatingPalette title="My Op" position={position} onPositionChange={onPositionChange}
                     onClose={handleCancel} containerRef={containerRef}>
      <PaletteSliderInput label="Value" value={value} onChange={handleChange} min={0} max={100} step={1} unit="mm" />
      <PaletteButtonRow>
        <PaletteButton variant="primary" onClick={handleApply}>Apply</PaletteButton>
        <PaletteButton onClick={handleCancel}>Cancel</PaletteButton>
      </PaletteButtonRow>
    </FloatingPalette>
  );
};
```

### createPreviewAction pattern (in registry.ts)

```typescript
createPreviewAction: (params) => {
  // 1. Extract and type-assert params
  const { value } = params as { value?: number };

  // 2. Return null if params are incomplete (no preview yet)
  if (value === undefined) return null;

  // 3. Return the engine action
  return {
    type: 'MY_ENGINE_ACTION',
    targetId: 'main-assembly',
    payload: { value },
  };
},
```

### Immediate operations (no preview)

Immediate ops skip the preview cycle and dispatch directly to the engine. See `panelSlice.ts:toggleFace` for the reference:

```typescript
// In a store slice action:
engine.dispatch({
  type: 'TOGGLE_FACE',
  targetId: 'main-assembly',
  payload: { faceId },
});
notifyEngineStateChanged();  // Tell React to re-render
```

---

## Pattern 2: Panel Generation — Always Use generatePanelsFromNodes

**Never construct panels manually.** Always call the engine's panel generation:

```typescript
// ✅ Correct: get panels from engine (includes finger joints, extensions, fillets, slots)
const collection = engine.generatePanelsFromNodes();
const panels = collection.panels;

// ❌ Wrong: constructing panel outlines directly
const outline = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 }];
```

In React components, use the hook:

```typescript
// Returns preview panels if a preview is active, otherwise main scene panels
const panelCollection = useEnginePanels();
```

**Why this matters**: Real panels have 100+ points from finger joints. Tests using simple 4-point rectangles will pass even when the geometry is broken.

In tests, use:

```typescript
import { createEngineWithAssembly } from '../test/helpers';
import { generatePanelsFromNodes } from '../engine/panelBridge';

const engine = createEngineWithAssembly({ width: 200, height: 150, depth: 100, materialThickness: 6 });
const panels = generatePanelsFromNodes(engine._scene);
// Now panels have real finger joints
```

---

## Pattern 3: Finger Joints — Always Use fingerJoints.ts

Never compute finger joint geometry by hand. Use `src/utils/fingerJoints.ts`:

```typescript
import { generateFingerJointPath } from '../utils/fingerJoints';

// Get the finger pattern for an edge
const path = generateFingerJointPath({
  length: edgeLength,
  materialThickness: mt,
  fingerWidth: config.fingerWidth,
  fingerGap: config.fingerGap,
  gender: 'male',   // or 'female'
  orientation: 'horizontal',
});
```

Gender determination (male = tabs out, female = slots) is handled by `src/utils/genderRules.ts`. Do not re-implement this logic:

```typescript
import { determineFaceGender, determineDividerGender } from '../utils/genderRules';

const gender = determineFaceGender(faceId, assemblyAxis, config);
```

---

## Pattern 4: Dispatching Model Changes — Always engine.dispatch()

**All model mutations must go through `engine.dispatch(action)`**. Never mutate engine node internals directly.

```typescript
// ✅ Correct
engine.dispatch({
  type: 'SET_DIMENSIONS',
  targetId: 'main-assembly',
  payload: { width: 100, height: 80, depth: 60 },
});

// ❌ Wrong: direct node mutation
engine.assembly!.width = 100;
```

In store slices, get the engine first:

```typescript
import { getEngine, notifyEngineStateChanged } from '../../engine';

const engine = getEngine();
engine.dispatch({ type: 'MY_ACTION', targetId: 'main-assembly', payload: { ... } });
notifyEngineStateChanged();  // Always call this after non-preview dispatches
```

For preview operations, use the `{ preview: true }` option (the store's `updateOperationParams` handles this automatically via `createPreviewAction`).

---

## Pattern 5: Preview Pattern (startPreview → mutate → commit/discard)

The preview system clones the engine scene so changes can be shown and then committed or discarded. The store manages this through the operation lifecycle — **you rarely need to call preview methods directly**.

Use the store actions instead:

```typescript
// The store handles startPreview/commitPreview/discardPreview internally
startOperation('my-op');           // → engine.startPreview()
updateOperationParams({ ... });    // → createPreviewAction → engine.dispatch(action, { preview: true })
applyOperation();                  // → engine.commitPreview()
cancelOperation();                 // → engine.discardPreview()
```

**Only call engine preview methods directly** when you need to modify a preview outside the operation lifecycle (rare — see existing examples in `SketchView2D.tsx`):

```typescript
const engine = getEngine();
if (!engine.hasPreview()) {
  engine.startPreview();
}
engine.dispatch(action, { preview: true });
notifyEngineStateChanged();

// Later...
engine.commitPreview();   // or engine.discardPreview()
notifyEngineStateChanged();
```

---

## Pattern 6: Coordinate Transforms — Use sketchCoordinates.ts

When writing 2D sketch/drawing code, **never compute coordinate transforms by hand**. Use `src/utils/sketchCoordinates.ts`:

```typescript
import {
  screenToSvgCoords,       // Mouse event → SVG coordinates
  svgToEdgeCoords,         // SVG coordinates → panel-local edge coordinates
  edgeCoordsToSvg,         // Panel-local → SVG
  findEdgeAtPoint,         // Hit test for panel edges
  findCornerAtPoint,       // Hit test for panel corners
  getEdgeSegments,         // Get segments for an edge path
  classifyClickLocation,   // Determine if click is on boundary, safe-space, etc.
  computeHitThreshold,     // Compute hit threshold from viewBox size
} from '../utils/sketchCoordinates';

// Example: convert a mouse click to SVG coordinates
const svgRef = useRef<SVGSVGElement>(null);
const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
  const bbox = svgRef.current!.getBoundingClientRect();
  const svgPos = screenToSvgCoords(e.clientX, e.clientY, bbox, viewBox);
  // Now use svgPos.x, svgPos.y in SVG space
};
```

See `src/components/SketchView2D.tsx` for the full reference implementation of 2D drawing with these utilities.

---

## Pattern 7: Checking Before You Implement

Before writing any geometry utility or helper function, **check if one already exists**:

| What you need | Where to look |
|---------------|---------------|
| Finger joint generation | `src/utils/fingerJoints.ts` |
| Gender determination | `src/utils/genderRules.ts` |
| Face/edge relationships | `src/utils/faceGeometry.ts` |
| Path validation | `src/utils/pathValidation.ts` |
| Polygon boolean ops | `src/utils/polygonBoolean.ts` |
| Snap/guide lines | `src/utils/snapEngine.ts` |
| Coordinate transforms | `src/utils/sketchCoordinates.ts` |
| Void tree traversal | `src/utils/voidTree.ts` |
| Panel lookup by ID | See `docs/panel-id-system.md` |

---

## Anti-Patterns

These are the most common mistakes that introduce bugs:

| Anti-Pattern | Correct Approach |
|-------------|-----------------|
| Mutating engine node internals directly | Use `engine.dispatch(action)` |
| Constructing panel outlines as simple rectangles | Use `engine.generatePanelsFromNodes()` |
| Computing finger joints by hand | Use `fingerJoints.ts` |
| Re-implementing gender rules | Use `genderRules.ts` |
| Computing coordinate transforms inline | Use `sketchCoordinates.ts` |
| Testing with simple 4-point panels | Use `createEngineWithAssembly()` + `generatePanelsFromNodes()` |
| Skipping geometry validation in tests | Run `ComprehensiveValidator.validate(engine.getSnapshot())` |
| Calling preview methods outside the operation lifecycle | Use store actions (`startOperation` etc.) |
| Reading store state from inside a store action | Use `getEngine()` directly, not `get()` for engine state |

---

## Related Documentation

- `docs/adding-operations.md` — Step-by-step guide for new operations
- `.claude/rules/operations.md` — Quick reference: operation types, files, store actions
- `.claude/rules/geometry.md` — Geometry rules (axis alignment, winding, joints)
- `docs/panel-id-system.md` — Panel ID system and canonical keys
- `docs/debugging-3d-rendering.md` — 3D rendering issue guide
