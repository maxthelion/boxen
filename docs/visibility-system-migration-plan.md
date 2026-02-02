# Visibility System Migration Plan

## Problem Summary

The visibility and selection systems use different ID formats, causing UI buttons (show/hide/isolate) to not appear when panels are selected.

| System | ID Format | Example |
|--------|-----------|---------|
| Selection | Engine UUIDs | `"8f3c9a2e-4d7f-11ec-81d3..."` |
| Visibility | Semantic IDs (broken) | `"face-front"`, `"subasm-xxx-face-top"` |
| Visibility Keys (correct) | Property-based | `"main:front"`, `"drawer1:back"` |

**Root Cause**: Selection was migrated to use UUIDs, but the visibility system still constructs and checks semantic IDs like `"face-front"`. The UI logic checks if selected panels match certain patterns to determine which buttons to show, but since selection uses UUIDs, these checks always fail.

---

## Affected Files

### Critical (Buttons Not Showing)

| File | Issue | Lines |
|------|-------|-------|
| `src/components/Box3D.tsx` | Parses `selectedPanelIds` as semantic IDs to extract face IDs | 49-57, 221 |
| `src/store/slices/visibilitySlice.ts` | Uses `MAIN_FACE_PANEL_IDS` (semantic format) for hide/isolate | 147-152, 247-252, 336-341, 362-367 |

### Secondary (Fallback Code)

| File | Issue | Lines |
|------|-------|-------|
| `src/components/BoxTree.tsx` | `findEnginePanel()` has semantic ID fallback | 1010-1016 |
| `src/components/Viewport3D.tsx` | Fillet tool has semantic ID fallback | 515-520 |
| `src/store/helpers/selection.ts` | Legacy semantic ID parsing fallback | 46-50 |

### Definitions

| File | Issue | Lines |
|------|-------|-------|
| `src/types.ts` | `MAIN_FACE_PANEL_IDS` defined as `['face-front', ...]` | 148 |
| `src/types.ts` | Comment describes old format | 265 |

---

## Implementation Plan

### Phase 1: Fix Box3D.tsx Button Visibility

**Goal**: Make show/hide buttons appear when face panels are selected.

**File: `src/components/Box3D.tsx`**

The current code tries to parse semantic IDs from UUIDs:

```typescript
// CURRENT (broken)
const selectedFaceIds = useMemo(() => {
  const faceIds = new Set<FaceId>();
  for (const panelId of visuallySelectedPanelIds) {
    if (panelId.startsWith('face-')) {  // Never matches UUIDs!
      faceIds.add(panelId.replace('face-', '') as FaceId);
    }
  }
  return faceIds;
}, [visuallySelectedPanelIds]);
```

**Fix**: Look up panel source info from engine panels:

```typescript
// FIXED - use panel source info
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

Also fix line 221 which extracts faceId from selected panel:

```typescript
// CURRENT (broken)
const faceId = selectedFaceId.replace('face-', '') as FaceId;

// FIXED
const selectedPanel = panelCollection?.panels.find(p => p.id === selectedFaceId);
const faceId = selectedPanel?.source.faceId;
if (!faceId) return;
```

### Phase 2: Fix Visibility Slice

**Goal**: Make hide/show/isolate use visibility keys instead of semantic IDs.

**File: `src/store/slices/visibilitySlice.ts`**

#### 2a. Replace `MAIN_FACE_PANEL_IDS` usage

Create a helper to get main face visibility keys:

```typescript
import { getFaceVisibilityKey } from '../../utils/visibilityKey';
import { ALL_FACE_IDS } from '../../types';

// Get visibility keys for all main assembly faces
const getMainFaceVisibilityKeys = (): string[] => {
  return ALL_FACE_IDS.map(faceId => getFaceVisibilityKey(faceId));
  // Returns: ['main:front', 'main:back', 'main:left', 'main:right', 'main:top', 'main:bottom']
};
```

Replace all occurrences of `MAIN_FACE_PANEL_IDS` with `getMainFaceVisibilityKeys()`.

#### 2b. Fix sub-assembly face visibility keys

```typescript
// CURRENT (wrong format)
const subFaceId = `subasm-${subAssembly.id}-face-${face.id}`;

// FIXED (use visibility key)
const subFaceKey = getFaceVisibilityKey(face.id, subAssembly.id);
// Returns: "drawer1:front"
```

#### 2c. Fix isolatePanel parameter handling

The `isolatePanel` action receives a panel ID (now UUID). It needs to:
1. Look up the panel to get its visibility key
2. Use the visibility key for hiding other panels

```typescript
isolatePanel: (panelId: string, panelCollection: PanelCollection | null) => {
  // Find the panel to get its visibility key
  const panel = panelCollection?.panels.find(p => p.id === panelId);
  if (!panel) return;

  const targetVisibilityKey = getVisibilityKey(panel);

  // Hide all OTHER faces using visibility keys
  const mainFaceKeys = getMainFaceVisibilityKeys();
  for (const faceKey of mainFaceKeys) {
    if (faceKey !== targetVisibilityKey) {
      newHiddenFaceIds.add(faceKey);
    }
  }
  // ... rest of logic
};
```

### Phase 3: Update Types and Constants

**File: `src/types.ts`**

Option A: Remove `MAIN_FACE_PANEL_IDS` entirely and use the helper function.

Option B: Redefine to use visibility key format:
```typescript
// Generate main face visibility keys
export const MAIN_FACE_VISIBILITY_KEYS = ALL_FACE_IDS.map(id => `main:${id}`);
```

Update comment on line 265 to document the new format.

### Phase 4: Remove Fallback Code

Remove semantic ID fallback parsing from:

1. **`src/components/BoxTree.tsx`** line 1010-1016 - Remove `startsWith('face-')` fallback
2. **`src/components/Viewport3D.tsx`** line 515-520 - Remove `startsWith('face-')` fallback
3. **`src/store/helpers/selection.ts`** line 46-50 - Remove legacy subasm ID parsing

These fallbacks are no longer needed since the system should consistently use UUIDs for selection.

### Phase 5: Update Tests

Update test files to use the new ID formats:
- `tests/unit/store/useBoxStore.test.ts`
- `tests/unit/operations/validators.test.ts`

Tests should either:
- Use actual UUIDs from engine panels
- Use visibility keys for visibility-related tests
- Mock the panel lookup when testing selection logic

---

## API Changes

### Actions That Need Panel Collection

Some visibility actions now need access to `panelCollection` to look up visibility keys from panel UUIDs:

```typescript
// Before
togglePanelVisibility(panelId: string)

// After
togglePanelVisibility(panelId: string, panelCollection: PanelCollection | null)
```

Affected actions:
- `togglePanelVisibility`
- `isolatePanel`
- `showOnlyPanel`

**Alternative**: Store could subscribe to engine state and maintain its own panel lookup map.

---

## Migration Strategy

1. **Phase 1 first** - Fix Box3D.tsx to make buttons appear (immediate UX fix)
2. **Phase 2** - Fix visibility slice to use correct keys
3. **Phase 3 & 4** - Cleanup old code and constants
4. **Phase 5** - Update tests

Each phase can be tested independently.

---

## Verification

After implementation, verify:

- [ ] Select face panel in 3D view → Hide/Show/Isolate buttons appear
- [ ] Select face panel in tree view → Hide/Show/Isolate buttons appear
- [ ] Click "Hide" on selected face → Face is hidden
- [ ] Click "Show" on hidden face → Face reappears
- [ ] Click "Isolate" on face → Only that face visible
- [ ] Click "Show All" → All faces visible again
- [ ] Same tests work for sub-assembly faces
- [ ] Same tests work for divider panels
- [ ] Selection still syncs between 3D and tree views
