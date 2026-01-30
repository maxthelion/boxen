---
paths:
  - "src/operations/**"
  - "src/store/operations.test.ts"
  - "src/store/useBoxStore.ts"
  - "src/components/*Palette.tsx"
  - "src/components/EditorToolbar.tsx"
  - "src/components/Viewport3D.tsx"
  - "src/components/FloatingPalette.tsx"
---

# Operations System Rules

**Read this document before modifying any operation-related files.**

Operations are user actions that modify the model (like push-pull, subdivide, inset/outset). They follow a consistent pattern across the codebase.

---

## Operation Types

| Type | Behavior | Preview |
|------|----------|---------|
| `parameter` | User adjusts params before commit | Yes |
| `immediate` | Executes instantly | No |
| `view` | Changes view, no model change | No |

## Operation Phases

`idle` → `awaiting-selection` → `active` → (apply/cancel) → `idle`

---

## Files Involved

| File | Purpose |
|------|---------|
| `src/operations/registry.ts` | Operation definitions and `createPreviewAction` |
| `src/operations/types.ts` | TypeScript types for operation IDs |
| `src/operations/validators.ts` | Selection validation |
| `src/components/EditorToolbar.tsx` | Tool buttons |
| `src/components/FloatingPalette.tsx` | Reusable palette UI components |
| `src/components/Viewport3D.tsx` | Palette mounting |
| `src/store/useBoxStore.ts` | Operation state management |
| `src/engine/Engine.ts` | Preview execution |

---

## Adding a New Operation (Step-by-Step)

### 1. Add Type (`src/operations/types.ts`)

```typescript
export type OperationId =
  // ... existing operations
  | 'my-operation';
```

### 2. Add Registry Entry (`src/operations/registry.ts`)

```typescript
'my-operation': {
  id: 'my-operation',
  name: 'My Operation',
  type: 'parameter',        // 'parameter' | 'immediate' | 'view'
  selectionType: 'panel',   // 'panel' | 'void' | 'edge' | 'assembly' | 'none'
  minSelection: 1,
  maxSelection: 1,
  availableIn: ['3d'],
  description: 'Description for tooltips',
  shortcut: 'm',            // Optional keyboard shortcut
  createPreviewAction: (params) => {
    const { someValue } = params as { someValue?: number };
    if (someValue === undefined) return null;  // Must return null if incomplete
    return {
      type: 'MY_ENGINE_ACTION',
      targetId: 'main-assembly',
      payload: { someValue },
    };
  },
},
```

### 3. Add Toolbar Button (`src/components/EditorToolbar.tsx`)

```typescript
export type EditorTool = ... | 'my-operation';

const tools: ToolButton[] = [
  ...
  { id: 'my-operation', icon: '⚡', label: 'My Op', tooltip: 'My operation (M)', modes: ['3d'] },
];
```

### 4. Create Palette Component (`src/components/MyOperationPalette.tsx`)

Use the reusable components from `FloatingPalette.tsx`:

```typescript
import { FloatingPalette, PaletteSliderInput, PaletteButton, PaletteButtonRow } from './FloatingPalette';

export const MyOperationPalette: React.FC<Props> = ({ visible, position, onPositionChange, onClose, containerRef }) => {
  const operationState = useBoxStore((s) => s.operationState);
  const startOperation = useBoxStore((s) => s.startOperation);
  const updateOperationParams = useBoxStore((s) => s.updateOperationParams);
  const applyOperation = useBoxStore((s) => s.applyOperation);
  const cancelOperation = useBoxStore((s) => s.cancelOperation);

  const isActive = operationState.activeOperation === 'my-operation';

  // Auto-start when valid selection exists
  useEffect(() => {
    if (visible && !isActive && canStart) {
      startOperation('my-operation');
      updateOperationParams({ someValue: 10 });
    }
  }, [visible, isActive, canStart]);

  // Update preview on param change
  const handleChange = (value: number) => {
    if (isActive) updateOperationParams({ someValue: value });
  };

  const handleApply = () => { if (isActive) applyOperation(); onClose(); };
  const handleCancel = () => { if (isActive) cancelOperation(); onClose(); };

  return (
    <FloatingPalette title="My Operation" onClose={handleCancel} position={position} onPositionChange={onPositionChange} containerRef={containerRef}>
      <PaletteSliderInput label="Amount" value={value} onChange={handleChange} min={0} max={50} step={1} unit="mm" />
      <PaletteButtonRow>
        <PaletteButton variant="primary" onClick={handleApply}>Apply</PaletteButton>
        <PaletteButton onClick={handleCancel}>Cancel</PaletteButton>
      </PaletteButtonRow>
    </FloatingPalette>
  );
};
```

### 5. Mount in Viewport (`src/components/Viewport3D.tsx`)

```typescript
const [myOpPosition, setMyOpPosition] = useState({ x: 20, y: 150 });

// In JSX:
{activeTool === 'my-operation' && (
  <MyOperationPalette
    visible={true}
    position={myOpPosition}
    onPositionChange={setMyOpPosition}
    onClose={() => setActiveTool('select')}
    containerRef={canvasContainerRef}
  />
)}
```

### 6. Add Engine Action (if needed)

**`src/engine/types.ts`:**
```typescript
export type EngineAction = ... | { type: 'MY_ENGINE_ACTION'; targetId: string; payload: { someValue: number } };
```

**`src/engine/Engine.ts`:**
```typescript
case 'MY_ENGINE_ACTION': {
  // Implement the action
  return true;
}
```

### 7. Add Tests (`src/store/operations.test.ts`)

```typescript
describe('My Operation', () => {
  it('should cleanup preview on cancel', () => {
    startOperation('my-operation');
    updateOperationParams({ someValue: 10 });
    expect(engine.hasPreview()).toBe(true);
    cancelOperation();
    expect(engine.hasPreview()).toBe(false);
  });
});
```

---

## Reusable Palette Components (`FloatingPalette.tsx`)

| Component | Purpose |
|-----------|---------|
| `FloatingPalette` | Draggable container with title and close button |
| `PaletteSection` | Grouped section with optional title |
| `PaletteSliderInput` | Labeled slider with value display |
| `PaletteNumberInput` | Labeled number input with +/- buttons |
| `PaletteButton` | Styled button (variants: default, primary, danger) |
| `PaletteButtonRow` | Horizontal button container |
| `PaletteCheckbox` | Labeled checkbox |
| `PaletteSelect` | Labeled dropdown select |

**Always use these components** - do not create custom palette styling.

---

## Store Actions (Pre-existing)

These are already implemented - just call them:

- `startOperation(id)` - Begin operation, create engine preview
- `updateOperationParams(params)` - Update params, triggers `createPreviewAction`
- `applyOperation()` - Commit preview to main scene
- `cancelOperation()` - Discard preview

---

## Operation Flow

```
Tool selected → Palette mounts
                    ↓
          Valid selection? → startOperation()
                    ↓
          updateOperationParams({ initial values })
                    ↓
          createPreviewAction(params) → engine action
                    ↓
          engine.dispatch(action) on preview scene
                    ↓
          User adjusts params → updateOperationParams()
                    ↓
          Preview updates in real-time
                    ↓
          Apply: applyOperation() → commitPreview()
          Cancel: cancelOperation() → discardPreview()
```

---

## Key Constraints

1. **Only one operation active at a time**
2. **Parameters live in store**, not engine
3. **Preview uses cloned scene** - mutations go to `engine._previewScene`
4. **`createPreviewAction` must return null** if params are incomplete
5. **Components use `useEnginePanels()`** which returns preview panels when active

---

## Testing Requirements (CRITICAL)

Every parameter operation MUST have tests that verify:

- [ ] Preview is created when operation starts
- [ ] Preview is discarded when `cancelOperation()` is called
- [ ] Operation state resets to idle after cancel
- [ ] Apply commits the preview correctly

---

## Declarative Validation

Use `SelectionRequirement` in `validators.ts`:

```typescript
{
  targetType: 'leaf-void',
  minCount: 1,
  maxCount: 1,
  description: 'Select a void',
  constraints: [{ type: 'must-be-leaf-void' }],
}
```

---

## Subdivision Axis Rules

| Axis | Disabled When |
|------|---------------|
| X | Left OR right face is open |
| Y | Top OR bottom face is open |
| Z | Front OR back face is open |
