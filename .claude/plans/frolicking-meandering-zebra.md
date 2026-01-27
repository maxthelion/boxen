# Unified Preview Engine + Operation Registry

## Overview

Refactor the preview system to be engine-first and implement a centralized operation registry. This eliminates the dual code paths (store-based preview vs engine rendering) and establishes a consistent pattern for all UI operations.

**Key Insight**: Normal rendering and preview rendering should use the same engine classes. The only difference is which serialized snapshot is handed to React.

---

## Current Architecture Problems

1. **Dual preview code paths**: Store generates preview panels via `generatePanelCollection()`, engine generates normal panels
2. **Store bloat**: ~600 lines of preview actions (`startPreview`, `updatePreviewXxx`, `commitPreview`, etc.)
3. **Redundant state**: `panelCollection`, `panelsDirty`, `previewPanelCollection` all in store
4. **Inconsistent operation patterns**: Push/pull, subdivision, toggle-face all work differently

---

## Target Architecture

```
Engine
├── _scene: SceneNode           (committed state)
└── _previewScene: SceneNode    (preview state, clone of scene)

getSnapshot() returns: previewScene ?? scene

Store
├── operation: OperationState   (active operation, phase, params)
└── selection state             (what's selected)

Components
└── useEnginePanels() → automatically gets preview if active
```

---

## Implementation Phases

### Phase 1: Engine Preview Support

**Files:**
- `src/engine/Engine.ts`
- `src/engine/nodes/BaseNode.ts` (add abstract `clone()`)
- `src/engine/nodes/SceneNode.ts`
- `src/engine/nodes/AssemblyNode.ts`
- `src/engine/nodes/VoidNode.ts`
- `src/engine/nodes/SubAssemblyNode.ts`
- `src/engine/engineInstance.ts`

**Changes:**

```typescript
// Engine.ts
class Engine {
  private _scene: SceneNode;
  private _previewScene: SceneNode | null = null;

  startPreview(): void {
    this._previewScene = this._scene.clone();
    this.invalidateNodeMap();
  }

  commitPreview(): void {
    if (this._previewScene) {
      this._scene = this._previewScene;
      this._previewScene = null;
      this.invalidateNodeMap();
    }
  }

  discardPreview(): void {
    this._previewScene = null;
    this.invalidateNodeMap();
  }

  hasPreview(): boolean {
    return this._previewScene !== null;
  }

  dispatch(action: EngineAction, options?: { preview?: boolean }): boolean {
    const targetScene = options?.preview && this._previewScene
      ? this._previewScene
      : this._scene;
    // ... dispatch to correct scene
  }

  getSnapshot(): SceneSnapshot {
    const scene = this._previewScene ?? this._scene;
    // ... rest unchanged
  }
}
```

**Node cloning**: Implement `clone()` on each node class. Deep clone is simpler and scene tree is small.

### Phase 2: Store Cleanup

**Files:**
- `src/types.ts`
- `src/store/useBoxStore.ts`

**Remove from BoxState:**
- `previewState: PreviewState | null`
- `previewPanelCollection: PanelCollection | null`
- `panelCollection: PanelCollection | null` (already in progress)
- `panelsDirty: boolean` (already in progress)

**Remove from BoxActions:**
- `startPreview`, `updatePreviewFaceOffset`, `updatePreviewSubdivision`, `updatePreviewSubAssembly`
- `commitPreview`, `cancelPreview`
- `clearPanels`, `updatePanelPath`, `addPanelHole`, `removePanelHole`, `addAugmentation`, `removeAugmentation`

**Remove from store implementation:**
- All preview action implementations (~600 lines)
- All `panelsDirty: true` references (~27 occurrences)
- `generatePanels` return of `panelCollection`

### Phase 3: Operation Registry

**New files:**
- `src/operations/types.ts`
- `src/operations/registry.ts`
- `src/operations/validation.ts`
- `src/operations/index.ts`

**Operation types:**
```typescript
type OperationType = 'parameter' | 'immediate' | 'view';

interface OperationDefinition {
  id: OperationId;
  name: string;
  type: OperationType;
  selectionType: 'void' | 'panel' | 'corner' | 'assembly' | 'none';
  minSelection: number;
  maxSelection: number;
  selectionFilter?: (item: SelectableItem) => boolean;
  palette?: ComponentType<PaletteProps>;
  availableIn: ('2d' | '3d')[];
  canApply?: (params: Record<string, unknown>) => { valid: boolean; reason?: string };
}
```

**Operations to define:**
| Operation | Type | Selection |
|-----------|------|-----------|
| push-pull | parameter | 1 face panel |
| subdivide | parameter | 1 leaf void |
| subdivide-two-panel | parameter | 2 parallel panels |
| create-sub-assembly | parameter | 1 leaf void |
| toggle-face | immediate | 1 face panel |
| remove-subdivision | immediate | 1 non-root void |
| remove-sub-assembly | immediate | 1 void with sub-asm |
| edit-in-2d | view | 1 panel |
| chamfer-fillet | parameter | 1+ corners |

### Phase 4: Store Operation State

**Add to BoxState:**
```typescript
interface OperationState {
  activeOperation: OperationId | null;
  operationPhase: 'idle' | 'awaiting-selection' | 'active';
  operationParams: Record<string, unknown>;
}
```

**Add to BoxActions:**
```typescript
startOperation: (operationId: OperationId) => void;
updateOperationParams: (params: Record<string, unknown>) => void;
applyOperation: () => void;
cancelOperation: () => void;
```

**Implementation:**
- `startOperation`: Check selection, call `engine.startPreview()`, set phase
- `updateOperationParams`: Update params, dispatch preview changes to engine
- `applyOperation`: Call `engine.commitPreview()`, reset operation state
- `cancelOperation`: Call `engine.discardPreview()`, reset operation state

### Phase 5: Migrate Existing Operations

**SubdivisionControls.tsx:**
- Replace `setSubdivisionPreview` with `startOperation('subdivide')`
- Replace direct store updates with `updateOperationParams({ axis, count, positions })`
- Replace `applySubdivision` with `applyOperation()`
- Use `useEnginePanels()` (no more `previewPanelCollection` fallback)

**Viewport3D.tsx (push-pull):**
- Replace `startPreview('push-pull')` with `startOperation('push-pull')`
- Replace `updatePreviewFaceOffset` with `updateOperationParams({ offset, mode })`
- Use `applyOperation()` and `cancelOperation()`

**EditorToolbar.tsx:**
- Use operation registry for tool definitions
- Dynamic enable/disable based on `meetsSelectionRequirements()`
- Call `startOperation(id)` on tool click

### Phase 6: Component Updates

**Box3D.tsx:**
```typescript
// Before
const config = previewState?.config ?? mainConfig;
const panelCollection = previewPanelCollection ?? mainPanelCollection;

// After
const config = useEngineConfig();
const panelCollection = useEnginePanels();
// Engine handles preview automatically
```

**Viewport3D.tsx:**
- Add visual feedback for `operationPhase === 'awaiting-selection'`
- Highlight valid targets based on active operation's `selectionFilter`

---

## State Machine

```
┌─────────────────────────────────────────────────────────────────┐
│                          IDLE                                    │
│  - No active operation                                          │
│  - Engine: _previewScene = null                                 │
│  - Store: operation.activeOperation = null                      │
└─────────────────────────────┬───────────────────────────────────┘
                              │ startOperation(id)
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
┌───────────────────────┐     ┌─────────────────────────────────┐
│  AWAITING_SELECTION   │     │            ACTIVE               │
│  (no valid target)    │     │  (has valid selection)          │
│                       │     │                                 │
│  - Operation active   │     │  - Engine: _previewScene exists │
│  - Prompt for target  │     │  - Palette shown (if parameter) │
│  - No preview yet     │     │  - Preview renders              │
└───────────┬───────────┘     └─────────────────┬───────────────┘
            │                                   │
            │ valid selection                   │
            └─────────────┬─────────────────────┘
                          │
           ┌──────────────┼──────────────┐
           │              │              │
           ▼              ▼              ▼
      ┌────────┐    ┌─────────┐    ┌──────────┐
      │ APPLY  │    │ CANCEL  │    │ SWITCH   │
      │        │    │         │    │ TOOL     │
      └────┬───┘    └────┬────┘    └────┬─────┘
           │             │              │
           ▼             ▼              ▼
      commitPreview  discardPreview  discardPreview
           │             │              │
           └─────────────┴──────────────┘
                         │
                         ▼
                  Return to IDLE
```

---

## Files Summary

| File | Action | Lines Changed |
|------|--------|---------------|
| `src/engine/Engine.ts` | Add preview methods | +50 |
| `src/engine/nodes/*.ts` | Add clone() methods | +100 |
| `src/engine/engineInstance.ts` | Export preview functions | +20 |
| `src/types.ts` | Add OperationState, remove preview types | +20, -30 |
| `src/store/useBoxStore.ts` | Remove preview, add operation | -600, +100 |
| `src/operations/*.ts` | New operation registry | +200 |
| `src/components/SubdivisionControls.tsx` | Migrate to operation pattern | ~100 |
| `src/components/Viewport3D.tsx` | Migrate push-pull | ~50 |
| `src/components/EditorToolbar.tsx` | Use operation registry | ~50 |
| `src/components/Box3D.tsx` | Remove preview fallback | -20 |

**Net change**: ~-300 lines (removing duplication)

---

## Verification

1. **Basic rendering**: Box renders correctly without errors
2. **Subdivision preview**:
   - Select void → activate subdivide tool → slider updates preview in real-time
   - Apply creates subdivision, Cancel restores original
3. **Push-pull preview**:
   - Select face → activate push-pull → drag updates preview
   - Apply commits offset, Cancel restores
4. **Toggle face**: Immediate execution, no preview phase
5. **SVG export**: Works with committed state, not preview
6. **Tests**: Run `npm run test:run` - all pass

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Clone method | Deep clone | Simple, scene tree is small, avoids copy-on-write complexity |
| Param storage | Store, not engine | Params are UI state (slider values), engine owns model state |
| Operation registration | Static registry | Simple to start, can add dynamic registration later |
| Phase 2 before 3 | Cleanup before registry | Reduces confusion, establishes clean foundation |
