/**
 * Tests for terminating divider joints (cross-lap vs normal finger joint)
 *
 * When a shorter divider terminates at a longer one (sequential subdivision),
 * it should get normal finger joints, NOT cross-lap notches.
 *
 * Cross-lap joints are only for dividers that physically cross through each other
 * (both dividers' void bounds extend past the intersection on both sides).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createEngine, Engine } from '../../../src/engine/Engine';

describe('Terminating Divider Joints', () => {
  let engine: Engine;

  beforeEach(() => {
    engine = createEngine();
  });

  function setupTerminatingScenario() {
    engine.createAssembly(200, 150, 100, {
      thickness: 6,
      fingerWidth: 10,
      fingerGap: 1.5,
    });

    engine.dispatch({
      type: 'ADD_SUBDIVISION',
      targetId: 'main-assembly',
      payload: { voidId: 'root', axis: 'x', position: 100 },
    });

    const snapshot1 = engine.getSnapshot();
    const assembly1 = snapshot1.children[0];
    if (assembly1.kind !== 'assembly') throw new Error('Expected assembly');
    const rootVoid = assembly1.children[0];
    if (rootVoid.kind !== 'void') throw new Error('Expected void');
    const childVoids = rootVoid.children.filter(c => c.kind === 'void');
    expect(childVoids.length).toBe(2);

    engine.dispatch({
      type: 'ADD_SUBDIVISION',
      targetId: 'main-assembly',
      payload: { voidId: childVoids[0].id, axis: 'z', position: 50 },
    });

    return engine;
  }

  function setupCrossingScenario() {
    engine.createAssembly(200, 150, 100, {
      thickness: 6,
      fingerWidth: 10,
      fingerGap: 1.5,
    });

    const assembly = engine.assembly!;
    const rootVoid = assembly.rootVoid;
    const bounds = rootVoid.bounds;
    const mt = 6;

    rootVoid.subdivideGrid([
      { axis: 'x', positions: [bounds.x + bounds.w / 2] },
      { axis: 'z', positions: [bounds.z + bounds.d / 2] },
    ], mt);

    return engine;
  }

  function getDividerPanels() {
    const snapshot = engine.getSnapshot();
    const assembly = snapshot.children[0];
    if (assembly.kind !== 'assembly') throw new Error('Expected assembly');

    const dividerPanels = assembly.derived.panels.filter(p => p.kind === 'divider-panel');
    return {
      xDividers: dividerPanels.filter(p => p.props.axis === 'x'),
      zDividers: dividerPanels.filter(p => p.props.axis === 'z'),
      allDividers: dividerPanels,
      allPanels: assembly.derived.panels,
    };
  }

  describe('Terminating divider (sequential subdivision)', () => {
    it('should NOT have cross-lap notch points on the terminating Z-divider', () => {
      setupTerminatingScenario();
      const { zDividers } = getDividerPanels();
      expect(zDividers.length).toBe(1);

      const zDivider = zDividers[0];
      const halfH = zDivider.derived.height / 2;
      const outlinePoints = zDivider.derived.outline.points;

      // Cross-lap notch points go to y=0 (the center), creating points very close to center.
      // Normal finger joints have points at y=±mt multiples, never at y=0.
      const crossLapDepthPoints = outlinePoints.filter(
        (p: { y: number }) => Math.abs(p.y) < 1.0
      );

      expect(crossLapDepthPoints.length).toBe(0);
    });

    it('should have male gender on the terminating edge of the Z-divider', () => {
      setupTerminatingScenario();
      const { zDividers } = getDividerPanels();
      expect(zDividers.length).toBe(1);

      const zDivider = zDividers[0];
      const edges = zDivider.derived.edges;
      const rightEdge = edges.find((e: { position: string }) => e.position === 'right');

      expect(rightEdge).toBeDefined();
      expect(rightEdge!.hasTabs).toBe(true);
      expect(rightEdge!.meetsDividerId).not.toBeNull();
    });

    it('should have finger tabs on the Z-divider terminating edge', () => {
      setupTerminatingScenario();
      const { zDividers } = getDividerPanels();
      expect(zDividers.length).toBe(1);

      const zDivider = zDividers[0];
      const halfW = zDivider.derived.width / 2;
      const mt = 6; // material thickness
      const outlinePoints = zDivider.derived.outline.points;

      // Male tabs on the right edge alternate between halfW-mt and halfW
      // (body is inset by MT, tabs extend to halfW)
      const rightEdgeTabPoints = outlinePoints.filter(
        (p: { x: number }) => Math.abs(p.x - halfW) < 0.01
      );
      const rightEdgeBodyPoints = outlinePoints.filter(
        (p: { x: number }) => Math.abs(p.x - (halfW - mt)) < 0.01
      );

      // Both tab and body x-values must exist for a finger joint pattern
      expect(rightEdgeTabPoints.length).toBeGreaterThan(0);
      expect(rightEdgeBodyPoints.length).toBeGreaterThan(0);
    });

    it('should have slot holes on the X-divider where the Z-divider terminates', () => {
      setupTerminatingScenario();
      const { xDividers } = getDividerPanels();
      expect(xDividers.length).toBe(1);

      const xDivider = xDividers[0];
      const holes = xDivider.derived.outline.holes;

      const dividerSlotHoles = holes.filter(
        (h: { source?: { type: string } }) => h.source?.type === 'divider-slot'
      );

      expect(dividerSlotHoles.length).toBeGreaterThan(0);
    });
  });

  describe('Crossing dividers (grid subdivision) - regression guard', () => {
    it('should still have cross-lap notch points on both crossing dividers', () => {
      setupCrossingScenario();
      const { xDividers, zDividers } = getDividerPanels();
      expect(xDividers.length).toBe(1);
      expect(zDividers.length).toBe(1);

      const xDivider = xDividers[0];
      const zDivider = zDividers[0];

      const xHalfH = xDivider.derived.height / 2;
      const zHalfH = zDivider.derived.height / 2;

      const xCrossLapPoints = xDivider.derived.outline.points.filter(
        (p: { y: number }) => Math.abs(p.y) < 1.0
      );
      const zCrossLapPoints = zDivider.derived.outline.points.filter(
        (p: { y: number }) => Math.abs(p.y) < 1.0
      );

      expect(xCrossLapPoints.length).toBeGreaterThan(0);
      expect(zCrossLapPoints.length).toBeGreaterThan(0);
    });
  });

  describe('Mixed scenario', () => {
    it('each Z-divider in separate child voids terminates at the X-divider', () => {
      engine.createAssembly(200, 150, 100, {
        thickness: 6,
        fingerWidth: 10,
        fingerGap: 1.5,
      });

      engine.dispatch({
        type: 'ADD_SUBDIVISION',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', position: 100 },
      });

      const snapshot1 = engine.getSnapshot();
      const assembly1 = snapshot1.children[0];
      if (assembly1.kind !== 'assembly') throw new Error('Expected assembly');
      const rootVoid = assembly1.children[0];
      if (rootVoid.kind !== 'void') throw new Error('Expected void');
      const childVoids = rootVoid.children.filter(c => c.kind === 'void');

      for (const childVoid of childVoids) {
        engine.dispatch({
          type: 'ADD_SUBDIVISION',
          targetId: 'main-assembly',
          payload: { voidId: childVoid.id, axis: 'z', position: 50 },
        });
      }

      const { zDividers } = getDividerPanels();
      expect(zDividers.length).toBe(2);

      for (const zDivider of zDividers) {
        const halfH = zDivider.derived.height / 2;
        const crossLapPoints = zDivider.derived.outline.points.filter(
          (p: { y: number }) => Math.abs(p.y) < 1.0
        );
        expect(crossLapPoints.length).toBe(0);
      }
    });
  });
});
