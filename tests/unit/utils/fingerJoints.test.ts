import { describe, it, expect } from 'vitest';
import { generateFingerJointPathV2, Point } from '../../../src/utils/fingerJoints';
import { AxisFingerPoints } from '../../../src/types';

describe('generateFingerJointPathV2', () => {
  // Test finger points: transitions at 20, 32.8, 45.6, 58.4
  // Pattern: finger(0-20), hole(20-32.8), finger(32.8-45.6), hole(45.6-58.4), finger(58.4-end)
  const testFingerPoints: AxisFingerPoints = {
    axis: 'x',
    points: [20, 32.8, 45.6, 58.4],
    innerOffset: 15,
    fingerLength: 12.8,
    maxJointLength: 94,  // 100 - 2*3
  };

  it('returns straight edge when no finger points', () => {
    const emptyPoints: AxisFingerPoints = {
      axis: 'x',
      points: [],
      innerOffset: 15,
      fingerLength: 0,
      maxJointLength: 94,
    };

    const start: Point = { x: 0, y: 0 };
    const end: Point = { x: 100, y: 0 };

    const result = generateFingerJointPathV2(start, end, {
      fingerPoints: emptyPoints,
      gender: 'male',
      materialThickness: 3,
      edgeStartPos: 0,
      edgeEndPos: 100,
    });

    expect(result).toEqual([start, end]);
  });

  it('generates male (tab out) path for finger section', () => {
    const start: Point = { x: 0, y: 0 };
    const end: Point = { x: 94, y: 0 };  // maxJointLength

    const result = generateFingerJointPathV2(start, end, {
      fingerPoints: testFingerPoints,
      gender: 'male',
      materialThickness: 3,
      edgeStartPos: 0,
      edgeEndPos: 94,
    });

    // Should have more points than just start/end (finger joints)
    expect(result.length).toBeGreaterThan(2);

    // First point should be start
    expect(result[0]).toEqual(start);

    // Last point should be end
    expect(result[result.length - 1]).toEqual(end);

    // Should have some points with y offset (tabs)
    const hasTabPoints = result.some(p => Math.abs(p.y) > 0.1);
    expect(hasTabPoints).toBe(true);
  });

  it('generates female (slot in) path for hole sections', () => {
    const start: Point = { x: 0, y: 0 };
    const end: Point = { x: 94, y: 0 };

    const result = generateFingerJointPathV2(start, end, {
      fingerPoints: testFingerPoints,
      gender: 'female',
      materialThickness: 3,
      edgeStartPos: 0,
      edgeEndPos: 94,
    });

    expect(result.length).toBeGreaterThan(2);
    expect(result[0]).toEqual(start);
    expect(result[result.length - 1]).toEqual(end);

    // Should have some points with negative y offset (slots go inward)
    const hasSlotPoints = result.some(p => p.y < -0.1);
    expect(hasSlotPoints).toBe(true);
  });

  it('handles edge that only covers partial axis', () => {
    const start: Point = { x: 0, y: 0 };
    const end: Point = { x: 30, y: 0 };

    const result = generateFingerJointPathV2(start, end, {
      fingerPoints: testFingerPoints,
      gender: 'male',
      materialThickness: 3,
      edgeStartPos: 20,  // Start at first transition
      edgeEndPos: 50,    // Partial coverage
    });

    expect(result[0]).toEqual(start);
    expect(result[result.length - 1]).toEqual(end);
  });

  it('handles reversed edge direction (end < start)', () => {
    const start: Point = { x: 94, y: 0 };
    const end: Point = { x: 0, y: 0 };

    const result = generateFingerJointPathV2(start, end, {
      fingerPoints: testFingerPoints,
      gender: 'male',
      materialThickness: 3,
      edgeStartPos: 94,  // Reversed
      edgeEndPos: 0,
    });

    expect(result[0]).toEqual(start);
    expect(result[result.length - 1]).toEqual(end);
    expect(result.length).toBeGreaterThan(2);
  });

  it('produces aligned finger positions for mating edges', () => {
    // Two edges along the same axis should have fingers at the same positions
    // This is the key property of the V2 system

    // Edge 1: Front face's top edge (left to right)
    const start1: Point = { x: -47, y: 47 };
    const end1: Point = { x: 47, y: 47 };

    const result1 = generateFingerJointPathV2(start1, end1, {
      fingerPoints: testFingerPoints,
      gender: 'female',  // Receives tabs from top panel
      materialThickness: 3,
      edgeStartPos: 0,
      edgeEndPos: 94,
    });

    // Edge 2: Top face's front edge (left to right)
    const start2: Point = { x: -47, y: -47 };
    const end2: Point = { x: 47, y: -47 };

    const result2 = generateFingerJointPathV2(start2, end2, {
      fingerPoints: testFingerPoints,
      gender: 'male',  // Sends tabs into front panel
      materialThickness: 3,
      edgeStartPos: 0,
      edgeEndPos: 94,
    });

    // Both should have the same number of transition points
    // (though actual coordinates differ due to different y positions and tab directions)
    // What matters is the x-coordinates of transitions align
    const getXPositions = (points: Point[]): number[] => {
      return points
        .map(p => p.x)
        .filter((x, i, arr) => i === 0 || Math.abs(x - arr[i - 1]) > 0.1)
        .sort((a, b) => a - b);
    };

    const xPositions1 = getXPositions(result1);
    const xPositions2 = getXPositions(result2);

    // They should have the same X transition positions
    expect(xPositions1.length).toBe(xPositions2.length);
    for (let i = 0; i < xPositions1.length; i++) {
      expect(xPositions1[i]).toBeCloseTo(xPositions2[i], 0);
    }
  });

  it('handles vertical edges correctly', () => {
    const start: Point = { x: 0, y: 0 };
    const end: Point = { x: 0, y: 94 };

    const result = generateFingerJointPathV2(start, end, {
      fingerPoints: testFingerPoints,
      gender: 'male',
      materialThickness: 3,
      edgeStartPos: 0,
      edgeEndPos: 94,
    });

    expect(result[0]).toEqual(start);
    expect(result[result.length - 1]).toEqual(end);

    // For vertical edge with yUp, tabs should extend in X direction
    const hasTabPoints = result.some(p => Math.abs(p.x) > 0.1);
    expect(hasTabPoints).toBe(true);
  });

  it('respects yUp coordinate system option', () => {
    const start: Point = { x: 0, y: 0 };
    const end: Point = { x: 94, y: 0 };

    const resultYUp = generateFingerJointPathV2(start, end, {
      fingerPoints: testFingerPoints,
      gender: 'male',
      materialThickness: 3,
      edgeStartPos: 0,
      edgeEndPos: 94,
      yUp: true,
    });

    const resultYDown = generateFingerJointPathV2(start, end, {
      fingerPoints: testFingerPoints,
      gender: 'male',
      materialThickness: 3,
      edgeStartPos: 0,
      edgeEndPos: 94,
      yUp: false,
    });

    // Both should have same number of points
    expect(resultYUp.length).toBe(resultYDown.length);

    // Tab direction should be opposite
    const yUpMaxY = Math.max(...resultYUp.map(p => p.y));
    const yDownMinY = Math.min(...resultYDown.map(p => p.y));

    // yUp: tabs go positive Y, yDown: tabs go negative Y
    expect(yUpMaxY).toBeGreaterThan(0);
    expect(yDownMinY).toBeLessThan(0);
  });
});
