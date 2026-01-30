# Plan: Inset Tool Locked Panel UX

## Summary

Improve the inset/outset tool experience when users select panels with all locked edges. Instead of preventing selection entirely, show the panel as invalid (red) and display the palette with helpful information and actions.

---

## Current Behavior

When the inset tool is active:
- Only edges that are not "locked" (male) can be selected
- Panels with all locked edges effectively can't be used with the tool
- No feedback about why edges can't be modified

---

## Proposed Behavior

### 1. Visual Feedback for Invalid Panels

When a panel is selected but has all edges locked:
- **Panel highlight turns red** (instead of normal selection color)
- Indicates "this selection is invalid for this tool"

```
Normal selection:     Invalid selection:
┌─────────────┐      ┌─────────────┐
│   ORANGE    │      │    RED      │
│   highlight │      │   highlight │
└─────────────┘      └─────────────┘
```

### 2. Palette Shows Locked State

The InsetPalette should display when an invalid panel is selected, but show:
- Which panel is selected
- That all edges are locked
- Why they're locked (male joints connect to adjacent panels)
- Available actions (see below)

**Palette UI for locked panel:**

```
┌─────────────────────────────────────┐
│  Inset/Outset                    ✕  │
├─────────────────────────────────────┤
│                                     │
│  ⚠️ All edges locked               │
│                                     │
│  Panel: Bottom                      │
│                                     │
│  All edges have male joints that    │
│  connect to adjacent panels.        │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  🔒 Top     → Front panel   │   │
│  │  🔒 Bottom  → Back panel    │   │
│  │  🔒 Left    → Left panel    │   │
│  │  🔒 Right   → Right panel   │   │
│  └─────────────────────────────┘   │
│                                     │
│  [Swap Tab Direction]               │
│                                     │
└─────────────────────────────────────┘
```

### 3. Swap Tab Direction Button

For lid panels (top/bottom along Y-axis, or equivalent for other assembly axes):
- Show a "Swap Tab Direction" button
- Clicking swaps whether this panel tabs OUT (male, locked edges) or IN (female, editable edges)

**When available:**
- Panel is a "lid" face (perpendicular to assembly axis)
- Top or Bottom for Y-axis assembly
- Left or Right for X-axis assembly
- Front or Back for Z-axis assembly

**Action:**
- Dispatches engine action to swap the panel's joint gender
- After swap, edges become unlocked (female) and can be extended
- Adjacent wall panels now have their corresponding edges locked

---

## Implementation Details

### 1. Panel Selection Validation

Add a function to check if a panel has any editable edges:

```typescript
// src/engine/utils/edgeStatus.ts

export function hasEditableEdges(panel: PanelSnapshot): boolean {
  return panel.derived.edgeStatuses.some(
    edge => edge.status !== 'locked'
  );
}

export function isLidPanel(
  faceId: FaceId,
  assemblyAxis: Axis
): boolean {
  const lidFaces: Record<Axis, FaceId[]> = {
    x: ['left', 'right'],
    y: ['top', 'bottom'],
    z: ['front', 'back'],
  };
  return lidFaces[assemblyAxis].includes(faceId);
}
```

### 2. Visual Feedback in 3D View

Modify panel highlighting to use red for invalid selections:

```typescript
// In PanelHighlight or similar component

const highlightColor = useMemo(() => {
  if (!isSelected) return null;

  if (activeTool === 'inset' && !hasEditableEdges(panel)) {
    return 'red';  // Invalid for this tool
  }

  return 'orange';  // Normal selection
}, [isSelected, activeTool, panel]);
```

### 3. InsetPalette Updates

Modify `InsetPalette.tsx` to handle locked panel state:

```typescript
interface InsetPaletteProps {
  // ... existing props
}

const InsetPalette: React.FC<InsetPaletteProps> = (props) => {
  const selectedPanels = useSelectedPanels();
  const assemblyAxis = useEngineAssemblyAxis();

  // Check if any selected panel has all locked edges
  const lockedPanels = selectedPanels.filter(p => !hasEditableEdges(p));
  const hasLockedPanels = lockedPanels.length > 0;

  // Check if locked panels can have tab direction swapped
  const swappablePanels = lockedPanels.filter(p =>
    p.kind === 'face-panel' &&
    isLidPanel(p.props.faceId, assemblyAxis)
  );

  if (hasLockedPanels && selectedEdges.size === 0) {
    return (
      <FloatingPalette title="Inset/Outset" onClose={onClose} {...props}>
        <LockedPanelInfo
          panels={lockedPanels}
          swappablePanels={swappablePanels}
          onSwapTabDirection={handleSwapTabDirection}
        />
      </FloatingPalette>
    );
  }

  // ... normal palette content
};
```

### 4. Swap Tab Direction Action

Add engine action if not already present:

```typescript
// Engine action
{
  type: 'SWAP_LID_TAB_DIRECTION',
  targetId: string,  // assembly ID
  payload: {
    faceId: FaceId
  }
}
```

This action:
1. Finds the face panel
2. Swaps its joint configuration (tabs in ↔ tabs out)
3. Updates adjacent panels accordingly
4. Regenerates finger joint patterns

---

## UI States Summary

| Selection State | Panel Color | Palette Content |
|-----------------|-------------|-----------------|
| No selection | - | "Select edges to extend" |
| Edges selected | Orange | Offset slider, Apply/Cancel |
| Panel with editable edges | Orange | Edge list, can select edges |
| Panel with ALL locked edges | **Red** | Locked info, Swap button (if lid) |
| Mixed (some locked, some not) | Orange | Only show editable edges |

---

## Edge Cases

### Multiple Panels Selected
- If some panels have editable edges and others don't:
  - Show editable edges from valid panels
  - List locked panels separately with warning
  - Swap button available for any swappable locked panels

### After Swapping Tab Direction
- Panel becomes editable
- Edges change from locked to unlocked
- Preview updates to show new state
- User can now select edges and apply inset/outset

### Divider Panels
- Divider panels may have locked edges too
- No "swap" option for dividers (their gender is determined by position)
- Just show informational message

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/engine/utils/edgeStatus.ts` | Add `hasEditableEdges()`, `isLidPanel()` |
| `src/components/InsetPalette.tsx` | Add locked panel UI, swap button |
| `src/components/Box3D.tsx` or `PanelHighlight.tsx` | Red highlight for invalid selection |
| `src/engine/Engine.ts` | Add `SWAP_LID_TAB_DIRECTION` handler (if needed) |
| `src/engine/types.ts` | Add action type (if needed) |

---

## Verification

1. **Red highlight test:**
   - Activate inset tool
   - Click on bottom panel (typically all locked)
   - Panel should highlight red, not orange

2. **Palette shows locked info:**
   - With locked panel selected, palette shows warning
   - Lists all edges as locked with adjacent panel info

3. **Swap button works:**
   - Click "Swap Tab Direction" on bottom panel
   - Panel edges become editable (not locked)
   - Can now select edges and apply inset

4. **Non-lid panels:**
   - Select a wall panel with locked edges
   - No swap button shown (not a lid)
   - Just informational message
