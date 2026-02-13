/**
 * Fillet UI Bug Regression Tests
 *
 * These tests were created to document bugs reported in IMG_8255-8257 and follow the
 * testing model from operations-testing-strategy-exploration.md:
 *
 * 1. Create state via chained operations (using global engine)
 * 2. Start operation with various selections
 * 3. Check preview exists AND is correct
 * 4. Apply operation and check cleanup
 *
 * Original bugs documented (NOW FIXED - tests serve as regression tests):
 *
 * Bug 1: No preview of fillet effect - selecting corners shows them selected,
 *        but geometry doesn't show fillet arcs until Apply is clicked
 *        FIXED: ab0d562 - complete all-corners migration wiring for fillet operation
 *
 * Bug 2: Clicking corner buttons appears to immediately apply fillet
 *        (corner becomes ineligible after selection)
 *        FIXED: 89a1305 - check both adjacent edges for corner fillet eligibility
 *
 * Bug 3: Panels with extra corners (from cuts) - selecting the panel
 *        mistakenly applies fillet immediately, showing no eligible corners
 *        FIXED: 2735919 - pass holes to detectAllPanelCorners for cutout corner detection
 *
 * Bug 4: 2D view - selecting corners doesn't alter appearance in preview
 *        FIXED: Same wiring fix as Bug 1
 *
 * NOTE: These tests use the global engine singleton (via resetEngine/getEngine)
 * because they test store → engine interactions. Tests that only test engine
 * behavior directly can use AssemblyBuilder which creates its own engine.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useBoxStore } from '../../store/useBoxStore';
import { getEngine, resetEngine, notifyEngineStateChanged } from '../../engine';
import { INITIAL_OPERATION_STATE } from '../../types';
import type { MaterialConfig } from '../../engine/types';
import type { FaceId } from '../../types';

const defaultMaterial: MaterialConfig = {
  thickness: 3,
  fingerWidth: 10,
  fingerGap: 1.5,
};

/**
 * Helper to set up global engine with a box configuration
 */
function setupEngine(openFaces: string[] = ['top']) {
  // Reset to fresh engine
  resetEngine();
  const engine = getEngine();

  // Initialize with assembly using createAssembly (not dispatch)
  engine.createAssembly(100, 80, 60, defaultMaterial);

  // Open specified faces
  for (const face of openFaces) {
    engine.dispatch({
      type: 'TOGGLE_FACE',
      targetId: 'main-assembly',
      payload: { faceId: face as FaceId },
    });
  }

  notifyEngineStateChanged();

  return engine;
}

/**
 * Helper to get panels from main scene (not preview)
 */
function getMainScenePanels(engine: ReturnType<typeof getEngine>) {
  const hadPreview = engine.hasPreview();
  if (hadPreview) {
    const previewScene = (engine as any)._previewScene;
    (engine as any)._previewScene = null;
    const mainPanels = engine.generatePanelsFromNodes().panels;
    (engine as any)._previewScene = previewScene;
    return mainPanels;
  }
  return engine.generatePanelsFromNodes().panels;
}

/**
 * Helper to get front panel from engine
 */
function getFrontPanel(engine: ReturnType<typeof getEngine>) {
  const panels = engine.generatePanelsFromNodes().panels;
  return panels.find(p => p.source.faceId === 'front');
}

describe('Fillet UI Bugs', () => {
  beforeEach(() => {
    // Reset store state
    useBoxStore.setState({
      selectedPanelIds: new Set(),
      selectedAllCornerIds: new Set(),
      operationState: INITIAL_OPERATION_STATE,
    });

    // Reset engine
    resetEngine();
  });

  describe('Bug 1: Preview should show fillet geometry before Apply', () => {
    /**
     * Step 1: Create state (basic box with eligible corners)
     * Step 2: Start fillet operation with corner selected
     * Step 3: CHECK PREVIEW - geometry should show fillet arc
     *
     * This test FAILS if preview doesn't show the fillet geometry
     */
    it('preview panel outline should have arc points when fillet operation is active', () => {
      // Step 1: Create state - Panel with 4 eligible corners (all adjacent faces open)
      const engine = setupEngine(['top', 'bottom', 'left', 'right']);

      const panel = getFrontPanel(engine);
      expect(panel).toBeDefined();
      if (!panel) return;

      const eligibleCorners = panel.allCornerEligibility?.filter(c => c.eligible) ?? [];
      expect(eligibleCorners.length).toBe(4);

      const corner = eligibleCorners[0];
      const mainPanelPointsBefore = panel.outline.points.length;
      expect(mainPanelPointsBefore).toBe(4); // Simple rectangle

      // Step 2: Start fillet operation with corner and radius
      const cornerKey = `${panel.id}:${corner.id}`;
      useBoxStore.getState().startOperation('corner-fillet');
      useBoxStore.getState().updateOperationParams({
        corners: [cornerKey],
        radius: 10,
      });

      // Verify preview is active
      expect(engine.hasPreview()).toBe(true);

      // Step 3: CHECK PREVIEW - should show fillet arc
      const previewPanels = engine.generatePanelsFromNodes().panels;
      const previewPanel = previewPanels.find(p => p.source.faceId === 'front');

      expect(previewPanel).toBeDefined();
      if (!previewPanel) return;

      // BUG TEST: Preview should have more points (arc replaces corner)
      // Expected: > 4 points (arc adds ~8 points for one corner)
      // Bug: Preview has same 4 points as main (no fillet shown)
      expect(previewPanel.outline.points.length).toBeGreaterThan(mainPanelPointsBefore);
    });

    /**
     * Test that preview differs from main scene during operation
     */
    it('preview should differ from main scene while operation is active', () => {
      // Step 1: Create state
      const engine = setupEngine(['top', 'bottom', 'left', 'right']);

      const panel = getFrontPanel(engine);
      expect(panel).toBeDefined();
      if (!panel) return;

      const corner = panel.allCornerEligibility?.find(c => c.eligible);
      expect(corner).toBeDefined();
      if (!corner) return;

      // Step 2: Start operation
      const cornerKey = `${panel.id}:${corner.id}`;
      useBoxStore.getState().startOperation('corner-fillet');
      useBoxStore.getState().updateOperationParams({
        corners: [cornerKey],
        radius: 10,
      });

      // Step 3: Compare main vs preview
      const mainPanels = getMainScenePanels(engine);
      const previewPanels = engine.generatePanelsFromNodes().panels;

      const mainPanel = mainPanels.find(p => p.source.faceId === 'front');
      const previewPanel = previewPanels.find(p => p.source.faceId === 'front');

      expect(mainPanel).toBeDefined();
      expect(previewPanel).toBeDefined();
      if (!mainPanel || !previewPanel) return;

      // Main should still have 4 points (no fillet applied yet)
      expect(mainPanel.outline.points.length).toBe(4);

      // Preview should have more points (fillet arc shown)
      // BUG: Both have 4 points - preview doesn't show fillet
      expect(previewPanel.outline.points.length).toBeGreaterThan(4);
    });
  });

  describe('Bug 2: Corner selection should not immediately apply fillet', () => {
    /**
     * Selecting a corner should only affect preview, not main scene
     */
    it('selecting a corner should not change main scene geometry', () => {
      // Step 1: Create state
      const engine = setupEngine(['top', 'bottom', 'left', 'right']);

      const panel = getFrontPanel(engine);
      expect(panel).toBeDefined();
      if (!panel) return;

      const eligibleCorners = panel.allCornerEligibility?.filter(c => c.eligible) ?? [];
      expect(eligibleCorners.length).toBe(4);

      const pointsBefore = panel.outline.points.length;

      // Step 2: Select corner and start operation
      const corner = eligibleCorners[0];
      const cornerKey = `${panel.id}:${corner.id}`;
      useBoxStore.getState().selectAllCorner(panel.id, corner.id, false);
      useBoxStore.getState().startOperation('corner-fillet');
      useBoxStore.getState().updateOperationParams({
        corners: [cornerKey],
        radius: 10,
      });

      // Step 3: Check main scene is unchanged
      const mainPanels = getMainScenePanels(engine);
      const mainPanel = mainPanels.find(p => p.source.faceId === 'front');

      // Main scene should NOT have changed - fillet only in preview
      expect(mainPanel?.outline.points.length).toBe(pointsBefore);
    });

    /**
     * Corner eligibility for UI should come from MAIN scene, not preview
     */
    it('corner should remain eligible in UI after selection (computed from main)', () => {
      // Step 1: Create state
      const engine = setupEngine(['top', 'bottom', 'left', 'right']);

      const panel = getFrontPanel(engine);
      expect(panel).toBeDefined();
      if (!panel) return;

      const corner = panel.allCornerEligibility?.find(c => c.eligible);
      expect(corner).toBeDefined();
      if (!corner) return;

      // Step 2: Start operation with fillet
      const cornerKey = `${panel.id}:${corner.id}`;
      useBoxStore.getState().startOperation('corner-fillet');
      useBoxStore.getState().updateOperationParams({
        corners: [cornerKey],
        radius: 10,
      });

      // Step 3: Check that MAIN scene still has 4 eligible corners
      const mainPanels = getMainScenePanels(engine);
      const mainPanel = mainPanels.find(p => p.source.faceId === 'front');

      const mainEligible = mainPanel?.allCornerEligibility?.filter(c => c.eligible) ?? [];

      // All 4 should still be eligible in main (UI should allow selecting more)
      expect(mainEligible.length).toBe(4);
    });
  });

  describe('Bug 3: Panels with extra corners should not auto-apply fillet', () => {
    /**
     * Just selecting corners should NOT change any geometry
     */
    it('selecting corners should not change geometry before Apply', () => {
      // Step 1: Create state
      const engine = setupEngine(['top', 'bottom', 'left', 'right']);

      const panel = getFrontPanel(engine);
      expect(panel).toBeDefined();
      if (!panel) return;

      const pointsBefore = panel.outline.points.length;

      // Step 2: Select panel, then select all corners (simulating UI auto-expand)
      useBoxStore.getState().selectPanel(panel.id, false);

      const eligibleCorners = panel.allCornerEligibility?.filter(c => c.eligible) ?? [];
      for (const corner of eligibleCorners) {
        useBoxStore.getState().selectAllCorner(panel.id, corner.id, true);
      }

      // Note: We haven't started the operation yet, just selected corners

      // Step 3: Check main scene is unchanged
      const mainPanels = getMainScenePanels(engine);
      const mainPanel = mainPanels.find(p => p.source.faceId === 'front');

      expect(mainPanel?.outline.points.length).toBe(pointsBefore);
    });

    /**
     * All originally eligible corners should remain selectable during operation
     */
    it('all corners should remain selectable while operation is active', () => {
      // Step 1: Create state
      const engine = setupEngine(['top', 'bottom', 'left', 'right']);

      const panel = getFrontPanel(engine);
      expect(panel).toBeDefined();
      if (!panel) return;

      const eligibleCorners = panel.allCornerEligibility?.filter(c => c.eligible) ?? [];
      expect(eligibleCorners.length).toBe(4);

      // Step 2: Start operation with FIRST corner only
      const firstCorner = eligibleCorners[0];
      const cornerKey = `${panel.id}:${firstCorner.id}`;
      useBoxStore.getState().startOperation('corner-fillet');
      useBoxStore.getState().updateOperationParams({
        corners: [cornerKey],
        radius: 10,
      });

      // Step 3: Check main scene still has all 4 eligible
      const mainPanels = getMainScenePanels(engine);
      const mainPanel = mainPanels.find(p => p.source.faceId === 'front');
      const mainEligible = mainPanel?.allCornerEligibility?.filter(c => c.eligible) ?? [];

      expect(mainEligible.length).toBe(4);
    });
  });

  describe('Bug 4: Preview geometry should be consistent across views', () => {
    /**
     * Both 2D and 3D views should see the same preview geometry
     */
    it('preview panel data should be identical on repeated requests', () => {
      // Step 1: Create state
      const engine = setupEngine(['top', 'bottom', 'left', 'right']);

      const panel = getFrontPanel(engine);
      expect(panel).toBeDefined();
      if (!panel) return;

      const corner = panel.allCornerEligibility?.find(c => c.eligible);
      expect(corner).toBeDefined();
      if (!corner) return;

      // Step 2: Start fillet operation
      const cornerKey = `${panel.id}:${corner.id}`;
      useBoxStore.getState().startOperation('corner-fillet');
      useBoxStore.getState().updateOperationParams({
        corners: [cornerKey],
        radius: 10,
      });

      // Step 3: Get preview panels multiple times (simulating 2D and 3D views)
      const previewPanels1 = engine.generatePanelsFromNodes().panels;
      const previewPanels2 = engine.generatePanelsFromNodes().panels;

      const previewPanel1 = previewPanels1.find(p => p.source.faceId === 'front');
      const previewPanel2 = previewPanels2.find(p => p.source.faceId === 'front');

      expect(previewPanel1).toBeDefined();
      expect(previewPanel2).toBeDefined();
      if (!previewPanel1 || !previewPanel2) return;

      // Both should have the same geometry
      expect(previewPanel1.outline.points.length).toBe(previewPanel2.outline.points.length);

      // And both should show the fillet (more than 4 points)
      expect(previewPanel1.outline.points.length).toBeGreaterThan(4);
    });
  });

  describe('Step 4: Apply operation and check cleanup', () => {
    /**
     * Cancel should restore original geometry
     */
    it('cancel should restore original geometry (no fillet)', () => {
      // Step 1: Create state
      const engine = setupEngine(['top', 'bottom', 'left', 'right']);

      const panel = getFrontPanel(engine);
      expect(panel).toBeDefined();
      if (!panel) return;

      const pointsBefore = panel.outline.points.length;
      const corner = panel.allCornerEligibility?.find(c => c.eligible);
      expect(corner).toBeDefined();
      if (!corner) return;

      // Step 2: Start and configure fillet operation
      const cornerKey = `${panel.id}:${corner.id}`;
      useBoxStore.getState().startOperation('corner-fillet');
      useBoxStore.getState().updateOperationParams({
        corners: [cornerKey],
        radius: 10,
      });

      // Step 3: Verify preview has fillet (this might fail due to Bug 1)
      let panels = engine.generatePanelsFromNodes().panels;
      let currentPanel = panels.find(p => p.source.faceId === 'front');
      // Note: This assertion documents expected behavior
      expect(currentPanel?.outline.points.length).toBeGreaterThan(pointsBefore);

      // Step 4: Cancel and verify cleanup
      useBoxStore.getState().cancelOperation();

      panels = engine.generatePanelsFromNodes().panels;
      currentPanel = panels.find(p => p.source.faceId === 'front');
      expect(currentPanel?.outline.points.length).toBe(pointsBefore);
      expect(engine.hasPreview()).toBe(false);
    });

    /**
     * Apply should persist fillet geometry
     */
    it('apply should persist fillet geometry', () => {
      // Step 1: Create state
      const engine = setupEngine(['top', 'bottom', 'left', 'right']);

      const panel = getFrontPanel(engine);
      expect(panel).toBeDefined();
      if (!panel) return;

      const pointsBefore = panel.outline.points.length;
      const corner = panel.allCornerEligibility?.find(c => c.eligible);
      expect(corner).toBeDefined();
      if (!corner) return;

      // Step 2: Start and configure fillet operation
      const cornerKey = `${panel.id}:${corner.id}`;
      useBoxStore.getState().startOperation('corner-fillet');
      useBoxStore.getState().updateOperationParams({
        corners: [cornerKey],
        radius: 10,
      });

      // Step 3: Apply operation
      useBoxStore.getState().applyOperation();

      // Step 4: Verify cleanup and persistence
      expect(engine.hasPreview()).toBe(false);

      const panels = engine.generatePanelsFromNodes().panels;
      const finalPanel = panels.find(p => p.source.faceId === 'front');

      // Fillet should be persisted (more points than original)
      expect(finalPanel?.outline.points.length).toBeGreaterThan(pointsBefore);
    });
  });
});
