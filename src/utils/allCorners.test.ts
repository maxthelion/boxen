/**
 * Tests for allCorners utility functions
 *
 * Particularly focused on calculateMaxFilletRadius which determines
 * the maximum fillet radius allowed at a corner based on adjacent
 * edge lengths and the corner angle.
 */

import { describe, it, expect } from 'vitest';
import { calculateMaxFilletRadius } from './allCorners';

describe('calculateMaxFilletRadius', () => {
  describe('standard angles', () => {
    it('returns positive value for 90 degree corner', () => {
      // 90 degree interior angle = PI/2 radians
      const result = calculateMaxFilletRadius(10, 10, Math.PI / 2);
      expect(result).toBeGreaterThan(0);
      // For 90 degree: maxRadius should be close to min edge * safety factor
      // tan(45) = 1, so maxRadius = minEdge * 0.8 / 1 = 8
      // Use toBeCloseTo to handle floating point precision
      expect(result).toBeCloseTo(8, 1);
    });

    it('handles acute angles (< 90 degrees)', () => {
      // 45 degree interior angle
      const result = calculateMaxFilletRadius(10, 10, Math.PI / 4);
      expect(result).toBeGreaterThan(0);
      expect(Number.isFinite(result)).toBe(true);
    });

    it('handles obtuse angles (> 90 degrees)', () => {
      // 135 degree interior angle
      const result = calculateMaxFilletRadius(10, 10, (3 * Math.PI) / 4);
      expect(result).toBeGreaterThan(0);
      expect(Number.isFinite(result)).toBe(true);
    });
  });

  describe('edge length handling', () => {
    it('handles very short edges gracefully', () => {
      const result = calculateMaxFilletRadius(0.5, 10, Math.PI / 2);
      expect(result).toBeGreaterThan(0);
      expect(Number.isFinite(result)).toBe(true);
    });

    it('handles zero edge length without error', () => {
      const result = calculateMaxFilletRadius(0, 10, Math.PI / 2);
      expect(Number.isFinite(result)).toBe(true);
      // With zero edge, should return 0 or small value
    });

    it('handles both edges zero without error', () => {
      const result = calculateMaxFilletRadius(0, 0, Math.PI / 2);
      expect(Number.isFinite(result)).toBe(true);
    });

    it('asymmetric edge lengths use shorter edge', () => {
      const result = calculateMaxFilletRadius(5, 20, Math.PI / 2);
      // Max radius should be limited by the shorter edge
      // Use toBeCloseTo to handle floating point precision
      expect(result).toBeCloseTo(4, 1);
    });

    it('negative edge lengths are handled', () => {
      const result = calculateMaxFilletRadius(-5, 10, Math.PI / 2);
      expect(Number.isFinite(result)).toBe(true);
    });
  });

  describe('angle edge cases', () => {
    it('handles 180 degree angle (straight line) without error', () => {
      // 180 degrees = PI radians (straight line, no corner)
      const result = calculateMaxFilletRadius(10, 10, Math.PI);
      expect(Number.isFinite(result)).toBe(true);
    });

    it('handles 0 degree angle (hairpin) without error', () => {
      // 0 degrees = 0 radians (edges folded back on each other)
      const result = calculateMaxFilletRadius(10, 10, 0);
      expect(Number.isFinite(result)).toBe(true);
    });

    it('handles angle very close to 180 degrees', () => {
      const result = calculateMaxFilletRadius(10, 10, Math.PI - 0.001);
      expect(Number.isFinite(result)).toBe(true);
    });

    it('handles angle very close to 0 degrees', () => {
      const result = calculateMaxFilletRadius(10, 10, 0.001);
      expect(Number.isFinite(result)).toBe(true);
    });

    it('handles negative angle', () => {
      const result = calculateMaxFilletRadius(10, 10, -Math.PI / 2);
      expect(Number.isFinite(result)).toBe(true);
    });

    it('handles angle greater than 2*PI', () => {
      const result = calculateMaxFilletRadius(10, 10, 3 * Math.PI);
      expect(Number.isFinite(result)).toBe(true);
    });
  });

  describe('mathematical correctness', () => {
    it('90 degree corner allows larger fillet than 45 degree corner', () => {
      const result90 = calculateMaxFilletRadius(10, 10, Math.PI / 2);
      const result45 = calculateMaxFilletRadius(10, 10, Math.PI / 4);

      // At 90 degrees, exterior angle is 90, half angle is 45
      // At 45 degrees, exterior angle is 135, half angle is 67.5
      // tan(67.5) > tan(45), so 45 degree corner should allow smaller radius
      expect(result90).toBeGreaterThan(result45);
    });

    it('135 degree corner allows larger fillet than 90 degree corner', () => {
      const result135 = calculateMaxFilletRadius(10, 10, (3 * Math.PI) / 4);
      const result90 = calculateMaxFilletRadius(10, 10, Math.PI / 2);

      // At 135 degrees, exterior angle is 45, half angle is 22.5
      // tan(22.5) < tan(45), so 135 degree corner allows larger radius
      expect(result135).toBeGreaterThan(result90);
    });

    it('longer edges allow proportionally larger fillets', () => {
      const resultSmall = calculateMaxFilletRadius(5, 5, Math.PI / 2);
      const resultLarge = calculateMaxFilletRadius(10, 10, Math.PI / 2);

      // With same angle, longer edges should allow larger fillet
      expect(resultLarge).toBeGreaterThan(resultSmall);
      // And should be roughly proportional
      expect(resultLarge / resultSmall).toBeCloseTo(2, 1);
    });
  });
});
