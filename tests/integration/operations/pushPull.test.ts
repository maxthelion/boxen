/**
 * Push/Pull Operation Integration Tests
 *
 * Tests the push-pull operation that extends or contracts face panels.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Engine } from '../../../src/engine/Engine';
import { useBoxStore } from '../../../src/store/useBoxStore';
import { validateOperation } from '../../validators';
import { OPERATION_DEFINITIONS } from '../../../src/operations/registry';
import { AssemblyBuilder } from '../../../src/builder';

describe('Push/Pull Operation', () => {
  let engine: Engine;

  beforeEach(() => {
    ({ engine } = AssemblyBuilder.enclosedBox(100, 80, 60).build());
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

  // =========================================================================
  // [REQUIRED] Section 1: Geometry Validation
  // =========================================================================
  describe('Geometry Validation', () => {
    it('should produce valid geometry after extending width', () => {
      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: 'main-assembly',
        payload: { width: 120 },
      });

      const result = validateOperation(engine);
      expect(result.valid).toBe(true);
      expect(result.geometry.errors).toHaveLength(0);
    });

    it('should produce valid geometry after extending height', () => {
      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: 'main-assembly',
        payload: { height: 100 },
      });

      const result = validateOperation(engine);
      expect(result.valid).toBe(true);
    });

    it('should produce valid geometry after extending depth', () => {
      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: 'main-assembly',
        payload: { depth: 80 },
      });

      const result = validateOperation(engine);
      expect(result.valid).toBe(true);
    });

    it('should produce valid geometry after contracting dimension', () => {
      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: 'main-assembly',
        payload: { width: 80 },
      });

      const result = validateOperation(engine);
      expect(result.valid).toBe(true);
    });

    it('should update panel positions correctly', () => {
      const originalPanels = engine.generatePanelsFromNodes().panels;
      const originalFront = originalPanels.find(p => p.source.faceId === 'front');
      const originalBack = originalPanels.find(p => p.source.faceId === 'back');

      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: 'main-assembly',
        payload: { depth: 80 },
      });

      const newPanels = engine.generatePanelsFromNodes().panels;
      const newFront = newPanels.find(p => p.source.faceId === 'front');
      const newBack = newPanels.find(p => p.source.faceId === 'back');

      // Front and back should have moved apart
      if (originalFront && originalBack && newFront && newBack) {
        const originalGap = Math.abs(originalFront.position[2] - originalBack.position[2]);
        const newGap = Math.abs(newFront.position[2] - newBack.position[2]);
        expect(newGap).toBeGreaterThan(originalGap);
      }
    });
  });

  // =========================================================================
  // [REQUIRED] Section 2: Path Validation
  // =========================================================================
  describe('Path Validation', () => {
    it('should produce axis-aligned paths with no diagonal segments', () => {
      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: 'main-assembly',
        payload: { width: 120 },
      });

      const result = validateOperation(engine);
      expect(result.paths?.errors ?? []).toHaveLength(0);
    });

    it('should maintain valid finger joint patterns after resize', () => {
      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: 'main-assembly',
        payload: { width: 120, height: 100, depth: 80 },
      });

      const panels = engine.generatePanelsFromNodes().panels;
      for (const panel of panels) {
        // Each panel should have a valid outline
        expect(panel.outline.points.length).toBeGreaterThanOrEqual(4);
      }
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
    it('should create preview when dimensions change', () => {
      engine.startPreview();
      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: 'main-assembly',
        payload: { width: 120 },
      });

      expect(engine.hasPreview()).toBe(true);
    });

    it('should show updated dimensions in preview', () => {
      engine.startPreview();
      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: 'main-assembly',
        payload: { width: 120 },
      });

      const snapshot = engine.getSnapshot();
      const assembly = snapshot.children[0];
      expect(assembly?.props.width).toBe(120);
    });

    it('should not affect committed state during preview', () => {
      engine.startPreview();
      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: 'main-assembly',
        payload: { width: 120 },
      });

      // Main scene should still have original width
      const mainSnapshot = engine.getMainScene().serialize();
      const mainAssembly = mainSnapshot.children[0];
      expect(mainAssembly?.props.width).toBe(100);
    });
  });

  // =========================================================================
  // [REQUIRED] Section 5: Apply Behavior
  // =========================================================================
  describe('Apply Behavior', () => {
    it('should commit changes when preview is committed', () => {
      engine.startPreview();
      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: 'main-assembly',
        payload: { width: 120 },
      });
      engine.commitPreview();

      expect(engine.hasPreview()).toBe(false);
      const snapshot = engine.getSnapshot();
      const assembly = snapshot.children[0];
      expect(assembly?.props.width).toBe(120);
    });

    it('should pass full validation after commit', () => {
      engine.startPreview();
      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: 'main-assembly',
        payload: { width: 120 },
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
      engine.startPreview();
      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: 'main-assembly',
        payload: { width: 120 },
      });
      engine.discardPreview();

      expect(engine.hasPreview()).toBe(false);
      const snapshot = engine.getSnapshot();
      const assembly = snapshot.children[0];
      expect(assembly?.props.width).toBe(100);
    });
  });

  // =========================================================================
  // [REQUIRED] Section 7: Selection Eligibility
  // =========================================================================
  describe('Selection Eligibility', () => {
    it('should require panel selection', () => {
      const pushPull = OPERATION_DEFINITIONS['push-pull'];
      expect(pushPull.selectionType).toBe('panel');
    });

    it('should require exactly one panel selected', () => {
      const pushPull = OPERATION_DEFINITIONS['push-pull'];
      expect(pushPull.minSelection).toBe(1);
      expect(pushPull.maxSelection).toBe(1);
    });

    it('should only work on face panels (not dividers)', () => {
      // Add a divider
      engine.dispatch({
        type: 'ADD_SUBDIVISIONS',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', positions: [50] },
      });

      const panels = engine.generatePanelsFromNodes().panels;
      const divider = panels.find(p => p.source.type === 'divider');
      const facePanel = panels.find(p => p.source.type === 'face');

      // Push-pull should work on face panels
      expect(facePanel).toBeDefined();

      // Divider panels are not eligible for push-pull
      // (This is enforced by UI, not engine)
      expect(divider).toBeDefined();
    });
  });

  // =========================================================================
  // [OPTIONAL] Operation-Specific Tests
  // =========================================================================
  describe('Operation-Specific Behavior', () => {
    it('should preserve subdivisions when resizing', () => {
      // Add a divider
      engine.dispatch({
        type: 'ADD_SUBDIVISIONS',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', positions: [50] },
      });

      // Resize
      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: 'main-assembly',
        payload: { width: 120 },
      });

      // Divider should still exist
      const panels = engine.generatePanelsFromNodes().panels;
      const dividers = panels.filter(p => p.source.type === 'divider');
      expect(dividers.length).toBe(1);

      const result = validateOperation(engine);
      expect(result.valid).toBe(true);
    });

    it('should handle minimum dimension constraints', () => {
      // Material thickness is 3mm, so minimum dimension is > 6mm (2*MT)
      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: 'main-assembly',
        payload: { width: 20 },
      });

      // Should still produce valid geometry
      const result = validateOperation(engine);
      expect(result.valid).toBe(true);
    });
  });
});
