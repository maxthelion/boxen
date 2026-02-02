/**
 * Safe Space Calculation Tests
 *
 * Tests for calculating safe zones where cutouts can be added,
 * including edge joint margins and slot hole exclusions.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateSafeSpace,
  isPointInSafeSpace,
  isRectInSafeSpace,
  getReservedReason,
  analyzePath,
  getEdgeMarginsForFace,
  rectToEdgePath,
  circleToEdgePath,
  SafeSpaceRegion,
  PathAnalysis,
} from '../../../src/engine/safeSpace';
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

const createRectOutline = (width: number, height: number) => {
  const halfW = width / 2;
  const halfH = height / 2;
  return {
    points: [
      { x: -halfW, y: halfH },
      { x: halfW, y: halfH },
      { x: halfW, y: -halfH },
      { x: -halfW, y: -halfH },
    ],
    closed: true,
  };
};

const createMockPanel = (
  faceId: string,
  width: number,
  height: number,
  holes: PanelPath['holes'] = [],
  edgeExtensions?: { top?: number; bottom?: number; left?: number; right?: number }
): PanelPath => ({
  id: `face-${faceId}`,
  width,
  height,
  thickness: 3,
  outline: createRectOutline(width, height),
  holes,
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  source: { type: 'face', faceId: faceId as any },
  edgeExtensions: edgeExtensions ?? { top: 0, bottom: 0, left: 0, right: 0 },
  visible: true,
});

const createDividerPanel = (
  width: number,
  height: number,
  holes: PanelPath['holes'] = []
): PanelPath => ({
  id: 'divider-test',
  width,
  height,
  thickness: 3,
  outline: createRectOutline(width, height),
  holes,
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  source: { type: 'divider', subdivisionId: 'test-void', axis: 'x', position: 50 },
  edgeExtensions: { top: 0, bottom: 0, left: 0, right: 0 },
  visible: true,
});

const createSlotHole = (
  x: number,
  y: number,
  width: number,
  height: number,
  id: string = 'slot-1'
): PanelPath['holes'][0] => ({
  id,
  type: 'slot',
  path: {
    points: [
      { x: x - width / 2, y: y + height / 2 },
      { x: x + width / 2, y: y + height / 2 },
      { x: x + width / 2, y: y - height / 2 },
      { x: x - width / 2, y: y - height / 2 },
    ],
    closed: true,
  },
  source: {
    type: 'divider-slot',
    sourceId: 'divider-1',
  },
});

// =============================================================================
// Tests
// =============================================================================

describe('Safe Space Calculation', () => {
  describe('Edge Joint Margins', () => {
    it('creates safe space with full panel outline and joint exclusions', () => {
      const config = createBasicConfig();
      const faces = createAllSolidFaces();
      const mt = config.materialThickness;

      // Front face: 100x100 panel (depth x height)
      const panel = createMockPanel('front', config.depth, config.height);

      const safeSpace = calculateSafeSpace(panel, faces, config);

      // Outline covers the full panel (no extensions, so matches body)
      expect(safeSpace.outline.length).toBe(4);

      // Check the outline bounds - should be full panel (no inset)
      const minX = Math.min(...safeSpace.outline.map(p => p.x));
      const maxX = Math.max(...safeSpace.outline.map(p => p.x));
      const minY = Math.min(...safeSpace.outline.map(p => p.y));
      const maxY = Math.max(...safeSpace.outline.map(p => p.y));

      expect(minX).toBeCloseTo(-config.depth / 2, 0.1);
      expect(maxX).toBeCloseTo(config.depth / 2, 0.1);
      expect(minY).toBeCloseTo(-config.height / 2, 0.1);
      expect(maxY).toBeCloseTo(config.height / 2, 0.1);

      // Should have 4 joint exclusions (one for each edge) + 4 reserved regions for UI
      expect(safeSpace.exclusions.length).toBe(4);
      const jointEdges = safeSpace.reserved.filter(r => r.type === 'joint-edge');
      expect(jointEdges.length).toBe(4);
    });

    it('has no margin on open edge', () => {
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
      const panel = createMockPanel('front', config.depth, config.height);

      const safeSpace = calculateSafeSpace(panel, faces, config);

      // Check top edge extends to panel edge (no margin)
      const maxY = Math.max(...safeSpace.outline.map(p => p.y));
      expect(maxY).toBeCloseTo(config.height / 2, 0.1); // No margin on top

      // Should have only 3 reserved edge regions (top edge is open)
      const jointEdges = safeSpace.reserved.filter(r => r.type === 'joint-edge');
      expect(jointEdges.length).toBe(3);
    });

    it('divider panels have exclusions on all edges', () => {
      const config = createBasicConfig();
      const faces = createAllSolidFaces();

      const panel = createDividerPanel(94, 94); // Typical divider size

      const safeSpace = calculateSafeSpace(panel, faces, config);

      // All edges should have joint exclusions and reserved regions
      expect(safeSpace.exclusions.length).toBe(4);
      const jointEdges = safeSpace.reserved.filter(r => r.type === 'joint-edge');
      expect(jointEdges.length).toBe(4);

      // Outline should be full panel (no inset)
      const minX = Math.min(...safeSpace.outline.map(p => p.x));
      const maxX = Math.max(...safeSpace.outline.map(p => p.x));
      const minY = Math.min(...safeSpace.outline.map(p => p.y));
      const maxY = Math.max(...safeSpace.outline.map(p => p.y));

      expect(minX).toBeCloseTo(-94 / 2, 0.1);
      expect(maxX).toBeCloseTo(94 / 2, 0.1);
      expect(minY).toBeCloseTo(-94 / 2, 0.1);
      expect(maxY).toBeCloseTo(94 / 2, 0.1);
    });
  });

  describe('Slot Exclusions', () => {
    it('includes slot holes as exclusions alongside joint exclusions', () => {
      const config = createBasicConfig();
      const faces = createAllSolidFaces();
      const mt = config.materialThickness;

      // Panel with a slot hole in the center
      const slotHole = createSlotHole(0, 0, 10, 3);
      const panel = createMockPanel('front', config.depth, config.height, [slotHole]);

      const safeSpace = calculateSafeSpace(panel, faces, config);

      // Should have 4 joint exclusions + 1 slot exclusion = 5 total
      expect(safeSpace.exclusions.length).toBe(5);

      // Find the slot exclusion (the one centered at origin, not at edges)
      const slotExclusion = safeSpace.exclusions.find(exc => {
        const centerX = exc.reduce((sum, p) => sum + p.x, 0) / exc.length;
        const centerY = exc.reduce((sum, p) => sum + p.y, 0) / exc.length;
        return Math.abs(centerX) < 10 && Math.abs(centerY) < 10;
      });
      expect(slotExclusion).toBeDefined();

      const exMinX = Math.min(...slotExclusion!.map(p => p.x));
      const exMaxX = Math.max(...slotExclusion!.map(p => p.x));

      // Original slot is 10mm wide centered at 0, so -5 to +5
      // Expanded by MT on each side: -5-3 to +5+3 = -8 to +8
      expect(exMinX).toBeCloseTo(-5 - mt, 0.1);
      expect(exMaxX).toBeCloseTo(5 + mt, 0.1);

      // Should have slot and slot-margin reserved regions
      const slotReserved = safeSpace.reserved.filter(r => r.type === 'slot');
      const slotMarginReserved = safeSpace.reserved.filter(r => r.type === 'slot-margin');
      expect(slotReserved.length).toBe(1);
      expect(slotMarginReserved.length).toBe(1);
    });

    it('handles multiple slot holes', () => {
      const config = createBasicConfig();
      const faces = createAllSolidFaces();

      // Panel with two slot holes
      const slot1 = createSlotHole(-20, 0, 10, 3, 'slot-1');
      const slot2 = createSlotHole(20, 0, 10, 3, 'slot-2');
      const panel = createMockPanel('front', config.depth, config.height, [slot1, slot2]);

      const safeSpace = calculateSafeSpace(panel, faces, config);

      // Should have 4 joint exclusions + 2 slot exclusions = 6 total
      expect(safeSpace.exclusions.length).toBe(6);

      // Should have 2 slot and 2 slot-margin reserved regions
      const slotReserved = safeSpace.reserved.filter(r => r.type === 'slot');
      expect(slotReserved.length).toBe(2);
    });
  });

  describe('Point-in-Safe-Space Tests', () => {
    it('returns true for point in safe area', () => {
      const config = createBasicConfig();
      const faces = createAllSolidFaces();

      const panel = createMockPanel('front', config.depth, config.height);
      const safeSpace = calculateSafeSpace(panel, faces, config);

      // Center point should be in safe space
      expect(isPointInSafeSpace(0, 0, safeSpace)).toBe(true);
    });

    it('returns false for point in edge margin', () => {
      const config = createBasicConfig();
      const faces = createAllSolidFaces();
      const mt = config.materialThickness;

      const panel = createMockPanel('front', config.depth, config.height);
      const safeSpace = calculateSafeSpace(panel, faces, config);

      // Point at very edge (within margin) should not be in safe space
      const edgeX = config.depth / 2 - mt / 2; // Inside the margin
      expect(isPointInSafeSpace(edgeX, 0, safeSpace)).toBe(false);
    });

    it('returns false for point in slot exclusion', () => {
      const config = createBasicConfig();
      const faces = createAllSolidFaces();

      const slotHole = createSlotHole(0, 0, 10, 3);
      const panel = createMockPanel('front', config.depth, config.height, [slotHole]);
      const safeSpace = calculateSafeSpace(panel, faces, config);

      // Point at center (where slot is) should not be in safe space
      expect(isPointInSafeSpace(0, 0, safeSpace)).toBe(false);
    });
  });

  describe('Rectangle-in-Safe-Space Tests', () => {
    it('returns true for rectangle fully in safe area', () => {
      const config = createBasicConfig();
      const faces = createAllSolidFaces();

      const panel = createMockPanel('front', config.depth, config.height);
      const safeSpace = calculateSafeSpace(panel, faces, config);

      // Small rectangle in center should be valid
      expect(isRectInSafeSpace(-5, -5, 10, 10, safeSpace)).toBe(true);
    });

    it('returns false for rectangle overlapping edge margin', () => {
      const config = createBasicConfig();
      const faces = createAllSolidFaces();
      const mt = config.materialThickness;

      const panel = createMockPanel('front', config.depth, config.height);
      const safeSpace = calculateSafeSpace(panel, faces, config);

      // Rectangle extending to panel edge
      const halfW = config.depth / 2;
      expect(isRectInSafeSpace(halfW - 10, -5, 20, 10, safeSpace)).toBe(false);
    });
  });

  describe('Edge Extensions', () => {
    it('should expand safe space when edge is extended (outset)', () => {
      const config = createBasicConfig();
      // Open bottom face so front panel bottom edge has no joints
      const faces: FaceConfig[] = [
        { id: 'front', solid: true },
        { id: 'back', solid: true },
        { id: 'left', solid: true },
        { id: 'right', solid: true },
        { id: 'top', solid: true },
        { id: 'bottom', solid: false }, // Open bottom - no joint on front panel bottom edge
      ];
      const mt = config.materialThickness;

      // Create panel with 15mm bottom edge extension
      const extensionAmount = 15;
      const panel = createMockPanel(
        'front',
        config.depth,
        config.height,
        [],
        { top: 0, bottom: extensionAmount, left: 0, right: 0 }
      );

      const safeSpace = calculateSafeSpace(panel, faces, config);

      // With bottom edge extended by 15mm (and no joint on bottom edge),
      // the safe space should extend 15mm further downward
      const minY = Math.min(...safeSpace.outline.map(p => p.y));
      const expectedMinY = -config.height / 2 - extensionAmount; // Body edge + extension

      // The safe space should include the extended region
      expect(minY).toBeCloseTo(expectedMinY, 0.1);
    });

    it('should expand safe space on extended edge but mark joint areas as exclusions', () => {
      const config = createBasicConfig();
      // Open bottom face so front panel bottom edge has no joints
      const faces: FaceConfig[] = [
        { id: 'front', solid: true },
        { id: 'back', solid: true },
        { id: 'left', solid: true },
        { id: 'right', solid: true },
        { id: 'top', solid: true },
        { id: 'bottom', solid: false }, // Open bottom
      ];
      const mt = config.materialThickness;

      const extensionAmount = 20;
      const panel = createMockPanel(
        'front',
        config.depth,
        config.height,
        [],
        { top: 0, bottom: extensionAmount, left: 0, right: 0 }
      );

      const safeSpace = calculateSafeSpace(panel, faces, config);

      // Outline covers the full panel including extension
      const minX = Math.min(...safeSpace.outline.map(p => p.x));
      const maxX = Math.max(...safeSpace.outline.map(p => p.x));
      const minY = Math.min(...safeSpace.outline.map(p => p.y));
      const maxY = Math.max(...safeSpace.outline.map(p => p.y));

      // Outline extends to panel edges (not inset)
      expect(minX).toBeCloseTo(-config.depth / 2, 0.1);
      expect(maxX).toBeCloseTo(config.depth / 2, 0.1);
      expect(maxY).toBeCloseTo(config.height / 2, 0.1);
      expect(minY).toBeCloseTo(-config.height / 2 - extensionAmount, 0.1);

      // Left/right/top edges have joints - should have 3 joint exclusions
      // (bottom edge is open, no joint exclusion)
      const jointEdges = safeSpace.reserved.filter(r => r.type === 'joint-edge');
      expect(jointEdges.length).toBe(3);

      // Points at panel edges within joint regions should NOT be in safe space
      const rightEdgePoint = config.depth / 2 - mt / 2; // Inside joint region
      expect(isPointInSafeSpace(rightEdgePoint, 0, safeSpace)).toBe(false);

      // Points in the extension area (bottom) SHOULD be in safe space (no joint there)
      const extensionPoint = -config.height / 2 - extensionAmount / 2;
      expect(isPointInSafeSpace(0, extensionPoint, safeSpace)).toBe(true);
    });

    it('extension areas are safe even when edge has joints (joints at body edge)', () => {
      const config = createBasicConfig();
      // All solid faces - all edges have joints
      const faces = createAllSolidFaces();
      const mt = config.materialThickness;

      // With an extension on a jointed edge:
      // - The finger joints are at the BODY edge (not in the extension)
      // - The extension area IS safe for cutouts (e.g., feet can have holes)
      const extensionAmount = 15;
      const panel = createMockPanel(
        'front',
        config.depth,
        config.height,
        [],
        { top: 0, bottom: extensionAmount, left: 0, right: 0 }
      );

      const safeSpace = calculateSafeSpace(panel, faces, config);

      // Outline includes the full extension
      const minY = Math.min(...safeSpace.outline.map(p => p.y));
      expect(minY).toBeCloseTo(-config.height / 2 - extensionAmount, 0.1);

      // Joint exclusion is at the BODY edge (2×MT strip from body edge inward)
      // There should be 4 joint exclusions (all edges have joints)
      expect(safeSpace.exclusions.length).toBe(4);

      // Point in the extension area SHOULD be safe (no joint there)
      const extensionY = -config.height / 2 - extensionAmount / 2;
      expect(isPointInSafeSpace(0, extensionY, safeSpace)).toBe(true);

      // Point at the body edge (in joint region) should NOT be safe
      const bodyEdgeY = -config.height / 2 + mt / 2; // Inside the 2×MT joint margin
      expect(isPointInSafeSpace(0, bodyEdgeY, safeSpace)).toBe(false);
    });

    it('extension smaller than MT has no safe region', () => {
      const config = createBasicConfig();
      const faces = createAllSolidFaces();
      const mt = config.materialThickness; // 3

      // Panel with top extension smaller than MT (2mm < 3mm)
      const extensionAmount = 2;
      const panel = createMockPanel(
        'front',
        config.depth,
        config.height,
        [],
        { top: extensionAmount, bottom: 0, left: 0, right: 0 }
      );

      const safeSpace = calculateSafeSpace(panel, faces, config);

      // Should have only 1 resultPath (body safe region)
      // No extension safe region because extension < MT
      expect(safeSpace.resultPaths.length).toBe(1);

      // The single region should be the body safe area (below body top edge)
      const halfH = config.height / 2;
      const region = safeSpace.resultPaths[0];
      const maxY = Math.max(...region.map(p => p.y));
      expect(maxY).toBeLessThan(halfH); // Below body top edge
    });

    it('extension safe region height is extension minus MT, with margin from body edge', () => {
      const config = createBasicConfig();
      const faces = createAllSolidFaces();
      const mt = config.materialThickness; // 3

      // Panel with top extension of 10 (greater than MT)
      const extensionAmount = 10;
      const panel = createMockPanel(
        'front',
        config.depth,
        config.height,
        [],
        { top: extensionAmount, bottom: 0, left: 0, right: 0 }
      );

      const safeSpace = calculateSafeSpace(panel, faces, config);

      // Should have 2 resultPaths
      expect(safeSpace.resultPaths.length).toBe(2);

      // Find the extension region (above body top edge)
      const halfH = config.height / 2;
      const extRegion = safeSpace.resultPaths.find(path => {
        const minY = Math.min(...path.map(p => p.y));
        return minY >= halfH - 0.1;
      });
      expect(extRegion).toBeDefined();

      // Extension region should:
      // - Start at body top edge + MT margin (y = halfH + MT = 50 + 3 = 53)
      //   (margin needed from body edge where joint is)
      // - End at extension top (y = halfH + extension = 50 + 10 = 60)
      //   (no margin needed at outer edge - it's open)
      // - Height = extension - MT = 10 - 3 = 7
      const extMinY = Math.min(...extRegion!.map(p => p.y));
      const extMaxY = Math.max(...extRegion!.map(p => p.y));
      expect(extMinY).toBeCloseTo(halfH + mt, 0.1);  // Body edge + MT
      expect(extMaxY).toBeCloseTo(halfH + extensionAmount, 0.1);  // Outer edge
    });

    it('resultPaths include separate region for extension area with full panel width', () => {
      const config = createBasicConfig();
      // All solid faces - all edges have joints
      const faces = createAllSolidFaces();
      const mt = config.materialThickness;

      // Panel with top extension of 10
      const extensionAmount = 10;
      const panel = createMockPanel(
        'front',
        config.depth,
        config.height,
        [],
        { top: extensionAmount, bottom: 0, left: 0, right: 0 }
      );

      const safeSpace = calculateSafeSpace(panel, faces, config);

      // Should have 2 resultPaths:
      // 1. Body safe region (center of panel, shrunk by 2×MT margins on all edges)
      // 2. Extension safe region (the top extension area)
      expect(safeSpace.resultPaths.length).toBe(2);

      // Find the body region (contained within body bounds)
      const halfH = config.height / 2;
      const halfW = config.depth / 2;
      const bodyRegion = safeSpace.resultPaths.find(path => {
        const maxY = Math.max(...path.map(p => p.y));
        return maxY < halfH; // Below body top edge
      });
      expect(bodyRegion).toBeDefined();

      // Body region should be shrunk by 2×MT on all sides
      const bodyMinX = Math.min(...bodyRegion!.map(p => p.x));
      const bodyMaxX = Math.max(...bodyRegion!.map(p => p.x));
      const bodyMinY = Math.min(...bodyRegion!.map(p => p.y));
      const bodyMaxY = Math.max(...bodyRegion!.map(p => p.y));
      expect(bodyMinX).toBeCloseTo(-halfW + 2 * mt, 0.1);
      expect(bodyMaxX).toBeCloseTo(halfW - 2 * mt, 0.1);
      expect(bodyMinY).toBeCloseTo(-halfH + 2 * mt, 0.1);
      expect(bodyMaxY).toBeCloseTo(halfH - 2 * mt, 0.1);

      // Find the extension region (above body top edge)
      const extRegion = safeSpace.resultPaths.find(path => {
        const minY = Math.min(...path.map(p => p.y));
        return minY >= halfH - 0.1; // At or above body top edge
      });
      expect(extRegion).toBeDefined();

      // Extension region should:
      // - Start at body edge + MT (margin from joint)
      // - End at extension top (no margin at outer edge)
      const extMinY = Math.min(...extRegion!.map(p => p.y));
      const extMaxY = Math.max(...extRegion!.map(p => p.y));
      expect(extMinY).toBeCloseTo(halfH + mt, 0.1);  // Body edge + MT margin
      expect(extMaxY).toBeCloseTo(halfH + extensionAmount, 0.1);  // Outer edge

      // Extension region should span FULL PANEL WIDTH
      // The extension sits above the body edge joints and has no neighboring extensions,
      // so it can use the full width (not constrained by left/right edge margins)
      const extMinX = Math.min(...extRegion!.map(p => p.x));
      const extMaxX = Math.max(...extRegion!.map(p => p.x));
      expect(extMinX).toBeCloseTo(-halfW, 0.1);
      expect(extMaxX).toBeCloseTo(halfW, 0.1);
    });
  });

  describe('Reserved Region Reasons', () => {
    it('returns reason for point in joint edge', () => {
      const config = createBasicConfig();
      const faces = createAllSolidFaces();

      const panel = createMockPanel('front', config.depth, config.height);
      const safeSpace = calculateSafeSpace(panel, faces, config);

      // Point at panel edge should have a reason
      const edgeX = config.depth / 2 - 1; // Just inside panel edge
      const reason = getReservedReason(edgeX, 0, safeSpace);
      expect(reason).toBe('Reserved for finger joints');
    });

    it('returns reason for point in slot', () => {
      const config = createBasicConfig();
      const faces = createAllSolidFaces();

      const slotHole = createSlotHole(0, 0, 10, 3);
      const panel = createMockPanel('front', config.depth, config.height, [slotHole]);
      const safeSpace = calculateSafeSpace(panel, faces, config);

      // Point at slot center
      const reason = getReservedReason(0, 0, safeSpace);
      expect(reason).toBe('Slot for divider panel connection');
    });

    it('returns null for point in safe area', () => {
      const config = createBasicConfig();
      const faces = createAllSolidFaces();

      const panel = createMockPanel('front', config.depth, config.height);
      const safeSpace = calculateSafeSpace(panel, faces, config);

      // Point well inside safe area should have no reason
      const reason = getReservedReason(0, 0, safeSpace);
      expect(reason).toBe(null);
    });
  });

  describe('Path Analysis', () => {
    it('detects path wholly in safe space as cutout candidate', () => {
      const config = createBasicConfig();
      const faces = createAllSolidFaces();
      const mt = config.materialThickness;

      const panel = createMockPanel('front', config.depth, config.height);
      const safeSpace = calculateSafeSpace(panel, faces, config);
      const edgeMargins = getEdgeMarginsForFace('front', faces, mt);

      // Small rectangle in center of panel - wholly in safe space
      const points = [
        { x: -5, y: -5 },
        { x: 5, y: -5 },
        { x: 5, y: 5 },
        { x: -5, y: 5 },
      ];

      const analysis = analyzePath(points, safeSpace, edgeMargins, panel.width, panel.height);

      expect(analysis.whollyInSafeSpace).toBe(true);
      expect(analysis.touchesSafeSpaceBorder).toBe(false);
      expect(analysis.borderedEdges).toEqual([]);
      expect(analysis.spansOpenEdge).toBe(false);
    });

    it('detects path touching jointed edge border as edge path candidate', () => {
      const config = createBasicConfig();
      const faces = createAllSolidFaces();
      const mt = config.materialThickness;
      const halfH = config.height / 2;

      const panel = createMockPanel('front', config.depth, config.height);
      const safeSpace = calculateSafeSpace(panel, faces, config);
      const edgeMargins = getEdgeMarginsForFace('front', faces, mt);

      // Path that exactly touches the top safe space border (inner edge of joint margin)
      // With 2×MT margin, the safe border is at halfH - 2*mt
      const safeBorderY = halfH - 2 * mt;
      const points = [
        { x: -10, y: safeBorderY },
        { x: 0, y: safeBorderY - 5 },  // Notch going inward
        { x: 10, y: safeBorderY },
      ];

      const analysis = analyzePath(points, safeSpace, edgeMargins, panel.width, panel.height);

      expect(analysis.touchesSafeSpaceBorder).toBe(true);
      expect(analysis.borderedEdges).toContain('top');
    });

    it('detects path spanning open edge as additive candidate', () => {
      const config = createBasicConfig();
      // Open bottom face - front panel bottom edge has no joints
      const faces: FaceConfig[] = [
        { id: 'front', solid: true },
        { id: 'back', solid: true },
        { id: 'left', solid: true },
        { id: 'right', solid: true },
        { id: 'top', solid: true },
        { id: 'bottom', solid: false },
      ];
      const mt = config.materialThickness;
      const halfH = config.height / 2;

      const panel = createMockPanel('front', config.depth, config.height);
      const safeSpace = calculateSafeSpace(panel, faces, config);
      const edgeMargins = getEdgeMarginsForFace('front', faces, mt);

      // Path that goes beyond the panel body on the open bottom edge
      const points = [
        { x: -10, y: -halfH },      // At body edge
        { x: -10, y: -halfH - 10 }, // Beyond body edge
        { x: 10, y: -halfH - 10 },  // Beyond body edge
        { x: 10, y: -halfH },       // At body edge
      ];

      const analysis = analyzePath(points, safeSpace, edgeMargins, panel.width, panel.height);

      expect(analysis.spansOpenEdge).toBe(true);
      expect(analysis.openEdgesSpanned).toContain('bottom');
      expect(analysis.whollyInSafeSpace).toBe(false); // Extends beyond
    });

    it('detects path on closed face (joints on all sides) cannot be edge path', () => {
      const config = createBasicConfig();
      const faces = createAllSolidFaces();
      const mt = config.materialThickness;
      const halfH = config.height / 2;

      const panel = createMockPanel('front', config.depth, config.height);
      const safeSpace = calculateSafeSpace(panel, faces, config);
      const edgeMargins = getEdgeMarginsForFace('front', faces, mt);

      // Path in the joint margin region (which is "closed" - has joints)
      const points = [
        { x: -10, y: halfH - mt },      // In joint margin
        { x: 10, y: halfH - mt },
        { x: 10, y: halfH - mt - 5 },
        { x: -10, y: halfH - mt - 5 },
      ];

      const analysis = analyzePath(points, safeSpace, edgeMargins, panel.width, panel.height);

      expect(analysis.touchesClosedEdge).toBe(true);
    });

    it('detects path touching body edge on open edge', () => {
      const config = createBasicConfig();
      // Open left face
      const faces: FaceConfig[] = [
        { id: 'front', solid: true },
        { id: 'back', solid: true },
        { id: 'left', solid: false },  // Open
        { id: 'right', solid: true },
        { id: 'top', solid: true },
        { id: 'bottom', solid: true },
      ];
      const mt = config.materialThickness;
      const halfW = config.depth / 2;

      const panel = createMockPanel('front', config.depth, config.height);
      const safeSpace = calculateSafeSpace(panel, faces, config);
      const edgeMargins = getEdgeMarginsForFace('front', faces, mt);

      // Path that touches the left body edge (which is open)
      const points = [
        { x: -halfW, y: 10 },    // Exactly at left body edge
        { x: -halfW + 5, y: 0 }, // Inside panel
        { x: -halfW, y: -10 },   // Exactly at left body edge
      ];

      const analysis = analyzePath(points, safeSpace, edgeMargins, panel.width, panel.height);

      expect(analysis.borderedEdges).toContain('left');
      expect(analysis.openEdgesSpanned).toContain('left');
      // Not touching a closed edge because left is open
      expect(analysis.touchesClosedEdge).toBe(false);
    });

    it('detects path touching multiple edges', () => {
      const config = createBasicConfig();
      const faces = createAllSolidFaces();
      const mt = config.materialThickness;
      const halfW = config.depth / 2;
      const halfH = config.height / 2;

      const panel = createMockPanel('front', config.depth, config.height);
      const safeSpace = calculateSafeSpace(panel, faces, config);
      const edgeMargins = getEdgeMarginsForFace('front', faces, mt);

      // Path that touches both top and right safe borders (corner modification)
      const safeBorderTop = halfH - 2 * mt;
      const safeBorderRight = halfW - 2 * mt;
      const points = [
        { x: safeBorderRight - 10, y: safeBorderTop },  // At top border
        { x: safeBorderRight, y: safeBorderTop },       // At corner
        { x: safeBorderRight, y: safeBorderTop - 10 },  // At right border
      ];

      const analysis = analyzePath(points, safeSpace, edgeMargins, panel.width, panel.height);

      expect(analysis.touchesSafeSpaceBorder).toBe(true);
      expect(analysis.borderedEdges).toContain('top');
      expect(analysis.borderedEdges).toContain('right');
      expect(analysis.borderedEdges.length).toBe(2);
    });
  });
});

// =============================================================================
// Edge Path Conversion Tests
// =============================================================================

describe('rectToEdgePath', () => {
  const panelWidth = 100;
  const panelHeight = 80;
  const halfW = panelWidth / 2;
  const halfH = panelHeight / 2;

  it('creates edge path for rectangle touching top edge', () => {
    // Rectangle from x=-20 to x=20, y=30 to y=40 (panel edge is y=40)
    const result = rectToEdgePath(-20, 20, 30, 40, 'top', panelWidth, panelHeight);

    expect(result).not.toBeNull();
    expect(result!.edge).toBe('top');
    expect(result!.mirrored).toBe(false);

    // Check t values: (-20 + 50) / 100 = 0.3, (20 + 50) / 100 = 0.7
    const points = result!.points;
    expect(points.length).toBe(6);
    expect(points[0]).toEqual({ t: 0, offset: 0 });
    expect(points[1]).toEqual({ t: 0.3, offset: 0 });
    expect(points[2].t).toBeCloseTo(0.3);
    expect(points[2].offset).toBeCloseTo(-10); // 30 - 40 = -10
    expect(points[3].t).toBeCloseTo(0.7);
    expect(points[3].offset).toBeCloseTo(-10);
    expect(points[4]).toEqual({ t: 0.7, offset: 0 });
    expect(points[5]).toEqual({ t: 1, offset: 0 });
  });

  it('creates edge path for rectangle touching bottom edge', () => {
    // Rectangle from x=0 to x=30, y=-40 to y=-25 (panel edge is y=-40)
    const result = rectToEdgePath(0, 30, -40, -25, 'bottom', panelWidth, panelHeight);

    expect(result).not.toBeNull();
    expect(result!.edge).toBe('bottom');

    // Check t values: (0 + 50) / 100 = 0.5, (30 + 50) / 100 = 0.8
    const points = result!.points;
    expect(points[1].t).toBeCloseTo(0.5);
    expect(points[2].t).toBeCloseTo(0.5);
    expect(points[2].offset).toBeCloseTo(-15); // -(-25 - (-40)) = -15
  });

  it('creates edge path for rectangle touching left edge', () => {
    // Rectangle from x=-50 to x=-35, y=-10 to y=10 (panel edge is x=-50)
    const result = rectToEdgePath(-50, -35, -10, 10, 'left', panelWidth, panelHeight);

    expect(result).not.toBeNull();
    expect(result!.edge).toBe('left');

    // Check t values: (-10 + 40) / 80 = 0.375, (10 + 40) / 80 = 0.625
    const points = result!.points;
    expect(points[1].t).toBeCloseTo(0.375);
    expect(points[2].t).toBeCloseTo(0.375);
    expect(points[2].offset).toBeCloseTo(-15); // -(-35 - (-50)) = -15
  });

  it('creates edge path for rectangle touching right edge', () => {
    // Rectangle from x=35 to x=50, y=0 to y=20 (panel edge is x=50)
    const result = rectToEdgePath(35, 50, 0, 20, 'right', panelWidth, panelHeight);

    expect(result).not.toBeNull();
    expect(result!.edge).toBe('right');

    // Check offset: 35 - 50 = -15
    const points = result!.points;
    expect(points[2].offset).toBeCloseTo(-15);
  });

  it('clamps rectangle to panel bounds', () => {
    // Rectangle extends past panel on left side
    const result = rectToEdgePath(-60, -30, 30, 40, 'top', panelWidth, panelHeight);

    expect(result).not.toBeNull();
    // t_start should be clamped to 0 (left edge of panel)
    const points = result!.points;
    expect(points[1].t).toBeCloseTo(0); // (-50 + 50) / 100 = 0
  });

  it('returns null for invalid rectangle', () => {
    // Rectangle entirely outside panel
    const result = rectToEdgePath(60, 70, 30, 40, 'top', panelWidth, panelHeight);

    expect(result).toBeNull();
  });
});

describe('circleToEdgePath', () => {
  const panelWidth = 100;
  const panelHeight = 80;

  it('creates edge path for circle crossing top edge', () => {
    // Circle centered at (0, 35) with radius 8, crossing y=40 (top edge)
    // dy = 40 - 35 = 5, discrim = 64 - 25 = 39 > 0
    const result = circleToEdgePath(0, 35, 8, 'top', panelWidth, panelHeight, 4);

    expect(result).not.toBeNull();
    expect(result!.edge).toBe('top');
    expect(result!.mirrored).toBe(false);

    // Should have arc points for the notch
    const points = result!.points;
    expect(points.length).toBeGreaterThan(4);

    // First and last points should be at edge level
    expect(points[0]).toEqual({ t: 0, offset: 0 });
    expect(points[points.length - 1]).toEqual({ t: 1, offset: 0 });

    // Middle points should have negative offset (notch going down)
    const midIdx = Math.floor(points.length / 2);
    expect(points[midIdx].offset).toBeLessThan(0);
  });

  it('creates edge path for circle crossing bottom edge', () => {
    // Circle at (0, -35) with radius 8 crosses bottom edge at y=-40
    // dy = -40 - (-35) = -5, discrim = 64 - 25 = 39 > 0
    const result = circleToEdgePath(0, -35, 8, 'bottom', panelWidth, panelHeight, 4);

    expect(result).not.toBeNull();
    expect(result!.edge).toBe('bottom');

    // Middle points should have negative offset
    const points = result!.points;
    const midIdx = Math.floor(points.length / 2);
    expect(points[midIdx].offset).toBeLessThan(0);
  });

  it('creates edge path for circle crossing left edge', () => {
    // Circle at (-45, 0) with radius 8 crosses left edge at x=-50
    // dx = -50 - (-45) = -5, discrim = 64 - 25 = 39 > 0
    const result = circleToEdgePath(-45, 0, 8, 'left', panelWidth, panelHeight, 4);

    expect(result).not.toBeNull();
    expect(result!.edge).toBe('left');
  });

  it('creates edge path for circle crossing right edge', () => {
    // Circle at (45, 0) with radius 8 crosses right edge at x=50
    // dx = 50 - 45 = 5, discrim = 64 - 25 = 39 > 0
    const result = circleToEdgePath(45, 0, 8, 'right', panelWidth, panelHeight, 4);

    expect(result).not.toBeNull();
    expect(result!.edge).toBe('right');
  });
});
