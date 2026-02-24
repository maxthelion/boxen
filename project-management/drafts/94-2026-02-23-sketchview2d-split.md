# SketchView2D.tsx: split into SketchCanvasLayer and SketchToolPalettes

**Status:** Idea
**Author:** codebase-analyst
**Captured:** 2026-02-23

## Analysis

`src/components/SketchView2D.tsx` has grown to **3,369 lines**, making it the largest active source file in the codebase. It is a single React component that combines three distinct concerns:

1. **State and event orchestration** — pan/zoom state, edge drag, tool selection, all mouse/keyboard handlers, and derived values computed from panel geometry
2. **SVG canvas rendering** — the panel outline, holes, finger joints, safe-space regions, grid, edge highlights, path preview, cursor overlays, and snap guide lines
3. **Floating tool palettes** — five separate FloatingPalette panels (chamfer/fillet, inset/outset, path tool, polygon mode, additive shape mode) each with their own controls and apply/cancel flows

The component has accumulated this size incrementally as each new tool (rectangle, circle, path, polygon, chamfer, inset) was added directly into the monolith rather than extracted. All state lives at the top level, which makes it difficult to reason about individual tool behaviours without reading thousands of lines of context.

## Proposed Split

Split into three files:

### `SketchView2D.tsx` (coordinator, ~700 lines)
- Retains all state declarations and hooks
- All event handlers (`handleMouseDown`, `handleMouseMove`, `handleMouseUp`, `handleWheel`)
- The top-level component structure, toolbar, and layout
- Delegates canvas rendering and palette rendering to sub-components via props

### `SketchCanvasLayer.tsx` (~1,500 lines)
- Receives: `panel`, `viewBox`, `edgeSegments`, `jointSegments`, `safeSpace`, `hoveredEdge`, `detectedCorners`, `draftPoints`, `cursorPosition`, `activeSnapResult`, tool state, colors
- Renders: the `<svg>` element, grid pattern, panel outline path, holes, finger joints, safe-space regions, conceptual boundary, edge hover highlights, path-tool preview, snap guide lines, corner markers, rect/circle preview overlays

### `SketchToolPalettes.tsx` (~800 lines)
- Receives: tool state props, operation state, panel, callbacks for each tool action
- Renders: the five FloatingPalette instances (chamfer, inset/outset, path tool, polygon mode, additive shape) and the bottom-right Edge Status + Legend overlay

## Complexity

**Medium.** The main challenge is that the canvas layer and palette components need many props threaded through from the coordinator. The SVG canvas is the hardest part — it currently references ~30 local variables from the component scope. Creating a clean prop interface requires audit work. The palette components are more mechanical: they mainly need callback props and operation state.

No engine logic changes are needed. The public API of `SketchView2D` (single `className` prop) does not change. Tests do not reference this component directly.

Estimated: 1–2 days of careful refactoring and a round of visual QA to ensure rendering is unchanged.
