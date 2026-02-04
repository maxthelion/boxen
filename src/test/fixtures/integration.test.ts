/**
 * Integration tests for the Test Fixtures module.
 *
 * These tests verify that all Phase 1 components work together:
 * - TestFixture class for creating test scenarios
 * - PanelBuilder for panel-specific operations
 * - Shape helpers for cutouts
 * - Permutation utilities for matrix-driven testing
 */

import { describe, it, expect } from 'vitest';
import { TestFixture, rect, polygon, circle, lShape, permute, permuteNamed, countPermutations } from './index';
import { checkGeometry } from '../../engine/geometryChecker';
import type { FaceId } from '../../types';

describe('Test Fixtures Integration', () => {
  describe('basic workflow', () => {
    it('creates and builds a fixture', () => {
      const { engine, panels, panel } = TestFixture
        .basicBox(100, 80, 60)
        .panel('front')
        .build();

      expect(engine).toBeDefined();
      expect(panels.length).toBe(5); // 6 faces - 1 open (top)
      expect(panel).toBeDefined();
      expect(panel?.source.faceId).toBe('front');
    });

    it('produces valid geometry', () => {
      const { engine } = TestFixture.basicBox(100, 80, 60).build();
      const result = checkGeometry(engine);
      expect(result.valid).toBe(true);
    });

    it('creates enclosed box with all faces', () => {
      const { engine, panels } = TestFixture.enclosedBox(100, 80, 60).build();

      expect(engine).toBeDefined();
      expect(panels.length).toBe(6);

      const result = checkGeometry(engine);
      expect(result.valid).toBe(true);
    });

    it('respects custom dimensions', () => {
      const { panels } = TestFixture.enclosedBox(200, 150, 100).build();

      const frontPanel = panels.find(p => p.source.faceId === 'front');
      expect(frontPanel).toBeDefined();
      expect(frontPanel!.width).toBe(200);
      expect(frontPanel!.height).toBe(150);
    });
  });

  describe('branching workflow', () => {
    it('creates independent branches', () => {
      const base = TestFixture.basicBox(100, 80, 60);

      const branch1 = base.clone().withOpenFaces(['top']);
      const branch2 = base.clone().withOpenFaces(['top', 'front']);

      const { panels: panels1 } = branch1.build();
      const { panels: panels2 } = branch2.build();

      expect(panels1.length).toBe(5); // 6 - 1 (top)
      expect(panels2.length).toBe(4); // 6 - 2 (top, front)
    });

    it('original fixture is unchanged after cloning', () => {
      const base = TestFixture.enclosedBox(100, 80, 60);
      const clone = base.clone();

      // Modify the clone
      clone.withOpenFaces(['top', 'front', 'left']);

      // Original should still have all 6 faces
      const { panels: basePanels } = base.build();
      const { panels: clonePanels } = clone.build();

      expect(basePanels.length).toBe(6);
      expect(clonePanels.length).toBe(3);
    });

    it('cloned fixtures produce valid geometry', () => {
      const base = TestFixture.basicBox(100, 80, 60);
      const clone = base.clone().withOpenFaces(['top', 'front']);

      const { engine: baseEngine } = base.build();
      const { engine: cloneEngine } = clone.build();

      expect(checkGeometry(baseEngine).valid).toBe(true);
      expect(checkGeometry(cloneEngine).valid).toBe(true);
    });
  });

  describe('matrix workflow', () => {
    const matrix = permute({
      openFaces: [['top'], ['top', 'front']] as FaceId[][],
    });

    describe.each(matrix)('with %s', (_name, { openFaces }) => {
      it('creates valid geometry', () => {
        const { engine } = TestFixture
          .basicBox(100, 80, 60)
          .withOpenFaces(openFaces)
          .build();

        const result = checkGeometry(engine);
        expect(result.valid).toBe(true);
      });

      it('has expected panel count', () => {
        const { panels } = TestFixture
          .basicBox(100, 80, 60)
          .withOpenFaces(openFaces)
          .build();

        const expectedCount = 6 - openFaces.length;
        expect(panels.length).toBe(expectedCount);
      });
    });
  });

  describe('advanced matrix workflow', () => {
    const advancedMatrix = permute({
      dimensions: [
        [100, 80, 60],
        [200, 150, 100],
      ] as [number, number, number][],
      openFaces: [['top'], ['top', 'front']] as FaceId[][],
    });

    describe.each(advancedMatrix)('scenario: %s', (_name, config) => {
      it('produces valid geometry', () => {
        const [width, height, depth] = config.dimensions;
        const { engine } = TestFixture
          .basicBox(width, height, depth)
          .withOpenFaces(config.openFaces)
          .build();

        const result = checkGeometry(engine);
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('named permutations', () => {
    const namedMatrix = permuteNamed(
      {
        openFaces: [['top'], ['top', 'front'], []] as FaceId[][],
      },
      (config) => {
        if (config.openFaces.length === 0) return 'enclosed box';
        return `open: ${config.openFaces.join(', ')}`;
      }
    );

    describe.each(namedMatrix)('%s', (_name, { openFaces }) => {
      it('builds successfully', () => {
        const { panels } = TestFixture
          .basicBox(100, 80, 60)
          .withOpenFaces(openFaces)
          .build();

        expect(panels.length).toBe(6 - openFaces.length);
      });
    });
  });

  describe('shape helpers', () => {
    it('rect creates valid shape with 4 points', () => {
      const shape = rect(10, 10, 20, 20);
      expect(shape.points).toBe(4);

      const path = shape.toPath();
      expect(path).toHaveLength(4);

      // Verify corners
      expect(path[0]).toEqual({ x: 10, y: 10 });
      expect(path[1]).toEqual({ x: 30, y: 10 });
      expect(path[2]).toEqual({ x: 30, y: 30 });
      expect(path[3]).toEqual({ x: 10, y: 30 });
    });

    it('polygon creates shape from points', () => {
      const shape = polygon([0, 0], [10, 0], [10, 10], [5, 15], [0, 10]);
      expect(shape.points).toBe(5);

      const path = shape.toPath();
      expect(path).toHaveLength(5);
      expect(path[0]).toEqual({ x: 0, y: 0 });
      expect(path[3]).toEqual({ x: 5, y: 15 });
    });

    it('circle creates approximation with segments', () => {
      const shape = circle(50, 50, 10, 8);
      expect(shape.points).toBe(8);

      const path = shape.toPath();
      expect(path).toHaveLength(8);

      // All points should be roughly radius distance from center
      for (const point of path) {
        const dx = point.x - 50;
        const dy = point.y - 50;
        const dist = Math.sqrt(dx * dx + dy * dy);
        expect(dist).toBeCloseTo(10, 5);
      }
    });

    it('lShape creates L-shaped polygon', () => {
      const shape = lShape(0, 0, 30, 30, 10, 10);
      expect(shape.points).toBe(6);

      const path = shape.toPath();
      expect(path).toHaveLength(6);
    });
  });

  describe('permutation utilities', () => {
    it('countPermutations returns correct count', () => {
      expect(countPermutations({ a: [1, 2], b: [3, 4, 5] })).toBe(6);
      expect(countPermutations({ a: [1], b: [2], c: [3] })).toBe(1);
      expect(countPermutations({ a: [1, 2, 3, 4] })).toBe(4);
    });

    it('permute generates all combinations', () => {
      const result = permute({
        a: [1, 2],
        b: ['x', 'y'],
      });

      expect(result).toHaveLength(4);

      // Each combination should have both keys
      for (const [name, config] of result) {
        expect(name).toContain('a=');
        expect(name).toContain('b=');
        expect(typeof config.a).toBe('number');
        expect(typeof config.b).toBe('string');
      }
    });

    it('permuteNamed uses custom name function', () => {
      const result = permuteNamed(
        { value: [1, 2, 3] },
        (config) => `value is ${config.value}`
      );

      expect(result[0][0]).toBe('value is 1');
      expect(result[1][0]).toBe('value is 2');
      expect(result[2][0]).toBe('value is 3');
    });
  });

  describe('panel builder integration', () => {
    it('panel selection works through index export', () => {
      const { panel } = TestFixture
        .enclosedBox(100, 80, 60)
        .panel('front')
        .build();

      expect(panel).toBeDefined();
      expect(panel?.source.faceId).toBe('front');
    });

    it('and() returns to fixture for further configuration', () => {
      const { panels, panel } = TestFixture
        .enclosedBox(100, 80, 60)
        .panel('front')
        .and()
        .withOpenFaces(['top'])
        .panel('front')
        .build();

      // Should have 5 panels (top is open)
      expect(panels.length).toBe(5);
      expect(panel).toBeDefined();
    });
  });

  describe('full workflow example', () => {
    it('demonstrates complete usage pattern', () => {
      // 1. Create base fixture
      const base = TestFixture.basicBox(100, 80, 60);

      // 2. Create test matrix
      const faces: FaceId[] = ['front', 'back', 'left', 'right', 'bottom'];
      const scenarios = faces.map(face => ({
        name: face,
        fixture: base.clone().panel(face),
      }));

      // 3. Run assertions on each scenario
      for (const scenario of scenarios) {
        const { panel, engine } = scenario.fixture.build();

        expect(panel).toBeDefined();
        expect(panel?.source.faceId).toBe(scenario.name);
        expect(checkGeometry(engine).valid).toBe(true);
      }
    });
  });
});
