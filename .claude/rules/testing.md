---
paths:
  - "src/**/*.test.ts"
  - "src/**/*.test.tsx"
  - "tests/**/*.test.ts"
---

# Testing Guide

This guide covers testing requirements for Boxen. All new features that modify geometry or operations MUST follow this checklist.

**Current Coverage:** See [Operations Test Coverage Audit](../../project-management/audits/2026-02-05-operations-test-coverage.md) for a matrix of operations vs testing criteria.

---

## Testing Philosophy: Outside-In

**We use outside-in testing.** This means:

1. **Start with user-visible outcomes** - What should the user see after the operation?
2. **Write tests for those outcomes first** - Before any implementation
3. **Work backward** to discover what needs to be built

### Why Outside-In?

**Inside-out (bottom-up)** tests individual functions, then composes them:
```
Test calculateMaxFilletRadius() → Test generateFilletArc() → Test applyFilletsToOutline()
```
Problem: All unit tests can pass while the feature is completely broken (wiring missing).

**Outside-in (top-down)** tests the user experience first:
```
Test "fillet operation increases outline points" → Fails → Implement until it passes
```
Benefit: Forces end-to-end wiring to work. Can't have a "passing" test suite with broken features.

### The Fillet Bug Lesson

We discovered a bug where fillet appeared to work but geometry never changed:
- ✅ Unit tests for `calculateMaxFilletRadius()` passed
- ✅ Unit tests for `generateFilletArc()` passed
- ✅ Tests for "preview created" passed
- ❌ But user saw no fillet - action handler was missing, data wasn't wired

An outside-in test would have caught this immediately:
```typescript
// This test MUST fail if feature is broken
expect(panel.outline.points.length).toBeGreaterThan(4);
```

### In Practice

When implementing a feature:
1. **Ask:** "What will the user see when this works?"
2. **Write a test** that asserts that user-visible outcome
3. **Run it** - it should fail
4. **Implement** until it passes

Do NOT start by writing unit tests for helper functions. Start with the outcome.

---

## Test Commands

```bash
npm run test        # Watch mode
npm run test:run    # Run once
npm run test:run -- path/to/file.test.ts  # Run specific file
```

---

## Testing Checklist for New Features

When implementing a new feature, verify it works from **multiple perspectives**:

### 1. Operations Integration Tests

Check that operations do the correct thing:

| Perspective | What to Test | Example Assertion |
|-------------|--------------|-------------------|
| **Edge rules** | Correct edge statuses after operation | `panel.edgeStatuses.find(e => e.position === 'top').status` |
| **Joints** | Finger joints generated correctly | `panel.outline.points.length > 4` (has joints) |
| **3D geometry** | Position, rotation, dimensions correct | `panel.transform.position`, `panel.width` |
| **Previews** | Preview shows correct geometry | Compare preview vs committed panel state |

### 2. Fixtures and Chains

Use TestFixture to quickly build up state by running a series of operations:

```typescript
import { TestFixture } from '../test/fixtures';

// Chain operations to build complex state
const { panel, engine } = TestFixture
  .basicBox(100, 80, 60)
  .withOpenFaces(['top', 'left'])           // Open two faces
  .withExtension('front', 'top', 20)        // Extend the top edge
  .panel('front')
  .build();

// Run checks on results to verify expected behavior
expect(panel.outline.points.length).toBeGreaterThan(4);  // Check number of points
expect(panel.edgeExtensions?.top).toBe(20);              // Check extension applied
```

### 3. Operations in the UI

Test the UI flow for operations:

| Step | What to Test | Where to Test |
|------|--------------|---------------|
| **1. Selection** | Items can be selected for operation | Store unit test |
| **2. Operation start** | Implicit vs explicit start works | Store/integration test |
| **3. Highlighting** | Correct items highlighted in view | Manual verification |
| **4. Proxy selections** | Select panel → eligible corners become targets | Integration test |
| **5. Preview & rollback** | Preview appears, cancel reverts | Operations test |

### 4. Simulated UI Flow Tests

**Problem:** Store-level tests can pass while the actual UI is broken. This happens when the UI reads data from a different source than tests check.

**Example:** The fillet bug where eligibility was computed from preview (making corners disappear) but tests checked main scene eligibility.

**Solution:** "Simulated UI flow" tests that read from the **same data sources** the UI uses:

```typescript
// BAD: Bypasses the preview to check main scene
function getMainScenePanels(engine) {
  // Temporarily nulls preview - NOT what UI does
}

// GOOD: Reads from same source as UI
function getUIPanels(engine) {
  // UI uses generatePanelsFromNodes() which returns preview when active
  return engine.generatePanelsFromNodes().panels;
}
```

**Pattern for simulated UI tests:**

```typescript
it('eligibility persists after selection', () => {
  // 1. Setup: Create engine state
  const engine = setupEngine();

  // 2. Get initial state from UI's perspective
  const panels = engine.generatePanelsFromNodes().panels;  // Same as useEnginePanels()
  const eligibleBefore = panel.allCornerEligibility?.filter(c => c.eligible);

  // 3. Trigger operation (same sequence as UI)
  useBoxStore.getState().startOperation('corner-fillet');
  useBoxStore.getState().updateOperationParams({ corners: [...], radius: 10 });

  // 4. Check from UI's perspective (preview is now active)
  const previewPanels = engine.generatePanelsFromNodes().panels;
  const eligibleAfter = previewPanel.allCornerEligibility?.filter(c => c.eligible);

  // 5. Assert UI behavior
  expect(eligibleAfter.length).toBe(eligibleBefore.length);
});
```

**Limitations:** This approach simulates the data flow but doesn't test:
- React component rendering
- DOM events (clicks, hover)
- CSS/visual state
- Component lifecycle effects

For higher-fidelity UI testing, consider:
- **jsdom + React Testing Library** - Renders components in simulated DOM
- **Playwright/Cypress** - Full browser E2E tests

These weren't implemented due to setup complexity, but may be needed if simulated tests prove inadequate.

---

## Required Tests by Feature Type

### Parameter Operations (push-pull, fillet, inset, etc.)

Every parameter operation MUST have tests that verify:

- [ ] **Preview is created** when operation starts
- [ ] **Preview shows correct geometry** (not just "exists")
- [ ] **Preview is discarded** when `cancelOperation()` is called
- [ ] **Operation state resets** to idle after cancel
- [ ] **Apply commits** the preview correctly
- [ ] **Geometry checker passes** after apply

```typescript
describe('My Operation', () => {
  beforeEach(() => {
    engine.discardPreview();
    useBoxStore.setState({ operationState: INITIAL_OPERATION_STATE });
  });

  it('should create preview with correct geometry', () => {
    const { panel, engine } = TestFixture
      .basicBox(100, 80, 60)
      .withOpenFaces(['top', 'left'])
      .panel('front')
      .build();

    const pointsBefore = panel.outline.points.length;

    engine.startPreview();
    engine.dispatch({
      type: 'MY_OPERATION_ACTION',
      targetId: 'main-assembly',
      payload: { panelId: panel.id, value: 10 },
    });

    const previewPanels = engine.generatePanelsFromNodes().panels;
    const previewPanel = previewPanels.find(p => p.id === panel.id);

    // Test GEOMETRY changed, not just that preview exists
    expect(previewPanel.outline.points.length).not.toBe(pointsBefore);
  });

  it('should cleanup preview on cancel', () => {
    startOperation('my-operation');
    updateOperationParams({ value: 10 });
    expect(engine.hasPreview()).toBe(true);

    cancelOperation();
    expect(engine.hasPreview()).toBe(false);
  });

  it('should produce valid geometry after apply', () => {
    // ... setup and apply operation
    const result = checkEngineGeometry(engine);
    expect(result.valid).toBe(true);
  });
});
```

### Engine Actions

Every new engine action MUST have:

- [ ] **Action handler implemented** in `Engine.ts` dispatch()
- [ ] **Data flows to affected nodes** (e.g., assembly → panel)
- [ ] **Geometry regeneration** picks up the changes
- [ ] **Integration test** verifying end-to-end flow

**Common failure mode:** Action defined in types but not implemented in Engine.ts, or data stored but not wired to panel generation.

---

## Permutation Testing

Use TestFixture permutations to test operations against multiple panel states:

```typescript
import { TestFixture, permute } from '../test/fixtures';

// Define permutation matrix
const matrix = permute({
  openFaces: [
    [],                           // Enclosed box
    ['top'],                      // Basic box
    ['top', 'left'],              // Two adjacent open
    ['top', 'bottom', 'left', 'right'],  // All sides open
  ],
});

describe.each(matrix)('Fillet eligibility: %s', (name, config) => {
  it('has expected eligible corners', () => {
    const { panel } = TestFixture
      .basicBox(100, 80, 60)
      .withOpenFaces(config.openFaces)
      .panel('front')
      .build();

    const eligible = panel.allCornerEligibility?.filter(c => c.eligible) ?? [];
    // Verify eligibility matches expectation for this configuration
  });
});
```

### Key Permutation Dimensions

| Dimension | Values to Test |
|-----------|---------------|
| **Open faces** | 0, 1, 2-adjacent, 2-opposite, 3, 4 |
| **Extensions** | 0, 1, 2-adjacent, all-4 |
| **Cutouts** | None, center, edge-proximal |
| **Panel type** | Face, divider, sub-assembly |

---

## What to Assert (User-Visible Outcomes)

**BAD:** Testing intermediate state
```typescript
// DON'T: Test internal data structures
expect(assembly._panelAllCornerFillets.has(panelId)).toBe(true);
```

**GOOD:** Testing user-visible outcomes
```typescript
// DO: Test what the user sees
expect(panel.outline.points.length).toBeGreaterThan(4);  // Fillet added arc points
expect(panel.holes.length).toBe(1);                      // Cutout created hole
expect(panel.edgeExtensions?.top).toBe(20);              // Extension applied
```

### Geometry Assertions

| Operation | What to Assert |
|-----------|---------------|
| **Fillet** | `outline.points.length` increased (arc points added) |
| **Extension** | `edgeExtensions.{edge}` has value, bounds changed |
| **Cutout** | `holes.length` increased, hole dimensions correct |
| **Subdivision** | New panels exist, cross-lap slots present |
| **Push-pull** | Assembly dimensions changed, panels regenerated |

---

## Test Structure

### Unit Tests (`tests/unit/`)

Test individual functions in isolation:
- Store actions
- Utility functions
- Validators

### Integration Tests (`tests/integration/` or `src/test/fixtures/*.test.ts`)

Test end-to-end flows:
- Engine dispatch → panel generation
- Operation lifecycle
- Geometry validation

### Geometry Checker Tests

All geometry-modifying operations must pass the geometry checker:

```typescript
import { checkEngineGeometry } from '../geometryChecker';

it('should produce valid geometry', () => {
  // ... perform operation

  const result = checkEngineGeometry(engine);
  expect(result.valid).toBe(true);
  expect(result.summary.errors).toBe(0);
});
```

---

## Common Failure Modes (Learned from Bugs)

### 1. Action Handler Missing

**Symptom:** Operation appears to work (no errors) but geometry doesn't change.

**Cause:** Action type defined in `types.ts` but not handled in `Engine.ts` dispatch().

**Prevention:** Integration test that verifies geometry changes, not just action success.

### 2. Data Not Wired to Panels

**Symptom:** Data stored in assembly but panel doesn't reflect it.

**Cause:** `computePanels()` or similar doesn't read the stored data.

**Prevention:** Test that panel snapshot contains expected data after operation.

### 3. Preview Scene Not Used

**Symptom:** Preview changes don't appear in UI.

**Cause:** Code modifies `_scene` instead of `_previewScene`, or `getActiveScene()` not used.

**Prevention:** Test that `engine.hasPreview()` is true and preview panels differ from main.

### 4. Eligibility Not Computed

**Symptom:** Corners/edges shown as eligible when they shouldn't be (or vice versa).

**Cause:** Eligibility calculation doesn't account for all edge cases.

**Prevention:** Permutation tests with various panel states.

---

## Selection Testing

Test selection at the store level (3D clicks can't be simulated in Node):

```typescript
it('should select panel', () => {
  const store = useBoxStore.getState();
  store.selectPanel('panel-uuid', false);  // false = not shift-click
  expect(useBoxStore.getState().selectedPanelIds.has('panel-uuid')).toBe(true);
});

it('should add to selection with shift-click', () => {
  store.selectPanel('panel-1', false);
  store.selectPanel('panel-2', true);  // true = shift-click
  expect(useBoxStore.getState().selectedPanelIds.size).toBe(2);
});

it('should expand panel selection to edges for inset tool', () => {
  store.selectPanel(panel.id, false);
  store.setActiveTool('inset');
  // Verify edges are selected (via useEffect in component)
  expect(useBoxStore.getState().selectedEdges.size).toBeGreaterThan(0);
});
```

---

## Proxy Selection Testing

Some operations use proxy selection (select a panel → its eligible sub-items become targets):

```typescript
it('selecting panel expands to eligible corners for fillet', () => {
  const { panel, engine } = TestFixture
    .basicBox(100, 80, 60)
    .withOpenFaces(['top', 'bottom', 'left', 'right'])
    .panel('front')
    .build();

  // Panel has 4 eligible corners
  const eligibleCorners = panel.allCornerEligibility?.filter(c => c.eligible) ?? [];
  expect(eligibleCorners.length).toBe(4);

  // Selecting the panel should make these corners targets
  useBoxStore.getState().selectPanel(panel.id, false);
  // Component logic expands this to corners for fillet tool
});
```

---

## Validator Tests

Tests in `src/operations/validators.test.ts`:

```typescript
describe('My Operation Validator', () => {
  it('returns valid for correct selection', () => {
    const result = validateMyOperation(validSelection);
    expect(result.valid).toBe(true);
    expect(result.derived).toBeDefined();
  });

  it('returns invalid with reason for wrong selection', () => {
    const result = validateMyOperation(invalidSelection);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('expected message');
  });
});
```

---

## Snapshot Access

Use correct snapshot structure:

```typescript
const snapshot = engine.getSnapshot();
const assembly = snapshot.children[0];  // NOT snapshot.assemblies[0]
const rootVoid = assembly.children[0];  // First child is root void
```

---

## Test-First Development (CRITICAL)

**Before implementing any feature**, write tests that FAIL. This is mandatory, not optional.

### Step 1: Clarify Expected Behavior

Before writing tests, **ask the user** to clarify expected behavior:

- What should the user see after the operation?
- What geometry changes are expected? (points added, bounds changed, holes created)
- What edge cases matter? (empty selection, already-modified panels, constraints)
- What permutations should work? (which panel states)

**Example questions to ask:**

> "Before I implement fillet, I need to understand the expected behavior:
> 1. When a fillet is applied with radius 10mm, how many arc points should be generated?
> 2. Should fillets work on panels that already have extensions?
> 3. What should happen if the user selects an ineligible corner?"

### Step 2: Write Failing Tests

Write tests that verify expected behavior. These tests MUST fail before implementation:

```typescript
describe('My New Feature', () => {
  it('should change geometry in expected way', () => {
    const { panel, engine } = TestFixture
      .basicBox(100, 80, 60)
      .withOpenFaces(['top', 'left'])
      .panel('front')
      .build();

    const pointsBefore = panel.outline.points.length;

    // This action doesn't exist yet - test will fail
    engine.dispatch({
      type: 'MY_NEW_ACTION',
      targetId: 'main-assembly',
      payload: { panelId: panel.id, value: 10 },
    });

    const updatedPanel = engine.generatePanelsFromNodes().panels
      .find(p => p.id === panel.id);

    // Assert the user-visible outcome
    expect(updatedPanel.outline.points.length).toBeGreaterThan(pointsBefore);
  });
});
```

### Step 3: Run Tests to Confirm Failure

```bash
npm run test:run -- path/to/my-feature.test.ts
```

The test should fail with a clear message like:
- `TypeError: Cannot read property 'outline' of undefined`
- `expected 4 to be greater than 4`

**If the test passes before implementation, it's testing the wrong thing.**

### Step 4: Implement Until Tests Pass

Now implement the feature. The tests guide what needs to be built.

### Why This Matters

The fillet bug we discovered happened because:
- We had tests that checked "action dispatched successfully" ✓
- We had tests that checked "preview was created" ✓
- We did NOT have tests that checked "geometry actually changed" ✗

Writing failing tests first forces you to think about **user-visible outcomes**, not internal state.

### Failure Test Template

When planning a feature, include this in your plan:

```markdown
## Failure Tests (to write before implementing)

| Test | Asserts | Expected Failure Reason |
|------|---------|------------------------|
| Action changes geometry | `points.length` changed | Action handler not implemented |
| Preview shows change | Preview panel differs from main | Data not wired to panels |
| Apply persists change | Committed panel has new geometry | Commit doesn't transfer data |
| Works on extended panel | Same assertions on extended fixture | Edge case not handled |
```
