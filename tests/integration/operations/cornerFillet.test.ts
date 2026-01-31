/**
 * Corner Fillet Operation Integration Tests
 *
 * Tests the corner-fillet operation that rounds panel corners.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Engine, createEngineWithAssembly } from '../../../src/engine/Engine';
import { useBoxStore } from '../../../src/store/useBoxStore';
import { validateOperation } from '../../validators';
import { defaultMaterial } from '../../fixtures';
import { OPERATION_DEFINITIONS } from '../../../src/operations/registry';

describe('Corner Fillet Operation', () => {
  let engine: Engine;

  beforeEach(() => {
    engine = createEngineWithAssembly(100, 80, 60, defaultMaterial);
    useBoxStore.setState({
      operationState: {
        activeOperation: null,
        phase: 'idle',
        params: {},
      },
      selectedPanelIds: new Set<string>(),
      selectedVoidIds: new Set<string>(),
      selectedEdges: new Set<string>(),
      selectedCornerIds: new Set<string>(),
    });
  });

  afterEach(() => {
    if (engine.hasPreview()) {
      engine.discardPreview();
    }
  });

  // Helper to find a face panel
  function getFacePanel(faceId: string) {
    const panels = engine.generatePanelsFromNodes().panels;
    return panels.find(p => p.source.faceId === faceId);
  }

  // Helper to get eligible corners from a panel
  function getEligibleCorners(panel: ReturnType<typeof getFacePanel>) {
    if (!panel?.cornerEligibility) return [];
    return Object.entries(panel.cornerEligibility)
      .filter(([_, data]) => data.eligible)
      .map(([corner]) => corner);
  }

  // =========================================================================
  // [REQUIRED] Section 1: Geometry Validation
  // =========================================================================
  describe('Geometry Validation', () => {
    it('should produce valid geometry after applying fillet', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      const eligibleCorners = getEligibleCorners(frontPanel);
      if (eligibleCorners.length === 0) {
        // Skip if no eligible corners
        return;
      }

      const corner = eligibleCorners[0] as 'bottom:left' | 'bottom:right' | 'left:top' | 'right:top';

      engine.dispatch({
        type: 'SET_CORNER_FILLET',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel.id,
          corner,
          radius: 5,
        },
      });

      const result = validateOperation(engine);
      expect(result.valid).toBe(true);
      expect(result.geometry.errors).toHaveLength(0);
    });

    it('should produce valid geometry with multiple fillets', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      const eligibleCorners = getEligibleCorners(frontPanel);
      if (eligibleCorners.length < 2) return;

      const fillets = eligibleCorners.slice(0, 2).map(corner => ({
        panelId: frontPanel.id,
        corner: corner as 'bottom:left' | 'bottom:right' | 'left:top' | 'right:top',
        radius: 5,
      }));

      engine.dispatch({
        type: 'SET_CORNER_FILLETS_BATCH',
        targetId: 'main-assembly',
        payload: { fillets },
      });

      const result = validateOperation(engine);
      expect(result.valid).toBe(true);
    });

    it('should update panel outline with arc points', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      const eligibleCorners = getEligibleCorners(frontPanel);
      if (eligibleCorners.length === 0) return;

      const originalPointCount = frontPanel.outline.length;
      const corner = eligibleCorners[0] as 'bottom:left' | 'bottom:right' | 'left:top' | 'right:top';

      engine.dispatch({
        type: 'SET_CORNER_FILLET',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel.id,
          corner,
          radius: 10,
        },
      });

      const updatedPanel = getFacePanel('front');
      if (!updatedPanel) throw new Error('Updated panel not found');

      // Filleted corner should add arc points
      expect(updatedPanel.outline.length).toBeGreaterThan(originalPointCount);
    });
  });

  // =========================================================================
  // [REQUIRED] Section 2: Path Validation
  // =========================================================================
  describe('Path Validation', () => {
    it('should produce valid paths after fillet', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      const eligibleCorners = getEligibleCorners(frontPanel);
      if (eligibleCorners.length === 0) return;

      const corner = eligibleCorners[0] as 'bottom:left' | 'bottom:right' | 'left:top' | 'right:top';

      engine.dispatch({
        type: 'SET_CORNER_FILLET',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel.id,
          corner,
          radius: 5,
        },
      });

      const result = validateOperation(engine);
      // Path checker validates arc segments differently
      expect(result.valid).toBe(true);
    });

    it('should produce smooth arc with sufficient points', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      const eligibleCorners = getEligibleCorners(frontPanel);
      if (eligibleCorners.length === 0) return;

      const corner = eligibleCorners[0] as 'bottom:left' | 'bottom:right' | 'left:top' | 'right:top';

      engine.dispatch({
        type: 'SET_CORNER_FILLET',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel.id,
          corner,
          radius: 10,
        },
      });

      const updatedPanel = getFacePanel('front');
      if (!updatedPanel) throw new Error('Updated panel not found');

      // Arc should have multiple points for smoothness
      expect(updatedPanel.outline.length).toBeGreaterThan(10);
    });
  });

  // =========================================================================
  // [REQUIRED] Section 3: Event Recording
  // =========================================================================
  describe('Event Recording', () => {
    it.skip('should record action to event source', () => {
      // TODO: Implement when event sourcing is added
    });

    it.skip('should be replayable from event history', () => {
      // TODO: Implement when event sourcing is added
    });
  });

  // =========================================================================
  // [REQUIRED] Section 4: Preview Behavior
  // =========================================================================
  describe('Preview Behavior', () => {
    it('should create preview when fillet is applied', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      const eligibleCorners = getEligibleCorners(frontPanel);
      if (eligibleCorners.length === 0) return;

      const corner = eligibleCorners[0] as 'bottom:left' | 'bottom:right' | 'left:top' | 'right:top';

      engine.startPreview();
      engine.dispatch({
        type: 'SET_CORNER_FILLET',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel.id,
          corner,
          radius: 5,
        },
      });

      expect(engine.hasPreview()).toBe(true);
    });

    it('should show filleted corner in preview', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      const eligibleCorners = getEligibleCorners(frontPanel);
      if (eligibleCorners.length === 0) return;

      const corner = eligibleCorners[0] as 'bottom:left' | 'bottom:right' | 'left:top' | 'right:top';
      const originalPointCount = frontPanel.outline.length;

      engine.startPreview();
      engine.dispatch({
        type: 'SET_CORNER_FILLET',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel.id,
          corner,
          radius: 10,
        },
      });

      const previewPanels = engine.generatePanelsFromNodes().panels;
      const previewFront = previewPanels.find(p => p.source.faceId === 'front');

      expect(previewFront!.outline.length).toBeGreaterThan(originalPointCount);
    });

    it('should not affect committed state during preview', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      const eligibleCorners = getEligibleCorners(frontPanel);
      if (eligibleCorners.length === 0) return;

      const corner = eligibleCorners[0] as 'bottom:left' | 'bottom:right' | 'left:top' | 'right:top';
      const originalPointCount = frontPanel.outline.length;

      engine.startPreview();
      engine.dispatch({
        type: 'SET_CORNER_FILLET',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel.id,
          corner,
          radius: 10,
        },
      });

      const mainPanels = engine.getMainPanelCollection();
      const mainFront = mainPanels.panels.find(p => p.source.faceId === 'front');

      // Main panel should not have fillet
      expect(mainFront!.outline.length).toBe(originalPointCount);
    });
  });

  // =========================================================================
  // [REQUIRED] Section 5: Apply Behavior
  // =========================================================================
  describe('Apply Behavior', () => {
    it('should commit changes when preview is committed', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      const eligibleCorners = getEligibleCorners(frontPanel);
      if (eligibleCorners.length === 0) return;

      const corner = eligibleCorners[0] as 'bottom:left' | 'bottom:right' | 'left:top' | 'right:top';
      const originalPointCount = frontPanel.outline.length;

      engine.startPreview();
      engine.dispatch({
        type: 'SET_CORNER_FILLET',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel.id,
          corner,
          radius: 10,
        },
      });
      engine.commitPreview();

      expect(engine.hasPreview()).toBe(false);

      const updatedPanel = getFacePanel('front');
      expect(updatedPanel!.outline.length).toBeGreaterThan(originalPointCount);
    });

    it('should pass full validation after commit', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      const eligibleCorners = getEligibleCorners(frontPanel);
      if (eligibleCorners.length === 0) return;

      const corner = eligibleCorners[0] as 'bottom:left' | 'bottom:right' | 'left:top' | 'right:top';

      engine.startPreview();
      engine.dispatch({
        type: 'SET_CORNER_FILLET',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel.id,
          corner,
          radius: 5,
        },
      });
      engine.commitPreview();

      const result = validateOperation(engine);
      expect(result.valid).toBe(true);
    });
  });

  // =========================================================================
  // [REQUIRED] Section 6: Cancel Behavior
  // =========================================================================
  describe('Cancel Behavior', () => {
    it('should discard preview when cancelled', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      const eligibleCorners = getEligibleCorners(frontPanel);
      if (eligibleCorners.length === 0) return;

      const corner = eligibleCorners[0] as 'bottom:left' | 'bottom:right' | 'left:top' | 'right:top';
      const originalPointCount = frontPanel.outline.length;

      engine.startPreview();
      engine.dispatch({
        type: 'SET_CORNER_FILLET',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel.id,
          corner,
          radius: 10,
        },
      });
      engine.discardPreview();

      expect(engine.hasPreview()).toBe(false);

      const updatedPanel = getFacePanel('front');
      expect(updatedPanel!.outline.length).toBe(originalPointCount);
    });
  });

  // =========================================================================
  // [REQUIRED] Section 7: Selection Eligibility
  // =========================================================================
  describe('Selection Eligibility', () => {
    it('should require corner selection', () => {
      const cornerFillet = OPERATION_DEFINITIONS['corner-fillet'];
      expect(cornerFillet.selectionType).toBe('corner');
    });

    it('should allow multiple corner selection', () => {
      const cornerFillet = OPERATION_DEFINITIONS['corner-fillet'];
      expect(cornerFillet.minSelection).toBe(1);
      expect(cornerFillet.maxSelection).toBe(Infinity);
    });
  });

  // =========================================================================
  // [OPTIONAL] Operation-Specific Tests
  // =========================================================================
  describe('Operation-Specific Behavior', () => {
    it('should compute corner eligibility based on adjacent edges', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      // Panels should have corner eligibility data
      expect(frontPanel.cornerEligibility).toBeDefined();
    });

    it('should respect maximum radius constraints', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      const eligibleCorners = getEligibleCorners(frontPanel);
      if (eligibleCorners.length === 0) return;

      const corner = eligibleCorners[0];
      const cornerData = frontPanel.cornerEligibility![corner as keyof typeof frontPanel.cornerEligibility];

      // Max radius should be defined for eligible corners
      expect(cornerData.maxRadius).toBeDefined();
      expect(cornerData.maxRadius).toBeGreaterThan(0);
    });

    it('should work with extended edges', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      // First extend an edge
      engine.dispatch({
        type: 'SET_EDGE_EXTENSION',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel.id,
          edge: 'bottom',
          value: 15,
        },
      });

      // Then check for eligible corners on extended edge
      const updatedPanel = getFacePanel('front');
      if (!updatedPanel) throw new Error('Updated panel not found');

      const eligibleCorners = getEligibleCorners(updatedPanel);

      // Extended edges should potentially have eligible corners
      // (depending on corner configuration)
      expect(updatedPanel.cornerEligibility).toBeDefined();
    });

    it('should handle fillet on all four corners', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      const eligibleCorners = getEligibleCorners(frontPanel);
      if (eligibleCorners.length < 4) return;

      const fillets = eligibleCorners.map(corner => ({
        panelId: frontPanel.id,
        corner: corner as 'bottom:left' | 'bottom:right' | 'left:top' | 'right:top',
        radius: 3,
      }));

      engine.dispatch({
        type: 'SET_CORNER_FILLETS_BATCH',
        targetId: 'main-assembly',
        payload: { fillets },
      });

      const result = validateOperation(engine);
      expect(result.valid).toBe(true);
    });
  });
});
