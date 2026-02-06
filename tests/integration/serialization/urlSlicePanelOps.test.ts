/**
 * Integration test for panel operations in share links via urlSlice.
 *
 * This test exercises the REAL user code path:
 *   getShareableUrl() → URL string → loadFromUrl() → engine state
 *
 * Previous tests in urlState.test.ts manually extracted panel operations
 * and injected them into ProjectState, which bypassed the actual bug
 * where urlSlice.ts never called serializePanelOperations().
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// We must set up window BEFORE importing store modules, because the zustand
// store initializes on import and urlSlice references window.location.
const originalWindow = (globalThis as any).window;

// Set up minimal window mock before any store imports
(globalThis as any).window = {
  location: {
    href: 'http://localhost:3000/',
    search: '',
    hash: '',
    origin: 'http://localhost:3000',
    pathname: '/',
    protocol: 'http:',
    host: 'localhost:3000',
    hostname: 'localhost',
    port: '3000',
  },
  history: {
    replaceState: vi.fn(),
  },
};

describe('urlSlice panel operations integration', () => {
  beforeEach(() => {
    // Reset location for each test
    (globalThis as any).window.location = {
      href: 'http://localhost:3000/',
      search: '',
      hash: '',
      origin: 'http://localhost:3000',
      pathname: '/',
      protocol: 'http:',
      host: 'localhost:3000',
      hostname: 'localhost',
      port: '3000',
    };
    (globalThis as any).window.history = {
      replaceState: vi.fn((_state: any, _title: string, url: string) => {
        const parsed = new URL(url);
        (globalThis as any).window.location.href = parsed.href;
        (globalThis as any).window.location.search = parsed.search;
        (globalThis as any).window.location.hash = parsed.hash;
      }),
    };
  });

  afterEach(() => {
    if (originalWindow !== undefined) {
      (globalThis as any).window = originalWindow;
    }
  });

  it('should preserve cutout through getShareableUrl → loadFromUrl roundtrip', async () => {
    const { resetEngine, syncStoreToEngine, getEngine } = await import('../../../src/engine');
    const { useBoxStore } = await import('../../../src/store/useBoxStore');

    // Initialize engine with default config
    resetEngine();
    const store = useBoxStore.getState();
    syncStoreToEngine(store.config, store.faces, store.rootVoid);

    const engine = getEngine();

    // Find the front panel and add a cutout
    const panels = engine.generatePanelsFromNodes();
    const frontPanel = panels.panels.find((p: any) => p.source?.faceId === 'front');
    expect(frontPanel, 'Front panel should exist').toBeDefined();

    const cutoutSuccess = engine.dispatch({
      type: 'ADD_CUTOUT',
      targetId: 'main-assembly',
      payload: {
        panelId: frontPanel!.id,
        cutout: {
          id: 'share-link-test-cutout',
          type: 'rect' as const,
          center: { x: 10, y: 10 },
          width: 15,
          height: 10,
        },
      },
    });
    expect(cutoutSuccess, 'Cutout dispatch should succeed').toBe(true);

    // Verify cutout was applied
    const panelsWithCutout = engine.generatePanelsFromNodes();
    const frontWithCutout = panelsWithCutout.panels.find((p: any) => p.source?.faceId === 'front');
    const cutoutHolesBefore = frontWithCutout?.holes?.filter(
      (h: any) => h.source?.type === 'decorative'
    ) ?? [];
    expect(cutoutHolesBefore.length, 'Cutout should create a decorative hole').toBe(1);

    // === THE CRITICAL PATH: Call the store's getShareableUrl() ===
    const shareUrl = useBoxStore.getState().getShareableUrl();
    expect(shareUrl, 'Share URL should be non-empty').toBeTruthy();
    expect(shareUrl).toContain('?p=');

    // === Reset everything and load from the URL ===
    resetEngine();

    // Set window.location to the share URL so loadFromUrl() can read it
    const parsed = new URL(shareUrl);
    (globalThis as any).window.location.href = parsed.href;
    (globalThis as any).window.location.search = parsed.search;
    (globalThis as any).window.location.hash = parsed.hash || '';

    // Call the store's loadFromUrl()
    const loaded = useBoxStore.getState().loadFromUrl();
    expect(loaded, 'loadFromUrl should return true').toBe(true);

    // === Verify the cutout survived the roundtrip ===
    const reloadedEngine = getEngine();
    const reloadedPanels = reloadedEngine.generatePanelsFromNodes();
    const reloadedFront = reloadedPanels.panels.find((p: any) => p.source?.faceId === 'front');
    expect(reloadedFront, 'Front panel should exist after reload').toBeDefined();

    const reloadedCutoutHoles = reloadedFront?.holes?.filter(
      (h: any) => h.source?.type === 'decorative'
    ) ?? [];

    expect(
      reloadedCutoutHoles.length,
      'Cutout should survive getShareableUrl → loadFromUrl roundtrip'
    ).toBe(1);
  });

  it('should preserve corner fillet through getShareableUrl → loadFromUrl roundtrip', async () => {
    const { resetEngine, syncStoreToEngine, getEngine } = await import('../../../src/engine');
    const { useBoxStore } = await import('../../../src/store/useBoxStore');

    resetEngine();
    const store = useBoxStore.getState();
    syncStoreToEngine(store.config, store.faces, store.rootVoid);

    const engine = getEngine();

    // Disable top and left faces to make left:top corner eligible for fillet
    engine.dispatch({ type: 'TOGGLE_FACE', targetId: 'main-assembly', payload: { faceId: 'top' } });
    engine.dispatch({ type: 'TOGGLE_FACE', targetId: 'main-assembly', payload: { faceId: 'left' } });

    // Get baseline
    const panelsBefore = engine.generatePanelsFromNodes();
    const frontBefore = panelsBefore.panels.find((p: any) => p.source?.faceId === 'front');
    const pointsBefore = frontBefore!.outline.points.length;

    // Apply corner fillet
    engine.dispatch({
      type: 'SET_CORNER_FILLET',
      targetId: 'main-assembly',
      payload: { panelId: frontBefore!.id, corner: 'left:top', radius: 5 },
    });

    const panelsAfterFillet = engine.generatePanelsFromNodes();
    const frontAfterFillet = panelsAfterFillet.panels.find((p: any) => p.source?.faceId === 'front');
    const pointsAfterFillet = frontAfterFillet!.outline.points.length;
    expect(pointsAfterFillet, 'Fillet should increase outline points').toBeGreaterThan(pointsBefore);

    // Get share URL through the store
    const shareUrl = useBoxStore.getState().getShareableUrl();
    expect(shareUrl).toContain('?p=');

    // Reset and reload
    resetEngine();
    const parsed = new URL(shareUrl);
    (globalThis as any).window.location.href = parsed.href;
    (globalThis as any).window.location.search = parsed.search;
    (globalThis as any).window.location.hash = parsed.hash || '';

    const loaded = useBoxStore.getState().loadFromUrl();
    expect(loaded).toBe(true);

    // Verify fillet survived
    const reloadedEngine = getEngine();
    const reloadedPanels = reloadedEngine.generatePanelsFromNodes();
    const reloadedFront = reloadedPanels.panels.find((p: any) => p.source?.faceId === 'front');
    const pointsAfterReload = reloadedFront!.outline.points.length;

    expect(
      pointsAfterReload,
      `Corner fillet should survive roundtrip (expected ${pointsAfterFillet}, got ${pointsAfterReload})`
    ).toBe(pointsAfterFillet);
  });
});
