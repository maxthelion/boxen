# Panel Corner Fillet Plan

## Overview

Add the ability to fillet (round) corners on panel outlines. Fillets replace sharp 90-degree corners with smooth arcs, improving aesthetics and reducing stress concentrations in the material.

Reference: `docs/fillet.jpg`

## Eligibility Rules

Not all corners can be filleted. A corner is **eligible for filleting** only if both adjacent edges have "free length" > 0.

### What is "Free Length"?

The free length of an edge at a corner is the portion not covered by an adjacent panel:

```
        ┌──────────────┐
        │   extended   │
   ○────┤   (free)     │  ○ = eligible corner (both edges have free length)
        │              │
────────┴──────────────┴────────
        │    joints    │     ← this portion is NOT free (mated to adjacent panel)
        │              │
```

### Calculating Free Length

For each edge at a corner:

1. **Extended edge, neighbor also extended**: `free = this_extension - neighbor_extension`
2. **Extended edge, neighbor not extended**: `free = this_extension`
3. **Extended edge, no neighbor (open face)**: `free = this_extension`
4. **Non-extended edge, no neighbor (open face)**: `free = full edge length` (up to nearest joint)
5. **Non-extended edge with neighbor**: `free = 0` (fully mated)

### Eligible vs Ineligible

- **Eligible**: Both edges at corner have `free_length > 0`
- **Ineligible**: Either edge has `free_length <= 0`

### Ineligible Cases

Corners are **NOT eligible** if:
- Either adjacent edge is fully covered by joints/mating panel
- The adjacent panel's extension equals or exceeds this panel's extension at that corner
- The corner is internal (inside a slot or cutout)

## Radius Constraints

The fillet radius is constrained to prevent invalid geometry. The key insight is that the **free length** of each edge at the corner determines the max radius - this is the portion not covered by an adjacent panel.

### Free Length Calculation

For each edge meeting at a corner, calculate how much is "free" (not jointed to another panel):

```
Panel A (top edge extended 20mm):
                    ┌──────────────────────┐
                    │      extension       │
    Adjacent        │←── free: 15mm ──→    │
    Panel B     ┌───┤                      │
    (extended   │   │  ○ ← fillet here     │
     5mm)       │   ├──────────────────────┘
                │   │
                └───┘

    free_length_top = Panel_A_extension - Panel_B_extension = 20 - 5 = 15mm
    free_length_left = Panel_A_left_extension (if any)
    max_radius = min(free_length_top, free_length_left)
```

**Rule**: `fillet_radius <= min(free_length_edge1, free_length_edge2)`

Where `free_length` for each edge is:
- **Extended edge with extended neighbor**: `this_extension - neighbor_extension` (if positive)
- **Extended edge with non-extended neighbor**: `this_extension`
- **Extended edge with no neighbor (open face)**: `this_extension`
- **Non-extended edge with no neighbor**: full edge length up to nearest joint

### Eligibility

A corner is **eligible** if both free lengths are > 0:
- If `free_length_edge1 > 0` AND `free_length_edge2 > 0` → eligible
- Otherwise → ineligible (corner is fully covered by joints or adjacent panels)

### Examples

**Example 1**: Top extended 20mm, left extended 10mm, no adjacent panels
- free_top = 20mm, free_left = 10mm
- max_radius = 10mm ✓

**Example 2**: Top extended 20mm, adjacent panel's edge extended 15mm
- free_top = 20 - 15 = 5mm
- If left edge also free for 8mm → max_radius = min(5, 8) = 5mm ✓

**Example 3**: Top extended 10mm, adjacent panel's edge extended 15mm
- free_top = 10 - 15 = -5mm → 0 (adjacent panel covers this corner)
- Corner is **ineligible** ✗

### Minimum Radius

- **Minimum fillet radius**: 1mm
- If `max_radius < 1mm`, the corner is treated as ineligible
- UI slider enforces min=1, max=calculated max_radius

## Data Model

### Corner Identification

**Problem**: Names like "top-left" assume a canonical orientation, but panels can be rotated arbitrarily in 3D space. This leads to bugs when the "top" edge isn't actually at the top.

**Solution**: Identify corners by the two edges that meet there. Edges already have stable identifiers based on panel-local coordinates:
- `top` / `bottom` = edges perpendicular to panel's local Y axis
- `left` / `right` = edges perpendicular to panel's local X axis

A corner is the intersection of two perpendicular edges:

```typescript
// Corner identified by its two adjacent edges (order doesn't matter)
type CornerKey = 'top:left' | 'top:right' | 'bottom:left' | 'bottom:right';

// Helper to create corner key from two edges
function cornerKey(edge1: EdgePosition, edge2: EdgePosition): CornerKey {
  // Normalize order: vertical edge first, then horizontal
  const sorted = [edge1, edge2].sort(); // alphabetical: bottom < left < right < top
  return `${sorted[0]}:${sorted[1]}` as CornerKey;
}
```

This approach:
- Uses the same edge naming already established in the codebase
- Corner identity is based on panel-local geometry, not world orientation
- Consistent with how edge extensions work

### Panel-Level Storage

Fillet data stored on panel nodes alongside edge extensions:

```typescript
interface CornerFillet {
  corner: CornerKey;  // e.g., 'top:left' = corner where top and left edges meet
  radius: number;     // in mm, 0 = no fillet (sharp corner)
}

// In BasePanel or FacePanelNode:
cornerFillets: Map<CornerKey, number>;  // corner -> radius
```

### Engine Actions

```typescript
// Set fillet on a single corner
{
  type: 'SET_CORNER_FILLET',
  targetId: 'main-assembly',
  payload: {
    panelId: string;
    corner: CornerKey;  // 'top:left', 'top:right', 'bottom:left', 'bottom:right'
    radius: number;
  }
}

// Set fillets on multiple corners (batch operation)
{
  type: 'SET_CORNER_FILLETS_BATCH',
  targetId: 'main-assembly',
  payload: {
    fillets: Array<{
      panelId: string;
      corner: CornerKey;
      radius: number;
    }>;
  }
}
```

## Geometry Generation

### Arc Representation

Fillets are represented as polyline approximations of circular arcs:

```typescript
function generateFilletArc(
  corner: Point2D,
  radius: number,
  startAngle: number,
  endAngle: number,
  segments: number = 8  // configurable resolution
): Point2D[] {
  const points: Point2D[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = startAngle + (endAngle - startAngle) * (i / segments);
    points.push({
      x: corner.x + radius * Math.cos(angle),
      y: corner.y + radius * Math.sin(angle),
    });
  }
  return points;
}
```

### Integration with Path Generation

In `BasePanel.buildOutlinePath()` or as a post-processing step:

1. Build the base outline (with extensions if any)
2. For each eligible corner with a fillet radius > 0:
   - Calculate the arc center (offset from corner by radius in both directions)
   - Replace the corner point with arc points
   - Ensure proper winding direction is maintained

### Corner Location in Outline

Find corner point index in the outline path:

```typescript
function getCornerIndex(outline: Point2D[], corner: CornerKey): number {
  // Parse corner key to get the two edges
  const [edge1, edge2] = corner.split(':') as [EdgePosition, EdgePosition];

  // Find the point where these two edges meet
  // This is deterministic based on panel-local geometry
  // Returns the index of the corner point to be replaced with arc
}
```

## Eligibility Computation

### Per-Corner Eligibility

Computed similarly to edge status:

```typescript
interface CornerEligibility {
  corner: CornerKey;
  eligible: boolean;
  reason?: 'has-joints' | 'has-adjacent-panel' | 'internal-corner';
  maxRadius: number;  // 0 if not eligible
}

const ALL_CORNERS: CornerKey[] = ['bottom:left', 'bottom:right', 'left:top', 'right:top'];

function computeCornerEligibility(panel: BasePanel): CornerEligibility[] {
  return ALL_CORNERS.map(corner => {
    const [edge1, edge2] = corner.split(':') as [EdgePosition, EdgePosition];
    const edge1Status = panel.getEdgeStatus(edge1);
    const edge2Status = panel.getEdgeStatus(edge2);

    // Check if either edge has joints (locked status indicates mating edge)
    if (edge1Status === 'locked' || edge2Status === 'locked') {
      return { corner, eligible: false, reason: 'has-joints', maxRadius: 0 };
    }

    // Calculate max radius from adjacent edge lengths
    const edge1Length = getFilletableEdgeLength(panel, edge1, corner);
    const edge2Length = getFilletableEdgeLength(panel, edge2, corner);
    const maxRadius = Math.min(edge1Length, edge2Length);

    return { corner, eligible: maxRadius > 0, maxRadius };
  });
}
```

## UI/UX

### Tool Integration

**Dedicated Fillet Tool** - follows the same UX pattern as inset/outset (3D view only for initial implementation):

- New toolbar tool for filleting (icon: rounded corner symbol)
- When active, panels and corners become selectable
- Click a **panel** to add it to the palette (shows all its eligible corners)
- Click a **corner** directly to select just that corner
- Shift+click for additive selection (panels or corners)
- Visual indicators show eligible vs ineligible corners on all visible panels

### Selection Behavior

Similar to inset/outset tool:

1. **Panel selection**: Clicking a panel adds it to the palette, showing all its corners as toggles
2. **Corner selection**: Clicking a corner directly selects just that corner (and adds its parent panel to palette)
3. **Multi-select**: Shift+click adds to selection without clearing
4. **During operation**: Regular clicks adjust camera, shift+click modifies selection

### Multi-Panel, Multi-Corner Operations

The fillet tool supports selecting corners across multiple panels:

- Select corners from any number of panels
- All selected corners share the same radius value (slider controls all)
- The max radius is constrained to the minimum `maxRadius` across ALL selected corners
- Apply commits all fillets as a **single transaction** (one undo step)

Example workflow:
1. Click Front panel → adds 4 corners to palette
2. Shift+click Back panel → adds 4 more corners
3. Toggle off corners you don't want filleted
4. Adjust radius (constrained by smallest eligible corner)
5. Apply → all selected corners filleted at once

### Palette Design

```
┌─────────────────────────────────┐
│ Corner Fillet: 3 corners     [X]│
├─────────────────────────────────┤
│ Front Panel                     │
│   ┌───────┐                     │
│   │ ○   ● │  ○ = eligible       │
│   │       │  ● = selected       │
│   │ ○   ○ │  · = ineligible     │
│   └───────┘                     │
│                                 │
│ Left Panel                      │
│   ┌───────┐                     │
│   │ ·   ● │                     │
│   │       │                     │
│   │ ·   · │                     │
│   └───────┘                     │
├─────────────────────────────────┤
│ Radius: [___10___] mm           │
│ (max for selection: 15mm)       │
│                                 │
│ [Cancel]  [Apply]               │
└─────────────────────────────────┘
```

Each panel shows a mini diagram with clickable corner indicators:
- **○** Eligible, not selected (clickable)
- **●** Selected (clickable to deselect)
- **·** Ineligible (grayed, not clickable)

The radius slider's max is constrained to the minimum `maxRadius` across all selected corners.

### Visual Feedback

**3D Corner Indicators**:

Render circles on the panel face, similar to 2D view corner markers:

- **Position**: Centered on the corner point, on the panel surface
- **Rendering**: Flat circles (discs) lying on the panel face
- **Camera-facing only**: Only render on the face pointing toward the camera (use dot product of panel normal vs camera direction). Back-facing indicators are hidden to prevent accidental selection.
- **Size**: Fixed screen-space size or small world-space size (e.g., 3-5mm radius)

Color indicates status:
- **Green**: Eligible, not selected
- **Purple**: Selected
- **Gray (dim)**: Ineligible (reduced opacity)

Interaction:
- Hover highlights the circle (brighter color)
- Click selects/deselects
- Cursor changes to pointer on hover (eligible corners only)

```
Panel face (front-facing):
  ○─────────────────────○  ← circles centered on corner points
  │                     │
  │                     │
  │                     │
  ○─────────────────────○

Panel face (back-facing):
  ┌─────────────────────┐
  │                     │  ← no indicators shown
  │                     │
  │                     │
  └─────────────────────┘
```

**Preview**:
- Real-time preview of filleted corners as radius slider changes
- Uses engine preview system (same as inset/outset)

**Panel Highlighting**:
- When corners are selected, parent panel is visually highlighted (same as inset tool)

## Validation Rules

Add to `ComprehensiveValidator.ts`:

```typescript
// fillet:eligibility - Fillets only applied to eligible corners (both edges have free length > 0)
// fillet:max-radius - Radius doesn't exceed min(free_length_edge1, free_length_edge2)
// fillet:min-radius - Radius must be >= 1mm (if applied)
// fillet:arc-segments - Arc must have correct number of segments (8)
// fillet:arc-continuity - Arc endpoints must connect to adjacent edge segments
// fillet:no-self-intersection - Filleted outline must not self-intersect
```

### Validation Test Cases

1. **Basic fillet on extended corner**: Panel with 15mm extension on two edges, 10mm fillet
2. **Fillet at max radius**: Fillet radius equals min(free_length) exactly
3. **Fillet with asymmetric extensions**: Top=20mm, left=10mm, verify max_radius=10mm
4. **Fillet with adjacent panel extension**: This panel 20mm, neighbor 15mm, verify free_length=5mm
5. **Ineligible corner rejected**: Attempt fillet where free_length=0
6. **Multiple fillets on same panel**: All four corners filleted
7. **Fillets across multiple panels**: Batch operation on several panels
8. **Path validity after fillet**: No diagonals, proper winding, no self-intersection

## SVG Export

Fillets should export as:
- **Polyline approximation** (current approach) - compatible with all laser cutters
- **Arc commands** (optional) - `A` command in SVG path for true arcs

Most laser cutter software converts arcs to polylines anyway, so polyline is the safer default.

## Store State

Corner selection follows the same pattern as edge selection:

```typescript
// In useBoxStore
interface BoxStore {
  // ... existing state

  // Corner selection (for fillet tool)
  selectedCorners: Set<string>;  // Format: "panelId:edge1:edge2" e.g. "uuid123:bottom:left"
  hoveredCorner: string | null;

  // Actions
  selectCorner: (panelId: string, corner: CornerKey, additive?: boolean) => void;
  setHoveredCorner: (panelId: string | null, corner: CornerKey | null) => void;
  clearCornerSelection: () => void;
}
```

When a panel is clicked with fillet tool active:
- Get the panel's eligible corners
- Add all eligible corners to `selectedCorners`

## Implementation Phases

### Phase 1: Data Model & Engine
1. Add `CornerKey` type and utilities
2. Add fillet storage to panel nodes (`cornerFillets: Map<CornerKey, number>`)
3. Add `SET_CORNER_FILLET` and `SET_CORNER_FILLETS_BATCH` engine actions
4. Implement `computeCornerEligibility()` on panels

### Phase 2: Geometry Generation
1. Add arc generation utility (`generateFilletArc`)
2. Integrate fillet into `buildOutlinePath()` as post-processing
3. Handle winding direction correctly (arc direction matches outline winding)

### Phase 3: Store & Selection
1. Add corner selection state to store (`selectedCorners`, `hoveredCorner`)
2. Add `selectCorner`, `setHoveredCorner` actions
3. Add panel-click handler that selects all eligible corners

### Phase 4: UI Components
1. Create `PanelCornerRenderer` component (like `PanelEdgeRenderer`)
2. Create `FilletPalette` component with panel groups and corner toggles
3. Add 'fillet' tool to `EditorToolbar`
4. Integrate into `Viewport3D`

### Phase 5: Operation & Preview
1. Register 'fillet' operation in registry
2. Implement preview with `createPreviewAction`
3. Handle apply/cancel flow

### Phase 6: Validation & Testing
1. Add fillet validation rules to `ComprehensiveValidator`
2. Integration tests for fillet geometry
3. Test edge cases (max radius, adjacent fillets, etc.)

## Edge Cases

1. **Adjacent filleted corners**: Two corners on the same edge both filleted
   - Each fillet limited by half the edge length to prevent overlap

2. **Zero-length edges**: If an edge has 0 length (corner merging scenario)
   - That corner is ineligible for filleting

3. **Extension + Fillet interaction**: When extension changes, fillet may need adjustment
   - If extension decreases below fillet radius, clamp radius to new max

4. **Merged corners**: When two edges are both extended, corner merges
   - Single fillet applies to the merged corner
   - Max radius = min(both extensions)

## Future Extensions

- **2D view support**: Add fillet tool to 2D sketch view
- **Chamfer option**: Straight cut instead of arc (45-degree or custom angle)
- **Variable radius**: Different radius for each direction (elliptical fillet)
- **Interior fillets**: For cutouts and slots (different eligibility rules)
