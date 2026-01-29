# Cross-Lap Joints for Intersecting Dividers

## Problem

When a box has dividers on two axes (e.g., X and Z dividers in a Grid Organizer), those dividers physically intersect inside the box. Currently, the system doesn't generate any joint geometry for these intersections - the panels would collide and can't be assembled.

```
Top-down view of Grid Organizer:

    Z-dividers (front-to-back)
         │   │
    ─────┼───┼─────  ← X-dividers (left-to-right)
         │   │
    ─────┼───┼─────
         │   │

Each ┼ is an intersection that needs a joint
```

## Solution: Cross-Lap Joints

Cross-lap (or half-lap) joints are the standard solution for intersecting flat panels. Each panel gets a slot cut **halfway through its height**, and the slots interlock:

```
Side view of intersection:

Panel A (Z-divider):        Panel B (X-divider):

   ████████                    ████████
   ████████                    ████████
   ███  ███  ← slot from top   ████████
   ███  ███                    ███  ███  ← slot from bottom
   ████████                    ███  ███
   ████████                    ████████

Assembled (interlocked):

   ████████
   ████  ██
   ███  ███
   ██  ████
   ████████
```

### Key Properties

1. **Complementary slots**: One panel has slot from top, other has slot from bottom
2. **Slot depth**: Half the panel height (minus kerf tolerance)
3. **Slot width**: Material thickness (plus kerf tolerance)
4. **Deterministic direction**: Need consistent rule for which panel gets top vs bottom slot

## Implementation Approach

### 1. Detect Intersecting Dividers

Two divider panels intersect if:
- They have **different normal axes** (e.g., X-divider and Z-divider)
- Their **bounding volumes overlap** in 3D space

```typescript
interface DividerIntersection {
  panelA: DividerPanelNode;  // e.g., X-axis divider
  panelB: DividerPanelNode;  // e.g., Z-axis divider

  // Intersection point in world coordinates
  intersectionPoint: { x: number; y: number; z: number };

  // Which panel gets slot from which direction
  panelASlotDirection: 'top' | 'bottom';  // In panel's local 2D space
  panelBSlotDirection: 'top' | 'bottom';
}
```

### 2. Slot Direction Rules

Need a deterministic rule for which panel gets top/bottom slot. Options:

**Option A: Axis Priority**
```
X-axis dividers: slot from top (positive Y in local space)
Y-axis dividers: slot from top
Z-axis dividers: slot from bottom (negative Y in local space)
```

**Option B: Position-Based**
```
Panel closer to origin on its axis: slot from top
Panel farther from origin: slot from bottom
```

**Option C: ID-Based (simplest)**
```
Compare panel IDs alphabetically
Lower ID: slot from top
Higher ID: slot from bottom
```

**Recommendation**: Option A (Axis Priority) - most intuitive for users and consistent across similar templates.

### 3. Generate Slot Geometry

For each intersection, add a rectangular slot to each panel's outline:

```typescript
interface CrossLapSlot {
  // Position along the panel's width (local X coordinate)
  position: number;

  // Slot dimensions
  width: number;      // = material thickness + kerf
  depth: number;      // = panel height / 2

  // Which edge the slot cuts from
  fromEdge: 'top' | 'bottom';
}
```

The slot is a rectangular notch cut into the panel edge:

```
Panel before slot:          Panel with slot from top:

┌──────────────────┐       ┌────────┬─┬────────┐
│                  │       │        │ │        │
│                  │  →    │        │ │        │
│                  │       │        │ │        │
│                  │       │        └─┘        │
└──────────────────┘       └───────────────────┘
                              ↑
                           slot position
```

### 4. Integration Points

#### A. DividerPanelNode Changes

```typescript
class DividerPanelNode extends BasePanel {
  // Existing
  protected computeOutline(): PanelOutline { ... }

  // New: Cross-lap slots to cut
  private _crossLapSlots: CrossLapSlot[] = [];

  addCrossLapSlot(slot: CrossLapSlot): void {
    this._crossLapSlots.push(slot);
    this.markDirty();
  }

  // Modified: Include cross-lap slots in outline
  protected computeOutline(): PanelOutline {
    const baseOutline = this.computeBaseRectangle();

    // Apply finger joints on edges (existing)
    const withFingers = this.applyFingerJoints(baseOutline);

    // Apply cross-lap slots (new)
    const withSlots = this.applyCrossLapSlots(withFingers);

    return withSlots;
  }
}
```

#### B. AssemblyNode Changes

```typescript
class AssemblyNode extends BaseAssembly {
  // Called after subdivisions change
  private recomputeCrossLapJoints(): void {
    // 1. Find all divider panels
    const dividers = this.getAllDividerPanels();

    // 2. Clear existing cross-lap slots
    for (const divider of dividers) {
      divider.clearCrossLapSlots();
    }

    // 3. Find all intersecting pairs
    const intersections = this.findDividerIntersections(dividers);

    // 4. Generate slots for each intersection
    for (const intersection of intersections) {
      this.generateCrossLapSlots(intersection);
    }
  }
}
```

#### C. Intersection Detection Algorithm

```typescript
function findDividerIntersections(dividers: DividerPanelNode[]): DividerIntersection[] {
  const intersections: DividerIntersection[] = [];

  // Group by axis
  const byAxis = groupBy(dividers, d => d.axis);

  // Only check pairs with different axes
  const axes = Object.keys(byAxis) as Axis[];

  for (let i = 0; i < axes.length; i++) {
    for (let j = i + 1; j < axes.length; j++) {
      const axisA = axes[i];
      const axisB = axes[j];

      // Check all pairs between these two axis groups
      for (const dividerA of byAxis[axisA]) {
        for (const dividerB of byAxis[axisB]) {
          const intersection = computeIntersection(dividerA, dividerB);
          if (intersection) {
            intersections.push(intersection);
          }
        }
      }
    }
  }

  return intersections;
}

function computeIntersection(
  dividerA: DividerPanelNode,
  dividerB: DividerPanelNode
): DividerIntersection | null {
  // Get world-space bounds of each divider
  const boundsA = dividerA.getWorldBounds();
  const boundsB = dividerB.getWorldBounds();

  // Check for overlap
  if (!boundsOverlap(boundsA, boundsB)) {
    return null;
  }

  // Compute intersection point (center of overlap region)
  const intersectionPoint = computeOverlapCenter(boundsA, boundsB);

  // Determine slot directions based on axis priority
  const [slotDirA, slotDirB] = determineSlotDirections(
    dividerA.axis,
    dividerB.axis
  );

  return {
    panelA: dividerA,
    panelB: dividerB,
    intersectionPoint,
    panelASlotDirection: slotDirA,
    panelBSlotDirection: slotDirB,
  };
}
```

### 5. SVG Export

Cross-lap slots are just part of the panel outline, so they'll automatically be included in SVG export. The slot appears as a rectangular notch in the panel's perimeter.

## Visual Examples

### Grid Organizer (X + Z dividers)

```
X-divider panel (slot from top):
┌──────────┬─┬──────────┬─┬──────────┐
│          │ │          │ │          │
│          │ │          │ │          │
│          └─┘          └─┘          │
│                                    │
└────────────────────────────────────┘
           ↑            ↑
    slots for Z-dividers at each intersection

Z-divider panel (slot from bottom):
┌────────────────────────────────────┐
│                                    │
│          ┌─┐          ┌─┐          │
│          │ │          │ │          │
│          │ │          │ │          │
└──────────┴─┴──────────┴─┴──────────┘
           ↑            ↑
    slots for X-dividers at each intersection
```

### Pigeonhole (X + Y dividers)

Same principle, but Y-dividers are horizontal shelves and X-dividers are vertical partitions.

## Edge Cases

### 1. Three-Axis Intersections

If a box has dividers on all three axes (X, Y, Z) meeting at one point, that's a three-way intersection. This is rare and complex - the panels would need notches that interlock in 3D.

**Recommendation**: Detect and warn, but don't support initially. Templates should be designed to avoid this.

### 2. Dividers at Different Depths

If dividers don't span the full interior (future feature), they might only partially overlap. The slot should only be as wide as the actual overlap.

### 3. Multiple Intersections Per Panel

A single divider panel may intersect multiple panels on other axes. Each intersection adds a separate slot to the panel.

## Implementation Phases

### Phase 1: Detection & Data Model
- Add `CrossLapSlot` type
- Add intersection detection to AssemblyNode
- Store slots on DividerPanelNode

### Phase 2: Geometry Generation
- Modify `DividerPanelNode.computeOutline()` to include slots
- Ensure slots have correct kerf tolerance

### Phase 3: Validation & Warnings
- Detect three-way intersections and warn
- Validate slot dimensions don't exceed panel size

### Phase 4: UI Feedback (Optional)
- Highlight cross-lap joints in 3D view
- Show joint count in panel properties

## Open Questions

1. **Kerf tolerance**: Should cross-lap slots use the same kerf as finger joints, or a separate setting?

2. **Slot fit**: Should slots be exactly half the panel height, or slightly more/less for easier assembly?

3. **Visual distinction**: Should cross-lap slots be rendered differently from finger joint slots in the 3D preview?

4. **Template compatibility**: Should templates explicitly declare they need cross-lap joints, or should the system auto-detect?
