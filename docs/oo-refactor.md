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

### ✅ Phase 6: Void Tree Migration (Complete)
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

**Void ID Mismatch Resolved:**
Previously, store void IDs (random) didn't match engine IDs ("root-void", "node-N").
This caused engine dispatch to fail when looking up voids by store ID.

**Solution: Engine-First IDs**
- Changed engine root void ID from `'root-void'` to `'root'` (matches store)
- `applySubdivision` now dispatches `ADD_SUBDIVISIONS` to engine
- `removeVoid` now dispatches `REMOVE_SUBDIVISION` to engine
- After engine operations, store reads back void tree via `getEngineVoidTree()`
- Store's void IDs now come from engine (e.g., `node-1`, `node-2`)

**Flow for void operations:**
1. Sync current store state to engine (`syncStoreToEngine`)
2. Dispatch void action to engine (`ADD_SUBDIVISIONS` / `REMOVE_SUBDIVISION`)
3. Read back void tree from engine (`getEngineVoidTree`)
4. Store updates its `rootVoid` with engine's tree (inherits engine IDs)

### ✅ Phase 7: Engine as Source of Truth (Complete)
Store now routes operations through engine and reads back results.

**Completed:**
- ✅ Void operations dispatch through engine (`ADD_SUBDIVISIONS`, `REMOVE_SUBDIVISION`)
- ✅ Store reads back void tree from engine after void operations
- ✅ Engine generates void IDs (store inherits them)
- ✅ Face operations dispatch through engine (`TOGGLE_FACE`)
- ✅ Store reads back faces from engine after toggleFace
- ✅ Config/material/assembly operations dispatch through engine
- ✅ `ensureEngineInitialized()` ensures engine is ready before all dispatches
- ✅ Helper functions: `getEngineVoidTree()`, `getEngineConfig()`, `getEngineFaces()`
- ✅ `dispatchToEngine()` returns `DispatchResult` with state snapshot
- ✅ `getEngineSnapshot()` provides unified state reading
- ✅ Fast O(1) node lookup via lazy-rebuilt `Map<id, BaseNode>`
- ✅ Node map invalidation on tree structure changes

**Current Pattern:**
```
Store action → ensureEngineInitialized() → dispatchToEngine() → use returned snapshot
```

**Key Functions:**
- `dispatchToEngine(action)` → `{ success, snapshot: { config, faces, rootVoid } }`
- `getEngineSnapshot()` → `{ config, faces, rootVoid }` (for reading without dispatch)
- `Engine.findById(id)` → O(1) lookup via internal Map

---

## Remaining Work

### Phase 8: Panel Generation in Engine (In Progress)
Move panel generation logic from `panelGenerator.ts` into engine.

**Completed:**
- ✅ `EdgeConfig` extended with `gender: JointGender | null` and `axis: Axis | null`
- ✅ `BasePanel.getFingerData()` abstract method added
- ✅ `BasePanel.computeOutline()` updated to use `generateFingerJointPathV2`
- ✅ `FacePanelNode.computeEdgeConfigs()` includes gender (via `getEdgeGender`)
- ✅ `FacePanelNode.getFingerData()` returns assembly's finger data
- ✅ `FacePanelNode.computeEdgeAxisPosition()` computes axis positions
- ✅ `DividerPanelNode.computeEdgeConfigs()` includes gender (always male)
- ✅ `DividerPanelNode.getFingerData()` returns parent assembly's finger data
- ✅ `DividerPanelNode.getEdgeAxisForPosition()` maps edges to world axes
- ✅ `DividerPanelNode.computeEdgeAxisPosition()` computes axis positions for finger alignment
- ✅ Engine-to-PanelPath converter (`panelSnapshotToPanelPath()`)
- ✅ `Engine.generatePanelsFromNodes()` method for engine-first panel generation
- ✅ Edge extensions stored at assembly level (`_panelEdgeExtensions`)
- ✅ `SET_EDGE_EXTENSION` action implemented in Engine.dispatch()
- ✅ Divider panels generated from void tree (`collectDividerPanels()`)
- ✅ Store switched to use `Engine.generatePanelsFromNodes()` by default
- ✅ `syncStoreToEngine()` now syncs edge extensions from existing panels
- ✅ `setEdgeExtension` action dispatches to engine
- ✅ Removed `panelBridge.ts` dependency on `panelGenerator.ts`
- ✅ Removed unused bridge functions (`generatePanelsWithVoid`, `generatePanelsForAssembly`)

**Current State:**
- **Engine-first panel generation is now the default**
- Store's `generatePanels()` calls `syncStoreToEngine()` with void tree + edge extensions
- Store's `setEdgeExtension()` dispatches `SET_EDGE_EXTENSION` to engine
- Engine can generate face panels and divider panels with finger joints
- Edge extensions are preserved across panel regeneration
- `panelBridge.ts` now only provides type conversion (no `panelGenerator.ts` dependency)
- All 160 tests pass

**Verified:**
- ✅ Engine's `computeOutline()` produces output matching `panelGenerator.ts`
  - First 5 points identical
  - Engine: 20 points, Generator: 21 points (minor difference in closing)
- ✅ Divider panels have proper finger joints (60 points with larger box)
- ✅ Edge extensions work via dispatch and persist
- ✅ Tests in `src/engine/nodes/BasePanel.test.ts`

**Remaining (deferred to Phase 9):**
1. Slot holes (when dividers intersect face panels)
2. Feet-related panels
3. Sub-assembly panels

### Phase 9: Edge Extensions & Augmentations
1. Move edge extension logic into `BasePanel`
2. Move corner chamfer/fillet into panel nodes
3. Panel holes computed from intersecting dividers/sub-assemblies

### Phase 10: React as Pure Renderer
1. Remove `useBoxStore` state, keep only actions
2. React components render from `SceneSnapshot`
3. UI interactions → `engine.dispatch()` → `setSnapshot()`
4. Add `executeCommand()` wrapper to prepare for history recording

### Phase 11: Event Sourcing & Undo/Redo
See full proposal: `docs/event-sourcing-proposal.md`

**Core Concept:** Snapshot-based undo using command history
- Each command stores `beforeSnapshot` for instant undo
- Redo re-dispatches the command's `actions` array
- Periodic checkpoints optimize memory for long histories

**Integration with Operation Pattern (from `modification-pattern-plan.md`):**
| Operation Type | History Behavior |
|----------------|------------------|
| Parameter (Push/Pull, Subdivide) | Record on **Apply** only |
| Immediate (Toggle Face) | Record **immediately** |
| View (Edit in 2D) | **Not recorded** |

**Implementation Steps:**
1. Add `EngineStateSnapshot` type and `getStateSnapshot()` to Engine
2. Implement `restoreFromSnapshot()` in Engine
3. Create `HistoryState` with commands array and checkpoint map
4. Wrap store actions in `executeCommand()` for recording
5. Integrate with unified operation pattern's `applyOperation()`
6. Add undo/redo UI and keyboard shortcuts (⌘Z, ⌘⇧Z)

**Key Types:**
```typescript
interface Command {
  id: string;
  type: CommandType;
  actions: EngineAction[];
  beforeSnapshot: EngineStateSnapshot;
  metadata?: { operationName: string; target?: string };
}

interface HistoryState {
  commands: Command[];
  currentIndex: number;
  checkpoints: Map<number, EngineStateSnapshot>;
}
```

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│                        React UI                              │
│  - Renders SceneSnapshot (plain JSON)                        │
│  - Dispatches via executeCommand()                           │
│  - Never touches class instances                             │
│  - Undo/Redo buttons, keyboard shortcuts (⌘Z, ⌘⇧Z)          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ executeCommand(type, actions)
┌─────────────────────────────────────────────────────────────┐
│                    History Layer                             │
│  - Records commands with beforeSnapshot                      │
│  - undo() → restore snapshot                                 │
│  - redo() → re-dispatch actions                              │
│  - Periodic checkpoints for memory efficiency                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ dispatch(action)
┌─────────────────────────────────────────────────────────────┐
│                        Engine                                │
│  - Owns SceneNode (root of OO tree)                         │
│  - dispatch() mutates nodes, returns snapshot                │
│  - getStateSnapshot() / restoreFromSnapshot()                │
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
| Void IDs | Engine-first | Engine generates IDs (`node-N`), store inherits them |
| Face geometry | Centralized in utils | Single source prevents adjacency map drift |
| Undo strategy | Snapshot-based | Simpler than reverse operations; instant restore |
| Command recording | On Apply only (params) | Preview is ephemeral; only committed changes recorded |

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
