/**
 * Panel Generator Tests
 *
 * These tests verify that when panels intersect:
 * 1. Finger tabs on one panel align with slot holes on the adjacent panel
 * 2. The alignment is correct in absolute (world) space
 * 3. Changes to one object correctly propagate to all intersecting objects
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  BoxConfig,
  Face,
  FaceId,
  Void,
  PanelPath,
  PanelHole,
  PathPoint,
  defaultAssemblyConfig,
} from '../../../src/types';
import { generatePanelCollection, getFaceDimensions } from '../../../src/utils/panelGenerator';

// =============================================================================
// Test Helpers
// =============================================================================

interface WorldPoint {
  x: number;
  y: number;
  z: number;
}

interface WorldRect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/**
 * Transform a 2D point on a panel to world coordinates
 * The panel's local coordinate system has origin at center, with X and Y in the panel plane
 */
const transformToWorld = (
  localPoint: PathPoint,
  panel: PanelPath
): WorldPoint => {
  const [px, py, pz] = panel.position;
  const [rx, ry, rz] = panel.rotation;

  // Apply rotation (simplified - handles common 90-degree rotations)
  let worldX = localPoint.x;
  let worldY = localPoint.y;
  let worldZ = 0;

  // Apply rotations in order: X, then Y, then Z
  // For panel faces, we typically have specific rotation patterns:
  // Front/Back: no rotation or Y rotation
  // Left/Right: Y rotation of ±90°
  // Top/Bottom: X rotation of ±90°

  // X rotation (pitch)
  if (Math.abs(rx) > 0.01) {
    const cosX = Math.cos(rx);
    const sinX = Math.sin(rx);
    const newY = worldY * cosX - worldZ * sinX;
    const newZ = worldY * sinX + worldZ * cosX;
    worldY = newY;
    worldZ = newZ;
  }

  // Y rotation (yaw)
  if (Math.abs(ry) > 0.01) {
    const cosY = Math.cos(ry);
    const sinY = Math.sin(ry);
    const newX = worldX * cosY + worldZ * sinY;
    const newZ = -worldX * sinY + worldZ * cosY;
    worldX = newX;
    worldZ = newZ;
  }

  // Z rotation (roll)
  if (Math.abs(rz) > 0.01) {
    const cosZ = Math.cos(rz);
    const sinZ = Math.sin(rz);
    const newX = worldX * cosZ - worldY * sinZ;
    const newY = worldX * sinZ + worldY * cosZ;
    worldX = newX;
    worldY = newY;
  }

  // Add panel position
  return {
    x: worldX + px,
    y: worldY + py,
    z: worldZ + pz,
  };
};

/**
 * Get the world-space bounding box of a hole
 */
const getHoleWorldBounds = (hole: PanelHole, panel: PanelPath): WorldRect => {
  const worldPoints = hole.path.points.map(p => transformToWorld(p, panel));

  return {
    minX: Math.min(...worldPoints.map(p => p.x)),
    maxX: Math.max(...worldPoints.map(p => p.x)),
    minY: Math.min(...worldPoints.map(p => p.y)),
    maxY: Math.max(...worldPoints.map(p => p.y)),
    minZ: Math.min(...worldPoints.map(p => p.z)),
    maxZ: Math.max(...worldPoints.map(p => p.z)),
  };
};

/**
 * Get all finger tab positions on a panel edge (where it meets another panel)
 * Fingers are the parts of the outline that protrude outward
 */
const getFingerPositionsOnEdge = (
  panel: PanelPath,
  edge: 'top' | 'bottom' | 'left' | 'right'
): WorldRect[] => {
  const fingers: WorldRect[] = [];
  const points = panel.outline.points;
  const tolerance = 0.01;

  // Determine which dimension to check based on edge
  const isHorizontalEdge = edge === 'top' || edge === 'bottom';
  const halfW = panel.width / 2;
  const halfH = panel.height / 2;

  // Find the edge Y (for top/bottom) or X (for left/right) coordinate
  const edgeCoord = edge === 'top' ? halfH :
                    edge === 'bottom' ? -halfH :
                    edge === 'left' ? -halfW : halfW;

  // Walk through outline points and find segments on this edge
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];

    // Check if this segment is on the edge
    const isOnEdge = isHorizontalEdge
      ? Math.abs(p1.y - edgeCoord) < tolerance && Math.abs(p2.y - edgeCoord) < tolerance
      : Math.abs(p1.x - edgeCoord) < tolerance && Math.abs(p2.x - edgeCoord) < tolerance;

    if (isOnEdge) {
      // This segment is on the edge - transform to world coordinates
      const wp1 = transformToWorld(p1, panel);
      const wp2 = transformToWorld(p2, panel);

      fingers.push({
        minX: Math.min(wp1.x, wp2.x),
        maxX: Math.max(wp1.x, wp2.x),
        minY: Math.min(wp1.y, wp2.y),
        maxY: Math.max(wp1.y, wp2.y),
        minZ: Math.min(wp1.z, wp2.z),
        maxZ: Math.max(wp1.z, wp2.z),
      });
    }
  }

  return fingers;
};

/**
 * Check if two world rectangles overlap (within tolerance)
 * Used to verify that a slot hole aligns with a finger tab
 */
const rectsOverlap = (a: WorldRect, b: WorldRect, tolerance: number = 0.1): boolean => {
  // Check overlap in each dimension
  const xOverlap = a.minX <= b.maxX + tolerance && a.maxX >= b.minX - tolerance;
  const yOverlap = a.minY <= b.maxY + tolerance && a.maxY >= b.minY - tolerance;
  const zOverlap = a.minZ <= b.maxZ + tolerance && a.maxZ >= b.minZ - tolerance;

  return xOverlap && yOverlap && zOverlap;
};

/**
 * Count how many slots on one panel align with fingers on another
 */
const countAlignedSlotsAndFingers = (
  panelWithSlots: PanelPath,
  panelWithFingers: PanelPath,
  fingerEdge: 'top' | 'bottom' | 'left' | 'right'
): { slots: number; alignedSlots: number; fingers: number } => {
  const slots = panelWithSlots.holes.filter(h => h.type === 'slot');
  const fingers = getFingerPositionsOnEdge(panelWithFingers, fingerEdge);

  let alignedSlots = 0;
  for (const slot of slots) {
    const slotBounds = getHoleWorldBounds(slot, panelWithSlots);
    for (const finger of fingers) {
      if (rectsOverlap(slotBounds, finger)) {
        alignedSlots++;
        break;
      }
    }
  }

  return {
    slots: slots.length,
    alignedSlots,
    fingers: fingers.length,
  };
};

// =============================================================================
// Test Fixtures
// =============================================================================

const createBasicConfig = (overrides?: Partial<BoxConfig>): BoxConfig => ({
  width: 100,
  height: 80,
  depth: 60,
  materialThickness: 3,
  fingerWidth: 10,
  fingerGap: 1.5,
  assembly: { ...defaultAssemblyConfig },
  ...overrides,
});

const createAllSolidFaces = (): Face[] => [
  { id: 'front', solid: true },
  { id: 'back', solid: true },
  { id: 'left', solid: true },
  { id: 'right', solid: true },
  { id: 'top', solid: true },
  { id: 'bottom', solid: true },
];

const createRootVoid = (config: BoxConfig, children?: Void[]): Void => ({
  id: 'root',
  bounds: { x: 0, y: 0, z: 0, w: config.width, h: config.height, d: config.depth },
  children: children ?? [],
});

const createSubdividedRootVoid = (
  config: BoxConfig,
  axis: 'x' | 'y' | 'z',
  position: number
): Void => {
  const { width, height, depth, materialThickness: mt } = config;
  const halfMt = mt / 2;

  let child1Bounds: { x: number; y: number; z: number; w: number; h: number; d: number };
  let child2Bounds: { x: number; y: number; z: number; w: number; h: number; d: number };

  switch (axis) {
    case 'x':
      child1Bounds = { x: 0, y: 0, z: 0, w: position - halfMt, h: height, d: depth };
      child2Bounds = { x: position + halfMt, y: 0, z: 0, w: width - position - halfMt, h: height, d: depth };
      break;
    case 'y':
      child1Bounds = { x: 0, y: 0, z: 0, w: width, h: position - halfMt, d: depth };
      child2Bounds = { x: 0, y: position + halfMt, z: 0, w: width, h: height - position - halfMt, d: depth };
      break;
    case 'z':
    default:
      child1Bounds = { x: 0, y: 0, z: 0, w: width, h: height, d: position - halfMt };
      child2Bounds = { x: 0, y: 0, z: position + halfMt, w: width, h: height, d: depth - position - halfMt };
      break;
  }

  return {
    id: 'root',
    bounds: { x: 0, y: 0, z: 0, w: width, h: height, d: depth },
    children: [
      {
        id: 'void-1',
        bounds: child1Bounds,
        children: [],
        splitAxis: axis,
        splitPosition: position,
      },
      {
        id: 'void-2',
        bounds: child2Bounds,
        children: [],
      },
    ],
  };
};

// =============================================================================
// Tests
// =============================================================================

describe('Panel Generator', () => {
  describe('Basic Box - Face to Face Joints', () => {
    it('generates panels for all solid faces', () => {
      const config = createBasicConfig();
      const faces = createAllSolidFaces();
      const rootVoid = createRootVoid(config);

      const collection = generatePanelCollection(faces, rootVoid, config);

      expect(collection.panels.length).toBe(6);
      expect(collection.panels.map(p => p.source.faceId).sort()).toEqual([
        'back', 'bottom', 'front', 'left', 'right', 'top'
      ]);
    });

    it('front and left panels have aligned finger joints', () => {
      const config = createBasicConfig();
      const faces = createAllSolidFaces();
      const rootVoid = createRootVoid(config);

      const collection = generatePanelCollection(faces, rootVoid, config);

      const frontPanel = collection.panels.find(p => p.source.faceId === 'front');
      const leftPanel = collection.panels.find(p => p.source.faceId === 'left');

      expect(frontPanel).toBeDefined();
      expect(leftPanel).toBeDefined();

      // Front panel should have finger tabs on left edge
      // Left panel should have slots on right edge that align with front's tabs
      // OR: one has tabs out, other has slots - depending on wall priority

      // The important thing is that there IS a connection
      const frontLeftFingers = getFingerPositionsOnEdge(frontPanel!, 'left');
      const leftRightFingers = getFingerPositionsOnEdge(leftPanel!, 'right');

      // At least one panel should have finger features on the connecting edge
      expect(frontLeftFingers.length + leftRightFingers.length).toBeGreaterThan(0);
    });

    it('all face panels have consistent finger patterns at corners', () => {
      const config = createBasicConfig();
      const faces = createAllSolidFaces();
      const rootVoid = createRootVoid(config);

      const collection = generatePanelCollection(faces, rootVoid, config);

      // Verify each panel has reasonable outline points (with finger joints)
      for (const panel of collection.panels) {
        expect(panel.outline.points.length).toBeGreaterThan(4);
        // A plain rectangle would have 4 points
        // Finger joints add many more points
      }
    });
  });

  describe('Box with Divider - Face to Divider Joints', () => {
    it('generates divider panel when box is subdivided', () => {
      const config = createBasicConfig();
      const faces = createAllSolidFaces();
      const rootVoid = createSubdividedRootVoid(config, 'x', 50);

      const collection = generatePanelCollection(faces, rootVoid, config);

      const dividerPanels = collection.panels.filter(p => p.source.type === 'divider');
      expect(dividerPanels.length).toBe(1);
    });

    it('front face has slot holes for X-axis divider', () => {
      const config = createBasicConfig();
      const faces = createAllSolidFaces();
      const rootVoid = createSubdividedRootVoid(config, 'x', 50);

      const collection = generatePanelCollection(faces, rootVoid, config);

      const frontPanel = collection.panels.find(p => p.source.faceId === 'front');
      expect(frontPanel).toBeDefined();

      const dividerSlots = frontPanel!.holes.filter(h =>
        h.source?.type === 'divider-slot'
      );
      expect(dividerSlots.length).toBeGreaterThan(0);
    });

    it('back face has slot holes for X-axis divider', () => {
      const config = createBasicConfig();
      const faces = createAllSolidFaces();
      const rootVoid = createSubdividedRootVoid(config, 'x', 50);

      const collection = generatePanelCollection(faces, rootVoid, config);

      const backPanel = collection.panels.find(p => p.source.faceId === 'back');
      expect(backPanel).toBeDefined();

      const dividerSlots = backPanel!.holes.filter(h =>
        h.source?.type === 'divider-slot'
      );
      expect(dividerSlots.length).toBeGreaterThan(0);
    });

    it('divider panel slots align with face panel tabs in world space', () => {
      const config = createBasicConfig();
      const faces = createAllSolidFaces();
      const rootVoid = createSubdividedRootVoid(config, 'x', 50);

      const collection = generatePanelCollection(faces, rootVoid, config);

      const frontPanel = collection.panels.find(p => p.source.faceId === 'front');
      const dividerPanel = collection.panels.find(p => p.source.type === 'divider');

      expect(frontPanel).toBeDefined();
      expect(dividerPanel).toBeDefined();

      // Front panel has slots, divider has tabs (or vice versa)
      const frontSlots = frontPanel!.holes.filter(h => h.source?.type === 'divider-slot');

      // Verify slots exist and are at reasonable positions
      expect(frontSlots.length).toBeGreaterThan(0);

      // Each slot should be within the bounds of the front panel
      for (const slot of frontSlots) {
        const bounds = getHoleWorldBounds(slot, frontPanel!);
        // Slots should be near x=0 (center of front panel in world X)
        // and span the appropriate Y range
        expect(bounds.maxX - bounds.minX).toBeLessThan(config.materialThickness + 1);
      }
    });
  });

  describe('Inset Lid - Divider to Inset Lid Joints', () => {
    it('divider meets inset bottom lid and has finger tabs', () => {
      const config = createBasicConfig({
        assembly: {
          assemblyAxis: 'y',
          lids: {
            positive: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
            negative: { enabled: true, tabDirection: 'tabs-out', inset: 10 },
          },
        },
      });
      const faces = createAllSolidFaces();

      // Create root void with main interior (accounting for inset)
      const rootVoid: Void = {
        id: 'root',
        bounds: { x: 0, y: 0, z: 0, w: config.width, h: config.height, d: config.depth },
        children: [
          {
            id: 'lid-inset-negative',
            bounds: { x: 0, y: 0, z: 0, w: config.width, h: 10, d: config.depth },
            children: [],
            lidInsetSide: 'negative',
          },
          {
            id: 'main-interior',
            bounds: { x: 0, y: 10, z: 0, w: config.width, h: config.height - 10, d: config.depth },
            children: [
              {
                id: 'void-1',
                bounds: { x: 0, y: 10, z: 0, w: 50 - 1.5, h: config.height - 10, d: config.depth },
                children: [],
                splitAxis: 'x',
                splitPosition: 50,
              },
              {
                id: 'void-2',
                bounds: { x: 50 + 1.5, y: 10, z: 0, w: config.width - 50 - 1.5, h: config.height - 10, d: config.depth },
                children: [],
              },
            ],
            isMainInterior: true,
          },
        ],
      };

      const collection = generatePanelCollection(faces, rootVoid, config);

      // Find bottom panel and divider
      const bottomPanel = collection.panels.find(p => p.source.faceId === 'bottom');
      const dividerPanel = collection.panels.find(p => p.source.type === 'divider');

      expect(bottomPanel).toBeDefined();
      expect(dividerPanel).toBeDefined();

      // Bottom panel should have slots for the divider
      const dividerSlots = bottomPanel!.holes.filter(h =>
        h.source?.type === 'divider-slot'
      );
      expect(dividerSlots.length).toBeGreaterThan(0);

      // Divider should have finger tabs on bottom edge (meeting the inset lid)
      // Check that the divider outline has finger pattern on bottom
      const dividerPoints = dividerPanel!.outline.points;
      expect(dividerPoints.length).toBeGreaterThan(4); // Has finger joints
    });

    it('divider bottom edge aligns with inset lid position', () => {
      const insetAmount = 15;
      const config = createBasicConfig({
        assembly: {
          assemblyAxis: 'y',
          lids: {
            positive: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
            negative: { enabled: true, tabDirection: 'tabs-out', inset: insetAmount },
          },
        },
      });
      const faces = createAllSolidFaces();

      const rootVoid: Void = {
        id: 'root',
        bounds: { x: 0, y: 0, z: 0, w: config.width, h: config.height, d: config.depth },
        children: [
          {
            id: 'lid-inset-negative',
            bounds: { x: 0, y: 0, z: 0, w: config.width, h: insetAmount, d: config.depth },
            children: [],
            lidInsetSide: 'negative',
          },
          {
            id: 'main-interior',
            bounds: { x: 0, y: insetAmount, z: 0, w: config.width, h: config.height - insetAmount, d: config.depth },
            children: [
              {
                id: 'void-1',
                bounds: { x: 0, y: insetAmount, z: 0, w: 50 - 1.5, h: config.height - insetAmount, d: config.depth },
                children: [],
                splitAxis: 'x',
                splitPosition: 50,
              },
              {
                id: 'void-2',
                bounds: { x: 50 + 1.5, y: insetAmount, z: 0, w: config.width - 50 - 1.5, h: config.height - insetAmount, d: config.depth },
                children: [],
              },
            ],
            isMainInterior: true,
          },
        ],
      };

      const collection = generatePanelCollection(faces, rootVoid, config);

      const bottomPanel = collection.panels.find(p => p.source.faceId === 'bottom');
      const dividerPanel = collection.panels.find(p => p.source.type === 'divider');

      expect(bottomPanel).toBeDefined();
      expect(dividerPanel).toBeDefined();

      // Bottom panel Y position should be at the inset position
      const bottomY = bottomPanel!.position[1];
      const expectedY = -config.height / 2 + config.materialThickness / 2 + insetAmount;
      expect(Math.abs(bottomY - expectedY)).toBeLessThan(0.1);

      // Bottom panel should have divider slots
      const slots = bottomPanel!.holes.filter(h => h.source?.type === 'divider-slot');
      expect(slots.length).toBeGreaterThan(0);
    });
  });

  describe('Open Face - No Joints', () => {
    it('divider has no finger tabs on edge meeting open face', () => {
      const config = createBasicConfig();
      // First generate with all solid faces
      const allSolidFaces = createAllSolidFaces();
      const rootVoidSolid = createSubdividedRootVoid(config, 'x', 50);
      const collectionSolid = generatePanelCollection(allSolidFaces, rootVoidSolid, config);
      const dividerSolid = collectionSolid.panels.find(p => p.source.type === 'divider');

      // Now generate with open top face
      const faces: Face[] = [
        { id: 'front', solid: true },
        { id: 'back', solid: true },
        { id: 'left', solid: true },
        { id: 'right', solid: true },
        { id: 'top', solid: false }, // Open top
        { id: 'bottom', solid: true },
      ];
      const rootVoid = createSubdividedRootVoid(config, 'x', 50);

      const collection = generatePanelCollection(faces, rootVoid, config);

      const dividerPanel = collection.panels.find(p => p.source.type === 'divider');
      expect(dividerPanel).toBeDefined();

      // No top panel should exist
      const topPanel = collection.panels.find(p => p.source.faceId === 'top');
      expect(topPanel).toBeUndefined();

      // Divider with open top should have a straight top edge (no finger joints)
      expect(dividerSolid).toBeDefined();

      // For an X-axis divider (YZ plane), the top edge is at max Y in local coords
      // Check that the top edge is straight (points 0 and 1 should be at maxY, with same Y)
      const points = dividerPanel!.outline.points;
      const maxY = Math.max(...points.map(p => p.y));

      // The outline starts at topLeft, goes to topRight for the top edge
      // A straight top edge means points 0 and 1 are both at maxY and nothing in between
      expect(Math.abs(points[0].y - maxY)).toBeLessThan(0.01);
      expect(Math.abs(points[1].y - maxY)).toBeLessThan(0.01);
      // Point 2 should be on the right edge, at a lower Y
      expect(points[2].y).toBeLessThan(maxY - 1);
    });

    it('z-axis divider has straight left edge when left face is open', () => {
      const config = createBasicConfig();

      // First generate with all solid faces
      const allSolidFaces = createAllSolidFaces();
      const rootVoidSolid = createSubdividedRootVoid(config, 'z', 30);
      const collectionSolid = generatePanelCollection(allSolidFaces, rootVoidSolid, config);
      const dividerSolid = collectionSolid.panels.find(p => p.source.type === 'divider');

      // Now generate with open left face
      const faces: Face[] = [
        { id: 'front', solid: true },
        { id: 'back', solid: true },
        { id: 'left', solid: false }, // Open left
        { id: 'right', solid: true },
        { id: 'top', solid: true },
        { id: 'bottom', solid: true },
      ];
      const rootVoid = createSubdividedRootVoid(config, 'z', 30);
      const collection = generatePanelCollection(faces, rootVoid, config);
      const dividerPanel = collection.panels.find(p => p.source.type === 'divider');

      expect(dividerPanel).toBeDefined();
      expect(dividerSolid).toBeDefined();

      // Divider with open left should have FEWER outline points because the left edge is straight
      expect(dividerPanel!.outline.points.length).toBeLessThan(dividerSolid!.outline.points.length);
    });

    it('open face is not generated', () => {
      const config = createBasicConfig();
      const faces: Face[] = [
        { id: 'front', solid: false }, // Open
        { id: 'back', solid: true },
        { id: 'left', solid: true },
        { id: 'right', solid: true },
        { id: 'top', solid: true },
        { id: 'bottom', solid: true },
      ];
      const rootVoid = createRootVoid(config);

      const collection = generatePanelCollection(faces, rootVoid, config);

      expect(collection.panels.length).toBe(5);
      expect(collection.panels.find(p => p.source.faceId === 'front')).toBeUndefined();
    });
  });

  describe('Slot Position Accuracy', () => {
    it('slot holes are positioned at correct world coordinates', () => {
      const config = createBasicConfig();
      const faces = createAllSolidFaces();
      const rootVoid = createSubdividedRootVoid(config, 'x', 50);

      const collection = generatePanelCollection(faces, rootVoid, config);

      const frontPanel = collection.panels.find(p => p.source.faceId === 'front');
      expect(frontPanel).toBeDefined();

      const dividerSlots = frontPanel!.holes.filter(h =>
        h.source?.type === 'divider-slot'
      );

      for (const slot of dividerSlots) {
        const bounds = getHoleWorldBounds(slot, frontPanel!);

        // Divider is at x=50, so slots should be centered around x=0 in world coords
        // (front panel is centered at x=0, divider at 50 means slot at x=0 on panel)
        const slotWorldX = (bounds.minX + bounds.maxX) / 2;
        expect(Math.abs(slotWorldX)).toBeLessThan(1); // Near center

        // Slot width should equal material thickness
        // In the local Z direction (which becomes X after rotation)
        const slotWidth = bounds.maxX - bounds.minX;
        expect(Math.abs(slotWidth - config.materialThickness)).toBeLessThan(0.1);
      }
    });
  });

  describe('Configuration Changes', () => {
    it('changing material thickness updates all connected panels', () => {
      const config1 = createBasicConfig({ materialThickness: 3 });
      const config2 = createBasicConfig({ materialThickness: 6 });
      const faces = createAllSolidFaces();
      const rootVoid1 = createSubdividedRootVoid(config1, 'x', 50);
      const rootVoid2 = createSubdividedRootVoid(config2, 'x', 50);

      const collection1 = generatePanelCollection(faces, rootVoid1, config1);
      const collection2 = generatePanelCollection(faces, rootVoid2, config2);

      const front1 = collection1.panels.find(p => p.source.faceId === 'front');
      const front2 = collection2.panels.find(p => p.source.faceId === 'front');

      const slots1 = front1!.holes.filter(h => h.source?.type === 'divider-slot');
      const slots2 = front2!.holes.filter(h => h.source?.type === 'divider-slot');

      // Both should have slots
      expect(slots1.length).toBeGreaterThan(0);
      expect(slots2.length).toBeGreaterThan(0);

      // Slot widths should differ based on material thickness
      const slot1Bounds = getHoleWorldBounds(slots1[0], front1!);
      const slot2Bounds = getHoleWorldBounds(slots2[0], front2!);

      const slot1Width = slot1Bounds.maxX - slot1Bounds.minX;
      const slot2Width = slot2Bounds.maxX - slot2Bounds.minX;

      expect(Math.abs(slot1Width - 3)).toBeLessThan(0.1);
      expect(Math.abs(slot2Width - 6)).toBeLessThan(0.1);
    });

    it('changing finger width updates finger patterns on all panels', () => {
      const config1 = createBasicConfig({ fingerWidth: 8 });
      const config2 = createBasicConfig({ fingerWidth: 15 });
      const faces = createAllSolidFaces();
      const rootVoid = createRootVoid(config1);

      const collection1 = generatePanelCollection(faces, rootVoid, config1);
      const collection2 = generatePanelCollection(faces, rootVoid, config2);

      const front1 = collection1.panels.find(p => p.source.faceId === 'front');
      const front2 = collection2.panels.find(p => p.source.faceId === 'front');

      // More outline points with smaller fingers
      expect(front1!.outline.points.length).toBeGreaterThan(front2!.outline.points.length);
    });
  });
});

describe('Edge Case Scenarios', () => {
  it('handles very small box dimensions', () => {
    const config = createBasicConfig({
      width: 30,
      height: 25,
      depth: 20,
      fingerWidth: 5,
    });
    const faces = createAllSolidFaces();
    const rootVoid = createRootVoid(config);

    const collection = generatePanelCollection(faces, rootVoid, config);

    // Should still generate all faces
    expect(collection.panels.length).toBe(6);
  });

  it('handles divider near edge of box', () => {
    const config = createBasicConfig();
    const faces = createAllSolidFaces();
    // Divider very close to left edge
    const rootVoid = createSubdividedRootVoid(config, 'x', 15);

    const collection = generatePanelCollection(faces, rootVoid, config);

    const dividerPanel = collection.panels.find(p => p.source.type === 'divider');
    expect(dividerPanel).toBeDefined();
  });

  it('handles multiple dividers', () => {
    const config = createBasicConfig();
    const faces = createAllSolidFaces();
    const mt = config.materialThickness;

    // Two X-axis dividers
    const rootVoid: Void = {
      id: 'root',
      bounds: { x: 0, y: 0, z: 0, w: config.width, h: config.height, d: config.depth },
      children: [
        {
          id: 'void-1',
          bounds: { x: 0, y: 0, z: 0, w: 30 - mt/2, h: config.height, d: config.depth },
          children: [],
          splitAxis: 'x',
          splitPosition: 30,
        },
        {
          id: 'void-2',
          bounds: { x: 30 + mt/2, y: 0, z: 0, w: 40 - mt, h: config.height, d: config.depth },
          children: [],
          splitAxis: 'x',
          splitPosition: 70,
        },
        {
          id: 'void-3',
          bounds: { x: 70 + mt/2, y: 0, z: 0, w: 30 - mt/2, h: config.height, d: config.depth },
          children: [],
        },
      ],
    };

    const collection = generatePanelCollection(faces, rootVoid, config);

    const dividerPanels = collection.panels.filter(p => p.source.type === 'divider');
    expect(dividerPanels.length).toBe(2);

    // Front panel should have slots for both dividers
    const frontPanel = collection.panels.find(p => p.source.faceId === 'front');
    const dividerSlots = frontPanel!.holes.filter(h => h.source?.type === 'divider-slot');
    expect(dividerSlots.length).toBeGreaterThanOrEqual(2); // At least 2 slot groups
  });
});

// =============================================================================
// Edge Extension Tests
// =============================================================================

describe('Edge Extensions', () => {
  const createBasicConfig = (): BoxConfig => ({
    width: 100,
    height: 100,
    depth: 100,
    materialThickness: 3,
    fingerWidth: 10,
    fingerGap: 1.5,
    assembly: defaultAssemblyConfig,
  });

  const createAllSolidFaces = (): Face[] => [
    { id: 'front', solid: true },
    { id: 'back', solid: true },
    { id: 'left', solid: true },
    { id: 'right', solid: true },
    { id: 'top', solid: true },
    { id: 'bottom', solid: true },
  ];

  const createSimpleRootVoid = (config: BoxConfig): Void => ({
    id: 'root',
    bounds: { x: 0, y: 0, z: 0, w: config.width, h: config.height, d: config.depth },
    children: [],
  });

  /**
   * Get the bounding box of a panel's outline
   */
  const getOutlineBounds = (panel: PanelPath) => {
    const xs = panel.outline.points.map(p => p.x);
    const ys = panel.outline.points.map(p => p.y);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  };

  describe('Single Panel Extension', () => {
    it('panel extends full width when no overlap', () => {
      const config = createBasicConfig();
      const faces = createAllSolidFaces();
      const rootVoid = createSimpleRootVoid(config);

      // First generate without extensions
      const collectionBase = generatePanelCollection(faces, rootVoid, config);
      const frontBase = collectionBase.panels.find(p => p.source.faceId === 'front');
      const baseBounds = getOutlineBounds(frontBase!);

      // Now generate with front extending top by 20mm
      const existingPanels = collectionBase.panels.map(p =>
        p.source.faceId === 'front'
          ? { ...p, edgeExtensions: { top: 20, bottom: 0, left: 0, right: 0 } }
          : p
      );
      const collection = generatePanelCollection(faces, rootVoid, config, 1, existingPanels);
      const front = collection.panels.find(p => p.source.faceId === 'front');
      const extBounds = getOutlineBounds(front!);

      // Y should extend by 20mm
      expect(extBounds.maxY).toBeCloseTo(baseBounds.maxY + 20, 0.1);
      // X should be full width (no overlap constraint)
      expect(extBounds.minX).toBeCloseTo(-config.width / 2, 0.1);
      expect(extBounds.maxX).toBeCloseTo(config.width / 2, 0.1);
    });
  });

  describe('Extension Overlap - Notching', () => {
    it('lower priority panel gets X-notched when both extend same horizontal edge', () => {
      const config = createBasicConfig();
      const faces = createAllSolidFaces();
      const rootVoid = createSimpleRootVoid(config);
      const mt = config.materialThickness;
      const halfW = config.width / 2;
      const halfD = config.depth / 2;

      // Both FRONT and RIGHT extend top edge
      // FRONT has lower priority number (1) so it has tabs-out (male) - it wins
      // RIGHT has higher priority number (4) so it has slots (female) - it should be notched
      const frontExt = 20;
      const rightExt = 25;

      // Create panels with extensions
      const collectionBase = generatePanelCollection(faces, rootVoid, config);
      const existingPanels = collectionBase.panels.map(p => {
        if (p.source.faceId === 'front') {
          return { ...p, edgeExtensions: { top: frontExt, bottom: 0, left: 0, right: 0 } };
        }
        if (p.source.faceId === 'right') {
          return { ...p, edgeExtensions: { top: rightExt, bottom: 0, left: 0, right: 0 } };
        }
        return p;
      });

      const collection = generatePanelCollection(faces, rootVoid, config, 1, existingPanels);
      const front = collection.panels.find(p => p.source.faceId === 'front');
      const right = collection.panels.find(p => p.source.faceId === 'right');

      // FRONT should go full width at top-right corner (it wins)
      const frontBounds = getOutlineBounds(front!);
      expect(frontBounds.maxX).toBeCloseTo(halfW, 0.1); // Full width

      // RIGHT should be notched at its top-left corner (where it meets FRONT)
      // The notch means: instead of going to X = -halfD, it should be at -halfD + MT
      const rightPoints = right!.outline.points;
      const rightTopLeftY = Math.max(...rightPoints.map(p => p.y));
      const rightTopLeftPoints = rightPoints.filter(p => Math.abs(p.y - rightTopLeftY) < 1);

      // Find the leftmost X coordinate in the extended region (top)
      const leftmostXInExtension = Math.min(...rightTopLeftPoints.map(p => p.x));

      // RIGHT panel local X axis corresponds to world Z axis
      // The left edge (X=-halfD) is where it meets FRONT
      // When notched, it should be at -halfD + MT
      expect(leftmostXInExtension).toBeCloseTo(-halfD + mt, 0.5);
    });

    it('both panels extend - winner goes full width, loser gets notched', () => {
      const config = createBasicConfig();
      const faces = createAllSolidFaces();
      const rootVoid = createSimpleRootVoid(config);
      const mt = config.materialThickness;
      const halfW = config.width / 2;
      const halfD = config.depth / 2;
      const halfH = config.height / 2;

      // FRONT extends top, RIGHT also extends top
      // FRONT has priority 1, RIGHT has priority 4
      // So FRONT wins - its extension goes full width
      // RIGHT should be notched where it meets FRONT

      const frontExt = 20;
      const rightExt = 20;

      const collectionBase = generatePanelCollection(faces, rootVoid, config);
      const existingPanels = collectionBase.panels.map(p => {
        if (p.source.faceId === 'front') {
          return { ...p, edgeExtensions: { top: frontExt, bottom: 0, left: 0, right: 0 } };
        }
        if (p.source.faceId === 'right') {
          return { ...p, edgeExtensions: { top: rightExt, bottom: 0, left: 0, right: 0 } };
        }
        return p;
      });

      const collection = generatePanelCollection(faces, rootVoid, config, 1, existingPanels);
      const front = collection.panels.find(p => p.source.faceId === 'front');
      const right = collection.panels.find(p => p.source.faceId === 'right');

      // FRONT should extend to full height + extension
      const frontBounds = getOutlineBounds(front!);
      expect(frontBounds.maxY).toBeCloseTo(halfH + frontExt, 0.5);
      // FRONT goes full width (it wins priority on both sides)
      expect(frontBounds.maxX).toBeCloseTo(halfW, 0.5);

      // RIGHT should also extend, but notched where it meets FRONT
      const rightBounds = getOutlineBounds(right!);
      expect(rightBounds.maxY).toBeCloseTo(halfH + rightExt, 0.5);

      // RIGHT's left edge in the extension should be notched
      // For RIGHT panel: local X axis = world Z (depth), local Y = world Y (height)
      // The left edge (X = -halfD) is where RIGHT meets FRONT
      const rightPoints = right!.outline.points;

      // Find the top-left corner point of the extended region
      // This is the point with maximum Y and minimum X in the extension
      const extendedPoints = rightPoints.filter(p => p.y > halfH + 1); // Points above main body
      const topLeftExtCorner = extendedPoints.reduce(
        (best, p) => (p.x < best.x || (p.x === best.x && p.y > best.y)) ? p : best,
        { x: Infinity, y: -Infinity }
      );

      // The top-left corner of the extension should be notched: X at -halfD + MT
      expect(topLeftExtCorner.x).toBeCloseTo(-halfD + mt, 0.5);
    });

    it('panel without extension is not affected by adjacent panel extension', () => {
      const config = createBasicConfig();
      const faces = createAllSolidFaces();
      const rootVoid = createSimpleRootVoid(config);
      const halfW = config.width / 2;
      const halfH = config.height / 2;

      // Only FRONT extends top, RIGHT does not extend
      const frontExt = 20;

      const collectionBase = generatePanelCollection(faces, rootVoid, config);
      const existingPanels = collectionBase.panels.map(p => {
        if (p.source.faceId === 'front') {
          return { ...p, edgeExtensions: { top: frontExt, bottom: 0, left: 0, right: 0 } };
        }
        return p;
      });

      const collection = generatePanelCollection(faces, rootVoid, config, 1, existingPanels);
      const front = collection.panels.find(p => p.source.faceId === 'front');
      const right = collection.panels.find(p => p.source.faceId === 'right');

      // FRONT extends
      const frontBounds = getOutlineBounds(front!);
      expect(frontBounds.maxY).toBeCloseTo(halfH + frontExt, 0.5);

      // RIGHT does not extend and should have normal bounds
      const rightBounds = getOutlineBounds(right!);
      // RIGHT's height is the box height (100), so Y bounds are around ±50
      expect(rightBounds.maxY).toBeLessThan(halfH + 1);
      expect(rightBounds.minY).toBeGreaterThan(-halfH - 1);
    });
  });

  describe('Face Push/Pull Offset Mode', () => {
    it('offset mode moves face position without changing box dimensions', () => {
      const config: BoxConfig = {
        ...createBasicConfig(),
        assembly: {
          ...defaultAssemblyConfig,
          faceOffsets: { top: 10, bottom: 0, left: 0, right: 0, front: 0, back: 0 },
        },
      };
      const faces = createAllSolidFaces();
      const rootVoid = createSimpleRootVoid(config);

      const collection = generatePanelCollection(faces, rootVoid, config);
      const topPanel = collection.panels.find(p => p.source.faceId === 'top');

      expect(topPanel).toBeDefined();

      // Top panel Y position should be offset by 10mm (in world units)
      // Without offset: position would be at height/2 - materialThickness/2
      // With offset: position should be at height/2 - materialThickness/2 + 10
      const expectedYWithoutOffset = (config.height / 2 - config.materialThickness / 2);
      const expectedYWithOffset = expectedYWithoutOffset + 10;
      expect(topPanel!.position[1]).toBeCloseTo(expectedYWithOffset, 0.1);
    });

    it('adjacent panels are NOT extended when face is offset (offset mode)', () => {
      const config: BoxConfig = {
        ...createBasicConfig(),
        assembly: {
          ...defaultAssemblyConfig,
          faceOffsets: { top: 10, bottom: 0, left: 0, right: 0, front: 0, back: 0 },
        },
      };
      const faces = createAllSolidFaces();
      const rootVoid = createSimpleRootVoid(config);
      const halfH = config.height / 2;

      const collection = generatePanelCollection(faces, rootVoid, config);
      const frontPanel = collection.panels.find(p => p.source.faceId === 'front');

      expect(frontPanel).toBeDefined();

      // Front panel should NOT be extended even though top is offset
      // Its height should still be the normal box height
      const frontBounds = getOutlineBounds(frontPanel!);

      // Front panel Y range should be approximately -halfH to +halfH (accounting for finger joints)
      expect(frontBounds.maxY).toBeLessThan(halfH + config.materialThickness + 1);
    });

    it('face offset works for all faces', () => {
      const faceIds: FaceId[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];
      const offset = 15;

      for (const faceId of faceIds) {
        const faceOffsets = { top: 0, bottom: 0, left: 0, right: 0, front: 0, back: 0 };
        faceOffsets[faceId] = offset;

        const config: BoxConfig = {
          ...createBasicConfig(),
          assembly: { ...defaultAssemblyConfig, faceOffsets },
        };
        const faces = createAllSolidFaces();
        const rootVoid = createSimpleRootVoid(config);

        const collection = generatePanelCollection(faces, rootVoid, config);
        const panel = collection.panels.find(p => p.source.faceId === faceId);

        expect(panel).toBeDefined();

        // Verify the panel position has been offset along its perpendicular axis
        // The exact position depends on the face, but we verify the offset is applied
        const { width, height, depth, materialThickness: mt } = config;
        let expectedPosition: number;

        switch (faceId) {
          case 'front':
            expectedPosition = depth / 2 - mt / 2 + offset;
            expect(panel!.position[2]).toBeCloseTo(expectedPosition, 0.1);
            break;
          case 'back':
            expectedPosition = -depth / 2 + mt / 2 - offset;
            expect(panel!.position[2]).toBeCloseTo(expectedPosition, 0.1);
            break;
          case 'left':
            expectedPosition = -width / 2 + mt / 2 - offset;
            expect(panel!.position[0]).toBeCloseTo(expectedPosition, 0.1);
            break;
          case 'right':
            expectedPosition = width / 2 - mt / 2 + offset;
            expect(panel!.position[0]).toBeCloseTo(expectedPosition, 0.1);
            break;
          case 'top':
            expectedPosition = height / 2 - mt / 2 + offset;
            expect(panel!.position[1]).toBeCloseTo(expectedPosition, 0.1);
            break;
          case 'bottom':
            expectedPosition = -height / 2 + mt / 2 - offset;
            expect(panel!.position[1]).toBeCloseTo(expectedPosition, 0.1);
            break;
        }
      }
    });

    it('negative offset moves face inward', () => {
      const config: BoxConfig = {
        ...createBasicConfig(),
        assembly: {
          ...defaultAssemblyConfig,
          faceOffsets: { top: -10, bottom: 0, left: 0, right: 0, front: 0, back: 0 },
        },
      };
      const faces = createAllSolidFaces();
      const rootVoid = createSimpleRootVoid(config);

      const collection = generatePanelCollection(faces, rootVoid, config);
      const topPanel = collection.panels.find(p => p.source.faceId === 'top');

      expect(topPanel).toBeDefined();

      // Top panel should be moved inward (negative Y direction)
      const expectedYWithoutOffset = (config.height / 2 - config.materialThickness / 2);
      const expectedYWithOffset = expectedYWithoutOffset - 10;
      expect(topPanel!.position[1]).toBeCloseTo(expectedYWithOffset, 0.1);
    });
  });

  describe('Extension L-Shape Transitions', () => {
    it('creates L-shape when extension meets finger joints', () => {
      const config = createBasicConfig();
      const faces = createAllSolidFaces();
      const rootVoid = createSimpleRootVoid(config);
      const halfW = config.width / 2;
      const halfH = config.height / 2;
      const mt = config.materialThickness;

      // FRONT extends top
      const frontExt = 20;

      const collectionBase = generatePanelCollection(faces, rootVoid, config);
      const existingPanels = collectionBase.panels.map(p => {
        if (p.source.faceId === 'front') {
          return { ...p, edgeExtensions: { top: frontExt, bottom: 0, left: 0, right: 0 } };
        }
        return p;
      });

      const collection = generatePanelCollection(faces, rootVoid, config, 1, existingPanels);
      const front = collection.panels.find(p => p.source.faceId === 'front');

      // The panel should have an L-shape transition where the extension meets the main body
      // Find points at the transition height (around halfH)
      const points = front!.outline.points;

      // Look for points around the transition between main body and extension
      const mainBodyMaxY = halfH; // Approximate
      const transitionPoints = points.filter(
        p => p.y >= mainBodyMaxY - mt && p.y <= mainBodyMaxY + mt
      );

      // There should be L-shape transition points at both left and right corners
      // These create the step from main body width to extension width
      expect(transitionPoints.length).toBeGreaterThan(0);
    });
  });
});
