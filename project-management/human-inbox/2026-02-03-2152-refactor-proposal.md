# Proposal: Modularize SketchView2D Component

**ID:** PROP-8dc799e8
**Proposer:** architect
**Category:** refactor
**Complexity:** L
**Created:** 2026-02-03T21:52:00Z

## Summary
Extract cohesive modules from the 3,408-line `SketchView2D.tsx` component to improve maintainability and enable independent testing of 2D editing features.

## Rationale
`SketchView2D.tsx` is the largest component in the codebase at 3,408 lines. It handles multiple distinct responsibilities:

1. **Path/polygon tool** - Drawing freeform shapes, edge paths, rectangles, circles
2. **Corner finish tool** - Chamfer/fillet selection and application
3. **Edge extension tool** - Inset/outset edge dragging
4. **Safe space analysis** - Computing valid drawing regions
5. **SVG rendering** - Panel outline, joints, holes visualization
6. **View controls** - Zoom, pan, viewBox management

This creates several problems:
- **Cognitive load**: Developers must understand 3,400+ lines to modify any feature
- **Testing difficulty**: No way to unit test individual tools without the full component
- **Merge conflicts**: Multiple features in one file increases conflict likelihood
- **Code duplication risk**: Hard to extract reusable patterns when buried in monolith

The component has grown organically - it started as a simple SVG viewer and accumulated tool-specific logic. This is classic "big ball of mud" technical debt.

## Complexity Reduction
This refactor directly enables:
- Unit testing path tool classification logic independently
- Adding new 2D tools without modifying the main component
- Reusing safe space analysis in other contexts
- Smaller, focused code reviews for 2D-related changes

Line count impact estimate:
- `SketchView2D.tsx`: 3,408 → ~800 lines (orchestration only)
- New extracted modules: 5-6 files, ~400-500 lines each

## Dependencies
None - this is standalone refactoring of existing code.

## Enables
- Easier implementation of future 2D tools (measurement, snapping, guides)
- Independent testing of path validation logic
- Cleaner separation if 2D view ever becomes a separate package

## Proposed Modules

### 1. `useSketchViewState.ts` (Custom Hook)
- All useState/useRef declarations (~30 state variables)
- Derived state computations
- Reduces SketchView2D to declarative rendering

### 2. `PathTool.tsx` (Component + Logic)
- Rectangle drawing (`isDrawingRect`, `rectStart`, `rectCurrent`)
- Circle drawing (`isDrawingCircle`, `circleCenter`, `circleRadius`)
- Freeform polygon drawing (`pendingPolygon`, polygon classification)
- Edge path drawing (draft path logic)
- Path validation and constraint logic

### 3. `EdgeExtensionTool.tsx` (Component)
- Edge hover detection
- Edge drag state management
- Extension preview rendering
- Integrates with existing `InsetPalette`

### 4. `CornerFinishTool.tsx` (Component)
- Corner detection and highlighting
- Corner selection state
- Chamfer/fillet preview rendering
- Integrates with existing chamfer operation

### 5. `SketchRenderer.tsx` (Pure Component)
- Panel outline SVG rendering
- Joint segment visualization
- Hole rendering
- Edge status coloring
- Grid pattern rendering

### 6. `sketchViewHelpers.ts` (Utilities)
- `pathToSvgD()` - Convert points to SVG path
- `classifySegment()` - Classify point to edge
- `getEdgeSegments()` - Group segments by edge
- `distanceToSegment()` - Point-to-line distance
- `classifyClickLocation()` - Hit testing
- `constrainAngle()` - Angle snapping

## Acceptance Criteria
- [ ] `SketchView2D.tsx` is under 1,000 lines
- [ ] All existing 2D editing functionality works identically
- [ ] Each extracted module has clear, documented interface
- [ ] No new dependencies introduced
- [ ] Integration tests pass (existing behavior preserved)
- [ ] Each tool component can be rendered independently for testing

## Relevant Files
- `src/components/SketchView2D.tsx` (primary target)
- `src/components/FloatingPalette.tsx` (used by tools)
- `src/components/InsetPalette.tsx` (used by edge extension)
- `src/engine/safeSpace.ts` (used for path validation)
- `src/utils/cornerFinish.ts` (used by corner tool)
- `src/utils/polygonBoolean.ts` (used by path tool)
