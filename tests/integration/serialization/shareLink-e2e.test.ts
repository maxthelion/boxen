/**
 * End-to-end share link tests.
 *
 * These tests exercise the REAL user code path:
 *   engine state → getShareableUrl() → URL → loadFromUrl() → engine state
 *
 * They verify that ALL operation types survive the roundtrip, not just
 * the serialize/deserialize helpers. If an operation type is missing from
 * the serialization pipeline, these tests catch it.
 *
 * See postmortem: project-management/postmortems/2026-02-06-share-link-serialization-gaps.md
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Set up window BEFORE importing store modules (zustand initializes on import)
const originalWindow = (globalThis as any).window;

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

/** Helper: reset window.location for a fresh test */
const resetLocation = () => {
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
};

/** Helper: set window.location from a share URL so loadFromUrl() can read it */
const setLocationFromUrl = (url: string) => {
  const parsed = new URL(url);
  (globalThis as any).window.location.href = parsed.href;
  (globalThis as any).window.location.search = parsed.search;
  (globalThis as any).window.location.hash = parsed.hash || '';
};

describe('Share Link End-to-End', () => {
  beforeEach(() => {
    resetLocation();
  });

  afterEach(() => {
    if (originalWindow !== undefined) {
      (globalThis as any).window = originalWindow;
    }
  });

  it('should preserve a cutout through getShareableUrl → loadFromUrl', async () => {
    const { resetEngine, syncStoreToEngine, getEngine } = await import('../../../src/engine');
    const { useBoxStore } = await import('../../../src/store/useBoxStore');

    resetEngine();
    const store = useBoxStore.getState();
    syncStoreToEngine(store.config, store.faces, store.rootVoid);

    const engine = getEngine();
    const panels = engine.generatePanelsFromNodes();
    const frontPanel = panels.panels.find((p: any) => p.source?.faceId === 'front');
    expect(frontPanel, 'Front panel should exist').toBeDefined();

    engine.dispatch({
      type: 'ADD_CUTOUT',
      targetId: 'main-assembly',
      payload: {
        panelId: frontPanel!.id,
        cutout: {
          id: 'test-cutout',
          type: 'rect' as const,
          center: { x: 10, y: 10 },
          width: 15,
          height: 10,
        },
      },
    });

    // Verify cutout exists before serialization
    const panelsBefore = engine.generatePanelsFromNodes();
    const frontBefore = panelsBefore.panels.find((p: any) => p.source?.faceId === 'front');
    const cutoutHolesBefore = frontBefore?.holes?.filter((h: any) => h.source?.type === 'decorative') ?? [];
    expect(cutoutHolesBefore.length, 'Cutout should exist before share').toBe(1);

    // Roundtrip through share link
    const shareUrl = useBoxStore.getState().getShareableUrl();
    expect(shareUrl).toContain('?p=');

    resetEngine();
    setLocationFromUrl(shareUrl);
    const loaded = useBoxStore.getState().loadFromUrl();
    expect(loaded, 'loadFromUrl should succeed').toBe(true);

    // Verify cutout survived
    const reloadedEngine = getEngine();
    const reloadedPanels = reloadedEngine.generatePanelsFromNodes();
    const reloadedFront = reloadedPanels.panels.find((p: any) => p.source?.faceId === 'front');
    expect(reloadedFront, 'Front panel should exist after reload').toBeDefined();

    const reloadedCutoutHoles = reloadedFront?.holes?.filter((h: any) => h.source?.type === 'decorative') ?? [];
    expect(reloadedCutoutHoles.length, 'Cutout should survive share link roundtrip').toBe(1);
  });

  it('should preserve a corner fillet through getShareableUrl → loadFromUrl', async () => {
    const { resetEngine, syncStoreToEngine, getEngine } = await import('../../../src/engine');
    const { useBoxStore } = await import('../../../src/store/useBoxStore');

    resetEngine();
    const store = useBoxStore.getState();
    syncStoreToEngine(store.config, store.faces, store.rootVoid);

    const engine = getEngine();

    // Disable top and left to make left:top corner eligible
    engine.dispatch({ type: 'TOGGLE_FACE', targetId: 'main-assembly', payload: { faceId: 'top' } });
    engine.dispatch({ type: 'TOGGLE_FACE', targetId: 'main-assembly', payload: { faceId: 'left' } });

    const panels = engine.generatePanelsFromNodes();
    const frontPanel = panels.panels.find((p: any) => p.source?.faceId === 'front');
    const pointsBefore = frontPanel!.outline.points.length;

    engine.dispatch({
      type: 'SET_CORNER_FILLET',
      targetId: 'main-assembly',
      payload: { panelId: frontPanel!.id, corner: 'left:top', radius: 5 },
    });

    const panelsAfter = engine.generatePanelsFromNodes();
    const frontAfter = panelsAfter.panels.find((p: any) => p.source?.faceId === 'front');
    const pointsAfterFillet = frontAfter!.outline.points.length;
    expect(pointsAfterFillet, 'Fillet should add arc points').toBeGreaterThan(pointsBefore);

    // Roundtrip
    const shareUrl = useBoxStore.getState().getShareableUrl();
    resetEngine();
    setLocationFromUrl(shareUrl);
    useBoxStore.getState().loadFromUrl();

    const reloadedPanels = getEngine().generatePanelsFromNodes();
    const reloadedFront = reloadedPanels.panels.find((p: any) => p.source?.faceId === 'front');
    expect(
      reloadedFront!.outline.points.length,
      'Corner fillet should survive share link roundtrip'
    ).toBe(pointsAfterFillet);
  });

  it('should preserve a custom edge path through getShareableUrl → loadFromUrl', async () => {
    const { resetEngine, syncStoreToEngine, getEngine } = await import('../../../src/engine');
    const { useBoxStore } = await import('../../../src/store/useBoxStore');

    resetEngine();
    const store = useBoxStore.getState();
    syncStoreToEngine(store.config, store.faces, store.rootVoid);

    const engine = getEngine();

    // Disable top face so the top edge of front panel is open (eligible for edge path)
    engine.dispatch({ type: 'TOGGLE_FACE', targetId: 'main-assembly', payload: { faceId: 'top' } });

    const panels = engine.generatePanelsFromNodes();
    const frontPanel = panels.panels.find((p: any) => p.source?.faceId === 'front');
    expect(frontPanel, 'Front panel should exist').toBeDefined();
    const pointsBefore = frontPanel!.outline.points.length;

    // Apply custom edge path on the top edge
    engine.dispatch({
      type: 'SET_EDGE_PATH',
      targetId: 'main-assembly',
      payload: {
        panelId: frontPanel!.id,
        path: {
          edge: 'top',
          baseOffset: 5,
          mirrored: false,
          points: [
            { t: 0, offset: 0 },
            { t: 0.25, offset: 0 },
            { t: 0.25, offset: 10 },
            { t: 0.5, offset: 10 },
            { t: 0.5, offset: 0 },
            { t: 1, offset: 0 },
          ],
        },
      },
    });

    // Verify edge path was applied (outline should change)
    const panelsAfter = engine.generatePanelsFromNodes();
    const frontAfter = panelsAfter.panels.find((p: any) => p.source?.faceId === 'front');
    const pointsAfterPath = frontAfter!.outline.points.length;
    expect(pointsAfterPath, 'Edge path should modify outline points').not.toBe(pointsBefore);

    // Roundtrip
    const shareUrl = useBoxStore.getState().getShareableUrl();
    resetEngine();
    setLocationFromUrl(shareUrl);
    useBoxStore.getState().loadFromUrl();

    const reloadedPanels = getEngine().generatePanelsFromNodes();
    const reloadedFront = reloadedPanels.panels.find((p: any) => p.source?.faceId === 'front');
    expect(reloadedFront, 'Front panel should exist after reload').toBeDefined();

    expect(
      reloadedFront!.outline.points.length,
      'Custom edge path should survive share link roundtrip'
    ).toBe(pointsAfterPath);
  });

  it('should preserve edge extensions through getShareableUrl → loadFromUrl', async () => {
    const { resetEngine, syncStoreToEngine, getEngine } = await import('../../../src/engine');
    const { useBoxStore } = await import('../../../src/store/useBoxStore');

    resetEngine();
    const store = useBoxStore.getState();
    syncStoreToEngine(store.config, store.faces, store.rootVoid);

    const engine = getEngine();

    // Disable top face so front panel's top edge can be extended
    engine.dispatch({ type: 'TOGGLE_FACE', targetId: 'main-assembly', payload: { faceId: 'top' } });

    const panels = engine.generatePanelsFromNodes();
    const frontPanel = panels.panels.find((p: any) => p.source?.faceId === 'front');
    expect(frontPanel, 'Front panel should exist').toBeDefined();

    // Apply edge extension
    engine.dispatch({
      type: 'SET_EDGE_EXTENSION',
      targetId: 'main-assembly',
      payload: { panelId: frontPanel!.id, edge: 'top', value: 15 },
    });

    // Verify extension was applied
    const panelsAfter = engine.generatePanelsFromNodes();
    const frontAfter = panelsAfter.panels.find((p: any) => p.source?.faceId === 'front');
    expect(frontAfter!.edgeExtensions.top, 'Top extension should be 15').toBe(15);

    // Roundtrip
    const shareUrl = useBoxStore.getState().getShareableUrl();
    resetEngine();
    setLocationFromUrl(shareUrl);
    useBoxStore.getState().loadFromUrl();

    const reloadedPanels = getEngine().generatePanelsFromNodes();
    const reloadedFront = reloadedPanels.panels.find((p: any) => p.source?.faceId === 'front');
    expect(reloadedFront, 'Front panel should exist after reload').toBeDefined();

    expect(
      reloadedFront!.edgeExtensions.top,
      'Edge extension should survive share link roundtrip (15mm top extension)'
    ).toBe(15);
  });

  it('should preserve all-corner fillets through getShareableUrl → loadFromUrl', async () => {
    const { resetEngine, syncStoreToEngine, getEngine } = await import('../../../src/engine');
    const { useBoxStore } = await import('../../../src/store/useBoxStore');

    resetEngine();
    const store = useBoxStore.getState();
    syncStoreToEngine(store.config, store.faces, store.rootVoid);

    const engine = getEngine();

    const panels = engine.generatePanelsFromNodes();
    const frontPanel = panels.panels.find((p: any) => p.source?.faceId === 'front');
    expect(frontPanel, 'Front panel should exist').toBeDefined();

    // Get an all-corner ID from the panel's eligibility
    const allCornerEligibility = frontPanel!.allCornerEligibility;
    expect(allCornerEligibility, 'Front panel should have all-corner eligibility').toBeDefined();
    expect(allCornerEligibility!.length, 'Should have eligible corners').toBeGreaterThan(0);

    const eligibleCorner = allCornerEligibility!.find((c: any) => c.maxRadius > 0);
    expect(eligibleCorner, 'Should have at least one eligible corner').toBeDefined();

    const pointsBefore = frontPanel!.outline.points.length;

    engine.dispatch({
      type: 'SET_ALL_CORNER_FILLET',
      targetId: 'main-assembly',
      payload: {
        panelId: frontPanel!.id,
        cornerId: eligibleCorner!.id,
        radius: Math.min(3, eligibleCorner!.maxRadius),
      },
    });

    const panelsAfter = engine.generatePanelsFromNodes();
    const frontAfter = panelsAfter.panels.find((p: any) => p.source?.faceId === 'front');
    const pointsAfterFillet = frontAfter!.outline.points.length;
    expect(pointsAfterFillet, 'All-corner fillet should change outline').not.toBe(pointsBefore);

    // Roundtrip
    const shareUrl = useBoxStore.getState().getShareableUrl();
    resetEngine();
    setLocationFromUrl(shareUrl);
    useBoxStore.getState().loadFromUrl();

    const reloadedPanels = getEngine().generatePanelsFromNodes();
    const reloadedFront = reloadedPanels.panels.find((p: any) => p.source?.faceId === 'front');
    expect(
      reloadedFront!.outline.points.length,
      'All-corner fillet should survive share link roundtrip'
    ).toBe(pointsAfterFillet);
  });

  it('KITCHEN SINK: should preserve all operation types simultaneously', async () => {
    const { resetEngine, syncStoreToEngine, getEngine } = await import('../../../src/engine');
    const { useBoxStore } = await import('../../../src/store/useBoxStore');

    resetEngine();
    const store = useBoxStore.getState();
    // Ensure all faces start solid (previous tests may have toggled faces via loadFromUrl)
    const allSolidFaces = store.faces.map((f: any) => ({ ...f, solid: true }));
    syncStoreToEngine(store.config, allSolidFaces, store.rootVoid);

    const engine = getEngine();

    // 1. Disable top face (enables edge paths and extensions on top edges)
    engine.dispatch({ type: 'SET_FACE_SOLID', targetId: 'main-assembly', payload: { faceId: 'top', solid: false } });
    // Also disable left face (enables corner fillets on left corners)
    engine.dispatch({ type: 'SET_FACE_SOLID', targetId: 'main-assembly', payload: { faceId: 'left', solid: false } });

    // 2. Add a subdivision
    const snapshot = engine.getSnapshot();
    const assembly = snapshot.children[0] as any;
    const rootVoid = assembly.children[0];
    engine.dispatch({
      type: 'ADD_SUBDIVISION',
      targetId: 'main-assembly',
      payload: { voidId: rootVoid.id, axis: 'x', position: 50 },
    });

    const panels = engine.generatePanelsFromNodes();
    const frontPanel = panels.panels.find((p: any) => p.source?.faceId === 'front');
    const rightPanel = panels.panels.find((p: any) => p.source?.faceId === 'right');
    expect(frontPanel).toBeDefined();
    expect(rightPanel).toBeDefined();

    // 3. Add cutout on front panel
    engine.dispatch({
      type: 'ADD_CUTOUT',
      targetId: 'main-assembly',
      payload: {
        panelId: frontPanel!.id,
        cutout: {
          id: 'kitchen-sink-cutout',
          type: 'rect' as const,
          center: { x: 10, y: -10 },
          width: 12,
          height: 8,
        },
      },
    });

    // 4. Add corner fillet on front panel (left:top corner, both faces disabled)
    engine.dispatch({
      type: 'SET_CORNER_FILLET',
      targetId: 'main-assembly',
      payload: { panelId: frontPanel!.id, corner: 'left:top', radius: 5 },
    });

    // 5. Add edge extension on right panel (top edge, since top face is off)
    engine.dispatch({
      type: 'SET_EDGE_EXTENSION',
      targetId: 'main-assembly',
      payload: { panelId: rightPanel!.id, edge: 'top', value: 20 },
    });

    // 6. Add custom edge path on front panel (top edge)
    engine.dispatch({
      type: 'SET_EDGE_PATH',
      targetId: 'main-assembly',
      payload: {
        panelId: frontPanel!.id,
        path: {
          edge: 'top',
          baseOffset: 3,
          mirrored: true,
          points: [
            { t: 0, offset: 0 },
            { t: 0.2, offset: 0 },
            { t: 0.2, offset: 8 },
            { t: 0.4, offset: 8 },
            { t: 0.4, offset: 0 },
            { t: 0.5, offset: 0 },
          ],
        },
      },
    });

    // Capture state before roundtrip
    const panelsBefore = engine.generatePanelsFromNodes();
    const frontBefore = panelsBefore.panels.find((p: any) => p.source?.faceId === 'front');
    const rightBefore = panelsBefore.panels.find((p: any) => p.source?.faceId === 'right');

    const frontOutlinePointsBefore = frontBefore!.outline.points.length;
    const frontCutoutsBefore = frontBefore?.holes?.filter((h: any) => h.source?.type === 'decorative') ?? [];
    const rightExtensionBefore = rightBefore!.edgeExtensions.top;

    expect(frontCutoutsBefore.length, 'Pre-roundtrip: cutout should exist').toBe(1);
    expect(rightExtensionBefore, 'Pre-roundtrip: edge extension should be 20').toBe(20);
    // Outline should reflect both fillet and edge path
    expect(frontOutlinePointsBefore, 'Pre-roundtrip: front outline should have many points').toBeGreaterThan(10);

    // Check subdivision exists
    const snapshotBefore = engine.getSnapshot();
    const assemblyBefore = snapshotBefore.children[0] as any;
    const rootVoidBefore = assemblyBefore.children[0];
    expect(rootVoidBefore.children.length, 'Pre-roundtrip: should have subdivision children').toBeGreaterThan(0);

    // === ROUNDTRIP ===
    const shareUrl = useBoxStore.getState().getShareableUrl();
    expect(shareUrl).toContain('?p=');

    resetEngine();
    setLocationFromUrl(shareUrl);
    const loaded = useBoxStore.getState().loadFromUrl();
    expect(loaded, 'loadFromUrl should succeed').toBe(true);

    // === VERIFY EVERYTHING SURVIVED ===
    const reloadedEngine = getEngine();
    const reloadedPanels = reloadedEngine.generatePanelsFromNodes();
    const reloadedFront = reloadedPanels.panels.find((p: any) => p.source?.faceId === 'front');
    const reloadedRight = reloadedPanels.panels.find((p: any) => p.source?.faceId === 'right');
    expect(reloadedFront, 'Front panel should exist after reload').toBeDefined();
    expect(reloadedRight, 'Right panel should exist after reload').toBeDefined();

    // Verify cutout
    const reloadedCutouts = reloadedFront?.holes?.filter((h: any) => h.source?.type === 'decorative') ?? [];
    expect(reloadedCutouts.length, 'Cutout should survive roundtrip').toBe(1);

    // Verify corner fillet + edge path (outline points should match)
    expect(
      reloadedFront!.outline.points.length,
      `Front outline points should match (fillet + edge path): expected ${frontOutlinePointsBefore}`
    ).toBe(frontOutlinePointsBefore);

    // Verify edge extension
    expect(
      reloadedRight!.edgeExtensions.top,
      'Edge extension should survive roundtrip (20mm top)'
    ).toBe(20);

    // Verify subdivision
    const reloadedSnapshot = reloadedEngine.getSnapshot();
    const reloadedAssembly = reloadedSnapshot.children[0] as any;
    const reloadedRootVoid = reloadedAssembly.children[0];
    expect(
      reloadedRootVoid.children.length,
      'Subdivision should survive roundtrip'
    ).toBeGreaterThan(0);

    // Verify faces (top and left should be off)
    const reloadedAssemblyNode = reloadedEngine.assembly;
    expect(reloadedAssemblyNode, 'Assembly should exist after reload').toBeDefined();
    expect(reloadedAssemblyNode!.isFaceSolid('top'), 'Top face should be off').toBe(false);
    expect(reloadedAssemblyNode!.isFaceSolid('left'), 'Left face should be off').toBe(false);
    expect(reloadedAssemblyNode!.isFaceSolid('front'), 'Front face should still be on').toBe(true);
  });
});
