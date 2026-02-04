# Proposal: Split SketchView2D.tsx into focused modules

**Proposer:** architect
**Category:** refactor
**Complexity:** L
**Created:** 2026-02-03T23:06:32Z

## Summary

Decompose the 3,408-line `SketchView2D.tsx` monolith into 4-5 focused modules to improve maintainability and reduce cognitive load.

## Rationale

`src/components/SketchView2D.tsx` is currently the largest file in the codebase at 3,408 lines. This creates several problems:

1. **High cognitive load**: Developers must mentally parse thousands of lines to understand where to make changes
2. **Difficult code review**: PRs touching this file require reviewers to understand the full context
3. **Merge conflicts**: Multiple features touching this file create frequent conflicts
4. **Testing isolation**: Impossible to unit test individual concerns (event handling, rendering, geometry utilities)

### Current Structure Analysis

The file contains these distinct responsibilities:

| Section | Lines | Description |
|---------|-------|-------------|
| Geometry utilities | ~350 | Path conversion, segment classification, click analysis |
| Event handlers | ~800 | Mouse down/up/move, keyboard handling, drag operations |
| Rendering helpers | ~400 | Grid patterns, shape previews, corner indicators |
| Main component | ~1,800 | State, effects, toolbar integration, main JSX |

These responsibilities are cleanly separable with well-defined interfaces.

## Proposed Structure

```
src/components/
  SketchView2D/
    index.ts                    # Re-export main component
    SketchView2D.tsx           # Main component (~800 lines)
    types.ts                   # Shared types (EdgePosition, ClickLocation, etc.)
    geometry/
      index.ts                 # Re-export utilities
      pathUtils.ts             # pathToSvgD, getEdgeSegments, distanceToSegment
      clickClassification.ts   # classifyClickLocation, classifySegment
      edgePath.ts             # getEdgePathOffsetAtT, getConceptualBoundary
    hooks/
      useSketchEventHandlers.ts # handleMouseDown, handleMouseMove, handleMouseUp
      useEdgeDetection.ts      # findEdgeAtPoint, isEdgeEditable
      useCornerDetection.ts    # findCornerAtPoint, handleCornerClick
    renderers/
      GridPattern.tsx          # Grid overlay component
      DraftPreview.tsx         # Path/polygon draft visualization
      ShapePreview.tsx         # Rectangle/circle preview during drawing
      CornerIndicators.tsx     # Chamfer corner markers
```

## Complexity Reduction

1. **Enables future 2D operation integration**: With event handlers extracted, they can be more easily wired into the operation system (currently they dispatch directly to engine, bypassing the operation pattern)

2. **Simplifies testing**: Each module can have focused unit tests without mocking the entire component

3. **Reduces merge conflicts**: Features like "add new shape tool" vs "improve corner detection" won't touch the same file

4. **Clear ownership**: Event handling changes go in hooks/, rendering in renderers/, geometry in geometry/

## Dependencies

None - this is a pure refactoring with no functional changes.

## Enables

- Easier integration of 2D operations with the operation system (currently 27+ direct `engine.dispatch()` calls)
- Unit testing of geometry utilities
- Potential reuse of event handling hooks in other views

## Risks

- **Import path changes**: Files importing from `SketchView2D.tsx` will need updates (mitigated by barrel export in `index.ts`)
- **Regression risk**: High test coverage needed before and after (recommend adding integration tests first)

## Acceptance Criteria

- [ ] All existing functionality preserved (manual QA of all 2D tools)
- [ ] No single file exceeds 800 lines
- [ ] Each module has a clear, single responsibility
- [ ] Geometry utilities have unit tests
- [ ] Main component imports from extracted modules
- [ ] Barrel export maintains same import path (`../SketchView2D` or `../SketchView2D/index`)
- [ ] TypeScript compiles with no new errors
- [ ] Existing tests still pass

## Relevant Files

Primary target:
- `src/components/SketchView2D.tsx` (3,408 lines)

Files that import from SketchView2D:
- `src/components/Viewport2D.tsx`

Related documentation:
- `docs/modification-pattern-plan.md` (operation system that 2D ops should eventually use)

## Implementation Approach

### Phase 1: Extract geometry utilities (~2 hours)
Move pure functions with no React dependencies:
- `pathToSvgD`
- `classifySegment`
- `getEdgeSegments`
- `distanceToSegment`
- `classifyClickLocation`
- `constrainAngle`
- `getEdgePathOffsetAtT`
- `getConceptualBoundary`
- `getJointSegments`
- `getDividerMeetsFaces`

### Phase 2: Extract rendering components (~2 hours)
Move React components that render SVG elements:
- `GridPattern` (already a separate component inside the file)
- Path draft preview rendering
- Shape (rect/circle) preview rendering
- Corner indicators

### Phase 3: Extract custom hooks (~3 hours)
Move stateful logic with clear boundaries:
- Event handlers (mouse, keyboard)
- Edge detection logic
- Corner detection logic

### Phase 4: Clean up main component (~2 hours)
- Import from new modules
- Reduce main component to ~800 lines
- Add integration tests if missing
