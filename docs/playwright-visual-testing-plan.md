# Playwright Visual Testing Plan for Operations

## Overview

Add visual regression tests using Playwright to verify that operations produce correct visual output without rendering artifacts (broken extrusions, incorrect holes, misaligned geometry).

## Goals

1. **Catch visual regressions** - Detect when code changes break rendering
2. **Verify operation correctness** - Each operation should produce expected geometry
3. **Detect artifacts** - Holes rendering as extrusions, broken paths, triangulation failures
4. **Test preview and committed states** - Both phases should render correctly

---

## Test Structure

### Per-Operation Test Suite

Each operation gets a test file: `e2e/operations/{operation-id}.spec.ts`

```typescript
// e2e/operations/subdivide.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Subdivide Operation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for 3D scene to render
    await page.waitForSelector('canvas');
    await page.waitForTimeout(500); // Allow Three.js to settle
  });

  test('subdivide on X axis - preview', async ({ page }) => {
    // 1. Select root void
    await page.click('[data-testid="void-root"]');

    // 2. Activate subdivide tool
    await page.click('[data-testid="tool-subdivide"]');

    // 3. Set parameters (X axis, 2 compartments)
    await page.click('[data-testid="axis-x"]');
    await page.fill('[data-testid="compartment-count"]', '2');

    // 4. Visual snapshot of preview state
    await expect(page.locator('canvas')).toHaveScreenshot('subdivide-x-2-preview.png');
  });

  test('subdivide on X axis - applied', async ({ page }) => {
    // ... same setup ...

    // 5. Apply the operation
    await page.click('[data-testid="apply-button"]');

    // 6. Visual snapshot of committed state
    await expect(page.locator('canvas')).toHaveScreenshot('subdivide-x-2-applied.png');
  });

  test('subdivide creates valid panel geometry', async ({ page }) => {
    // ... apply subdivide ...

    // 7. Isolate the divider panel and check for artifacts
    await page.click('[data-testid="panel-divider-x"]');
    await page.click('[data-testid="isolate-panel"]');

    await expect(page.locator('canvas')).toHaveScreenshot('subdivide-x-divider-isolated.png');
  });
});
```

### Common Scenarios per Operation

| Operation | Scenarios to Test |
|-----------|-------------------|
| `subdivide` | Single axis (X, Y, Z), multiple compartments, grid (2-axis) |
| `push-pull` | Extend face, contract face, both directions |
| `scale` | Resize width/height/depth independently and together |
| `configure` | Change material thickness, finger width, assembly axis |
| `create-sub-assembly` | Basic creation, with clearance variations |
| `toggle-face` | Open/close each face type |
| `move` | Move divider panels along axis |

### Artifact Detection Tests

Dedicated tests for known problem areas:

```typescript
// e2e/artifacts/hole-rendering.spec.ts
test.describe('Hole Rendering Artifacts', () => {
  test('slots render as holes not extrusions', async ({ page }) => {
    // Create box with subdivision
    // Isolate face panel with slot
    // Screenshot should show slot as indentation, not protrusion
    await expect(page.locator('canvas')).toHaveScreenshot('slot-renders-as-hole.png');
  });

  test('cross-lap joints render correctly', async ({ page }) => {
    // Create grid subdivision (2x2)
    // Isolate a divider panel
    // Cross-lap slots should be visible as notches
    await expect(page.locator('canvas')).toHaveScreenshot('cross-lap-slots.png');
  });

  test('finger joints have consistent depth', async ({ page }) => {
    // Create basic box
    // Isolate corner view
    // Fingers should interlock properly
    await expect(page.locator('canvas')).toHaveScreenshot('finger-joint-corner.png');
  });
});
```

---

## Implementation Phases

### Phase 1: Setup

1. Install Playwright: `npm install -D @playwright/test`
2. Create `playwright.config.ts`:
   ```typescript
   import { defineConfig } from '@playwright/test';

   export default defineConfig({
     testDir: './e2e',
     use: {
       baseURL: 'http://localhost:5173',
       screenshot: 'only-on-failure',
     },
     webServer: {
       command: 'npm run dev',
       port: 5173,
       reuseExistingServer: !process.env.CI,
     },
     expect: {
       toHaveScreenshot: {
         maxDiffPixels: 100, // Allow small anti-aliasing differences
       },
     },
   });
   ```

3. Add test IDs to key UI elements:
   - Tool buttons: `data-testid="tool-{operation}"`
   - Palette controls: `data-testid="axis-x"`, `data-testid="apply-button"`
   - Tree items: `data-testid="void-{id}"`, `data-testid="panel-{id}"`

4. Add npm scripts:
   ```json
   {
     "test:e2e": "playwright test",
     "test:e2e:update": "playwright test --update-snapshots"
   }
   ```

### Phase 2: Core Operation Tests

Create test files for parameter operations:
- `e2e/operations/subdivide.spec.ts`
- `e2e/operations/push-pull.spec.ts`
- `e2e/operations/scale.spec.ts`
- `e2e/operations/configure.spec.ts`
- `e2e/operations/create-sub-assembly.spec.ts`
- `e2e/operations/move.spec.ts`

### Phase 3: Artifact Detection Tests

- `e2e/artifacts/hole-rendering.spec.ts`
- `e2e/artifacts/finger-joints.spec.ts`
- `e2e/artifacts/cross-lap-joints.spec.ts`
- `e2e/artifacts/panel-transforms.spec.ts`

### Phase 4: CI Integration

- Run on PR checks
- Store baseline snapshots in repo
- Fail on visual diff > threshold

---

## Test Helpers

### Camera Positioning

For consistent screenshots, control camera position:

```typescript
async function setCameraView(page: Page, view: 'front' | 'top' | 'iso') {
  await page.evaluate((v) => {
    // Access Three.js camera through window or exposed API
    window.__setDebugCameraView?.(v);
  }, view);
  await page.waitForTimeout(100); // Allow render
}
```

### State Reset

Reset to known state between tests:

```typescript
async function resetToDefaultBox(page: Page) {
  await page.evaluate(() => {
    window.__resetEngine?.();
  });
  await page.waitForTimeout(200);
}
```

### Expose Debug APIs

In development mode, expose helpers on window:

```typescript
// src/debug/testHelpers.ts
if (import.meta.env.DEV) {
  window.__resetEngine = () => engine.reset();
  window.__setDebugCameraView = (view) => { /* ... */ };
  window.__getEngineSnapshot = () => engine.getSnapshot();
}
```

---

## Screenshot Comparison Strategy

### Tolerance Settings

WebGL rendering can vary slightly between runs. Configure appropriate thresholds:

```typescript
expect: {
  toHaveScreenshot: {
    maxDiffPixels: 100,        // Allow minor anti-aliasing differences
    maxDiffPixelRatio: 0.01,   // Or 1% of pixels
    threshold: 0.2,            // Per-pixel color difference threshold
  },
}
```

### Baseline Management

- Store baselines in `e2e/screenshots/` (committed to repo)
- Update with `--update-snapshots` when intentional changes occur
- Review diffs in CI artifacts on failure

---

## Rule Addition

Add to `.claude/rules/testing.md`:

```markdown
## Visual Regression Tests (Playwright)

Every parameter operation must have Playwright visual tests covering:

1. **Preview state** - Screenshot during operation with parameters set
2. **Applied state** - Screenshot after committing the operation
3. **Isolated panel** - Screenshot of affected panel(s) in isolation

Run tests:
```bash
npm run test:e2e           # Run all visual tests
npm run test:e2e:update    # Update baseline screenshots
```

Test files: `e2e/operations/{operation-id}.spec.ts`
```

---

## Open Questions

1. **3D vs 2D tests** - Should we test both viewports or focus on 3D?
2. **Camera angles** - Fixed isometric view, or multiple angles per test?
3. **CI rendering** - Use headless Chrome, or xvfb for GPU rendering?
4. **Snapshot storage** - Git LFS for screenshot files, or separate artifact storage?
