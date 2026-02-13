/**
 * Edge Extension Overlap Integration Tests
 *
 * Tests that edge extensions on neighboring panels don't create
 * invalid 3D overlaps beyond expected geometry.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Engine } from '../../../src/engine/Engine';
import { validateOperation } from '../../validators';
import { checkOverlap, formatOverlapCheckResult } from '../../../src/engine/validators/OverlapChecker';
import { AssemblyBuilder } from '../../../src/builder';

describe('Edge Extension Overlap', () => {
  let engine: Engine;

  beforeEach(() => {
    ({ engine } = AssemblyBuilder.enclosedBox(100, 80, 60).build());
  });

  // Helper to find a face panel by faceId
  function getFacePanel(faceId: string) {
    const panels = engine.generatePanelsFromNodes().panels;
    return panels.find(p => p.source.faceId === faceId);
  }

  describe('Neighboring Panel Top Edge Extensions', () => {
    it('should pass overlap check when extending top edge of front panel by 20mm', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      engine.dispatch({
        type: 'SET_EDGE_EXTENSION',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel.id,
          edge: 'top',
          value: 20,
        },
      });

      const result = checkOverlap(engine);

      if (!result.valid) {
        console.log('Single panel extension overlap errors:');
        console.log(formatOverlapCheckResult(result));
      }

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should DETECT overlap when extending top edges of two neighboring panels (front + right) by 20mm', () => {
      const frontPanel = getFacePanel('front');
      const rightPanel = getFacePanel('right');

      if (!frontPanel) throw new Error('Front panel not found');
      if (!rightPanel) throw new Error('Right panel not found');

      // Extend top edge of front panel
      engine.dispatch({
        type: 'SET_EDGE_EXTENSION',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel.id,
          edge: 'top',
          value: 20,
        },
      });

      // Extend top edge of right panel (neighboring face)
      engine.dispatch({
        type: 'SET_EDGE_EXTENSION',
        targetId: 'main-assembly',
        payload: {
          panelId: rightPanel.id,
          edge: 'top',
          value: 20,
        },
      });

      const result = checkOverlap(engine);

      // This SHOULD be flagged as an error - adjacent panels extending the same edge
      // will have finger joints that clash at the corner
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].rule).toBe('overlap:conflicting-extensions');
      expect(result.errors[0].details.panelAFace).toBe('front');
      expect(result.errors[0].details.panelBFace).toBe('right');
      expect(result.errors[0].details.sharedEdge).toBe('top');
    });

    it('should DETECT overlaps when extending top edges of all four wall panels by 20mm', () => {
      const frontPanel = getFacePanel('front');
      const rightPanel = getFacePanel('right');
      const backPanel = getFacePanel('back');
      const leftPanel = getFacePanel('left');

      if (!frontPanel) throw new Error('Front panel not found');
      if (!rightPanel) throw new Error('Right panel not found');
      if (!backPanel) throw new Error('Back panel not found');
      if (!leftPanel) throw new Error('Left panel not found');

      // Extend top edges of all four wall panels
      const wallPanels = [frontPanel, rightPanel, backPanel, leftPanel];
      for (const panel of wallPanels) {
        engine.dispatch({
          type: 'SET_EDGE_EXTENSION',
          targetId: 'main-assembly',
          payload: {
            panelId: panel.id,
            edge: 'top',
            value: 20,
          },
        });
      }

      const result = checkOverlap(engine);

      // Should flag all 4 adjacent pairs (front-right, right-back, back-left, left-front)
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(4);
      expect(result.errors.every(e => e.rule === 'overlap:conflicting-extensions')).toBe(true);
    });

    it('should DETECT conflict in full validation when extending top edges of front + right by 20mm', () => {
      const frontPanel = getFacePanel('front');
      const rightPanel = getFacePanel('right');

      if (!frontPanel) throw new Error('Front panel not found');
      if (!rightPanel) throw new Error('Right panel not found');

      // Extend top edge of front panel
      engine.dispatch({
        type: 'SET_EDGE_EXTENSION',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel.id,
          edge: 'top',
          value: 20,
        },
      });

      // Extend top edge of right panel
      engine.dispatch({
        type: 'SET_EDGE_EXTENSION',
        targetId: 'main-assembly',
        payload: {
          panelId: rightPanel.id,
          edge: 'top',
          value: 20,
        },
      });

      // Run full validation including overlap checker
      const result = validateOperation(engine);

      // Check overlap detected the conflict
      expect(result.overlap?.valid).toBe(false);
      expect(result.overlap?.errors).toHaveLength(1);
      expect(result.overlap?.errors[0].rule).toBe('overlap:conflicting-extensions');

      // Check rules were checked
      expect(result.summary.rulesChecked).toContain('overlap:no-body-intersection');
      expect(result.summary.rulesChecked).toContain('overlap:conflicting-extensions');
    });
  });

  describe('Bug Fix Verification', () => {
    // This test is SKIPPED until Issue 001 is fixed.
    // Once the geometry generation properly applies corner ownership rules,
    // adjacent panels with extended edges should NOT overlap.
    // See: docs/issues/001-adjacent-edge-extension-overlap.md
    // See: src/utils/axisOwnership.ts (getOverlapLoser, calculateOverlapNotch)
    it.skip('should produce valid non-overlapping geometry when adjacent panels extend same edge (Issue 001)', () => {
      const frontPanel = getFacePanel('front');
      const rightPanel = getFacePanel('right');

      if (!frontPanel) throw new Error('Front panel not found');
      if (!rightPanel) throw new Error('Right panel not found');

      // Extend top edge of front panel
      engine.dispatch({
        type: 'SET_EDGE_EXTENSION',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel.id,
          edge: 'top',
          value: 20,
        },
      });

      // Extend top edge of right panel (neighboring face)
      engine.dispatch({
        type: 'SET_EDGE_EXTENSION',
        targetId: 'main-assembly',
        payload: {
          panelId: rightPanel.id,
          edge: 'top',
          value: 20,
        },
      });

      const result = checkOverlap(engine);

      // Once fixed, this should pass - panels should not overlap
      // The corner ownership rules in src/utils/axisOwnership.ts should ensure
      // one panel owns the corner and the other is inset by material thickness
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Corner Extension Scenarios', () => {
    it('should DETECT large extensions (50mm) on neighboring panels', () => {
      const frontPanel = getFacePanel('front');
      const rightPanel = getFacePanel('right');

      if (!frontPanel) throw new Error('Front panel not found');
      if (!rightPanel) throw new Error('Right panel not found');

      // Large extensions
      engine.dispatch({
        type: 'SET_EDGE_EXTENSION',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel.id,
          edge: 'top',
          value: 50,
        },
      });

      engine.dispatch({
        type: 'SET_EDGE_EXTENSION',
        targetId: 'main-assembly',
        payload: {
          panelId: rightPanel.id,
          edge: 'top',
          value: 50,
        },
      });

      const result = checkOverlap(engine);

      // Should detect the conflict
      expect(result.valid).toBe(false);
      expect(result.errors[0].rule).toBe('overlap:conflicting-extensions');
    });

    it('should handle extensions on multiple edges of the same panel', () => {
      const frontPanel = getFacePanel('front');
      if (!frontPanel) throw new Error('Front panel not found');

      // Extend top and bottom
      engine.dispatch({
        type: 'SET_EDGE_EXTENSION',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel.id,
          edge: 'top',
          value: 20,
        },
      });

      engine.dispatch({
        type: 'SET_EDGE_EXTENSION',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel.id,
          edge: 'bottom',
          value: 20,
        },
      });

      const result = checkOverlap(engine);

      expect(result.valid).toBe(true);
    });
  });
});
