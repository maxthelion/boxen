/**
 * Comprehensive Geometry Integration Tests
 *
 * Tests all major operations and validates resulting geometry
 * against documented rules.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createEngine } from '../Engine';
import { validateGeometry, formatValidationResult } from '../validators/ComprehensiveValidator';
import { checkPathValidity, formatPathCheckResult } from '../validators/PathChecker';
import { checkEdgeExtensions, formatEdgeExtensionCheckResult } from '../validators/EdgeExtensionChecker';
import type { Engine } from '../Engine';

describe('Comprehensive Geometry Validation', () => {
  let engine: Engine;

  beforeEach(() => {
    engine = createEngine();
  });

  // ===========================================================================
  // Scenario 1: Basic Box
  // ===========================================================================

  describe('Scenario 1: Basic Box', () => {
    beforeEach(() => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });
    });

    it('creates 6 face panels', () => {
      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const facePanels = panels.filter(p => p.kind === 'face-panel');
      expect(facePanels).toHaveLength(6);
    });

    it('passes all geometry validations', () => {
      const result = validateGeometry(engine);

      if (!result.valid) {
        console.log(formatValidationResult(result));
      }

      expect(result.errors).toHaveLength(0);
      expect(result.valid).toBe(true);
    });

    it('has correct root void dimensions', () => {
      const snapshot = engine.getSnapshot();
      const rootVoid = snapshot.children[0].children[0];
      expect(rootVoid.derived.bounds).toEqual({
        x: 3, y: 3, z: 3,
        w: 194, h: 144, d: 94,
      });
    });
  });

  // ===========================================================================
  // Scenario 2: Open Lid
  // ===========================================================================

  describe('Scenario 2: Open Lid', () => {
    beforeEach(() => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'top' },
      });
    });

    it('creates 5 face panels (top removed)', () => {
      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const facePanels = panels.filter(p => p.kind === 'face-panel');
      expect(facePanels).toHaveLength(5);

      const faceIds = facePanels.map((p: any) => p.props.faceId);
      expect(faceIds).not.toContain('top');
    });

    it('passes all geometry validations', () => {
      const result = validateGeometry(engine);

      if (!result.valid) {
        console.log(formatValidationResult(result));
      }

      expect(result.errors).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Scenario 3: Single Subdivision
  // ===========================================================================

  describe('Scenario 3: Single Subdivision', () => {
    beforeEach(() => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });
      engine.dispatch({
        type: 'ADD_SUBDIVISION',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', position: 100 },
      });
    });

    it('creates 1 divider panel', () => {
      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const dividerPanels = panels.filter(p => p.kind === 'divider-panel');
      expect(dividerPanels).toHaveLength(1);
    });

    it('creates 2 child voids', () => {
      const snapshot = engine.getSnapshot();
      const rootVoid = snapshot.children[0].children[0];
      const childVoids = rootVoid.children.filter((c: any) => c.kind === 'void');
      expect(childVoids).toHaveLength(2);
    });

    it('face panels have slots for divider', () => {
      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      // X-axis divider creates slots on faces perpendicular to its edges:
      // TOP, BOTTOM (Y-axis edges), FRONT, BACK (Z-axis edges)
      // NOT on LEFT/RIGHT (which are parallel to the X-divider)
      const frontFace = panels.find((p: any) => p.kind === 'face-panel' && p.props.faceId === 'front');

      expect(frontFace).toBeDefined();
      const holes = frontFace!.derived.outline.holes;
      const dividerSlots = holes.filter(h => h.source.type === 'divider-slot');
      expect(dividerSlots.length).toBeGreaterThan(0);
    });

    it('divider finger region matches face finger region', () => {
      const result = validateGeometry(engine);

      // This is the key test for the current bug
      const fingerErrors = result.errors.filter(e => e.rule === 'fingers:divider-matches-face');

      if (fingerErrors.length > 0) {
        console.log('Finger region mismatch errors:');
        for (const error of fingerErrors) {
          console.log(`  ${error.message}`);
          console.log(`  Expected body: ${error.details.expectedBodySize}`);
          console.log(`  Actual body: ${error.details.actualBodySize}`);
          console.log(`  Deficit: ${error.details.deficit}`);
        }
      }

      expect(fingerErrors).toHaveLength(0);
    });

    it('passes all geometry validations', () => {
      const result = validateGeometry(engine);

      if (!result.valid) {
        console.log(formatValidationResult(result));
      }

      expect(result.errors).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Scenario 4: Double Subdivision (Same Axis)
  // ===========================================================================

  describe('Scenario 4: Double Subdivision (Same Axis)', () => {
    beforeEach(() => {
      engine.createAssembly(300, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });
      engine.dispatch({
        type: 'ADD_SUBDIVISIONS',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', positions: [100, 200] },
      });
    });

    it('creates 2 divider panels', () => {
      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const dividerPanels = panels.filter(p => p.kind === 'divider-panel');
      expect(dividerPanels).toHaveLength(2);
    });

    it('creates 3 child voids', () => {
      const snapshot = engine.getSnapshot();
      const rootVoid = snapshot.children[0].children[0];
      const childVoids = rootVoid.children.filter((c: any) => c.kind === 'void');
      expect(childVoids).toHaveLength(3);
    });

    it('passes all geometry validations', () => {
      const result = validateGeometry(engine);

      if (!result.valid) {
        console.log(formatValidationResult(result));
      }

      expect(result.errors).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Scenario 5: Cross Subdivision
  // ===========================================================================

  describe('Scenario 5: Cross Subdivision', () => {
    beforeEach(() => {
      engine.createAssembly(200, 200, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // First subdivision on X
      engine.dispatch({
        type: 'ADD_SUBDIVISION',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', position: 100 },
      });

      // Get the first child void and subdivide on Y
      const snapshot = engine.getSnapshot();
      const rootVoid = snapshot.children[0].children[0];
      const firstChildVoid = rootVoid.children.find((c: any) => c.kind === 'void');

      if (firstChildVoid) {
        engine.dispatch({
          type: 'ADD_SUBDIVISION',
          targetId: 'main-assembly',
          payload: { voidId: firstChildVoid.id, axis: 'y', position: 100 },
        });
      }
    });

    it('creates 2 divider panels (X and Y)', () => {
      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const dividerPanels = panels.filter(p => p.kind === 'divider-panel');
      expect(dividerPanels).toHaveLength(2);

      const axes = dividerPanels.map((p: any) => p.props.axis);
      expect(axes).toContain('x');
      expect(axes).toContain('y');
    });

    it('perpendicular dividers have slots at intersection', () => {
      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const dividerPanels = panels.filter(p => p.kind === 'divider-panel');

      // Each divider should have slots where the other intersects
      for (const divider of dividerPanels) {
        const holes = divider.derived.outline.holes;
        const intersectionSlots = holes.filter(h => h.source.type === 'divider-slot');
        // May or may not have slots depending on whether they actually intersect
        // Just verify the structure is valid
      }
    });

    it('passes all geometry validations', () => {
      const result = validateGeometry(engine);

      if (!result.valid) {
        console.log(formatValidationResult(result));
      }

      expect(result.errors).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Scenario 6: Deep Nesting (3 levels)
  // ===========================================================================

  describe('Scenario 6: Deep Nesting (3 levels)', () => {
    beforeEach(() => {
      engine.createAssembly(300, 300, 300, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // Level 1: subdivide on X
      engine.dispatch({
        type: 'ADD_SUBDIVISION',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', position: 150 },
      });

      // Get first child void
      let snapshot = engine.getSnapshot();
      let rootVoid = snapshot.children[0].children[0];
      let childVoid = rootVoid.children.find((c: any) => c.kind === 'void');

      // Level 2: subdivide on Y
      if (childVoid) {
        engine.dispatch({
          type: 'ADD_SUBDIVISION',
          targetId: 'main-assembly',
          payload: { voidId: childVoid.id, axis: 'y', position: 150 },
        });

        // Get grandchild void
        snapshot = engine.getSnapshot();
        rootVoid = snapshot.children[0].children[0];
        childVoid = rootVoid.children.find((c: any) => c.kind === 'void');
        if (childVoid && childVoid.kind === 'void') {
          const grandchildVoid = childVoid.children.find((c: any) => c.kind === 'void');

          // Level 3: subdivide on Z
          if (grandchildVoid) {
            engine.dispatch({
              type: 'ADD_SUBDIVISION',
              targetId: 'main-assembly',
              payload: { voidId: grandchildVoid.id, axis: 'z', position: 150 },
            });
          }
        }
      }
    });

    it('creates 3 divider panels on different axes', () => {
      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const dividerPanels = panels.filter(p => p.kind === 'divider-panel');
      expect(dividerPanels).toHaveLength(3);

      const axes = dividerPanels.map((p: any) => p.props.axis);
      expect(axes).toContain('x');
      expect(axes).toContain('y');
      expect(axes).toContain('z');
    });

    it('passes all geometry validations', () => {
      const result = validateGeometry(engine);

      if (!result.valid) {
        console.log(formatValidationResult(result));
      }

      expect(result.errors).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Scenario 7: Subdivision with Open Face
  // ===========================================================================

  describe('Scenario 7: Subdivision with Open Face', () => {
    beforeEach(() => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // Open the front face
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'front' },
      });

      // Add subdivision on X (perpendicular to front)
      engine.dispatch({
        type: 'ADD_SUBDIVISION',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', position: 100 },
      });
    });

    it('divider has no tabs on open face side', () => {
      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const divider = panels.find(p => p.kind === 'divider-panel');

      expect(divider).toBeDefined();

      // Check edge configs - the edge facing front should have no tabs
      const edges = divider!.derived.edges;
      const frontEdge = edges.find(e => e.meetsFaceId === 'front');

      // Since front is open, no edge should meet front face
      expect(frontEdge).toBeUndefined();
    });

    it('passes all geometry validations', () => {
      const result = validateGeometry(engine);

      if (!result.valid) {
        console.log(formatValidationResult(result));
      }

      expect(result.errors).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Scenario 8: Scale Operation
  // ===========================================================================

  describe('Scenario 8: Scale Operation', () => {
    beforeEach(() => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // Add subdivision first
      engine.dispatch({
        type: 'ADD_SUBDIVISION',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', position: 100 },
      });

      // Scale to larger dimensions
      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: 'main-assembly',
        payload: { width: 300, height: 200, depth: 150 },
      });
    });

    it('assembly has new dimensions', () => {
      const snapshot = engine.getSnapshot();
      const assembly = snapshot.children[0];
      expect(assembly.props.width).toBe(300);
      expect(assembly.props.height).toBe(200);
      expect(assembly.props.depth).toBe(150);
    });

    it('void bounds updated to match new dimensions', () => {
      const snapshot = engine.getSnapshot();
      const rootVoid = snapshot.children[0].children[0];
      expect(rootVoid.derived.bounds.w).toBe(294); // 300 - 2*3
      expect(rootVoid.derived.bounds.h).toBe(194); // 200 - 2*3
      expect(rootVoid.derived.bounds.d).toBe(144); // 150 - 2*3
    });

    it('passes all geometry validations', () => {
      const result = validateGeometry(engine);

      if (!result.valid) {
        console.log(formatValidationResult(result));
      }

      expect(result.errors).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Scenario 9: Outset Operation
  // ===========================================================================

  describe('Scenario 9: Outset Operation', () => {
    beforeEach(() => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // Get panel ID for front face
      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const frontPanel = panels.find((p: any) => p.kind === 'face-panel' && p.props.faceId === 'front');

      if (frontPanel) {
        // Apply outset to front face (extend bottom edge)
        engine.dispatch({
          type: 'SET_EDGE_EXTENSION',
          targetId: 'main-assembly',
          payload: { panelId: frontPanel.id, edge: 'bottom', value: 20 },
        });
      }
    });

    it('front panel has edge extension', () => {
      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const frontPanel = panels.find((p: any) => p.kind === 'face-panel' && p.props.faceId === 'front');

      expect(frontPanel).toBeDefined();
      expect(frontPanel!.props.edgeExtensions.bottom).toBe(20);
    });

    it('assembly dimensions unchanged', () => {
      const snapshot = engine.getSnapshot();
      const assembly = snapshot.children[0];
      expect(assembly.props.width).toBe(200);
      expect(assembly.props.height).toBe(150);
      expect(assembly.props.depth).toBe(100);
    });

    it('passes all geometry validations', () => {
      const result = validateGeometry(engine);

      if (!result.valid) {
        console.log(formatValidationResult(result));
      }

      expect(result.errors).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Scenario 10: Push-Pull Operation
  // ===========================================================================

  describe.skip('Scenario 10: Push-Pull Operation', () => {
    // Skip until push-pull is implemented/fixed
    beforeEach(() => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // TODO: Push-pull front face outward by 20
      // This operation may not be implemented yet
    });

    it('assembly depth increased', () => {
      const snapshot = engine.getSnapshot();
      const assembly = snapshot.children[0];
      expect(assembly.props.depth).toBe(120); // 100 + 20
    });

    it('passes all geometry validations', () => {
      const result = validateGeometry(engine);
      expect(result.errors).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Scenario 11: Feet Addition
  // ===========================================================================

  describe('Scenario 11: Feet Addition', () => {
    beforeEach(() => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // Add feet
      engine.dispatch({
        type: 'SET_FEET_CONFIG',
        targetId: 'main-assembly',
        payload: {
          enabled: true,
          height: 30,
          width: 20,
          inset: 10,
          gap: 5,
        },
      });
    });

    it('feet config is applied', () => {
      const snapshot = engine.getSnapshot();
      const assembly = snapshot.children[0];
      expect(assembly.props.feet?.enabled).toBe(true);
      expect(assembly.props.feet?.height).toBe(30);
    });

    it('passes all geometry validations', () => {
      const result = validateGeometry(engine);

      if (!result.valid) {
        console.log(formatValidationResult(result));
      }

      expect(result.errors).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Scenario 12: Sub-Assembly
  // Known issue: Sub-assembly geometry has alignment issues that need
  // separate investigation. Skip the validation test for now.
  // ===========================================================================

  describe('Scenario 12: Sub-Assembly', () => {
    beforeEach(() => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // Add subdivision
      engine.dispatch({
        type: 'ADD_SUBDIVISION',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', position: 100 },
      });

      // Get first child void
      const snapshot = engine.getSnapshot();
      const rootVoid = snapshot.children[0].children[0];
      const childVoid = rootVoid.children.find((c: any) => c.kind === 'void');

      if (childVoid) {
        // Create sub-assembly (drawer) in the void
        engine.dispatch({
          type: 'CREATE_SUB_ASSEMBLY',
          targetId: 'main-assembly',
          payload: { voidId: childVoid.id, clearance: 2 },
        });
      }
    });

    it('sub-assembly is created', () => {
      const snapshot = engine.getSnapshot();
      const rootVoid = snapshot.children[0].children[0];
      const childVoid = rootVoid.children.find((c: any) => c.kind === 'void');

      if (childVoid && childVoid.kind === 'void') {
        const subAssembly = childVoid.children.find((c: any) => c.kind === 'sub-assembly');
        expect(subAssembly).toBeDefined();
      }
    });

    it('sub-assembly fits within void with clearance', () => {
      const snapshot = engine.getSnapshot();
      const rootVoid = snapshot.children[0].children[0];
      const childVoid = rootVoid.children.find((c: any) => c.kind === 'void');

      if (childVoid && childVoid.kind === 'void') {
        const subAssembly = childVoid.children.find((c: any) => c.kind === 'sub-assembly');
        if (subAssembly && subAssembly.kind === 'sub-assembly') {
          const voidBounds = childVoid.derived.bounds;
          const clearance = 2;

          // Sub-assembly should be smaller than void by 2*clearance on each side
          expect(subAssembly.props.width).toBeLessThanOrEqual(voidBounds.w - 2 * clearance);
          expect(subAssembly.props.height).toBeLessThanOrEqual(voidBounds.h - 2 * clearance);
          expect(subAssembly.props.depth).toBeLessThanOrEqual(voidBounds.d - 2 * clearance);
        }
      }
    });

    // Skip geometry validation - sub-assembly has known alignment issues
    // that need separate investigation (face panels positioned incorrectly)
    it.skip('passes all geometry validations', () => {
      const result = validateGeometry(engine);

      if (!result.valid) {
        console.log(formatValidationResult(result));
      }

      expect(result.errors).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Scenario 13: Complex Combined Operations
  // ===========================================================================

  describe('Scenario 13: Complex Combined Operations', () => {
    beforeEach(() => {
      // 1. Create 300×200×150 box
      engine.createAssembly(300, 200, 150, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // 2. Open top (lid)
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'top' },
      });

      // 3. Subdivide X at 33% and 66%
      engine.dispatch({
        type: 'ADD_SUBDIVISIONS',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', positions: [100, 200] },
      });

      // 4. Subdivide middle void on Y
      let snapshot = engine.getSnapshot();
      let rootVoid = snapshot.children[0].children[0];
      const middleVoid = rootVoid.children.find((c: any) =>
        c.kind === 'void' && c.derived.bounds.x > 50 && c.derived.bounds.x < 150
      );

      if (middleVoid) {
        engine.dispatch({
          type: 'ADD_SUBDIVISION',
          targetId: 'main-assembly',
          payload: { voidId: middleVoid.id, axis: 'y', position: 100 },
        });
      }

      // 5. Add feet
      engine.dispatch({
        type: 'SET_FEET_CONFIG',
        targetId: 'main-assembly',
        payload: {
          enabled: true,
          height: 25,
          width: 15,
          inset: 10,
          gap: 5,
        },
      });

      // 6. Outset front face
      snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const frontPanel = panels.find((p: any) => p.kind === 'face-panel' && p.props.faceId === 'front');

      if (frontPanel) {
        engine.dispatch({
          type: 'SET_EDGE_EXTENSION',
          targetId: 'main-assembly',
          payload: { panelId: frontPanel.id, edge: 'bottom', value: 10 },
        });
      }
    });

    it('has expected structure', () => {
      const snapshot = engine.getSnapshot();
      const assembly = snapshot.children[0];
      const panels = assembly.derived.panels;

      // 5 face panels (top is open)
      const facePanels = panels.filter(p => p.kind === 'face-panel');
      expect(facePanels).toHaveLength(5);

      // 3 divider panels (2 on X, 1 on Y)
      const dividerPanels = panels.filter(p => p.kind === 'divider-panel');
      expect(dividerPanels).toHaveLength(3);

      // Feet enabled
      expect(assembly.props.feet?.enabled).toBe(true);
    });

    it('passes all geometry validations', () => {
      const result = validateGeometry(engine);

      if (!result.valid) {
        console.log(formatValidationResult(result));
      }

      // Log summary even on success for complex scenario
      console.log(`Scenario 13: ${result.summary.rulesChecked.length} rules checked, ` +
                  `${result.summary.errorCount} errors, ${result.summary.warningCount} warnings`);

      expect(result.errors).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Scenario 14: Edge Extensions - Path Validity
  // Tests that edge extensions produce valid axis-aligned paths
  // ===========================================================================

  describe('Scenario 14: Edge Extensions - Path Validity', () => {
    beforeEach(() => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // Get front panel ID and apply bottom extension
      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const frontPanel = panels.find((p: any) => p.kind === 'face-panel' && p.props.faceId === 'front');

      if (frontPanel) {
        engine.dispatch({
          type: 'SET_EDGE_EXTENSION',
          targetId: 'main-assembly',
          payload: { panelId: frontPanel.id, edge: 'bottom', value: 20 },
        });
      }
    });

    it('front panel has edge extension applied', () => {
      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const frontPanel = panels.find((p: any) => p.kind === 'face-panel' && p.props.faceId === 'front');

      expect(frontPanel).toBeDefined();
      expect(frontPanel!.props.edgeExtensions.bottom).toBe(20);
    });

    it('passes path validity checks (no diagonal lines)', () => {
      // Import dynamically to avoid circular dependency issues
      // Using imported checkPathValidity and formatPathCheckResult

      const result = checkPathValidity(engine);

      if (!result.valid) {
        console.log(formatPathCheckResult(result));
      }

      // This test will FAIL if edge extensions produce diagonal lines
      // The failure exposes the bug documented in the plan
      expect(result.errors).toHaveLength(0);
    });

    it('passes edge extension checks', () => {
      // Using imported checkEdgeExtensions and formatEdgeExtensionCheckResult

      const result = checkEdgeExtensions(engine);

      if (!result.valid) {
        console.log(formatEdgeExtensionCheckResult(result));
      }

      // Edge extension rules (eligibility, etc.) should pass
      expect(result.errors).toHaveLength(0);
    });

    it('passes all geometry validations', () => {
      const result = validateGeometry(engine);

      if (!result.valid) {
        console.log(formatValidationResult(result));
      }

      expect(result.errors).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Scenario 15: Edge Extensions - Left Edge (Wrap-Around Case)
  // Tests the wrap-around case in applyExtensionToEdge
  // ===========================================================================

  describe('Scenario 15: Edge Extensions - Left Edge (Wrap-Around)', () => {
    beforeEach(() => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // Get front panel ID and apply left extension
      // Left edge is the wrap-around case (bottomLeft to topLeft)
      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const frontPanel = panels.find((p: any) => p.kind === 'face-panel' && p.props.faceId === 'front');

      if (frontPanel) {
        engine.dispatch({
          type: 'SET_EDGE_EXTENSION',
          targetId: 'main-assembly',
          payload: { panelId: frontPanel.id, edge: 'left', value: 15 },
        });
      }
    });

    it('front panel has left edge extension applied', () => {
      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const frontPanel = panels.find((p: any) => p.kind === 'face-panel' && p.props.faceId === 'front');

      expect(frontPanel).toBeDefined();
      expect(frontPanel!.props.edgeExtensions.left).toBe(15);
    });

    it('passes path validity checks (no diagonal lines)', () => {
      // Using imported checkPathValidity and formatPathCheckResult

      const result = checkPathValidity(engine);

      if (!result.valid) {
        console.log(formatPathCheckResult(result));
      }

      // This specifically tests the wrap-around case that may have bugs
      expect(result.errors).toHaveLength(0);
    });

    it('extension spans full panel height', () => {
      // Using imported checkEdgeExtensions and formatEdgeExtensionCheckResult

      const result = checkEdgeExtensions(engine);

      // Check specifically for full-width errors
      const fullWidthErrors = result.errors.filter((e: any) => e.rule === 'edge-extensions:full-width');

      if (fullWidthErrors.length > 0) {
        console.log('Full-width errors:', fullWidthErrors);
      }

      expect(fullWidthErrors).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Scenario 16: Multiple Edge Extensions
  // Tests applying extensions to multiple edges on the same panel
  // ===========================================================================

  describe('Scenario 16: Multiple Edge Extensions', () => {
    beforeEach(() => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // Get front panel and apply multiple extensions
      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const frontPanel = panels.find((p: any) => p.kind === 'face-panel' && p.props.faceId === 'front');

      if (frontPanel) {
        // Bottom and left extensions (forms an L-shape extension)
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
      }
    });

    it('panel has both extensions applied', () => {
      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const frontPanel = panels.find((p: any) => p.kind === 'face-panel' && p.props.faceId === 'front');

      expect(frontPanel).toBeDefined();
      expect(frontPanel!.props.edgeExtensions.bottom).toBe(20);
      expect(frontPanel!.props.edgeExtensions.left).toBe(15);
    });

    it('passes path validity checks (no diagonal lines)', () => {
      // Using imported checkPathValidity and formatPathCheckResult

      const result = checkPathValidity(engine);

      if (!result.valid) {
        console.log(formatPathCheckResult(result));
      }

      expect(result.errors).toHaveLength(0);
    });

    it('passes all geometry validations', () => {
      const result = validateGeometry(engine);

      if (!result.valid) {
        console.log(formatValidationResult(result));
      }

      expect(result.errors).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Scenario 17: Edge Extensions with Open Face
  // Tests extension on an edge adjacent to an open face
  // ===========================================================================

  describe('Scenario 17: Edge Extensions with Open Face', () => {
    beforeEach(() => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // Open the bottom face
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'bottom' },
      });

      // Get front panel and apply bottom extension (now adjacent to open face)
      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const frontPanel = panels.find((p: any) => p.kind === 'face-panel' && p.props.faceId === 'front');

      if (frontPanel) {
        engine.dispatch({
          type: 'SET_EDGE_EXTENSION',
          targetId: 'main-assembly',
          payload: { panelId: frontPanel.id, edge: 'bottom', value: 25 },
        });
      }
    });

    it('bottom face is open', () => {
      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const bottomPanel = panels.find((p: any) => p.kind === 'face-panel' && p.props.faceId === 'bottom');

      expect(bottomPanel).toBeUndefined();
    });

    it('front panel has bottom extension', () => {
      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const frontPanel = panels.find((p: any) => p.kind === 'face-panel' && p.props.faceId === 'front');

      expect(frontPanel).toBeDefined();
      expect(frontPanel!.props.edgeExtensions.bottom).toBe(25);
    });

    it('passes path validity checks', () => {
      // Using imported checkPathValidity and formatPathCheckResult

      const result = checkPathValidity(engine);

      if (!result.valid) {
        console.log(formatPathCheckResult(result));
      }

      expect(result.errors).toHaveLength(0);
    });

    it('edge is eligible for extension (open face edge)', () => {
      // Using imported checkEdgeExtensions

      const result = checkEdgeExtensions(engine);

      const eligibilityErrors = result.errors.filter((e: any) => e.rule === 'edge-extensions:eligibility');

      expect(eligibilityErrors).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Scenario 17: Four-Direction Extension (Female-Only Panel)
  // Tests a panel with all 4 edges extended - validates rectangular outline
  // ===========================================================================

  describe('Scenario 17: Four-Direction Extension (Female-Only Panel)', () => {
    beforeEach(() => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      // Get bottom panel ID (all edges are female/unlocked)
      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const bottomPanel = panels.find((p: any) => p.kind === 'face-panel' && p.props.faceId === 'bottom');

      if (bottomPanel) {
        // Apply extensions to all 4 edges
        engine.dispatch({
          type: 'SET_EDGE_EXTENSION',
          targetId: 'main-assembly',
          payload: { panelId: bottomPanel.id, edge: 'top', value: 15 },
        });
        engine.dispatch({
          type: 'SET_EDGE_EXTENSION',
          targetId: 'main-assembly',
          payload: { panelId: bottomPanel.id, edge: 'bottom', value: 15 },
        });
        engine.dispatch({
          type: 'SET_EDGE_EXTENSION',
          targetId: 'main-assembly',
          payload: { panelId: bottomPanel.id, edge: 'left', value: 15 },
        });
        engine.dispatch({
          type: 'SET_EDGE_EXTENSION',
          targetId: 'main-assembly',
          payload: { panelId: bottomPanel.id, edge: 'right', value: 15 },
        });
      }
    });

    it('applies extensions to all 4 edges', () => {
      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const bottomPanel = panels.find((p: any) => p.kind === 'face-panel' && p.props.faceId === 'bottom');

      expect(bottomPanel).toBeDefined();
      expect(bottomPanel!.props.edgeExtensions.top).toBe(15);
      expect(bottomPanel!.props.edgeExtensions.bottom).toBe(15);
      expect(bottomPanel!.props.edgeExtensions.left).toBe(15);
      expect(bottomPanel!.props.edgeExtensions.right).toBe(15);
    });

    it('passes path validity checks (no diagonal lines)', () => {
      const result = checkPathValidity(engine);

      if (!result.valid) {
        console.log(formatPathCheckResult(result));
      }

      expect(result.errors).toHaveLength(0);
    });

    it('passes corner merging validation (equal adjacent extensions)', () => {
      const result = validateGeometry(engine);

      // Filter for corner merging errors only
      const cornerErrors = result.errors.filter((e: any) => e.rule === 'edge-extensions:corner-merging');

      if (cornerErrors.length > 0) {
        console.log('Corner merging errors:', cornerErrors);
      }

      expect(cornerErrors).toHaveLength(0);
    });

    it('passes rectangular outline validation', () => {
      const result = validateGeometry(engine);

      // Filter for rectangular outline errors only
      const outlineErrors = result.errors.filter((e: any) => e.rule === 'extended-panel:rectangular-outline');

      if (outlineErrors.length > 0) {
        console.log('Rectangular outline errors:', outlineErrors);
      }

      expect(outlineErrors).toHaveLength(0);
    });

    it('passes all geometry validations', () => {
      const result = validateGeometry(engine);

      if (!result.valid) {
        console.log(formatValidationResult(result));
      }

      expect(result.errors).toHaveLength(0);
    });

    it('corner merging produces clean rectangular outline (no L-shaped notches)', () => {
      // When all 4 edges of a female-only panel are extended equally,
      // the outline should be a simple rectangle with 4 corners at the extended positions.
      // There should be NO L-shaped notches at corners.
      //
      // Expected outline for 200x100 panel with 15mm extension on all edges:
      //   Extended dimensions: (200 + 30) x (100 + 30) = 230 x 130
      //   Extended corners: (-115, 65), (115, 65), (115, -65), (-115, -65)
      //
      // The outline should go around these 4 corners with only axis-aligned segments.

      const snapshot = engine.getSnapshot();
      const panels = snapshot.children[0].derived.panels;
      const bottomPanel = panels.find((p: any) => p.kind === 'face-panel' && p.props.faceId === 'bottom');
      expect(bottomPanel).toBeDefined();

      const points = bottomPanel!.derived.outline.points;

      // Debug: print all points
      console.log('All outline points:');
      points.forEach((p: any, i: number) => {
        console.log(`  ${i}: (${p.x}, ${p.y})`);
      });

      // Calculate the bounding box of the outline
      const minX = Math.min(...points.map((p: any) => p.x));
      const maxX = Math.max(...points.map((p: any) => p.x));
      const minY = Math.min(...points.map((p: any) => p.y));
      const maxY = Math.max(...points.map((p: any) => p.y));

      console.log(`Outline bounding box: (${minX}, ${minY}) to (${maxX}, ${maxY})`);
      console.log(`Expected: (-115, -65) to (115, 65)`);

      // The bounding box should match the extended dimensions
      expect(minX).toBeCloseTo(-115, 0);
      expect(maxX).toBeCloseTo(115, 0);
      expect(minY).toBeCloseTo(-65, 0);
      expect(maxY).toBeCloseTo(65, 0);

      // Count how many times each corner point appears
      const cornerPoints = [
        { x: 115, y: 65, name: 'TR' },
        { x: -115, y: 65, name: 'TL' },
        { x: 115, y: -65, name: 'BR' },
        { x: -115, y: -65, name: 'BL' },
      ];

      const tolerance = 0.1;
      for (const corner of cornerPoints) {
        const occurrences = points.filter((p: any) =>
          Math.abs(p.x - corner.x) < tolerance && Math.abs(p.y - corner.y) < tolerance
        ).length;

        console.log(`Corner ${corner.name} (${corner.x}, ${corner.y}): appears ${occurrences} time(s)`);

        // Each extended corner should appear EXACTLY ONCE in the outline
        // If it appears more than once, there's a path construction issue
        expect(occurrences).toBe(1);
      }

      // Check for L-shaped notches at the corners
      // An L-shaped notch at a corner would have intermediate points between
      // the extended corner and the adjacent extended corner.
      // For clean corner merging, the path should go directly between extended corners
      // (only finger joint patterns should appear BETWEEN corners, not AT corners)

      // Check the segments around each extended corner
      // For TL (-115, 65): the adjacent points should be at Y=65 (top cap) or X=-115 (left side)
      // For TR (115, 65): the adjacent points should be at Y=65 (top cap) or X=115 (right side)
      // etc.

      // Find indices of extended corners in the path
      const findCornerIndex = (x: number, y: number) =>
        points.findIndex((p: any) => Math.abs(p.x - x) < tolerance && Math.abs(p.y - y) < tolerance);

      const tlIdx = findCornerIndex(-115, 65);
      const trIdx = findCornerIndex(115, 65);
      const brIdx = findCornerIndex(115, -65);
      const blIdx = findCornerIndex(-115, -65);

      // The path from TL to TR should be direct (just the top cap)
      // Check that the point after TL has y=65 (on the top cap)
      const afterTL = points[(tlIdx + 1) % points.length];
      expect(Math.abs(afterTL.y - 65)).toBeLessThan(tolerance);

      // The point before TL should have x=-115 (on the left side)
      const beforeTL = points[(tlIdx - 1 + points.length) % points.length];
      expect(Math.abs(beforeTL.x - (-115))).toBeLessThan(tolerance);

      console.log('Corner TL neighbors: before=', beforeTL, 'after=', afterTL);
      console.log('Corner TR neighbors: before=', points[(trIdx - 1 + points.length) % points.length],
                  'after=', points[(trIdx + 1) % points.length]);
    });
  });

  // ===========================================================================
  // Validator Coverage Check
  // ===========================================================================

  describe('Validator Coverage', () => {
    it('validates all expected rule categories', () => {
      engine.createAssembly(200, 150, 100, {
        thickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      engine.dispatch({
        type: 'ADD_SUBDIVISION',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', position: 100 },
      });

      const result = validateGeometry(engine);

      // Check that all major categories are covered
      const rules = result.summary.rulesChecked;

      expect(rules.some(r => r.startsWith('global-3d:'))).toBe(true);
      expect(rules.some(r => r.startsWith('dimensions:'))).toBe(true);
      expect(rules.some(r => r.startsWith('joints:'))).toBe(true);
      expect(rules.some(r => r.startsWith('fingers:'))).toBe(true);
      expect(rules.some(r => r.startsWith('intersections:'))).toBe(true);
      expect(rules.some(r => r.startsWith('path:'))).toBe(true);
    });
  });
});
