# 2D Editor Left Sidebar — Panel, Edges, Layers

**Status:** Idea
**Captured:** 2026-02-24

## Raw

> Create a different left sidebar for 2d editing. It should include: the panel(s) that are being edited. The edges that exist on the panel (selectable, showing whether they can be modified or not). Clip mask layer (placeholder). Contents of clip mask, bitmaps, svg patterns etc.

## Idea

When in 2D editing mode, replace the current left sidebar (BoxTree) with a dedicated 2D-specific sidebar showing:

1. **Panel section** — the panel(s) currently being edited, with basic info (face, dimensions)
2. **Edges section** — list of all edges on the panel, each selectable, showing status (male/female/open, locked/unlocked, extended or not). Clicking an edge could select it for operations like offset/extension.
3. **Clip mask layer** (placeholder for now) — a layer concept where a clip mask can be applied to the panel
4. **Clip mask contents** — bitmaps, SVG patterns, vector shapes that fill/texture the clip mask region

This introduces a layer-like model to the 2D editor, moving toward richer panel content beyond just geometry.

## Context

Currently the 2D editor reuses the same BoxTree sidebar as the 3D view, which shows the full assembly hierarchy. In 2D mode you're focused on a single panel — the assembly tree is mostly noise. A dedicated sidebar would give better access to panel-specific operations (edge selection, layer management) and lay groundwork for the clip mask / decoration system (draft 119).

## Related Drafts

- **Draft 119** — Clip Mask System (idea) — the clip mask layer here is a stepping stone toward that
- **Draft 94** — SketchView2D split into SketchCanvasLayer and SketchToolPalettes — related refactor

## Open Questions

- Should the sidebar completely replace BoxTree in 2D mode, or sit alongside it?
- How do edges map to the visual — highlight the edge on the canvas when hovered in the sidebar?
- What's the data model for clip mask layers — per-panel? Per-face? Serialized how?
- Are bitmaps/SVG patterns rendered in the 2D editor, or only in SVG export?
- Does this imply a layer system (geometry layer, clip mask layer, decoration layer)?

## Possible Next Steps

- Wireframe the sidebar layout (panel info, edge list, layers)
- Prototype the edge list with status badges and hover-to-highlight
- Define the clip mask data model (could start minimal — just a boolean "has clip mask" per panel)
- Implement as a new component that SketchView2D shows instead of BoxTree
