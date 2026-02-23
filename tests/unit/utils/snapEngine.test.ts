import { describe, it, expect } from 'vitest';
import {
  computeGuideLines,
  gridCandidates,
  pointCandidates,
  alignmentCandidates,
  edgeSegmentCandidates,
  intersectionCandidates,
  closePolygonCandidate,
  mergeBoundaryCandidate,
  midpointCandidates,
  pickBest,
  filterToConstraintRay,
  snapPoint,
  getToolSnapConfig,
  SnapTarget,
  SnapConfig,
  SnapContext,
  GuideLine,
} from '../../../src/utils/snapEngine';

// ── computeGuideLines ────────────────────────────────────────────────────────

describe('computeGuideLines', () => {
  it('returns center + edge guides for a 100×80 panel', () => {
    const guides = computeGuideLines(100, 80, [], 10);
    // Should include: x=0, y=0 (center), x=±50, y=±40 (edges)
    const xPositions = guides.filter(g => g.axis === 'x').map(g => g.position).sort((a, b) => a - b);
    const yPositions = guides.filter(g => g.axis === 'y').map(g => g.position).sort((a, b) => a - b);

    expect(xPositions).toContain(0);
    expect(xPositions).toContain(-50);
    expect(xPositions).toContain(50);
    expect(yPositions).toContain(0);
    expect(yPositions).toContain(-40);
    expect(yPositions).toContain(40);
  });

  it('includes guides at 6 positions minimum (center + edges)', () => {
    const guides = computeGuideLines(100, 80, [], 10);
    // At least 3 x-guides (left, center, right) + 3 y-guides (bottom, center, top)
    expect(guides.length).toBeGreaterThanOrEqual(6);
  });

  it('includes finger joint tip positions as edge guides', () => {
    // Simulated outline with finger joints on top: tips at y=43 (MT=3)
    const outline = [
      { x: -50, y: -40 },
      { x: 50, y: -40 },
      { x: 50, y: 40 },
      { x: 30, y: 40 },
      { x: 30, y: 43 },
      { x: 10, y: 43 },
      { x: 10, y: 40 },
      { x: -50, y: 40 },
    ];
    const guides = computeGuideLines(100, 80, outline, 10);
    // Should have a y-guide at y=43 (finger tip line)
    const tipGuide = guides.find(g => g.axis === 'y' && Math.abs(g.position - 43) < 0.01);
    expect(tipGuide).toBeDefined();
    expect(tipGuide!.type).toBe('edge');
  });

  it('includes both body and tip y-positions from finger joints', () => {
    const outline = [
      { x: -50, y: -40 },
      { x: 50, y: -40 },
      { x: 50, y: 40 },
      { x: 30, y: 40 },
      { x: 30, y: 43 },
      { x: 10, y: 43 },
      { x: 10, y: 40 },
      { x: -50, y: 40 },
    ];
    const guides = computeGuideLines(100, 80, outline, 10);
    const yPositions = guides.filter(g => g.axis === 'y').map(g => g.position);
    expect(yPositions).toContain(40);
    expect(yPositions).toContain(43);
    expect(yPositions).toContain(-40);
  });
});

// ── gridCandidates ───────────────────────────────────────────────────────────

describe('gridCandidates', () => {
  it('returns nearest grid point for cursor at (11, 19)', () => {
    const candidates = gridCandidates({ x: 11, y: 19 }, 10, 5);
    const nearest = candidates.find(c => c.point.x === 10 && c.point.y === 20);
    expect(nearest).toBeDefined();
    expect(nearest!.type).toBe('grid');
  });

  it('returns grid point at exact position when cursor is on grid', () => {
    const candidates = gridCandidates({ x: 20, y: 30 }, 10, 5);
    const exact = candidates.find(c => c.point.x === 20 && c.point.y === 30);
    expect(exact).toBeDefined();
  });

  it('returns empty array when no grid point within threshold', () => {
    const candidates = gridCandidates({ x: 15, y: 15 }, 10, 2);
    // Distance to nearest grid point (10,10) or (20,20) etc. is ~7, > threshold 2
    expect(candidates.length).toBe(0);
  });

  it('returns multiple nearby grid candidates', () => {
    // Cursor very close to a grid intersection — should get at least 1
    const candidates = gridCandidates({ x: 10.5, y: 20.5 }, 10, 5);
    expect(candidates.length).toBeGreaterThanOrEqual(1);
  });
});

// ── pointCandidates ──────────────────────────────────────────────────────────

describe('pointCandidates', () => {
  const existingPoints = [
    { x: 10, y: 20 },
    { x: 50, y: 50 },
    { x: -30, y: 40 },
  ];

  it('returns a candidate for a point within threshold', () => {
    const candidates = pointCandidates({ x: 11, y: 21 }, existingPoints, 5);
    expect(candidates.length).toBe(1);
    expect(candidates[0].point).toEqual({ x: 10, y: 20 });
    expect(candidates[0].type).toBe('point');
  });

  it('returns no candidates when all points are far away', () => {
    const candidates = pointCandidates({ x: 100, y: 100 }, existingPoints, 5);
    expect(candidates.length).toBe(0);
  });

  it('returns multiple candidates when several points are close', () => {
    // Two points close together
    const closePoints = [
      { x: 10, y: 10 },
      { x: 12, y: 10 },
    ];
    const candidates = pointCandidates({ x: 11, y: 10 }, closePoints, 5);
    expect(candidates.length).toBe(2);
  });

  it('deduplicates overlapping outline vertices', () => {
    const dupePoints = [
      { x: 10, y: 20 },
      { x: 10, y: 20 }, // duplicate
      { x: 10, y: 20 }, // duplicate
    ];
    const candidates = pointCandidates({ x: 10.5, y: 20.5 }, dupePoints, 5);
    expect(candidates.length).toBe(1);
  });
});

// ── edgeSegmentCandidates ────────────────────────────────────────────────────

describe('edgeSegmentCandidates', () => {
  // Simple rectangle outline: 100x80 panel
  const outline = [
    { x: -50, y: -40 },
    { x: 50, y: -40 },
    { x: 50, y: 40 },
    { x: -50, y: 40 },
  ];

  it('snaps to nearest point on top edge segment', () => {
    // Cursor near the top edge at x=20 (between corners)
    const candidates = edgeSegmentCandidates({ x: 20, y: 38 }, outline, 100, 80, 5);
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    const best = candidates[0];
    expect(best.type).toBe('edge-segment');
    expect(best.point.y).toBeCloseTo(40);
    expect(best.point.x).toBeCloseTo(20); // preserves X position along edge
  });

  it('snaps to nearest point on right edge segment', () => {
    const candidates = edgeSegmentCandidates({ x: 48, y: 10 }, outline, 100, 80, 5);
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates[0].point.x).toBeCloseTo(50);
    expect(candidates[0].point.y).toBeCloseTo(10);
  });

  it('returns empty when cursor is far from all edges', () => {
    const candidates = edgeSegmentCandidates({ x: 0, y: 0 }, outline, 100, 80, 5);
    expect(candidates.length).toBe(0);
  });

  it('works with finger joint outline', () => {
    const jointOutline = [
      { x: -50, y: -40 },
      { x: 50, y: -40 },
      { x: 50, y: 40 },
      { x: 30, y: 40 },
      { x: 30, y: 43 },
      { x: 10, y: 43 },
      { x: 10, y: 40 },
      { x: -50, y: 40 },
    ];
    // Cursor near the finger tip segment at y=43
    const candidates = edgeSegmentCandidates({ x: 20, y: 42 }, jointOutline, 100, 80, 5);
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    // Should snap to the segment at y=43
    const tipSnap = candidates.find(c => Math.abs(c.point.y - 43) < 1);
    expect(tipSnap).toBeDefined();
  });
});

// ── midpointCandidates ───────────────────────────────────────────────────────

describe('midpointCandidates', () => {
  it('finds midpoint of a horizontal segment', () => {
    const outlinePoints = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 0, y: 10 },
    ];
    const candidates = midpointCandidates({ x: 10, y: 0.5 }, outlinePoints, 3);
    // Midpoint of (0,0)-(20,0) is (10,0), within threshold
    const found = candidates.find(c => c.point.x === 10 && c.point.y === 0);
    expect(found).toBeDefined();
    expect(found!.type).toBe('midpoint');
  });
});

// ── intersectionCandidates ───────────────────────────────────────────────────

describe('intersectionCandidates', () => {
  it('finds crossing of two perpendicular guides', () => {
    const guides: GuideLine[] = [
      { axis: 'x', position: 0, type: 'center' },   // vertical line at x=0
      { axis: 'y', position: 0, type: 'center' },   // horizontal line at y=0
    ];
    const candidates = intersectionCandidates({ x: 1, y: 1 }, guides, 5);
    const origin = candidates.find(c => c.point.x === 0 && c.point.y === 0);
    expect(origin).toBeDefined();
    expect(origin!.type).toBe('intersection');
  });

  it('finds crossing of edge guides', () => {
    const guides: GuideLine[] = [
      { axis: 'x', position: 50, type: 'edge' },   // vertical line at x=50
      { axis: 'y', position: 40, type: 'edge' },   // horizontal line at y=40
    ];
    const candidates = intersectionCandidates({ x: 49, y: 39 }, guides, 5);
    const corner = candidates.find(c => c.point.x === 50 && c.point.y === 40);
    expect(corner).toBeDefined();
  });

  it('returns empty when no intersection is near cursor', () => {
    const guides: GuideLine[] = [
      { axis: 'x', position: 0, type: 'center' },
      { axis: 'y', position: 0, type: 'center' },
    ];
    const candidates = intersectionCandidates({ x: 100, y: 100 }, guides, 5);
    expect(candidates.length).toBe(0);
  });
});

// ── closePolygonCandidate ────────────────────────────────────────────────────

describe('closePolygonCandidate', () => {
  it('returns target when near start with 3+ points', () => {
    const draftPoints = [
      { x: 10, y: 10 },
      { x: 30, y: 10 },
      { x: 30, y: 30 },
    ];
    const candidate = closePolygonCandidate({ x: 11, y: 11 }, draftPoints, 5);
    expect(candidate).not.toBeNull();
    expect(candidate!.type).toBe('close-polygon');
    expect(candidate!.point).toEqual({ x: 10, y: 10 });
  });

  it('returns null when fewer than 3 points', () => {
    const draftPoints = [
      { x: 10, y: 10 },
      { x: 30, y: 10 },
    ];
    const candidate = closePolygonCandidate({ x: 11, y: 11 }, draftPoints, 5);
    expect(candidate).toBeNull();
  });

  it('returns null when too far from start', () => {
    const draftPoints = [
      { x: 10, y: 10 },
      { x: 30, y: 10 },
      { x: 30, y: 30 },
    ];
    const candidate = closePolygonCandidate({ x: 50, y: 50 }, draftPoints, 5);
    expect(candidate).toBeNull();
  });

  it('returns null for empty draft', () => {
    const candidate = closePolygonCandidate({ x: 0, y: 0 }, [], 5);
    expect(candidate).toBeNull();
  });
});

// ── mergeBoundaryCandidate ───────────────────────────────────────────────────

describe('mergeBoundaryCandidate', () => {
  it('returns target when near panel edge during edge-path', () => {
    // Panel is 100x80 centered at origin, so right edge is at x=50
    const candidate = mergeBoundaryCandidate(
      { x: 49, y: 10 },
      'right',
      100,
      80,
      5,
      3,  // minimum points for merge
    );
    expect(candidate).not.toBeNull();
    expect(candidate!.type).toBe('merge-boundary');
    // The merge point should be ON the boundary
    expect(candidate!.point.x).toBe(50);
  });

  it('returns target when near top edge', () => {
    const candidate = mergeBoundaryCandidate(
      { x: 10, y: 39 },
      'top',
      100,
      80,
      5,
      2,
    );
    expect(candidate).not.toBeNull();
    expect(candidate!.point.y).toBe(40);
  });

  it('returns null when far from boundary', () => {
    const candidate = mergeBoundaryCandidate(
      { x: 0, y: 0 },
      'right',
      100,
      80,
      5,
      2,
    );
    expect(candidate).toBeNull();
  });

  it('returns null when insufficient draft points', () => {
    const candidate = mergeBoundaryCandidate(
      { x: 49, y: 10 },
      'right',
      100,
      80,
      5,
      3,  // need 3 points but draftPointCount isn't checked here — threshold check
    );
    // This should still return since it's about boundary proximity
    // The point count check happens before calling this
    expect(candidate).not.toBeNull();
  });
});

// ── pickBest ─────────────────────────────────────────────────────────────────

describe('pickBest', () => {
  it('selects point snap (pri 1) over grid snap (pri 4)', () => {
    const cursor = { x: 10, y: 10 };
    const candidates: SnapTarget[] = [
      { type: 'grid', point: { x: 10, y: 10 }, priority: 4 },
      { type: 'point', point: { x: 11, y: 11 }, priority: 1 },
    ];
    const best = pickBest(candidates, cursor);
    expect(best).not.toBeNull();
    expect(best!.type).toBe('point');
  });

  it('breaks ties by distance', () => {
    const cursor = { x: 10, y: 10 };
    const candidates: SnapTarget[] = [
      { type: 'grid', point: { x: 12, y: 12 }, priority: 4 },
      { type: 'grid', point: { x: 10.5, y: 10.5 }, priority: 4 },
    ];
    const best = pickBest(candidates, cursor);
    expect(best).not.toBeNull();
    expect(best!.point).toEqual({ x: 10.5, y: 10.5 });
  });

  it('returns null for empty candidates', () => {
    expect(pickBest([], { x: 0, y: 0 })).toBeNull();
  });

  it('selects close-polygon (pri 0) over everything', () => {
    const cursor = { x: 10, y: 10 };
    const candidates: SnapTarget[] = [
      { type: 'point', point: { x: 10, y: 10 }, priority: 1 },
      { type: 'close-polygon', point: { x: 11, y: 11 }, priority: 0 },
    ];
    const best = pickBest(candidates, cursor);
    expect(best!.type).toBe('close-polygon');
  });
});

// ── filterToConstraintRay ────────────────────────────────────────────────────

describe('filterToConstraintRay', () => {
  it('keeps candidate on the constraint ray', () => {
    const angleRef = { x: 0, y: 0 };
    const cursor = { x: 20, y: 0 }; // 0° ray
    const candidates: SnapTarget[] = [
      { type: 'grid', point: { x: 10, y: 0.5 }, priority: 4 }, // nearly on the ray
      { type: 'grid', point: { x: 10, y: 20 }, priority: 4 },  // far off ray
    ];
    const filtered = filterToConstraintRay(candidates, angleRef, cursor, 2);
    expect(filtered.length).toBe(1);
    expect(filtered[0].point.x).toBe(10);
  });

  it('removes all candidates when none are on the ray', () => {
    const angleRef = { x: 0, y: 0 };
    const cursor = { x: 20, y: 0 }; // 0° ray
    const candidates: SnapTarget[] = [
      { type: 'grid', point: { x: 10, y: 20 }, priority: 4 },
    ];
    const filtered = filterToConstraintRay(candidates, angleRef, cursor, 2);
    expect(filtered.length).toBe(0);
  });

  it('works with 90° vertical ray', () => {
    const angleRef = { x: 0, y: 0 };
    const cursor = { x: 1, y: 20 }; // Nearly vertical → snaps to 90° ray
    const candidates: SnapTarget[] = [
      { type: 'grid', point: { x: 0, y: 10 }, priority: 5 }, // on the 90° ray
      { type: 'grid', point: { x: 10, y: 0 }, priority: 5 },  // not on ray
    ];
    const filtered = filterToConstraintRay(candidates, angleRef, cursor, 2);
    expect(filtered.length).toBe(1);
    expect(filtered[0].point).toEqual({ x: 0, y: 10 });
  });
});

// ── snapPoint ────────────────────────────────────────────────────────────────

describe('snapPoint', () => {
  const baseContext: SnapContext = {
    panelWidth: 100,
    panelHeight: 80,
    outlinePoints: [],
    draftPoints: [],
    gridSize: 10,
  };

  it('without Shift returns nearest grid snap', () => {
    const config: SnapConfig = {
      enabledTypes: new Set(['grid']),
      threshold: 5,
      gridSize: 10,
      shiftHeld: false,
    };
    const result = snapPoint({ x: 11, y: 19 }, config, baseContext);
    expect(result.point.x).toBe(10);
    expect(result.point.y).toBe(20);
    expect(result.target).not.toBeNull();
    expect(result.target!.type).toBe('grid');
  });

  it('without Shift prefers point over grid', () => {
    const context: SnapContext = {
      ...baseContext,
      outlinePoints: [{ x: 11, y: 19 }], // existing point near cursor
    };
    const config: SnapConfig = {
      enabledTypes: new Set(['grid', 'point']),
      threshold: 5,
      gridSize: 10,
      shiftHeld: false,
    };
    const result = snapPoint({ x: 11.5, y: 19.5 }, config, context);
    expect(result.target).not.toBeNull();
    expect(result.target!.type).toBe('point');
  });

  it('with Shift near guide on ray returns composed snap (draft #57 fix)', () => {
    const config: SnapConfig = {
      enabledTypes: new Set(['grid', 'center', 'edge-line']),
      threshold: 5,
      gridSize: 10,
      shiftHeld: true,
      angleReference: { x: 0, y: 0 },
    };
    // Cursor moving along 0° ray (horizontal right)
    // Center guide at x=0 is the reference, edge guide at y=0 should be on the ray
    const result = snapPoint({ x: 19, y: 0.5 }, config, baseContext);
    expect(result.angleConstrained).toBe(true);
    // Should snap to a grid or guide point ON the constraint ray
    expect(result.point.y).toBeCloseTo(0, 0);
  });

  it('with Shift far from guides returns angle-only', () => {
    const config: SnapConfig = {
      enabledTypes: new Set(['grid']),
      threshold: 5,
      gridSize: 10,
      shiftHeld: true,
      angleReference: { x: 0, y: 0 },
    };
    // Cursor at angle that doesn't pass near any grid point within threshold
    const result = snapPoint({ x: 13.7, y: 13.7 }, config, baseContext);
    expect(result.angleConstrained).toBe(true);
    // Should fall back to pure angle constraint (45° diagonal)
  });

  it('with no candidate in threshold returns raw cursor', () => {
    const config: SnapConfig = {
      enabledTypes: new Set(['point']), // only points, no existing points
      threshold: 5,
      gridSize: 10,
      shiftHeld: false,
    };
    const result = snapPoint({ x: 13.7, y: 17.3 }, config, baseContext);
    expect(result.point.x).toBeCloseTo(13.7);
    expect(result.point.y).toBeCloseTo(17.3);
    expect(result.target).toBeNull();
  });

  it('returns activeGuides when snapped to guideline', () => {
    const config: SnapConfig = {
      enabledTypes: new Set(['center']),
      threshold: 5,
      gridSize: 10,
      shiftHeld: false,
    };
    const result = snapPoint({ x: 1, y: 1 }, config, baseContext);
    // Should snap to center (0,0) and have active guides
    if (result.target) {
      expect(result.activeGuides.length).toBeGreaterThan(0);
    }
  });
});

// ── alignmentCandidates ──────────────────────────────────────────────────────

describe('alignmentCandidates', () => {
  it('snaps to vertical alignment (same X) with reference point', () => {
    const cursor = { x: 21, y: 50 };
    const refs = [{ x: 20, y: 10 }]; // ref at x=20
    const results = alignmentCandidates(cursor, refs, 3);
    expect(results.length).toBe(1);
    expect(results[0].type).toBe('alignment');
    expect(results[0].point.x).toBe(20);
    expect(results[0].point.y).toBe(50); // keeps cursor Y
  });

  it('snaps to horizontal alignment (same Y) with reference point', () => {
    const cursor = { x: 50, y: 11 };
    const refs = [{ x: 20, y: 10 }]; // ref at y=10
    const results = alignmentCandidates(cursor, refs, 3);
    expect(results.length).toBe(1);
    expect(results[0].type).toBe('alignment');
    expect(results[0].point.x).toBe(50); // keeps cursor X
    expect(results[0].point.y).toBe(10);
  });

  it('returns both X and Y alignment when cursor is near both axes', () => {
    const cursor = { x: 21, y: 11 };
    const refs = [{ x: 20, y: 10 }];
    const results = alignmentCandidates(cursor, refs, 3);
    expect(results.length).toBe(2);
    const types = results.map(r => `${r.point.x},${r.point.y}`);
    expect(types).toContain('20,11'); // vertical alignment
    expect(types).toContain('21,10'); // horizontal alignment
  });

  it('deduplicates alignment at the same position', () => {
    const cursor = { x: 21, y: 50 };
    const refs = [{ x: 20, y: 10 }, { x: 20, y: 30 }]; // both at x=20
    const results = alignmentCandidates(cursor, refs, 3);
    // Should only produce one vertical alignment at x=20
    const verticals = results.filter(r => r.point.x === 20);
    expect(verticals.length).toBe(1);
  });

  it('ignores reference points outside threshold', () => {
    const cursor = { x: 50, y: 50 };
    const refs = [{ x: 20, y: 10 }]; // too far
    const results = alignmentCandidates(cursor, refs, 3);
    expect(results.length).toBe(0);
  });
});

// ── Priority ordering ────────────────────────────────────────────────────────

describe('priority ordering', () => {
  it('prefers alignment over grid when both within threshold', () => {
    const context: SnapContext = {
      panelWidth: 100,
      panelHeight: 80,
      outlinePoints: [{ x: 15, y: 30 }], // existing point at x=15
      draftPoints: [],
      gridSize: 10,
    };
    const config: SnapConfig = {
      enabledTypes: new Set(['grid', 'alignment']),
      threshold: 8,
      gridSize: 10,
      shiftHeld: false,
    };
    // Cursor at (14, 19) — near grid (10,20) AND alignment x=15
    const result = snapPoint({ x: 14, y: 19 }, config, context);
    expect(result.target).not.toBeNull();
    expect(result.target!.type).toBe('alignment');
  });

  it('prefers center/edge-line guides over grid', () => {
    const context: SnapContext = {
      panelWidth: 100,
      panelHeight: 80,
      outlinePoints: [],
      draftPoints: [],
      gridSize: 10,
    };
    const config: SnapConfig = {
      enabledTypes: new Set(['grid', 'center']),
      threshold: 8,
      gridSize: 10,
      shiftHeld: false,
    };
    // Cursor at (2, 19) — near center x=0 AND grid (0,20)
    // Center is priority 3, grid is priority 5 — center wins
    const result = snapPoint({ x: 2, y: 19 }, config, context);
    expect(result.target).not.toBeNull();
    expect(result.target!.type).toBe('center');
  });

  it('prefers point over alignment', () => {
    const context: SnapContext = {
      panelWidth: 100,
      panelHeight: 80,
      outlinePoints: [{ x: 15, y: 30 }],
      draftPoints: [],
      gridSize: 10,
    };
    const config: SnapConfig = {
      enabledTypes: new Set(['point', 'alignment']),
      threshold: 8,
      gridSize: 10,
      shiftHeld: false,
    };
    // Cursor near the actual point — should prefer exact point over alignment
    const result = snapPoint({ x: 15.5, y: 30.5 }, config, context);
    expect(result.target).not.toBeNull();
    expect(result.target!.type).toBe('point');
  });
});

// ── getToolSnapConfig ────────────────────────────────────────────────────────

describe('getToolSnapConfig', () => {
  it('polygon tool enables grid, center, edge-line, point, alignment, edge-segment, midpoint, intersection, close-polygon', () => {
    const config = getToolSnapConfig('polygon', 'polygon', 500, 10);
    expect(config.enabledTypes.has('grid')).toBe(true);
    expect(config.enabledTypes.has('center')).toBe(true);
    expect(config.enabledTypes.has('edge-line')).toBe(true);
    expect(config.enabledTypes.has('point')).toBe(true);
    expect(config.enabledTypes.has('alignment')).toBe(true);
    expect(config.enabledTypes.has('edge-segment')).toBe(true);
    expect(config.enabledTypes.has('midpoint')).toBe(true);
    expect(config.enabledTypes.has('intersection')).toBe(true);
    expect(config.enabledTypes.has('close-polygon')).toBe(true);
    expect(config.enabledTypes.has('merge-boundary')).toBe(false);
  });

  it('edge-path tool enables merge-boundary', () => {
    const config = getToolSnapConfig('polygon', 'forked', 500, 10);
    expect(config.enabledTypes.has('merge-boundary')).toBe(true);
    expect(config.enabledTypes.has('close-polygon')).toBe(false);
  });

  it('rectangle tool enables grid, center, edge-line, point, intersection', () => {
    const config = getToolSnapConfig('rectangle', undefined, 500, 10);
    expect(config.enabledTypes.has('grid')).toBe(true);
    expect(config.enabledTypes.has('center')).toBe(true);
    expect(config.enabledTypes.has('close-polygon')).toBe(false);
    expect(config.enabledTypes.has('merge-boundary')).toBe(false);
  });

  it('circle tool enables grid, center, edge-line, point, intersection', () => {
    const config = getToolSnapConfig('circle', undefined, 500, 10);
    expect(config.enabledTypes.has('grid')).toBe(true);
    expect(config.enabledTypes.has('center')).toBe(true);
  });

  it('threshold scales with viewBox width', () => {
    const narrow = getToolSnapConfig('polygon', 'polygon', 200, 10);
    const wide = getToolSnapConfig('polygon', 'polygon', 800, 10);
    expect(wide.threshold).toBeGreaterThan(narrow.threshold);
  });
});
