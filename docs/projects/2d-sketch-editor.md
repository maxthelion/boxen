# Project: 2D Sketch Editor

**Created:** 2026-02-02
**Status:** Active

## Overview
Implement the 2D sketch view editor and related enhanced editing features for Boxen. This project was reorganized to split a large combined plan into four focused areas.

## Phases

### Phase 1: 2D Sketch Editor
**Status:** Complete

The core 2D panel editing view with drawing tools and corner finishing.

Goals:
- [x] 2D Sketch View Editor
- [x] Joint Line Visualization
- [x] Editable Areas & Drawing Tools
- [x] Boolean operations (add/subtract shapes)
- [x] Mirror mode for symmetrical editing
- [x] Corner Finishing (2D tool UI)

Plans:
- [2d-sketch-editor-plan.md](../2d-sketch-editor-plan.md) - complete

Issues:
- Issue 001: Chamfer mirroring may have residual bugs

### Phase 2: Subdivision Enhancements
**Status:** Complete

Improvements to the subdivision system.

Goals:
- [x] Two-Plane Subdivision (select 2 panels to subdivide between)
- [x] Percentage-Based Subdivisions (scale with dimensions)

Plans:
- [subdivision-enhancements-plan.md](../subdivision-enhancements-plan.md) - complete
- [subdivide-edit-mode-plan.md](../subdivide-edit-mode-plan.md) - complete

Issues:
- (none)

### Phase 3: Panel Operations
**Status:** In Progress

3D operations for modifying panel geometry.

Goals:
- [x] Assembly Feet
- [x] Panel Push/Pull
- [x] Inset/Outset (Edge Extensions)
- [x] Corner Finishing (geometry)
- [ ] Assembly/Panel Splitting
- [ ] 3D Edge/Corner Selection
- [ ] Axis-Based Section Ownership Model

Plans:
- [panel-operations-plan.md](../panel-operations-plan.md) - in-progress
- [inset-outset-tool-plan.md](../inset-outset-tool-plan.md) - complete
- [corner-extension-rule-plan.md](../corner-extension-rule-plan.md) - complete
- [panel-corner-fillet-plan.md](../panel-corner-fillet-plan.md) - complete
- [second-operations-plan.md](../second-operations-plan.md) - complete

Issues:
- (none yet)

### Phase 4: User Experience
**Status:** Active (Next Up)

App-level UX improvements.

Goals:
- [x] Camera behavior fix (don't jump on resize)
- [ ] Blank Slate / First-Run Experience
- [ ] Collapsible sidebar sections
- [ ] Panel toggle buttons in 3D view
- [ ] Axis selection improvements
- [ ] Project Templates

Plans:
- [user-experience-plan.md](../user-experience-plan.md) - in-progress

Issues:
- (none yet)

## Notes

This project was reorganized on 2026-02-02 to split the original `2d-sketch-plan.md` (which had grown to 13 phases covering unrelated features) into four focused plan documents:

1. **2d-sketch-editor-plan.md** - Actual 2D view features
2. **subdivision-enhancements-plan.md** - Subdivision system improvements
3. **panel-operations-plan.md** - 3D panel geometry operations
4. **user-experience-plan.md** - App-level UX

The original plan is preserved as `2d-sketch-plan.md` (archived) for reference.

### Current Focus

**Phase 4: User Experience** - specifically the "Blank Slate / First-Run Experience" which includes:
- Moving axis selection to top of sidebar with friendly names
- Adding floating panel toggle buttons in 3D view
- Implementing collapsible sidebar sections
- Conditional feet option (only when axis=Y)

### Related Supporting Plans (completed)

- `modification-pattern-plan.md` - Operation system architecture
- `test-organization-plan.md` - Test file organization
- `uuid-migration-plan.md` - ID system migration
- `assembly-creation-operation-plan.md` - Assembly creation workflow
