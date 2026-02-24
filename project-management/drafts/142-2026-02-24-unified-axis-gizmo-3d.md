# Unified Axis Gizmo for 3D Manipulation (Push-Pull, Offset, Move)

**Status:** Idea
**Captured:** 2026-02-24

## Raw

> Make a new UI paradigm for moving things along an axis. Push pull has an arrow, but it doesn't really work. This should also apply to offset tool and movement tool. When these tools are selected and a suitable selection has been made: arrows should appear on the axis it can move along. The cursor should change to the move tool. Clicking and dragging either the arrows or the object to be moved should shift it along the axis. Note that we might need to look into a rationalisation of our coordinate system in a similar way that we did for 2d and snapping. This is mainly about the 3d view.

## Idea

Replace the current ad-hoc approach to axis-constrained manipulation (push-pull's broken arrow, offset's slider, move tool) with a unified axis gizmo system in the 3D view.

When a tool that supports axis movement is active and a valid selection exists:
1. **Axis arrows appear** on the object, showing which axes it can move along
2. **Cursor changes** to a move cursor
3. **Click-and-drag** on the arrows or the object itself moves it along the constrained axis
4. Value feedback shows the current offset/distance

Similar to how CAD tools (Fusion 360, SketchUp) handle axis-constrained transforms with visual gizmos.

## Current State (Audit)

| Tool | 3D Gizmo? | Drag in 3D? | How params change | Key file |
|------|-----------|-------------|-------------------|----------|
| **Push-pull** | Arrow (`PushPullArrow.tsx`, 261 lines) | Yes, but janky | Drag arrow OR palette slider | `src/components/PushPullArrow.tsx` |
| **Offset/Inset** | None | No | Palette slider only | `src/components/OffsetPalette.tsx` |
| **Move** (dividers) | None | No | Palette slider only | `src/components/MovePalette.tsx` |

### Push-pull arrow details
- Renders bidirectional cylinders at face center pointing along face normal
- Has hit-area geometry for easier clicking
- Drag projects mouse onto plane perpendicular to camera, extracts component along face normal
- Arrow stays at original position during preview (intentional — anchor stability)
- Bespoke component, not reusable for other tools

### Offset tool
- `PanelEdgeRenderer` shows clickable edge faces in 3D for selection
- Offset value only adjustable via palette number input
- No 3D drag interaction at all

### Move tool
- Zero visual feedback in 3D about which axis a divider moves along
- Only a slider in palette indicates state
- Calculates min/max bounds from adjacent dividers/walls

### Gizmo infrastructure
- No `@react-three/drei` TransformControls used anywhere
- No shared gizmo abstraction exists
- Each tool's 3D interaction is completely independent

## Issues

### 1. Inconsistent interaction models
Push-pull has a 3D arrow you can drag. Offset and Move are palette-only. Users mentally switch between "drag in 3D" and "adjust a slider" depending on tool.

### 2. Push-pull arrow is not reusable
`PushPullArrow.tsx` has its own raycasting, drag projection, and rendering — 261 lines of bespoke code. Extending to Move or Offset means duplicating or rewriting.

### 3. No axis indicator for Move tool
Selecting a divider and activating Move gives zero visual cue in 3D about direction of movement or current position.

### 4. Coordinate space complexity
Push-pull projects mouse onto a camera-perpendicular plane, then extracts the face-normal component. Divider movement is axis-aligned. Offset is edge-perpendicular. A shared gizmo needs a unified approach to "project screen drag onto world axis."

### 5. Gizmo ↔ palette sync
All three tools have palettes with number inputs. The gizmo is an alternative input, not a replacement. Both must stay in sync. Push-pull already does this but the wiring is bespoke.

### 6. Cross-cutting scope
Touches rendering (Three.js gizmo), interaction (raycasting, drag), state management (operation params), and coordinate transforms. Needs a well-defined `<AxisGizmo>` abstraction.

## Proposed Approach

### Core abstraction: `<AxisGizmo />`

A reusable R3F component that:
- Renders arrow(s) along specified world-space axis/axes
- Handles raycasting and drag-start/drag-move/drag-end
- Projects screen-space mouse movement onto the constrained axis
- Calls `onDelta(mm)` callback with the displacement
- Shows value label during drag
- Supports single-axis (push-pull, move) and potentially multi-axis configurations

### Tool integration pattern

Each tool provides:
- **Position**: where to place the gizmo (face center, divider center, edge midpoint)
- **Axis**: which direction(s) allow movement (face normal, divider axis, edge perpendicular)
- **Bounds**: min/max limits on the drag range
- **Callback**: `onDelta` that updates operation params → triggers preview

The palette number input and the gizmo both write to the same operation params. Either input updates the other.

## Sequencing

1. **Draft 135 first** — Document coordinate spaces and transform chain. Can't build a gizmo without understanding the coordinate system.
2. **Extract `<AxisGizmo>`** — Factor out the reusable drag-projection logic from PushPullArrow into a generic component. Keep PushPullArrow working during the transition.
3. **Wire into Move tool** — Simplest case: single axis, no face-normal complexity. Proves the abstraction works.
4. **Wire into Offset** — More complex: multiple edges, perpendicular directions per edge.
5. **Replace PushPullArrow** — Swap the bespoke arrow for the shared gizmo. Remove 261 lines of duplication.

## Related Drafts

- **Draft 135** — Document all coordinate spaces and transform chain (prerequisite)
- **Draft 129** — QoL: Move Tool on Edges (subset — would be solved by this)
- **Draft 61** — 2D coordinate & snapping architecture (analogous 2D work)

## Open Questions

- Should we use drei's `TransformControls` as a starting point, or build from scratch? (TransformControls may be too general — we need axis-constrained, not free-form)
- What coordinate space do gizmo arrows live in — world or assembly-local? (Assembly is centered at origin, so world ≈ assembly-local for now, but sub-assemblies differ)
- How does the gizmo interact with snapping in 3D? (Grid snap, dimension snap to nearby features)
- Should dragging the object body (not the arrow) also trigger axis movement?
- Value label: show absolute position, or delta from original? (Delta matches palette UI)
