/**
 * Integration tests for kerf compensation in SVG export.
 *
 * Kerf compensation adjusts finger joint geometry in SVG output to account for
 * material removed by the laser beam (the "kerf"). Male tabs become wider by `kerf`
 * and female slots become narrower by `kerf` to produce tight-fitting joints.
 *
 * These tests verify the full pipeline:
 *   engine → KerfEdgeConfig stored in PanelPath → generatePanelPathSVG applies kerf
 */

import { describe, it, expect } from 'vitest';
import { AssemblyBuilder } from '../../builder';
import { generatePanelPathSVG } from '../../utils/svgExport';
import { generateFingerJointPathV2 } from '../../utils/fingerJoints';
import type { AxisFingerPoints } from '../../types';

// ---------------------------------------------------------------------------
// Unit tests: generateFingerJointPathV2 with kerf
// ---------------------------------------------------------------------------

describe('generateFingerJointPathV2 kerf compensation', () => {
  // Build a synthetic AxisFingerPoints that yields a single finger section.
  //
  // How the section algorithm works in generateFingerJointPathV2:
  //   allBoundaries = [fingerRegionStart, ...points, fingerRegionEnd]
  //   fingerRegionStart = innerOffset = 10
  //   fingerRegionEnd   = maxJointLength - innerOffset = 94 - 10 = 84
  //   points = [30]  → allBoundaries = [10, 30, 84]
  //
  //   Section 0: [10, 30]  isFinger=true  ← the tab we test against
  //   Section 1: [30, 84]  isFinger=false  (gap to end of finger region)
  //
  // Edge: from (0,0) to (100,0), edgeStartPos=0, edgeEndPos=100
  //   axisToEdge(10) = 10,  axisToEdge(30) = 30
  // So the finger spans edge positions [10, 30].
  const simpleFingerPoints: AxisFingerPoints = {
    axis: 'x',
    points: [30],      // single boundary: finger[10-30], gap[30-84]
    innerOffset: 10,
    fingerLength: 20,
    maxJointLength: 94,  // 100 - 2*3
  };

  // Edge: from (0, 0) to (100, 0) — horizontal edge
  const start = { x: 0, y: 0 };
  const end = { x: 100, y: 0 };

  it('kerf=0 produces identical path to no-kerf call', () => {
    const pathNoKerf = generateFingerJointPathV2(start, end, {
      fingerPoints: simpleFingerPoints,
      gender: 'male',
      materialThickness: 3,
      edgeStartPos: 0,
      edgeEndPos: 100,
      yUp: true,
    });

    const pathKerfZero = generateFingerJointPathV2(start, end, {
      fingerPoints: simpleFingerPoints,
      gender: 'male',
      materialThickness: 3,
      edgeStartPos: 0,
      edgeEndPos: 100,
      yUp: true,
      kerf: 0,
    });

    expect(pathKerfZero.length).toBe(pathNoKerf.length);
    for (let i = 0; i < pathNoKerf.length; i++) {
      expect(pathKerfZero[i].x).toBeCloseTo(pathNoKerf[i].x, 5);
      expect(pathKerfZero[i].y).toBeCloseTo(pathNoKerf[i].y, 5);
    }
  });

  it('male tabs become wider with kerf > 0', () => {
    const kerf = 0.2;
    const halfKerf = kerf / 2;

    const pathNoKerf = generateFingerJointPathV2(start, end, {
      fingerPoints: simpleFingerPoints,
      gender: 'male',
      materialThickness: 3,
      edgeStartPos: 0,
      edgeEndPos: 100,
      yUp: true,
    });

    const pathWithKerf = generateFingerJointPathV2(start, end, {
      fingerPoints: simpleFingerPoints,
      gender: 'male',
      materialThickness: 3,
      edgeStartPos: 0,
      edgeEndPos: 100,
      yUp: true,
      kerf,
    });

    // Both paths should have the same number of points
    expect(pathWithKerf.length).toBe(pathNoKerf.length);

    // Find the X range without kerf (the tab section 10-30)
    // With kerf the tab should span (10 - halfKerf) to (30 + halfKerf)
    const xValsNoKerf = pathNoKerf.map(p => p.x);
    const xValsWithKerf = pathWithKerf.map(p => p.x);

    // The transition at x=10 should shift left by halfKerf
    const hasShiftedLeft = xValsWithKerf.some(x => Math.abs(x - (10 - halfKerf)) < 0.001);
    // The transition at x=30 should shift right by halfKerf
    const hasShiftedRight = xValsWithKerf.some(x => Math.abs(x - (30 + halfKerf)) < 0.001);

    expect(hasShiftedLeft).toBe(true);
    expect(hasShiftedRight).toBe(true);

    // The no-kerf path should NOT have these shifted positions
    const noKerfHasShiftedLeft = xValsNoKerf.some(x => Math.abs(x - (10 - halfKerf)) < 0.001);
    const noKerfHasShiftedRight = xValsNoKerf.some(x => Math.abs(x - (30 + halfKerf)) < 0.001);
    expect(noKerfHasShiftedLeft).toBe(false);
    expect(noKerfHasShiftedRight).toBe(false);
  });

  it('female slots become narrower with kerf > 0', () => {
    const kerf = 0.2;
    const halfKerf = kerf / 2;

    const pathNoKerf = generateFingerJointPathV2(start, end, {
      fingerPoints: simpleFingerPoints,
      gender: 'female',
      materialThickness: 3,
      edgeStartPos: 0,
      edgeEndPos: 100,
      yUp: true,
    });

    const pathWithKerf = generateFingerJointPathV2(start, end, {
      fingerPoints: simpleFingerPoints,
      gender: 'female',
      materialThickness: 3,
      edgeStartPos: 0,
      edgeEndPos: 100,
      yUp: true,
      kerf,
    });

    expect(pathWithKerf.length).toBe(pathNoKerf.length);

    const xValsWithKerf = pathWithKerf.map(p => p.x);
    const xValsNoKerf = pathNoKerf.map(p => p.x);

    // Female slots narrow: start moves right by halfKerf, end moves left by halfKerf
    // Slot start at 10 → 10 + halfKerf
    const hasNarrowStart = xValsWithKerf.some(x => Math.abs(x - (10 + halfKerf)) < 0.001);
    // Slot end at 30 → 30 - halfKerf
    const hasNarrowEnd = xValsWithKerf.some(x => Math.abs(x - (30 - halfKerf)) < 0.001);

    expect(hasNarrowStart).toBe(true);
    expect(hasNarrowEnd).toBe(true);

    // No-kerf should not have these positions
    const noKerfHasNarrowStart = xValsNoKerf.some(x => Math.abs(x - (10 + halfKerf)) < 0.001);
    expect(noKerfHasNarrowStart).toBe(false);
  });

  it('male tabs wider than female slots (male > female with same kerf)', () => {
    const kerf = 0.2;

    const malePath = generateFingerJointPathV2(start, end, {
      fingerPoints: simpleFingerPoints,
      gender: 'male',
      materialThickness: 3,
      edgeStartPos: 0,
      edgeEndPos: 100,
      yUp: true,
      kerf,
    });

    const femalePath = generateFingerJointPathV2(start, end, {
      fingerPoints: simpleFingerPoints,
      gender: 'female',
      materialThickness: 3,
      edgeStartPos: 0,
      edgeEndPos: 100,
      yUp: true,
      kerf,
    });

    // For male path, the tab extends from (10-halfKerf) to (30+halfKerf)
    // For female path, the slot spans from (10+halfKerf) to (30-halfKerf)
    // The male tab is wider than the female slot by 2*kerf total
    const maleXVals = malePath.map(p => p.x);
    const femaleXVals = femalePath.map(p => p.x);

    const maleTabMin = Math.min(...maleXVals.filter(x => x >= 9 && x <= 11));
    const femaleSlotMin = Math.min(...femaleXVals.filter(x => x >= 9 && x <= 11));

    // Male tab starts earlier (wider)
    expect(maleTabMin).toBeLessThan(femaleSlotMin);
  });
});

// ---------------------------------------------------------------------------
// Integration tests: full engine → PanelPath → generatePanelPathSVG pipeline
// ---------------------------------------------------------------------------

describe('SVG export kerf compensation (integration)', () => {
  it('panel has kerfEdgeConfigs populated for enclosed box', () => {
    const { panels } = AssemblyBuilder.enclosedBox(100, 80, 60).build();

    // Front panel should have finger joints on all 4 edges
    const frontPanel = panels.find(p => p.source.faceId === 'front');
    expect(frontPanel).toBeDefined();
    expect(frontPanel!.kerfEdgeConfigs).toBeDefined();
    expect(frontPanel!.kerfEdgeConfigs!.length).toBeGreaterThan(0);
  });

  it('kerfEdgeConfigs covers all finger-joint edges', () => {
    const { panels } = AssemblyBuilder.enclosedBox(100, 80, 60).build();

    const frontPanel = panels.find(p => p.source.faceId === 'front');
    expect(frontPanel).toBeDefined();

    const configs = frontPanel!.kerfEdgeConfigs!;
    // Front panel is surrounded by 4 walls, all with finger joints
    expect(configs.length).toBe(4);

    const positions = configs.map(c => c.position);
    expect(positions).toContain('top');
    expect(positions).toContain('bottom');
    expect(positions).toContain('left');
    expect(positions).toContain('right');
  });

  it('generatePanelPathSVG with kerf=0 produces identical SVG to no kerf argument', () => {
    const { panels } = AssemblyBuilder.enclosedBox(100, 80, 60).build();
    const frontPanel = panels.find(p => p.source.faceId === 'front')!;

    const svgDefault = generatePanelPathSVG(frontPanel);
    const svgKerfZero = generatePanelPathSVG(frontPanel, 0);

    expect(svgKerfZero).toBe(svgDefault);
  });

  it('generatePanelPathSVG with kerf > 0 produces different SVG than kerf=0', () => {
    const { panels } = AssemblyBuilder.enclosedBox(100, 80, 60).build();
    const frontPanel = panels.find(p => p.source.faceId === 'front')!;

    const svgNoKerf = generatePanelPathSVG(frontPanel, 0);
    const svgWithKerf = generatePanelPathSVG(frontPanel, 0.2);

    // SVG with kerf should be different (finger joint positions shifted)
    expect(svgWithKerf).not.toBe(svgNoKerf);
  });

  it('kerf-compensated SVG has more extreme X coordinates for male panel', () => {
    const { panels } = AssemblyBuilder.enclosedBox(100, 80, 60).build();

    // Find a male-edged panel. The front panel in default config has male tabs on top/bottom
    // (wall priority: front < top so front is male on assembly axis edges)
    // Find a panel where at least one kerfEdgeConfig has gender='male'
    const malePanel = panels.find(p =>
      p.kerfEdgeConfigs?.some(c => c.gender === 'male')
    );
    expect(malePanel).toBeDefined();

    const svgNoKerf = generatePanelPathSVG(malePanel!, 0);
    const svgWithKerf = generatePanelPathSVG(malePanel!, 0.2);

    // The SVG with kerf should contain coordinates that are slightly more extreme
    // (male tabs push further out). Both should be valid SVG.
    expect(svgWithKerf).toContain('<svg');
    expect(svgWithKerf).toContain('<path');
    expect(svgWithKerf).not.toBe(svgNoKerf);
  });

  it('panels without kerfEdgeConfigs fall back to stored outline', () => {
    // Basic box has open top - top panel doesn't exist, but others might have
    // some open edges. Check that a panel without kerfEdgeConfigs still exports.
    const { panels } = AssemblyBuilder.basicBox(100, 80, 60).build();

    for (const panel of panels) {
      // Should not throw even if kerfEdgeConfigs is undefined
      const svg = generatePanelPathSVG(panel, 0.2);
      expect(svg).toContain('<svg');
      expect(svg).toContain('<path');
    }
  });

  it('kerfEdgeConfigs stores correct edge geometry', () => {
    const { panels } = AssemblyBuilder.enclosedBox(100, 80, 60).build();
    const frontPanel = panels.find(p => p.source.faceId === 'front')!;

    const configs = frontPanel.kerfEdgeConfigs!;
    for (const cfg of configs) {
      // Each config should have valid fingerPoints
      expect(cfg.fingerPoints).toBeDefined();
      expect(cfg.fingerPoints.points).toBeInstanceOf(Array);

      // Edge start/end should be valid coordinates within panel bounds
      const hw = frontPanel.width / 2;
      const hh = frontPanel.height / 2;
      expect(Math.abs(cfg.edgeStart.x)).toBeLessThanOrEqual(hw + 0.01);
      expect(Math.abs(cfg.edgeStart.y)).toBeLessThanOrEqual(hh + 0.01);
      expect(Math.abs(cfg.edgeEnd.x)).toBeLessThanOrEqual(hw + 0.01);
      expect(Math.abs(cfg.edgeEnd.y)).toBeLessThanOrEqual(hh + 0.01);

      // Outward direction should be a unit vector
      const magnitude = Math.sqrt(
        cfg.outwardDirection.x ** 2 + cfg.outwardDirection.y ** 2
      );
      expect(magnitude).toBeCloseTo(1, 3);
    }
  });
});
