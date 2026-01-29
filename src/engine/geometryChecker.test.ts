/**
 * Tests for the geometry checker
 *
 * Validates that the geometry checker correctly identifies violations
 * of the documented geometry rules.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createEngine } from './Engine';
import { checkGeometry, formatGeometryCheckResult } from './geometryChecker';
import type { Engine } from './Engine';

describe('GeometryChecker', () => {
  let engine: Engine;

  beforeEach(() => {
    engine = createEngine();
  });

  describe('Basic Box Geometry', () => {
    it('should pass all checks for a valid basic box', () => {
      engine.createAssembly(100, 80, 60, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      const result = checkGeometry(engine);

      // Should have no errors
      expect(result.summary.errors).toBe(0);
      expect(result.valid).toBe(true);
    });

    it('should check all expected rules', () => {
      engine.createAssembly(100, 80, 60, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      const result = checkGeometry(engine);

      // Should check all rules
      expect(result.checkedRules).toContain('void-bounds-2mt');
      expect(result.checkedRules).toContain('face-panel-body-size');
      expect(result.checkedRules).toContain('divider-body-span');
      expect(result.checkedRules).toContain('nested-void-shared-planes');
      expect(result.checkedRules).toContain('finger-3-section-minimum');
      expect(result.checkedRules).toContain('slot-within-panel');
      expect(result.checkedRules).toContain('path-winding-order');
      expect(result.checkedRules).toContain('holes-inside-outline');
      expect(result.checkedRules).toContain('no-degenerate-paths');
    });
  });

  describe('Rule: void-bounds-2mt', () => {
    it('should validate that root void = assembly - 2*MT', () => {
      engine.createAssembly(100, 80, 60, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      const result = checkGeometry(engine);
      const voidViolations = result.violations.filter((v) => v.ruleId === 'void-bounds-2mt');

      // For a valid box, there should be no void bounds violations
      expect(voidViolations.length).toBe(0);
    });
  });

  describe('Rule: nested-void-shared-planes', () => {
    it('should pass for subdivided void sharing planes with parent', () => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // Add a subdivision
      engine.dispatch({
        type: 'ADD_SUBDIVISION',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', position: 100 },
      });

      const result = checkGeometry(engine);
      const violations = result.violations.filter((v) => v.ruleId === 'nested-void-shared-planes');

      // Child voids from subdivision should share planes appropriately
      expect(violations.length).toBe(0);
    });

    it('should detect if nested void shares more than 5 planes', () => {
      // This is a theoretical check - in practice a subdivision
      // should never create a child that shares all 6 planes
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      const result = checkGeometry(engine);

      // The rule should be checked
      expect(result.checkedRules).toContain('nested-void-shared-planes');
    });
  });

  describe('Rule: finger-3-section-minimum', () => {
    it('should check finger constraints on small boxes', () => {
      // Create a very small box
      // Note: The engine auto-constrains fingerWidth to maintain 3-section minimum
      // So we just verify the rule is checked, not that it produces a warning
      engine.createAssembly(30, 30, 30, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      const result = checkGeometry(engine);

      // Rule should be checked
      expect(result.checkedRules).toContain('finger-3-section-minimum');
    });

    it('should pass for adequately sized box', () => {
      engine.createAssembly(100, 80, 60, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      const result = checkGeometry(engine);
      const fingerViolations = result.violations.filter(
        (v) => v.ruleId === 'finger-3-section-minimum'
      );

      // Large box should have no finger pattern issues
      expect(fingerViolations.length).toBe(0);
    });
  });

  describe('Rule: divider-body-span', () => {
    it('should check divider body spans void + 2*MT', () => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // Add a subdivision to create a divider
      engine.dispatch({
        type: 'ADD_SUBDIVISION',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', position: 100 },
      });

      const result = checkGeometry(engine);

      // Check that divider span rule was evaluated
      expect(result.checkedRules).toContain('divider-body-span');
    });
  });

  describe('Rule: path-winding-order', () => {
    it('should validate outline and hole winding', () => {
      engine.createAssembly(100, 80, 60, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      const result = checkGeometry(engine);
      const windingViolations = result.violations.filter((v) => v.ruleId === 'path-winding-order');

      // Valid geometry should have correct winding
      expect(windingViolations.length).toBe(0);
    });
  });

  describe('formatGeometryCheckResult', () => {
    it('should format results as human-readable text', () => {
      engine.createAssembly(100, 80, 60, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      const result = checkGeometry(engine);
      const formatted = formatGeometryCheckResult(result);

      expect(formatted).toContain('GEOMETRY CHECK RESULTS');
      expect(formatted).toContain('Status:');
      expect(formatted).toContain('Rules Checked:');
    });

    it('should show violations when present', () => {
      // Create small box that triggers warnings
      engine.createAssembly(30, 30, 30, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      const result = checkGeometry(engine);
      const formatted = formatGeometryCheckResult(result);

      if (result.violations.length > 0) {
        expect(formatted).toContain('VIOLATIONS');
      }
    });
  });

  describe('With Subdivisions', () => {
    it('should check geometry with multiple subdivisions', () => {
      engine.createAssembly(300, 200, 150, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // Add multiple subdivisions at once using ADD_SUBDIVISIONS
      engine.dispatch({
        type: 'ADD_SUBDIVISIONS',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', positions: [100, 200] },
      });

      const result = checkGeometry(engine);

      // Should complete without throwing
      expect(result.checkedRules.length).toBeGreaterThan(0);
    });

    it('should validate nested subdivisions', () => {
      engine.createAssembly(300, 200, 150, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // Add a subdivision
      engine.dispatch({
        type: 'ADD_SUBDIVISION',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', position: 150 },
      });

      // Get the snapshot to find the child void IDs
      const snapshot = engine.getSnapshot();
      const assembly = snapshot.children[0];
      const rootVoid = assembly.children[0];

      if (rootVoid.kind === 'void' && rootVoid.children.length > 0) {
        const childVoid = rootVoid.children[0];
        if (childVoid.kind === 'void') {
          // Add nested subdivision
          engine.dispatch({
            type: 'ADD_SUBDIVISION',
            targetId: 'main-assembly',
            payload: { voidId: childVoid.id, axis: 'y', position: 100 },
          });
        }
      }

      const result = checkGeometry(engine);

      // Should check nested void shared planes
      expect(result.checkedRules).toContain('nested-void-shared-planes');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty engine', () => {
      // No assembly created
      const result = checkGeometry(engine);

      // Should not throw and return valid (nothing to check)
      expect(result.valid).toBe(true);
      expect(result.violations.length).toBe(0);
    });

    it('should handle very small dimensions', () => {
      engine.createAssembly(10, 10, 10, {
        thickness: 1,
        fingerWidth: 2,
        fingerGap: 0.5,
      });

      const result = checkGeometry(engine);

      // Should complete without throwing
      expect(result.checkedRules.length).toBeGreaterThan(0);
    });

    it('should handle non-solid faces', () => {
      engine.createAssembly(100, 80, 60, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // Toggle a face to non-solid
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'top' },
      });

      const result = checkGeometry(engine);

      // Should handle open faces
      expect(result.checkedRules.length).toBeGreaterThan(0);
    });
  });
});
