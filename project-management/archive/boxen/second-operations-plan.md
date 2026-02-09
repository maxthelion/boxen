# Second Operations Integration Plan

## Overview

When a user performs an operation twice on the same object, the second operation should correctly use the results from the first. This document covers the patterns used and integration tests needed.

## Operation Modes

### Delta Mode (Inset/Outset)
- User input represents a **change** from the current value
- Formula: `final_value = base_value + offset`
- Example: Edge at 10mm + offset 5mm = 15mm total

### Absolute Mode (Fillet)
- User input represents the **target** value
- Formula: `final_value = radius`
- Example: Corner at 10mm radius → set to 5mm = 5mm final
- UI should display current value when starting operation

## Current Implementation

### Inset/Outset (Delta Mode) ✅

**Files involved:**
- `src/components/Viewport3D.tsx`: `computeBaseExtensions()`, `baseExtensionsRef`
- `src/operations/registry.ts`: `createPreviewAction` for `inset-outset`
- `src/engine/nodes/BaseAssembly.ts`: `getPanelEdgeExtensions()`

**Pattern:**
1. When operation starts, capture current values: `baseExtensions = computeBaseExtensions(edges)`
2. Store in ref: `baseExtensionsRef.current = baseExtensions`
3. Pass to operation: `updateOperationParams({ edges, offset, baseExtensions })`
4. Calculate in registry: `value = baseExtensions[edgeKey] + offset`
5. On commit, values are persisted to assembly

### Fillet (Absolute Mode) - Needs Update

**Current behavior:**
- Always shows default radius (5mm) regardless of existing fillet
- User has no visibility into current corner radii

**Needed changes:**
1. When operation starts, read current fillet radii for selected corners
2. Display the current radius (or minimum if multiple selected)
3. User sets absolute target radius

---

## Implementation Tasks

### Task 1: Load Current Fillet Radii

**File: `src/components/Viewport3D.tsx`**

Add function to compute current fillet radii:
```typescript
const computeBaseFillets = useCallback((corners: string[]): Record<string, number> => {
  const engine = getEngine();
  const mainScene = engine.getMainScene();
  const assembly = mainScene.primaryAssembly;
  if (!assembly) return {};

  const baseFillets: Record<string, number> = {};
  for (const cornerKey of corners) {
    const parts = cornerKey.split(':');
    const panelId = parts[0];
    const corner = `${parts[1]}:${parts[2]}` as CornerKey;
    const currentRadius = assembly.getCornerFilletRadius(panelId, corner);
    baseFillets[cornerKey] = currentRadius;
  }
  return baseFillets;
}, []);
```

**File: `src/engine/nodes/BaseAssembly.ts`**

Add method to get current fillet radius:
```typescript
getCornerFilletRadius(panelId: string, corner: CornerKey): number {
  const fillets = this._cornerFillets.get(panelId);
  if (!fillets) return 0;
  const fillet = fillets.find(f => f.corner === corner);
  return fillet?.radius ?? 0;
}
```

### Task 2: Initialize Fillet Radius from Current Value

**File: `src/components/Viewport3D.tsx`**

When fillet operation starts with corners selected:
```typescript
useEffect(() => {
  if (activeTool === 'fillet' && selectedCornersArray.length > 0 && !isOperationActive) {
    // Compute current radii
    const baseFillets = computeBaseFillets(selectedCornersArray);

    // Use the minimum non-zero radius, or default to 5
    const existingRadii = Object.values(baseFillets).filter(r => r > 0);
    const initialRadius = existingRadii.length > 0
      ? Math.min(...existingRadii)
      : 5;

    setFilletRadius(initialRadius);
    startOperation('corner-fillet');
    updateOperationParams({ corners: selectedCornersArray, radius: initialRadius });
  }
}, [...]);
```

### Task 3: Update Palette to Show "Current" Value

**File: `src/components/FilletPalette.tsx`**

Show current radius info when modifying existing fillets:
```typescript
{currentRadius > 0 && (
  <div className="palette-current-value">
    Current: {currentRadius.toFixed(1)}mm
  </div>
)}
```

---

## Integration Tests

### Test File: `src/engine/integration/secondOperations.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createEngineWithAssembly } from './testUtils';

describe('Second Operations', () => {

  describe('Edge Extensions (Delta Mode)', () => {

    it('second extension adds to first extension value', () => {
      const engine = createEngineWithAssembly(100, 80, 60, { thickness: 3 });
      const assembly = engine.assembly!;

      // Open top face to make edges extendable
      engine.dispatch({
        type: 'SET_FACE_SOLID',
        targetId: assembly.id,
        payload: { faceId: 'top', solid: false },
      });

      // Get front panel ID
      const panels = engine.getPanels();
      const frontPanel = panels.find(p => p.source.faceId === 'front');
      expect(frontPanel).toBeDefined();

      // First extension: 10mm
      engine.dispatch({
        type: 'SET_EDGE_EXTENSIONS_BATCH',
        targetId: assembly.id,
        payload: {
          extensions: [{ panelId: frontPanel!.id, edge: 'top', value: 10 }],
        },
      });

      // Verify first extension
      let extensions = assembly.getPanelEdgeExtensions(frontPanel!.id);
      expect(extensions.top).toBe(10);

      // Second extension: add 5mm (total should be 15mm)
      // In UI this would be: base=10, offset=5
      engine.dispatch({
        type: 'SET_EDGE_EXTENSIONS_BATCH',
        targetId: assembly.id,
        payload: {
          extensions: [{ panelId: frontPanel!.id, edge: 'top', value: 15 }],
        },
      });

      // Verify cumulative result
      extensions = assembly.getPanelEdgeExtensions(frontPanel!.id);
      expect(extensions.top).toBe(15);
    });

    it('extension values persist across scene clones', () => {
      const engine = createEngineWithAssembly(100, 80, 60, { thickness: 3 });
      const assembly = engine.assembly!;

      // Open face and extend edge
      engine.dispatch({
        type: 'SET_FACE_SOLID',
        targetId: assembly.id,
        payload: { faceId: 'top', solid: false },
      });

      const panels = engine.getPanels();
      const frontPanel = panels.find(p => p.source.faceId === 'front');

      engine.dispatch({
        type: 'SET_EDGE_EXTENSIONS_BATCH',
        targetId: assembly.id,
        payload: {
          extensions: [{ panelId: frontPanel!.id, edge: 'top', value: 10 }],
        },
      });

      // Start preview (clones scene)
      engine.startPreview();

      // Read from main scene (should have committed value)
      const mainScene = engine.getMainScene();
      const mainAssembly = mainScene.primaryAssembly!;
      const extensions = mainAssembly.getPanelEdgeExtensions(frontPanel!.id);

      expect(extensions.top).toBe(10);

      engine.discardPreview();
    });

  });

  describe('Corner Fillets (Absolute Mode)', () => {

    it('second fillet replaces first fillet value', () => {
      const engine = createEngineWithAssembly(100, 80, 60, { thickness: 3 });
      const assembly = engine.assembly!;

      // Open face and extend edges to make corner eligible
      engine.dispatch({
        type: 'SET_FACE_SOLID',
        targetId: assembly.id,
        payload: { faceId: 'top', solid: false },
      });
      engine.dispatch({
        type: 'SET_FACE_SOLID',
        targetId: assembly.id,
        payload: { faceId: 'left', solid: false },
      });

      const panels = engine.getPanels();
      const frontPanel = panels.find(p => p.source.faceId === 'front');

      // Extend both edges meeting at top-left corner
      engine.dispatch({
        type: 'SET_EDGE_EXTENSIONS_BATCH',
        targetId: assembly.id,
        payload: {
          extensions: [
            { panelId: frontPanel!.id, edge: 'top', value: 20 },
            { panelId: frontPanel!.id, edge: 'left', value: 20 },
          ],
        },
      });

      // First fillet: 10mm
      engine.dispatch({
        type: 'SET_CORNER_FILLETS_BATCH',
        targetId: assembly.id,
        payload: {
          fillets: [{ panelId: frontPanel!.id, corner: 'left:top', radius: 10 }],
        },
      });

      // Verify first fillet
      let radius = assembly.getCornerFilletRadius(frontPanel!.id, 'left:top');
      expect(radius).toBe(10);

      // Second fillet: 5mm (replaces, not adds)
      engine.dispatch({
        type: 'SET_CORNER_FILLETS_BATCH',
        targetId: assembly.id,
        payload: {
          fillets: [{ panelId: frontPanel!.id, corner: 'left:top', radius: 5 }],
        },
      });

      // Verify replacement (not cumulative)
      radius = assembly.getCornerFilletRadius(frontPanel!.id, 'left:top');
      expect(radius).toBe(5);  // Not 15!
    });

    it('fillet radius zero removes the fillet', () => {
      const engine = createEngineWithAssembly(100, 80, 60, { thickness: 3 });
      const assembly = engine.assembly!;

      // Setup: open faces, extend edges, add fillet
      engine.dispatch({ type: 'SET_FACE_SOLID', targetId: assembly.id, payload: { faceId: 'top', solid: false } });
      engine.dispatch({ type: 'SET_FACE_SOLID', targetId: assembly.id, payload: { faceId: 'left', solid: false } });

      const panels = engine.getPanels();
      const frontPanel = panels.find(p => p.source.faceId === 'front');

      engine.dispatch({
        type: 'SET_EDGE_EXTENSIONS_BATCH',
        targetId: assembly.id,
        payload: {
          extensions: [
            { panelId: frontPanel!.id, edge: 'top', value: 20 },
            { panelId: frontPanel!.id, edge: 'left', value: 20 },
          ],
        },
      });

      engine.dispatch({
        type: 'SET_CORNER_FILLETS_BATCH',
        targetId: assembly.id,
        payload: {
          fillets: [{ panelId: frontPanel!.id, corner: 'left:top', radius: 10 }],
        },
      });

      // Remove fillet by setting radius to 0
      engine.dispatch({
        type: 'SET_CORNER_FILLETS_BATCH',
        targetId: assembly.id,
        payload: {
          fillets: [{ panelId: frontPanel!.id, corner: 'left:top', radius: 0 }],
        },
      });

      // Verify fillet is removed
      const radius = assembly.getCornerFilletRadius(frontPanel!.id, 'left:top');
      expect(radius).toBe(0);

      // Verify corner is back to square
      const panelsAfter = engine.getPanels();
      const frontPanelAfter = panelsAfter.find(p => p.source.faceId === 'front');
      const hasFilletCorner = frontPanelAfter?.cornerFillets?.some(
        f => f.corner === 'left:top' && f.radius > 0
      );
      expect(hasFilletCorner).toBeFalsy();
    });

    it('fillet values persist across scene clones', () => {
      const engine = createEngineWithAssembly(100, 80, 60, { thickness: 3 });
      const assembly = engine.assembly!;

      // Setup and add fillet
      engine.dispatch({ type: 'SET_FACE_SOLID', targetId: assembly.id, payload: { faceId: 'top', solid: false } });
      engine.dispatch({ type: 'SET_FACE_SOLID', targetId: assembly.id, payload: { faceId: 'left', solid: false } });

      const panels = engine.getPanels();
      const frontPanel = panels.find(p => p.source.faceId === 'front');

      engine.dispatch({
        type: 'SET_EDGE_EXTENSIONS_BATCH',
        targetId: assembly.id,
        payload: {
          extensions: [
            { panelId: frontPanel!.id, edge: 'top', value: 20 },
            { panelId: frontPanel!.id, edge: 'left', value: 20 },
          ],
        },
      });

      engine.dispatch({
        type: 'SET_CORNER_FILLETS_BATCH',
        targetId: assembly.id,
        payload: {
          fillets: [{ panelId: frontPanel!.id, corner: 'left:top', radius: 10 }],
        },
      });

      // Start preview (clones scene)
      engine.startPreview();

      // Read from main scene (should have committed value)
      const mainScene = engine.getMainScene();
      const mainAssembly = mainScene.primaryAssembly!;
      const radius = mainAssembly.getCornerFilletRadius(frontPanel!.id, 'left:top');

      expect(radius).toBe(10);

      engine.discardPreview();
    });

  });

  describe('Mixed Operations', () => {

    it('can modify extension then add fillet to same corner', () => {
      const engine = createEngineWithAssembly(100, 80, 60, { thickness: 3 });
      const assembly = engine.assembly!;

      // Setup
      engine.dispatch({ type: 'SET_FACE_SOLID', targetId: assembly.id, payload: { faceId: 'top', solid: false } });
      engine.dispatch({ type: 'SET_FACE_SOLID', targetId: assembly.id, payload: { faceId: 'left', solid: false } });

      const panels = engine.getPanels();
      const frontPanel = panels.find(p => p.source.faceId === 'front');

      // First: extend edges
      engine.dispatch({
        type: 'SET_EDGE_EXTENSIONS_BATCH',
        targetId: assembly.id,
        payload: {
          extensions: [
            { panelId: frontPanel!.id, edge: 'top', value: 20 },
            { panelId: frontPanel!.id, edge: 'left', value: 20 },
          ],
        },
      });

      // Second: add fillet
      engine.dispatch({
        type: 'SET_CORNER_FILLETS_BATCH',
        targetId: assembly.id,
        payload: {
          fillets: [{ panelId: frontPanel!.id, corner: 'left:top', radius: 8 }],
        },
      });

      // Third: increase extension
      engine.dispatch({
        type: 'SET_EDGE_EXTENSIONS_BATCH',
        targetId: assembly.id,
        payload: {
          extensions: [
            { panelId: frontPanel!.id, edge: 'top', value: 30 },
            { panelId: frontPanel!.id, edge: 'left', value: 30 },
          ],
        },
      });

      // Verify both are preserved
      const extensions = assembly.getPanelEdgeExtensions(frontPanel!.id);
      expect(extensions.top).toBe(30);
      expect(extensions.left).toBe(30);

      const radius = assembly.getCornerFilletRadius(frontPanel!.id, 'left:top');
      expect(radius).toBe(8);
    });

  });

});
```

---

## Verification Checklist

### Edge Extensions (Integration Tests: ✅)
- [x] First extension applies correctly
- [x] Second extension sets final value (delta computed in UI)
- [x] Base values are read from committed scene, not preview
- [ ] Edge selection changes during operation update baseExtensions
- [x] Values persist across commit/reopen cycles (scene clones)
- [x] Multiple edges can be extended independently
- [x] Extension value of 0 removes extension

### Corner Fillets (Integration Tests: ✅)
- [x] First fillet applies correctly
- [x] Second fillet replaces first (absolute mode)
- [ ] UI shows current radius when selecting filleted corner
- [x] Radius 0 removes fillet
- [x] Values persist across commit/reopen cycles (scene clones)
- [x] Multiple corners can be filleted independently

### Mixed Operations (Integration Tests: ✅)
- [x] Can modify extension then add fillet to same corner
- [x] Reducing extension below fillet radius preserves fillet data

### Preview and Commit Flow (Integration Tests: ✅)
- [x] Preview changes do not affect main scene until committed
- [x] Committed changes are visible in subsequent operations

### UI Behavior
- [ ] Inset palette shows offset (delta), starting at 0
- [ ] Fillet palette shows radius (absolute), starting at current value or default
- [ ] Both palettes update preview as values change
- [ ] Cancel reverts to original values
- [ ] Apply commits new values

---

## Implementation Order

1. ~~**Add `getCornerFilletRadius()` to BaseAssembly**~~ - Already exists as `getPanelCornerFillet(panelId, corner)`
2. ~~**Add `computeCurrentFilletRadii()` to Viewport3D**~~ - ✅ Complete: Reads current fillet values from committed scene
3. ~~**Update fillet operation start**~~ - ✅ Complete: Initializes radius from current value (min of selected corners)
4. ~~**Create integration tests**~~ - ✅ Complete: `src/engine/integration/secondOperations.test.ts` (12 tests)
5. **Update FilletPalette UI** - Show "Current: Xmm" when modifying existing (optional enhancement)

## Existing API

```typescript
// src/engine/nodes/BaseAssembly.ts

// Get fillet radius for a specific corner (returns 0 if none)
getPanelCornerFillet(panelId: string, corner: CornerKey): number

// Set fillet radius (radius <= 0 removes the fillet)
setPanelCornerFillet(panelId: string, corner: CornerKey, radius: number): void

// Get all fillets for a panel
getPanelCornerFillets(panelId: string): CornerFillet[]
```
