# Adding New Operations

Operations are user actions that modify the model (or view). They follow a consistent pattern:

## 1. Define in Registry

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

## 2. Add Engine Action (if needed)

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

## 3. Create Palette Component (for parameter operations)

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

## 4. Toolbar Integration

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

## 5. Tests

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

## 6. Geometry Checker Integration Test (Required)

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
