# Duplicate Code Paths Audit Plan

## Problem Statement

The codebase has multiple code paths that create the same entities (panels, assemblies, sub-assemblies). This leads to:
- Bugs where one path is fixed but another isn't (e.g., X-axis divider rotation)
- Inconsistent behavior between preview and applied states
- Difficult maintenance as changes must be made in multiple places

## Scope

Audit and consolidate duplicate paths for:
1. **Panel generation** (face panels, divider panels)
2. **Panel rendering** (3D visualization)
3. **Preview systems** (subdivision, sub-assembly, push/pull)
4. **Sub-assembly creation**

---

## Phase 1: Inventory Existing Paths

### 1.1 Panel Generation

| Entity | Path | Location | Notes |
|--------|------|----------|-------|
| Face panels | `generateFacePanel()` | `panelGenerator.ts` | Primary path |
| Face panels | `FaceWithFingers` component | `FaceWithFingers.tsx` | Old rendering, has own geometry calc |
| Divider panels | `generateDividerPanel()` | `panelGenerator.ts` | Primary path |
| Divider panels | `DividerPanel` component | `DividerPanel.tsx` | Old rendering, has own finger joint logic |

**Action**: Search for all places that calculate finger joints, panel dimensions, or edge types.

### 1.2 Panel Rendering

| Renderer | Location | Used When | Notes |
|----------|----------|-----------|-------|
| `PanelCollectionRenderer` | `PanelPathRenderer.tsx` | `USE_STORED_PATHS = true` | Uses `panelCollection` |
| `FaceWithFingers` | `FaceWithFingers.tsx` | `USE_STORED_PATHS = false` | Computes own geometry |
| `DividerPanel` | `DividerPanel.tsx` | `USE_STORED_PATHS = false` | Computes own geometry |
| Preview mesh | `Box3D.tsx:914+` | `subdivisionPreview` active | Simple green box, no fingers |

**Action**: Trace `USE_STORED_PATHS` usage and identify any conditional rendering.

### 1.3 Preview Systems

| Preview Type | State Variables | Generation Path | Notes |
|--------------|-----------------|-----------------|-------|
| Subdivision | `subdivisionPreview`, `previewState`, `previewPanelCollection` | `updatePreviewSubdivision()` → `generatePanelCollection()` | |
| Sub-assembly | `subAssemblyPreview`, `previewState`, `previewPanelCollection` | `updatePreviewSubAssembly()` → `generatePanelCollection()` | |
| Push/Pull | `previewState`, `previewPanelCollection` | `updatePreviewFaceOffset()` → `generatePanelCollection()` | |

**Action**: Map all preview state variables and their lifecycle.

### 1.4 Sub-Assembly Creation

| Operation | Location | Notes |
|-----------|----------|-------|
| Create sub-assembly | `createSubAssembly()` in store | Creates faces, rootVoid, assembly config |
| Sub-assembly panel gen | `generatePanelCollection()` | Recursively generates sub-assembly panels |
| Sub-assembly rendering | `SubAssembly3D` component | May have own logic? |

**Action**: Check if `SubAssembly3D` has independent geometry calculation.

---

## Phase 2: Detailed Analysis

### 2.1 Search Patterns

```bash
# Find finger joint generation
grep -r "generateFingerJoint" src/
grep -r "fingerWidth\|fingerGap" src/components/

# Find edge type determination
grep -r "hasTabs\|meetsFace" src/
grep -r "isFaceSolid\|\.solid" src/components/

# Find panel dimension calculation
grep -r "panelWidth\|panelHeight\|sizeW\|sizeH" src/

# Find rotation/position calculations
grep -r "panelRotation\|panelPosition" src/
grep -r "Math\.PI" src/components/

# Find preview state usage
grep -r "previewState\|previewPanelCollection\|subdivisionPreview" src/
```

### 2.2 Component Analysis Checklist

For each component that renders panels:
- [ ] Does it compute its own geometry or use `panelCollection`?
- [ ] Does it have hardcoded rotations/positions?
- [ ] Does it check face solidity independently?
- [ ] Does it generate finger joints independently?
- [ ] Is it used in preview mode?

---

## Phase 3: Consolidation Strategy

### 3.1 Short-term: Remove Old Rendering Path

Since `USE_STORED_PATHS = true`, the old components (`FaceWithFingers`, `DividerPanel`) should not be rendering. Options:

1. **Verify and delete**: Confirm they're not used, then remove
2. **Feature flag cleanup**: Remove `USE_STORED_PATHS` flag and old code paths
3. **Keep as fallback**: Document why both exist (if there's a reason)

### 3.2 Medium-term: Unify Preview Systems

Current state:
- Multiple preview state variables (`subdivisionPreview`, `previewState`, `previewPanelCollection`)
- Some overlap in functionality

Target state:
- Single preview system that handles all preview types
- Preview always uses `generatePanelCollection()` for consistency
- Clear lifecycle: start → update → commit/cancel

### 3.3 Long-term: Single Source of Truth

Principle: **All panel data comes from `panelCollection`**

- Generation: Only `generatePanelCollection()` creates panels
- Rendering: Only `PanelCollectionRenderer` renders panels
- Preview: Uses same generation, stored in `previewPanelCollection`
- Export: Uses same `panelCollection` data

---

## Phase 4: Implementation Tasks

### Task List

1. [ ] **Audit `FaceWithFingers`**: Document what it does, verify it's not used
2. [ ] **Audit `DividerPanel`**: Document what it does, verify it's not used
3. [ ] **Remove `USE_STORED_PATHS`**: If old paths confirmed unused, remove flag and dead code
4. [ ] **Audit `SubAssembly3D`**: Check for independent geometry calculation
5. [ ] **Map preview state lifecycle**: Document when each preview variable is set/cleared
6. [ ] **Consolidate preview systems**: Unify into single preview mechanism
7. [ ] **Add tests**: Ensure preview and applied states produce identical results

### Verification Steps

For each consolidation:
1. Write test that compares old vs new path output
2. Verify visual output matches
3. Check SVG export produces correct geometry
4. Test preview → apply → undo cycle

---

## Files to Examine

Priority order:

1. `src/components/Box3D.tsx` - Main rendering, uses USE_STORED_PATHS
2. `src/components/DividerPanel.tsx` - Old divider rendering
3. `src/components/FaceWithFingers.tsx` - Old face rendering
4. `src/components/SubAssembly3D.tsx` - Sub-assembly rendering
5. `src/components/PanelPathRenderer.tsx` - New panel rendering
6. `src/store/useBoxStore.ts` - State management, preview systems
7. `src/utils/panelGenerator.ts` - Panel generation

---

## Success Criteria

- [ ] Single code path for generating each entity type
- [ ] Preview and applied states use same generation logic
- [ ] No duplicate finger joint calculations
- [ ] No duplicate edge type determinations
- [ ] No duplicate rotation/position calculations
- [ ] All dead code removed
- [ ] Tests verify consistency between paths
