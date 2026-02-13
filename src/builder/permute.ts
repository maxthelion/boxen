/**
 * Permutation utilities for matrix-driven testing.
 *
 * This module provides functions to generate all combinations of configuration
 * options for use with vitest's `describe.each()` and `it.each()` patterns.
 *
 * @example
 * ```typescript
 * const matrix = permute({
 *   extensions: [[], ['top'], ['top', 'left']],
 *   cutouts: [[], [rect(10, 10, 20, 20)]],
 * });
 * // Returns 6 combinations (3 x 2)
 *
 * describe.each(matrix)('test: %s', (name, config) => {
 *   it('works', () => {
 *     // config.extensions and config.cutouts available
 *   });
 * });
 * ```
 */

/**
 * Configuration object where each key maps to an array of possible values.
 */
export type PermutationConfig = Record<string, unknown[]>;

/**
 * Result type: array of [name, config] tuples for use with describe.each()
 */
export type PermutationResult<T extends PermutationConfig> = Array<
  [string, { [K in keyof T]: T[K][number] }]
>;

/**
 * Generate all permutations (cartesian product) of configuration options.
 *
 * @example
 * const matrix = permute({
 *   extensions: [[], ['top'], ['top', 'left']],
 *   cutouts: [[], [rect(10, 10, 20, 20)]],
 * });
 * // Returns 6 combinations (3 x 2)
 *
 * describe.each(matrix)('test: %s', (name, config) => {
 *   it('works', () => {
 *     // config.extensions and config.cutouts available
 *   });
 * });
 */
export function permute<T extends PermutationConfig>(config: T): PermutationResult<T> {
  const keys = Object.keys(config) as (keyof T)[];
  const results: PermutationResult<T> = [];

  function generate(index: number, current: Partial<{ [K in keyof T]: T[K][number] }>) {
    if (index === keys.length) {
      // Build human-readable name
      const name = keys
        .map((k) => {
          const value = current[k];
          const valueStr = Array.isArray(value)
            ? value.length === 0
              ? '[]'
              : `[${value.length} items]`
            : JSON.stringify(value);
          return `${String(k)}=${valueStr}`;
        })
        .join(', ');

      results.push([name, { ...current } as { [K in keyof T]: T[K][number] }]);
      return;
    }

    const key = keys[index];
    const values = config[key];
    for (const value of values) {
      generate(index + 1, { ...current, [key]: value });
    }
  }

  generate(0, {});
  return results;
}

/**
 * Generate named permutations with custom name function.
 *
 * @example
 * const matrix = permuteNamed({
 *   edges: [[], ['top'], ['top', 'left']],
 * }, (config) => `${config.edges.length} extensions`);
 */
export function permuteNamed<T extends PermutationConfig>(
  config: T,
  nameFn: (config: { [K in keyof T]: T[K][number] }) => string
): PermutationResult<T> {
  const keys = Object.keys(config) as (keyof T)[];
  const results: PermutationResult<T> = [];

  function generate(index: number, current: Partial<{ [K in keyof T]: T[K][number] }>) {
    if (index === keys.length) {
      const fullConfig = { ...current } as { [K in keyof T]: T[K][number] };
      results.push([nameFn(fullConfig), fullConfig]);
      return;
    }

    const key = keys[index];
    const values = config[key];
    for (const value of values) {
      generate(index + 1, { ...current, [key]: value });
    }
  }

  generate(0, {});
  return results;
}

/**
 * Count total permutations without generating them.
 */
export function countPermutations(config: PermutationConfig): number {
  const keys = Object.keys(config);
  let result = 1;
  for (const key of keys) {
    result *= config[key].length;
  }
  return result;
}
