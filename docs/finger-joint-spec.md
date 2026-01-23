# Finger Joint System Specification v2

## Overview

This document specifies a new model for finger joint generation where finger points are calculated at the **assembly level** per axis, rather than per-edge. All edges parallel to an axis share the same finger points, guaranteeing alignment by construction.

---

## Core Concepts

### Assembly Bounding Box

When an assembly is created, it has:
- **Dimensions**: width (X), height (Y), depth (Z)
- **3 axes**: Each perpendicular to a pair of faces
- **12 outer edges**: Where outer panels meet (4 per axis direction)
- **Up to 24 edge joints**: Each edge has 2 sides that mate

### Finger Points

Finger points are **positions along an axis** that mark transitions between:
- **Finger** (tab) sections - protrude OUT by material thickness
- **Hole** (slot) sections - indent IN by material thickness

Finger points are calculated **once per axis** when the assembly bounding box is defined or changed. All edges parallel to that axis use the same finger points.

### Joint Gender

- **Male (tabs/fingers)**: Protrudes from panel edge. Can only exist at panel edges/corners.
- **Female (holes/slots)**: Indented into panel. Can exist at edges OR mid-plane (to receive divider tabs).

---

## Finger Point Generation Algorithm

### Inputs

| Parameter | Description |
|-----------|-------------|
| `axis_length` | The dimension along this axis (width, height, or depth) |
| `material_thickness` (MT) | Thickness of the material |
| `min_distance` | Minimum gap from bounding box corner to first finger |
| `finger_length` | Target length of each finger/hole section |

### Algorithm

```
1. max_joint_length = axis_length - (2 × MT)
   // Accounts for perpendicular panels at each end

2. usable_length = max_joint_length - (2 × min_distance)
   // Reserve minimum gap at both ends

3. num_sections = floor(usable_length / finger_length)
   // How many finger+hole sections fit

4. IF num_sections is even:
      num_sections = num_sections - 1
   // Ensure odd count for symmetry (OUT-IN-OUT pattern)

5. remainder = usable_length - (num_sections × finger_length)

6. actual_offset = min_distance + (remainder / 2)
   // Distribute remainder equally to both ends
   // This is the "finger_point_inner_offset"

7. Generate transition points:
   points = []
   FOR i = 0 TO num_sections - 1:
      points.push(actual_offset + (i × finger_length))
   points.push(actual_offset + (num_sections × finger_length))
```

### Output

Array of positions along the axis, measured from the negative end of the bounding box (after MT inset). These mark transitions between finger and hole states.

The pattern always starts and ends with a **finger** (OUT) section for symmetry:
```
[gap] OUT [point] IN [point] OUT [point] IN [point] OUT [gap]
```

---

## Gender Assignment Rules

### Central Axis

Each assembly has a **central axis** (X, Y, or Z). This determines:
- **Lid faces**: The two faces perpendicular to the central axis
- **Side faces**: The four faces parallel to the central axis

### Lid Gender

Lids have **configurable gender** (user choice):
- `tabs-out`: Lids are male (tabs protrude into side panels)
- `tabs-in`: Lids are female (slots receive tabs from side panels)

Both lids use the **same gender** for consistency.

### Side Panel Gender

Side panels must have **opposite gender** to lids on edges where they meet:
- If lids are male → side panel edges meeting lids are female
- If lids are female → side panel edges meeting lids are male

### Wall-to-Wall Gender

Where two side panels meet (neither is a lid), gender is determined by **priority system**:
- Configurable priority order (e.g., front/back have priority over left/right)
- Higher priority panel is male, lower priority is female

### Divider Gender

Dividers are **always male** (tabs out) on edges meeting other panels.

---

## Special Cases

### Inset Panels (Lid Inset)

When a panel is inset (e.g., lid sits inside the box):
- The joint length on one side is shorter
- **Only use finger points valid for both panels**
- Points outside the shorter panel's range are skipped

### Open Faces

When an edge meets an open face (no mating panel):
- Still use `min_distance` from bounding box corner
- Edge is straight (no fingers) since nothing to mate with

### Extensions Beyond Bounding Box

When a joint extends beyond the bounding box (e.g., two walls extended above an open lid):
- Finger pattern **continues uniformly** beyond the boundary
- No extra gap at the boundary crossing
- New finger points generated at `finger_length` intervals from `actual_offset`

### Intersecting Dividers (Cross Joints)

When two dividers intersect within a void:
- **Separate calculation** from finger points
- Vertical cuts of `material_thickness` width
- Cuts extend up/down respectively so panels slot together in cross shape

---

## Sub-Assemblies vs Dividers

### Sub-Assemblies

- **Generate their own finger points** based on their bounding box
- Independent of parent assembly's finger points
- Have their own central axis and gender configuration

### Dividers

- **Use nearest assembly ancestor's finger points**
- Always male (tabs) on edges meeting panels
- Slot positions in receiving panels align with assembly's finger points

---

## Data Model

### Assembly

```typescript
interface Assembly {
  id: string;
  bounds: { x, y, z, w, h, d };
  centralAxis: 'x' | 'y' | 'z';
  lidGender: 'male' | 'female';  // tabs-out = male

  // Calculated finger points per axis
  fingerPoints: {
    x: number[];  // Positions along X axis
    y: number[];  // Positions along Y axis
    z: number[];  // Positions along Z axis
  };

  // Configuration
  fingerConfig: {
    minDistance: number;
    fingerLength: number;
    materialThickness: number;
  };
}
```

### Panel Edge

```typescript
interface PanelEdge {
  axis: 'x' | 'y' | 'z';        // Which axis this edge is parallel to
  gender: 'male' | 'female';    // Determined by rules above
  startPos: number;             // Start position along axis
  endPos: number;               // End position along axis
  assemblyRef: string;          // Which assembly's finger points to use
}
```

### Rendering a Joint

To render fingers/holes on an edge:
1. Get finger points from the referenced assembly for this edge's axis
2. Filter to points within `[startPos, endPos]` range
3. If male: render finger (OUT) sections between points
4. If female: render hole (IN) sections between points

---

## Migration Notes

### What Changes

| Current | New |
|---------|-----|
| `generateFingerJointPath()` per edge | Assembly-level `calculateFingerPoints()` |
| `fingerCorners` calculation | Use assembly finger points directly |
| Canonical direction swap for alignment | Not needed - same points by construction |
| `cornerGap` / `cornerGapMultiplier` | `minDistance` and `actual_offset` |
| `invertPerpendicular` flag | Gender (male/female) determines direction |

### What Stays Similar

- Panel outline generation (corners, edges)
- 3D positioning and rotation of panels
- SVG export from panel paths
- Void/subdivision system
- Sub-assembly creation

---

## Examples

### Example 1: Simple Box

Box: 100mm × 80mm × 60mm, MT=3mm, minDistance=10mm, fingerLength=10mm

**X-axis (width=100mm):**
```
max_joint_length = 100 - 6 = 94mm
usable_length = 94 - 20 = 74mm
num_sections = floor(74 / 10) = 7 (odd, keep)
remainder = 74 - 70 = 4mm
actual_offset = 10 + 2 = 12mm

finger_points = [12, 22, 32, 42, 52, 62, 72, 82]
Pattern: [12mm gap] OUT IN OUT IN OUT IN OUT [12mm gap]
```

### Example 2: Inset Lid

Same box, but top lid inset by 5mm:
- Top panel's bottom edge: full 94mm joint
- Front panel's top edge: 94 - 5 = 89mm joint (starts 5mm in)

Finger points [12, 22, 32, 42, 52, 62, 72, 82]:
- Front panel uses all points
- Top panel skips point at 82 (outside its shorter range)
- Joint only has fingers up to point 72
