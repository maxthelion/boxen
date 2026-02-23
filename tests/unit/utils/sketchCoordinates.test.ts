import { describe, it, expect } from 'vitest';
import {
  distanceToSegment,
  constrainAngle,
  getEdgePathOffsetAtT,
  classifySegment,
  getEdgeSegments,
  getConceptualBoundary,
  getJointSegments,
  classifyClickLocation,
  screenToSvgCoords,
  svgToEdgeCoords,
  edgeCoordsToSvg,
  findEdgeAtPoint,
  findCornerAtPoint,
  computeHitThreshold,
  EdgePosition,
} from '../../../src/utils/sketchCoordinates';
import { PathPoint } from '../../../src/types';

// ── distanceToSegment ────────────────────────────────────────────────────────

describe('distanceToSegment', () => {
  it('returns 0 for a point on the segment midpoint', () => {
    expect(distanceToSegment(5, 0, 0, 0, 10, 0)).toBeCloseTo(0);
  });

  it('returns correct perpendicular distance', () => {
    // Point (5,3) is 3 units above the segment (0,0)–(10,0)
    expect(distanceToSegment(5, 3, 0, 0, 10, 0)).toBeCloseTo(3);
  });

  it('clamps to endpoint for points beyond segment', () => {
    // Point (15,0) is 5 units past the end of (0,0)–(10,0)
    expect(distanceToSegment(15, 0, 0, 0, 10, 0)).toBeCloseTo(5);
    // Point (-3,0) is 3 units before the start
    expect(distanceToSegment(-3, 0, 0, 0, 10, 0)).toBeCloseTo(3);
  });

  it('handles zero-length (degenerate) segment', () => {
    expect(distanceToSegment(3, 4, 0, 0, 0, 0)).toBeCloseTo(5);
  });
});

// ── constrainAngle ───────────────────────────────────────────────────────────

describe('constrainAngle', () => {
  const origin: PathPoint = { x: 0, y: 0 };

  it('keeps 0° (horizontal right)', () => {
    const result = constrainAngle(origin, { x: 10, y: 0 });
    expect(result.x).toBeCloseTo(10);
    expect(result.y).toBeCloseTo(0);
  });

  it('snaps ~40° to 0° (90° increments)', () => {
    const result = constrainAngle(origin, { x: 8, y: 7 }); // ~41° → 0°
    const angle = Math.atan2(result.y, result.x);
    expect(angle).toBeCloseTo(0);
  });

  it('snaps ~85° to 90°', () => {
    const result = constrainAngle(origin, { x: 1, y: 10 }); // ~84°
    const angle = Math.atan2(result.y, result.x);
    expect(angle).toBeCloseTo(Math.PI / 2);
  });

  it('snaps ~130° to 90° (90° increments)', () => {
    const result = constrainAngle(origin, { x: -7, y: 8 }); // ~131° → 90°
    const angle = Math.atan2(result.y, result.x);
    expect(angle).toBeCloseTo(Math.PI / 2);
  });

  it('keeps 180°', () => {
    const result = constrainAngle(origin, { x: -10, y: 0 });
    expect(result.x).toBeCloseTo(-10);
    expect(result.y).toBeCloseTo(0);
  });

  it('returns fromPoint for degenerate (distance < 0.001)', () => {
    const from: PathPoint = { x: 5, y: 7 };
    const result = constrainAngle(from, { x: 5.0001, y: 7.0001 });
    expect(result.x).toBe(from.x);
    expect(result.y).toBe(from.y);
  });
});

// ── getEdgePathOffsetAtT ─────────────────────────────────────────────────────

describe('getEdgePathOffsetAtT', () => {
  it('returns 0 when no custom path exists', () => {
    expect(getEdgePathOffsetAtT([], 'top', 0.5)).toBe(0);
  });

  it('returns 0 when the edge has an empty points array', () => {
    const paths = [{ edge: 'top', points: [] as { t: number; offset: number }[] }];
    expect(getEdgePathOffsetAtT(paths, 'top', 0.5)).toBe(0);
  });

  it('returns the single point offset for any t', () => {
    const paths = [{ edge: 'top', points: [{ t: 0.5, offset: 10 }] }];
    expect(getEdgePathOffsetAtT(paths, 'top', 0)).toBe(10);
    expect(getEdgePathOffsetAtT(paths, 'top', 0.5)).toBe(10);
    expect(getEdgePathOffsetAtT(paths, 'top', 1)).toBe(10);
  });

  it('linearly interpolates between two points', () => {
    const paths = [{ edge: 'top', points: [{ t: 0, offset: 0 }, { t: 1, offset: 10 }] }];
    expect(getEdgePathOffsetAtT(paths, 'top', 0.5)).toBeCloseTo(5);
    expect(getEdgePathOffsetAtT(paths, 'top', 0.25)).toBeCloseTo(2.5);
  });

  it('returns first offset for t before first point', () => {
    const paths = [{ edge: 'left', points: [{ t: 0.2, offset: 5 }, { t: 0.8, offset: 15 }] }];
    expect(getEdgePathOffsetAtT(paths, 'left', 0)).toBe(5);
  });

  it('returns last offset for t after last point', () => {
    const paths = [{ edge: 'left', points: [{ t: 0.2, offset: 5 }, { t: 0.8, offset: 15 }] }];
    expect(getEdgePathOffsetAtT(paths, 'left', 1)).toBe(15);
  });
});

// ── classifySegment ──────────────────────────────────────────────────────────

describe('classifySegment', () => {
  const w = 100;
  const h = 80;

  it('classifies segment along top edge', () => {
    expect(classifySegment({ x: -30, y: 40 }, { x: 30, y: 40 }, w, h)).toBe('top');
  });

  it('classifies segment along bottom edge', () => {
    expect(classifySegment({ x: -30, y: -40 }, { x: 30, y: -40 }, w, h)).toBe('bottom');
  });

  it('classifies segment along left edge', () => {
    expect(classifySegment({ x: -50, y: -20 }, { x: -50, y: 20 }, w, h)).toBe('left');
  });

  it('classifies segment along right edge', () => {
    expect(classifySegment({ x: 50, y: -20 }, { x: 50, y: 20 }, w, h)).toBe('right');
  });

  it('returns null for diagonal segment', () => {
    expect(classifySegment({ x: -50, y: -40 }, { x: 50, y: 40 }, w, h)).toBeNull();
  });

  it('classifies segment within tolerance of edge', () => {
    // Slightly off the top edge but within default tolerance (5)
    expect(classifySegment({ x: -30, y: 38 }, { x: 30, y: 38 }, w, h)).toBe('top');
  });
});

// ── getEdgeSegments ──────────────────────────────────────────────────────────

describe('getEdgeSegments', () => {
  it('groups simple rectangle segments into 4 edges', () => {
    const w = 100;
    const h = 80;
    // CCW rectangle: BL → BR → TR → TL
    const rect: PathPoint[] = [
      { x: -50, y: -40 },
      { x: 50, y: -40 },
      { x: 50, y: 40 },
      { x: -50, y: 40 },
    ];

    const edges = getEdgeSegments(rect, w, h);
    expect(edges.bottom).toHaveLength(1);
    expect(edges.right).toHaveLength(1);
    expect(edges.top).toHaveLength(1);
    expect(edges.left).toHaveLength(1);
  });

  it('groups finger-jointed edges into multiple segments', () => {
    const w = 100;
    const h = 80;
    // Partial outline: bottom edge with a finger joint notch
    const points: PathPoint[] = [
      { x: -50, y: -40 }, // bottom-left
      { x: -20, y: -40 }, // along bottom
      { x: -20, y: -37 }, // joint step (perpendicular — not on any edge)
      { x: 0, y: -37 },   // joint top (not on bottom edge — off by 3)
      { x: 0, y: -40 },   // back to bottom
      { x: 50, y: -40 },  // bottom-right
      { x: 50, y: 40 },   // up right side
      { x: -50, y: 40 },  // across top
      { x: -50, y: -40 }, // close — duplicate of first, will wrap
    ];

    const edges = getEdgeSegments(points, w, h);
    // Bottom should have the two on-edge segments
    expect(edges.bottom.length).toBeGreaterThanOrEqual(2);
  });
});

// ── getConceptualBoundary ────────────────────────────────────────────────────

describe('getConceptualBoundary', () => {
  it('returns correct boundary for 100x80 panel', () => {
    const b = getConceptualBoundary(100, 80);
    expect(b.top.start).toEqual({ x: -50, y: 40 });
    expect(b.top.end).toEqual({ x: 50, y: 40 });
    expect(b.bottom.start).toEqual({ x: -50, y: -40 });
    expect(b.bottom.end).toEqual({ x: 50, y: -40 });
    expect(b.left.start).toEqual({ x: -50, y: -40 });
    expect(b.left.end).toEqual({ x: -50, y: 40 });
    expect(b.right.start).toEqual({ x: 50, y: -40 });
    expect(b.right.end).toEqual({ x: 50, y: 40 });
  });
});

// ── getJointSegments ─────────────────────────────────────────────────────────

describe('getJointSegments', () => {
  it('returns no joints for a simple rectangle', () => {
    const w = 100;
    const h = 80;
    const rect: PathPoint[] = [
      { x: -50, y: -40 },
      { x: 50, y: -40 },
      { x: 50, y: 40 },
      { x: -50, y: 40 },
    ];
    expect(getJointSegments(rect, w, h)).toHaveLength(0);
  });
});

// ── classifyClickLocation ────────────────────────────────────────────────────

describe('classifyClickLocation', () => {
  const w = 100;
  const h = 80;

  it('detects boundary near top edge', () => {
    const result = classifyClickLocation(0, 40, w, h, null, null, 5);
    expect(result).toEqual({ type: 'boundary', edge: 'top' });
  });

  it('detects boundary near bottom edge', () => {
    const result = classifyClickLocation(0, -40, w, h, null, null, 5);
    expect(result).toEqual({ type: 'boundary', edge: 'bottom' });
  });

  it('detects boundary near left edge', () => {
    const result = classifyClickLocation(-50, 0, w, h, null, null, 5);
    expect(result).toEqual({ type: 'boundary', edge: 'left' });
  });

  it('detects boundary near right edge', () => {
    const result = classifyClickLocation(50, 0, w, h, null, null, 5);
    expect(result).toEqual({ type: 'boundary', edge: 'right' });
  });

  it('detects open space outside panel', () => {
    const result = classifyClickLocation(200, 200, w, h, null, null, 5);
    expect(result).toEqual({ type: 'open-space' });
  });

  it('detects restricted space inside panel with no safe space', () => {
    // Point at center, no safe space → restricted
    const result = classifyClickLocation(0, 0, w, h, null, null, 1);
    expect(result).toEqual({ type: 'restricted' });
  });

  it('detects safe space when point is inside safe region', () => {
    // A simple safe space region that covers the center
    const outline = [
      { x: -30, y: -20 },
      { x: 30, y: -20 },
      { x: 30, y: 20 },
      { x: -30, y: 20 },
    ];
    const safeSpace = {
      outline,
      exclusions: [] as PathPoint[][],
      reserved: [],
      resultPaths: [outline],
    };
    const result = classifyClickLocation(0, 0, w, h, safeSpace, null, 1);
    expect(result).toEqual({ type: 'safe-space' });
  });
});

// ── screenToSvgCoords ────────────────────────────────────────────────────────

describe('screenToSvgCoords', () => {
  it('identity case: 1:1 mapping with no offset', () => {
    const bbox = { left: 0, top: 0, width: 200, height: 200 };
    const vb = { x: 0, y: 0, width: 200, height: 200 };

    // Click at center of screen
    const result = screenToSvgCoords(100, 100, bbox, vb);
    // x maps to 100; y is flipped: -(100/200 * 200 + 0) = -100
    expect(result.x).toBeCloseTo(100);
    expect(result.y).toBeCloseTo(-100);
  });

  it('handles Y-flip correctly', () => {
    const bbox = { left: 0, top: 0, width: 100, height: 100 };
    const vb = { x: 0, y: 0, width: 100, height: 100 };

    // Top of screen (clientY=0) → largest SVG Y (flipped)
    const top = screenToSvgCoords(50, 0, bbox, vb);
    expect(top.y).toBeCloseTo(0);

    // Bottom of screen (clientY=100) → smallest SVG Y
    const bottom = screenToSvgCoords(50, 100, bbox, vb);
    expect(bottom.y).toBeCloseTo(-100);
  });

  it('handles wider aspect ratio with horizontal centering', () => {
    // SVG element is 400x200 (wider), viewBox is 200x200 (square)
    const bbox = { left: 0, top: 0, width: 400, height: 200 };
    const vb = { x: 0, y: 0, width: 200, height: 200 };

    // With xMidYMid meet, render area is 200x200 centered in 400x200
    // offsetX = (400-200)/2 = 100
    // Click at (200, 100) = center of element = center of viewBox
    const center = screenToSvgCoords(200, 100, bbox, vb);
    expect(center.x).toBeCloseTo(100);
    expect(center.y).toBeCloseTo(-100);
  });

  it('handles taller aspect ratio with vertical centering', () => {
    // SVG element is 200x400 (taller), viewBox is 200x200 (square)
    const bbox = { left: 0, top: 0, width: 200, height: 400 };
    const vb = { x: 0, y: 0, width: 200, height: 200 };

    // render area is 200x200 centered in 200x400
    // offsetY = (400-200)/2 = 100
    // Click at (100, 200) = center of element
    const center = screenToSvgCoords(100, 200, bbox, vb);
    expect(center.x).toBeCloseTo(100);
    expect(center.y).toBeCloseTo(-100);
  });
});

// ── svgToEdgeCoords + edgeCoordsToSvg (roundtrip) ───────────────────────────

describe('svgToEdgeCoords + edgeCoordsToSvg', () => {
  const w = 100;
  const h = 80;

  const edges: EdgePosition[] = ['top', 'bottom', 'left', 'right'];

  for (const edge of edges) {
    it(`roundtrips a point on the ${edge} edge`, () => {
      // Pick a point on the edge midpoint
      const halfW = w / 2;
      const halfH = h / 2;
      let svgX: number, svgY: number;
      switch (edge) {
        case 'top':    svgX = 0; svgY = halfH; break;
        case 'bottom': svgX = 0; svgY = -halfH; break;
        case 'left':   svgX = -halfW; svgY = 0; break;
        case 'right':  svgX = halfW; svgY = 0; break;
      }

      const edgeCoords = svgToEdgeCoords(svgX, svgY, edge, w, h);
      expect(edgeCoords).not.toBeNull();

      const back = edgeCoordsToSvg(edgeCoords!.t, edgeCoords!.offset, edge, w, h);
      expect(back).not.toBeNull();
      expect(back!.x).toBeCloseTo(svgX);
      expect(back!.y).toBeCloseTo(svgY);
    });
  }

  it('edge midpoint gives t=0.5, offset=0 for top', () => {
    const ec = svgToEdgeCoords(0, 40, 'top', w, h);
    expect(ec).not.toBeNull();
    expect(ec!.t).toBeCloseTo(0.5);
    expect(ec!.offset).toBeCloseTo(0);
  });

  it('point beyond edge gives positive offset for top', () => {
    const ec = svgToEdgeCoords(0, 50, 'top', w, h);
    expect(ec).not.toBeNull();
    expect(ec!.offset).toBeGreaterThan(0);
  });

  it('roundtrips an offset point on the bottom edge', () => {
    const t = 0.3;
    const offset = 7;
    const svg = edgeCoordsToSvg(t, offset, 'bottom', w, h);
    expect(svg).not.toBeNull();
    const back = svgToEdgeCoords(svg!.x, svg!.y, 'bottom', w, h);
    expect(back).not.toBeNull();
    expect(back!.t).toBeCloseTo(t);
    expect(back!.offset).toBeCloseTo(offset);
  });
});

// ── findEdgeAtPoint ──────────────────────────────────────────────────────────

describe('findEdgeAtPoint', () => {
  const segments: Record<EdgePosition, { start: PathPoint; end: PathPoint }[]> = {
    top: [{ start: { x: -50, y: 40 }, end: { x: 50, y: 40 } }],
    bottom: [{ start: { x: -50, y: -40 }, end: { x: 50, y: -40 } }],
    left: [{ start: { x: -50, y: -40 }, end: { x: -50, y: 40 } }],
    right: [{ start: { x: 50, y: -40 }, end: { x: 50, y: 40 } }],
  };

  it('finds the top edge for a point on it', () => {
    expect(findEdgeAtPoint(0, 40, segments, 5)).toBe('top');
  });

  it('finds the left edge for a point near it', () => {
    expect(findEdgeAtPoint(-48, 0, segments, 5)).toBe('left');
  });

  it('returns null for a point far from edges', () => {
    expect(findEdgeAtPoint(0, 0, segments, 5)).toBeNull();
  });
});

// ── findCornerAtPoint ────────────────────────────────────────────────────────

describe('findCornerAtPoint', () => {
  const corners = [
    { eligible: true, position: { x: 50, y: 40 }, id: 'tr' },
    { eligible: false, position: { x: -50, y: 40 }, id: 'tl' },
    { eligible: true, position: { x: -50, y: -40 }, id: 'bl' },
  ];

  it('finds an eligible corner within hit distance', () => {
    const result = findCornerAtPoint(49, 39, corners, 5);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('tr');
  });

  it('skips ineligible corners', () => {
    const result = findCornerAtPoint(-50, 40, corners, 5);
    expect(result).toBeNull();
  });

  it('returns null when no corner is close', () => {
    const result = findCornerAtPoint(0, 0, corners, 5);
    expect(result).toBeNull();
  });
});

// ── computeHitThreshold ──────────────────────────────────────────────────────

describe('computeHitThreshold', () => {
  it('returns minimum for small viewBox (edge)', () => {
    expect(computeHitThreshold(50, 'edge')).toBe(4);
  });

  it('scales proportionally for large viewBox (edge)', () => {
    expect(computeHitThreshold(500, 'edge')).toBe(10);
  });

  it('returns minimum for small viewBox (corner)', () => {
    expect(computeHitThreshold(50, 'corner')).toBe(10);
  });

  it('scales for large viewBox (corner)', () => {
    expect(computeHitThreshold(400, 'corner')).toBe(20);
  });

  it('returns minimum for merge', () => {
    expect(computeHitThreshold(100, 'merge')).toBe(8);
  });

  it('boundary is double the merge-base', () => {
    const merge = computeHitThreshold(500, 'merge');
    const boundary = computeHitThreshold(500, 'boundary');
    expect(boundary).toBe(merge * 2);
  });
});
