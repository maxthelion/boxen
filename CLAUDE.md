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
    ├── panelIds.ts         # Panel ID creation/parsing (ALWAYS USE THIS)
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

### Panel ID Conventions

**Always use `src/utils/panelIds.ts` utilities for creating/parsing panel IDs. Never concatenate ID strings manually.**

| Panel Type | Format | Example |
|------------|--------|---------|
| Face (main) | `face-{faceId}` | `face-front` |
| Face (sub-assembly) | `{subAsmId}-face-{faceId}` | `sub123-face-front` |
| Divider | `divider-{voidId}-{axis}-{position}` | `divider-abc123-x-50` |

```typescript
import { createFacePanelId, createDividerPanelId, getVoidIdFromDividerPanelId } from '../utils/panelIds';

// Creating IDs
const faceId = createFacePanelId('front');
const dividerId = createDividerPanelId('void123', 'x', 50);

// Parsing IDs
const voidId = getVoidIdFromDividerPanelId('divider-abc-x-50'); // 'abc'
```

See `.claude/rules/panel-ids.md` for full API reference.

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
