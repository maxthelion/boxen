# Plan Reorganization Proposal

## Current State

The `2d-sketch-plan.md` document has grown to contain 13 phases plus quality-of-life items. Many of these phases are not related to the 2D sketch view and would be better organized as separate plan documents.

## Analysis of 2d-sketch-plan.md Phases

### Core 2D View Features (Keep in 2d-sketch-plan.md)

These phases are directly related to 2D panel editing:

| Phase | Feature | Status | Notes |
|-------|---------|--------|-------|
| 1 | 2D Sketch View Editor | DONE | Core 2D editing canvas |
| 2 | Joint Line Visualization | DONE | Visual distinction in 2D view |
| 5 | Editable Areas | DONE | Safe zones for 2D editing |
| 7 | Corner Finishing | Partial | 2D corner selection and chamfer/fillet |
| 9.2 | Inset/Outset Tool | Pending | Edge extension in 2D |
| 9.3 | Advanced 2D Tools | Pending | Point selection, shape tools, path tool |
| 9.4 | Mirror Tools | Pending | Symmetrical 2D editing |
| 9.5 | Panel Modification Copying | Pending | Copy 2D edits between panels |
| 9.6 | Multi-Panel Editing | Pending | Edit multiple panels in 2D |
| 9.7 | Grid Snapping | Pending | 2D snap-to-grid |
| 9.8 | Axis Ownership Model | Pending | Joint geometry model (supports 9.2) |

### Features to Extract into Separate Plans

#### 1. `subdivision-features.md` - Subdivision System Enhancements

| Phase | Feature | Status |
|-------|---------|--------|
| 3 | Two-Plane Subdivision | DONE |
| 4 | Percentage-Based Subdivisions | DONE |

**Rationale:** These are model-level features that work in 3D view. They don't require the 2D sketch view.

#### 2. `assembly-splitting.md` - Assembly and Panel Splitting

| Phase | Feature | Status |
|-------|---------|--------|
| 8 | Assembly Splitting | Pending |
| 8 | Panel Splitting | Pending |

**Rationale:** This is a major feature with its own complex requirements. Splitting assemblies and panels into multiple pieces for manufacturing is independent of 2D editing.

#### 3. `3d-selection-enhancements.md` - 3D Edge and Corner Selection

| Phase | Feature | Status |
|-------|---------|--------|
| 10 | Edge Selection in 3D | Pending |
| 10 | Corner Selection in 3D | Pending |
| 10 | Tool Integration | Pending |

**Rationale:** This extends 3D interaction, not 2D editing. It's about bringing chamfer/inset tools to 3D view.

#### 4. `push-pull-tool.md` - Panel Push/Pull (Move to completed)

| Phase | Feature | Status |
|-------|---------|--------|
| 11 | Push/Pull Tool | DONE |

**Rationale:** Already complete. Should be moved to `completed_projects/`.

#### 5. `first-run-experience.md` - Blank Slate / Onboarding

| Phase | Feature | Status |
|-------|---------|--------|
| 12 | Axis Selection UI | Pending |
| 12 | Panel Toggle Buttons | Pending |
| 12 | Collapsible Sidebar | Pending |
| 12 | Conditional Feet Option | Pending |

**Rationale:** UX/onboarding improvements are independent of 2D editing functionality.

#### 6. `project-templates.md` - Project Templates

| Phase | Feature | Status |
|-------|---------|--------|
| 13 | Template Storage | Pending |
| 13 | Variable System | Pending |
| 13 | Template Browser | Pending |

**Rationale:** Project management feature, completely separate from editing.

#### 7. Already Separate: `assembly-feet.md`

| Phase | Feature | Status |
|-------|---------|--------|
| 6 | Assembly Feet | DONE |

**Rationale:** Already complete. Could move to `completed_projects/`.

### Summary of Recommended Changes

1. **Keep in `2d-sketch-plan.md`:** Phases 1, 2, 5, 7, 9.2-9.8
2. **Move to `completed_projects/`:**
   - Phase 11 (Push/Pull) - already done
   - Phase 6 (Feet) - already done
   - Phases 3-4 (Subdivisions) - already done
3. **Create new plan files:**
   - `assembly-splitting.md` - Phase 8
   - `3d-selection-enhancements.md` - Phase 10
   - `first-run-experience.md` - Phase 12
   - `project-templates.md` - Phase 13

## Proposed Directory Structure

```
docs/
├── 2d-sketch-plan.md              # Focused on 2D editing features
├── assembly-splitting.md          # Phase 8
├── 3d-selection-enhancements.md   # Phase 10
├── first-run-experience.md        # Phase 12
├── project-templates.md           # Phase 13
├── store-state-migration.md       # Engine/store architecture (new)
├── event-sourcing-proposal.md     # Undo/redo system
├── completed_projects/
│   ├── oo-refactor.md
│   ├── refactoring-candidates.md
│   ├── subdivision-features.md    # Phases 3-4 (done)
│   ├── assembly-feet.md           # Phase 6 (done)
│   └── push-pull-tool.md          # Phase 11 (done)
```

## Next Steps

1. [ ] Extract Phase 8 into `assembly-splitting.md`
2. [ ] Extract Phase 10 into `3d-selection-enhancements.md`
3. [ ] Extract Phase 12 into `first-run-experience.md`
4. [ ] Extract Phase 13 into `project-templates.md`
5. [ ] Move completed phases (3-4, 6, 11) to `completed_projects/`
6. [ ] Clean up `2d-sketch-plan.md` to focus on 2D editing

## Quality of Life Items

The QoL section in `2d-sketch-plan.md` contains general improvements not specific to 2D view:

- Camera behavior fix (DONE)
- Remember sidebar state
- Keyboard shortcuts overlay
- Undo/redo (see `event-sourcing-proposal.md`)
- Copy/paste panel modifications
- Better hover feedback

These could be tracked in a separate `quality-of-life.md` or left as a section in the main plan.
