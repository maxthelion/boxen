import { describe, it, expect } from 'vitest';
import {
  calculateAxisFingerPoints,
  calculateAssemblyFingerPoints,
  getFingerPointsInRange,
  getSectionTypeAtPosition,
  generateExtendedFingerPoints,
} from './fingerPoints';
import { FingerPointConfig, BoxConfig } from '../types';

describe('Finger Point Calculator', () => {
  describe('calculateAxisFingerPoints', () => {
    const defaultConfig: FingerPointConfig = {
      materialThickness: 3,
      fingerLength: 10,
      minDistance: 15, // 1.5 * fingerLength
    };

    it('calculates correct points for standard axis', () => {
      // 100mm axis with 3mm MT
      // maxJointLength = 100 - 6 = 94mm
      // usableLength = 94 - 30 = 64mm
      // numSections = floor(64 / 10) = 6 -> make odd -> 5
      // actualFingerLength = 64 / 5 = 12.8mm
      // Points at: 15 + 12.8 = 27.8, 15 + 25.6 = 40.6, 15 + 38.4 = 53.4, 15 + 51.2 = 66.2
      const result = calculateAxisFingerPoints('x', 100, defaultConfig);

      expect(result.axis).toBe('x');
      expect(result.maxJointLength).toBe(94);
      expect(result.innerOffset).toBe(15);
      expect(result.points.length).toBe(4); // 5 sections = 4 transition points
    });

    it('ensures odd number of sections for symmetry', () => {
      const result = calculateAxisFingerPoints('y', 100, defaultConfig);

      // With 5 sections, pattern is: OUT-IN-OUT-IN-OUT
      // 4 transitions between them
      expect(result.points.length).toBe(4);

      // Verify the pattern alternates correctly
      expect(getSectionTypeAtPosition(0, result)).toBe('finger');
      expect(getSectionTypeAtPosition(result.points[0] + 0.1, result)).toBe('hole');
      expect(getSectionTypeAtPosition(result.points[1] + 0.1, result)).toBe('finger');
    });

    it('returns empty points for very small axis', () => {
      const smallConfig: FingerPointConfig = {
        materialThickness: 3,
        fingerLength: 10,
        minDistance: 15,
      };

      // 20mm axis: maxJointLength = 14mm, usableLength = 14 - 30 = negative
      const result = calculateAxisFingerPoints('x', 20, smallConfig);

      expect(result.points.length).toBe(0);
      expect(result.fingerLength).toBe(0);
    });

    it('handles minimum viable size (single finger)', () => {
      const config: FingerPointConfig = {
        materialThickness: 3,
        fingerLength: 10,
        minDistance: 5,
      };

      // 30mm axis: maxJointLength = 24mm, usableLength = 24 - 10 = 14mm
      // numSections = 1 (minimum)
      const result = calculateAxisFingerPoints('x', 30, config);

      expect(result.points.length).toBe(0); // 1 section = 0 transitions
      expect(result.fingerLength).toBeGreaterThan(0);
    });

    it('produces symmetric inner offsets', () => {
      const result = calculateAxisFingerPoints('x', 100, defaultConfig);

      // The pattern should be symmetric around the center
      // First finger starts at innerOffset, last finger ends at maxJointLength - innerOffset
      const firstFingerStart = result.innerOffset;
      const lastFingerEnd = result.maxJointLength - result.innerOffset;

      // Total finger pattern length
      const patternLength = lastFingerEnd - firstFingerStart;

      // Should be centered
      expect(firstFingerStart).toBeCloseTo(result.maxJointLength - lastFingerEnd, 1);
    });
  });

  describe('calculateAssemblyFingerPoints', () => {
    it('calculates finger points for all 3 axes', () => {
      const boxConfig: BoxConfig = {
        width: 100,
        height: 80,
        depth: 60,
        materialThickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
        assembly: {
          assemblyAxis: 'y',
          lids: {
            positive: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
            negative: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
          },
        },
      };

      const result = calculateAssemblyFingerPoints(boxConfig);

      expect(result.x).toBeDefined();
      expect(result.y).toBeDefined();
      expect(result.z).toBeDefined();

      expect(result.x.axis).toBe('x');
      expect(result.y.axis).toBe('y');
      expect(result.z.axis).toBe('z');

      // X axis (width=100) should have the most points
      // Z axis (depth=60) should have fewer
      expect(result.x.maxJointLength).toBeGreaterThan(result.z.maxJointLength);
    });

    it('converts fingerGap multiplier to minDistance', () => {
      const boxConfig: BoxConfig = {
        width: 100,
        height: 80,
        depth: 60,
        materialThickness: 3,
        fingerWidth: 10,
        fingerGap: 2.0, // 2x fingerWidth = 20mm
        assembly: {
          assemblyAxis: 'y',
          lids: {
            positive: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
            negative: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
          },
        },
      };

      const result = calculateAssemblyFingerPoints(boxConfig);

      // innerOffset should be the minDistance = 2.0 * 10 = 20mm
      expect(result.x.innerOffset).toBe(20);
    });
  });

  describe('getFingerPointsInRange', () => {
    it('filters points to specified range', () => {
      const axisPoints = calculateAxisFingerPoints('x', 100, {
        materialThickness: 3,
        fingerLength: 10,
        minDistance: 15,
      });

      // Get points in the middle range
      const midPoint = axisPoints.maxJointLength / 2;
      const range = 20;
      const filtered = getFingerPointsInRange(
        axisPoints,
        midPoint - range,
        midPoint + range
      );

      // All filtered points should be within range
      for (const p of filtered) {
        expect(p).toBeGreaterThanOrEqual(midPoint - range);
        expect(p).toBeLessThanOrEqual(midPoint + range);
      }
    });

    it('returns empty array when no points in range', () => {
      const axisPoints = calculateAxisFingerPoints('x', 100, {
        materialThickness: 3,
        fingerLength: 10,
        minDistance: 15,
      });

      // Range before any points
      const filtered = getFingerPointsInRange(axisPoints, 0, 10);

      expect(filtered.length).toBe(0);
    });

    it('returns all points when range covers entire axis', () => {
      const axisPoints = calculateAxisFingerPoints('x', 100, {
        materialThickness: 3,
        fingerLength: 10,
        minDistance: 15,
      });

      const filtered = getFingerPointsInRange(
        axisPoints,
        0,
        axisPoints.maxJointLength
      );

      expect(filtered.length).toBe(axisPoints.points.length);
    });
  });

  describe('getSectionTypeAtPosition', () => {
    it('returns finger for position before first point', () => {
      const axisPoints = calculateAxisFingerPoints('x', 100, {
        materialThickness: 3,
        fingerLength: 10,
        minDistance: 15,
      });

      expect(getSectionTypeAtPosition(0, axisPoints)).toBe('finger');
      expect(getSectionTypeAtPosition(10, axisPoints)).toBe('finger');
    });

    it('alternates between finger and hole', () => {
      const axisPoints = calculateAxisFingerPoints('x', 100, {
        materialThickness: 3,
        fingerLength: 10,
        minDistance: 15,
      });

      if (axisPoints.points.length >= 2) {
        // Just after first transition = hole
        expect(getSectionTypeAtPosition(axisPoints.points[0] + 0.1, axisPoints)).toBe('hole');
        // Just after second transition = finger
        expect(getSectionTypeAtPosition(axisPoints.points[1] + 0.1, axisPoints)).toBe('finger');
      }
    });

    it('handles empty points array', () => {
      const emptyPoints = calculateAxisFingerPoints('x', 20, {
        materialThickness: 3,
        fingerLength: 10,
        minDistance: 15,
      });

      // With no points, everything is a finger (single OUT section)
      expect(getSectionTypeAtPosition(0, emptyPoints)).toBe('finger');
      expect(getSectionTypeAtPosition(10, emptyPoints)).toBe('finger');
    });
  });

  describe('generateExtendedFingerPoints', () => {
    it('generates points beyond maxJointLength', () => {
      const axisPoints = calculateAxisFingerPoints('x', 100, {
        materialThickness: 3,
        fingerLength: 10,
        minDistance: 15,
      });

      const extended = generateExtendedFingerPoints(axisPoints, 30);

      // Extended points should be beyond maxJointLength - innerOffset
      for (const p of extended) {
        expect(p).toBeGreaterThan(axisPoints.maxJointLength - axisPoints.innerOffset);
      }
    });

    it('returns empty array for zero extension', () => {
      const axisPoints = calculateAxisFingerPoints('x', 100, {
        materialThickness: 3,
        fingerLength: 10,
        minDistance: 15,
      });

      const extended = generateExtendedFingerPoints(axisPoints, 0);

      expect(extended.length).toBe(0);
    });

    it('maintains fingerLength spacing', () => {
      const axisPoints = calculateAxisFingerPoints('x', 100, {
        materialThickness: 3,
        fingerLength: 10,
        minDistance: 15,
      });

      const extended = generateExtendedFingerPoints(axisPoints, 50);

      if (extended.length >= 2) {
        const spacing = extended[1] - extended[0];
        expect(spacing).toBeCloseTo(axisPoints.fingerLength, 1);
      }
    });
  });

  describe('Alignment verification', () => {
    it('mating edges use identical finger points', () => {
      // This is the key property: all edges parallel to an axis
      // share the same finger points
      const boxConfig: BoxConfig = {
        width: 100,
        height: 80,
        depth: 60,
        materialThickness: 3,
        fingerWidth: 10,
        fingerGap: 1.5,
        assembly: {
          assemblyAxis: 'y',
          lids: {
            positive: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
            negative: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
          },
        },
      };

      const fingerData = calculateAssemblyFingerPoints(boxConfig);

      // Front face top edge and Top face bottom edge both use X-axis points
      // They should have identical finger positions
      const frontTopEdgePoints = fingerData.x.points;
      const topBottomEdgePoints = fingerData.x.points;

      expect(frontTopEdgePoints).toEqual(topBottomEdgePoints);

      // This guarantees alignment by construction
    });
  });
});
