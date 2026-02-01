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
    it('creates safe space with margins for all solid faces', () => {
      const config = createBasicConfig();
      const faces = createAllSolidFaces();
      const mt = config.materialThickness;

      // Front face: 100x100 panel (depth x height)
      const panel = createMockPanel('front', config.depth, config.height);

      const safeSpace = calculateSafeSpace(panel, faces, config);

      // Safe space outline should be inset by MT on all sides
      expect(safeSpace.outline.length).toBe(4);

      // Check the outline bounds
      const minX = Math.min(...safeSpace.outline.map(p => p.x));
      const maxX = Math.max(...safeSpace.outline.map(p => p.x));
      const minY = Math.min(...safeSpace.outline.map(p => p.y));
      const maxY = Math.max(...safeSpace.outline.map(p => p.y));

      expect(minX).toBeCloseTo(-config.depth / 2 + mt, 0.1);
      expect(maxX).toBeCloseTo(config.depth / 2 - mt, 0.1);
      expect(minY).toBeCloseTo(-config.height / 2 + mt, 0.1);
      expect(maxY).toBeCloseTo(config.height / 2 - mt, 0.1);

      // Should have 4 reserved regions (one for each edge with joints)
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

    it('divider panels have margins on all edges', () => {
      const config = createBasicConfig();
      const faces = createAllSolidFaces();
      const mt = config.materialThickness;

      const panel = createDividerPanel(94, 94); // Typical divider size

      const safeSpace = calculateSafeSpace(panel, faces, config);

      // All edges should have margins
      const jointEdges = safeSpace.reserved.filter(r => r.type === 'joint-edge');
      expect(jointEdges.length).toBe(4);

      // Check margins are applied on all sides
      const minX = Math.min(...safeSpace.outline.map(p => p.x));
      const maxX = Math.max(...safeSpace.outline.map(p => p.x));
      const minY = Math.min(...safeSpace.outline.map(p => p.y));
      const maxY = Math.max(...safeSpace.outline.map(p => p.y));

      expect(minX).toBeCloseTo(-94 / 2 + mt, 0.1);
      expect(maxX).toBeCloseTo(94 / 2 - mt, 0.1);
      expect(minY).toBeCloseTo(-94 / 2 + mt, 0.1);
      expect(maxY).toBeCloseTo(94 / 2 - mt, 0.1);
    });
  });

  describe('Slot Exclusions', () => {
    it('includes slot holes as exclusions', () => {
      const config = createBasicConfig();
      const faces = createAllSolidFaces();
      const mt = config.materialThickness;

      // Panel with a slot hole in the center
      const slotHole = createSlotHole(0, 0, 10, 3);
      const panel = createMockPanel('front', config.depth, config.height, [slotHole]);

      const safeSpace = calculateSafeSpace(panel, faces, config);

      // Should have one exclusion (slot + margin)
      expect(safeSpace.exclusions.length).toBe(1);

      // Exclusion should be slot expanded by MT
      const exclusion = safeSpace.exclusions[0];
      const exMinX = Math.min(...exclusion.map(p => p.x));
      const exMaxX = Math.max(...exclusion.map(p => p.x));

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

      // Should have two exclusions
      expect(safeSpace.exclusions.length).toBe(2);

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
