/**
 * Editable Areas Tests
 *
 * Tests for calculating safe zones where cutouts can be added
 */

import { describe, it, expect } from 'vitest';
import { getEditableAreas, EditableArea } from '../../../src/utils/editableAreas';
import { PanelPath, BoxConfig, FaceConfig, defaultAssemblyConfig } from '../../../src/types';

// =============================================================================
// Test Helpers
// =============================================================================

const createBasicConfig = (): BoxConfig => ({
  width: 100,
  height: 100,
  depth: 100,
  materialThickness: 3,
  fingerWidth: 10,
  fingerGap: 1.5,
  assembly: defaultAssemblyConfig,
});

const createAllSolidFaces = (): FaceConfig[] => [
  { id: 'front', solid: true },
  { id: 'back', solid: true },
  { id: 'left', solid: true },
  { id: 'right', solid: true },
  { id: 'top', solid: true },
  { id: 'bottom', solid: true },
];

/**
 * Create a simple rectangular panel outline
 */
const createRectOutline = (width: number, height: number) => {
  const halfW = width / 2;
  const halfH = height / 2;
  return {
    points: [
      { x: -halfW, y: halfH },  // topLeft
      { x: halfW, y: halfH },   // topRight
      { x: halfW, y: -halfH },  // bottomRight
      { x: -halfW, y: -halfH }, // bottomLeft
    ],
  };
};

/**
 * Create a panel with top extension (L-shaped at corners if notched)
 */
const createExtendedTopPanel = (
  baseWidth: number,
  baseHeight: number,
  extension: number,
  notchLeft: number = 0,
  notchRight: number = 0
) => {
  const halfW = baseWidth / 2;
  const halfH = baseHeight / 2;

  // Build outline clockwise from top-left
  const points: { x: number; y: number }[] = [];

  // Top-left corner (potentially notched)
  if (notchLeft > 0) {
    // L-shape: main body corner, then notch step, then extension corner
    points.push({ x: -halfW, y: halfH });            // Main body corner
    points.push({ x: -halfW + notchLeft, y: halfH }); // Step in
    points.push({ x: -halfW + notchLeft, y: halfH + extension }); // Extension corner
  } else {
    points.push({ x: -halfW, y: halfH + extension }); // Full width extension
  }

  // Top-right corner (potentially notched)
  if (notchRight > 0) {
    points.push({ x: halfW - notchRight, y: halfH + extension });
    points.push({ x: halfW - notchRight, y: halfH });
    points.push({ x: halfW, y: halfH });
  } else {
    points.push({ x: halfW, y: halfH + extension });
  }

  // Bottom-right and bottom-left (no extensions)
  points.push({ x: halfW, y: -halfH });
  points.push({ x: -halfW, y: -halfH });

  return { points };
};

const createMockPanel = (
  faceId: string,
  width: number,
  height: number,
  outline: { points: { x: number; y: number }[] },
  edgeExtensions?: { top?: number; bottom?: number; left?: number; right?: number }
): PanelPath => ({
  id: `face-${faceId}`,
  width,
  height,
  outline,
  holes: [],
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  source: { type: 'face', faceId: faceId as any },
  edgeExtensions,
});

// =============================================================================
// Tests
// =============================================================================

describe('Editable Areas', () => {
  describe('Basic Panel (No Extensions)', () => {
    it('creates main safe zone with margins for all solid faces', () => {
      const config = createBasicConfig();
      const faces = createAllSolidFaces();
      const mt = config.materialThickness;

      // Front face: 100x100 panel (depth x height)
      const panel = createMockPanel(
        'front',
        config.depth, // width = depth for front face
        config.height,
        createRectOutline(config.depth, config.height)
      );

      const areas = getEditableAreas(panel, faces, config);

      // Should have exactly one area (main safe zone)
      expect(areas.length).toBe(1);

      const mainArea = areas[0];
      // Main area should be inset by materialThickness on all sides
      expect(mainArea.x).toBeCloseTo(-config.depth / 2 + mt, 0.1);
      expect(mainArea.y).toBeCloseTo(-config.height / 2 + mt, 0.1);
      expect(mainArea.width).toBeCloseTo(config.depth - 2 * mt, 0.1);
      expect(mainArea.height).toBeCloseTo(config.height - 2 * mt, 0.1);
    });
  });

  describe('Extension Editable Areas', () => {
    it('extension area uses full width when no notching', () => {
      const config = createBasicConfig();
      const faces = createAllSolidFaces();
      const mt = config.materialThickness;
      const extension = 20;

      // Front face with top extension - no notching (full width)
      const outline = createExtendedTopPanel(
        config.depth,
        config.height,
        extension,
        0, // no left notch
        0  // no right notch
      );

      const panel = createMockPanel(
        'front',
        config.depth,
        config.height + extension, // Total height includes extension
        outline,
        { top: extension, bottom: 0, left: 0, right: 0 }
      );

      const areas = getEditableAreas(panel, faces, config);

      // Should have 2 areas: main safe zone + extension
      expect(areas.length).toBe(2);

      // Find the extension area
      const extArea = areas.find(a => a.label === 'Extended top');
      expect(extArea).toBeDefined();

      // Extension should use FULL width (no margins)
      const halfW = config.depth / 2;
      expect(extArea!.x).toBeCloseTo(-halfW, 0.1);
      expect(extArea!.width).toBeCloseTo(config.depth, 0.1);
      expect(extArea!.height).toBeCloseTo(extension, 0.1);
    });

    it('extension area has margin at notched edge (joint with adjacent extension)', () => {
      const config = createBasicConfig();
      const faces = createAllSolidFaces();
      const mt = config.materialThickness;
      const extension = 20;

      // Front face with top extension - notched on left (loses to left panel)
      // The notched edge has a joint with the adjacent panel's extension
      const outline = createExtendedTopPanel(
        config.depth,
        config.height,
        extension,
        mt, // left notch by material thickness
        0   // no right notch
      );

      const panel = createMockPanel(
        'front',
        config.depth,
        config.height + extension,
        outline,
        { top: extension, bottom: 0, left: 0, right: 0 }
      );

      const areas = getEditableAreas(panel, faces, config);

      // Find the extension area
      const extArea = areas.find(a => a.label === 'Extended top');
      expect(extArea).toBeDefined();

      // Extension X should start at notched position PLUS margin (joint with adjacent)
      // Notch is at -halfW + mt, then add mt for the joint margin
      const halfW = config.depth / 2;
      expect(extArea!.x).toBeCloseTo(-halfW + mt + mt, 0.1); // notch + margin
      // Width should be: full width - notch - margin
      expect(extArea!.width).toBeCloseTo(config.depth - 2 * mt, 0.1);
    });

    it('extension area has margins at both notched edges', () => {
      const config = createBasicConfig();
      const faces = createAllSolidFaces();
      const mt = config.materialThickness;
      const extension = 20;

      // Front face with top extension - notched on both sides
      const outline = createExtendedTopPanel(
        config.depth,
        config.height,
        extension,
        mt, // left notch
        mt  // right notch
      );

      const panel = createMockPanel(
        'front',
        config.depth,
        config.height + extension,
        outline,
        { top: extension, bottom: 0, left: 0, right: 0 }
      );

      const areas = getEditableAreas(panel, faces, config);

      // Find the extension area
      const extArea = areas.find(a => a.label === 'Extended top');
      expect(extArea).toBeDefined();

      // Extension should have notch + margin on both sides
      const halfW = config.depth / 2;
      expect(extArea!.x).toBeCloseTo(-halfW + mt + mt, 0.1); // notch + margin
      // Width: full - 2*notch - 2*margin = full - 4*mt
      expect(extArea!.width).toBeCloseTo(config.depth - 4 * mt, 0.1);
    });

    it('main area is not affected by extension', () => {
      const config = createBasicConfig();
      const faces = createAllSolidFaces();
      const mt = config.materialThickness;
      const extension = 20;

      const outline = createExtendedTopPanel(
        config.depth,
        config.height,
        extension,
        0, 0
      );

      const panel = createMockPanel(
        'front',
        config.depth,
        config.height + extension,
        outline,
        { top: extension, bottom: 0, left: 0, right: 0 }
      );

      const areas = getEditableAreas(panel, faces, config);

      // Find the main area (Safe zone)
      const mainArea = areas.find(a => a.label === 'Safe zone');
      expect(mainArea).toBeDefined();

      // Main area should still have margins on all sides (based on original dimensions)
      const halfW = config.depth / 2;
      const halfH = config.height / 2;
      expect(mainArea!.x).toBeCloseTo(-halfW + mt, 0.1);
      expect(mainArea!.y).toBeCloseTo(-halfH + mt, 0.1);
      expect(mainArea!.width).toBeCloseTo(config.depth - 2 * mt, 0.1);
      expect(mainArea!.height).toBeCloseTo(config.height - 2 * mt, 0.1);
    });
  });

  describe('Open Face Edges', () => {
    it('edge without joints has zero margin', () => {
      const config = createBasicConfig();
      const faces: FaceConfig[] = [
        { id: 'front', solid: true },
        { id: 'back', solid: true },
        { id: 'left', solid: true },
        { id: 'right', solid: true },
        { id: 'top', solid: false }, // Open top
        { id: 'bottom', solid: true },
      ];
      const mt = config.materialThickness;

      // Front face panel - top edge has no joints (top face is open)
      const panel = createMockPanel(
        'front',
        config.depth,
        config.height,
        createRectOutline(config.depth, config.height)
      );

      const areas = getEditableAreas(panel, faces, config);

      // Main area should extend to top edge (no top margin)
      const mainArea = areas.find(a => a.label === 'Safe zone');
      expect(mainArea).toBeDefined();

      const halfW = config.depth / 2;
      const halfH = config.height / 2;

      // Y should extend to top (no margin), but still have margins on other sides
      expect(mainArea!.y).toBeCloseTo(-halfH + mt, 0.1); // Bottom margin
      expect(mainArea!.height).toBeCloseTo(config.height - mt, 0.1); // Only bottom margin subtracted
    });
  });
});
