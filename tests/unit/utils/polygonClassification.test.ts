/**
 * Tests for polygon classification and edge extraction utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  isPointInPolygon,
  classifyPolygon,
  extractAffectedEdges,
  extractEdgePathFromPolygon,
  createRectPolygon,
  unionPolygons,
  differencePolygons,
} from '../../../src/utils/polygonBoolean';

describe('isPointInPolygon', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  it('returns true for point inside', () => {
    expect(isPointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(isPointInPolygon({ x: 1, y: 1 }, square)).toBe(true);
    expect(isPointInPolygon({ x: 9, y: 9 }, square)).toBe(true);
  });

  it('returns false for point outside', () => {
    expect(isPointInPolygon({ x: -1, y: 5 }, square)).toBe(false);
    expect(isPointInPolygon({ x: 11, y: 5 }, square)).toBe(false);
    expect(isPointInPolygon({ x: 5, y: -1 }, square)).toBe(false);
    expect(isPointInPolygon({ x: 5, y: 11 }, square)).toBe(false);
  });
});

describe('classifyPolygon', () => {
  const panelOutline = createRectPolygon(0, 0, 100, 80);

  it('classifies interior polygon correctly', () => {
    // Small rectangle entirely inside
    const interior = createRectPolygon(20, 20, 40, 40);
    expect(classifyPolygon(interior, panelOutline)).toBe('interior');
  });

  it('classifies boundary-crossing polygon correctly', () => {
    // Rectangle that extends beyond the top edge
    const boundary = createRectPolygon(30, 60, 70, 100);
    expect(classifyPolygon(boundary, panelOutline)).toBe('boundary');
  });

  it('classifies exterior polygon correctly', () => {
    // Rectangle entirely outside
    const exterior = createRectPolygon(110, 10, 130, 30);
    expect(classifyPolygon(exterior, panelOutline)).toBe('exterior');
  });

  it('classifies polygon crossing bottom edge as boundary', () => {
    const crossingBottom = createRectPolygon(30, -20, 70, 20);
    expect(classifyPolygon(crossingBottom, panelOutline)).toBe('boundary');
  });

  it('classifies polygon crossing left edge as boundary', () => {
    const crossingLeft = createRectPolygon(-20, 30, 20, 50);
    expect(classifyPolygon(crossingLeft, panelOutline)).toBe('boundary');
  });
});

describe('extractAffectedEdges', () => {
  const panelWidth = 100;
  const panelHeight = 80;
  const baseRect = createRectPolygon(0, 0, panelWidth, panelHeight);

  it('detects top edge modification from union', () => {
    // Triangle extending from top edge
    const triangle = [
      { x: 30, y: 80 },
      { x: 70, y: 80 },
      { x: 50, y: 100 },
    ];

    const result = unionPolygons(baseRect, triangle);
    expect(result).not.toBeNull();

    const affected = extractAffectedEdges(result!, panelWidth, panelHeight);
    expect(affected.has('top')).toBe(true);

    const topPath = affected.get('top')!;
    expect(topPath.length).toBeGreaterThan(2);

    // Should have points with positive offset at the peak
    const hasPositiveOffset = topPath.some(p => p.offset > 0);
    expect(hasPositiveOffset).toBe(true);
  });

  it('detects bottom edge modification from difference', () => {
    // Notch cut from bottom
    const notch = createRectPolygon(40, -10, 60, 10);

    const result = differencePolygons(baseRect, notch);
    expect(result).not.toBeNull();

    const affected = extractAffectedEdges(result!, panelWidth, panelHeight);
    expect(affected.has('bottom')).toBe(true);
  });
});

describe('extractEdgePathFromPolygon', () => {
  it('extracts simple top edge extension', () => {
    // Manually create a polygon with a bump on top
    const polygon = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 80 },
      { x: 70, y: 80 },
      { x: 50, y: 100 }, // Peak of bump
      { x: 30, y: 80 },
      { x: 0, y: 80 },
    ];

    const edgePath = extractEdgePathFromPolygon(polygon, 'top', 100, 80);
    expect(edgePath).not.toBeNull();
    expect(edgePath!.length).toBeGreaterThan(0);

    // Find the point with maximum offset (the peak)
    const maxOffset = Math.max(...edgePath!.map(p => p.offset));
    expect(maxOffset).toBe(20); // 100 - 80 = 20mm extension

    // The peak should be around t=0.5
    const peakPoint = edgePath!.find(p => p.offset === maxOffset);
    expect(peakPoint).toBeDefined();
    expect(peakPoint!.t).toBeCloseTo(0.5, 1);
  });

  it('returns null for unmodified edge', () => {
    // Simple rectangle - no modifications
    const rect = createRectPolygon(0, 0, 100, 80);

    const topPath = extractEdgePathFromPolygon(rect, 'top', 100, 80);
    expect(topPath).toBeNull(); // No modification detected
  });
});
