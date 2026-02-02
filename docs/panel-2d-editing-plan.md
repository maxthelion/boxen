# Panel 2D Editing Plan

## Overview

Enable users to customize panel geometry beyond the automatic finger joints and edge extensions. This includes:
- Custom edge paths (for decorative edges, feet, etc.)
- Cutout shapes (for handles, vents, decorative holes)
- A 2D editing view with drawing tools

**Completed work:** See [panel-2d-editing-plan-completed.md](panel-2d-editing-plan-completed.md) for:
- Phase 1: Safe Space Calculation ✅
- Phase 2: Standardized 2D Operation System ✅
- Phase 3: Editor Context Architecture ✅
- Phase 4: Custom Edge Paths (Steps 1-4) ✅
- Phase 5: Basic Cutouts (Steps 1-4) ✅

---

## Outstanding Work

### Phase 4: Custom Edge Paths (Remaining)

**Status:** Core functionality complete. Remaining steps deferred.

5. **Implement feet as custom edge path preset**
   - Feet config generates equivalent CustomEdgePath
   - Shorthand for common foot patterns
   - Users can further edit generated path

6. **Create edge path editing tool** (uses Edit Session)
   - Select existing custom edge path
   - Drag nodes to move them
   - Add/delete nodes
   - Session undo/redo for edits

---

### Phase 5: Basic Cutouts (Remaining)

5. **Implement cutout editing** (uses Edit Session)
   - Select existing cutout to edit
   - Drag to move, handles to resize
   - Delete key removes cutout
   - Session undo/redo for edits

6. **Unified path drawing behavior** ← IN PROGRESS
   - **Reference:** [edge-and-path-editing-analysis.md](edge-and-path-editing-analysis.md) for full analysis and phase breakdown
   - That document defines Phases A-E with detailed specs - use it to assess progress

   Implementation steps:
   - [x] 6a. Update CustomEdgePath model - add `baseOffset`, one path per edge
   - [x] 6b. Implement `PathAnalysis` function - detect path type from position
   - [x] 6c. Add PathAnalysis integration tests
   - [x] 6d. Update drawing flow - route based on path analysis (basic routing, edge path merging deferred)
   - [x] 6e. Add additive/subtractive toggle for open edge paths
   - [x] 6f. Subtractive mode clips shapes to panel bounds (creates notch)
   - [x] 6g. Preview of pending shape while mode palette is open
   - [x] 6h. Edge path routing (convert shapes touching safe space border to CustomEdgePath)

   **Completed:**
   - [x] Additive mode (extending panel outline with positive offsets)
   - [x] Edge path merging (when multiple shapes modify same edge)

---

### Phase 6: Advanced Drawing Tools

1. Line tool with snapping (uses Draft mode)
2. Polygon tool (uses Draft mode)
3. Freeform path tool (uses Draft mode)
4. Shape mode toggle (add/subtract)

---

### Phase 7: Import Features

1. Bitmap import as reference layer
2. SVG pattern import
3. Import dialogs

---

### Phase 8: Panel Feature Copying

1. Feature copying between compatible panels
2. Copy/paste UI
3. Edge gender compatibility handling
4. Mirror operations to opposite edge
5. Copy by reference with flip options (H/V)

---

## Files to Create/Modify

### Engine Extensions

| File | Action | Description |
|------|--------|-------------|
| `src/engine/PanelGeometry.ts` | Create | Panel-level geometry storage (paths, cutouts) |
| `src/engine/PanelConstraints.ts` | Create | Derived constraints from assembly |
| `src/utils/editableAreas.ts` | Deprecate | Legacy system, replaced by safeSpace.ts |

### 2D Editor Components

| File | Action | Description |
|------|--------|-------------|
| `src/components/tools/LineTool.tsx` | Create | Line drawing (Draft Mode) |
| `src/components/tools/RectangleTool.tsx` | Create | Rectangle tool |
| `src/components/tools/CircleTool.tsx` | Create | Circle tool |
| `src/components/tools/SelectTool.tsx` | Create | Selection and node editing (Edit Session) |
| `src/components/ImportDialog.tsx` | Create | SVG/bitmap import |
| `src/utils/svgImport.ts` | Create | SVG parsing utilities |

---

## Open Questions

1. Should custom edge paths support curves (bezier) or only polylines?
2. How to handle cutouts that would make panel structurally unsound?
3. Should there be preset shape libraries (common handle shapes, vent patterns)?
4. Edge path coordinate system - see [analysis](edge-and-path-editing-analysis.md#3-edge-path-point-coordinate-system)
