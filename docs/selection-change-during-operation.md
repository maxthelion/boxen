# Issue: Selection Changes During Active Operations

## Problem

When an operation with preview is active (e.g., inset/outset), changing the selection mid-operation does not behave correctly:

- **Removed items** should revert to their original (pre-operation) state
- **Added items** should immediately have the operation applied to them

Currently, neither of these behaviors works as expected.

---

## Example Scenario

1. User selects edges A and B
2. User activates inset tool
3. User sets inset amount to 10mm
4. Preview shows edges A and B inset by 10mm
5. User deselects edge B (now only A is selected)
6. **Expected:** Edge B reverts to original position, edge A remains inset
7. **Actual:** Edge B stays inset (stale preview state)

Similarly for adding:

1. User selects edge A
2. User activates inset tool with 10mm
3. User adds edge B to selection
4. **Expected:** Both A and B show 10mm inset
5. **Actual:** Edge B is not affected by the operation

---

## Expected Behavior

When selection changes during an active parameter operation:

### On Selection Remove
1. Detect which items were removed from selection
2. Those items should revert to their pre-operation state
3. The operation continues to apply only to remaining selected items

### On Selection Add
1. Detect which items were added to selection
2. Apply the current operation parameters to the new items
3. All selected items now show the operation preview

### Implementation Approach

This likely requires:

1. **Recreate preview from committed state** - When selection changes, discard the current preview scene and create a fresh clone from the committed scene
2. **Re-apply operation** - Apply the operation with current parameters to the new selection set
3. **Track original selection** - Know what was selected when operation started vs. current selection

```
Selection change detected
    ↓
Discard current preview scene
    ↓
Clone fresh preview from committed scene
    ↓
Apply operation to NEW selection with current params
    ↓
Render updated preview
```

---

## Affected Operations

Any operation with `type: 'parameter'` that supports multi-selection:

- `inset-outset` (edge selection)
- `subdivide` (void selection, if multi-select enabled)
- `push-pull` (face selection, if multi-select enabled)

---

## Key Files

| File | Role |
|------|------|
| `src/store/useBoxStore.ts` | Selection state, operation state |
| `src/engine/Engine.ts` | Preview scene management |
| `src/components/InsetPalette.tsx` | Inset operation UI and logic |

---

## Considerations

### Performance
Recreating the preview on every selection change could be expensive for complex scenes. May need to:
- Debounce selection changes
- Only recreate if selection actually changed (not just re-triggered)

### UX
- Should there be visual feedback that items are being added/removed from the operation?
- Should removed items animate back to original position or snap immediately?

### Edge Cases
- What if user removes ALL items from selection? Cancel the operation? Keep preview with no effect?
- What if user switches to a completely different selection type (e.g., from edges to faces)?
