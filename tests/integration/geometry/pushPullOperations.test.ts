/**
 * Integration tests for push/pull operations
 *
 * These tests define expected behavior for:
 * 1. Successive push/pull operations (should be additive)
 * 2. Inset face operation on sub-assemblies (should be blocked or handled correctly)
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

describe('Successive Push/Pull Operations', () => {
  let engine: Engine;

  beforeEach(() => {
    // Create 100x100x100 box
    engine = createEngineWithAssembly(100, 100, 100, defaultMaterial);
  });

  describe('Main Assembly', () => {
    it('should be additive: first +5mm then +3mm = +8mm total from original', () => {
      const snapshot1 = engine.getSnapshot();
      const originalWidth = snapshot1.children[0].props.width;
      expect(originalWidth).toBe(100);

      // First push/pull: +5mm
      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: 'main-assembly',
        payload: { width: originalWidth + 5 },
      });

      const snapshot2 = engine.getSnapshot();
      expect(snapshot2.children[0].props.width).toBe(105);

      // Second push/pull: +3mm from NEW dimensions
      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: 'main-assembly',
        payload: { width: 105 + 3 },
      });

      const snapshot3 = engine.getSnapshot();
      // Total should be +8mm from original = 108mm
      expect(snapshot3.children[0].props.width).toBe(108);
    });

    it('should allow reducing after increasing', () => {
      // Start at 100mm
      // Increase by 10mm -> 110mm
      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: 'main-assembly',
        payload: { width: 110 },
      });

      expect(engine.getSnapshot().children[0].props.width).toBe(110);

      // Decrease by 5mm -> 105mm
      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: 'main-assembly',
        payload: { width: 105 },
      });

      expect(engine.getSnapshot().children[0].props.width).toBe(105);
    });

    it('should work on multiple axes sequentially', () => {
      // Increase width by 10
      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: 'main-assembly',
        payload: { width: 110 },
      });

      // Increase height by 15
      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: 'main-assembly',
        payload: { height: 115 },
      });

      // Increase depth by 20
      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: 'main-assembly',
        payload: { depth: 120 },
      });

      const snapshot = engine.getSnapshot();
      expect(snapshot.children[0].props.width).toBe(110);
      expect(snapshot.children[0].props.height).toBe(115);
      expect(snapshot.children[0].props.depth).toBe(120);
    });
  });

  describe('Sub-Assembly', () => {
    let subAssemblyId: string;
    const clearance = 2;

    beforeEach(() => {
      // Create subdivision to make room for sub-assembly
      engine.dispatch({
        type: 'ADD_SUBDIVISION',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', position: 50 },
      });

      // Create sub-assembly in first child void
      const snapshot = engine.getSnapshot();
      const rootVoid = snapshot.children[0].children[0];
      const childVoid = rootVoid.children.find((c: any) => c.kind === 'void');

      if (childVoid) {
        engine.dispatch({
          type: 'CREATE_SUB_ASSEMBLY',
          targetId: 'main-assembly',
          payload: { voidId: childVoid.id, clearance },
        });
      }

      // Find the sub-assembly ID
      const findSubAssembly = (children: any[]): any => {
        for (const child of children || []) {
          if (child.kind === 'sub-assembly') return child;
          if (child.children) {
            const found = findSubAssembly(child.children);
            if (found) return found;
          }
        }
        return null;
      };

      const snapshot2 = engine.getSnapshot();
      const rootVoid2 = snapshot2.children[0]?.children[0];
      const subAsm = findSubAssembly(rootVoid2?.children || []);
      subAssemblyId = subAsm?.id;
    });

    function getSubAssemblyDimensions(): { width: number; height: number; depth: number; worldX: number } | null {
      const findSubAssembly = (children: any[]): any => {
        for (const child of children || []) {
          if (child.kind === 'sub-assembly') return child;
          if (child.children) {
            const found = findSubAssembly(child.children);
            if (found) return found;
          }
        }
        return null;
      };

      const snapshot = engine.getSnapshot();
      const rootVoid = snapshot.children[0]?.children[0];
      const subAsm = findSubAssembly(rootVoid?.children || []);
      if (!subAsm) return null;

      return {
        width: subAsm.props.width,
        height: subAsm.props.height,
        depth: subAsm.props.depth,
        worldX: subAsm.derived?.worldTransform?.position?.[0] ?? 0,
      };
    }

    it('should be additive: first +5mm then +3mm = +8mm total from original', () => {
      const dims1 = getSubAssemblyDimensions();
      expect(dims1).not.toBeNull();
      const originalWidth = dims1!.width;

      // First push/pull: +5mm (pushing right face)
      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: subAssemblyId,
        payload: { width: originalWidth + 5, faceId: 'right' },
      });

      const dims2 = getSubAssemblyDimensions();
      expect(dims2!.width).toBe(originalWidth + 5);

      // Second push/pull: +3mm from NEW dimensions (pushing right face again)
      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: subAssemblyId,
        payload: { width: originalWidth + 5 + 3, faceId: 'right' },
      });

      const dims3 = getSubAssemblyDimensions();
      // Total should be +8mm from original
      expect(dims3!.width).toBe(originalWidth + 8);
    });

    it('should maintain anchor position across successive operations', () => {
      const dims1 = getSubAssemblyDimensions();
      expect(dims1).not.toBeNull();

      // Calculate left face position before any operations
      const leftFaceOriginal = dims1!.worldX - dims1!.width / 2;

      // First push/pull: +5mm (pushing right face, left anchored)
      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: subAssemblyId,
        payload: { width: dims1!.width + 5, faceId: 'right' },
      });

      const dims2 = getSubAssemblyDimensions();
      const leftFaceAfter1 = dims2!.worldX - dims2!.width / 2;
      expect(leftFaceAfter1).toBeCloseTo(leftFaceOriginal, 1);

      // Second push/pull: +3mm (pushing right face again, left still anchored)
      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: subAssemblyId,
        payload: { width: dims2!.width + 3, faceId: 'right' },
      });

      const dims3 = getSubAssemblyDimensions();
      const leftFaceAfter2 = dims3!.worldX - dims3!.width / 2;

      // Left face should STILL be at the original position after two operations
      expect(leftFaceAfter2).toBeCloseTo(leftFaceOriginal, 1);
    });

    it('should handle switching anchor faces between operations', () => {
      const dims1 = getSubAssemblyDimensions();
      expect(dims1).not.toBeNull();

      // Calculate original face positions
      const leftFaceOriginal = dims1!.worldX - dims1!.width / 2;
      const rightFaceOriginal = dims1!.worldX + dims1!.width / 2;

      // First push/pull: +5mm pushing RIGHT face (left anchored)
      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: subAssemblyId,
        payload: { width: dims1!.width + 5, faceId: 'right' },
      });

      const dims2 = getSubAssemblyDimensions();
      // Right face moved +5mm, left face stayed
      expect(dims2!.worldX + dims2!.width / 2).toBeCloseTo(rightFaceOriginal + 5, 1);
      expect(dims2!.worldX - dims2!.width / 2).toBeCloseTo(leftFaceOriginal, 1);

      // Second push/pull: +3mm pushing LEFT face (right now anchored)
      // This should anchor the NEW right face position
      const rightFaceAfterFirst = dims2!.worldX + dims2!.width / 2;

      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: subAssemblyId,
        payload: { width: dims2!.width + 3, faceId: 'left' },
      });

      const dims3 = getSubAssemblyDimensions();
      // Right face should stay where it was after first operation
      expect(dims3!.worldX + dims3!.width / 2).toBeCloseTo(rightFaceAfterFirst, 1);
      // Left face should have moved -3mm (width increased, but anchored on right)
      expect(dims3!.worldX - dims3!.width / 2).toBeCloseTo(leftFaceOriginal - 3, 1);
    });
  });
});

describe('Preview After Commit', () => {
  let engine: Engine;

  beforeEach(() => {
    engine = createEngineWithAssembly(100, 100, 100, defaultMaterial);
  });

  it('should start new preview from committed state, not original state', () => {
    // Initial state: 100mm
    expect(engine.getSnapshot().children[0].props.width).toBe(100);

    // Start preview and apply +10mm
    engine.startPreview();
    engine.dispatch({
      type: 'SET_DIMENSIONS',
      targetId: 'main-assembly',
      payload: { width: 110 },
    }, { preview: true });

    // Preview should show 110mm
    expect(engine.getSnapshot().children[0].props.width).toBe(110);

    // Commit the preview
    engine.commitPreview();

    // After commit, main scene should be 110mm
    expect(engine.getSnapshot().children[0].props.width).toBe(110);

    // Start a NEW preview (simulating re-entering push-pull mode)
    engine.startPreview();

    // The new preview should be 110mm (cloned from committed state), NOT 100mm
    expect(engine.getSnapshot().children[0].props.width).toBe(110);

    // Apply another +5mm in the new preview
    engine.dispatch({
      type: 'SET_DIMENSIONS',
      targetId: 'main-assembly',
      payload: { width: 115 },
    }, { preview: true });

    // New preview should show 115mm
    expect(engine.getSnapshot().children[0].props.width).toBe(115);

    // Commit again
    engine.commitPreview();

    // Final state should be 115mm
    expect(engine.getSnapshot().children[0].props.width).toBe(115);
  });

  it('should maintain dimensions after discard and new preview', () => {
    // Start preview and make changes
    engine.startPreview();
    engine.dispatch({
      type: 'SET_DIMENSIONS',
      targetId: 'main-assembly',
      payload: { width: 110 },
    }, { preview: true });

    // Commit
    engine.commitPreview();
    expect(engine.getSnapshot().children[0].props.width).toBe(110);

    // Start new preview
    engine.startPreview();
    engine.dispatch({
      type: 'SET_DIMENSIONS',
      targetId: 'main-assembly',
      payload: { width: 120 },
    }, { preview: true });

    // Discard the second preview (cancel operation)
    engine.discardPreview();

    // Should be back to 110mm (first commit), not 100mm (original)
    expect(engine.getSnapshot().children[0].props.width).toBe(110);

    // Start another preview - should start from 110mm
    engine.startPreview();
    expect(engine.getSnapshot().children[0].props.width).toBe(110);
  });
});

describe('Sub-Assembly Preview After Commit', () => {
  let engine: Engine;
  let subAssemblyId: string;

  function findSubAssembly(snapshot: any): any {
    const findInChildren = (children: any[]): any => {
      for (const child of children || []) {
        if (child.kind === 'sub-assembly') return child;
        if (child.children) {
          const found = findInChildren(child.children);
          if (found) return found;
        }
      }
      return null;
    };
    const mainAssembly = snapshot.children?.[0];
    return mainAssembly ? findInChildren(mainAssembly.children) : null;
  }

  beforeEach(() => {
    engine = createEngineWithAssembly(100, 100, 100, defaultMaterial);

    // Create a sub-assembly in the root void
    engine.dispatch({
      type: 'CREATE_SUB_ASSEMBLY',
      targetId: 'main-assembly',
      payload: { voidId: 'root', clearance: 2 },
    });

    const snapshot = engine.getSnapshot();
    const subAsm = findSubAssembly(snapshot);
    subAssemblyId = subAsm?.id;
  });

  it('should preserve sub-assembly position offset across preview cycles', () => {
    // Get initial sub-assembly state
    const snapshot1 = engine.getSnapshot();
    const subAsm1 = findSubAssembly(snapshot1);
    expect(subAsm1).not.toBeNull();

    const originalHeight = subAsm1.props.height;
    const originalOffsetY = subAsm1.props.positionOffset?.y ?? 0;

    // First push-pull: push top face up by 10mm
    engine.startPreview();
    engine.dispatch({
      type: 'SET_DIMENSIONS',
      targetId: subAssemblyId,
      payload: { height: originalHeight + 10, faceId: 'top' },
    }, { preview: true });

    // Verify preview state
    const previewSnapshot1 = engine.getSnapshot();
    const previewSubAsm1 = findSubAssembly(previewSnapshot1);
    expect(previewSubAsm1.props.height).toBe(originalHeight + 10);
    const offsetAfterFirstPush = previewSubAsm1.props.positionOffset?.y ?? 0;
    // Offset should change when pushing top face (to keep bottom anchored)
    expect(offsetAfterFirstPush).not.toBe(originalOffsetY);

    // Commit first push-pull
    engine.commitPreview();

    // Verify committed state
    const committedSnapshot = engine.getSnapshot();
    const committedSubAsm = findSubAssembly(committedSnapshot);
    expect(committedSubAsm.props.height).toBe(originalHeight + 10);
    expect(committedSubAsm.props.positionOffset?.y).toBeCloseTo(offsetAfterFirstPush, 5);

    // Start a NEW preview for second push-pull
    engine.startPreview();

    // The preview should preserve the position offset from committed state
    const newPreviewSnapshot = engine.getSnapshot();
    const newPreviewSubAsm = findSubAssembly(newPreviewSnapshot);

    // THIS IS THE BUG: Position offset should be preserved from committed state
    expect(newPreviewSubAsm.props.height).toBe(originalHeight + 10);
    expect(newPreviewSubAsm.props.positionOffset?.y).toBeCloseTo(offsetAfterFirstPush, 5);

    // Dispatching with offset 0 should maintain current position
    engine.dispatch({
      type: 'SET_DIMENSIONS',
      targetId: subAssemblyId,
      payload: { height: originalHeight + 10, faceId: 'top' },
    }, { preview: true });

    const afterZeroOffset = engine.getSnapshot();
    const afterZeroSubAsm = findSubAssembly(afterZeroOffset);
    expect(afterZeroSubAsm.props.positionOffset?.y).toBeCloseTo(offsetAfterFirstPush, 5);
  });
});

describe('Inset Face Operation', () => {
  let engine: Engine;

  beforeEach(() => {
    engine = createEngineWithAssembly(100, 100, 100, defaultMaterial);
  });

  describe('Main Assembly', () => {
    it('should create a subdivision at the inset depth when face is inset', () => {
      // Inset the front face by 10mm
      // This should:
      // 1. Open the front face (make it non-solid)
      // 2. Create a divider at z = materialThickness + insetAmount from front

      const MT = defaultMaterial.thickness;

      // First, we need to open the face and add subdivision
      // This simulates what insetFace does in the store

      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'front' },
      });

      // Add subdivision on z-axis at inset position from front
      // Front face is at z=0, interior starts at z=MT
      // Inset of 10mm means divider at z = MT + 10 = 13mm
      engine.dispatch({
        type: 'ADD_SUBDIVISION',
        targetId: 'main-assembly',
        payload: {
          voidId: 'root',
          axis: 'z',
          position: MT + 10
        },
      });

      const snapshot = engine.getSnapshot();

      // Front face should now be open
      const frontFace = snapshot.children[0].props.faces.find((f: any) => f.id === 'front');
      expect(frontFace?.solid).toBe(false);

      // Should have subdivisions on z-axis
      const rootVoid = snapshot.children[0].children[0];
      expect(rootVoid.children.length).toBeGreaterThan(0);
    });
  });

  describe('Sub-Assembly', () => {
    // Inset face on sub-assembly should either:
    // A) Be blocked/disabled (current expected behavior)
    // B) Work similarly to main assembly but within the sub-assembly

    // For now, we document that it should be blocked
    it.skip('should be blocked or work within sub-assembly bounds', () => {
      // TODO: Implement sub-assembly inset if needed
      // For now, the UI disables the inset button for sub-assemblies
    });
  });
});
