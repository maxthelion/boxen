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

    it('should pass overlap check when extending top edges of two neighboring panels (front + right) by 20mm', () => {
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

      // Corner ownership is now properly handled: the loser yields by MT at the shared corner.
      // No geometry clash occurs.
      if (!result.valid) {
        console.log('Unexpected overlap errors:');
        console.log(formatOverlapCheckResult(result));
      }
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should pass overlap check when extending top edges of all four wall panels by 20mm', () => {
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

      // All 4 adjacent corners are now properly resolved via corner ownership rules.
      if (!result.valid) {
        console.log('Unexpected overlap errors:');
        console.log(formatOverlapCheckResult(result));
      }
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should pass full validation when extending top edges of front + right by 20mm', () => {
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

      // Corner ownership fix means no overlap errors
      expect(result.overlap?.valid).toBe(true);
      expect(result.overlap?.errors).toHaveLength(0);

      // Check rules were checked
      expect(result.summary.rulesChecked).toContain('overlap:no-body-intersection');
      expect(result.summary.rulesChecked).toContain('overlap:conflicting-extensions');
    });
  });

  describe('Bug Fix Verification', () => {
    // Issue 001 is now fixed: FacePanelNode.getExtensionCornerInsets() uses
    // axisOwnership rules to inset the loser's extended corner by MT,
    // preventing overlap at shared corners when adjacent panels extend the same edge.
    // See: src/utils/axisOwnership.ts (getOverlapLoser)
    // See: src/engine/nodes/FacePanelNode.ts (getExtensionCornerInsets)
    it('should produce valid non-overlapping geometry when adjacent panels extend same edge (Issue 001)', () => {
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
    it('should pass overlap check for large extensions (50mm) on neighboring panels', () => {
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

      // Corner ownership properly resolves the corner even for large extensions.
      if (!result.valid) {
        console.log('Unexpected overlap errors:');
        console.log(formatOverlapCheckResult(result));
      }
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
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
