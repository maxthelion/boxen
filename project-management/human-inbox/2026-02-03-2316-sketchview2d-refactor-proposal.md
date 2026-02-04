# Proposal: Split SketchView2D into Focused Sub-Components

**Proposer:** architect
**Category:** refactor
**Complexity:** L
**Created:** 2026-02-03T23:16:52Z

## Summary

Split the monolithic `SketchView2D.tsx` (3,408 lines) into ~8 focused sub-components to improve maintainability and reduce cognitive load.

## Rationale

`SketchView2D.tsx` has grown to 3,408 lines and handles multiple distinct concerns:

1. **SVG canvas rendering** - Grid patterns, viewBox management, pan/zoom
2. **Path drawing tool** - Edge path draft mode, forked mode, polygon mode
3. **Rectangle cutout tool** - Drawing, validation, safe space checking
4. **Circle cutout tool** - Drawing, validation, safe space checking
5. **Corner chamfer/fillet tool** - Corner detection, selection, parameter UI
6. **Geometry classification** - `classifyClickLocation`, `classifySegment`, safe space
7. **Edge drag interactions** - Edge extension via mouse drag
8. **Multiple floating palettes** - Path, inset, chamfer, polygon, additive mode

**Problems with current structure:**
- Adding a new 2D tool requires understanding all 3,400 lines
- ~35 useState hooks in a single component
- Helper functions (lines 28-309) are interleaved with component code
- Testing individual tools requires testing the entire component
- Finding relevant code requires searching through unrelated concerns

**Evidence of complexity:**
- 10+ rendering helper functions (`pathToSvgD`, `classifySegment`, `getEdgeSegments`, etc.)
- 20+ event handlers for different tools
- 5 separate palette components conditionally rendered
- State for: pan/zoom, edge hover, edge drag, corner hover, path draft, polygon pending, rect drawing, circle drawing, additive mode selection

## Complexity Reduction

This refactoring will:

1. **Enable future tool additions** - New 2D tools can be added as isolated components
2. **Simplify testing** - Each sub-component can be unit tested independently
3. **Reduce merge conflicts** - Developers working on different tools won't touch same file
4. **Improve discoverability** - File names indicate purpose (e.g., `RectCutoutTool.tsx`)

## Dependencies

None - this is a standalone refactoring that doesn't depend on feature work.

## Enables

- Cleaner implementation of future 2D tools (snapping, measurement, etc.)
- Easier maintenance of existing tools
- Potential for tool plugin architecture

## Proposed Structure

```
src/components/SketchView2D/
├── index.tsx                    # Main container (~400 lines)
├── SketchCanvas.tsx             # SVG rendering, grid, viewBox (~300 lines)
├── hooks/
│   ├── useSketchState.ts        # Pan/zoom, cursor, hover state
│   ├── usePanZoom.ts            # Pan and zoom logic extraction
│   └── useGeometryClassification.ts  # classifyClickLocation, etc.
├── tools/
│   ├── PathTool.tsx             # Edge path and polygon drawing
│   ├── RectCutoutTool.tsx       # Rectangle cutout drawing
│   ├── CircleCutoutTool.tsx     # Circle cutout drawing
│   ├── ChamferTool.tsx          # Corner selection and chamfer/fillet
│   └── EdgeDragHandler.tsx      # Edge extension via drag
├── palettes/
│   ├── PathPalette.tsx          # Path tool options
│   ├── ChamferPalette.tsx       # Chamfer/fillet options (move from FloatingPalette)
│   └── AdditiveModeSelector.tsx # Additive/subtractive mode selection
└── utils/
    ├── svgHelpers.ts            # pathToSvgD, coordinate conversion
    └── edgeGeometry.ts          # classifySegment, getEdgeSegments
```

## Acceptance Criteria

- [ ] `SketchView2D/index.tsx` is under 500 lines
- [ ] Each tool component is independently testable
- [ ] No functionality regression - all existing tools work identically
- [ ] Helper functions moved to utils are pure (no React dependencies)
- [ ] State is lifted to appropriate level (container vs tool)
- [ ] TypeScript interfaces for inter-component communication
- [ ] Existing tests continue to pass

## Relevant Files

- `src/components/SketchView2D.tsx` (primary - will be split)
- `src/components/EditorToolbar.tsx` (may need minor updates)
- `src/components/FloatingPalette.tsx` (used by palettes)
- `src/editor/index.ts` (context used by sketch view)
- `src/engine/safeSpace.ts` (imported by sketch view)

## Alternatives Considered

### Alternative 1: Extract only utilities
Move just the helper functions (lines 28-309) to a utils file. Rejected because:
- Main component would still be ~3,100 lines
- Tools would still be interleaved
- Doesn't address the core complexity issue

### Alternative 2: Single large refactor
Do all extraction in one PR. Rejected because:
- Too large for reliable code review
- Higher risk of regressions
- Harder to bisect if issues arise

### Alternative 3: Leave as-is
Accept the monolithic component. Rejected because:
- Adding new 2D tools will compound the problem
- Developer experience is already degraded
- Testing is difficult

## Implementation Phases

### Phase 1: Extract Utilities (S complexity)
- Move pure helper functions to `utils/svgHelpers.ts` and `utils/edgeGeometry.ts`
- No behavior changes, just file reorganization
- Low risk, easy to verify

### Phase 2: Extract Canvas (M complexity)
- Create `SketchCanvas.tsx` for SVG rendering, grid, viewBox
- Create `hooks/usePanZoom.ts` for pan/zoom state
- Container coordinates tool rendering

### Phase 3: Extract Tools (M complexity each)
- Extract each tool one at a time:
  1. `RectCutoutTool.tsx` (simplest, isolated state)
  2. `CircleCutoutTool.tsx` (similar to rect)
  3. `ChamferTool.tsx` (corner selection + palette)
  4. `PathTool.tsx` (most complex - edge path, polygon)
  5. `EdgeDragHandler.tsx` (edge extension)

### Phase 4: Consolidate (S complexity)
- Final cleanup of container component
- Ensure consistent patterns across tools
- Update/add tests for new structure

## Risk Assessment

**Low risk:**
- This is a pure refactoring - no behavior changes
- Each phase can be deployed independently
- Rollback is straightforward (revert commits)

**Mitigation:**
- Each phase gets its own PR with review
- Manual testing of all tools after each phase
- Existing integration tests provide safety net
