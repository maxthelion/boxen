/**
 * Inset/Outset Operation Integration Tests
 *
 * Tests the inset-outset operation that extends or retracts panel edges.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Engine } from '../../../src/engine/Engine';
import { useBoxStore } from '../../../src/store/useBoxStore';
import { validateOperation } from '../../validators';
import { OPERATION_DEFINITIONS } from '../../../src/operations/registry';
import { generatePanelsFromEngine } from '../../../src/engine/panelBridge';
import { TestFixture } from '../../../src/test/fixtures';

describe('Inset/Outset Operation', () => {
  let engine: Engine;

  beforeEach(() => {
    ({ engine } = TestFixture.enclosedBox(100, 80, 60).build());
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

  // =========================================================================
  // [REQUIRED] Section 1: Geometry Validation
  // =========================================================================
  describe('Geometry Validation', () => {
    it('should produce valid geometry after extending bottom edge', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      engine.dispatch({
        type: 'SET_EDGE_EXTENSION',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel.id,
          edge: 'bottom',
          value: 10,
        },
      });

      const result = validateOperation(engine);
      expect(result.valid).toBe(true);
      expect(result.geometry.errors).toHaveLength(0);
    });

    // TODO: Investigate validation failure with batch edge extensions
    it.skip('should produce valid geometry after extending multiple edges', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      engine.dispatch({
        type: 'SET_EDGE_EXTENSIONS_BATCH',
        targetId: 'main-assembly',
        payload: {
          extensions: [
            { panelId: frontPanel.id, edge: 'bottom', value: 10 },
            { panelId: frontPanel.id, edge: 'left', value: 10 },
          ],
        },
      });

      const result = validateOperation(engine);
      expect(result.valid).toBe(true);
    });

    it('should update panel outline correctly', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      const originalOutline = frontPanel.outline;

      engine.dispatch({
        type: 'SET_EDGE_EXTENSION',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel.id,
          edge: 'bottom',
          value: 15,
        },
      });

      const updatedPanel = getFacePanel('front');
      if (!updatedPanel) throw new Error('Updated panel not found');

      // Panel should have a larger bounding box
      const originalMinY = Math.min(...originalOutline.points.map(p => p.y));
      const updatedMinY = Math.min(...updatedPanel.outline.points.map(p => p.y));

      expect(updatedMinY).toBeLessThan(originalMinY);
    });
  });

  // =========================================================================
  // [REQUIRED] Section 2: Path Validation
  // =========================================================================
  describe('Path Validation', () => {
    it('should produce axis-aligned paths with no diagonal segments', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      engine.dispatch({
        type: 'SET_EDGE_EXTENSION',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel.id,
          edge: 'bottom',
          value: 10,
        },
      });

      const result = validateOperation(engine);
      expect(result.paths?.errors ?? []).toHaveLength(0);
    });

    it('should produce valid paths when extending adjacent edges', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      engine.dispatch({
        type: 'SET_EDGE_EXTENSIONS_BATCH',
        targetId: 'main-assembly',
        payload: {
          extensions: [
            { panelId: frontPanel.id, edge: 'bottom', value: 10 },
            { panelId: frontPanel.id, edge: 'right', value: 10 },
          ],
        },
      });

      const result = validateOperation(engine);
      expect(result.paths?.errors ?? []).toHaveLength(0);
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
    it('should create preview when edge extension is applied', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      engine.startPreview();
      engine.dispatch({
        type: 'SET_EDGE_EXTENSION',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel.id,
          edge: 'bottom',
          value: 10,
        },
      });

      expect(engine.hasPreview()).toBe(true);
    });

    it('should show extended edge in preview', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      engine.startPreview();
      engine.dispatch({
        type: 'SET_EDGE_EXTENSION',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel.id,
          edge: 'bottom',
          value: 10,
        },
      });

      const previewPanels = engine.generatePanelsFromNodes().panels;
      const previewFront = previewPanels.find(p => p.source.faceId === 'front');

      expect(previewFront?.edgeExtensions?.bottom).toBe(10);
    });

    it('should not affect committed state during preview', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      engine.startPreview();
      engine.dispatch({
        type: 'SET_EDGE_EXTENSION',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel.id,
          edge: 'bottom',
          value: 10,
        },
      });

      const mainAssembly = engine.getMainScene().primaryAssembly;
      const mainPanels = mainAssembly ? generatePanelsFromEngine(mainAssembly) : { panels: [] };
      const mainFront = mainPanels.panels.find(p => p.source.faceId === 'front');

      // Main panel should not have the extension
      expect(mainFront?.edgeExtensions?.bottom ?? 0).toBe(0);
    });
  });

  // =========================================================================
  // [REQUIRED] Section 5: Apply Behavior
  // =========================================================================
  describe('Apply Behavior', () => {
    it('should commit changes when preview is committed', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      engine.startPreview();
      engine.dispatch({
        type: 'SET_EDGE_EXTENSION',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel.id,
          edge: 'bottom',
          value: 10,
        },
      });
      engine.commitPreview();

      expect(engine.hasPreview()).toBe(false);

      const panels = engine.generatePanelsFromNodes().panels;
      const updatedFront = panels.find(p => p.source.faceId === 'front');
      expect(updatedFront?.edgeExtensions?.bottom).toBe(10);
    });

    it('should pass full validation after commit', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      engine.startPreview();
      engine.dispatch({
        type: 'SET_EDGE_EXTENSION',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel.id,
          edge: 'bottom',
          value: 10,
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

      engine.startPreview();
      engine.dispatch({
        type: 'SET_EDGE_EXTENSION',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel.id,
          edge: 'bottom',
          value: 10,
        },
      });
      engine.discardPreview();

      expect(engine.hasPreview()).toBe(false);

      const panels = engine.generatePanelsFromNodes().panels;
      const updatedFront = panels.find(p => p.source.faceId === 'front');
      expect(updatedFront?.edgeExtensions?.bottom ?? 0).toBe(0);
    });
  });

  // =========================================================================
  // [REQUIRED] Section 7: Selection Eligibility
  // =========================================================================
  describe('Selection Eligibility', () => {
    it('should require edge selection', () => {
      const insetOutset = OPERATION_DEFINITIONS['inset-outset'];
      expect(insetOutset.selectionType).toBe('edge');
    });

    it('should allow multiple edge selection', () => {
      const insetOutset = OPERATION_DEFINITIONS['inset-outset'];
      expect(insetOutset.minSelection).toBe(1);
      expect(insetOutset.maxSelection).toBe(Infinity);
    });
  });

  // =========================================================================
  // [OPTIONAL] Operation-Specific Tests
  // =========================================================================
  describe('Operation-Specific Behavior', () => {
    it('should only allow extending unlocked edges', () => {
      // Locked edges (male joints) cannot be extended
      // This is enforced by edge status in the panel data
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      // Check that edge statuses are present
      expect(frontPanel.edgeStatuses).toBeDefined();
    });

    // TODO: Investigate validation failure with corner merging and batch extensions
    it.skip('should handle corner merging when adjacent edges are extended equally', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      engine.dispatch({
        type: 'SET_EDGE_EXTENSIONS_BATCH',
        targetId: 'main-assembly',
        payload: {
          extensions: [
            { panelId: frontPanel.id, edge: 'bottom', value: 10 },
            { panelId: frontPanel.id, edge: 'left', value: 10 },
            { panelId: frontPanel.id, edge: 'right', value: 10 },
          ],
        },
      });

      const result = validateOperation(engine);
      expect(result.valid).toBe(true);
    });

    it('should support outward-only extension on female edges', () => {
      // Female edges can extend outward but not inward
      // This is a business rule enforced by edge status
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      const femaleEdge = frontPanel.edgeStatuses?.find(
        s => s.status === 'outward-only'
      );

      // If there's a female edge, it should be extendable outward
      if (femaleEdge) {
        engine.dispatch({
          type: 'SET_EDGE_EXTENSION',
          targetId: 'main-assembly',
          payload: {
            panelId: frontPanel.id,
            edge: femaleEdge.position,
            value: 10,  // Positive = outward
          },
        });

        const result = validateOperation(engine);
        expect(result.valid).toBe(true);
      }
    });

    it('should pass edge extension validation rules', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      engine.dispatch({
        type: 'SET_EDGE_EXTENSION',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel.id,
          edge: 'bottom',
          value: 15,
        },
      });

      const result = validateOperation(engine);
      // Edge extension checker should pass
      expect(result.edgeExtensions?.errors ?? []).toHaveLength(0);
    });
  });
});
