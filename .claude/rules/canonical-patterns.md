---
paths:
  - "src/components/*Palette.tsx"
  - "src/components/SketchView2D.tsx"
  - "src/operations/registry.ts"
  - "src/engine/Engine.ts"
  - "src/engine/types.ts"
  - "src/utils/**"
  - "src/store/slices/**"
---

# Canonical Patterns

**Before writing a new operation or geometry utility, read `docs/canonical-patterns.md`.**

## Quick Rules

### Before writing a new operation
1. Read the reference implementation for your operation type:
   - **Parameter op** (has preview): `src/components/ScalePalette.tsx`
   - **Immediate op** (no preview): `src/store/slices/panelSlice.ts` → `toggleFace()`
   - **2D drawing op**: `src/components/SketchView2D.tsx`
2. Check `src/operations/registry.ts` to see how `createPreviewAction` is written for similar ops.
3. Check `.claude/rules/operations.md` for the full operations system quick reference.

### Before writing geometry code
1. Check if a utility already exists in `src/utils/`:
   - `fingerJoints.ts` — finger joint generation (never compute by hand)
   - `genderRules.ts` — joint gender determination (never re-implement)
   - `sketchCoordinates.ts` — 2D coordinate transforms (never compute by hand)
   - `snapEngine.ts` — snap and guide line logic
   - `polygonBoolean.ts` — polygon union/difference
   - `pathValidation.ts` — path validity checks
2. If a utility exists, use it — do not rewrite.

### Non-negotiable constraints
- **All model mutations via `engine.dispatch(action)`** — never mutate engine node internals
- **All panel generation via `engine.generatePanelsFromNodes()`** — never construct panels manually
- **All 2D coordinate transforms via `sketchCoordinates.ts`** — never compute inline
- **React components read panels via `useEnginePanels()`** — returns preview when active
- **After non-preview dispatches, call `notifyEngineStateChanged()`** — otherwise React won't re-render

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Mutating `engine.assembly.field = value` directly | `engine.dispatch({ type: 'SET_...', ... })` |
| Creating a simple 4-point outline for testing | Use `createEngineWithAssembly()` + `generatePanelsFromNodes()` |
| Computing `Math.cos` / `Math.sin` for joint geometry | Use `fingerJoints.ts` |
| Inlining `clientX / scale + viewBox.x` | Use `screenToSvgCoords()` from `sketchCoordinates.ts` |
| Duplicating `WALL_PRIORITY` logic | Use `genderRules.ts` |
| Forgetting `notifyEngineStateChanged()` | Always call after direct engine dispatch |

## See Also

- `docs/canonical-patterns.md` — full patterns with code examples
- `.claude/rules/operations.md` — operations system quick reference
- `.claude/rules/geometry.md` — geometry constraints
