/**
 * Integration tests for sub-assembly push-pull through open parent faces.
 *
 * The rule: a sub-assembly face can only extend beyond the parent void bounds
 * when the corresponding parent face is OPEN (toggled off). If the parent face
 * is CLOSED (solid), the sub-assembly must be clamped so it does not protrude
 * through the parent face panel.
 *
 * These tests define the expected behaviour. They should FAIL before the fix
 * is implemented.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createEngineWithAssembly } from '../../../src/engine/Engine';
import { checkOverlap } from '../../../src/engine/validators/OverlapChecker';
import type { Engine } from '../../../src/engine/Engine';
import type { MaterialConfig } from '../../../src/engine/types';

const defaultMaterial: MaterialConfig = {
  thickness: 3,
  fingerWidth: 10,
  fingerGap: 0.1,
};

/**
 * Assembly: 200 × 150 × 100 mm, MT = 3, clearance = 2
 *
 * Root void (assembly-local):  x=3, y=3, z=3  |  w=194, h=144, d=94
 * Sub-assembly initial dims:   190 × 140 × 90
 *
 * World-space (origin at assembly centre, halfW=100, halfH=75, halfD=50):
 *   Sub-assembly centre:        (0, 0, 0)  (centred in root void)
 *   Sub-assembly top face:      world y = +70   (= 140/2)
 *   Parent void top:            world y = +72   (= 144/2)
 *   Parent top panel inner:     world y = +72   (= halfH − MT = 75 − 3)
 *   Parent top panel outer:     world y = +75
 *
 * When extending top by 54 mm (new height = 194) with faceId='top':
 *   positionOffset.y += 54/2 = 27
 *   new world centre y = +27
 *   new top face world y = 27 + 97 = +124   ← would exceed void top (+72)
 *
 * Max allowed height (closed top, bottom anchored at world y = −70):
 *   max_top  = +72 (parent void/face inner surface, world)
 *   max_ht   = max_top − bottom = 72 − (−70) = 142 mm
 */

describe('Sub-Assembly Push-Pull Through Open Parent Faces', () => {
  let engine: Engine;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function getSubAssembly(): {
    id: string;
    width: number;
    height: number;
    depth: number;
    worldX: number;
    worldY: number;
    worldZ: number;
  } | null {
    const snapshot = engine.getSnapshot();
    const rootVoid = snapshot.children[0]?.children[0];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const find = (children: any[]): any => {
      for (const child of children ?? []) {
        if (child.kind === 'sub-assembly') return child;
        if (child.children) {
          const found = find(child.children);
          if (found) return found;
        }
      }
      return null;
    };

    const subAsm = find(rootVoid?.children ?? []);
    if (!subAsm) return null;

    const pos = subAsm.derived?.worldTransform?.position ?? [0, 0, 0];
    return {
      id: subAsm.id,
      width: subAsm.props.width,
      height: subAsm.props.height,
      depth: subAsm.props.depth,
      worldX: pos[0],
      worldY: pos[1],
      worldZ: pos[2],
    };
  }

  beforeEach(() => {
    engine = createEngineWithAssembly(200, 150, 100, defaultMaterial);

    // Create sub-assembly directly in root void (no subdivision needed)
    engine.dispatch({
      type: 'CREATE_SUB_ASSEMBLY',
      targetId: 'main-assembly',
      payload: { voidId: 'root', clearance: 2 },
    });
  });

  // ---------------------------------------------------------------------------
  // Sanity – verify initial state
  // ---------------------------------------------------------------------------

  it('sets up sub-assembly with expected initial dimensions', () => {
    const subAsm = getSubAssembly();
    expect(subAsm).not.toBeNull();
    // Root void h = 144, clearance 2 each side → 140
    expect(subAsm!.height).toBeCloseTo(140, 1);
    // World centre starts at (0, 0, 0) – void centre aligns with assembly centre
    expect(subAsm!.worldY).toBeCloseTo(0, 1);
  });

  // ---------------------------------------------------------------------------
  // Test 1 (FAILS before fix): closed parent top face clamps extension
  //
  // The default assembly has all 6 faces CLOSED. Extending the top face of the
  // sub-assembly beyond the parent void should be BLOCKED because the parent top
  // panel is solid — the sub-assembly cannot physically pass through it.
  //
  // Before fix: no constraint → height is set to 194 → assertion fails.
  // After fix:  height is clamped to ≤ 142  → assertion passes.
  // ---------------------------------------------------------------------------

  describe('Closed parent face blocks extension (primary failing test)', () => {
    it('should NOT allow sub-assembly height to exceed void bounds when parent top face is CLOSED', () => {
      const subAsmBefore = getSubAssembly();
      expect(subAsmBefore).not.toBeNull();

      const originalHeight = subAsmBefore!.height; // 140
      const targetHeight = originalHeight + 54;     // 194 — would protrude 50mm past void top

      // Push top face outward — would exceed parent void/face boundary
      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: subAsmBefore!.id,
        payload: { height: targetHeight, faceId: 'top' },
      });

      const subAsmAfter = getSubAssembly();
      expect(subAsmAfter).not.toBeNull();

      // Sub-assembly must NOT exceed the parent void height (144 mm) —
      // the parent top panel is solid and physically blocks the extension.
      // Max allowed height (bottom anchored at world y = −70, void top at +72): 142 mm
      expect(subAsmAfter!.height).toBeLessThan(targetHeight);    // Must be clamped
      expect(subAsmAfter!.height).toBeLessThanOrEqual(142);      // Clamped to physical max
    });

    it('should NOT allow extension through closed bottom face either', () => {
      const subAsmBefore = getSubAssembly();
      expect(subAsmBefore).not.toBeNull();

      const originalHeight = subAsmBefore!.height; // 140
      const targetHeight = originalHeight + 54;     // 194

      // Push bottom face outward
      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: subAsmBefore!.id,
        payload: { height: targetHeight, faceId: 'bottom' },
      });

      const subAsmAfter = getSubAssembly();
      expect(subAsmAfter).not.toBeNull();

      // Symmetric constraint applies to the bottom face
      expect(subAsmAfter!.height).toBeLessThan(targetHeight);
      expect(subAsmAfter!.height).toBeLessThanOrEqual(142);
    });

    it('should NOT allow extension through closed right face', () => {
      const subAsmBefore = getSubAssembly();
      expect(subAsmBefore).not.toBeNull();

      const originalWidth = subAsmBefore!.width; // 190
      const targetWidth = originalWidth + 20;     // 210 — exceeds void w=194

      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: subAsmBefore!.id,
        payload: { width: targetWidth, faceId: 'right' },
      });

      const subAsmAfter = getSubAssembly();
      expect(subAsmAfter).not.toBeNull();

      // Must not exceed void width (194) direction; max ≈ 190+4 = 194 assembly-local
      // or equivalently: left is anchored at −95, max right = 100 → max width ≈ 194
      expect(subAsmAfter!.width).toBeLessThan(targetWidth);
    });
  });

  // ---------------------------------------------------------------------------
  // Test 2: open parent face ALLOWS extension
  //
  // When the parent top face is toggled off (OPEN) there is no solid panel
  // blocking the sub-assembly, so the extension should be allowed freely.
  //
  // Before fix (no constraint): height = 194 — passes trivially.
  // After a naive "clamp-all" fix: height would wrongly be clamped → FAILS.
  // After complete fix (clamp only for closed faces): height = 194 → PASSES.
  // ---------------------------------------------------------------------------

  describe('Open parent face allows extension', () => {
    it('should allow sub-assembly height beyond void bounds when parent top face is OPEN', () => {
      // Toggle the parent assembly's top face OFF
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'top' },
      });

      const subAsmBefore = getSubAssembly();
      expect(subAsmBefore).not.toBeNull();

      const originalHeight = subAsmBefore!.height; // 140
      const targetHeight = originalHeight + 54;     // 194 — beyond void height 144

      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: subAsmBefore!.id,
        payload: { height: targetHeight, faceId: 'top' },
      });

      const subAsmAfter = getSubAssembly();
      expect(subAsmAfter).not.toBeNull();

      // With the top face open, the extension should not be clamped
      expect(subAsmAfter!.height).toBeCloseTo(targetHeight, 1);
      expect(subAsmAfter!.height).toBeGreaterThan(140); // Exceeds void height (144)
    });

    it('should allow extension through open bottom face', () => {
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'bottom' },
      });

      const subAsmBefore = getSubAssembly();
      expect(subAsmBefore).not.toBeNull();

      const originalHeight = subAsmBefore!.height;
      const targetHeight = originalHeight + 54;

      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: subAsmBefore!.id,
        payload: { height: targetHeight, faceId: 'bottom' },
      });

      const subAsmAfter = getSubAssembly();
      expect(subAsmAfter!.height).toBeCloseTo(targetHeight, 1);
    });

    it('OverlapChecker passes after extension through open face (no panel collision)', () => {
      // When the parent top face is OPEN there is no solid panel for the sub-assembly
      // to collide with, so the overlap checker should report clean geometry.
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'top' },
      });

      const subAsm = getSubAssembly();
      expect(subAsm).not.toBeNull();

      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: subAsm!.id,
        payload: { height: subAsm!.height + 40, faceId: 'top' },
      });

      const result = checkOverlap(engine);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Test 3: symmetry — different axes behave consistently
  // ---------------------------------------------------------------------------

  describe('Constraint applies symmetrically across axes', () => {
    it('closed front face clamps depth extension', () => {
      const subAsmBefore = getSubAssembly();
      expect(subAsmBefore).not.toBeNull();

      const originalDepth = subAsmBefore!.depth; // 90
      const targetDepth = originalDepth + 20;    // 110 — exceeds void depth 94

      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: subAsmBefore!.id,
        payload: { depth: targetDepth, faceId: 'front' },
      });

      const subAsmAfter = getSubAssembly();
      expect(subAsmAfter!.depth).toBeLessThan(targetDepth);
    });

    it('open front face allows depth extension', () => {
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'front' },
      });

      const subAsmBefore = getSubAssembly();
      expect(subAsmBefore).not.toBeNull();

      const originalDepth = subAsmBefore!.depth;
      const targetDepth = originalDepth + 20;

      engine.dispatch({
        type: 'SET_DIMENSIONS',
        targetId: subAsmBefore!.id,
        payload: { depth: targetDepth, faceId: 'front' },
      });

      const subAsmAfter = getSubAssembly();
      expect(subAsmAfter!.depth).toBeCloseTo(targetDepth, 1);
    });
  });
});
