# Boxen - Agent Guidelines

Boxen is a web-based 3D parametric box designer for laser cutting. Built with React 18, TypeScript, Three.js, and Vite.

## Build & Development Commands

```bash
# Development server
npm run dev              # Start Vite dev server

# Building
npm run build            # Production build
npm run preview          # Preview production build

# Type checking
npm run typecheck        # Run TypeScript compiler (no emit)

# Linting
npm run lint             # Run ESLint

# Testing
npm run test             # Run tests in watch mode (Vitest)
npm run test:run         # Run tests once

# Run specific test file
npm run test -- src/engine/integration/fillet.test.ts

# Run tests matching pattern
npm run test -- -t "should add points"
```

## Code Style Guidelines

### TypeScript Configuration
- Target: ES2020
- Strict mode enabled
- No unused locals/parameters
- Module: ESNext with bundler resolution
- JSX: react-jsx transform

### Naming Conventions
- **Components**: PascalCase (`Box3D.tsx`, `PanelPathRenderer.tsx`)
- **Hooks**: camelCase starting with `use` (`useBoxStore`, `useEngineConfig`)
- **Classes**: PascalCase (`Engine`, `BaseNode`, `AssemblyNode`)
- **Types/Interfaces**: PascalCase (`PanelConfig`, `MaterialConfig`)
- **Constants**: camelCase or UPPER_SNAKE for true constants
- **Files**: 
  - Components: PascalCase.tsx
  - Utils/Hooks: camelCase.ts
  - Test files: `*.test.ts` or `*.test.tsx`

### Import Order
1. React imports
2. Third-party libraries (three, zustand)
3. Absolute imports from project root (`@/` or `../`)
4. Relative imports from same directory (`./`)

Example:
```typescript
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useBoxStore } from '../store/useBoxStore';
import { Panel } from './UI/Panel';
```

### Type Patterns
- Prefer interfaces for object types
- Use type aliases for unions/complex types
- Explicit return types on exported functions
- Use `readonly` for immutable arrays/objects

### Error Handling
- Use explicit null checks before accessing optional properties
- Throw descriptive errors in engine code
- Return null/undefined gracefully in UI components
- Use TypeScript strict null checks

### React Patterns
- Functional components with hooks
- Use `React.FC<Props>` for component typing
- Memoize expensive computations with `useMemo`
- Use Zustand for state management (not useState for shared state)

### Testing Standards
- Use Vitest with `describe`/`it`/`expect`
- Integration tests go in `src/engine/integration/`
- Fixture tests go in `src/test/fixtures/`
- Unit tests co-located with source files

**Test-First Development:**
Write integration tests BEFORE implementing features that modify geometry. Tests should:
- Verify user-visible outcomes (e.g., `panel.outline.points.length` increases)
- Use realistic engine state with `createEngineWithAssembly()`
- Test with actual finger joints (100+ points, not simple rectangles)
- FAIL before implementation, then pass after

### Project Structure
```
src/
├── components/       # React components (.tsx)
├── engine/          # Core model engine
│   ├── nodes/       # Node class hierarchy
│   ├── validators/  # Geometry validation
│   └── integration/ # Integration tests
├── store/           # Zustand store slices
├── types.ts         # Shared type definitions
└── utils/           # Utility functions
```

### Documentation
- JSDoc for public functions and complex logic
- Comments for geometry algorithms explaining "why"
- CLAUDE.md contains detailed architecture documentation

### Pre-commit Checklist
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run test:run` passes
- [ ] Tests written for new geometry features
