# Event Sourcing Proposal for Undo/Redo

## Overview

This proposal outlines an event sourcing model that integrates with the unified operation pattern (from `modification-pattern-plan.md`) and the OO engine architecture (from `oo-refactor.md`). The goal is to enable undo/redo functionality while maintaining clean separation between the authoritative OO model and the React UI layer.

---

## Design Principles

1. **Commands are the source of truth for history** - Every user action that modifies state is recorded as a command
2. **Engine dispatch is the commit point** - Only actions that reach `engine.dispatch()` are recorded
3. **Preview is ephemeral** - Preview state during parameter operations is not part of history
4. **Undo reconstructs, not reverse-engineers** - Maintain snapshots at key points for fast undo

---

## Integration with Operation Pattern

The modification pattern defines three operation types:

| Type | History Behavior |
|------|------------------|
| **Parameter** (Push/Pull, Subdivide) | Record command only on **Apply** |
| **Immediate** (Toggle Face, Remove Subdivision) | Record command **immediately** |
| **View** (Edit in 2D, Select Assembly) | **Not recorded** (no model change) |

### State Machine Integration

```
IDLE ──────────────────────────────────────────────────────────────────┐
  │                                                                    │
  │ start parameter operation                                          │
  ▼                                                                    │
AWAITING SELECTION ───── start immediate operation ────────────────────┤
  │                              │                                     │
  │ select target                │                                     │
  ▼                              ▼                                     │
OPERATION ACTIVE          EXECUTE IMMEDIATE                            │
  │                              │                                     │
  │ preview updates              │                                     │
  │ (NOT recorded)               │                                     │
  │                              │                                     │
  ├── Apply ──────────────┬──────┴───────── Record Command ────────────┤
  │                       │                                            │
  │                       ▼                                            │
  │               Push to History Stack                                │
  │                                                                    │
  └── Cancel ─────────────────────────────── No Recording ─────────────┘
```

---

## Command Model

### Command Structure

```typescript
interface Command {
  id: string;                    // Unique command ID
  type: CommandType;             // Identifies the command handler
  timestamp: number;             // When command was executed

  // The engine action(s) that implement this command
  actions: EngineAction[];

  // Snapshot before command (for undo)
  beforeSnapshot: EngineStateSnapshot;

  // Optional metadata for UI
  metadata?: {
    operationName: string;       // Human-readable name (e.g., "Push/Pull Front Face")
    target?: string;             // What was modified (e.g., "face-front")
  };
}

type CommandType =
  // 3D Operations
  | 'push-pull'
  | 'subdivide'
  | 'create-sub-assembly'
  | 'toggle-face'
  | 'remove-subdivision'
  | 'remove-sub-assembly'
  | 'purge-void'
  // 2D Operations
  | 'chamfer-fillet'
  | 'inset-edge'
  | 'draw-shape'
  // Property Operations
  | 'set-dimensions'
  | 'set-material'
  | 'set-assembly-axis'
  | 'set-lid-config'
  | 'set-feet-config'
  | 'set-divider-position'
  | 'set-edge-extension';
```

### Mapping Operations to Commands

Each operation from the canonical operations table maps to a command:

| Operation | Command Type | Actions |
|-----------|--------------|---------|
| Push/Pull | `push-pull` | `SET_DIMENSIONS` or `SET_FACE_OFFSET` |
| Subdivide | `subdivide` | `ADD_SUBDIVISIONS` |
| Toggle Face | `toggle-face` | `TOGGLE_FACE` |
| Remove Subdivision | `remove-subdivision` | `REMOVE_SUBDIVISION` |
| Chamfer/Fillet | `chamfer-fillet` | `SET_CORNER_FINISH` |
| Set Dimensions | `set-dimensions` | `SET_DIMENSIONS` |

---

## History Stack

### Structure

```typescript
interface HistoryState {
  // Command history
  commands: Command[];           // All executed commands
  currentIndex: number;          // Position in history (-1 = empty)

  // Performance optimization
  checkpoints: Map<number, EngineStateSnapshot>;  // Periodic full snapshots
  checkpointInterval: number;    // Commands between checkpoints (e.g., 10)

  // Limits
  maxCommands: number;           // Maximum history depth (e.g., 100)
}

interface HistoryActions {
  // Execute and record a command
  execute: (command: Omit<Command, 'id' | 'timestamp' | 'beforeSnapshot'>) => void;

  // Undo/redo
  undo: () => void;
  redo: () => void;

  // Query
  canUndo: () => boolean;
  canRedo: () => boolean;
  getUndoLabel: () => string | null;  // e.g., "Undo Push/Pull"
  getRedoLabel: () => string | null;  // e.g., "Redo Subdivide"
}
```

### Undo Strategy: Snapshot-Based

Rather than computing reverse operations (complex and error-prone), we use snapshots:

1. **On Execute**: Store `beforeSnapshot` with each command
2. **On Undo**: Restore `beforeSnapshot` from the command being undone
3. **On Redo**: Re-dispatch the command's `actions` array

```typescript
// Undo implementation
undo(): void {
  if (!canUndo()) return;

  const command = commands[currentIndex];

  // Restore engine state from before this command
  engine.restoreFromSnapshot(command.beforeSnapshot);

  // Update history position
  currentIndex--;

  // Regenerate panels from restored state
  regeneratePanels();
}

// Redo implementation
redo(): void {
  if (!canRedo()) return;

  currentIndex++;
  const command = commands[currentIndex];

  // Re-execute the command's actions
  for (const action of command.actions) {
    engine.dispatch(action);
  }

  regeneratePanels();
}
```

### Checkpoint Optimization

For long histories, restore from nearest checkpoint then replay:

```typescript
restoreToIndex(targetIndex: number): void {
  // Find nearest checkpoint at or before target
  const checkpointIndex = findNearestCheckpoint(targetIndex);
  const checkpoint = checkpoints.get(checkpointIndex);

  // Restore from checkpoint
  engine.restoreFromSnapshot(checkpoint);

  // Replay commands from checkpoint to target
  for (let i = checkpointIndex + 1; i <= targetIndex; i++) {
    for (const action of commands[i].actions) {
      engine.dispatch(action);
    }
  }
}
```

---

## Engine Integration

### New Engine Methods

```typescript
class Engine {
  // Existing
  dispatch(action: EngineAction): DispatchResult;

  // New for undo/redo
  getStateSnapshot(): EngineStateSnapshot;
  restoreFromSnapshot(snapshot: EngineStateSnapshot): void;
}

interface EngineStateSnapshot {
  // Serialized state sufficient to restore engine
  config: BoxConfig;
  faces: Face[];
  rootVoid: Void;
  panelEdgeExtensions: Record<string, EdgeExtensions>;
  cornerFinishes: Record<string, CornerFinish[]>;
  // ... other state as needed
}
```

### Restore Implementation

```typescript
restoreFromSnapshot(snapshot: EngineStateSnapshot): void {
  // Reset engine to match snapshot
  const assembly = this._scene.primaryAssembly;

  // Restore dimensions and material
  assembly.setDimensions(snapshot.config.width, snapshot.config.height, snapshot.config.depth);
  assembly.setMaterial({
    thickness: snapshot.config.materialThickness,
    fingerWidth: snapshot.config.fingerWidth,
    fingerGap: snapshot.config.fingerGap,
  });

  // Restore faces
  for (const face of snapshot.faces) {
    assembly.setFaceSolid(face.id, face.solid);
  }

  // Restore void tree (complex - may need to rebuild)
  syncVoidNodeFromStoreVoid(assembly.rootVoid, snapshot.rootVoid, snapshot.config.materialThickness);

  // Restore extensions
  for (const [panelId, extensions] of Object.entries(snapshot.panelEdgeExtensions)) {
    assembly.setPanelEdgeExtensions(panelId, extensions);
  }

  // Mark dirty for recomputation
  this._scene.markDirty();
}
```

---

## Store Integration

### History Hook

```typescript
// New store slice for history
interface HistorySlice {
  history: HistoryState;

  // Wrapped execute that records to history
  executeCommand: (
    type: CommandType,
    actions: EngineAction[],
    metadata?: CommandMetadata
  ) => void;

  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

// Usage in store actions
setFaceOffset: (faceId, offset, mode) => {
  const actions: EngineAction[] = mode === 'resize'
    ? [{ type: 'SET_DIMENSIONS', ...calculateNewDimensions(faceId, offset) }]
    : [{ type: 'SET_FACE_OFFSET', faceId, offset }];

  executeCommand('push-pull', actions, {
    operationName: `Push/Pull ${faceId}`,
    target: `face-${faceId}`,
  });
}
```

### Unified Operation Handler

Following the modification pattern, the unified operation handler integrates with history:

```typescript
// From modification-pattern-plan.md OperationActions
interface OperationActions {
  startOperation: (operationId: OperationId) => void;
  updateOperationParams: (params: Record<string, unknown>) => void;
  refineSelection: (targetId: string, additive?: boolean) => void;

  // Modified to integrate with history
  applyOperation: () => void;  // Records command
  cancelOperation: () => void; // No recording
}

// Apply implementation
applyOperation(): void {
  const { activeOperation, previewState, operationMetadata } = get();

  if (!activeOperation || !previewState) return;

  // Build actions from preview state
  const actions = buildActionsFromPreview(activeOperation, previewState);

  // Execute with history recording
  executeCommand(activeOperation, actions, {
    operationName: OPERATIONS[activeOperation].name,
    target: previewState.targetId,
  });

  // Clear operation state
  set({
    activeOperation: null,
    operationPhase: 'idle',
    previewState: null,
  });
}
```

---

## UI Components

### Undo/Redo Buttons

```tsx
const UndoRedoButtons: React.FC = () => {
  const { canUndo, canRedo, undo, redo, getUndoLabel, getRedoLabel } = useBoxStore();

  return (
    <div className="undo-redo-buttons">
      <button
        onClick={undo}
        disabled={!canUndo}
        title={getUndoLabel() || 'Nothing to undo'}
      >
        ⌘Z Undo
      </button>
      <button
        onClick={redo}
        disabled={!canRedo}
        title={getRedoLabel() || 'Nothing to redo'}
      >
        ⌘⇧Z Redo
      </button>
    </div>
  );
};
```

### Keyboard Shortcuts

```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey) {
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        redo();
      }
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [undo, redo]);
```

---

## Implementation Phases

### Phase 1: Core Infrastructure
1. Add `EngineStateSnapshot` type and `getStateSnapshot()` to Engine
2. Implement `restoreFromSnapshot()` in Engine
3. Create `HistoryState` and `HistoryActions` in store
4. Add `executeCommand()` wrapper function

### Phase 2: Migrate Existing Actions
1. Wrap dimension/material changes in `executeCommand()`
2. Wrap face toggle in `executeCommand()`
3. Wrap void operations (subdivide, remove) in `executeCommand()`
4. Wrap edge extensions in `executeCommand()`

### Phase 3: Integrate with Operation Pattern
1. Modify `applyOperation()` to use `executeCommand()`
2. Ensure immediate operations record commands
3. Test undo/redo across all operation types

### Phase 4: UI and Polish
1. Add undo/redo buttons to toolbar
2. Implement keyboard shortcuts
3. Add undo/redo labels (e.g., "Undo Push/Pull Front")
4. Add history visualization (optional)

---

## Considerations

### Command Coalescing

Some operations produce many rapid updates (e.g., dragging a slider). Options:

1. **Debounce recording**: Only record after N ms of inactivity
2. **Explicit commit**: Slider drag creates preview; release commits
3. **Coalesce same-type**: Merge consecutive commands of same type/target

Recommendation: Use explicit commit (aligns with Apply/Cancel pattern).

### Branch History (Future)

Current design uses linear history. For branching:
- Undo then make new change → discard redo stack
- Alternative: Keep branches, allow navigation

### Persistence (Future)

Commands could be persisted for:
- Auto-save recovery
- Collaboration (share command stream)
- Project version history

---

## Open Questions

1. **Snapshot size**: Full snapshots may be large. Profile and optimize as needed.
2. **Checkpoint frequency**: Start with 10, tune based on performance.
3. **History limit**: Start with 100 commands, make configurable.
4. **Sub-assembly scope**: Should sub-assembly edits have separate history?

---

## Success Criteria

- [ ] Undo reverses last action for all operation types
- [ ] Redo re-applies undone action
- [ ] Keyboard shortcuts work (⌘Z, ⌘⇧Z)
- [ ] History survives session (optional persistence)
- [ ] Performance: Undo/redo < 100ms for typical operations
- [ ] Memory: History doesn't grow unbounded
