# Boxen - Laser-Cut Box Designer

## Test-First Development for New Features

**Before implementing a new feature that modifies geometry or user-facing behavior**, write integration tests FIRST that:

1. **Test the final artifact, not intermediate state**
   - BAD: Test that `extractAffectedEdges()` returns a map with entries
   - GOOD: Test that `panel.outline.points` has more points after an extension operation
   - BAD: Test that `classifyPolygon()` returns `'boundary'`
   - GOOD: Test that after applying a boundary polygon, the panel's max Y coordinate increased by the expected amount

2. **Use realistic scenarios with actual engine state**
   - Create a real engine with `createEngineWithAssembly()`
   - Use actual panel dimensions from `generatePanelsFromNodes()`
   - Include finger joints (they have 100+ points; a simple rectangle has 4)
   - Test with the actual dispatch/action flow, not direct function calls

3. **Verify user-visible outcomes**
   - For cutouts: Check `panel.holes.length` increased and hole has expected dimensions
   - For edge extensions: Check `panel.outline.points` contains points beyond original bounds
   - For modifications: Check specific coordinates changed (e.g., `maxY`, `minX`)
   - Don't just check that operations "succeeded" - verify the geometry changed correctly

4. **Write tests that FAIL before implementation**
   - The test should fail with a clear message showing current vs expected behavior
   - Example: `expected 38 to be greater than 132` reveals the outline lost points
   - Run tests to confirm they fail, THEN implement the feature

5. **Test edge cases from the user's perspective**
   - Polygon drawn near (but not crossing) an edge
   - Second operation on an already-modified edge
   - Operations on panels with existing finger joints
   - Operations that touch corners

**Incorporate into planning phase:**

When planning a new feature, include a "Failure Tests" section that explicitly lists:
1. The integration tests you will write BEFORE implementing
2. What each test verifies (the user-visible outcome)
3. Why you expect each test to FAIL initially (what doesn't exist yet)

Example plan section:
```markdown
## Failure Tests (to write before implementing)

These tests should FAIL initially, proving the feature doesn't exist yet:

| Test | Verifies | Expected Failure |
|------|----------|------------------|
| Boundary extension increases outline points | `panel.outline.points.length` > original | Will fail: APPLY_EDGE_OPERATION not implemented |
| Extension preserves finger joints | Point count = original + extension points, not simple polygon | Will fail: No edge path integration with finger joints |
| Interior polygon creates cutout | `panel.holes.length` increases | Will fail: Classification routes to wrong action |
| Second extension preserves first | Outline contains both extension regions | Will fail: No merge logic for multiple operations |
```

**Why this matters:**
- Unit tests on algorithms pass even when integration is broken
- Algorithms can work perfectly in isolation but fail when composed
- The user sees the final panel outline, not internal data structures
- Finger joints, slots, and other computed geometry must be preserved
- If a test passes before implementation, it's testing the wrong thing

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
│   ├── geometryChecker.ts  # Core geometry validation
│   ├── validators/         # Validator modules for integration tests
│   │   ├── ComprehensiveValidator.ts  # All-in-one geometry validation
│   │   ├── PathChecker.ts             # Path validity (axis-aligned, no diagonals)
│   │   └── EdgeExtensionChecker.ts    # Edge extension rules
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

Panels use UUIDs at runtime but deterministic canonical keys for serialization (share links). When working with panel selection, filtering, lookup, or serialization, read [`docs/panel-id-system.md`](docs/panel-id-system.md) for the full API and code examples. Do not use `src/utils/panelIds.ts` (deprecated).

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

When adding a new operation, follow the step-by-step guide in [`docs/adding-operations.md`](docs/adding-operations.md). Also see `.claude/rules/operations.md` for quick reference.

## Protected Validators

The following validator modules contain critical geometric rules that should NOT be modified without consulting the user first:

1. **`src/engine/geometryChecker.ts`** - Core geometry validation (void bounds, panel sizes, finger joints, slots)
2. **`src/engine/validators/ComprehensiveValidator.ts`** - Comprehensive geometry validation for integration tests
3. **`src/engine/validators/PathChecker.ts`** - Path validity rules:
   - `path:axis-aligned` - No diagonal segments in paths (all segments must be horizontal or vertical)
   - `path:minimum-points` - Paths must have at least 3 points
   - `path:no-duplicates` - No consecutive duplicate points
4. **`src/engine/validators/EdgeExtensionChecker.ts`** - Edge extension rules:
   - `edge-extensions:eligibility` - Only open/female edges can be extended
   - `edge-extensions:full-width` - Extension sides span full panel dimension
   - `edge-extensions:far-edge-open` - Extension cap has no finger joints (straight line)
   - `edge-extensions:corner-ownership` - Adjacent extended panels: female occupies corner
   - `edge-extensions:long-fingers` - Long extensions should have finger joints

These rules encode critical geometric constraints documented in `docs/IMG_8222.jpeg` and the geometry rules documentation.

## Share Link Debugging Tools

Two scripts in `scripts/` for working with share links:

### Parsing

```bash
npx tsx --import ./scripts/register-lz-compat.mjs scripts/parse-share-link.ts "http://localhost:5173/?p=..."   # full URL
npx tsx --import ./scripts/register-lz-compat.mjs scripts/parse-share-link.ts "NoIgLg..."                       # compressed string
npx tsx --import ./scripts/register-lz-compat.mjs scripts/parse-share-link.ts --raw "..."                       # raw JSON output
```

### Generating

```bash
npx tsx --import ./scripts/register-lz-compat.mjs scripts/generate-share-link.ts basic          # preset
npx tsx --import ./scripts/register-lz-compat.mjs scripts/generate-share-link.ts grid-2x2       # preset with grid
npx tsx --import ./scripts/register-lz-compat.mjs scripts/generate-share-link.ts --json '{"width":100,"height":80,"depth":60,"actions":[]}'
```

The `--import ./scripts/register-lz-compat.mjs` flag is required because lz-string is CJS-only and the project uses ESM. The loader shim provides named-export compatibility.

Presets: `basic`, `subdivided-x`, `subdivided-z`, `grid-2x2`, `grid-3x3`

### Slash Commands

- `/parse-share-link <url>` - Parse and display a share link's contents
- `/generate-share-link <preset or description>` - Generate a share link

### Playwright Testing: Use Share Links for State Setup

When writing Playwright tests, generate a URL with state pre-applied using `scripts/generate-share-link.ts` rather than clicking through the UI. Navigate directly to the URL with `page.goto(url)`. This is faster, more reliable, and tests the serialization path as a side effect.

```typescript
// Generate URL with a 2x2 grid box
const url = execSync('npx tsx --import ./scripts/register-lz-compat.mjs scripts/generate-share-link.ts grid-2x2').toString().trim();
await page.goto(url);
// State is fully loaded - now test interactions
```
