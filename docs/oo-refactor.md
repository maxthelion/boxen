# OO Model Engine Refactor

## Overview

Refactor the application into three clear layers:

1. **OO Model Engine** (authoritative state)
2. **Serializable Snapshot Layer** (for React)
3. **Action / Command Layer** (UI → engine updates)

The goal: React never holds or mutates class instances. React renders plain serialized data derived from an object-oriented hierarchical model.

---

## Current Status

### ✅ Phase 1: Engine Foundation (Complete)
- Created node class hierarchy:
  - `BaseNode` - abstract base with id, parent/child, dirty tracking
  - `BaseAssembly` - shared assembly logic (dimensions, material, faces)
  - `AssemblyNode` - main assembly
  - `SubAssemblyNode` - nested assembly in void
  - `VoidNode` - interior space, can subdivide
  - `BasePanel` - shared panel logic (outline, edges, transform)
  - `FacePanelNode` - face panel (6 faces)
  - `DividerPanelNode` - subdivision divider
  - `SceneNode` - root of tree

### ✅ Phase 2: Store Integration (Complete)
- Created `useEngine` hook for React integration
- Created `engineInstance.ts` singleton to avoid circular deps
- Added engine debug panel in App.tsx
- `syncStoreToEngine()` syncs store config/faces to engine

### ✅ Phase 3: Panel Generation Bridge (Complete)
- Created `panelBridge.ts` to convert engine types ↔ store types
- Store's `generatePanels()` now calls `engine.generatePanels(rootVoid)`
- Engine provides config/faces, store provides void tree
- Actions route through `engine.dispatch()`:
  - `SET_DIMENSIONS`, `SET_MATERIAL`
  - `TOGGLE_FACE`, `SET_FACE_SOLID`
  - `SET_ASSEMBLY_AXIS`, `SET_LID_CONFIG`, `SET_FEET_CONFIG`

### ✅ Phase 4: Finger Joint System (Complete)
- Added `AxisFingerPoints` and `AssemblyFingerData` types
- `BaseAssembly.getFingerData()` computes finger points per axis
- Finger points are assembly-level, panels derive from them
- `JointGender` type for male/female tab direction

### ✅ Phase 5: Alignment Validation System (Complete)
- **Panel Edge Anchors**: Each panel edge has anchor at center
  - `EdgeAnchor` with local 2D and world 3D coordinates
  - `BasePanel.getEdgeAnchors()` computes anchors for mating edges
  - `transformLocalToWorld()` converts local → world space

- **Joint Registry**: Assembly tracks all panel-to-panel joints
  - `JointConstraint` defines expected anchor alignment
  - `JointAlignmentError` records misaligned anchors
  - `BaseAssembly.getJoints()` / `getJointAlignmentErrors()`
  - Validation enforced - errors logged to console

- **Void Anchors**: Each void has center anchor point
  - `VoidAnchor` with local and world coordinates
  - `VoidNode.getAnchor()` computes world position
  - `VoidContentConstraint` / `VoidAlignmentError` for parent-child

- **Debug Utility**: `alignmentDebug.ts`
  - Clipboard debug output pattern (per CLAUDE.md)
  - `formatAlignmentDebugLog()` for human-readable output
  - `ALIGNMENT_TOLERANCE` = 0.001mm

### ✅ Phase 5.5: Code Consolidation (Complete)
Consolidated duplicated code between engine and legacy implementation:

- **Face Geometry** (`utils/faceGeometry.ts`)
  - Single source of truth for face-edge adjacency relationships
  - `FACE_EDGE_ADJACENCY` - canonical map of which faces each edge meets
  - `MATING_EDGE_POSITION` - which edge of adjacent face connects back
  - `DIVIDER_EDGE_ADJACENCY` - face adjacency for divider panels
  - `JOINT_AXIS` - which world axis each joint runs along
  - Helper functions: `getAdjacentFace()`, `getMatingEdge()`, `getJointAxis()`

- **Files Updated to Use faceGeometry**
  - `FacePanelNode.ts` - removed local `FACE_EDGE_ADJACENCY`
  - `DividerPanelNode.ts` - removed local `DIVIDER_EDGE_ADJACENCY`
  - `BaseAssembly.ts` - removed inline adjacency maps from `getMatingFaceId` etc.
  - `panelGenerator.ts` - removed `getFaceEdges()`, `getAdjacentEdgePosition()`
  - `genderRules.ts` - now re-exports `getAdjacentFace` from faceGeometry

- **Lines of Duplicate Code Removed**: ~200 lines across 5 files

### ⚠️ Phase 6: Void Tree Migration (In Progress)
- Removed duplicate void tree functions from `useBoxStore.ts`
- Now uses `VoidTree` namespace from `utils/voidTree.ts`

**VoidNode Enhancements Complete:**
- `subdivideMultiple(axis, positions, mt)` - creates N+1 children for N splits
- `updateChildBounds()` - recalculates child bounds from split percentages
- `getSubAssembly()`, `getVoidChildren()` - child accessors
- Static tree traversal: `find()`, `findParent()`, `getSubtreeIds()`, `getAncestorIds()`

**Engine Actions Added:**
- `ADD_SUBDIVISIONS` - multi-position subdivision dispatch
- `ADD_SUBDIVISION`, `REMOVE_SUBDIVISION` - already existed

**Void Conversion Utilities Complete:**
- `voidNodeToVoid()` - converts engine VoidNode to store Void format
- `syncVoidNodeFromStoreVoid()` - syncs engine VoidNode tree from store Void tree
- `syncStoreToEngine()` now accepts optional `rootVoid` parameter
- `getEngineVoidTree()` - reads engine void tree as store Void

**Blocker: Void ID Mismatch**
Store void IDs (generated randomly) don't match engine void IDs ("root-void", "node-N").
When dispatching void operations to engine, the engine can't find voids by store ID.

**Options to Resolve:**
1. **ID Mapping**: Maintain a Map<storeId, engineId> during sync
2. **ID Preservation**: Create VoidNode with store's ID during sync
3. **Position-based Lookup**: Find engine void by tree position instead of ID
4. **Engine-first IDs**: Generate void IDs from engine, propagate to store

**Current State:**
Store remains source of truth for void tree. Void operations use VoidTree utilities.
Engine syncs from store for panel generation but doesn't own void mutations.

**Remaining:**
- Resolve void ID mismatch (one of the options above)
- Route store void operations through engine dispatch
- Make store derive void state from engine snapshot

---

## Remaining Work

### Phase 7: Engine as Source of Truth
Currently the store is still source of truth, with engine synced from it.
To complete the refactor:

1. **Move void tree into engine**
   - `AssemblyNode` owns root void and all subdivisions
   - Store derives void state from engine snapshot
   - `ADD_SUBDIVISION` / `REMOVE_SUBDIVISION` actions fully in engine

2. **Dispatch returns snapshot**
   - Change `dispatch(action): boolean` → `dispatch(action): SceneSnapshot`
   - Store calls `setSnapshot(engine.dispatch(action))`

3. **Remove store-side state duplication**
   - Store should not hold `config`, `faces`, `rootVoid` separately
   - All state derived from `engine.getSnapshot()`

4. **Fast node lookup**
   - Add `Map<id, BaseNode>` to Engine
   - `findById()` uses map instead of tree traversal

### Phase 8: Panel Generation in Engine
Move panel generation logic from `panelGenerator.ts` into engine:

1. `FacePanelNode.computeOutline()` generates finger joints
2. `DividerPanelNode.computeOutline()` generates finger joints
3. `BaseAssembly.computePanels()` generates all panels
4. Remove `panelBridge.ts` and `generatePanelCollection()`

### Phase 9: Edge Extensions & Augmentations
1. Move edge extension logic into `BasePanel`
2. Move corner chamfer/fillet into panel nodes
3. Panel holes computed from intersecting dividers/sub-assemblies

### Phase 10: React as Pure Renderer
1. Remove `useBoxStore` state, keep only actions
2. React components render from `SceneSnapshot`
3. UI interactions → `engine.dispatch()` → `setSnapshot()`
4. Prepare for undo/redo with action history

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│                        React UI                              │
│  - Renders SceneSnapshot (plain JSON)                        │
│  - Dispatches EngineActions                                  │
│  - Never touches class instances                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ dispatch(action)
┌─────────────────────────────────────────────────────────────┐
│                        Engine                                │
│  - Owns SceneNode (root of OO tree)                         │
│  - dispatch() mutates nodes, returns snapshot                │
│  - findById() for fast node lookup                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ serialize()
┌─────────────────────────────────────────────────────────────┐
│                     OO Model Tree                            │
│                                                              │
│  SceneNode                                                   │
│    └── AssemblyNode                                          │
│          ├── props: dimensions, material, faces              │
│          ├── derived: fingerData, joints, panels             │
│          └── VoidNode (root void)                            │
│                ├── VoidNode (subdivision)                    │
│                │     └── SubAssemblyNode                     │
│                └── VoidNode (subdivision)                    │
│                                                              │
│  Each node: serialize() → Snapshot (plain JSON)              │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Finger points | Assembly-level | Ensures all edges on an axis align perfectly |
| Panel anchors | Center of mating edge | Simple, symmetric reference point |
| Joint validation | Enforced (console error) | Catch placement bugs early |
| Void anchors | Center of bounds | Natural reference for parent-child alignment |
| Debug output | Clipboard pattern | Per CLAUDE.md, easy to paste and analyze |
| Void tree | Still in store | Phased migration - engine will own it in Phase 7 |
| Face geometry | Centralized in utils | Single source prevents adjacency map drift |

---

## Files Structure

```
src/engine/
├── Engine.ts              # Main entry point, dispatch()
├── engineInstance.ts      # Singleton for store integration
├── useEngine.ts           # React hook
├── panelBridge.ts         # Temp bridge to panelGenerator
├── alignmentDebug.ts      # Alignment error logging
├── types.ts               # All engine types/snapshots
├── index.ts               # Public exports
└── nodes/
    ├── BaseNode.ts        # Abstract base
    ├── BaseAssembly.ts    # Assembly base (dimensions, joints)
    ├── BasePanel.ts       # Panel base (outline, anchors)
    ├── AssemblyNode.ts    # Main assembly
    ├── SubAssemblyNode.ts # Nested assembly
    ├── VoidNode.ts        # Interior space
    ├── FacePanelNode.ts   # Face panel
    ├── DividerPanelNode.ts# Divider panel
    └── SceneNode.ts       # Root node

src/utils/
├── faceGeometry.ts        # Single source of truth for face-edge adjacency
├── fingerPoints.ts        # Finger joint point calculation
├── genderRules.ts         # Joint gender determination (uses faceGeometry)
├── panelGenerator.ts      # Panel outline generation (uses faceGeometry)
└── voidTree.ts            # Void tree operations (to be migrated to engine)
```

---

## Testing Strategy

1. **Unit tests for node classes**
   - Finger point calculation
   - Anchor computation
   - Joint validation

2. **Integration tests**
   - dispatch() returns correct snapshot
   - Panel anchors align after dimension changes
   - Void anchors match parent expectations

3. **Alignment regression tests**
   - Create box, verify zero alignment errors
   - Add subdivisions, verify joints still align
   - Change dimensions, verify anchors update correctly
