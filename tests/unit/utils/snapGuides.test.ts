import { describe, it, expect } from 'vitest';
import { computeGuideLines, findSnapPoint, GuideLine } from '../../../src/utils/snapGuides';

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
    expect(result!.guides).toHaveLength(2);
  });

  it('should snap to single guide line when not near intersection', () => {
    // Cursor near horizontal center line but far from vertical
    const result = findSnapPoint(25, 2, guides, 5);
    expect(result).not.toBeNull();
    expect(result!.point.x).toBe(25); // X unchanged
    expect(result!.point.y).toBe(0);  // Y snapped
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
});
