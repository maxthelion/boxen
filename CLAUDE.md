# Boxen - Laser-Cut Box Designer

## Working with Claude

- **After completing a feature**: When the user approves a feature, ask if they want to commit it to git.
- **Planning documents**: Keep plans in the project repo at `docs/` (e.g., `docs/2d-sketch-plan.md`), not in Claude's default plan location (`~/.claude/plans/`). This ensures plans are version-controlled and accessible to everyone.

## Project Overview

Boxen is a web-based 3D parametric box designer for laser cutting. Users can design boxes with configurable dimensions, finger joints, dividers, and sub-assemblies (drawers, trays, inserts). The app generates SVG files for laser cutting.

## Tech Stack

- **Framework**: React 18 with TypeScript
- **3D Rendering**: Three.js via @react-three/fiber and @react-three/drei
- **State Management**: Zustand
- **Build Tool**: Vite
- **Testing**: Vitest

## Project Structure

```
src/
├── components/       # React components
│   ├── Box3D.tsx           # Main 3D scene renderer
│   ├── BoxTree.tsx         # Structure tree navigator
│   ├── EditorToolbar.tsx   # Tool selection UI (select, pan, chamfer, etc.)
│   ├── FloatingPalette.tsx # Reusable floating palette for tool options
│   ├── PanelPathRenderer.tsx   # Renders individual panels in 3D
│   ├── PanelProperties.tsx # Panel property editor
│   ├── SketchView2D.tsx    # 2D panel editing view with SVG canvas
│   ├── SubdivisionControls.tsx # Controls for adding dividers
│   ├── Viewport3D.tsx      # 3D viewport container
│   └── UI/                 # Reusable UI components
├── store/
│   └── useBoxStore.ts      # Zustand store with all state and actions
├── types.ts          # TypeScript type definitions
└── utils/
    ├── cornerFinish.ts     # Chamfer/fillet corner detection and application
    ├── editableAreas.ts    # Calculate safe zones for panel modifications
    ├── edgeMating.test.ts  # Edge mating verification tests
    ├── extensionDebug.ts   # Debug logging for edge extension calculations
    ├── fingerJoints.ts     # Finger joint pattern generation
    ├── panelGenerator.ts   # Core panel generation with finger joints
    ├── projectStorage.ts   # Project persistence
    ├── pushPullDebug.ts    # Debug logging for push/pull preview system
    ├── svgExport.ts        # SVG export for laser cutting
    ├── urlState.ts         # URL state serialization
    └── voidOperations.ts   # Void tree operations
```

## Key Concepts

### Void Tree
The box interior is represented as a recursive tree of `Void` objects. Each void represents a 3D rectangular space that can be:
- Subdivided into child voids (creating divider panels)
- Filled with a sub-assembly (drawer, tray, insert)

### Panel Generation
Panels are generated from the void tree structure. The `generatePanelCollection()` function creates:
- **Face panels**: The 6 outer walls of the box
- **Divider panels**: Internal partitions from subdivisions

Each panel has:
- An outline path with finger joint patterns
- Holes for slots where other panels intersect
- Position and rotation in 3D space

### Finger Joints
Finger joints connect panels at intersections. The system determines:
- Which panel has "tabs out" (protruding fingers)
- Which panel has "slots" (receiving holes)
- Based on assembly axis and wall priority

**World-Space Alignment**: Mating edges must generate finger patterns from the same world-space anchor. Since edges traverse in different directions (top: left→right, bottom: right→left), the panel generator swaps direction for "reversed" edges (bottom, right) and flips `isTabOut` to maintain correct protrusion direction. This ensures tabs on one panel align precisely with slots on the mating panel.

### Assembly Configuration
- `assemblyAxis`: Primary axis ('x', 'y', or 'z') for lid orientation
- `lids`: Configuration for positive/negative lids (inset, tab direction)
- Lid insets affect divider positioning and finger joint generation

## Common Patterns

### ID Conventions
- Face panels: `face-{faceId}` (e.g., `face-front`, `face-top`)
- Divider panels: `divider-{voidId}-split` (e.g., `divider-void-1-split`)
- Sub-assembly faces: `subasm-{subAsmId}-face-{faceId}`

### State Selection
Selection uses Sets for multi-select support:
```typescript
selectedPanelIds: Set<string>
selectedVoidIds: Set<string>
selectedSubAssemblyIds: Set<string>
```

### Panel Source Tracking
Each panel tracks its source for debugging and UI:
```typescript
source: {
  type: 'face' | 'divider',
  faceId?: FaceId,
  voidId?: string,
}
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

## Testing

Tests are in `src/utils/panelGenerator.test.ts` and verify:
- Panel generation for all face configurations
- Finger joint alignment between connected panels
- Slot hole positioning for dividers
- Inset lid scenarios

Run tests with `npm run test:run`.

## Common Tasks

### Adding a new panel property
1. Add the property to `PanelPath` interface in `types.ts`
2. Initialize it in `generateFacePanel()` or `generateDividerPanel()` in `panelGenerator.ts`
3. Add UI controls in `PanelProperties.tsx`
4. Add store action in `useBoxStore.ts` if needed

### Debugging panel generation
- Check `panel.source` to see where a panel came from
- Use the Structure tree to select panels and see their properties
- Panel IDs follow the conventions above for tracing

### Working with coordinates
- Panels are generated in local 2D coordinates (centered at origin)
- `position` and `rotation` transform to world space
- The `transformToWorld()` helper in tests shows the math

## Recent Features

### 2D Sketch View (SketchView2D)
A dedicated 2D SVG-based editor for panels. Accessed via "Edit in 2D" button in Panel Properties.
- Pan/zoom with mouse wheel and drag
- Color-coded edges: blue (locked/joints), orange (editable)
- Conceptual boundary lines showing original panel edges
- Editable areas (green) showing safe zones for modifications
- Edge extension with inset tool (drag edges to extend/contract)

### Two-Plane Subdivision
Select exactly 2 parallel panels (e.g., front + back) to subdivide the void between them. Only shows subdivision options for the axes perpendicular to both panels.

### Percentage-Based Subdivisions
Subdivisions can be set to "Scale with dimensions" mode where they maintain their relative position (e.g., 50%) when box dimensions change, rather than staying at an absolute position.

### Assembly Feet
Bottom panels can have feet that extend downward. When enabled:
- Wall panels extend below the bottom face
- Two feet are generated at the corners with a gap between
- Slot holes are generated for the feet extensions

### Corner Finishing (Chamfer/Fillet)
Tool for applying chamfers or fillets to panel corners:
- Activate chamfer tool in EditorToolbar
- Click corners to select (toggle selection)
- Floating palette appears with radius slider and chamfer/fillet toggle
- Select All button for quick multi-corner selection

### EditorToolbar
Tool selection UI that appears in both 2D and 3D views:
- Select, Pan tools (both views)
- Rectangle, Circle, Path, Inset, Chamfer tools (2D only)
- Mirror toggles for symmetric operations (2D only)

### FloatingPalette
Reusable component for tool option panels:
- Draggable by header
- Auto-positions near selection
- Closes on Escape or click outside
- Includes helper components: PaletteSliderInput, PaletteToggleGroup, PaletteButton

## Debugging Patterns

**When to suggest debugging**: If the user reports strange rendering behavior (objects in wrong positions, feedback loops, unexpected scaling, etc.), suggest using the Debug button in the header to copy diagnostic info to clipboard. This is especially useful for issues involving:
- Push/pull preview system (`src/utils/pushPullDebug.ts`)
- Edge extension calculations (`src/utils/extensionDebug.ts`)
- Any multi-step state transformations

### Clipboard Debug Output Pattern

For complex multi-step calculations (like extension overlap detection), use this pattern to capture debug information that can be analyzed via clipboard copy:

1. **Create a debug utility file** (e.g., `src/utils/extensionDebug.ts`):
   ```typescript
   interface DebugInfo { /* structured data for the calculation */ }

   let currentDebugLog: DebugLog | null = null;

   export const startDebugLog = (): void => {
     currentDebugLog = { timestamp: new Date().toISOString(), items: [] };
   };

   export const addDebugItem = (info: DebugInfo): void => {
     if (currentDebugLog) currentDebugLog.items.push(info);
   };

   export const formatDebugLog = (): string => {
     // Format as human-readable text
   };

   export const hasDebugInfo = (): boolean => {
     return currentDebugLog !== null && currentDebugLog.items.length > 0;
   };
   ```

2. **Call debug functions during calculation**:
   - Call `startDebugLog()` at the beginning of the calculation
   - Call `addDebugItem()` at each step with relevant state
   - Include both inputs and computed intermediate values

3. **Add UI button in App.tsx**:
   ```typescript
   const [debugCopyStatus, setDebugCopyStatus] = useState<'idle' | 'copied'>('idle');

   const handleCopyDebug = async () => {
     const debugText = formatDebugLog();
     await navigator.clipboard.writeText(debugText);
     setDebugCopyStatus('copied');
     setTimeout(() => setDebugCopyStatus('idle'), 2000);
   };

   // In render - only show when debug info exists:
   {hasDebugInfo() && (
     <button onClick={handleCopyDebug}>
       {debugCopyStatus === 'copied' ? 'Copied!' : 'Debug'}
     </button>
   )}
   ```

4. **Analysis workflow**:
   - Reproduce the issue in the UI
   - Click the Debug button to copy info to clipboard
   - Paste into conversation or text editor for analysis
   - Look for discrepancies between expected and actual values

**Example**: `src/utils/extensionDebug.ts` captures extension overlap data for each panel including: extensions, perpendicular panel extensions, corner meeting analysis, and final positions. This helped diagnose that panels generated earlier in the sequence couldn't see extensions from panels generated later.
