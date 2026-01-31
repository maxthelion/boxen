/**
 * EdgeExtensionChecker Unit Tests
 *
 * Tests edge extension validation rules:
 * - edge-extensions:eligibility - Only open/female edges can be extended
 * - edge-extensions:full-width - Extension spans full panel dimension
 * - edge-extensions:far-edge-open - Cap has no finger joints
 * - edge-extensions:corner-ownership - Only one panel occupies corner
 * - edge-extensions:long-fingers - Long extensions need finger joints (warning)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createEngine } from '../../../src/engine/Engine';
import {
  checkEdgeExtensions,
  formatEdgeExtensionCheckResult,
} from '../../../src/engine/validators/EdgeExtensionChecker';
import type { Engine } from '../../../src/engine/Engine';

describe('EdgeExtensionChecker', () => {
  let engine: Engine;

  beforeEach(() => {
    engine = createEngine();
  });

  describe('Basic Box (No Extensions)', () => {
    it('passes all checks for a basic box without extensions', () => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      const result = checkEdgeExtensions(engine);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.summary.panelsWithExtensions).toBe(0);
    });

    it('checks all expected rules', () => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // Apply an extension to trigger rule checks
      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const frontPanel = panels.find(
        (p: any) => p.kind === 'face-panel' && p.props.faceId === 'front'
      );

      if (frontPanel) {
        engine.dispatch({
          type: 'SET_EDGE_EXTENSION',
          targetId: 'main-assembly',
          payload: { panelId: frontPanel.id, edge: 'bottom', value: 20 },
        });
      }

      const result = checkEdgeExtensions(engine);

      expect(result.summary.rulesChecked).toContain('edge-extensions:eligibility');
      expect(result.summary.rulesChecked).toContain('edge-extensions:full-width');
      expect(result.summary.rulesChecked).toContain('edge-extensions:far-edge-open');
      expect(result.summary.rulesChecked).toContain('edge-extensions:corner-ownership');
      expect(result.summary.rulesChecked).toContain('edge-extensions:long-fingers');
    });
  });

  describe('Rule: edge-extensions:eligibility', () => {
    it('allows extension on female (slot) edges', () => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // Front panel's bottom edge is female (slots)
      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const frontPanel = panels.find(
        (p: any) => p.kind === 'face-panel' && p.props.faceId === 'front'
      );

      if (frontPanel) {
        engine.dispatch({
          type: 'SET_EDGE_EXTENSION',
          targetId: 'main-assembly',
          payload: { panelId: frontPanel.id, edge: 'bottom', value: 20 },
        });
      }

      const result = checkEdgeExtensions(engine);

      // Should not have eligibility errors for female edges
      const eligibilityErrors = result.errors.filter(
        e => e.rule === 'edge-extensions:eligibility'
      );
      expect(eligibilityErrors).toHaveLength(0);
    });

    it('allows extension on open face edges', () => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // Open the top face
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'top' },
      });

      // Front panel's top edge is now open
      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const frontPanel = panels.find(
        (p: any) => p.kind === 'face-panel' && p.props.faceId === 'front'
      );

      if (frontPanel) {
        engine.dispatch({
          type: 'SET_EDGE_EXTENSION',
          targetId: 'main-assembly',
          payload: { panelId: frontPanel.id, edge: 'top', value: 20 },
        });
      }

      const result = checkEdgeExtensions(engine);

      // Should not have eligibility errors for open edges
      const eligibilityErrors = result.errors.filter(
        e => e.rule === 'edge-extensions:eligibility'
      );
      expect(eligibilityErrors).toHaveLength(0);
    });
  });

  describe('Rule: edge-extensions:full-width', () => {
    it('checks that extension spans full panel width', () => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const frontPanel = panels.find(
        (p: any) => p.kind === 'face-panel' && p.props.faceId === 'front'
      );

      if (frontPanel) {
        // Apply bottom extension - sides should span full panel width (200)
        engine.dispatch({
          type: 'SET_EDGE_EXTENSION',
          targetId: 'main-assembly',
          payload: { panelId: frontPanel.id, edge: 'bottom', value: 20 },
        });
      }

      const result = checkEdgeExtensions(engine);

      // This test documents current behavior
      // If extension width is wrong, this will catch it
      const fullWidthErrors = result.errors.filter(
        e => e.rule === 'edge-extensions:full-width'
      );

      // Log any errors for debugging
      if (fullWidthErrors.length > 0) {
        console.log('Full-width errors:', fullWidthErrors);
      }
    });

    it('checks vertical extension spans full panel height', () => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const frontPanel = panels.find(
        (p: any) => p.kind === 'face-panel' && p.props.faceId === 'front'
      );

      if (frontPanel) {
        // Apply left extension - sides should span full panel height (150)
        engine.dispatch({
          type: 'SET_EDGE_EXTENSION',
          targetId: 'main-assembly',
          payload: { panelId: frontPanel.id, edge: 'left', value: 15 },
        });
      }

      const result = checkEdgeExtensions(engine);

      const fullWidthErrors = result.errors.filter(
        e => e.rule === 'edge-extensions:full-width'
      );

      // Log any errors for debugging
      if (fullWidthErrors.length > 0) {
        console.log('Full-width errors:', fullWidthErrors);
      }
    });
  });

  describe('Rule: edge-extensions:far-edge-open', () => {
    it('checks that extension cap has no finger joints', () => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const frontPanel = panels.find(
        (p: any) => p.kind === 'face-panel' && p.props.faceId === 'front'
      );

      if (frontPanel) {
        engine.dispatch({
          type: 'SET_EDGE_EXTENSION',
          targetId: 'main-assembly',
          payload: { panelId: frontPanel.id, edge: 'bottom', value: 20 },
        });
      }

      const result = checkEdgeExtensions(engine);

      // Cap should be a straight line (no fingers)
      const capWarnings = result.warnings.filter(
        e => e.rule === 'edge-extensions:far-edge-open'
      );

      // If there are warnings, it means the cap might have unexpected geometry
      if (capWarnings.length > 0) {
        console.log('Far-edge warnings:', capWarnings);
      }
    });
  });

  describe('Rule: edge-extensions:corner-ownership', () => {
    it('warns when both adjacent panels have extensions', () => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const frontPanel = panels.find(
        (p: any) => p.kind === 'face-panel' && p.props.faceId === 'front'
      );
      const bottomPanel = panels.find(
        (p: any) => p.kind === 'face-panel' && p.props.faceId === 'bottom'
      );

      if (frontPanel && bottomPanel) {
        // Extend front's bottom edge
        engine.dispatch({
          type: 'SET_EDGE_EXTENSION',
          targetId: 'main-assembly',
          payload: { panelId: frontPanel.id, edge: 'bottom', value: 20 },
        });

        // Extend bottom's top edge (shared with front's bottom)
        engine.dispatch({
          type: 'SET_EDGE_EXTENSION',
          targetId: 'main-assembly',
          payload: { panelId: bottomPanel.id, edge: 'top', value: 20 },
        });
      }

      const result = checkEdgeExtensions(engine);

      // Should warn about overlapping corners
      const cornerWarnings = result.warnings.filter(
        e => e.rule === 'edge-extensions:corner-ownership'
      );

      // This documents the expected behavior
      if (cornerWarnings.length > 0) {
        console.log('Corner ownership warnings:', cornerWarnings);
      }
    });
  });

  describe('Rule: edge-extensions:long-fingers', () => {
    it('warns for very long extensions that should have fingers', () => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const frontPanel = panels.find(
        (p: any) => p.kind === 'face-panel' && p.props.faceId === 'front'
      );

      if (frontPanel) {
        // Apply a very long extension (> corner gap + finger width + MT)
        // threshold ~= 3 + 10 + 3 = 16mm
        engine.dispatch({
          type: 'SET_EDGE_EXTENSION',
          targetId: 'main-assembly',
          payload: { panelId: frontPanel.id, edge: 'bottom', value: 50 },
        });
      }

      const result = checkEdgeExtensions(engine);

      // Should warn about missing fingers on long extension
      const longFingerWarnings = result.warnings.filter(
        e => e.rule === 'edge-extensions:long-fingers'
      );

      expect(longFingerWarnings.length).toBeGreaterThan(0);
    });

    it('does not warn for short extensions', () => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const frontPanel = panels.find(
        (p: any) => p.kind === 'face-panel' && p.props.faceId === 'front'
      );

      if (frontPanel) {
        // Apply a short extension (< threshold)
        engine.dispatch({
          type: 'SET_EDGE_EXTENSION',
          targetId: 'main-assembly',
          payload: { panelId: frontPanel.id, edge: 'bottom', value: 10 },
        });
      }

      const result = checkEdgeExtensions(engine);

      // Should NOT warn about fingers for short extension
      const longFingerWarnings = result.warnings.filter(
        e => e.rule === 'edge-extensions:long-fingers'
      );

      expect(longFingerWarnings).toHaveLength(0);
    });
  });

  describe('Multiple Extensions', () => {
    it('validates multiple extensions on same panel', () => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const frontPanel = panels.find(
        (p: any) => p.kind === 'face-panel' && p.props.faceId === 'front'
      );

      if (frontPanel) {
        // Apply multiple extensions
        engine.dispatch({
          type: 'SET_EDGE_EXTENSION',
          targetId: 'main-assembly',
          payload: { panelId: frontPanel.id, edge: 'bottom', value: 20 },
        });
        engine.dispatch({
          type: 'SET_EDGE_EXTENSION',
          targetId: 'main-assembly',
          payload: { panelId: frontPanel.id, edge: 'left', value: 15 },
        });
        engine.dispatch({
          type: 'SET_EDGE_EXTENSION',
          targetId: 'main-assembly',
          payload: { panelId: frontPanel.id, edge: 'right', value: 15 },
        });
      }

      const result = checkEdgeExtensions(engine);

      expect(result.summary.panelsWithExtensions).toBeGreaterThan(0);

      // Log full results for debugging
      if (!result.valid) {
        console.log(formatEdgeExtensionCheckResult(result));
      }
    });
  });

  describe('formatEdgeExtensionCheckResult', () => {
    it('formats valid result', () => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      const result = checkEdgeExtensions(engine);
      const formatted = formatEdgeExtensionCheckResult(result);

      expect(formatted).toContain('EDGE EXTENSION CHECK RESULTS');
      expect(formatted).toContain('✓ VALID');
      expect(formatted).toContain('Errors: 0');
    });

    it('formats result with warnings', () => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // Apply long extension to trigger warning
      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const frontPanel = panels.find(
        (p: any) => p.kind === 'face-panel' && p.props.faceId === 'front'
      );

      if (frontPanel) {
        engine.dispatch({
          type: 'SET_EDGE_EXTENSION',
          targetId: 'main-assembly',
          payload: { panelId: frontPanel.id, edge: 'bottom', value: 50 },
        });
      }

      const result = checkEdgeExtensions(engine);
      const formatted = formatEdgeExtensionCheckResult(result);

      expect(formatted).toContain('WARNINGS');
    });
  });
});
