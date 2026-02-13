/**
 * Subdivide Operation Integration Tests
 *
 * Tests the subdivide operation that adds dividers to split voids.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Engine } from '../../../src/engine/Engine';
import { useBoxStore } from '../../../src/store/useBoxStore';
import { validateOperation } from '../../validators';
import { OPERATION_DEFINITIONS } from '../../../src/operations/registry';
import { generatePanelsFromEngine } from '../../../src/engine/panelBridge';
import { AssemblyBuilder } from '../../../src/builder';

describe('Subdivide Operation', () => {
  let engine: Engine;

  beforeEach(() => {
    ({ engine } = AssemblyBuilder.enclosedBox(100, 80, 60).build());
    // Reset store state
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
    it('should produce valid geometry after single X-axis subdivision', () => {
      engine.dispatch({
        type: 'ADD_SUBDIVISIONS',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', positions: [50] },
      });

      const result = validateOperation(engine);
      expect(result.valid).toBe(true);
      expect(result.geometry.errors).toHaveLength(0);
    });

    it('should produce valid geometry after Y-axis subdivision', () => {
      engine.dispatch({
        type: 'ADD_SUBDIVISIONS',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'y', positions: [40] },
      });

      const result = validateOperation(engine);
      expect(result.valid).toBe(true);
    });

    it('should produce valid geometry after Z-axis subdivision', () => {
      engine.dispatch({
        type: 'ADD_SUBDIVISIONS',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'z', positions: [30] },
      });

      const result = validateOperation(engine);
      expect(result.valid).toBe(true);
    });

    it('should produce valid geometry with multiple subdivisions on same axis', () => {
      engine.dispatch({
        type: 'ADD_SUBDIVISIONS',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', positions: [33, 66] },
      });

      const result = validateOperation(engine);
      expect(result.valid).toBe(true);
    });

    it('should create correct number of child voids', () => {
      engine.dispatch({
        type: 'ADD_SUBDIVISIONS',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', positions: [50] },
      });

      const snapshot = engine.getSnapshot();
      const assembly = snapshot.children[0];
      const rootVoid = assembly?.children.find((c: { kind: string }) => c.kind === 'void');
      expect(rootVoid?.children.length).toBe(2);
    });

    it('should create correct number of divider panels', () => {
      engine.dispatch({
        type: 'ADD_SUBDIVISIONS',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', positions: [33, 66] },
      });

      const panels = engine.generatePanelsFromNodes().panels;
      const dividers = panels.filter(p => p.source.type === 'divider');
      expect(dividers.length).toBe(2);
    });
  });

  // =========================================================================
  // [REQUIRED] Section 2: Path Validation
  // =========================================================================
  describe('Path Validation', () => {
    it('should produce axis-aligned paths with no diagonal segments', () => {
      engine.dispatch({
        type: 'ADD_SUBDIVISIONS',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', positions: [50] },
      });

      const result = validateOperation(engine);
      expect(result.paths?.errors ?? []).toHaveLength(0);
    });

    it('should have valid paths for all divider panels', () => {
      engine.dispatch({
        type: 'ADD_SUBDIVISIONS',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'z', positions: [30] },
      });

      const panels = engine.generatePanelsFromNodes().panels;
      const dividers = panels.filter(p => p.source.type === 'divider');

      for (const divider of dividers) {
        // Each divider should have at least 4 points (rectangular outline)
        expect(divider.outline.points.length).toBeGreaterThanOrEqual(4);
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
    it('should create preview when subdivision is applied', () => {
      engine.startPreview();
      engine.dispatch({
        type: 'ADD_SUBDIVISIONS',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', positions: [50] },
      });

      expect(engine.hasPreview()).toBe(true);
    });

    it('should show divider in preview panels', () => {
      engine.startPreview();
      engine.dispatch({
        type: 'ADD_SUBDIVISIONS',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', positions: [50] },
      });

      const previewPanels = engine.generatePanelsFromNodes().panels;
      const dividers = previewPanels.filter(p => p.source.type === 'divider');
      expect(dividers.length).toBe(1);
    });

    it('should not affect committed state during preview', () => {
      const originalPanels = engine.generatePanelsFromNodes().panels;
      const originalDividerCount = originalPanels.filter(p => p.source.type === 'divider').length;

      engine.startPreview();
      engine.dispatch({
        type: 'ADD_SUBDIVISIONS',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', positions: [50] },
      });

      // Main scene should still have no dividers
      const mainAssembly = engine.getMainScene().primaryAssembly;
      const mainPanels = mainAssembly ? generatePanelsFromEngine(mainAssembly) : { panels: [] };
      const mainDividerCount = mainPanels.panels.filter(p => p.source.type === 'divider').length;
      expect(mainDividerCount).toBe(originalDividerCount);
    });
  });

  // =========================================================================
  // [REQUIRED] Section 5: Apply Behavior
  // =========================================================================
  describe('Apply Behavior', () => {
    it('should commit changes when preview is committed', () => {
      engine.startPreview();
      engine.dispatch({
        type: 'ADD_SUBDIVISIONS',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', positions: [50] },
      });
      engine.commitPreview();

      expect(engine.hasPreview()).toBe(false);
      const panels = engine.generatePanelsFromNodes().panels;
      const dividers = panels.filter(p => p.source.type === 'divider');
      expect(dividers.length).toBe(1);
    });

    it('should pass full validation after commit', () => {
      engine.startPreview();
      engine.dispatch({
        type: 'ADD_SUBDIVISIONS',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', positions: [50] },
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
      const originalPanels = engine.generatePanelsFromNodes().panels;

      engine.startPreview();
      engine.dispatch({
        type: 'ADD_SUBDIVISIONS',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', positions: [50] },
      });
      engine.discardPreview();

      expect(engine.hasPreview()).toBe(false);
      const panels = engine.generatePanelsFromNodes().panels;
      expect(panels.length).toBe(originalPanels.length);
    });
  });

  // =========================================================================
  // [REQUIRED] Section 7: Selection Eligibility
  // =========================================================================
  describe('Selection Eligibility', () => {
    it('should require void selection', () => {
      // Subdivide operation requires selectionType: 'void'
      // This is enforced by the operation registry
      const subdivide = OPERATION_DEFINITIONS['subdivide'];
      expect(subdivide.selectionType).toBe('void');
    });

    it('should require exactly one void selected', () => {
      const subdivide = OPERATION_DEFINITIONS['subdivide'];
      expect(subdivide.minSelection).toBe(1);
      expect(subdivide.maxSelection).toBe(1);
    });
  });

  // =========================================================================
  // [OPTIONAL] Operation-Specific Tests
  // =========================================================================
  describe('Operation-Specific Behavior', () => {
    it('should create cross-lap joints when dividers intersect', () => {
      // First subdivision on X-axis
      engine.dispatch({
        type: 'ADD_SUBDIVISIONS',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', positions: [50] },
      });

      // Second subdivision on Z-axis in one of the child voids
      const snapshot = engine.getSnapshot();
      const assembly = snapshot.children[0];
      const rootVoid = assembly?.children.find((c: { kind: string }) => c.kind === 'void');
      const childVoid = rootVoid?.children[0];

      if (childVoid) {
        engine.dispatch({
          type: 'ADD_SUBDIVISIONS',
          targetId: 'main-assembly',
          payload: { voidId: childVoid.id, axis: 'z', positions: [30] },
        });
      }

      const result = validateOperation(engine);
      expect(result.valid).toBe(true);
    });

    it('should support grid subdivision with multiple axes', () => {
      engine.dispatch({
        type: 'ADD_GRID_SUBDIVISION',
        targetId: 'main-assembly',
        payload: {
          voidId: 'root',
          axes: [
            { axis: 'x', positions: [50] },
            { axis: 'z', positions: [30] },
          ],
        },
      });

      const result = validateOperation(engine);
      expect(result.valid).toBe(true);

      // Should create 4 child voids (2x2 grid)
      const snapshot = engine.getSnapshot();
      const assembly = snapshot.children[0];
      const rootVoid = assembly?.children.find((c: { kind: string }) => c.kind === 'void');
      expect(rootVoid?.children.length).toBe(4);
    });
  });
});
