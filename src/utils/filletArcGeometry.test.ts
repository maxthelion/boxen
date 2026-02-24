/**
 * Fillet Arc Geometry Tests
 *
 * Verifies that applyFillet produces arcs that are:
 * - Truly circular (all points equidistant from center)
 * - Tangent to both edges at the tangent points
 * - Correctly positioned via the angle bisector method
 *
 * Tests cover 90°, 135°, and 45° corner angles (angle between incoming and
 * outgoing edge directions). The fix replaces the broken "average perpendiculars"
 * approach with the correct angle bisector formula.
 */

import { describe, it, expect } from 'vitest';
import { applyFillet } from './cornerFinish';
import type { PathPoint } from '../types';

// Numerical tolerance for floating-point comparisons
const LOOSE_EPS = 1e-6;

function dist(a: PathPoint, b: PathPoint): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function dot(ax: number, ay: number, bx: number, by: number): number {
  return ax * bx + ay * by;
}

/**
 * Compute the arc center using the correct angle bisector formula.
 * Returns center and the actual clamped radius.
 */
function computeCenter(
  corner: PathPoint,
  prevPoint: PathPoint,
  nextPoint: PathPoint,
  radius: number
): { center: PathPoint; clampedRadius: number } {
  const inVec = { x: corner.x - prevPoint.x, y: corner.y - prevPoint.y };
  const outVec = { x: nextPoint.x - corner.x, y: nextPoint.y - corner.y };
  const inLen = Math.sqrt(inVec.x ** 2 + inVec.y ** 2);
  const outLen = Math.sqrt(outVec.x ** 2 + outVec.y ** 2);
  const inNorm = { x: inVec.x / inLen, y: inVec.y / inLen };
  const outNorm = { x: outVec.x / outLen, y: outVec.y / outLen };

  const dotVal = Math.max(-1, Math.min(1, inNorm.x * outNorm.x + inNorm.y * outNorm.y));
  const alpha = Math.acos(dotVal);
  const halfAngle = alpha / 2;
  const tanHalf = Math.tan(halfAngle);
  const cosHalf = Math.cos(halfAngle);

  const tangentDist = radius * tanHalf;
  const maxTangentDist = Math.min(inLen * 0.5, outLen * 0.5);
  const clampedTangentDist = Math.min(tangentDist, maxTangentDist);
  const clampedRadius = clampedTangentDist / tanHalf;

  const bisX = outNorm.x - inNorm.x;
  const bisY = outNorm.y - inNorm.y;
  const bisLen = Math.sqrt(bisX ** 2 + bisY ** 2);
  const bisNorm = { x: bisX / bisLen, y: bisY / bisLen };
  const centerDist = clampedRadius / cosHalf;

  return {
    center: {
      x: corner.x + bisNorm.x * centerDist,
      y: corner.y + bisNorm.y * centerDist,
    },
    clampedRadius,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 90-degree corners (standard square corners)
// ─────────────────────────────────────────────────────────────────────────────
describe('applyFillet — 90° corner', () => {
  // Setup: CCW path, right-then-up turn at corner (100, 0)
  // inNorm = (1, 0), outNorm = (0, 1), alpha = 90°
  const prev: PathPoint = { x: 0, y: 0 };
  const corner: PathPoint = { x: 100, y: 0 };
  const next: PathPoint = { x: 100, y: 100 };
  const RADIUS = 10;

  const points = applyFillet(corner, prev, next, RADIUS);
  // With 8 segments default: 1 start + 7 intermediate + 1 end = 9 points
  const startPt = points[0];
  const endPt = points[points.length - 1];

  it('produces the expected number of arc points', () => {
    expect(points.length).toBe(9); // 8 segments → 9 points
  });

  it('start tangent point lies on incoming edge', () => {
    // Should be at (90, 0) — on the line y=0, x between 0 and 100
    expect(startPt.y).toBeCloseTo(0, 9);
    expect(startPt.x).toBeCloseTo(90, 9);
  });

  it('end tangent point lies on outgoing edge', () => {
    // Should be at (100, 10) — on the line x=100, y between 0 and 100
    expect(endPt.x).toBeCloseTo(100, 9);
    expect(endPt.y).toBeCloseTo(10, 9);
  });

  it('all arc points lie on a circle of the correct radius', () => {
    const { center, clampedRadius } = computeCenter(corner, prev, next, RADIUS);
    for (const pt of points) {
      const d = dist(pt, center);
      expect(d).toBeCloseTo(clampedRadius, 6);
    }
  });

  it('arc is tangent to incoming edge at start (center-to-start ⊥ inNorm)', () => {
    const { center } = computeCenter(corner, prev, next, RADIUS);
    // Vector from center to start
    const vx = startPt.x - center.x;
    const vy = startPt.y - center.y;
    // inNorm = (1, 0)
    const dotProduct = dot(vx, vy, 1, 0);
    expect(Math.abs(dotProduct)).toBeLessThan(LOOSE_EPS);
  });

  it('arc is tangent to outgoing edge at end (center-to-end ⊥ outNorm)', () => {
    const { center } = computeCenter(corner, prev, next, RADIUS);
    // Vector from center to end
    const vx = endPt.x - center.x;
    const vy = endPt.y - center.y;
    // outNorm = (0, 1)
    const dotProduct = dot(vx, vy, 0, 1);
    expect(Math.abs(dotProduct)).toBeLessThan(LOOSE_EPS);
  });

  it('arc center is equidistant from start and end tangent points', () => {
    const { center, clampedRadius } = computeCenter(corner, prev, next, RADIUS);
    expect(dist(center, startPt)).toBeCloseTo(clampedRadius, 6);
    expect(dist(center, endPt)).toBeCloseTo(clampedRadius, 6);
  });

  it('arc sweeps through approximately 90 degrees', () => {
    const { center } = computeCenter(corner, prev, next, RADIUS);
    const startAngle = Math.atan2(startPt.y - center.y, startPt.x - center.x);
    const endAngle = Math.atan2(endPt.y - center.y, endPt.x - center.x);
    let sweep = endAngle - startAngle;
    if (sweep < 0) sweep += 2 * Math.PI;
    expect(sweep).toBeCloseTo(Math.PI / 2, 6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 135-degree corners (sharp, more than a right-angle turn)
// ─────────────────────────────────────────────────────────────────────────────
describe('applyFillet — 135° corner', () => {
  // alpha = 135°: inNorm = (1, 0), outNorm = (-1/√2, 1/√2)
  // nextPoint chosen so outVec direction = (-1/√2, 1/√2)
  // prevPoint = (0, 0), corner = (100, 0)
  // next = corner + (-1, 1)*100 = (0, 100) [outLen = 100√2]
  const prev: PathPoint = { x: 0, y: 0 };
  const corner: PathPoint = { x: 100, y: 0 };
  const next: PathPoint = { x: 0, y: 100 };  // outNorm = (-1/√2, 1/√2)
  const RADIUS = 5;

  const points = applyFillet(corner, prev, next, RADIUS);
  const startPt = points[0];
  const endPt = points[points.length - 1];

  it('produces the expected number of arc points', () => {
    expect(points.length).toBe(9);
  });

  it('all arc points lie on a circle of the correct radius', () => {
    const { center, clampedRadius } = computeCenter(corner, prev, next, RADIUS);
    for (const pt of points) {
      expect(dist(pt, center)).toBeCloseTo(clampedRadius, 6);
    }
  });

  it('arc center is equidistant from start and end tangent points', () => {
    const { center, clampedRadius } = computeCenter(corner, prev, next, RADIUS);
    expect(dist(center, startPt)).toBeCloseTo(clampedRadius, 6);
    expect(dist(center, endPt)).toBeCloseTo(clampedRadius, 6);
  });

  it('start tangent point lies on incoming edge (y=0, x between 0 and 100)', () => {
    expect(startPt.y).toBeCloseTo(0, 6);
    expect(startPt.x).toBeGreaterThan(0 - LOOSE_EPS);
    expect(startPt.x).toBeLessThan(100 + LOOSE_EPS);
  });

  it('end tangent point lies on outgoing edge line', () => {
    // Outgoing edge from (100,0) to (0,100): parametrically (100-t, t) for t in [0,100]
    // On this line: x + y = 100
    expect(endPt.x + endPt.y).toBeCloseTo(100, 6);
  });

  it('arc is tangent to incoming edge at start (center-to-start ⊥ inNorm)', () => {
    const { center } = computeCenter(corner, prev, next, RADIUS);
    const vx = startPt.x - center.x;
    const vy = startPt.y - center.y;
    // inNorm = (1, 0)
    expect(Math.abs(dot(vx, vy, 1, 0))).toBeLessThan(LOOSE_EPS);
  });

  it('arc is tangent to outgoing edge at end (center-to-end ⊥ outNorm)', () => {
    const { center } = computeCenter(corner, prev, next, RADIUS);
    const vx = endPt.x - center.x;
    const vy = endPt.y - center.y;
    // outNorm = (-1/√2, 1/√2)
    const outNx = -1 / Math.SQRT2;
    const outNy = 1 / Math.SQRT2;
    expect(Math.abs(dot(vx, vy, outNx, outNy))).toBeLessThan(LOOSE_EPS);
  });

  it('arc sweeps through approximately 135 degrees', () => {
    const { center } = computeCenter(corner, prev, next, RADIUS);
    const startAngle = Math.atan2(startPt.y - center.y, startPt.x - center.x);
    const endAngle = Math.atan2(endPt.y - center.y, endPt.x - center.x);
    let sweep = endAngle - startAngle;
    if (sweep < 0) sweep += 2 * Math.PI;
    expect(sweep).toBeCloseTo(3 * Math.PI / 4, 6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 45-degree corners (gentle, less than a right-angle turn)
// ─────────────────────────────────────────────────────────────────────────────
describe('applyFillet — 45° corner', () => {
  // alpha = 45°: inNorm = (1, 0), outNorm = (1/√2, 1/√2)
  // prev = (0, 0), corner = (100, 0)
  // next = corner + (1, 1)*100 = (200, 100) [outLen = 100√2]
  const prev: PathPoint = { x: 0, y: 0 };
  const corner: PathPoint = { x: 100, y: 0 };
  const next: PathPoint = { x: 200, y: 100 };  // outNorm = (1/√2, 1/√2)
  const RADIUS = 5;

  const points = applyFillet(corner, prev, next, RADIUS);
  const startPt = points[0];
  const endPt = points[points.length - 1];

  it('produces the expected number of arc points', () => {
    expect(points.length).toBe(9);
  });

  it('all arc points lie on a circle of the correct radius', () => {
    const { center, clampedRadius } = computeCenter(corner, prev, next, RADIUS);
    for (const pt of points) {
      expect(dist(pt, center)).toBeCloseTo(clampedRadius, 6);
    }
  });

  it('arc center is equidistant from start and end tangent points', () => {
    const { center, clampedRadius } = computeCenter(corner, prev, next, RADIUS);
    expect(dist(center, startPt)).toBeCloseTo(clampedRadius, 6);
    expect(dist(center, endPt)).toBeCloseTo(clampedRadius, 6);
  });

  it('start tangent point lies on incoming edge (y=0)', () => {
    expect(startPt.y).toBeCloseTo(0, 6);
    expect(startPt.x).toBeGreaterThan(0 - LOOSE_EPS);
    expect(startPt.x).toBeLessThan(100 + LOOSE_EPS);
  });

  it('end tangent point lies on outgoing edge line', () => {
    // Outgoing edge: from (100,0) in direction (1/√2, 1/√2)
    // Points on this line: (100 + t/√2, t/√2), or equivalently y = x - 100
    expect(endPt.y).toBeCloseTo(endPt.x - 100, 6);
  });

  it('arc is tangent to incoming edge at start (center-to-start ⊥ inNorm)', () => {
    const { center } = computeCenter(corner, prev, next, RADIUS);
    const vx = startPt.x - center.x;
    const vy = startPt.y - center.y;
    expect(Math.abs(dot(vx, vy, 1, 0))).toBeLessThan(LOOSE_EPS);
  });

  it('arc is tangent to outgoing edge at end (center-to-end ⊥ outNorm)', () => {
    const { center } = computeCenter(corner, prev, next, RADIUS);
    const vx = endPt.x - center.x;
    const vy = endPt.y - center.y;
    // outNorm = (1/√2, 1/√2)
    expect(Math.abs(dot(vx, vy, 1 / Math.SQRT2, 1 / Math.SQRT2))).toBeLessThan(LOOSE_EPS);
  });

  it('arc sweeps through approximately 45 degrees', () => {
    const { center } = computeCenter(corner, prev, next, RADIUS);
    const startAngle = Math.atan2(startPt.y - center.y, startPt.x - center.x);
    const endAngle = Math.atan2(endPt.y - center.y, endPt.x - center.x);
    let sweep = endAngle - startAngle;
    if (sweep < 0) sweep += 2 * Math.PI;
    expect(sweep).toBeCloseTo(Math.PI / 4, 6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Radius clamping
// ─────────────────────────────────────────────────────────────────────────────
describe('applyFillet — radius clamping', () => {
  it('clamps when radius is too large for the incoming edge', () => {
    // Incoming edge length = 20, outgoing edge length = 200
    // For 90° corner: tangentDist = radius*tan(45°) = radius
    // maxTangentDist = min(20, 200)*0.5 = 10
    // So radius > 10 will be clamped to 10
    const prev: PathPoint = { x: 80, y: 0 };  // inLen = 20
    const corner: PathPoint = { x: 100, y: 0 };
    const next: PathPoint = { x: 100, y: 200 };  // outLen = 200
    const RADIUS = 50;  // would require tangentDist = 50, max is 10

    const points = applyFillet(corner, prev, next, RADIUS);
    const startPt = points[0];
    const endPt = points[points.length - 1];

    // Start point should be no farther than 10 from corner along incoming edge
    const startDist = dist(startPt, corner);
    expect(startDist).toBeLessThanOrEqual(10 + LOOSE_EPS);

    // End point should be no farther than 10 from corner along outgoing edge
    const endDist = dist(endPt, corner);
    expect(endDist).toBeLessThanOrEqual(10 + LOOSE_EPS);
  });

  it('clamps when radius is too large for the outgoing edge', () => {
    // Incoming edge length = 200, outgoing edge length = 20
    const prev: PathPoint = { x: 0, y: 0 };  // inLen = 100
    const corner: PathPoint = { x: 100, y: 0 };
    const next: PathPoint = { x: 100, y: 14 };  // outLen = 14 → max = 7
    const RADIUS = 50;

    const points = applyFillet(corner, prev, next, RADIUS);
    const endPt = points[points.length - 1];
    const endDist = dist(endPt, corner);
    expect(endDist).toBeLessThanOrEqual(7 + LOOSE_EPS);
  });

  it('clamped arc still has all points on the correct circle', () => {
    const prev: PathPoint = { x: 90, y: 0 };  // inLen = 10
    const corner: PathPoint = { x: 100, y: 0 };
    const next: PathPoint = { x: 100, y: 200 };
    const RADIUS = 100;  // will be clamped to 5 (maxTangentDist=5)

    const points = applyFillet(corner, prev, next, RADIUS);
    const { center, clampedRadius } = computeCenter(corner, prev, next, RADIUS);

    for (const pt of points) {
      expect(dist(pt, center)).toBeCloseTo(clampedRadius, 6);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Sweep direction
// ─────────────────────────────────────────────────────────────────────────────
describe('applyFillet — sweep direction', () => {
  it('CCW turn (cross > 0) sweeps the short way (< π)', () => {
    // Standard CCW right turn: inNorm=(1,0), outNorm=(0,1)
    const prev: PathPoint = { x: 0, y: 0 };
    const corner: PathPoint = { x: 100, y: 0 };
    const next: PathPoint = { x: 100, y: 100 };
    const RADIUS = 10;

    const points = applyFillet(corner, prev, next, RADIUS);
    const { center } = computeCenter(corner, prev, next, RADIUS);

    const startPt = points[0];
    const endPt = points[points.length - 1];

    const startAngle = Math.atan2(startPt.y - center.y, startPt.x - center.x);
    const endAngle = Math.atan2(endPt.y - center.y, endPt.x - center.x);

    let ccwSweep = endAngle - startAngle;
    if (ccwSweep < 0) ccwSweep += 2 * Math.PI;

    // Should sweep 90° CCW (short arc), not 270° CW (long arc)
    expect(ccwSweep).toBeCloseTo(Math.PI / 2, 6);
    expect(ccwSweep).toBeLessThan(Math.PI);
  });

  it('arc intermediate points have angles strictly between start and end (monotone sweep)', () => {
    // All intermediate arc points should have angles that are strictly between
    // the start and end angles (proving the short arc, not the long one)
    const prev: PathPoint = { x: 0, y: 0 };
    const corner: PathPoint = { x: 100, y: 0 };
    const next: PathPoint = { x: 100, y: 100 };
    const RADIUS = 10;

    const points = applyFillet(corner, prev, next, RADIUS);
    const { center } = computeCenter(corner, prev, next, RADIUS);

    const startAngle = Math.atan2(points[0].y - center.y, points[0].x - center.x);
    const endAngle = Math.atan2(
      points[points.length - 1].y - center.y,
      points[points.length - 1].x - center.x,
    );

    // CCW sweep: endAngle = startAngle + π/2
    // Each intermediate angle should be in (startAngle, endAngle) CCW
    for (let i = 1; i < points.length - 1; i++) {
      const angle = Math.atan2(points[i].y - center.y, points[i].x - center.x);
      // Normalize to [startAngle, startAngle + 2π)
      let offset = angle - startAngle;
      if (offset < 0) offset += 2 * Math.PI;
      const endOffset = endAngle - startAngle < 0
        ? endAngle - startAngle + 2 * Math.PI
        : endAngle - startAngle;
      expect(offset).toBeGreaterThan(-LOOSE_EPS);
      expect(offset).toBeLessThan(endOffset + LOOSE_EPS);
    }
  });
});
