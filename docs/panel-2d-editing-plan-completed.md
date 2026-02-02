# Panel 2D Editing Plan - Completed Work

This document contains completed phases from the 2D editing plan. See [panel-2d-editing-plan.md](panel-2d-editing-plan.md) for outstanding work.

---

## Phase 1: Safe Space Calculation ✅

1. Created `src/engine/safeSpace.ts` with new calculation logic
2. Includes edge joint margins (existing logic from editableAreas.ts)
3. Includes slot hole detection from panel `holes` array
4. Adds MT margin around each slot hole
5. Returns `SafeSpaceRegion` with outline polygon and exclusion polygons
6. Added `safeSpace` to PanelPath
7. Updated 2D view to show safe space outline and exclusion regions

---

## Phase 2: Standardized 2D Operation System ✅

Migrated inset and chamfer/fillet tools to use centralized operation system (`startOperation` → `updateOperationParams` → `applyOperation`). Operations now use engine preview scene for live feedback.

---

## Phase 3: Editor Context Architecture ✅ (Core Complete)

**Goal:** Create a unified editing system that handles all three interaction modes (Operations, Draft, Edit Sessions) with a single, testable state machine.

### Completion Status

**Core Infrastructure: DONE**
- `src/editor/types.ts` - All type definitions ✅
- `src/editor/EditorStateMachine.ts` - Pure reducer with all modes ✅
- `src/editor/EditorStateMachine.test.ts` - 40 tests passing ✅
- `src/editor/useEditorContext.ts` - React hook + engine sync ✅
- `src/editor/EditorContext.tsx` - Provider + hooks ✅
- `src/editor/useEditorKeyboard.ts` - Keyboard shortcuts ✅
- App.tsx integration - EditorProvider wrapping app ✅

**Remaining Work (to revisit after Phase 5):**

1. **Draft Mode Commit** (`useEditorContext.ts` lines 130-135)
   - Currently a stub - needs engine actions for custom paths/cutouts
   - **Revisit when:** Phase 5 adds cutout engine actions

2. **Edit Session Snapshot Restore** (`useEditorContext.ts` lines 159-161)
   - Currently a stub - needs engine snapshot/restore mechanism
   - **Revisit when:** Phase 4/5 adds geometry that can be edited

3. **Component Migration** - 8 components still use `useBoxStore` for operations:
   - `Viewport3D.tsx`, `SubdividePalette.tsx`, `ScalePalette.tsx`
   - `MovePalette.tsx`, `ConfigurePalette.tsx`, `CreateSubAssemblyPalette.tsx`
   - `PanelEdgeRenderer.tsx`, `PanelCornerRenderer.tsx`
   - **Revisit when:** After Phase 4 to consolidate all operations

**Currently Working:**
- 2D inset/chamfer tools use EditorContext
- Mode-aware undo/redo (Cmd+Z)
- Escape to cancel active mode

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                  EditorStateMachine.ts                       │
│                   (Pure TypeScript)                          │
├─────────────────────────────────────────────────────────────┤
│  • No React dependencies                                     │
│  • Pure reducer: (state, action) → state                     │
│  • All mode logic in one place                               │
│  • Fully unit-testable                                       │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   useEditorContext.ts                        │
│                    (React Hook)                              │
├─────────────────────────────────────────────────────────────┤
│  • Thin wrapper around state machine                         │
│  • Connects to engine for preview/commit                     │
│  • Provides actions as callbacks                             │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   EditorContext.tsx                          │
│                  (React Provider)                            │
├─────────────────────────────────────────────────────────────┤
│  • Single context for both 2D and 3D views                   │
│  • Tools consume via useEditor() hook                        │
└─────────────────────────────────────────────────────────────┘
```

### Files Created

| File | Description |
|------|-------------|
| `src/editor/types.ts` | Type definitions for editor state machine |
| `src/editor/EditorStateMachine.ts` | Pure state machine (no React) |
| `src/editor/EditorStateMachine.test.ts` | Unit tests for state machine |
| `src/editor/useEditorContext.ts` | React hook wrapping state machine |
| `src/editor/useEditorKeyboard.ts` | Keyboard shortcut handling |
| `src/editor/EditorContext.tsx` | React context provider |

---

## Phase 4: Custom Edge Paths (Steps 1-4 Complete) ✅

**Goal:** Allow users to customize panel edges with custom paths, including feet.

**Status:** Core functionality implemented (steps 1-4). Steps 5-6 deferred.

### Completed Steps

1. **Add data model for custom edge paths** ✅
   - Added `CustomEdgePath` and `EdgePathPoint` types to `src/engine/types.ts`
   - Added `customEdgePaths` to `BasePanelSnapshot.props`
   - Added `_customEdgePaths` Map to `BasePanel` class with get/set/clear accessors
   - Storage in `BaseAssembly._panelCustomEdgePaths` with clone support

2. **Add engine actions for edge paths** ✅
   - `SET_EDGE_PATH` - Set custom path on panel edge
   - `CLEAR_EDGE_PATH` - Remove custom path, revert to default
   - Dispatch handlers in `Engine.ts`
   - Integration with panel generation (applies stored paths to panels)

3. **Implement edge path rendering in panel generation** ✅
   - Added `applyCustomEdgePathToOutline()` method in `BasePanel.ts`
   - Handles mirrored paths (define half, mirror automatically)
   - Converts normalized coordinates (t=0-1 along edge, offset=perpendicular) to panel coordinates
   - Replaces edge segment with custom path points
   - Tests added: `tests/unit/engine/BasePanel.test.ts`

4. **Create edge path drawing tool** ✅ (uses Draft mode from EditorContext)
   - Select panel edge to customize - click near editable edge starts draft
   - Click to add points along edge - accumulated in draft buffer
   - Preview path as it's drawn - SVG overlay with point markers
   - Commit creates engine action - SET_EDGE_PATH dispatched on apply
   - Fixed edge hit distance for reliable detection

---

## Phase 5: Basic Cutouts (Steps 1-4 Complete) ✅

**Goal:** Allow users to add cutout shapes (rectangles, circles) to panels for handles, vents, etc.

### Completed Steps

1. **Add cutout data model** ✅
   - Defined `Cutout` type with shape variants (rect, circle, path)
   - Added `cutouts` array to panel storage in assembly
   - Engine actions: `ADD_CUTOUT`, `UPDATE_CUTOUT`, `DELETE_CUTOUT`
   - Integrated cutouts into panel outline generation as holes

   **Implementation Details:**
   - `src/engine/types.ts`: Added `CutoutBase`, `RectCutout`, `CircleCutout`, `PathCutout`, `Cutout` types
   - `src/engine/types.ts`: Added `cutouts` to `BasePanelSnapshot.props`
   - `src/engine/types.ts`: Added 'cutout' source type to `PanelHole`
   - `src/engine/Engine.ts`: Added dispatch handlers for ADD/UPDATE/DELETE_CUTOUT
   - `src/engine/nodes/BaseAssembly.ts`: Added `_panelCutouts` storage and methods
   - `src/engine/nodes/BasePanel.ts`: Added cutout accessor methods and hole generation

2. **Implement rectangle cutout tool** ✅
   - Click-drag to define rectangle bounds
   - Preview shows rectangle outline
   - Apply adds cutout via engine action

   **Implementation Details:**
   - `src/components/SketchView2D.tsx`: Added rectangle drawing state and handlers
   - Crosshair cursor when tool is active
   - Preview rectangle with dashed outline while dragging
   - On mouse up, dispatches ADD_CUTOUT action

3. **Implement circle cutout tool** ✅
   - Click center, drag for radius
   - Preview shows circle outline
   - Apply adds cutout via engine action

   **Implementation Details:**
   - `src/components/SketchView2D.tsx`: Added circle drawing state and handlers
   - Preview circle with dashed outline while dragging
   - Radius determined by distance from click point to current mouse position

4. **Validate cutouts stay within safe space** ✅
   - Check cutout bounds against safe space region
   - Warn or prevent cutouts that intersect joints/slots
   - Visual feedback when cutout is invalid

   **Implementation Details:**
   - `src/engine/safeSpace.ts`: Added `isCircleInSafeSpace()` function, updated `isRectInSafeSpace()` to use center coordinates
   - `src/components/SketchView2D.tsx`: Import validation functions, add validation to preview rendering (shows red when invalid), reject cutout creation when outside safe space
   - Valid cutouts show cyan/teal preview, invalid cutouts show red preview
   - Invalid cutouts are silently rejected with console warning

---

## Core Concepts (Reference)

### Geometry Model: Assembly → Panel

```
┌─────────────────────────────────────────────────────────────┐
│                  ASSEMBLY GEOMETRY                           │
│                 (3D structural model)                        │
├─────────────────────────────────────────────────────────────┤
│  • Box dimensions (W × H × D)                                │
│  • Face configuration (which faces solid)                    │
│  • Void tree (subdivisions, sub-assemblies)                  │
│  • Material properties (thickness, finger width)             │
│  • Assembly config (axis, lids, feet)                        │
│                                                              │
│  Managed by: ENGINE (existing)                               │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ Derives constraints
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                 PANEL CONSTRAINTS                            │
│              (derived from assembly)                         │
├─────────────────────────────────────────────────────────────┤
│  Per panel (read-only, computed):                            │
│  • Body dimensions                                           │
│  • Edge types (male joint / female joint / open)             │
│  • Safe space outline                                        │
│  • Slot exclusions                                           │
│  • Corner positions and max fillet radii                     │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ Constrains
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  PANEL GEOMETRY                              │
│               (2D editable features)                         │
├─────────────────────────────────────────────────────────────┤
│  Per panel (editable within constraints):                    │
│  • Custom edge paths (must stay within safe space)           │
│  • Cutouts (must stay within safe space)                     │
│  • Corner fillets (limited by max radius)                    │
│  • Edge extensions (limited by edge type)                    │
│                                                              │
│  Managed by: ENGINE (new) + 2D EDITOR                        │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ Combined into
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   PANEL OUTPUT                               │
│              (final renderable/exportable)                   │
├─────────────────────────────────────────────────────────────┤
│  • Complete outline (joints + custom paths + fillets)        │
│  • All holes (slots + cutouts)                               │
│  • Transform (3D position/rotation)                          │
│  • Metadata (source, label)                                  │
└─────────────────────────────────────────────────────────────┘
```

### Safe Space (Editable Areas)

The safe space is the region where custom geometry (cutouts, edge modifications) can be added without interfering with structural joints.

```
┌─────────────────────────────────────┐
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │  ← Jointed edge (male fingers)
│ ▓                               ▓ │
│ ▓    ┌───────────────────┐      ▓ │  ← MT margin around joints
│ ▓    │                   │      ▓ │
│ ▓    │    SAFE SPACE     │      ▓ │  ← Custom geometry allowed here
│ ▓    │  ┌───┐            │      ▓ │
│ ▓    │  │ X │ ← slot     │      ▓ │  ← Slot holes are exclusions within safe space
│ ▓    │  └───┘            │      ▓ │
│ ▓    └───────────────────┘      ▓ │
│ ▓                               ▓ │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │  ← Jointed edge (female slots)
└─────────────────────────────────────┘
         ↑ Open edge (no exclusion)
```

### Interaction Modes

| Mode | When | Model State | Undo Behavior | Cancel (Esc) |
|------|------|-------------|---------------|--------------|
| **Operation** | Inset, fillet, add shape | Preview scene | N/A (adjust params) | Discard preview |
| **Draft** | Drawing new path/shape | Unchanged | Pop from buffer | Discard buffer |
| **Edit Session** | Editing existing geometry | Modified live | Session undo stack | Restore initial |
