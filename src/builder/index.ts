/**
 * Assembly Builder - Composable builder system for Boxen assemblies.
 *
 * This module provides a fluent API for setting up assembly scenarios with
 * engines, panels, and operations. It supports lazy execution, cloning
 * for test matrices, and permutation utilities for matrix-driven testing.
 *
 * @example
 * ```typescript
 * import { AssemblyBuilder, rect, permute } from '../builder';
 *
 * // Basic usage
 * const { engine, panels, panel } = AssemblyBuilder
 *   .basicBox(100, 80, 60)
 *   .panel('front')
 *   .build();
 *
 * // Matrix-driven testing
 * const matrix = permute({
 *   openFaces: [['top'], ['top', 'front']],
 * });
 *
 * describe.each(matrix)('test: %s', (name, config) => {
 *   it('works', () => {
 *     const { panels } = AssemblyBuilder
 *       .basicBox(100, 80, 60)
 *       .withOpenFaces(config.openFaces)
 *       .build();
 *   });
 * });
 * ```
 */

// Core builder class
export { AssemblyBuilder } from './AssemblyBuilder';
export type { VoidSelector } from './AssemblyBuilder';

// Panel builder (may be needed for advanced usage)
export { PanelBuilder } from './PanelBuilder';
export type { EdgeId } from './PanelBuilder';

// Shape helpers
export { rect, polygon, circle, lShape } from './shapes';
export type { Shape } from './shapes';

// Permutation utilities
export { permute, permuteNamed, countPermutations } from './permute';
export type { PermutationConfig, PermutationResult } from './permute';

// Types
export type { FixtureResult, QueuedOperation } from './types';
