# Document All Coordinate Spaces and Transform Chain

**Status:** Idea
**Captured:** 2026-02-24
**Source:** draft 103 (Problems Holding Back Speed)

## Problem

Agents repeatedly get coordinate spaces wrong when working on 2D/3D features. The 2D coordinate extraction (`src/utils/sketchCoordinates.ts`) helped, but there's no single reference documenting all the spaces and when to use each.

## Coordinate Spaces

These need documenting with diagrams and conversion functions:

1. **Screen space** — browser pixels (clientX, clientY)
2. **SVG viewport space** — after viewBox transform, Y-flipped
3. **Panel-local space** — origin at panel center, used by outline/holes
4. **World space** — 3D position in assembly, used by three.js
5. **Assembly space** — relative to assembly origin (0,0,0 at corner)
6. **Face space** — 2D projection onto a face plane (maps to panel-local)

## What Exists

- `src/utils/sketchCoordinates.ts` — screen→SVG→panel-local transforms (extracted from SketchView2D)
- `src/engine/nodes/BasePanel.ts` — panel transform (position, rotation in world space)
- `src/utils/faceGeometry.ts` — face/edge relationship helpers
- Three.js camera/raycaster — world→screen projection

## Deliverable

A `docs/coordinate-systems.md` reference that:
- Names each space with a diagram
- Shows the full transform chain with function names
- Documents which space each subsystem operates in
- Lists common mistakes and how to avoid them
- Referenced from CLAUDE.md so agents find it
