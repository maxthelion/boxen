/**
 * Unit tests for AxisGizmo drag projection math.
 *
 * These tests verify the core geometric calculation used when dragging:
 * projecting a world-space displacement vector onto a constrained axis
 * and converting the result from world units to mm.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { projectDeltaToAxis } from './AxisGizmo';

describe('projectDeltaToAxis', () => {
  describe('axis-aligned movement', () => {
    it('returns correct mm displacement when moving along +Z axis', () => {
      const delta = new THREE.Vector3(0, 0, 10); // 10 world units in +Z
      const axis = new THREE.Vector3(0, 0, 1);
      const scale = 1; // 1 world unit per mm

      const result = projectDeltaToAxis(delta, axis, scale);

      expect(result).toBeCloseTo(10);
    });

    it('returns correct mm displacement when moving along +X axis', () => {
      const delta = new THREE.Vector3(5, 0, 0); // 5 world units in +X
      const axis = new THREE.Vector3(1, 0, 0);
      const scale = 1;

      const result = projectDeltaToAxis(delta, axis, scale);

      expect(result).toBeCloseTo(5);
    });

    it('returns correct mm displacement when moving along +Y axis', () => {
      const delta = new THREE.Vector3(0, 8, 0); // 8 world units in +Y
      const axis = new THREE.Vector3(0, 1, 0);
      const scale = 1;

      const result = projectDeltaToAxis(delta, axis, scale);

      expect(result).toBeCloseTo(8);
    });

    it('returns negative displacement when moving opposite to axis', () => {
      const delta = new THREE.Vector3(0, 0, -15); // moving in -Z
      const axis = new THREE.Vector3(0, 0, 1);    // axis is +Z
      const scale = 1;

      const result = projectDeltaToAxis(delta, axis, scale);

      expect(result).toBeCloseTo(-15);
    });
  });

  describe('scale conversion', () => {
    it('divides world displacement by scale to get mm', () => {
      const delta = new THREE.Vector3(0, 0, 20); // 20 world units
      const axis = new THREE.Vector3(0, 0, 1);
      const scale = 2; // 2 world units per mm → 10 mm

      const result = projectDeltaToAxis(delta, axis, scale);

      expect(result).toBeCloseTo(10);
    });

    it('handles non-integer scale correctly', () => {
      const delta = new THREE.Vector3(0, 0, 15); // 15 world units
      const axis = new THREE.Vector3(0, 0, 1);
      const scale = 0.5; // 0.5 world units per mm → 30 mm

      const result = projectDeltaToAxis(delta, axis, scale);

      expect(result).toBeCloseTo(30);
    });

    it('converts typical scale factor (e.g. 0.1) correctly', () => {
      // If scale = 0.1 (10 pixels per mm), and delta = 10 world units,
      // that means 100 mm of movement
      const delta = new THREE.Vector3(10, 0, 0);
      const axis = new THREE.Vector3(1, 0, 0);
      const scale = 0.1;

      const result = projectDeltaToAxis(delta, axis, scale);

      expect(result).toBeCloseTo(100);
    });
  });

  describe('off-axis movement is ignored', () => {
    it('ignores perpendicular movement when axis is Z', () => {
      // Moving purely in XY plane should produce zero displacement along Z
      const delta = new THREE.Vector3(10, 7, 0);
      const axis = new THREE.Vector3(0, 0, 1);
      const scale = 1;

      const result = projectDeltaToAxis(delta, axis, scale);

      expect(result).toBeCloseTo(0);
    });

    it('only captures the component along the axis for diagonal movement', () => {
      // Moving diagonally at 45° in Z-Y plane: delta = (0, 5, 5)
      // Component along +Z axis is 5 world units
      const delta = new THREE.Vector3(0, 5, 5);
      const axis = new THREE.Vector3(0, 0, 1);
      const scale = 1;

      const result = projectDeltaToAxis(delta, axis, scale);

      expect(result).toBeCloseTo(5);
    });

    it('handles arbitrary diagonal movement', () => {
      // delta = (3, 4, 5), axis = (0, 0, 1)
      // Component along Z = 5
      const delta = new THREE.Vector3(3, 4, 5);
      const axis = new THREE.Vector3(0, 0, 1);
      const scale = 1;

      const result = projectDeltaToAxis(delta, axis, scale);

      expect(result).toBeCloseTo(5);
    });
  });

  describe('negative axis directions', () => {
    it('works correctly with -Z axis (back face normal)', () => {
      // Moving in -Z direction along -Z axis should give positive delta
      const delta = new THREE.Vector3(0, 0, -10);
      const axis = new THREE.Vector3(0, 0, -1);
      const scale = 1;

      const result = projectDeltaToAxis(delta, axis, scale);

      expect(result).toBeCloseTo(10);
    });

    it('works correctly with -X axis (left face normal)', () => {
      const delta = new THREE.Vector3(-8, 0, 0);
      const axis = new THREE.Vector3(-1, 0, 0);
      const scale = 1;

      const result = projectDeltaToAxis(delta, axis, scale);

      expect(result).toBeCloseTo(8);
    });

    it('moving in +Z against -Z axis gives negative displacement', () => {
      const delta = new THREE.Vector3(0, 0, 6);
      const axis = new THREE.Vector3(0, 0, -1);
      const scale = 1;

      const result = projectDeltaToAxis(delta, axis, scale);

      expect(result).toBeCloseTo(-6);
    });
  });

  describe('non-unit axis vectors', () => {
    it('gives same result for non-normalized axis as for normalized axis', () => {
      // The axis is (0, 0, 2) — same direction as (0, 0, 1) but length 2
      // dot product will be 2× larger, but that's intentional — callers
      // should pass unit vectors, but the math still works proportionally
      const delta = new THREE.Vector3(0, 0, 10);
      const unitAxis = new THREE.Vector3(0, 0, 1);
      const doubleAxis = new THREE.Vector3(0, 0, 2);
      const scale = 1;

      const resultUnit = projectDeltaToAxis(delta, unitAxis, scale);
      const resultDouble = projectDeltaToAxis(delta, doubleAxis, scale);

      // Non-unit axis gives 2× result (projection scales with axis magnitude)
      expect(resultUnit).toBeCloseTo(10);
      expect(resultDouble).toBeCloseTo(20);
    });
  });

  describe('zero delta', () => {
    it('returns zero when there is no movement', () => {
      const delta = new THREE.Vector3(0, 0, 0);
      const axis = new THREE.Vector3(0, 0, 1);
      const scale = 1;

      const result = projectDeltaToAxis(delta, axis, scale);

      expect(result).toBeCloseTo(0);
    });
  });
});

describe('Face normal to axis mapping (logic used by PushPullArrow)', () => {
  // These tests verify the face normal values that PushPullArrow passes to AxisGizmo
  it('front face normal is +Z', () => {
    const axis = new THREE.Vector3(0, 0, 1);
    // Moving outward from front face (in +Z direction) should give positive delta
    const delta = new THREE.Vector3(0, 0, 5);
    expect(projectDeltaToAxis(delta, axis, 1)).toBeCloseTo(5);
  });

  it('back face normal is -Z', () => {
    const axis = new THREE.Vector3(0, 0, -1);
    // Moving outward from back face (in -Z direction) should give positive delta
    const delta = new THREE.Vector3(0, 0, -5);
    expect(projectDeltaToAxis(delta, axis, 1)).toBeCloseTo(5);
  });

  it('left face normal is -X', () => {
    const axis = new THREE.Vector3(-1, 0, 0);
    const delta = new THREE.Vector3(-5, 0, 0);
    expect(projectDeltaToAxis(delta, axis, 1)).toBeCloseTo(5);
  });

  it('right face normal is +X', () => {
    const axis = new THREE.Vector3(1, 0, 0);
    const delta = new THREE.Vector3(5, 0, 0);
    expect(projectDeltaToAxis(delta, axis, 1)).toBeCloseTo(5);
  });

  it('top face normal is +Y', () => {
    const axis = new THREE.Vector3(0, 1, 0);
    const delta = new THREE.Vector3(0, 5, 0);
    expect(projectDeltaToAxis(delta, axis, 1)).toBeCloseTo(5);
  });

  it('bottom face normal is -Y', () => {
    const axis = new THREE.Vector3(0, -1, 0);
    const delta = new THREE.Vector3(0, -5, 0);
    expect(projectDeltaToAxis(delta, axis, 1)).toBeCloseTo(5);
  });
});
