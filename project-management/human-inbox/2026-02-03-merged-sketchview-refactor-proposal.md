# Proposal: Modularize SketchView2D Component

**ID:** PROP-merged
**Proposer:** architect (merged from PROP-8dc799e8 and 2237)
**Category:** refactor
**Complexity:** L
**Created:** 2026-02-03T22:37:00Z

## Summary

Refactor `SketchView2D.tsx` (3,408 lines) by extracting each drawing tool into a dedicated `sketch-tools/` directory with shared state management, utilities, and types.

## Rationale

`SketchView2D.tsx` is the largest component in the codebase at 3,408 lines. It handles multiple distinct responsibilities:

1. **Path/polygon tool** - Drawing freeform shapes, edge paths, rectangles, circles
2. **Corner finish tool** - Chamfer/fillet selection and application
3. **Edge extension tool** - Inset/outset edge dragging
4. **Cutout tools** - Interior/boundary polygon operations
5. **Safe space analysis** - Computing valid drawing regions
6. **SVG rendering** - Panel outline, joints, holes visualization
7. **View controls** - Zoom, pan, viewBox management

**Problems this causes:**

- **Cognitive load**: Developers must understand 3,400+ lines to modify any feature
- **Testing difficulty**: No way to unit test individual tools without the full component
- **Merge conflicts**: Multiple features in one file increases conflict likelihood
- **Slow development**: Multiple developers can't work on different tools simultaneously
- **Performance**: React re-renders more than necessary due to coupled state

## Complexity Reduction

This refactor will:

1. **Enable parallel development** - Each tool can be modified independently
2. **Simplify testing** - Tools can be unit tested in isolation
3. **Improve code navigation** - Find tool-specific code in dedicated files
4. **Enable future tools** - Adding new tools won't inflate the main file further
5. **Reduce cognitive load** - Each tool file is self-contained (~300-600 lines)

Line count impact:
- `SketchView2D.tsx`: 3,408 → ~200-400 lines (orchestration + SVG canvas only)
- New extracted modules: 8-10 files in `sketch-tools/`

## Dependencies

None - this is standalone refactoring of existing code.

## Enables

- Easier implementation of future 2D tools (measurement, snapping, guides)
- Independent testing of path validation logic
- Unit testing of individual tool behaviors
- Potential for a tool plugin architecture

## Proposed Structure

```
src/components/
  SketchView2D.tsx              (~200-400 lines - container, SVG canvas, tool switching)
  sketch-tools/
    index.ts                    (barrel export)
    types.ts                    (shared tool interfaces, ToolContext type)
    useSketchToolState.ts       (shared state hook - zoom, pan, viewBox, coordinates)
    sketchViewHelpers.ts        (utilities: pathToSvgD, classifySegment, distanceToSegment, etc.)
    SketchRenderer.tsx          (pure component: panel outline, joints, holes, grid)
    RectangleTool.tsx           (~300 lines)
    CircleTool.tsx              (~300 lines)
    PathTool.tsx                (~500 lines - freeform polygon, edge paths)
    EdgeExtensionTool.tsx       (~300 lines - inset/outset dragging)
    CutoutTool.tsx              (~400 lines - interior/boundary polygons)
    CornerFinishTool.tsx        (~300 lines - chamfer/fillet selection)
    SelectionTool.tsx           (~200 lines - default selection behavior)
```

## Module Descriptions

### `useSketchToolState.ts` (Custom Hook)
- All shared useState/useRef declarations (zoom, pan, viewBox, mouse position)
- Coordinate transformation helpers (screen ↔ SVG)
- Reduces SketchView2D to declarative tool switching

### `sketchViewHelpers.ts` (Utilities)
- `pathToSvgD()` - Convert points to SVG path
- `classifySegment()` - Classify point to edge
- `getEdgeSegments()` - Group segments by edge
- `distanceToSegment()` - Point-to-line distance
- `classifyClickLocation()` - Hit testing
- `constrainAngle()` - Angle snapping

### `SketchRenderer.tsx` (Pure Component)
- Panel outline SVG rendering
- Joint segment visualization (male/female coloring)
- Hole rendering
- Edge status coloring
- Grid pattern rendering

### Tool Components
Each tool component manages its own:
- Tool-specific state (drawing in progress, preview, etc.)
- Mouse event handlers
- Tool-specific SVG overlays
- Integration with FloatingPalette if needed

## Acceptance Criteria

- [ ] `SketchView2D.tsx` reduced to ~200-400 lines (container/orchestration only)
- [ ] Each tool extracted to `src/components/sketch-tools/{ToolName}Tool.tsx`
- [ ] Shared hook extracted to `src/components/sketch-tools/useSketchToolState.ts`
- [ ] Utility functions in `sketchViewHelpers.ts`
- [ ] All existing 2D sketch functionality works identically
- [ ] No regressions in visual output or behavior
- [ ] Type safety maintained (no new `any` types)
- [ ] Each tool component can be rendered independently for testing
- [ ] No new dependencies introduced

## Risks & Mitigations

1. **Risk:** Breaking existing behavior
   **Mitigation:** No functional changes - pure extraction refactoring. Manual testing of each tool after extraction.

2. **Risk:** Prop drilling between container and tools
   **Mitigation:** Use `useSketchToolState` hook and React context for common state (SVG dimensions, zoom, coordinates).

3. **Risk:** Large PR difficult to review
   **Mitigation:** Extract tools one at a time, with separate commits per tool. Order: helpers → renderer → simplest tool → complex tools.

## Relevant Files

- `src/components/SketchView2D.tsx` (primary target)
- `src/components/EditorToolbar.tsx` (tool definitions)
- `src/components/FloatingPalette.tsx` (used by tools)
- `src/components/InsetPalette.tsx` (used by edge extension)
- `src/engine/safeSpace.ts` (used for path validation)
- `src/utils/cornerFinish.ts` (used by corner tool)
- `src/utils/polygonBoolean.ts` (used by path tool)
