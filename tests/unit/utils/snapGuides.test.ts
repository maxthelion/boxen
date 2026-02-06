import { describe, it, expect } from 'vitest';
import {
  computeGuideLines,
  computeSnapPoints,
  computeEdgeSegments,
  classifyEdgeSegment,
  findSnapPoint,
  GuideLine,
  SnapPoint,
  EdgeSegment,
} from '../../../src/utils/snapGuides';

describe('computeGuideLines', () => {
  it('should always include center lines', () => {
    // Simple rectangle outline (no finger joints)
    const outline = [
      { x: -50, y: -40 },
      { x: 50, y: -40 },
      { x: 50, y: 40 },
      { x: -50, y: 40 },
    ];

    const guides = computeGuideLines(100, 80, outline);

    const centerH = guides.find(g => g.orientation === 'horizontal' && g.position === 0);
    const centerV = guides.find(g => g.orientation === 'vertical' && g.position === 0);
    expect(centerH).toBeDefined();
    expect(centerH!.type).toBe('center');
    expect(centerV).toBeDefined();
    expect(centerV!.type).toBe('center');
  });

  it('should include edge lines at panel boundaries', () => {
    const outline = [
      { x: -50, y: -40 },
      { x: 50, y: -40 },
      { x: 50, y: 40 },
      { x: -50, y: 40 },
    ];

    const guides = computeGuideLines(100, 80, outline);

    // Should have edge lines at y=±40 and x=±50
    const edgeTop = guides.find(g => g.orientation === 'horizontal' && g.position === 40);
    const edgeBottom = guides.find(g => g.orientation === 'horizontal' && g.position === -40);
    const edgeRight = guides.find(g => g.orientation === 'vertical' && g.position === 50);
    const edgeLeft = guides.find(g => g.orientation === 'vertical' && g.position === -50);

    expect(edgeTop).toBeDefined();
    expect(edgeTop!.type).toBe('edge');
    expect(edgeBottom).toBeDefined();
    expect(edgeRight).toBeDefined();
    expect(edgeLeft).toBeDefined();
  });

  it('should include finger joint tip positions as edge lines', () => {
    // Simulate a panel with finger joints on the top edge
    // Top edge has segments at y=40 (body) and y=43 (finger tips, MT=3)
    const outline = [
      { x: -50, y: -40 },
      { x: 50, y: -40 },
      { x: 50, y: 40 },
      // Finger joints on top: alternating between y=40 and y=43
      { x: 30, y: 40 },
      { x: 30, y: 43 },
      { x: 10, y: 43 },
      { x: 10, y: 40 },
      { x: -10, y: 40 },
      { x: -10, y: 43 },
      { x: -30, y: 43 },
      { x: -30, y: 40 },
      { x: -50, y: 40 },
    ];

    const guides = computeGuideLines(100, 80, outline);

    // Should have edge lines at both y=40 (body) and y=43 (finger tips)
    const bodyEdge = guides.find(g => g.orientation === 'horizontal' && g.position === 40);
    const fingerTipEdge = guides.find(g => g.orientation === 'horizontal' && g.position === 43);
    expect(bodyEdge).toBeDefined();
    expect(fingerTipEdge).toBeDefined();
  });
});

describe('computeSnapPoints', () => {
  it('should return all unique vertices from a simple rectangle', () => {
    const outline = [
      { x: -50, y: -40 },
      { x: 50, y: -40 },
      { x: 50, y: 40 },
      { x: -50, y: 40 },
    ];

    const points = computeSnapPoints(outline);
    expect(points).toHaveLength(4);
    expect(points).toContainEqual({ x: -50, y: -40 });
    expect(points).toContainEqual({ x: 50, y: -40 });
    expect(points).toContainEqual({ x: 50, y: 40 });
    expect(points).toContainEqual({ x: -50, y: 40 });
  });

  it('should deduplicate points at the same position', () => {
    const outline = [
      { x: -50, y: -40 },
      { x: 50, y: -40 },
      { x: 50, y: -40 }, // Duplicate
      { x: 50, y: 40 },
    ];

    const points = computeSnapPoints(outline);
    expect(points).toHaveLength(3);
  });

  it('should include all finger joint vertices', () => {
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

    const points = computeSnapPoints(outline);
    // 8 unique points
    expect(points).toHaveLength(8);
    expect(points).toContainEqual({ x: 30, y: 43 });
    expect(points).toContainEqual({ x: 10, y: 43 });
  });
});

describe('computeEdgeSegments', () => {
  it('should return boundary segments for a simple rectangle', () => {
    const outline = [
      { x: -50, y: -40 },
      { x: 50, y: -40 },
      { x: 50, y: 40 },
      { x: -50, y: 40 },
    ];

    const segments = computeEdgeSegments(outline, 100, 80);
    // All 4 edges should be boundary segments
    expect(segments).toHaveLength(4);
  });

  it('should include finger joint segments near the boundary', () => {
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

    const segments = computeEdgeSegments(outline, 100, 80);
    // Bottom edge (1 segment), right edge (1 segment),
    // top edge with joints: segments at y=40 and y=43 (near boundary)
    // plus left edge
    expect(segments.length).toBeGreaterThan(4);
  });

  it('should not include interior segments far from boundary', () => {
    // A panel with a midpoint inside — should not be an edge segment
    const outline = [
      { x: -50, y: -40 },
      { x: 0, y: 0 },      // Interior point
      { x: 50, y: -40 },
      { x: 50, y: 40 },
      { x: -50, y: 40 },
    ];

    const segments = computeEdgeSegments(outline, 100, 80);
    // Segments from (0,0) should not be boundary segments
    const interiorSegments = segments.filter(s =>
      (s.start.x === 0 && s.start.y === 0) || (s.end.x === 0 && s.end.y === 0)
    );
    expect(interiorSegments).toHaveLength(0);
  });
});

describe('classifyEdgeSegment', () => {
  it('should classify top edge segments', () => {
    const seg: EdgeSegment = {
      start: { x: -50, y: 40 },
      end: { x: 50, y: 40 },
      index: 0,
    };
    expect(classifyEdgeSegment(seg, 100, 80)).toBe('top');
  });

  it('should classify bottom edge segments', () => {
    const seg: EdgeSegment = {
      start: { x: -50, y: -40 },
      end: { x: 50, y: -40 },
      index: 0,
    };
    expect(classifyEdgeSegment(seg, 100, 80)).toBe('bottom');
  });

  it('should classify left edge segments', () => {
    const seg: EdgeSegment = {
      start: { x: -50, y: -40 },
      end: { x: -50, y: 40 },
      index: 0,
    };
    expect(classifyEdgeSegment(seg, 100, 80)).toBe('left');
  });

  it('should classify right edge segments', () => {
    const seg: EdgeSegment = {
      start: { x: 50, y: -40 },
      end: { x: 50, y: 40 },
      index: 0,
    };
    expect(classifyEdgeSegment(seg, 100, 80)).toBe('right');
  });

  it('should return null for interior segments', () => {
    const seg: EdgeSegment = {
      start: { x: 0, y: 0 },
      end: { x: 10, y: 10 },
      index: 0,
    };
    expect(classifyEdgeSegment(seg, 100, 80)).toBeNull();
  });
});

describe('findSnapPoint', () => {
  const guides: GuideLine[] = [
    { orientation: 'horizontal', position: 0, type: 'center' },
    { orientation: 'vertical', position: 0, type: 'center' },
    { orientation: 'horizontal', position: 40, type: 'edge' },
    { orientation: 'vertical', position: 50, type: 'edge' },
  ];

  it('should snap to intersection of two guide lines', () => {
    // Cursor near the center (0,0)
    const result = findSnapPoint(2, 3, guides, 10);
    expect(result).not.toBeNull();
    expect(result!.point.x).toBe(0);
    expect(result!.point.y).toBe(0);
    expect(result!.type).toBe('intersection');
    expect(result!.guides).toHaveLength(2);
  });

  it('should snap to single guide line when not near intersection', () => {
    // Cursor near horizontal center line but far from vertical
    const result = findSnapPoint(25, 2, guides, 5);
    expect(result).not.toBeNull();
    expect(result!.point.x).toBe(25); // X unchanged
    expect(result!.point.y).toBe(0);  // Y snapped
    expect(result!.type).toBe('guide-line');
    expect(result!.guides).toHaveLength(1);
    expect(result!.guides[0].orientation).toBe('horizontal');
  });

  it('should return null when cursor is far from all guides', () => {
    const result = findSnapPoint(25, 20, guides, 5);
    expect(result).toBeNull();
  });

  it('should prefer intersection snap over single-axis snap', () => {
    // Cursor near the corner intersection at (50, 40)
    const result = findSnapPoint(48, 38, guides, 10);
    expect(result).not.toBeNull();
    expect(result!.point.x).toBe(50);
    expect(result!.point.y).toBe(40);
    expect(result!.type).toBe('intersection');
    expect(result!.guides).toHaveLength(2);
  });

  it('should return closest snap when multiple options exist', () => {
    // Cursor at (1, 39) - closer to horizontal edge at y=40 than center at y=0
    const result = findSnapPoint(1, 39, guides, 5);
    expect(result).not.toBeNull();
    // Should snap to intersection at (0, 40) since it's closest
    expect(result!.point.x).toBe(0);
    expect(result!.point.y).toBe(40);
  });

  describe('point snapping', () => {
    const snapPoints: SnapPoint[] = [
      { x: -50, y: -40 },
      { x: 50, y: -40 },
      { x: 50, y: 40 },
      { x: -50, y: 40 },
      { x: 30, y: 43 },  // Finger joint corner
    ];

    it('should snap to nearest outline vertex', () => {
      const result = findSnapPoint(29, 42, guides, 10, snapPoints);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('point');
      expect(result!.point.x).toBe(30);
      expect(result!.point.y).toBe(43);
    });

    it('should prefer point snap over intersection snap', () => {
      // Cursor near both the intersection at (50, 40) and the point at (50, 40)
      const result = findSnapPoint(49, 39, guides, 10, snapPoints);
      expect(result).not.toBeNull();
      // Point snap should win since (50, 40) is both an intersection and a point
      expect(result!.type).toBe('point');
      expect(result!.point.x).toBe(50);
      expect(result!.point.y).toBe(40);
    });

    it('should prefer point snap over guide-line snap', () => {
      // Cursor near the point at (30, 43) and the guide line at y=40
      const result = findSnapPoint(31, 42, guides, 5, snapPoints);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('point');
      expect(result!.point.x).toBe(30);
      expect(result!.point.y).toBe(43);
    });

    it('should fall back to intersection when no point is near', () => {
      // Cursor near (0, 0) intersection, far from all snap points
      const result = findSnapPoint(1, 1, guides, 5, snapPoints);
      expect(result).not.toBeNull();
      expect(result!.type).toBe('intersection');
    });

    it('should return empty guides array for point snaps', () => {
      const result = findSnapPoint(29, 42, guides, 10, snapPoints);
      expect(result).not.toBeNull();
      expect(result!.guides).toHaveLength(0);
    });
  });

  describe('edge segment snapping', () => {
    const edgeSegments: EdgeSegment[] = [
      { start: { x: -50, y: -40 }, end: { x: 50, y: -40 }, index: 0 },   // bottom
      { start: { x: 50, y: -40 }, end: { x: 50, y: 40 }, index: 1 },     // right
      { start: { x: 50, y: 40 }, end: { x: -50, y: 40 }, index: 2 },     // top
      { start: { x: -50, y: 40 }, end: { x: -50, y: -40 }, index: 3 },   // left
    ];

    it('should snap to nearest point on edge segment', () => {
      // Cursor near the top edge at x=20 (between vertices)
      const result = findSnapPoint(
        20, 38, [], 5, // Empty guides — only edge segments
        undefined, edgeSegments, 100, 80,
      );
      expect(result).not.toBeNull();
      expect(result!.type).toBe('edge');
      expect(result!.point.y).toBe(40); // Snapped to the top edge
      expect(result!.point.x).toBe(20); // Nearest point on segment preserves X
    });

    it('should include edgePosition in result', () => {
      const result = findSnapPoint(
        20, 38, [], 5,
        undefined, edgeSegments, 100, 80,
      );
      expect(result).not.toBeNull();
      expect(result!.edgePosition).toBe('top');
    });

    it('should include edgeSegment in result', () => {
      const result = findSnapPoint(
        20, 38, [], 5,
        undefined, edgeSegments, 100, 80,
      );
      expect(result).not.toBeNull();
      expect(result!.edgeSegment).toBeDefined();
      expect(result!.edgeSegment!.start).toEqual({ x: 50, y: 40 });
    });

    it('should prefer intersection over edge when both within threshold', () => {
      // Cursor near intersection at (50, 40) and also near right/top edge segments
      const result = findSnapPoint(
        49, 39, guides, 5,
        undefined, edgeSegments, 100, 80,
      );
      expect(result).not.toBeNull();
      expect(result!.type).toBe('intersection');
    });

    it('should prefer edge over guide-line when no intersection is near', () => {
      // Cursor near the top edge at x=25 (no intersection nearby)
      // but also near the horizontal guide line at y=40
      const result = findSnapPoint(
        25, 38, guides, 3,
        undefined, edgeSegments, 100, 80,
      );
      expect(result).not.toBeNull();
      // Edge should win over guide-line since edge snapping has higher priority
      expect(result!.type).toBe('edge');
    });

    it('should snap to right edge segment', () => {
      const result = findSnapPoint(
        48, 10, [], 5,
        undefined, edgeSegments, 100, 80,
      );
      expect(result).not.toBeNull();
      expect(result!.type).toBe('edge');
      expect(result!.edgePosition).toBe('right');
      expect(result!.point.x).toBe(50);
      expect(result!.point.y).toBe(10);
    });

    it('should return null when cursor is far from all edges', () => {
      const result = findSnapPoint(
        0, 0, [], 5,
        undefined, edgeSegments, 100, 80,
      );
      expect(result).toBeNull();
    });
  });

  describe('snap priority: point > intersection > edge > guide-line', () => {
    const snapPoints: SnapPoint[] = [
      { x: 50, y: 40 },
    ];
    const edgeSegments: EdgeSegment[] = [
      { start: { x: 50, y: 40 }, end: { x: -50, y: 40 }, index: 0 },
    ];

    it('point beats intersection at same location', () => {
      const result = findSnapPoint(
        49, 39, guides, 5,
        snapPoints, edgeSegments, 100, 80,
      );
      expect(result).not.toBeNull();
      expect(result!.type).toBe('point');
    });

    it('intersection beats edge when point is out of range', () => {
      const farPoints: SnapPoint[] = [{ x: -50, y: -40 }];
      const result = findSnapPoint(
        49, 39, guides, 5,
        farPoints, edgeSegments, 100, 80,
      );
      expect(result).not.toBeNull();
      expect(result!.type).toBe('intersection');
    });

    it('edge beats guide-line when no intersection and no point nearby', () => {
      const farPoints: SnapPoint[] = [{ x: -50, y: -40 }];
      // Cursor near top edge at x=20 — no intersection within threshold
      const result = findSnapPoint(
        20, 39, guides, 2,
        farPoints, edgeSegments, 100, 80,
      );
      expect(result).not.toBeNull();
      expect(result!.type).toBe('edge');
    });
  });
});
