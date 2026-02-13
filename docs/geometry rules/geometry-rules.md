# Geometry Rules

These rules define the geometric constraints for laser-cut box assemblies. They are the authoritative reference for how panels, joints, voids, and dividers relate to each other in 3D space.

## 1. Physical Constraints

### 1.1 No Overlapping Material

Two panels must never occupy the same physical space. Every piece of material has a thickness (`MT`) and occupies a volume. Where panels meet, one yields to the other:

- **Face-to-face corners**: One panel's body occupies the corner; the other panel's body is inset by `MT`. Which panel "owns" the corner is determined by wall priority (see §3.3).
- **Divider-to-face junctions**: The divider's body ends at the face panel's inner surface. The divider's *tabs* pass through *slots* in the face, reaching the assembly boundary.
- **Divider-to-divider junctions**: Either a cross-lap joint (both cut halfway through) or one terminates at the other with a normal finger joint (see §5).

### 1.2 Material Thickness (MT)

All geometry rules reference `MT`, the thickness of the sheet material. It is uniform for an entire assembly. Typical values: 3mm (acrylic), 6mm (plywood).

### 1.3 All Paths Are Axis-Aligned

All panel outlines and hole paths must consist of horizontal and vertical segments only. No diagonal segments. This is a hard constraint for laser cutting.

---

## 2. Assembly Bounding Box

### 2.1 Definition

An assembly has three dimensions (`width`, `height`, `depth`) that define a rectangular bounding box. The bounding box has:

- **6 planes** — one for each face (front, back, left, right, top, bottom)
- **3 axes** — each with shared finger joint points used by all panels on that axis
- **12 edges** — where two face planes meet

### 2.2 Face Panels and the Bounding Box

Each face panel's body dimensions match the bounding box on the face's plane:

| Face | Panel Width | Panel Height |
|------|-------------|--------------|
| front, back | assembly width | assembly height |
| left, right | assembly depth | assembly height |
| top, bottom | assembly width | assembly depth |

These are the *body* dimensions — the rectangular region where the panel lives at the bounding box plane. Finger joints add detail to the edges but don't change the overall dimensions.

### 2.3 Extensions Beyond the Bounding Box

Face panels can extend beyond the bounding box via:

- **Edge extensions (feet)**: Material added beyond one edge of the panel. The extension is purely additive — the mating edge stays at the bounding box plane.
- **Push-pull**: Moves the bounding box plane itself, changing assembly dimensions. Finger joints move with it.

**Key rule**: Finger joints are always anchored to the bounding box, not to extensions. Extensions add material; they do not move the joint.

---

## 3. Joint System

### 3.1 Edge States

Every edge of every panel has one of three states:

| State | Visual | Meaning |
|-------|--------|---------|
| **Male** (tabs out) | Finger tabs protruding | This panel's tabs pass through slots in the mating panel |
| **Female** (slots) | Slots cut into body | This panel receives tabs from the mating panel |
| **Open** (straight) | Straight edge, no joint | Adjacent face is removed/open, or no mating panel exists |

Mating edges always have **opposite genders**: if one side is male, the other is female. This ensures the joint interlocks.

### 3.2 Gender Rules for Face-to-Face Joints

Gender is determined by a precedence chain (in `genderRules.ts`):

1. **Adjacent face not solid** → `null` (open, straight edge)
2. **This face is a lid** → use lid's configured gender (`tabs-out` = male, `tabs-in` = female)
3. **Adjacent face is a lid** → opposite of lid's gender
4. **Wall-to-wall** → lower wall priority = male, higher = female

### 3.3 Wall Priority

Wall priority determines which panel "owns" the corner (occupies the corner volume) and which is inset:

| Face | Priority | Corner Role |
|------|----------|-------------|
| front | 1 | Male (tabs out) — occupies corners |
| back | 2 | Female (slots) |
| left | 3 | Male (tabs out) |
| right | 4 | Female (slots) |
| top | 5 | Male (tabs out) |
| bottom | 6 | Female (slots) |

Lower priority → male → occupies corner. Higher priority → female → inset by MT at corners.

### 3.4 Gender Rules for Divider-to-Face Joints

Dividers always have **male** gender (tabs out) on edges that meet solid faces. The face panel has corresponding **slots** (female) where the divider's tabs pass through.

- Divider tabs extend through face slots to the assembly boundary
- Face slots are `MT` deep (the full thickness of the face panel)
- Slot positions are determined by shared finger points on the axis

### 3.5 Finger Joint Alignment

All panels on the same axis share identical finger transition points, computed at the assembly level:

- `maxJointLength = axisLength - 2 × MT`
- Pattern: alternating finger (tab) and hole (slot) sections
- Minimum 3 sections required (finger-hole-finger)
- Finger width is auto-constrained based on available space

**Tab positions on dividers must match slot positions on faces.** Both derive from the same assembly-level finger data for the relevant axis. This ensures physical fit.

---

## 4. Voids and Subdivisions

### 4.1 Root Void

Every assembly contains a root void — the interior space:

- Root void = assembly dimensions - 2×MT on each axis
- Void boundaries align with face panel inner surfaces
- The root void is the parent of all subdivisions

### 4.2 Subdivision Creates Child Voids

When a void is subdivided on an axis, it produces:

- A **divider panel** at the split position
- **Child voids** on either side of the divider

Child voids share planes with their parent void on all sides except the split axis, where one boundary is the new divider.

### 4.3 Nested Subdivision

Child voids can be further subdivided. Each level of nesting creates more divider panels and smaller child voids. A child void can share up to 5 planes with its parent (the 6th is replaced by the divider that created it).

### 4.4 Grid Subdivision

Grid subdivision creates multiple dividers on two axes simultaneously from a single parent void. Unlike sequential subdivision:

- All dividers on each axis span the **full parent void** dimensions
- Dividers from different axes **cross through** each other
- The resulting voids are all direct children of the original void (flat, not nested)

---

## 5. Divider-to-Divider Joints

When dividers on different axes exist in the same assembly, they interact at their intersection. The correct joint type depends on whether the dividers **cross** each other or one **terminates** at the other.

### 5.1 Crossing vs Terminating

A divider **crosses** another if it exists on **both sides** of the other divider — its void bounds extend well past the other divider's position in both directions.

A divider **terminates** at another if it only exists on **one side** — its void bounds end at or near the other divider's position.

```
CROSSING (grid subdivision — both span full interior):
┌─────────┬─────────┐
│    │    │    │    │
│────┼────│────┼────│   Both dividers pass through each other
│    │    │    │    │
└─────────┴─────────┘

TERMINATING (sequential subdivision — shorter panel stops at longer one):
┌─────────┬─────────┐
│    │    │         │
│────┤    │  Right  │   Z-divider stops at X-divider
│    │    │  Void   │   (only spans left half)
└─────────┴─────────┘
```

### 5.2 Cross-Lap Joints (Crossing Dividers Only)

When two dividers **cross** each other, they use a cross-lap joint:

- Each divider gets a half-depth notch cut from opposite edges
- The notches interlock so both panels sit flush
- **Axis priority** determines direction: alphabetically lower axis gets notch from top, higher from bottom
  - X vs Z: X from top, Z from bottom
  - X vs Y: X from top, Y from bottom
  - Y vs Z: Y from top, Z from bottom

Cross-lap joints should ONLY be generated when two dividers physically cross through each other. The test: does the other divider's void bounds extend past my position on **both** sides?

### 5.3 Normal Joints (Terminating Dividers)

When a shorter divider **terminates** at a longer divider, the junction is a normal finger joint — identical in principle to a divider meeting a face panel:

- The **shorter divider's terminating edge** gets male gender (tabs out)
- The **longer divider** gets slot holes where the shorter divider's tabs pass through
- The shorter divider's body extends `MT` beyond its void to reach the longer divider's far surface
- Finger tabs and slots use the same shared finger points as face-to-divider joints

This is the natural behavior: the longer divider acts as a "wall" from the shorter divider's perspective, just like a face panel would.

### 5.4 Cross-Lap Conflict Rule

Voids on either side of a divider **cannot** be subdivided on the same axis with spacing that would cause cross-lap slots to collide on the shared parent divider. Minimum separation between cross-lap slots: `2 × MT`.

For grid patterns (multiple compartments on two axes), use grid subdivision from the parent void rather than sequential subdivisions of child voids.

---

## 6. Divider Body Span

### 6.1 Computation

A divider's body extends beyond its void bounds to reach adjacent walls or dividers:

```
bodyStart = atLowWall ? 0 : boundsLow - MT
bodyEnd   = atHighWall ? axisDim : boundsLow + boundsSize + MT
```

- **At a face wall** (`atLowWall`/`atHighWall`): body extends to the assembly boundary (position 0 or axisDim). This ensures the finger region matches the face panel's finger region.
- **At another divider**: body extends `MT` beyond the void boundary to reach the far surface of the adjacent divider.

### 6.2 Body Size with All Solid Faces

When bounded by solid faces on both sides: `body = voidSize + 2 × MT`

### 6.3 Finger Region Alignment

The divider's finger region (where tabs and slots are computed) must equal the face panel's finger region on the same axis. Both use `maxJointLength = axisDim - 2 × MT`. This is why the body extends to position 0 / axisDim at walls — so after corner insets, the finger region aligns.

---

## 7. Edge Extensions

Edge extensions add material beyond one edge of a face panel (e.g., feet on the bottom edge).

### 7.1 Eligibility

Only edges with **open** or **female** gender can be extended. Male edges have tabs that interlock with another panel — extending them would create a physical conflict.

### 7.2 Full Width

Extension sides span the full panel dimension perpendicular to the extended edge. Exception: if an adjacent edge is both extended AND female, the extension width is reduced by `MT` to avoid overlapping material in the corner.

### 7.3 Far Edge Open

The far edge (cap) of an extension has no finger joints — it's a straight line. There is no mating panel at the far edge of an extension.

### 7.4 Corner Ownership

When two adjacent face panels both have extensions on their shared edge, only one can occupy the corner. The female panel yields — its extension is inset by `MT`.

### 7.5 Long Extensions

When an extension exceeds `cornerGap + fingerWidth + MT`, it should develop finger joints along the joint between the extension and any adjacent extended panel. (This is currently a warning, not fully implemented.)

---

## 8. Sub-Assemblies

### 8.1 Bounding Box Containment

A sub-assembly's bounding box must fit entirely within its parent void. The sub-assembly is an independent box with its own faces, joints, and voids, but it is physically constrained to the parent void's volume.

### 8.2 Independent Joint System

Sub-assemblies have their own finger data, wall priorities, and gender rules. Their joints do not interact with the parent assembly's joints.

---

## 9. Path Geometry (for Rendering and Export)

### 9.1 Winding Order

- Panel outlines: counter-clockwise (CCW)
- Holes (slots, cutouts): clockwise (CW)

Opposite winding is required for correct triangulation in THREE.js.

### 9.2 Holes Must Be Inside Outline

All points of a hole must be strictly inside the outline's bounding box. Holes touching the outline boundary cause rendering artifacts.

### 9.3 No Degenerate Paths

- Minimum 3 points per path
- No consecutive duplicate points (tolerance: 0.001mm)
- Very small holes (< 1mm dimension) generate warnings

### 9.4 Axis-Aligned Segments Only

All segments must be horizontal or vertical. No diagonal segments. This is validated by `PathChecker.ts`.

---

## 10. Tolerance Values

| Context | Tolerance | Usage |
|---------|-----------|-------|
| Wall detection | `0.01` mm | Checking if void reaches assembly walls |
| Slot boundary | `0.01` mm | Preventing slots at panel edges |
| Duplicate points | `0.001` mm | Path validation |
| Hole boundary | `0.01` mm | Hole inside-bounds check |
| Extension threshold | `0.001` mm | Minimum to consider an extension active |

---

## 11. Validators

### Geometry Checker (`src/engine/geometryChecker.ts`)

Validates: void bounds, face panel sizes, divider body spans, nested void planes, finger section minimums, slot positions, path winding, holes inside outlines, degenerate paths.

### Comprehensive Validator (`src/engine/validators/ComprehensiveValidator.ts`)

All-in-one validation for integration tests. Checks 3D positions, relative dimensions, joint alignment, finger point usage, parent/child slot intersections, and path validity.

### Path Checker (`src/engine/validators/PathChecker.ts`)

Validates path-specific rules: axis-aligned segments, minimum points, no consecutive duplicates.

### Edge Extension Checker (`src/engine/validators/EdgeExtensionChecker.ts`)

Validates edge extension rules: eligibility, full width, far edge open, corner ownership, long fingers.

---

## 12. Known Gaps (to be fixed)

### 12.1 Terminating Divider Joints Not Implemented

`DividerPanelNode.computeEdgeConfigs()` sets `meetsDividerId: null` for all edges. When a shorter divider terminates at a longer one, the terminating edge should get `gender: 'male'`, and the longer divider should get slot holes. Currently, it gets `gender: null` (straight edge) and a cross-lap notch is incorrectly generated instead.

See: `project-management/drafts/boxen/fix-terminating-divider-joints.md`

### 12.2 Cross-Lap Slots Generated for Terminating Dividers

`DividerPanelNode.computeCrossLapSlots()` does not distinguish crossing from terminating dividers. It checks whether the other divider's body reaches this panel's position, but that is always true (the body extends `MT` to butt against the adjacent divider). The check should verify the other divider's **void bounds** extend past this position on **both sides**.

### 12.3 Divider-to-Divider Slots Disabled

`DividerPanelNode.computeHoles()` has `continue` on line 278, skipping all divider-to-divider slot generation. This is correct for crossing dividers (handled by cross-lap) but wrong for terminating dividers (which need normal slots).
