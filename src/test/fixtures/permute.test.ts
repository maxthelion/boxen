/**
 * Tests for permutation utilities.
 */

import { describe, it, expect } from 'vitest';
import { permute, permuteNamed, countPermutations } from '../../builder/permute';

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

  it('shows array length in name for non-empty arrays', () => {
    const result = permute({
      items: [['a', 'b', 'c']],
    });

    expect(result[0][0]).toContain('items=[3 items]');
  });

  it('shows empty array notation in name', () => {
    const result = permute({
      items: [[]],
    });

    expect(result[0][0]).toContain('items=[]');
  });

  it('handles multiple dimensions', () => {
    const result = permute({
      a: [1, 2],
      b: ['x', 'y'],
      c: [true, false],
    });

    // 2 x 2 x 2 = 8 combinations
    expect(result).toHaveLength(8);

    // Verify first and last
    expect(result[0][1]).toEqual({ a: 1, b: 'x', c: true });
    expect(result[7][1]).toEqual({ a: 2, b: 'y', c: false });
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

  it('generates same configs as permute', () => {
    const config = { a: [1, 2], b: ['x', 'y'] };
    const named = permuteNamed(config, (c) => `a=${c.a}, b=${c.b}`);
    const basic = permute(config);

    // Same length
    expect(named).toHaveLength(basic.length);

    // Same configs (just different names)
    const namedConfigs = named.map(([_, c]) => c);
    const basicConfigs = basic.map(([_, c]) => c);

    for (const cfg of namedConfigs) {
      expect(basicConfigs).toContainEqual(cfg);
    }
  });

  it('can use config values in name', () => {
    const result = permuteNamed(
      { width: [100, 200], height: [50] },
      (config) => `${config.width}x${config.height}`
    );

    expect(result[0][0]).toBe('100x50');
    expect(result[1][0]).toBe('200x50');
  });
});

describe('countPermutations', () => {
  it('counts without generating', () => {
    expect(countPermutations({ a: [1, 2], b: [1, 2, 3] })).toBe(6);
    expect(countPermutations({ a: [1, 2, 3, 4, 5] })).toBe(5);
  });

  it('returns 1 for empty config', () => {
    expect(countPermutations({})).toBe(1);
  });

  it('returns 0 when any array is empty', () => {
    expect(countPermutations({ a: [], b: [1, 2] })).toBe(0);
  });

  it('handles large combinations', () => {
    // 10 x 10 x 10 = 1000
    const largeConfig = {
      a: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      b: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      c: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    };
    expect(countPermutations(largeConfig)).toBe(1000);
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

    it('name is a string', () => {
      expect(typeof name).toBe('string');
    });
  });

  // Test with multiple dimensions
  const matrix2 = permute({
    width: [100, 200],
    height: [50],
  });

  describe.each(matrix2)('dimensions: %s', (_, config) => {
    it('has both dimensions', () => {
      expect(config.width).toBeDefined();
      expect(config.height).toBeDefined();
    });
  });
});
