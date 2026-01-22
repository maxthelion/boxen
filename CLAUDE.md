# Boxen - Laser-Cut Box Designer

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
│   ├── PanelPathRenderer.tsx   # Renders individual panels in 3D
│   ├── PanelProperties.tsx # Panel property editor
│   ├── SubdivisionControls.tsx # Controls for adding dividers
│   └── UI/                 # Reusable UI components
├── store/
│   └── useBoxStore.ts      # Zustand store with all state and actions
├── types.ts          # TypeScript type definitions
└── utils/
    ├── panelGenerator.ts   # Core panel generation with finger joints
    ├── svgExport.ts        # SVG export for laser cutting
    └── urlState.ts         # URL state serialization
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
