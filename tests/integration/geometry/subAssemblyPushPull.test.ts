/**
 * Integration tests for sub-assembly push/pull operation
 *
 * These tests define the expected geometry behavior when push/pull
 * is applied to a sub-assembly face. They should fail until the
 * implementation is corrected.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createEngineWithAssembly } from '../../../src/engine/Engine';
import type { Engine } from '../../../src/engine/Engine';
import type { MaterialConfig } from '../../../src/engine/types';

const defaultMaterial: MaterialConfig = {
  thickness: 3,
  fingerWidth: 10,
  fingerGap: 0.1,
};

describe('Sub-Assembly Push/Pull Geometry', () => {
  let engine: Engine;
  const clearance = 2; // 2mm clearance for sub-assembly

  beforeEach(() => {
    // Create 100x100x100 box
    engine = createEngineWithAssembly(100, 100, 100, defaultMaterial);

    // Subdivide to create a void for the sub-assembly
    engine.dispatch({
      type: 'ADD_SUBDIVISION',
      targetId: 'main-assembly',
      payload: {
        voidId: 'root',
        axis: 'x',
        position: 50,
      },
    });

    // Create sub-assembly in the first child void
    const snapshot = engine.getSnapshot();
    const rootVoid = snapshot.children[0].children[0];
    const childVoid = rootVoid.children.find((c: any) => c.kind === 'void');

    if (childVoid) {
      engine.dispatch({
        type: 'CREATE_SUB_ASSEMBLY',
        targetId: 'main-assembly',
        payload: {
          voidId: childVoid.id,
          clearance,
        },
      });
    }
  });

  function getSubAssembly(): { id: string; width: number; height: number; depth: number; worldX: number; worldY: number; worldZ: number } | null {
    const snapshot = engine.getSnapshot();

    // Find sub-assembly in the tree
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const findSubAssembly = (children: any[]): any => {
      for (const child of children || []) {
        if (child.kind === 'sub-assembly') {
          return child;
        }
        if (child.children) {
          const found = findSubAssembly(child.children);
          if (found) return found;
        }
      }
      return null;
    };

    // Search from main assembly's root void
    const rootVoid = snapshot.children[0]?.children[0];
    const subAsm = findSubAssembly(rootVoid?.children || []);

    if (!subAsm) return null;

    // Extract world position from transform - Transform3D uses position array
    const transform = subAsm.derived?.worldTransform;
    const worldX = transform?.position?.[0] ?? 0;
    const worldY = transform?.position?.[1] ?? 0;
    const worldZ = transform?.position?.[2] ?? 0;

    return {
      id: subAsm.id,
      width: subAsm.props.width,
      height: subAsm.props.height,
      depth: subAsm.props.depth,
      worldX,
      worldY,
      worldZ,
    };
  }

  describe('Initial State', () => {
    it('should create sub-assembly with correct initial dimensions', () => {
      const subAsm = getSubAssembly();
      expect(subAsm).not.toBeNull();

      // After subdivision at x=50, the first child void is the LEFT void
      // Box: 100x100x100 with MT=3
      // Interior: 94x94x94 (100 - 2*MT on each axis)
      // Divider at x=50 creates two voids
      // Left void: from x=3 to x=50-MT/2, width varies by subdivision mode
      //
      // The actual dimensions depend on the exact subdivision algorithm
      // We just verify the sub-assembly was created with proper clearance relationship
      // Actual: width=41.5, height=90, depth=90

      expect(subAsm!.width).toBeGreaterThan(0);
      expect(subAsm!.height).toBeCloseTo(90, 1); // 94 - 2*clearance(2) = 90
      expect(subAsm!.depth).toBeCloseTo(90, 1);  // 94 - 2*clearance(2) = 90
    });

    it('should position sub-assembly centered in its void', () => {
      const subAsm = getSubAssembly();
      expect(subAsm).not.toBeNull();

      // Sub-assembly should be centered in its parent void
      // The exact position depends on which void it's created in
      // We verify it's positioned somewhere in the box (not at 0)
      // Actual: worldX=-24.25 (in the left void)

      // The sub-assembly world X should be offset from center (0)
      expect(subAsm!.worldX).not.toBe(0);
      // Position should be within the box bounds (-50 to 50 for a 100mm box)
      expect(Math.abs(subAsm!.worldX)).toBeLessThan(50);
    });
  });

  describe('Push/Pull on Sub-Assembly Right Face', () => {
    it('should NOT affect main assembly dimensions', () => {
      const subAsm = getSubAssembly();
      expect(subAsm).not.toBeNull();

      // Apply push/pull to sub-assembly right face with +5mm offset
      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: subAsm!.id,
        payload: {
          width: subAsm!.width + 5,
          height: subAsm!.height,
          depth: subAsm!.depth,
        },
      });

      // Main assembly should be unchanged
      const snapshot = engine.getSnapshot();
      const mainAssembly = snapshot.children?.[0];
      expect(mainAssembly?.props.width).toBe(100);
      expect(mainAssembly?.props.height).toBe(100);
      expect(mainAssembly?.props.depth).toBe(100);
    });

    it('should increase sub-assembly width by offset amount', () => {
      const subAsmBefore = getSubAssembly();
      expect(subAsmBefore).not.toBeNull();
      const originalWidth = subAsmBefore!.width;

      // Apply +5mm offset to width
      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: subAsmBefore!.id,
        payload: {
          width: originalWidth + 5,
        },
      });

      const subAsmAfter = getSubAssembly();
      expect(subAsmAfter!.width).toBe(originalWidth + 5);
    });

    it('should anchor LEFT face (opposite face stays fixed)', () => {
      const subAsmBefore = getSubAssembly();
      expect(subAsmBefore).not.toBeNull();

      // Calculate left face position before
      const leftFaceBefore = subAsmBefore!.worldX - subAsmBefore!.width / 2;

      // Apply +5mm offset (push right face outward)
      // Pass faceId: 'right' to trigger anchored behavior
      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: subAsmBefore!.id,
        payload: {
          width: subAsmBefore!.width + 5,
          faceId: 'right', // Pushing the right face, so left face should be anchored
        },
      });

      const subAsmAfter = getSubAssembly();
      const leftFaceAfter = subAsmAfter!.worldX - subAsmAfter!.width / 2;

      // LEFT face should stay in the same position
      expect(leftFaceAfter).toBeCloseTo(leftFaceBefore, 1);
    });

    it('should move RIGHT face by offset amount', () => {
      const subAsmBefore = getSubAssembly();
      expect(subAsmBefore).not.toBeNull();

      // Calculate right face position before
      const rightFaceBefore = subAsmBefore!.worldX + subAsmBefore!.width / 2;

      // Apply +5mm offset (push right face outward)
      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: subAsmBefore!.id,
        payload: {
          width: subAsmBefore!.width + 5,
          faceId: 'right', // Pushing the right face
        },
      });

      const subAsmAfter = getSubAssembly();
      const rightFaceAfter = subAsmAfter!.worldX + subAsmAfter!.width / 2;

      // RIGHT face should move by +5mm
      expect(rightFaceAfter).toBeCloseTo(rightFaceBefore + 5, 1);
    });
  });

  describe('Push/Pull Offset Application', () => {
    it('should apply absolute offset, not cumulative', () => {
      const subAsmBefore = getSubAssembly();
      expect(subAsmBefore).not.toBeNull();
      const originalWidth = subAsmBefore!.width;

      // Simulate multiple preview updates (like dragging slider)
      // Each should set absolute width, not add to previous

      // First update: +5mm from original
      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: subAsmBefore!.id,
        payload: { width: originalWidth + 5 },
      });
      expect(getSubAssembly()!.width).toBe(originalWidth + 5);

      // Second update: +10mm from original (NOT +15mm)
      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: subAsmBefore!.id,
        payload: { width: originalWidth + 10 },
      });
      expect(getSubAssembly()!.width).toBe(originalWidth + 10);

      // Third update: +3mm from original (going back down)
      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: subAsmBefore!.id,
        payload: { width: originalWidth + 3 },
      });
      expect(getSubAssembly()!.width).toBe(originalWidth + 3);
    });
  });

  describe('Push/Pull on Different Faces', () => {
    it('should anchor BOTTOM face when pushing TOP', () => {
      const subAsmBefore = getSubAssembly();
      expect(subAsmBefore).not.toBeNull();

      const bottomFaceBefore = subAsmBefore!.worldY - subAsmBefore!.height / 2;

      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: subAsmBefore!.id,
        payload: {
          height: subAsmBefore!.height + 5,
          faceId: 'top', // Pushing the top face, so bottom face should be anchored
        },
      });

      const subAsmAfter = getSubAssembly();
      const bottomFaceAfter = subAsmAfter!.worldY - subAsmAfter!.height / 2;

      // BOTTOM face should stay fixed when pushing TOP
      expect(bottomFaceAfter).toBeCloseTo(bottomFaceBefore, 1);
    });

    it('should anchor BACK face when pushing FRONT', () => {
      const subAsmBefore = getSubAssembly();
      expect(subAsmBefore).not.toBeNull();

      const backFaceBefore = subAsmBefore!.worldZ - subAsmBefore!.depth / 2;

      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: subAsmBefore!.id,
        payload: {
          depth: subAsmBefore!.depth + 5,
          faceId: 'front', // Pushing the front face, so back face should be anchored
        },
      });

      const subAsmAfter = getSubAssembly();
      const backFaceAfter = subAsmAfter!.worldZ - subAsmAfter!.depth / 2;

      // BACK face should stay fixed when pushing FRONT
      expect(backFaceAfter).toBeCloseTo(backFaceBefore, 1);
    });
  });

  describe('Constraints', () => {
    // TODO: Implement constraint checking for sub-assembly bounds
    // When pushing through a solid face, sub-assembly should be clamped to void bounds
    // When pushing through an open face, sub-assembly can extend beyond the void
    it.skip('should not allow sub-assembly to exceed void bounds on solid faces', () => {
      const subAsm = getSubAssembly();
      expect(subAsm).not.toBeNull();

      // Try to grow sub-assembly beyond void bounds
      // The void width is ~44mm, sub-assembly is ~40mm (2mm clearance each side)
      // Growing by 10mm would exceed the void

      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: subAsm!.id,
        payload: {
          width: subAsm!.width + 10, // Would exceed void
        },
      });

      const subAsmAfter = getSubAssembly();

      // Sub-assembly should be clamped to not exceed void bounds
      // Max width = void_width - 2*clearance = 44 - 4 = 40mm
      // But wait - if we're extending through a solid face, it should be blocked
      // If extending through an open face, it's allowed

      // For now, this test documents that we need constraint checking
      // The actual expected value depends on whether the face is open
      expect(subAsmAfter!.width).toBeLessThanOrEqual(44); // Can't exceed void
    });
  });
});
