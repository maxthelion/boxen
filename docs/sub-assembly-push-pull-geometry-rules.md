# Sub-Assembly Push/Pull Geometry Rules

## Current Problems

1. **Cumulative offset**: Each preview update adds to previous value instead of being absolute
2. **Bidirectional growth**: Assembly extends in both directions (centered) instead of one direction (anchored)

## Proposed Geometry Rules

### Rule 1: Absolute Offset, Not Delta

The offset value should represent the **total displacement** from the original position, not a delta from the current position.

```
Original dimension: 80mm
Offset: +10mm
Result: 90mm (not 80 + 10 + 10 + 10...)
```

**Implementation**: Store the original dimensions when operation starts, apply offset to original.

### Rule 2: Anchored Growth (Opposite Face Stays Fixed)

When pushing/pulling a face, the **opposite face stays fixed** in world space. The assembly grows/shrinks in one direction only.

```
Push/Pull on RIGHT face with offset +10:
┌──────────┐       ┌─────────────┐
│          │  →    │             │
│  SUB-ASM │       │   SUB-ASM   │
│          │       │             │
└──────────┘       └─────────────┘
LEFT stays         RIGHT moves +10
```

**Implementation**: Requires tracking a position offset, not just dimensions.

### Rule 3: Sub-Assembly Position Model

Sub-assemblies need **independent position** within their void, not just centered.

Current model:
- Sub-assembly dimensions: `void_dimension - 2 * clearance`
- Position: centered in void

New model:
- Sub-assembly dimensions: independent (with constraints)
- Position: `(offset_x, offset_y, offset_z)` relative to void origin + clearance
- Default: centered (offset = 0, 0, 0)

### Rule 4: Face-Direction Mapping

Each face determines which direction the assembly grows:

| Face | Axis | Growth Direction | Position Change |
|------|------|-----------------|-----------------|
| right | X | +X | offset_x += offset/2, width += offset |
| left | X | -X | offset_x -= offset/2, width += offset |
| top | Y | +Y | offset_y += offset/2, height += offset |
| bottom | Y | -Y | offset_y -= offset/2, height += offset |
| front | Z | +Z | offset_z += offset/2, depth += offset |
| back | Z | -Z | offset_z -= offset/2, depth += offset |

Note: Position changes by half because dimension change is full but we want one face fixed.

### Rule 5: Constraint Boundaries

Growth is constrained by void bounds (except through open faces):

```
For positive offset (growing):
  - Check if growth direction hits void boundary
  - If blocked (solid face), clamp or reject
  - If open (no face), allow unlimited growth

For negative offset (shrinking):
  - Allow down to minimum dimension (e.g., 2 * material_thickness)
  - No position constraint issues when shrinking
```

## Implementation Approach

### Option A: New Engine Action (Recommended)

Create a new action `PUSH_PULL_SUB_ASSEMBLY` that handles:
- Face ID to determine direction
- Absolute offset from original
- Position adjustment to anchor opposite face

```typescript
{
  type: 'PUSH_PULL_SUB_ASSEMBLY',
  targetId: subAssemblyId,
  payload: {
    faceId: 'right',
    offset: 10,  // Absolute offset from original
    originalDimensions: { width: 80, height: 60, depth: 40 },
    originalPosition: { x: 0, y: 0, z: 0 },
  }
}
```

### Option B: Extend SET_DIMENSIONS

Add position offset to SET_DIMENSIONS payload:

```typescript
{
  type: 'SET_DIMENSIONS',
  targetId: subAssemblyId,
  payload: {
    width: 90,
    height: 60,
    depth: 40,
    positionOffset: { x: 5, y: 0, z: 0 },  // Shift to anchor left face
  }
}
```

### Option C: Separate Position Action

Use two actions: SET_DIMENSIONS + SET_POSITION

Less atomic, more complex coordination.

## Recommended: Option A

Create a dedicated `PUSH_PULL_SUB_ASSEMBLY` action that:

1. **Stores original state** in operation params when operation starts
2. **Calculates new dimensions** based on face and absolute offset
3. **Calculates position shift** to keep opposite face anchored
4. **Validates constraints** against void bounds
5. **Updates both dimension and position** atomically

## SubAssemblyNode Changes

Add position offset support:

```typescript
class SubAssemblyNode {
  // New: position offset from centered position
  protected _positionOffset: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };

  // New: independent dimensions flag (once push-pulled, no longer auto-updates from void)
  protected _hasIndependentDimensions: boolean = false;

  setDimensionsWithOffset(
    dims: { width?: number; height?: number; depth?: number },
    positionOffset: { x?: number; y?: number; z?: number }
  ): void {
    // Update dimensions
    if (dims.width !== undefined) this._width = dims.width;
    if (dims.height !== undefined) this._height = dims.height;
    if (dims.depth !== undefined) this._depth = dims.depth;

    // Update position offset
    if (positionOffset.x !== undefined) this._positionOffset.x = positionOffset.x;
    if (positionOffset.y !== undefined) this._positionOffset.y = positionOffset.y;
    if (positionOffset.z !== undefined) this._positionOffset.z = positionOffset.z;

    this._hasIndependentDimensions = true;
    this.markDirty();
  }

  // Update getWorldTransform to include position offset
  getWorldTransform(): Matrix4 {
    const parentTransform = this.parent?.getWorldTransform() ?? new Matrix4();
    const voidBounds = this._parentVoid.bounds;

    // Base position: centered in void
    const baseX = voidBounds.x + this._clearance + this._width / 2;
    const baseY = voidBounds.y + this._clearance + this._height / 2;
    const baseZ = voidBounds.z + this._clearance + this._depth / 2;

    // Apply position offset
    const finalX = baseX + this._positionOffset.x;
    const finalY = baseY + this._positionOffset.y;
    const finalZ = baseZ + this._positionOffset.z;

    return parentTransform.clone().multiply(
      new Matrix4().makeTranslation(finalX, finalY, finalZ)
    );
  }
}
```

## Summary

1. Store original dimensions when operation starts
2. Apply offset as absolute (not cumulative)
3. Shift position to keep opposite face anchored
4. Add position offset support to SubAssemblyNode
5. Create dedicated engine action for sub-assembly push/pull
