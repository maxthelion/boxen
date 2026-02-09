# Selection Synchronization Fix Plan

## Implementation Status: ✅ Complete

The property-based ID system has been implemented:

**New Architecture:**
- **Selection/Hover/Edit**: Uses engine UUIDs (`panel.id`)
- **Visibility/Isolation**: Uses property-based visibility keys (`main:front`, `drawer1:back`, etc.)

**Files Changed:**
- `src/utils/visibilityKey.ts` - New utility for computing stable visibility keys from panel properties
- `src/components/BoxTree.tsx` - Updated to use UUID for selection, visibility key for hide/isolate
- `src/components/PanelPathRenderer.tsx` - Updated visibility check to use visibility keys
- `src/store/helpers/selection.ts` - Updated selection helpers to work with panel objects

**Key Functions:**
- `getVisibilityKey(panel)` - Computes stable key from `panel.source`
- `getFaceVisibilityKey(faceId, subAssemblyId?)` - Convenience for face panels
- `getDividerVisibilityKey(parentVoidId, axis, position)` - Convenience for dividers

---

## Problem Summary

Selection between 3D view and tree view is not synchronized:

| Scenario | Symptom |
|----------|---------|
| Select panel in 3D view | Not highlighted in tree view |
| Select panel in tree view | Not highlighted in 3D view |
| Select in tree view | "Open Face" button available |
| Select in 3D view | "Open Face" button NOT available |
| Click "Edit in 2D" button | Shows "No panel selected for editing" |

## Root Cause: ID Format Mismatch

The application has **two incompatible ID systems** running simultaneously:

### System A: Engine UUIDs (Used by 3D View)
- Format: `"8f3c9a2e-4d7f-11ec-81d3-0242ac130003"`
- Source: `PanelPath.id` from engine
- Used by: `Box3D.tsx`, `PanelPathRenderer.tsx`

### System B: Semantic IDs (Used by Tree View)
- Formats:
  - Main faces: `"face-front"`, `"face-back"`, etc.
  - Sub-assembly faces: `"subasm-{subAssemblyId}-face-{faceId}"`
  - Dividers: UUID (same as engine)
- Source: Constructed in `BoxTree.tsx`
- Used by: `BoxTree.tsx`, visibility system, some selection helpers

### The Mismatch

```
User clicks panel in 3D:
  → selectPanel(UUID: "abc-123")
  → Store: selectedPanelIds = {"abc-123"}
  → Tree tries to match "abc-123" against "face-front"
  → NO MATCH - tree shows nothing selected

User clicks panel in tree:
  → selectPanel(semantic: "face-front")
  → Store: selectedPanelIds = {"face-front"}
  → 3D has panel with UUID "abc-123"
  → 3D checks: is "abc-123" in {"face-front"}?
  → NO MATCH - 3D shows nothing selected
```

---

## Affected Code Locations

| File | Line | Issue |
|------|------|-------|
| `BoxTree.tsx` | 844-849 | Creates semantic IDs (`face-front`) for faces |
| `BoxTree.tsx` | 666-671 | Creates semantic IDs for sub-assembly faces |
| `BoxTree.tsx` | 1082 | Passes semantic ID to `selectPanel()` |
| `Box3D.tsx` | 164-198 | Passes UUID to `selectPanel()` |
| `Box3D.tsx` | 49-57 | Tries to parse semantic IDs from UUIDs (always fails) |
| `selection.ts` | 22-31 | `getAssemblyIdForPanel()` only works with semantic IDs |
| `PanelPathRenderer.tsx` | 494-500 | Visibility workaround checks both formats |

---

## Proposed Solution

**Standardize on UUIDs everywhere.** The engine's panel UUIDs are the authoritative source of truth.

### Phase 1: Fix Tree View Selection

**File: `BoxTree.tsx`**

1. **Change face panel clicks to use engine UUID:**
   ```typescript
   // Before (around line 1082)
   const panelId = `face-${faceId}`;
   selectPanel(panelId);

   // After
   const panel = panelCollection.panels.find(
     p => p.source.type === 'face' && p.source.faceId === faceId
   );
   if (panel) selectPanel(panel.id);  // Use engine UUID
   ```

2. **Change sub-assembly face clicks similarly:**
   ```typescript
   // Before
   const panelId = `subasm-${subAssemblyId}-face-${faceId}`;
   selectPanel(panelId);

   // After
   const panel = panelCollection.panels.find(
     p => p.source.type === 'face' &&
          p.source.faceId === faceId &&
          p.source.subAssemblyId === subAssemblyId
   );
   if (panel) selectPanel(panel.id);
   ```

3. **Update selection highlighting to match UUIDs:**
   ```typescript
   // Before
   const isSelected = selectedPanelIds.has(`face-${faceId}`);

   // After
   const panel = panelCollection.panels.find(
     p => p.source.type === 'face' && p.source.faceId === faceId
   );
   const isSelected = panel ? selectedPanelIds.has(panel.id) : false;
   ```

### Phase 2: Fix Selection Helpers

**File: `src/store/utils/selection.ts`**

1. **Update `getAssemblyIdForPanel()` to work with UUIDs:**
   ```typescript
   // Need to pass panelCollection or use a lookup
   export const getAssemblyIdForPanel = (
     panelId: string,
     panelCollection: PanelCollection | null
   ): string => {
     if (!panelCollection) return 'main';

     const panel = panelCollection.panels.find(p => p.id === panelId);
     if (!panel) return 'main';

     return panel.source.subAssemblyId ?? 'main';
   };
   ```

2. **Update `computeVisuallySelectedPanelIds()` to use the new helper**

### Phase 3: Fix 3D View Selection Parsing

**File: `Box3D.tsx`**

Remove the semantic ID parsing that doesn't work:
```typescript
// Before (lines 49-57)
const selectedFaceIds = useMemo(() => {
  const faceIds = new Set<FaceId>();
  for (const panelId of visuallySelectedPanelIds) {
    if (panelId.startsWith('face-')) {  // Never matches UUIDs!
      faceIds.add(panelId.replace('face-', '') as FaceId);
    }
  }
  return faceIds;
}, [visuallySelectedPanelIds]);

// After
const selectedFaceIds = useMemo(() => {
  const faceIds = new Set<FaceId>();
  if (!panelCollection) return faceIds;

  for (const panelId of visuallySelectedPanelIds) {
    const panel = panelCollection.panels.find(p => p.id === panelId);
    if (panel?.source.type === 'face' && panel.source.faceId) {
      faceIds.add(panel.source.faceId);
    }
  }
  return faceIds;
}, [visuallySelectedPanelIds, panelCollection]);
```

### Phase 4: Migrate Visibility System

**File: `PanelPathRenderer.tsx`** and related

The visibility system (`hiddenFaceIds`) also uses semantic IDs. After fixing selection, migrate visibility to use UUIDs as well, or keep the dual-format checking as a transitional measure.

---

## Implementation Order

1. **Phase 1** - Fix tree view to emit UUIDs (highest impact)
2. **Phase 3** - Fix 3D view parsing (enables bidirectional sync)
3. **Phase 2** - Fix selection helpers (enables assembly cascading)
4. **Phase 4** - Migrate visibility (cleanup)

---

## Testing Checklist

After implementation, verify:

- [ ] Click face in 3D → highlighted in tree
- [ ] Click face in tree → highlighted in 3D
- [ ] Click divider in 3D → highlighted in tree
- [ ] Click divider in tree → highlighted in 3D
- [ ] Click sub-assembly panel in 3D → highlighted in tree
- [ ] Click sub-assembly panel in tree → highlighted in 3D
- [ ] "Open Face" button works after 3D selection
- [ ] "Open Face" button works after tree selection
- [ ] Assembly cascade selection works (select assembly → all panels highlight)
- [ ] Multi-select with shift works across views
- [ ] Visibility toggle (hide/show) still works
- [ ] 2D edit view opens for correct panel from either selection source

---

## Why This Wasn't Sorted Out Already

The dual ID system exists for a **valid technical reason**: preview stability.

### The Visibility Problem

When a user hides a panel (e.g., "Front") and then starts a preview operation:

1. User hides "Front" → `hiddenFaceIds = {"face-front"}`
2. User starts a preview (e.g., subdivide)
3. Engine clones the scene for preview
4. **Cloned scene generates new UUIDs for all panels**
5. If hiding used UUID `"abc-123"`, the new panel `"xyz-789"` wouldn't be hidden

Using semantic IDs like `"face-front"` ensures panels stay hidden across scene clones, because the semantic identity (this is the front face) is stable even when the underlying object changes.

### Why It Created Problems

The implementation chose semantic IDs for visibility but didn't consistently apply this to selection:

1. **Visibility system**: Uses semantic IDs (correctly, for preview stability)
2. **Tree view selection**: Uses semantic IDs (for visibility compatibility)
3. **3D view selection**: Uses engine UUIDs (direct from panel objects)
4. **2D edit view**: Expects UUIDs (panel lookup by ID)

The tree view created a bridge (`buildPanelLookup`) to translate between systems, but:
- Selection clicks still pass semantic IDs
- `enterSketchView` receives semantic ID but SketchView2D expects UUID

### The Correct Architecture

The fix standardizes on **UUIDs as the internal representation** with translation at boundaries:

```
User sees: "Front" panel
Tree uses: panelLookup.facePanels.get("front") → UUID
Store stores: UUID in selectedPanelIds
3D checks: UUID match ✓
2D receives: UUID ✓
```

For visibility, we keep semantic IDs but translate when checking:

```
User hides: "Front"
Store stores: "face-front" in hiddenFaceIds
Renderer checks: panel.source.faceId === "front" (from semantic ID)
```

---

## Additional Case: 2D Panel Editing

### The Bug

Clicking "Edit in 2D" (✎ button) on a tree panel shows "No panel selected for editing".

### Root Cause

```typescript
// BoxTree.tsx (line 844-849)
const outerFacePanels = faces.map((face) => ({
  id: `face-${face.id}`,  // Semantic ID
  ...
}));

// BoxTree.tsx (line 255)
onEditPanel(panel.id);  // Passes "face-front"

// viewSlice.ts (line 36-39)
enterSketchView: (panelId) =>
  set({ sketchPanelId: panelId, ... });  // Stores "face-front"

// SketchView2D.tsx (line 288)
const panel = panelCollection.panels.find(p => p.id === sketchPanelId);
// Looks for UUID === "face-front" → NO MATCH
```

### Fix

Translate semantic ID to UUID in `enterSketchView`, or fix the tree to pass UUIDs. The latter is cleaner and consistent with the overall fix strategy.

---

## Notes

- The visibility system already has a workaround checking both formats (`PanelPathRenderer.tsx:494-500`)
- This pattern could be temporarily adopted for selection while migrating
- Divider panels already use UUIDs in both views (no change needed for those)
- Consider adding a `findPanelBySemanticId()` helper for any remaining legacy code
