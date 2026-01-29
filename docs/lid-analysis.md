# Lid Concept Analysis

## What is a "Lid"?

The lid concept encompasses several related features:

### 1. Assembly Axis
Determines which pair of faces are "lids" vs "walls":
- **Y-axis (default)**: top/bottom are lids, others are walls
- **X-axis**: left/right are lids, others are walls
- **Z-axis**: front/back are lids, others are walls

### 2. Tab Direction (`tabDirection`)
Controls finger joint direction on lid faces:
- **`tabs-out`**: Lid panels have protruding tabs, walls have slots
- **`tabs-in`**: Walls have protruding tabs, lids have slots

### 3. Lid Inset (`inset`)
Moves a lid face inward from the outer dimension, creating a recessed lid.

When inset > 0:
1. Creates "cap voids" (dead space between inset lid and outer boundary)
2. The main interior void becomes a child of root
3. Adjacent wall panels extend to meet the inset lid

---

## How Lid Inset Works

```typescript
// When lids.positive.inset = 10mm on Y-axis:

// BEFORE (inset = 0):
rootVoid: {
  bounds: { x: 0, y: 0, z: 0, w: 100, h: 80, d: 60 }
  children: [userSubdivisions...]
}

// AFTER (inset = 10mm):
rootVoid: {
  bounds: { x: 0, y: 0, z: 0, w: 100, h: 80, d: 60 }
  children: [
    { id: 'main-interior', bounds: { y: 0, h: 70 }, children: [userSubdivisions...] },
    { id: 'lid-inset-positive', bounds: { y: 70, h: 10 }, lidInsetSide: 'positive' }
  ]
}
```

The cap void (`lid-inset-positive`) is "dead space" - it cannot be subdivided and doesn't render any panels.

---

## Comparison: Lid Inset vs Push-Pull (Adjust Mode)

| Feature | Lid Inset | Push-Pull (Adjust Mode) |
|---------|-----------|------------------------|
| Creates void structure | Yes (cap voids) | No |
| Affects wall panels | Walls extend to meet inset lid | Adjacent panels get edge extensions |
| Subdivisions affected | Main interior shrinks | None (edge extensions only) |
| Applicable to | Only lid faces | Any face |
| Stored as | `assembly.lids.{side}.inset` | `faceOffsets.{face}` |
| Visual result | Recessed lid | Same visual result |

---

## Redundancy Analysis

### What Lid Inset Does That Push-Pull Doesn't
1. **Creates cap void structure** - But this serves no functional purpose; the cap void is just dead space
2. **Forces re-creation of void tree** - This resets user subdivisions when applied

### What Push-Pull Does That Lid Inset Doesn't
1. **Works on any face** - Not just lid faces
2. **Preserves void structure** - No tree restructuring needed
3. **Uses edge extensions** - A cleaner mechanism that doesn't affect the void tree

### Conclusion: Lid Inset is Largely Redundant

The lid inset feature creates unnecessary complexity:
1. Cap voids serve no useful purpose
2. The void tree restructuring is disruptive
3. Push-Pull (Adjust mode) achieves the same visual result more cleanly

**However**, these related concepts are **NOT redundant**:
- **Assembly Axis** - Essential for determining finger joint gender rules
- **Tab Direction** - Controls which panels have tabs vs slots at lid-wall intersections

---

## Recommendations

### Keep
1. **Assembly Axis** (`assemblyAxis`) - Controls finger joint gender rules
2. **Tab Direction** (`tabDirection`) - Controls joint direction on lid faces

### Deprecate
1. **Lid Inset** (`lids.{side}.inset`) - Replace with push-pull adjust mode

### Migration Path
1. For existing projects with lid insets, convert to equivalent push-pull offsets
2. Remove `createRootVoidWithInsets()` and cap void logic
3. Simplify `LidConfig` to only contain `tabDirection`

```typescript
// BEFORE
interface LidConfig {
  enabled: boolean;
  tabDirection: LidTabDirection;
  inset: number;  // REMOVE
}

// AFTER
interface LidConfig {
  tabDirection: LidTabDirection;
}
```

### Store Actions to Remove
- `setLidInset()` - Replace with push-pull operation
- `setSubAssemblyLidInset()` - Replace with push-pull on sub-assembly

### Store Actions to Keep
- `setLidTabDirection()` - Still needed for joint direction
- `setSubAssemblyLidTabDirection()` - Still needed for sub-assemblies

---

## Impact on Phase 3 Migration

The remaining unmigrated actions are:
- `setSubAssemblyLidTabDirection` - Should migrate to engine
- `setSubAssemblyLidInset` - Should be deprecated, not migrated

This analysis suggests we only need to add one more engine action:
- `SET_SUB_ASSEMBLY_LID_TAB_DIRECTION`

And can skip implementing:
- `SET_SUB_ASSEMBLY_LID_INSET` (deprecated)
