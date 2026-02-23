/**
 * Tests for edge path validation — self-intersection and crossing detection.
 *
 * These tests should FAIL before implementation (the functions don't exist yet).
 * They prove the bug: self-intersecting edge paths are accepted without validation.
 */
import { describe, it, expect } from 'vitest';
import {
  detectEdgePathSelfIntersection,
  detectEdgePathCrossing,
} from './edgePathValidation';
import type { EdgePathPoint } from '../engine/types';

describe('detectEdgePathSelfIntersection', () => {
  it('returns false for a straight edge path', () => {
    const straightPath: EdgePathPoint[] = [
      { t: 0, offset: 0 },
      { t: 1, offset: 0 },
    ];
    expect(detectEdgePathSelfIntersection(straightPath)).toBe(false);
  });

  it('returns false for a valid rectangular notch path', () => {
    // Clean rectangular notch: monotonically increasing t, no crossings
    const validPath: EdgePathPoint[] = [
      { t: 0, offset: 0 },
      { t: 0.2, offset: 0 },
      { t: 0.2, offset: -8 },  // drop into notch
      { t: 0.7, offset: -8 },  // across notch
      { t: 0.7, offset: 0 },   // return to edge
      { t: 1, offset: 0 },
    ];
    expect(detectEdgePathSelfIntersection(validPath)).toBe(false);
  });

  it('returns false for a valid V-shaped notch', () => {
    const vNotch: EdgePathPoint[] = [
      { t: 0, offset: 0 },
      { t: 0.3, offset: 0 },
      { t: 0.5, offset: -10 },  // bottom of V
      { t: 0.7, offset: 0 },
      { t: 1, offset: 0 },
    ];
    expect(detectEdgePathSelfIntersection(vNotch)).toBe(false);
  });

  it('returns true for a self-crossing path (backward t jump)', () => {
    // Path goes right-down, then left-up, then right-up — creates an X crossing
    // Segment (0,0)→(0.7,-10) crosses segment (0.3,-5)→(1,0)
    const selfCrossingPath: EdgePathPoint[] = [
      { t: 0, offset: 0 },
      { t: 0.7, offset: -10 },  // goes far right and deep
      { t: 0.3, offset: -5 },   // jumps BACK-LEFT (backwards in t) — creates crossing
      { t: 1, offset: 0 },
    ];
    expect(detectEdgePathSelfIntersection(selfCrossingPath)).toBe(true);
  });

  it('returns true for a zigzag path with multiple crossings', () => {
    // User draws a chaotic zigzag pattern
    const zigzag: EdgePathPoint[] = [
      { t: 0.1, offset: 0 },
      { t: 0.9, offset: -10 },  // goes deep-right
      { t: 0.2, offset: -8 },   // jumps far back-left
      { t: 0.8, offset: 0 },    // goes right
    ];
    expect(detectEdgePathSelfIntersection(zigzag)).toBe(true);
  });

  it('returns false for path with fewer than 4 points (cannot self-intersect)', () => {
    const shortPath: EdgePathPoint[] = [
      { t: 0, offset: 0 },
      { t: 0.5, offset: -5 },
      { t: 1, offset: 0 },
    ];
    // 3 points = 2 segments, two adjacent segments can't cross each other
    expect(detectEdgePathSelfIntersection(shortPath)).toBe(false);
  });
});

describe('detectEdgePathCrossing', () => {
  it('returns false when paths are completely separate (no overlap)', () => {
    // Existing path covers t=0 to t=0.4
    const existingPath: EdgePathPoint[] = [
      { t: 0, offset: 0 },
      { t: 0.2, offset: 0 },
      { t: 0.2, offset: -8 },
      { t: 0.4, offset: -8 },
      { t: 0.4, offset: 0 },
      { t: 1, offset: 0 },
    ];
    // New path covers t=0.6 to t=1 — no overlap
    const newPath: EdgePathPoint[] = [
      { t: 0, offset: 0 },
      { t: 0.6, offset: 0 },
      { t: 0.6, offset: -5 },
      { t: 0.8, offset: -5 },
      { t: 0.8, offset: 0 },
      { t: 1, offset: 0 },
    ];
    expect(detectEdgePathCrossing(existingPath, newPath)).toBe(false);
  });

  it('returns false when both paths are straight (no modification)', () => {
    const path1: EdgePathPoint[] = [{ t: 0, offset: 0 }, { t: 1, offset: 0 }];
    const path2: EdgePathPoint[] = [{ t: 0, offset: 0 }, { t: 1, offset: 0 }];
    expect(detectEdgePathCrossing(path1, path2)).toBe(false);
  });

  it('returns true when new diagonal path crosses existing notch wall', () => {
    // Existing has a deep square notch from t=0.3 to t=0.6
    const existingPath: EdgePathPoint[] = [
      { t: 0, offset: 0 },
      { t: 0.3, offset: 0 },
      { t: 0.3, offset: -10 },  // left wall going down
      { t: 0.6, offset: -10 },  // notch bottom
      { t: 0.6, offset: 0 },    // right wall going up
      { t: 1, offset: 0 },
    ];
    // New path goes from t=0.1,offset=0 diagonally to t=0.9,offset=-15
    // This diagonal crosses through the existing notch walls
    const newPath: EdgePathPoint[] = [
      { t: 0.1, offset: 0 },
      { t: 0.9, offset: -15 },
    ];
    expect(detectEdgePathCrossing(existingPath, newPath)).toBe(true);
  });

  it('returns true when new path segment intersects existing notch bottom', () => {
    // Existing: wide shallow notch from t=0.2 to t=0.8 at offset=-5
    const existingPath: EdgePathPoint[] = [
      { t: 0, offset: 0 },
      { t: 0.2, offset: 0 },
      { t: 0.2, offset: -5 },
      { t: 0.8, offset: -5 },
      { t: 0.8, offset: 0 },
      { t: 1, offset: 0 },
    ];
    // New path goes from far above the notch (offset=0) diagonally down past it (offset=-12)
    // The diagonal from (0.1, 0) to (0.9, -12) will cross the bottom of the existing notch
    const newPath: EdgePathPoint[] = [
      { t: 0.1, offset: 0 },
      { t: 0.9, offset: -12 },
    ];
    expect(detectEdgePathCrossing(existingPath, newPath)).toBe(true);
  });
});
