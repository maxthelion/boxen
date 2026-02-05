# [TASK-test-fixtures-1-4] Create Permutation Generator

ROLE: implement
PRIORITY: P1
BRANCH: main
CREATED: 2026-02-04T19:45:00Z
CREATED_BY: human
EXPEDITE: false
SKIP_PR: false

## Context

This is Task 1.4 of the composable test fixtures rollout. Can be done in parallel with Task 1.1. See `project-management/drafts/composable-test-fixtures-rfc.md` for full design.

## Task

Create a `permute()` function that generates all combinations for matrix testing.

### File to Create

`src/test/fixtures/permute.ts`:

```typescript
/**
 * Configuration object where each key maps to an array of possible values.
 */
type PermutationConfig = Record<string, unknown[]>;

/**
 * Result type: array of [name, config] tuples for use with describe.each()
 */
type PermutationResult<T extends PermutationConfig> = Array<
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
 * // Returns 6 combinations (3 × 2)
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
  return Object.values(config).reduce((acc, arr) => acc * arr.length, 1);
}
```

### Acceptance Criteria

- [ ] `permute({ a: [1, 2], b: ['x', 'y'] })` returns 4 combinations
- [ ] Each result is `[name, config]` tuple
- [ ] Name is human-readable (e.g., "a=1, b='x'")
- [ ] Works with `describe.each()` in vitest
- [ ] `permuteNamed()` allows custom naming
- [ ] `countPermutations()` returns total without generating

### Test File

Create `src/test/fixtures/permute.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { permute, permuteNamed, countPermutations } from './permute';

describe('permute', () => {
  it('generates cartesian product', () => {
    const result = permute({
      a: [1, 2],
      b: ['x', 'y'],
    });

    expect(result).toHaveLength(4);

    // Check all combinations exist
    const configs = result.map(([_, config]) => config);
    expect(configs).toContainEqual({ a: 1, b: 'x' });
    expect(configs).toContainEqual({ a: 1, b: 'y' });
    expect(configs).toContainEqual({ a: 2, b: 'x' });
    expect(configs).toContainEqual({ a: 2, b: 'y' });
  });

  it('handles arrays as values', () => {
    const result = permute({
      edges: [[], ['top'], ['top', 'left']],
    });

    expect(result).toHaveLength(3);
    expect(result[0][1].edges).toEqual([]);
    expect(result[1][1].edges).toEqual(['top']);
    expect(result[2][1].edges).toEqual(['top', 'left']);
  });

  it('generates readable names', () => {
    const result = permute({
      count: [0, 1],
    });

    expect(result[0][0]).toContain('count=0');
    expect(result[1][0]).toContain('count=1');
  });

  it('handles single dimension', () => {
    const result = permute({
      value: [1, 2, 3],
    });

    expect(result).toHaveLength(3);
  });

  it('handles empty arrays', () => {
    const result = permute({
      a: [],
    });

    expect(result).toHaveLength(0);
  });
});

describe('permuteNamed', () => {
  it('uses custom name function', () => {
    const result = permuteNamed(
      { edges: [[], ['top']] },
      (config) => `${config.edges.length} extensions`
    );

    expect(result[0][0]).toBe('0 extensions');
    expect(result[1][0]).toBe('1 extensions');
  });
});

describe('countPermutations', () => {
  it('counts without generating', () => {
    expect(countPermutations({ a: [1, 2], b: [1, 2, 3] })).toBe(6);
    expect(countPermutations({ a: [1, 2, 3, 4, 5] })).toBe(5);
  });
});

describe('integration with describe.each', () => {
  const matrix = permute({
    value: [1, 2],
  });

  // This actually uses describe.each
  describe.each(matrix)('with %s', (name, { value }) => {
    it('has access to config', () => {
      expect(value).toBeGreaterThan(0);
    });
  });
});
```

## Notes

- This enables matrix-driven testing across all permutations
- Names should be readable in test output
- Works with vitest's `describe.each()` and `it.each()`

CLAIMED_BY: impl-agent-1
CLAIMED_AT: 2026-02-04T20:07:29.041109

COMPLETED_AT: 2026-02-04T20:11:04.594107

## Result
PR created: https://github.com/maxthelion/boxen/pull/23
