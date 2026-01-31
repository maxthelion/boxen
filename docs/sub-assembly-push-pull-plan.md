# Sub-Assembly Push/Pull Fix Plan

## Problem

When performing push/pull on a face in a sub-assembly, the **parent assembly** changes size instead of the sub-assembly. This is because push/pull hardcodes `targetId: 'main-assembly'` regardless of which assembly the selected panel belongs to.

## Root Cause

In `src/operations/registry.ts` (lines 102-106):
```typescript
return {
  type: 'SET_DIMENSIONS',
  targetId: 'main-assembly',  // <-- Always targets main assembly
  payload: { width: newWidth, height: newHeight, depth: newDepth },
};
```

## Design Considerations

### Sub-Assembly Dimensional Constraints

Sub-assemblies live inside voids and should respect physical constraints:

1. **Void-bounded dimensions**: A sub-assembly cannot grow larger than its containing void
2. **Open face exception**: A sub-assembly could extend beyond its void boundary ONLY through an open face (no panel blocking it)
3. **Clearance**: Sub-assemblies have clearance from void walls (for sliding drawers, etc.)

### Current Behavior

SubAssemblyNode calculates dimensions from its parent void:
```typescript
// SubAssemblyNode.ts:75-81
updateDimensionsFromVoid() {
  const bounds = this._parentVoid.region;
  this._width = bounds.w - 2 * this._clearance;
  this._height = bounds.h - 2 * this._clearance;
  this._depth = bounds.d - 2 * this._clearance;
}
```

This means sub-assembly dimensions are derived, not independent.

## Proposed Solution

### Option A: Constrained Push/Pull (Recommended)

Push/pull on a sub-assembly face should be **constrained** to the available space:

1. **Detect target assembly** from the selected panel's `subAssemblyId`
2. **Calculate maximum growth** based on:
   - Void bounds minus clearance (for solid faces)
   - Unlimited growth for open faces (sub-assembly can "stick out")
3. **Clamp the offset** to valid range
4. **Update sub-assembly dimensions** (not the parent)

**Behavior by direction:**

| Face | Can Shrink? | Can Grow? | Growth Limit |
|------|-------------|-----------|--------------|
| Any solid face | Yes (to min dimension) | No | At void boundary already |
| Open face (toward opening) | Yes | Yes | No limit (extends out of void) |
| Open face (away from opening) | Yes | No | Blocked by opposite wall |

### Option B: Parent Void Resize

Instead of sizing the sub-assembly independently, resize the parent void:

1. Push/pull on sub-assembly resizes the void it occupies
2. Sub-assembly auto-updates to fill the new void (minus clearance)
3. Would require checking if void can resize (sibling voids, parent constraints)

**Downside**: More complex, affects other voids, not intuitive.

### Option C: Disable Push/Pull on Sub-Assemblies

Simplest fix - don't allow push/pull on sub-assembly faces:

1. Check if selected panel belongs to a sub-assembly
2. Show message: "Use Scale tool to resize sub-assemblies"
3. User must select sub-assembly and use Scale operation

**Downside**: Less intuitive, removes expected functionality.

## Chosen Implementation: Extend SET_DIMENSIONS with Position Offset ✅ IMPLEMENTED

After analysis, the best approach is to:
1. Add `_positionOffset` property to SubAssemblyNode ✅
2. Extend `SET_DIMENSIONS` to accept optional `faceId` and calculate position offset ✅
3. Update `getWorldTransform()` to include the offset ✅
4. Disable Scale mode for sub-assemblies (only Extend makes sense) ✅

**Reasoning:**
- No new action type needed - keeps code DRY
- Position offset is persistent state that belongs on the node
- Backwards compatible - existing SET_DIMENSIONS calls without faceId work as before
- Consistent with main assembly behavior (anchored at origin)

### Scale vs Extend Decision

**For sub-assemblies, only Extend mode is offered.** Scale mode is disabled in the UI.

**Reasoning:**
- When you directly manipulate a face, you expect that specific face to move
- Scale mode (centered growth) causes counterintuitive bidirectional movement
- Sub-assemblies don't have a meaningful "center" to preserve - they float in voids
- The position offset system implements Extend behavior (anchor opposite face)

### Implementation Steps

1. **SubAssemblyNode changes:**
   - Add `_positionOffset: { x: number; y: number; z: number }` property
   - Add `setPositionOffset()` method
   - Update `getWorldTransform()` to include offset
   - Update `serialize()` / constructor to persist offset

2. **Engine SET_DIMENSIONS handler:**
   - Accept optional `faceId` in payload
   - When faceId provided, calculate position offset:
     - Get current dimension on that axis
     - Calculate delta = newDimension - currentDimension
     - Position offset = delta / 2 in the direction opposite to faceId

3. **Registry push-pull action:**
   - Pass `faceId` to SET_DIMENSIONS payload

### Position Offset Calculation

When pushing face F by delta D:
```
Face    | Axis | Position Offset Change
--------|------|------------------------
right   | X    | +D/2 (shift right to anchor left)
left    | X    | -D/2 (shift left to anchor right)
top     | Y    | +D/2 (shift up to anchor bottom)
bottom  | Y    | -D/2 (shift down to anchor top)
front   | Z    | +D/2 (shift forward to anchor back)
back    | Z    | -D/2 (shift back to anchor front)
```

## Previous Options (for reference)

### Phase 1: Fix Target Assembly Detection

1. **Add assembly context to operations**
   - Modify `updateOperationParams()` in `operationSlice.ts` to include `assemblyId` in context
   - Use `getAssemblyIdForPanel()` helper to determine which assembly

2. **Update push-pull action creator**
   - Change `createPreviewAction` to use dynamic `targetId`
   - For sub-assemblies, use `sub-assembly-{id}` format

3. **Add engine support**
   - Ensure `SET_DIMENSIONS` action can target sub-assembly nodes
   - SubAssemblyNode.setDimensions() already exists

### Phase 2: Add Dimensional Constraints

1. **Calculate available space**
   ```typescript
   function getSubAssemblyGrowthLimits(subAssembly: SubAssemblyNode, faceId: FaceId) {
     const void = subAssembly.parentVoid;
     const voidBounds = void.region;
     const clearance = subAssembly.clearance;

     // Check if this face is open in the sub-assembly
     const faceIsOpen = !subAssembly.faces[faceId].solid;

     // Calculate max growth for this axis
     if (faceIsOpen) {
       // Can grow through open face
       return { min: clearance, max: Infinity };
     } else {
       // Bounded by void
       return { min: clearance, max: voidBounds[axis] - 2 * clearance };
     }
   }
   ```

2. **Validate offset in preview**
   - Before creating preview action, check if offset is valid
   - Clamp to valid range or show warning

3. **UI feedback**
   - Show max/min in palette when operating on sub-assembly
   - Disable +/- buttons at limits

### Phase 3: Handle Open Face Extension

1. **Detect open faces** that allow extension
2. **Calculate extension bounds** - how far sub-assembly can stick out
3. **Update positioning** - sub-assembly may need to shift when extending through open face
4. **Visual feedback** - show the sub-assembly extending beyond void

## Files to Modify

1. `src/operations/registry.ts` - Fix hardcoded targetId
2. `src/store/slices/operationSlice.ts` - Add assembly context
3. `src/engine/Engine.ts` - Handle sub-assembly SET_DIMENSIONS targeting
4. `src/engine/nodes/SubAssemblyNode.ts` - Add constraint checking methods
5. `src/components/PushPullPalette.tsx` - Show constraints in UI

## Testing

1. **Unit tests**
   - Sub-assembly dimension constraints calculation
   - Open face detection

2. **Integration tests**
   - Push/pull on sub-assembly doesn't affect parent
   - Offset is clamped to valid range
   - Open face allows extension

3. **Manual testing**
   - Create box with subdivision
   - Add sub-assembly to one void
   - Push/pull on sub-assembly faces
   - Verify parent doesn't change
   - Test with open faces

## Design Decisions

1. **Sub-assemblies CAN extend through open faces** - no blocking panel means they can grow outward
2. **No maximum extension limit** - user controls how far to extend
3. **Both Scale and Extend modes** work for sub-assemblies
