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
    ├── debug.ts            # Global debug system (single string, single button)
    ├── editableAreas.ts    # Calculate safe zones for panel modifications
    ├── edgeMating.test.ts  # Edge mating verification tests
    ├── extendModeDebug.ts  # Debug logging for push/pull extend mode
    ├── fingerJoints.ts     # Finger joint pattern generation
    ├── panelGenerator.ts   # Core panel generation with finger joints
    ├── projectStorage.ts   # Project persistence
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

### Global Debug System

A simple global debug system exists in `src/utils/debug.ts`:

```typescript
import { setDebug } from './debug';

// In your debug utility, just set the debug content:
setDebug(formattedDebugString);
```

The Debug button in the header automatically appears when debug content exists and copies it to clipboard.

**When to suggest debugging**: If the user reports strange rendering behavior (objects in wrong positions, misaligned joints, unexpected scaling, etc.), suggest using the Debug button in the header to copy diagnostic info to clipboard.

### Adding Debug Output for a Feature

1. **Create a debug utility file** (e.g., `src/utils/myFeatureDebug.ts`):
   ```typescript
   import { setDebug } from './debug';

   export const logMyFeature = (data: MyData): void => {
     const lines: string[] = [];
     lines.push('=== MY FEATURE DEBUG ===');
     lines.push(`Input: ${JSON.stringify(data)}`);
     // ... format debug info
     setDebug(lines.join('\n'));
   };
   ```

2. **Call from your feature code**:
   ```typescript
   import { logMyFeature } from '../utils/myFeatureDebug';

   // At the end of your calculation:
   logMyFeature(relevantData);
   ```

3. **Analysis workflow**:
   - Reproduce the issue in the UI
   - Click the Debug button to copy info to clipboard
   - Paste into conversation or text editor for analysis

**Example**: `src/utils/extendModeDebug.ts` captures void tree state before and after push/pull extend operations, showing bounds and splitPosition changes for each void.
