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
  SafeSpaceRegion,
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
});
