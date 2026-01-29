# Boxen - Laser-Cut Box Designer

## Working with Claude

- **After completing a feature**: When the user approves a feature, ask if they want to commit it to git.
- **Planning documents**: Keep plans in the project repo at `docs/` (e.g., `docs/2d-sketch-plan.md`), not in Claude's default plan location (`~/.claude/plans/`). This ensures plans are version-controlled and accessible to everyone.

## Project Overview

Boxen is a web-based 3D parametric box designer for laser cutting. Users can design boxes with configurable dimensions, finger joints, dividers, and sub-assemblies (drawers, trays, inserts). The app generates SVG files for laser cutting.

## Tech Stack

- **Framework**: React 18 with TypeScript
- **3D Rendering**: Three.js via @react-three/fiber and @react-three/drei
- **State Management**: Zustand (UI state only)
- **Build Tool**: Vite
- **Testing**: Vitest

## Project Structure

```
src/
├── components/       # React components
│   ├── Box3D.tsx           # Main 3D scene renderer
│   ├── BoxTree.tsx         # Structure tree navigator
│   ├── EditorToolbar.tsx   # Tool selection UI
│   ├── FloatingPalette.tsx # Reusable floating palette for tool options
│   ├── PanelPathRenderer.tsx   # Renders individual panels in 3D
│   ├── PanelProperties.tsx # Panel property editor
│   ├── SketchView2D.tsx    # 2D panel editing view with SVG canvas
│   ├── SubdivisionControls.tsx # Controls for adding dividers
│   ├── Viewport3D.tsx      # 3D viewport container
│   └── UI/                 # Reusable UI components
├── engine/           # Core model engine (source of truth)
│   ├── Engine.ts           # Main engine class - dispatch, snapshots, preview
│   ├── types.ts            # Engine type definitions
│   ├── panelBridge.ts      # Converts engine snapshots to store types
│   └── nodes/              # Node class hierarchy
│       ├── BaseNode.ts         # Abstract base with parent/child, dirty tracking
│       ├── SceneNode.ts        # Root scene container
│       ├── BaseAssembly.ts     # Abstract assembly base (dimensions, faces, material)
│       ├── AssemblyNode.ts     # Main box assembly
│       ├── SubAssemblyNode.ts  # Nested assembly (drawer, tray)
│       ├── VoidNode.ts         # Interior space (subdivisions, sub-assemblies)
│       ├── BasePanel.ts        # Abstract panel base (outline, finger joints)
│       ├── FacePanelNode.ts    # Face panel (front, back, etc.)
│       └── DividerPanelNode.ts # Divider panel from void subdivision
├── store/
│   └── useBoxStore.ts      # Zustand store (UI state, selection, operations)
├── types.ts          # Shared TypeScript type definitions
└── utils/
    ├── fingerJoints.ts     # Finger joint pattern generation
    ├── faceGeometry.ts     # Face/edge relationship helpers
    ├── genderRules.ts      # Finger joint gender determination
    ├── pathValidation.ts   # Path validation for detecting unrenderable geometry
    ├── svgExport.ts        # SVG export for laser cutting
    └── debug.ts            # Global debug system
```

## Architecture Constraints

### Engine vs Store Responsibilities

**Engine (source of truth for model state):**
- The Engine owns the scene tree: assemblies, voids, faces, dimensions, material config
- All model mutations go through `engine.dispatch(action)`
- Engine provides snapshots for React via `getSnapshot()` and `generatePanelsFromNodes()`
- Engine handles preview state internally via `startPreview()`, `commitPreview()`, `discardPreview()`
- Never access engine node internals from components - use snapshots

**Store (UI state only):**
- Selection state (selectedPanelIds, selectedVoidIds, etc.)
- Active operation state (which tool is active, operation phase, params)
- View mode (2D/3D, camera position, zoom)
- UI preferences
- Store does NOT duplicate model state - it reads from engine snapshots

**Data Flow:**
```
User Action → Store (operation params) → engine.dispatch() → Engine mutates scene
                                                          ↓
React ← useEnginePanels() hook ← engine.getSnapshot()
```

### Operations System

Operations are user actions that modify the model. See `docs/modification-pattern-plan.md` for full specification and `.claude/rules/operations.md` for quick reference when editing operation code.

**Operation Types:**
- `parameter`: Has a preview phase with adjustable parameters (push-pull, subdivide, chamfer)
- `immediate`: Executes instantly without preview (toggle face, delete)
- `view`: Changes view without model modification (edit in 2D)

**Operation Phases:**
`idle` → `awaiting-selection` → `active` → (apply/cancel) → `idle`

**Key Constraints:**
- Only one operation can be active at a time
- Operation parameters live in the store, not the engine
- Preview mutations go to `engine._previewScene`, committed state to `engine._scene`
- Components use `useEnginePanels()` which automatically returns preview if active

### Event Sourcing (Future)

The architecture supports an event-sourced model for undo/redo and collaboration:

**Constraints for Event Sourcing Compatibility:**
- All model mutations MUST go through `engine.dispatch(action)`
- Actions must be serializable (no functions, no DOM references)
- Actions must be deterministic (same input → same output)
- Never mutate engine nodes directly from outside the engine
- Store preview events separately (they don't get persisted)

## Key Concepts

### Engine Node Hierarchy

```
SceneNode (root)
└── AssemblyNode (main box)
    └── VoidNode (root void - interior space)
        ├── VoidNode (child void from subdivision)
        │   └── SubAssemblyNode (drawer/tray)
        │       └── VoidNode (sub-assembly interior)
        └── VoidNode (sibling void)
```

Panels (FacePanelNode, DividerPanelNode) are derived/computed, not stored in the tree.

### Panel Generation

Panels are computed by engine nodes on demand:
- `AssemblyNode.getPanels()` returns all panels for the assembly
- `FacePanelNode` computes dimensions, outline with finger joints, and slot holes
- `DividerPanelNode` computes dimensions based on void bounds

Each panel snapshot includes:
- Outline path with finger joint patterns
- Holes for slots where other panels intersect
- 3D transform (position, rotation)

### Finger Joints

Finger joints connect panels at intersections. The system determines:
- Which panel has "tabs out" (male joints)
- Which panel has "slots" (female joints)
- Based on assembly axis and wall priority via `genderRules.ts`

**World-Space Alignment**: Mating edges generate finger patterns from the same world-space anchor. Edge axis positions are computed in `computeEdgeAxisPosition()` on panel nodes.

## Common Patterns

### Panel ID System

**Panel IDs are UUIDs**, not deterministic strings. This ensures uniqueness and stability across scene clones.

**Why UUIDs?** During operations like subdivision, the engine clones the scene for preview. With deterministic IDs (e.g., `divider-void123-x-50`), new panels created during preview would get the same IDs as committed panels, causing selection bugs. UUIDs ensure each panel instance has a unique identity.

**ID Stability Across Clones:** Divider panel IDs are cached on VoidNode (`_dividerPanelId`). When the scene is cloned:
- Existing panels keep their cached UUIDs
- Only NEW panels (from the current operation) get new UUIDs
- This preserves selection state during preview/commit cycles

**Identifying Panels:** Don't parse panel IDs - use `PanelPath.source` metadata instead:

```typescript
// PanelPath.source contains semantic info about the panel
interface PanelSource {
  type: 'face' | 'divider';
  faceId?: FaceId;           // For face panels
  subdivisionId?: string;    // Parent void ID (for dividers)
  axis?: 'x' | 'y' | 'z';    // Split axis (for dividers)
  position?: number;         // Split position (for dividers)
  subAssemblyId?: string;    // For sub-assembly panels
}

// Example: Find a divider panel by its source info
const dividerPanel = panels.find(p =>
  p.source.type === 'divider' &&
  p.source.subdivisionId === parentVoidId &&
  p.source.axis === 'x'
);

// Example: Find face panels for the main assembly
const mainFacePanels = panels.filter(p =>
  p.source.type === 'face' && !p.source.subAssemblyId
);
```

**Building Lookup Maps:** For components that need to map semantic info to panel IDs, build a lookup map from engine panels (see `BoxTree.tsx` for example):

```typescript
function buildPanelLookup(panels: PanelPath[]) {
  const dividerPanels = new Map<string, string>();
  for (const panel of panels) {
    if (panel.source.type === 'divider') {
      // Key: "parentVoidId-axis-position"
      const key = `${panel.source.subdivisionId}-${panel.source.axis}-${panel.source.position}`;
      dividerPanels.set(key, panel.id);
    }
  }
  return { dividerPanels };
}
```

**⚠️ Deprecated:** The utilities in `src/utils/panelIds.ts` construct deterministic IDs and are incompatible with the UUID system. Do not use them for new code.

### Dispatching Model Changes

```typescript
// Always use dispatch for model changes
engine.dispatch({
  type: 'SET_DIMENSIONS',
  targetId: 'main-assembly',
  payload: { width: 100, height: 80, depth: 60 }
});

engine.dispatch({
  type: 'ADD_SUBDIVISION',
  targetId: 'main-assembly',
  payload: { voidId: 'root', axis: 'x', position: 50 }
});
```

## Running the Project

```bash
npm install
npm run dev      # Start dev server
npm run build    # Production build
npm run test     # Run tests in watch mode
npm run test:run # Run tests once
npm run typecheck # TypeScript type checking
```

## Debugging Patterns

### Tagged Debug System

A tagged debug system exists in `src/utils/debug.ts`. Debug statements can be left in the code permanently - only messages with active tags are collected for the clipboard.

```typescript
import { debug, enableDebugTag, setDebugTags } from '../utils/debug';

// Enable tags you want to capture
enableDebugTag('subdivision');
setDebugTags(['subdivision', 'preview', 'axis']);

// Log with a tag - only outputs if tag is active
debug('subdivision', 'Starting subdivision...');
debug('preview', `Preview created for void ${voidId}`);
debug('axis', `Selected axis: ${axis}`);
```

**API:**
- `debug(tag, content)` - Log with tag (only if tag is active)
- `enableDebugTag(tag)` / `disableDebugTag(tag)` - Toggle individual tags
- `setDebugTags(tags[])` - Set all active tags at once
- `getDebugTags()` - Get currently active tags
- `isDebugTagActive(tag)` - Check if a tag is active

**Legacy API** (no filtering, always outputs):
- `setDebug(content)` - Replace all debug content
- `appendDebug(content)` - Append to debug content

The Debug button in the header automatically appears when debug content exists and copies it to clipboard.

**When to suggest debugging**: If the user reports strange rendering behavior (objects in wrong positions, misaligned joints, unexpected scaling, etc.), suggest using the Debug button in the header to copy diagnostic info to clipboard.

### 3D Rendering Issues

For THREE.js panel rendering problems (holes appearing as extrusions, missing geometry, triangulation artifacts), see `docs/debugging-3d-rendering.md` for a comprehensive debugging guide.

**Quick Reference - Common Causes:**
- **Holes render as extrusions**: Winding order mismatch (outline and holes must have opposite winding)
- **Missing geometry**: Degenerate holes touching outline boundary, or duplicate points
- **Triangulation artifacts**: Self-intersecting paths or overlapping holes

**Path Validation:** Use `src/utils/pathValidation.ts` to programmatically detect invalid geometry:
```typescript
import { validatePanelPath } from '../utils/pathValidation';

const result = validatePanelPath(outline, holes);
if (!result.valid) {
  console.error('Invalid path:', result.errors);
}
```

**Debug Tag:** Enable `slot-geometry` tag to log detailed geometry info in `PanelPathRenderer.tsx`.

## Adding New Operations

Operations are user actions that modify the model (or view). They follow a consistent pattern:

### 1. Define in Registry

Add the operation to `src/operations/registry.ts`:

```typescript
'my-operation': {
  id: 'my-operation',
  name: 'My Operation',
  type: 'parameter',  // 'parameter' | 'immediate' | 'view'
  selectionType: 'void',  // 'void' | 'panel' | 'corner' | 'assembly' | 'none'
  minSelection: 1,
  maxSelection: 1,
  availableIn: ['3d'],  // '2d' | '3d'
  description: 'Description for tooltips',
  shortcut: 'm',  // Optional keyboard shortcut
  // For parameter operations: creates the engine action for preview
  createPreviewAction: (params) => {
    const { someParam } = params as { someParam?: string };
    if (!someParam) return null;  // Return null if params incomplete
    return {
      type: 'MY_ENGINE_ACTION',
      targetId: 'main-assembly',
      payload: { someParam },
    };
  },
},
```

Also add the operation ID to `src/operations/types.ts`:

```typescript
export type OperationId =
  // ... existing operations
  | 'my-operation';
```

### 2. Add Engine Action (if needed)

If the operation requires a new engine action, add it to:

**`src/engine/types.ts`** - Add the action type:
```typescript
export type EngineAction =
  // ... existing actions
  | { type: 'MY_ENGINE_ACTION'; targetId: string; payload: { someParam: string } };
```

**`src/engine/Engine.ts`** - Add the handler in `dispatch()`:
```typescript
case 'MY_ENGINE_ACTION': {
  // Handle the action
  return true;
}
```

### 3. Create Palette Component (for parameter operations)

Create a new palette component in `src/components/MyOperationPalette.tsx`:

```typescript
import { useBoxStore } from '../store/useBoxStore';
import { FloatingPalette, PaletteSliderInput, PaletteButton } from './FloatingPalette';
import { getEngine, notifyEngineStateChanged } from '../engine';

export const MyOperationPalette: React.FC<Props> = ({ visible, position, onClose, ... }) => {
  const operationState = useBoxStore((state) => state.operationState);
  const startOperation = useBoxStore((state) => state.startOperation);
  const updateOperationParams = useBoxStore((state) => state.updateOperationParams);
  const applyOperation = useBoxStore((state) => state.applyOperation);
  const cancelOperation = useBoxStore((state) => state.cancelOperation);

  const isActive = operationState.activeOperation === 'my-operation';

  // Auto-start operation when valid target is selected
  useEffect(() => {
    if (canStart && !isActive) {
      startOperation('my-operation');
      updateOperationParams({ someParam: initialValue });
    }
  }, [canStart, isActive, ...]);

  // Handle parameter changes
  const handleParamChange = useCallback((value) => {
    if (isActive) {
      updateOperationParams({ someParam: value });
    }
  }, [isActive, updateOperationParams]);

  // Handle apply/cancel
  const handleApply = useCallback(() => {
    if (isActive) applyOperation();
    onClose();
  }, [isActive, applyOperation, onClose]);

  const handleCancel = useCallback(() => {
    if (isActive) cancelOperation();
    onClose();
  }, [isActive, cancelOperation, onClose]);

  return (
    <FloatingPalette title="My Operation" onClose={handleCancel} ...>
      {/* UI controls */}
      <PaletteButtonRow>
        <PaletteButton variant="primary" onClick={handleApply}>Apply</PaletteButton>
        <PaletteButton onClick={handleCancel}>Cancel</PaletteButton>
      </PaletteButtonRow>
    </FloatingPalette>
  );
};
```

### 4. Toolbar Integration

Add the tool to `src/components/EditorToolbar.tsx`:

```typescript
export type EditorTool =
  // ... existing tools
  | 'my-operation';

const tools: ToolButton[] = [
  // ... existing tools
  {
    id: 'my-operation',
    icon: '⚡',
    label: 'My Op',
    tooltip: 'My operation (M)',
    modes: ['3d'],
  },
];
```

Add the palette to `src/components/Viewport3D.tsx`:

```typescript
import { MyOperationPalette } from './MyOperationPalette';

// In the component:
const [myOperationPosition, setMyOperationPosition] = useState({ x: 20, y: 150 });

// In the JSX:
{activeTool === 'my-operation' && (
  <MyOperationPalette
    visible={true}
    position={myOperationPosition}
    onPositionChange={setMyOperationPosition}
    onClose={() => setActiveTool('select')}
    containerRef={canvasContainerRef}
  />
)}
```

### 5. Tests

Add tests to `src/store/operations.test.ts`:

```typescript
describe('My Operation', () => {
  it('should cleanup preview on cancel', () => {
    const engine = getEngine();
    useBoxStore.getState().startOperation('my-operation');
    expect(engine.hasPreview()).toBe(true);

    useBoxStore.getState().cancelOperation();
    expect(engine.hasPreview()).toBe(false);
  });
});
```

### 6. Geometry Checker Integration Test (Required)

**All new operations that modify geometry MUST have an integration test that passes the result through the geometry checker.**

Add an integration test to `src/engine/integration/` or the relevant test file:

```typescript
import { checkEngineGeometry } from '../geometryChecker';

describe('My Operation Integration', () => {
  it('should produce valid geometry', () => {
    const engine = createEngineWithAssembly(100, 80, 60, defaultMaterial);

    // Perform the operation
    engine.dispatch({
      type: 'MY_OPERATION_ACTION',
      targetId: 'main-assembly',
      payload: { /* ... */ },
    });

    // Verify geometry is valid
    const result = checkEngineGeometry(engine);
    expect(result.valid).toBe(true);
    expect(result.summary.errors).toBe(0);
  });
});
```

**Important**: The geometry checker rules in `src/engine/geometryChecker.ts` should NOT be modified without consulting the user first. These rules encode critical geometric constraints for laser-cut assembly.

### Operation Types

- **parameter**: Has preview phase, user adjusts parameters before applying
- **immediate**: Executes instantly without preview (e.g., toggle face)
- **view**: Changes view without model modification (e.g., edit in 2D)

### Key Constraints

- Only one operation can be active at a time
- Operation parameters live in the store, not the engine
- Preview mutations go to `engine._previewScene`, committed state to `engine._scene`
- Components use `useEnginePanels()` which returns preview panels if active
- `createPreviewAction` must return `null` if params are incomplete (no action dispatched)
