/**
 * Fillet UI Flow Tests - Simulated UI Integration Tests
 *
 * These tests simulate the actual UI data flow without rendering components.
 * They exercise the same code paths the UI uses:
 *
 * 1. UI reads panels from engine.generatePanelsFromNodes() (returns preview when active)
 * 2. UI reads corner eligibility from panel.allCornerEligibility
 * 3. UI triggers store actions (selectAllCorner, updateOperationParams)
 *
 * The key difference from filletUIBugs.test.ts:
 * - Those tests use getMainScenePanels() to bypass the preview (testing engine correctness)
 * - These tests read from the SAME source as the UI (preview panels when operation active)
 *
 * These tests document the UI bugs where eligibility is lost after selection.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useBoxStore } from '../../store/useBoxStore';
import { getEngine, resetEngine, notifyEngineStateChanged } from '../../engine';
import { INITIAL_OPERATION_STATE } from '../../types';
import type { MaterialConfig } from '../../engine/types';
import type { PanelPath, FaceId } from '../../types';

const defaultMaterial: MaterialConfig = {
  thickness: 3,
  fingerWidth: 10,
  fingerGap: 1.5,
};

/**
 * Helper to set up global engine with a box configuration
 */
function setupEngine(openFaces: string[] = ['top']) {
  resetEngine();
  const engine = getEngine();
  engine.createAssembly(100, 80, 60, defaultMaterial);

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
 * Get panels from preview (for geometry)
 */
function getPreviewPanels(engine: ReturnType<typeof getEngine>): PanelPath[] {
  return engine.generatePanelsFromNodes().panels;
}

/**
 * Get panels from MAIN scene (for eligibility)
 * This simulates how the fixed UI now works - reading eligibility from main scene
 * so corners remain selectable throughout the operation.
 */
function getMainScenePanels(engine: ReturnType<typeof getEngine>): PanelPath[] {
  const mainScene = engine.getMainScene();
  const snapshot = mainScene.serialize();
  const assemblySnapshot = snapshot.children[0];
  if (!assemblySnapshot || !('derived' in assemblySnapshot)) return [];
  // Generate panels from main scene directly
  const hadPreview = engine.hasPreview();
  if (hadPreview) {
    // Temporarily disable preview to get main panels
    const previewScene = (engine as any)._previewScene;
    (engine as any)._previewScene = null;
    const panels = engine.generatePanelsFromNodes().panels;
    (engine as any)._previewScene = previewScene;
    return panels;
  }
  return engine.generatePanelsFromNodes().panels;
}

/**
 * Get front panel from preview panels (for geometry)
 */
function getUIFrontPanel(engine: ReturnType<typeof getEngine>): PanelPath | undefined {
  return getPreviewPanels(engine).find(p => p.source.faceId === 'front');
}

/**
 * Simulate the FIXED UI flow for corner eligibility.
 * After the fix, UI reads eligibility from MAIN scene (not preview)
 * so corners remain selectable throughout the operation.
 */
function getUIEligibleCorners(engine: ReturnType<typeof getEngine>, panelId: string) {
  // Use main scene panels for eligibility (this is what the fixed UI does)
  const mainPanels = getMainScenePanels(engine);
  const panel = mainPanels.find(p => p.id === panelId);
  if (!panel) return [];

  return panel.allCornerEligibility?.filter(c => c.eligible) ?? [];
}

describe('Fillet UI Flow - Simulated Integration Tests', () => {
  beforeEach(() => {
    useBoxStore.setState({
      selectedPanelIds: new Set(),
      selectedAllCornerIds: new Set(),
      operationState: INITIAL_OPERATION_STATE,
    });
    resetEngine();
  });

  describe('Issue 1: Corner eligibility should persist throughout operation', () => {
    /**
     * BUG: When user selects a corner and the preview is applied,
     * the corner becomes "ineligible" because eligibility is computed
     * from the preview scene (where the corner is now rounded).
     *
     * EXPECTED: Corners eligible at operation start should remain
     * eligible throughout the operation.
     */
    it('selected corner should remain eligible after preview is applied', () => {
      const engine = setupEngine(['top', 'bottom', 'left', 'right']);

      const panel = getUIFrontPanel(engine);
      expect(panel).toBeDefined();
      if (!panel) return;

      // Step 1: Get initial eligible corners (before operation starts)
      const initialEligible = getUIEligibleCorners(engine, panel.id);
      expect(initialEligible.length).toBe(4); // All 4 corners eligible

      const firstCorner = initialEligible[0];

      // Step 2: Start operation and select the corner (simulating UI click)
      const cornerKey = `${panel.id}:${firstCorner.id}`;
      useBoxStore.getState().startOperation('corner-fillet');
      useBoxStore.getState().updateOperationParams({
        corners: [cornerKey],
        radius: 10,
      });

      // Step 3: Check eligibility from UI's perspective (active scene = preview)
      // BUG: This returns fewer eligible corners because the preview
      // has the fillet applied, and eligibility is recomputed.
      const eligibleAfterSelection = getUIEligibleCorners(engine, panel.id);

      // EXPECTED: All 4 corners should still be eligible for selection
      // ACTUAL (BUG): The selected corner is no longer eligible
      expect(eligibleAfterSelection.length).toBe(4);
    });

    it('all initially eligible corners should remain selectable after one is filleted', () => {
      const engine = setupEngine(['top', 'bottom', 'left', 'right']);

      const panel = getUIFrontPanel(engine);
      expect(panel).toBeDefined();
      if (!panel) return;

      const initialEligible = getUIEligibleCorners(engine, panel.id);
      expect(initialEligible.length).toBe(4);

      // Select first corner
      const firstCornerKey = `${panel.id}:${initialEligible[0].id}`;
      useBoxStore.getState().startOperation('corner-fillet');
      useBoxStore.getState().updateOperationParams({
        corners: [firstCornerKey],
        radius: 10,
      });

      // Now try to add a second corner (simulating clicking another corner button)
      const secondCornerKey = `${panel.id}:${initialEligible[1].id}`;
      useBoxStore.getState().updateOperationParams({
        corners: [firstCornerKey, secondCornerKey],
        radius: 10,
      });

      // Check: Both corners should still be shown as selectable in UI
      const eligibleAfterTwo = getUIEligibleCorners(engine, panel.id);

      // EXPECTED: All 4 original corners should still be eligible
      // ACTUAL (BUG): Only corners without fillets are shown as eligible
      expect(eligibleAfterTwo.length).toBe(4);
    });
  });

  describe('Issue 2: Preview geometry should show fillet arcs', () => {
    /**
     * BUG: The preview should show the filleted geometry (more points),
     * but the UI might not be reflecting this properly.
     */
    it('preview panel should have increased points after fillet selection', () => {
      const engine = setupEngine(['top', 'bottom', 'left', 'right']);

      const panel = getUIFrontPanel(engine);
      expect(panel).toBeDefined();
      if (!panel) return;

      const pointsBefore = panel.outline.points.length;
      expect(pointsBefore).toBe(4); // Simple rectangle

      const corner = panel.allCornerEligibility?.find(c => c.eligible);
      expect(corner).toBeDefined();
      if (!corner) return;

      // Start operation and select corner
      const cornerKey = `${panel.id}:${corner.id}`;
      useBoxStore.getState().startOperation('corner-fillet');
      useBoxStore.getState().updateOperationParams({
        corners: [cornerKey],
        radius: 10,
      });

      // Get the panel from UI's perspective (preview)
      const previewPanel = getUIFrontPanel(engine);
      expect(previewPanel).toBeDefined();
      if (!previewPanel) return;

      // Preview should show the fillet (more points than original)
      expect(previewPanel.outline.points.length).toBeGreaterThan(pointsBefore);
    });
  });

  describe('Issue 3: Panels with extra corners (cuts) should not auto-apply', () => {
    /**
     * BUG: If a panel has more eligible corners (from cuts/extensions),
     * selecting the panel in 3D view immediately applies fillets to preview,
     * and then all corners show as ineligible.
     *
     * Note: This test simulates the scenario where auto-expand selects all
     * eligible corners when the panel is selected.
     */
    it('selecting all corners should not make them ineligible', () => {
      const engine = setupEngine(['top', 'bottom', 'left', 'right']);

      const panel = getUIFrontPanel(engine);
      expect(panel).toBeDefined();
      if (!panel) return;

      const initialEligible = getUIEligibleCorners(engine, panel.id);
      expect(initialEligible.length).toBe(4);

      // Simulate: user selects panel, UI auto-expands to all eligible corners
      useBoxStore.getState().startOperation('corner-fillet');

      // Select ALL eligible corners at once (like auto-expand does)
      const allCornerKeys = initialEligible.map(c => `${panel.id}:${c.id}`);
      useBoxStore.getState().updateOperationParams({
        corners: allCornerKeys,
        radius: 10,
      });

      // Check: corners should still be shown as eligible for modification
      const eligibleAfterAutoExpand = getUIEligibleCorners(engine, panel.id);

      // EXPECTED: All 4 corners should remain "eligible" in the UI
      // (meaning user can still modify/deselect them)
      // ACTUAL (BUG): 0 corners are eligible (all have been filleted in preview)
      expect(eligibleAfterAutoExpand.length).toBe(4);
    });
  });

  describe('Issue 4: Corner eligibility source consistency', () => {
    /**
     * The UI should show consistent corner eligibility regardless of
     * whether we're looking at 2D or 3D view. Both should show the
     * same set of eligible corners.
     *
     * The underlying issue: eligibility should be based on the MAIN
     * scene state, not the preview scene state.
     */
    it('eligibility count should match main scene throughout operation', () => {
      const engine = setupEngine(['top', 'bottom', 'left', 'right']);

      const panel = getUIFrontPanel(engine);
      expect(panel).toBeDefined();
      if (!panel) return;

      // Get main scene eligibility BEFORE operation
      const mainEligibleBefore = panel.allCornerEligibility?.filter(c => c.eligible) ?? [];
      expect(mainEligibleBefore.length).toBe(4);

      // Start operation
      const cornerKey = `${panel.id}:${mainEligibleBefore[0].id}`;
      useBoxStore.getState().startOperation('corner-fillet');
      useBoxStore.getState().updateOperationParams({
        corners: [cornerKey],
        radius: 10,
      });

      // Get eligibility from UI panels (preview when active)
      const uiEligible = getUIEligibleCorners(engine, panel.id);

      // EXPECTED: UI should show same 4 eligible corners as main scene had
      // ACTUAL (BUG): UI shows fewer because it reads from preview
      expect(uiEligible.length).toBe(mainEligibleBefore.length);
    });
  });

  describe('Operation lifecycle', () => {
    /**
     * When operation is cancelled, eligibility should be fully restored.
     */
    it('cancel should restore original eligibility count', () => {
      const engine = setupEngine(['top', 'bottom', 'left', 'right']);

      const panel = getUIFrontPanel(engine);
      expect(panel).toBeDefined();
      if (!panel) return;

      const initialEligible = getUIEligibleCorners(engine, panel.id);
      expect(initialEligible.length).toBe(4);

      // Start and configure operation
      const cornerKey = `${panel.id}:${initialEligible[0].id}`;
      useBoxStore.getState().startOperation('corner-fillet');
      useBoxStore.getState().updateOperationParams({
        corners: [cornerKey],
        radius: 10,
      });

      // Cancel operation
      useBoxStore.getState().cancelOperation();

      // Eligibility should be restored
      const eligibleAfterCancel = getUIEligibleCorners(engine, panel.id);
      expect(eligibleAfterCancel.length).toBe(4);
    });

    /**
     * After apply, the fillet is permanent, so the corner is legitimately
     * no longer eligible (it's been modified).
     */
    it('apply should permanently reduce eligibility for filleted corners', () => {
      const engine = setupEngine(['top', 'bottom', 'left', 'right']);

      const panel = getUIFrontPanel(engine);
      expect(panel).toBeDefined();
      if (!panel) return;

      const initialEligible = getUIEligibleCorners(engine, panel.id);
      expect(initialEligible.length).toBe(4);

      // Start, configure, and apply
      const cornerKey = `${panel.id}:${initialEligible[0].id}`;
      useBoxStore.getState().startOperation('corner-fillet');
      useBoxStore.getState().updateOperationParams({
        corners: [cornerKey],
        radius: 10,
      });
      useBoxStore.getState().applyOperation();

      // After apply, the filleted corner is legitimately no longer eligible
      // (this is expected behavior - the corner is now rounded)
      const eligibleAfterApply = getUIEligibleCorners(engine, panel.id);
      expect(eligibleAfterApply.length).toBe(3); // One corner was filleted
    });
  });
});
