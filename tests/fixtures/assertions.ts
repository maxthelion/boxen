/**
 * Custom Test Assertions
 *
 * Helper functions for common test assertions.
 */

import { expect } from 'vitest';
import type { Engine } from '../../src/engine/Engine';
import type { VoidSnapshot, PanelSnapshot, Bounds3D } from '../../src/engine/types';
import { validateOperation, OperationValidationResult } from '../validators';

/**
 * Tolerance for floating point comparisons (mm)
 */
export const TOLERANCE = 0.01;

/**
 * Assert that engine geometry is valid
 */
export function expectValidGeometry(engine: Engine): OperationValidationResult {
  const result = validateOperation(engine);
  if (!result.valid) {
    // Log errors for debugging
    console.error('Geometry validation failed:');
    result.geometry.errors.forEach((e) => {
      console.error(`  [${e.rule}] ${e.message}`);
    });
    if (result.paths) {
      result.paths.errors.forEach((e) => {
        console.error(`  [${e.rule}] ${e.message}`);
      });
    }
    if (result.edgeExtensions) {
      result.edgeExtensions.errors.forEach((e) => {
        console.error(`  [${e.rule}] ${e.message}`);
      });
    }
  }
  expect(result.valid).toBe(true);
  return result;
}

/**
 * Assert that two bounds are equal within tolerance
 */
export function expectBoundsEqual(
  actual: Bounds3D,
  expected: Bounds3D,
  tolerance: number = TOLERANCE
): void {
  expect(actual.x).toBeCloseTo(expected.x, Math.abs(Math.log10(tolerance)));
  expect(actual.y).toBeCloseTo(expected.y, Math.abs(Math.log10(tolerance)));
  expect(actual.z).toBeCloseTo(expected.z, Math.abs(Math.log10(tolerance)));
  expect(actual.w).toBeCloseTo(expected.w, Math.abs(Math.log10(tolerance)));
  expect(actual.h).toBeCloseTo(expected.h, Math.abs(Math.log10(tolerance)));
  expect(actual.d).toBeCloseTo(expected.d, Math.abs(Math.log10(tolerance)));
}

/**
 * Compare two voids recursively
 */
export function compareVoids(
  actual: VoidSnapshot,
  expected: VoidSnapshot,
  path: string = 'root'
): void {
  expect(actual.id, `${path}.id`).toBe(expected.id);
  expectBoundsEqual(actual.bounds, expected.bounds);

  // Compare children
  expect(actual.children.length, `${path}.children.length`).toBe(expected.children.length);
  for (let i = 0; i < actual.children.length; i++) {
    compareVoids(actual.children[i], expected.children[i], `${path}.children[${i}]`);
  }
}

/**
 * Find a panel by its kind
 */
export function findPanelByKind(
  panels: PanelSnapshot[],
  kind: 'face-panel' | 'divider-panel'
): PanelSnapshot | undefined {
  return panels.find((p) => p.kind === kind);
}

/**
 * Find all panels of a specific kind
 */
export function findPanelsByKind(
  panels: PanelSnapshot[],
  kind: 'face-panel' | 'divider-panel'
): PanelSnapshot[] {
  return panels.filter((p) => p.kind === kind);
}

/**
 * Find a face panel by face ID
 */
export function findFacePanel(
  panels: PanelSnapshot[],
  faceId: string
): PanelSnapshot | undefined {
  return panels.find(
    (p) => p.kind === 'face-panel' && p.source.faceId === faceId
  );
}

/**
 * Count panels by kind
 */
export function countPanels(
  panels: PanelSnapshot[],
  kind?: 'face-panel' | 'divider-panel'
): number {
  if (!kind) return panels.length;
  return panels.filter((p) => p.kind === kind).length;
}

/**
 * Assert that no panels have diagonal segments in their outlines
 */
export function expectNoDiagonals(panels: PanelSnapshot[]): void {
  for (const panel of panels) {
    const outline = panel.outline;
    for (let i = 0; i < outline.length; i++) {
      const from = outline[i];
      const to = outline[(i + 1) % outline.length];
      const xEqual = Math.abs(from.x - to.x) < TOLERANCE;
      const yEqual = Math.abs(from.y - to.y) < TOLERANCE;
      expect(
        xEqual || yEqual,
        `Panel ${panel.id} has diagonal segment from (${from.x}, ${from.y}) to (${to.x}, ${to.y})`
      ).toBe(true);
    }
  }
}
