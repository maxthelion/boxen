/**
 * Push-Pull Preview Additive Bug Regression Tests
 *
 * These tests cover the bug where preview dimensions leak into the next preview
 * action, causing offsets to accumulate.
 *
 * Root cause: updateOperationParams() called engine.getSnapshot() while a preview
 * was active, reading preview-inflated dimensions. Then discardPreview()/startPreview()
 * followed, and the action was dispatched on top of already-inflated dimensions.
 *
 * Fix: Discard and restart preview BEFORE reading snapshot, so dimensions come
 * from the committed scene (fresh clone).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useBoxStore } from '../../store/useBoxStore';
import { getEngine, resetEngine, notifyEngineStateChanged } from '../../engine';
import type { MaterialConfig } from '../../engine/types';
import type { FaceId } from '../../types';

const defaultMaterial: MaterialConfig = {
  thickness: 3,
  fingerWidth: 10,
  fingerGap: 1.5,
};

/**
 * Set up global engine with a standard 100×80×60 box
 */
function setupEngine() {
  resetEngine();
  const engine = getEngine();
  engine.createAssembly(100, 80, 60, defaultMaterial);
  notifyEngineStateChanged();
  return engine;
}

describe('Push-Pull Preview - No Additive Accumulation', () => {
  beforeEach(() => {
    setupEngine();
    // Reset store operation state
    const store = useBoxStore.getState();
    store.cancelOperation();
  });

  it('changing offset from 10 to -2 should give original + (-2), not original + 10 + (-2)', () => {
    const engine = getEngine();
    const store = useBoxStore.getState();

    // Get the original committed width before any operation
    const originalWidth = 100;

    // Start a push-pull operation
    store.startOperation('push-pull');
    expect(engine.hasPreview()).toBe(true);

    // First update: set offset=10 on the right face
    store.updateOperationParams({
      faceId: 'right' as FaceId,
      offset: 10,
      mode: 'scale',
      assemblyId: 'main-assembly',
    });

    // Verify preview shows +10
    const previewSnapshot1 = engine.getSnapshot();
    const previewWidth1 = previewSnapshot1.children?.[0]?.props?.width;
    expect(previewWidth1).toBe(originalWidth + 10); // 110

    // Second update: change offset to -2
    store.updateOperationParams({
      faceId: 'right' as FaceId,
      offset: -2,
      mode: 'scale',
      assemblyId: 'main-assembly',
    });

    // Preview should show original + (-2) = 98, NOT original + 10 + (-2) = 108
    const previewSnapshot2 = engine.getSnapshot();
    const previewWidth2 = previewSnapshot2.children?.[0]?.props?.width;

    expect(previewWidth2).toBe(originalWidth + (-2)); // 98, NOT 108
  });

  it('applying after multiple offset changes uses the final offset from original', () => {
    const engine = getEngine();
    const store = useBoxStore.getState();

    const originalWidth = 100;

    store.startOperation('push-pull');

    // Three offset updates
    store.updateOperationParams({ faceId: 'right' as FaceId, offset: 20, mode: 'scale', assemblyId: 'main-assembly' });
    store.updateOperationParams({ faceId: 'right' as FaceId, offset: 5, mode: 'scale', assemblyId: 'main-assembly' });
    store.updateOperationParams({ faceId: 'right' as FaceId, offset: -10, mode: 'scale', assemblyId: 'main-assembly' });

    // Apply the operation
    store.applyOperation();

    // Committed state should be original + (-10) = 90, NOT original + 20 + 5 + (-10)
    const committedSnapshot = engine.getSnapshot();
    const committedWidth = committedSnapshot.children?.[0]?.props?.width;

    expect(committedWidth).toBe(originalWidth + (-10)); // 90
  });

  it('pressing +/- buttons multiple times should not compound offsets', () => {
    const engine = getEngine();
    const store = useBoxStore.getState();

    const originalHeight = 80;

    store.startOperation('push-pull');

    // Simulate pressing + button 3 times (each press updates the offset from 0 to some value)
    // In the UI, each button press calls updateOperationParams with a new absolute offset
    store.updateOperationParams({ faceId: 'top' as FaceId, offset: 5, mode: 'scale', assemblyId: 'main-assembly' });
    store.updateOperationParams({ faceId: 'top' as FaceId, offset: 5, mode: 'scale', assemblyId: 'main-assembly' });
    store.updateOperationParams({ faceId: 'top' as FaceId, offset: 5, mode: 'scale', assemblyId: 'main-assembly' });

    // Apply
    store.applyOperation();

    // With the fix: each update reads committed height (80), so committed+5=85
    // With the bug: first update gives 85, second reads 85 and gives 90, third gives 95
    const committedSnapshot = engine.getSnapshot();
    const committedHeight = committedSnapshot.children?.[0]?.props?.height;

    expect(committedHeight).toBe(originalHeight + 5); // 85 (same offset applied consistently)
  });

  it('no preview leak: committed scene unchanged after preview updates', () => {
    const engine = getEngine();
    const store = useBoxStore.getState();

    const originalWidth = 100;

    store.startOperation('push-pull');
    store.updateOperationParams({ faceId: 'right' as FaceId, offset: 50, mode: 'scale', assemblyId: 'main-assembly' });
    store.updateOperationParams({ faceId: 'right' as FaceId, offset: 25, mode: 'scale', assemblyId: 'main-assembly' });

    // Cancel without applying
    store.cancelOperation();

    // Committed scene should be unchanged
    const committedSnapshot = engine.getSnapshot();
    const committedWidth = committedSnapshot.children?.[0]?.props?.width;

    expect(committedWidth).toBe(originalWidth); // Still 100
    expect(engine.hasPreview()).toBe(false);
  });
});
