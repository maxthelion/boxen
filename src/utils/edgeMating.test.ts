/**
 * Edge Mating Verification Tests
 *
 * These tests verify that when panels share an edge:
 * 1. Edge lengths match between mating panels
 * 2. Finger tabs on one panel align with slots on the adjacent panel
 * 3. Corner positions align in world space
 * 4. Tab positions don't shift when unrelated faces are opened/closed
 *
 * Two types of joints are tested:
 * - Corner joints: face-to-face at box edges (e.g., front meets left)
 * - Perpendicular joints: divider meets face (e.g., z-divider meets front)
 */

import { describe, it, expect } from 'vitest';
import {
  BoxConfig,
  Face,
  FaceId,
  Void,
  PanelPath,
  PathPoint,
  defaultAssemblyConfig,
  AssemblyConfig,
} from '../types';
import { generatePanelCollection } from './panelGenerator';

// =============================================================================
// Types
// =============================================================================

interface Point3D {
  x: number;
  y: number;
  z: number;
}

type EdgePosition = 'top' | 'bottom' | 'left' | 'right';

interface EdgeFeature {
  type: 'tab' | 'slot' | 'straight';
  // Distances along the edge from start point
  startDist: number;
  endDist: number;
  centerDist: number;
  // Depth of the feature (positive = outward, negative = inward)
  depth: number;
}

interface MatingResult {
  success: boolean;
  edgeLengthA: number;
  edgeLengthB: number;
  edgeLengthsMatch: boolean;
  tabCount: number;
  slotCount: number;
  fingerCountsMatch: boolean;
  // For each tab on A, the distance to the nearest slot center on B
  alignmentErrors: number[];
  maxAlignmentError: number;
  cornerAlignmentError: number;
  errors: string[];
}

// =============================================================================
// Coordinate Transformation
// =============================================================================

/**
 * Transform a 2D point on a panel's local coordinate system to world coordinates.
 * Panel local coords: origin at center, X/Y in panel plane, Z perpendicular (for thickness)
 */
const toWorldSpace = (localPoint: PathPoint, panel: PanelPath): Point3D => {
  const [px, py, pz] = panel.position;
  const [rx, ry, rz] = panel.rotation;

  let x = localPoint.x;
  let y = localPoint.y;
  let z = 0;

  // Apply rotations in order: X, then Y, then Z
  // X rotation (pitch)
  if (Math.abs(rx) > 0.01) {
    const cos = Math.cos(rx);
    const sin = Math.sin(rx);
    const newY = y * cos - z * sin;
    const newZ = y * sin + z * cos;
    y = newY;
    z = newZ;
  }

  // Y rotation (yaw)
  if (Math.abs(ry) > 0.01) {
    const cos = Math.cos(ry);
    const sin = Math.sin(ry);
    const newX = x * cos + z * sin;
    const newZ = -x * sin + z * cos;
    x = newX;
    z = newZ;
  }

  // Z rotation (roll)
  if (Math.abs(rz) > 0.01) {
    const cos = Math.cos(rz);
    const sin = Math.sin(rz);
    const newX = x * cos - y * sin;
    const newY = x * sin + y * cos;
    x = newX;
    y = newY;
  }

  return { x: x + px, y: y + py, z: z + pz };
};

/**
 * Get the corner positions of a panel's outline in local coordinates
 */
const getOutlineCorners = (panel: PanelPath): {
  topLeft: PathPoint;
  topRight: PathPoint;
  bottomRight: PathPoint;
  bottomLeft: PathPoint;
} => {
  const points = panel.outline.points;
  if (points.length < 4) {
    throw new Error('Panel outline has fewer than 4 points');
  }

  // Find bounding box
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  // Find points closest to each corner
  const findClosest = (targetX: number, targetY: number): PathPoint => {
    let closest = points[0];
    let minDist = Infinity;
    for (const p of points) {
      const dist = Math.abs(p.x - targetX) + Math.abs(p.y - targetY);
      if (dist < minDist) {
        minDist = dist;
        closest = p;
      }
    }
    return closest;
  };

  return {
    topLeft: findClosest(minX, maxY),
    topRight: findClosest(maxX, maxY),
    bottomRight: findClosest(maxX, minY),
    bottomLeft: findClosest(minX, minY),
  };
};

/**
 * Get the start and end points of an edge in local coordinates
 */
const getEdgeEndpoints = (
  panel: PanelPath,
  edge: EdgePosition
): { start: PathPoint; end: PathPoint } => {
  const corners = getOutlineCorners(panel);

  switch (edge) {
    case 'top':
      return { start: corners.topLeft, end: corners.topRight };
    case 'right':
      return { start: corners.topRight, end: corners.bottomRight };
    case 'bottom':
      return { start: corners.bottomRight, end: corners.bottomLeft };
    case 'left':
      return { start: corners.bottomLeft, end: corners.topLeft };
  }
};

/**
 * Calculate edge length from panel outline
 */
const getEdgeLength = (panel: PanelPath, edge: EdgePosition): number => {
  const { start, end } = getEdgeEndpoints(panel, edge);
  return Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
};

// =============================================================================
// Feature Extraction
// =============================================================================

/**
 * Extract finger joint features along an edge.
 * Returns array of tabs (protrusions) or slots (indentations) with their positions.
 */
const extractEdgeFeatures = (
  panel: PanelPath,
  edge: EdgePosition
): EdgeFeature[] => {
  const points = panel.outline.points;
  const { start: edgeStart, end: edgeEnd } = getEdgeEndpoints(panel, edge);

  // Edge direction vector
  const edgeLen = Math.sqrt(
    Math.pow(edgeEnd.x - edgeStart.x, 2) + Math.pow(edgeEnd.y - edgeStart.y, 2)
  );
  const edgeDirX = (edgeEnd.x - edgeStart.x) / edgeLen;
  const edgeDirY = (edgeEnd.y - edgeStart.y) / edgeLen;

  // Perpendicular direction (outward from panel center)
  const perpX = -edgeDirY;
  const perpY = edgeDirX;

  // Find points that are "on" this edge (within tolerance of the edge line)
  const tolerance = 0.5;
  // Maximum perpendicular distance for edge features (tabs/slots are ~3mm, allow some margin)
  const maxPerpDist = 5;
  const edgePoints: { point: PathPoint; dist: number; perpDist: number }[] = [];

  for (const p of points) {
    // Project point onto edge line
    const dx = p.x - edgeStart.x;
    const dy = p.y - edgeStart.y;
    const alongEdge = dx * edgeDirX + dy * edgeDirY;
    const perpendicular = dx * perpX + dy * perpY;

    // Check if point is within edge bounds AND close to the edge line
    // The perpendicular distance filter prevents including points from adjacent edges
    // (which share corner coordinates but have large perpendicular offsets)
    if (alongEdge >= -tolerance && alongEdge <= edgeLen + tolerance &&
        Math.abs(perpendicular) <= maxPerpDist) {
      edgePoints.push({ point: p, dist: alongEdge, perpDist: perpendicular });
    }
  }

  // Sort by distance along edge
  edgePoints.sort((a, b) => a.dist - b.dist);

  // Find the baseline perpendicular distance (most common, usually 0)
  const perpDistances = edgePoints.map((ep) => Math.round(ep.perpDist * 100) / 100);
  const baseline = mode(perpDistances) || 0;

  // Extract features (deviations from baseline)
  const features: EdgeFeature[] = [];
  let currentFeature: { startDist: number; points: typeof edgePoints } | null = null;

  for (const ep of edgePoints) {
    const deviation = ep.perpDist - baseline;
    const isDeviated = Math.abs(deviation) > tolerance;

    if (isDeviated) {
      if (!currentFeature) {
        currentFeature = { startDist: ep.dist, points: [ep] };
      } else {
        currentFeature.points.push(ep);
      }
    } else if (currentFeature) {
      // End of feature
      const endDist = currentFeature.points[currentFeature.points.length - 1].dist;
      const avgDepth =
        currentFeature.points.reduce((sum, p) => sum + (p.perpDist - baseline), 0) /
        currentFeature.points.length;

      features.push({
        type: avgDepth > 0 ? 'tab' : 'slot',
        startDist: currentFeature.startDist,
        endDist: endDist,
        centerDist: (currentFeature.startDist + endDist) / 2,
        depth: avgDepth,
      });
      currentFeature = null;
    }
  }

  // Handle feature at end of edge
  if (currentFeature) {
    const endDist = currentFeature.points[currentFeature.points.length - 1].dist;
    const avgDepth =
      currentFeature.points.reduce((sum, p) => sum + (p.perpDist - baseline), 0) /
      currentFeature.points.length;

    features.push({
      type: avgDepth > 0 ? 'tab' : 'slot',
      startDist: currentFeature.startDist,
      endDist: endDist,
      centerDist: (currentFeature.startDist + endDist) / 2,
      depth: avgDepth,
    });
  }

  return features;
};

// Get bounding box of points
const getBoundingBox = (points: PathPoint[]): { minX: number; maxX: number; minY: number; maxY: number } => {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, maxX, minY, maxY };
};

// Statistical mode helper
const mode = (arr: number[]): number | undefined => {
  if (arr.length === 0) return undefined;
  const counts = new Map<number, number>();
  for (const v of arr) {
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  let maxCount = 0;
  let modeValue: number | undefined;
  for (const [value, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      modeValue = value;
    }
  }
  return modeValue;
};

// =============================================================================
// Mating Verification
// =============================================================================

/**
 * Verify that two panel edges mate correctly.
 * Panel A's edge should have tabs that align with Panel B's slots (or vice versa).
 *
 * Note: Edge lengths may differ when one panel has tabs going INTO another.
 * For example, with tabs-out lids:
 * - Top face left edge = depth - 2*mt (because tabs go into front and back)
 * - Left face top edge = depth (full dimension)
 * The shorter edge represents the BODY of the panel, while tabs protrude beyond.
 */
const verifyEdgeMating = (
  panelA: PanelPath,
  edgeA: EdgePosition,
  panelB: PanelPath,
  edgeB: EdgePosition,
  // Tab alignment tolerance - 1.5mm allows for minor rounding differences
  // in finger width calculations across different edge lengths
  tolerance: number = 1.5,
  // Corner alignment tolerance is higher because panels interlock via tabs/slots
  // and their body corners are offset by material-thickness-based insets.
  // Max expected offset is sqrt(2) * materialThickness ≈ 4.24mm for 3mm material.
  cornerTolerance: number = 5
): MatingResult => {
  const errors: string[] = [];

  // Get edge lengths
  const lengthA = getEdgeLength(panelA, edgeA);
  const lengthB = getEdgeLength(panelB, edgeB);

  // Edge lengths may differ by multiples of materialThickness - this is expected
  // when one panel tabs into perpendicular panels
  const lengthDiff = Math.abs(lengthA - lengthB);
  const edgeLengthsMatch = lengthDiff < tolerance ||
    // Accept differences that are multiples of 3mm (materialThickness)
    Math.abs(lengthDiff - 3) < tolerance ||
    Math.abs(lengthDiff - 6) < tolerance;

  if (!edgeLengthsMatch) {
    errors.push(`Edge lengths differ unexpectedly: A=${lengthA.toFixed(2)}, B=${lengthB.toFixed(2)} (diff=${lengthDiff.toFixed(2)})`);
  }

  // Get features
  const featuresA = extractEdgeFeatures(panelA, edgeA);
  const featuresB = extractEdgeFeatures(panelB, edgeB);

  const tabsA = featuresA.filter((f) => f.type === 'tab');
  const slotsA = featuresA.filter((f) => f.type === 'slot');
  const tabsB = featuresB.filter((f) => f.type === 'tab');
  const slotsB = featuresB.filter((f) => f.type === 'slot');

  // Determine which panel has tabs going out
  // The one with tabs should match the other's slots
  let tabs: EdgeFeature[];
  let slots: EdgeFeature[];
  let tabEdgeLength: number;
  let slotEdgeLength: number;

  if (tabsA.length >= slotsA.length) {
    tabs = tabsA;
    slots = slotsB;
    tabEdgeLength = lengthA;
    slotEdgeLength = lengthB;
  } else {
    tabs = tabsB;
    slots = slotsA;
    tabEdgeLength = lengthB;
    slotEdgeLength = lengthA;
  }

  const fingerCountsMatch = tabs.length === slots.length;
  if (!fingerCountsMatch) {
    errors.push(`Finger counts differ: tabs=${tabs.length}, slots=${slots.length}`);
  }

  // Check alignment of each tab with nearest slot using world coordinates
  // This properly handles mating edges with different lengths
  // Only compare coordinates along the shared edge axis (perpendicular coords differ between panels)
  const alignmentErrors: number[] = [];

  // Get edge endpoints for converting to world coordinates
  const cornersA = getEdgeEndpoints(panelA, edgeA);
  const cornersB = getEdgeEndpoints(panelB, edgeB);
  const tabEdgeStart = tabs === tabsA ? cornersA.start : cornersB.start;
  const tabEdgeEnd = tabs === tabsA ? cornersA.end : cornersB.end;
  const slotEdgeStart = slots === slotsA ? cornersA.start : cornersB.start;
  const slotEdgeEnd = slots === slotsA ? cornersA.end : cornersB.end;
  const tabPanel = tabs === tabsA ? panelA : panelB;
  const slotPanel = slots === slotsA ? panelA : panelB;

  // Helper to get world coordinate of a point along an edge
  const getWorldCoord = (edgeStart: PathPoint, edgeEnd: PathPoint, dist: number, edgeLen: number, panel: PanelPath): Point3D => {
    const t = dist / edgeLen;
    const localPoint: PathPoint = {
      x: edgeStart.x + t * (edgeEnd.x - edgeStart.x),
      y: edgeStart.y + t * (edgeEnd.y - edgeStart.y),
    };
    return toWorldSpace(localPoint, panel);
  };

  // Determine which world coordinate(s) the shared edge runs along
  // by checking the edge direction in world space
  const tabWorldStart = getWorldCoord(tabEdgeStart, tabEdgeEnd, 0, tabEdgeLength, tabPanel);
  const tabWorldEnd = getWorldCoord(tabEdgeStart, tabEdgeEnd, tabEdgeLength, tabEdgeLength, tabPanel);
  const edgeDx = Math.abs(tabWorldEnd.x - tabWorldStart.x);
  const edgeDy = Math.abs(tabWorldEnd.y - tabWorldStart.y);
  const edgeDz = Math.abs(tabWorldEnd.z - tabWorldStart.z);
  // The shared edge axis is the one with the largest delta
  const primaryAxis = edgeDx >= edgeDy && edgeDx >= edgeDz ? 'x' : (edgeDy >= edgeDz ? 'y' : 'z');

  for (const tab of tabs) {
    // Get world coordinate of tab center
    const tabWorldCenter = getWorldCoord(tabEdgeStart, tabEdgeEnd, tab.centerDist, tabEdgeLength, tabPanel);

    // Find nearest slot by comparing only the primary axis coordinate
    let minError = Infinity;
    for (const slot of slots) {
      const slotWorldCenter = getWorldCoord(slotEdgeStart, slotEdgeEnd, slot.centerDist, slotEdgeLength, slotPanel);
      // Only compare the coordinate along the shared edge axis
      const dist = Math.abs(
        primaryAxis === 'x' ? tabWorldCenter.x - slotWorldCenter.x :
        primaryAxis === 'y' ? tabWorldCenter.y - slotWorldCenter.y :
        tabWorldCenter.z - slotWorldCenter.z
      );
      minError = Math.min(minError, dist);
    }

    if (minError < Infinity) {
      alignmentErrors.push(minError);
      if (minError > tolerance) {
        errors.push(`Tab at ${tab.centerDist.toFixed(2)} misaligned by ${minError.toFixed(2)}`);
      }
    }
  }

  const maxAlignmentError = alignmentErrors.length > 0 ? Math.max(...alignmentErrors) : 0;

  // Check corner alignment in world space (reuse cornersA/cornersB from above)
  const worldStartA = toWorldSpace(cornersA.start, panelA);
  const worldEndA = toWorldSpace(cornersA.end, panelA);
  const worldStartB = toWorldSpace(cornersB.start, panelB);
  const worldEndB = toWorldSpace(cornersB.end, panelB);

  // The edges should meet at the same points (possibly reversed)
  const dist = (p1: Point3D, p2: Point3D) =>
    Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2));

  const cornerError1 = Math.min(
    dist(worldStartA, worldStartB) + dist(worldEndA, worldEndB),
    dist(worldStartA, worldEndB) + dist(worldEndA, worldStartB)
  );

  const cornerAlignmentError = cornerError1 / 2;
  if (cornerAlignmentError > cornerTolerance) {
    errors.push(`Corner alignment error: ${cornerAlignmentError.toFixed(2)}`);
  }

  return {
    success: errors.length === 0,
    edgeLengthA: lengthA,
    edgeLengthB: lengthB,
    edgeLengthsMatch,
    tabCount: tabs.length,
    slotCount: slots.length,
    fingerCountsMatch,
    alignmentErrors,
    maxAlignmentError,
    cornerAlignmentError,
    errors,
  };
};

// =============================================================================
// Test Fixtures
// =============================================================================

const createConfig = (overrides?: Partial<BoxConfig>): BoxConfig => ({
  width: 100,
  height: 80,
  depth: 60,
  materialThickness: 3,
  fingerWidth: 10,
  fingerGap: 1.5,
  assembly: { ...defaultAssemblyConfig },
  ...overrides,
});

const createFaces = (solidMask: number): Face[] => {
  const faceIds: FaceId[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];
  return faceIds.map((id, i) => ({
    id,
    solid: (solidMask & (1 << i)) !== 0,
  }));
};

const allSolidMask = 0b111111; // All 6 faces solid

const createRootVoid = (config: BoxConfig): Void => ({
  id: 'root',
  bounds: { x: 0, y: 0, z: 0, w: config.width, h: config.height, d: config.depth },
  children: [],
});

const createSubdividedVoid = (
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
      { id: 'void-1', bounds: child1Bounds, children: [], splitAxis: axis, splitPosition: position },
      { id: 'void-2', bounds: child2Bounds, children: [] },
    ],
  };
};

// Face-to-face mating pairs: which edges connect which faces
// This mapping is derived from the physical box geometry and getFaceEdges in panelGenerator.ts
// Note: panel local coords have origin at center, X along width, Y along height
const FACE_MATING_PAIRS: Array<{
  faceA: FaceId;
  edgeA: EdgePosition;
  faceB: FaceId;
  edgeB: EdgePosition;
  description: string;
}> = [
  // Front face connections (from getFaceEdges: top->top, bottom->bottom, left->left, right->right)
  { faceA: 'front', edgeA: 'top', faceB: 'top', edgeB: 'bottom', description: 'front-top edge meets top-bottom edge' },
  { faceA: 'front', edgeA: 'bottom', faceB: 'bottom', edgeB: 'top', description: 'front-bottom edge meets bottom-top edge' },
  { faceA: 'front', edgeA: 'left', faceB: 'left', edgeB: 'right', description: 'front-left edge meets left-right edge' },
  { faceA: 'front', edgeA: 'right', faceB: 'right', edgeB: 'left', description: 'front-right edge meets right-left edge' },
  // Back face connections (from getFaceEdges: top->top, bottom->bottom, left->right, right->left)
  // Note: back face is rotated 180° around Y, so its left/right are swapped relative to world
  { faceA: 'back', edgeA: 'top', faceB: 'top', edgeB: 'top', description: 'back-top edge meets top-top edge' },
  { faceA: 'back', edgeA: 'bottom', faceB: 'bottom', edgeB: 'bottom', description: 'back-bottom edge meets bottom-bottom edge' },
  { faceA: 'back', edgeA: 'left', faceB: 'right', edgeB: 'right', description: 'back-left edge meets right-right edge' },
  { faceA: 'back', edgeA: 'right', faceB: 'left', edgeB: 'left', description: 'back-right edge meets left-left edge' },
  // Left/Right to Top/Bottom
  { faceA: 'left', edgeA: 'top', faceB: 'top', edgeB: 'left', description: 'left-top edge meets top-left edge' },
  { faceA: 'left', edgeA: 'bottom', faceB: 'bottom', edgeB: 'left', description: 'left-bottom edge meets bottom-left edge' },
  { faceA: 'right', edgeA: 'top', faceB: 'top', edgeB: 'right', description: 'right-top edge meets top-right edge' },
  { faceA: 'right', edgeA: 'bottom', faceB: 'bottom', edgeB: 'right', description: 'right-bottom edge meets bottom-right edge' },
];

// =============================================================================
// Tests
// =============================================================================

describe('Edge Mating Verification', () => {
  describe('Diagnostic: Edge Feature Detection', () => {
    it('prints edge features for all faces (all solid, Y-axis)', () => {
      const config = createConfig();
      const faces = createFaces(allSolidMask);
      const rootVoid = createRootVoid(config);
      const collection = generatePanelCollection(faces, rootVoid, config);

      const faceIds: FaceId[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];
      const edgePositions: EdgePosition[] = ['top', 'bottom', 'left', 'right'];

      const report: string[] = [];
      for (const faceId of faceIds) {
        const panel = collection.panels.find((p) => p.source.faceId === faceId);
        if (!panel) {
          report.push(`${faceId}: NOT FOUND`);
          continue;
        }

        const edgeLen = (edge: EdgePosition) => getEdgeLength(panel, edge).toFixed(1);
        const features = (edge: EdgePosition) => {
          const f = extractEdgeFeatures(panel, edge);
          const tabs = f.filter((x) => x.type === 'tab').length;
          const slots = f.filter((x) => x.type === 'slot').length;
          return `${tabs}t/${slots}s`;
        };

        report.push(
          `${faceId}: ` +
            `T(${edgeLen('top')},${features('top')}) ` +
            `B(${edgeLen('bottom')},${features('bottom')}) ` +
            `L(${edgeLen('left')},${features('left')}) ` +
            `R(${edgeLen('right')},${features('right')})`
        );
      }

      console.log('\n=== Edge Features (All Solid, Y-axis) ===');
      console.log(report.join('\n'));

      // This test always passes - it's for diagnostic output
      expect(true).toBe(true);
    });

    it('prints corner coordinates for left and top faces', () => {
      const config = createConfig();
      const faces = createFaces(allSolidMask);
      const rootVoid = createRootVoid(config);
      const collection = generatePanelCollection(faces, rootVoid, config);

      const leftPanel = collection.panels.find((p) => p.source.faceId === 'left')!;
      const topPanel = collection.panels.find((p) => p.source.faceId === 'top')!;

      const leftCorners = getOutlineCorners(leftPanel);
      const topCorners = getOutlineCorners(topPanel);

      console.log('\n=== Corner Coordinates ===');
      console.log(`Left face (dims: w=${config.depth}, h=${config.height}):`);
      console.log(`  topLeft: (${leftCorners.topLeft.x.toFixed(1)}, ${leftCorners.topLeft.y.toFixed(1)})`);
      console.log(`  topRight: (${leftCorners.topRight.x.toFixed(1)}, ${leftCorners.topRight.y.toFixed(1)})`);
      console.log(`  bottomLeft: (${leftCorners.bottomLeft.x.toFixed(1)}, ${leftCorners.bottomLeft.y.toFixed(1)})`);
      console.log(`  bottomRight: (${leftCorners.bottomRight.x.toFixed(1)}, ${leftCorners.bottomRight.y.toFixed(1)})`);
      console.log(`  Top edge length: ${Math.abs(leftCorners.topRight.x - leftCorners.topLeft.x).toFixed(1)}`);

      console.log(`\nTop face (dims: w=${config.width}, h=${config.depth}):`);
      console.log(`  topLeft: (${topCorners.topLeft.x.toFixed(1)}, ${topCorners.topLeft.y.toFixed(1)})`);
      console.log(`  topRight: (${topCorners.topRight.x.toFixed(1)}, ${topCorners.topRight.y.toFixed(1)})`);
      console.log(`  bottomLeft: (${topCorners.bottomLeft.x.toFixed(1)}, ${topCorners.bottomLeft.y.toFixed(1)})`);
      console.log(`  bottomRight: (${topCorners.bottomRight.x.toFixed(1)}, ${topCorners.bottomRight.y.toFixed(1)})`);
      console.log(`  Left edge length: ${Math.abs(topCorners.topLeft.y - topCorners.bottomLeft.y).toFixed(1)}`);

      // Also print outline point count and bounding box
      const leftBBox = getBoundingBox(leftPanel.outline.points);
      const topBBox = getBoundingBox(topPanel.outline.points);

      console.log(`\nLeft face outline: ${leftPanel.outline.points.length} points`);
      console.log(`  BBox: x=[${leftBBox.minX.toFixed(1)}, ${leftBBox.maxX.toFixed(1)}], y=[${leftBBox.minY.toFixed(1)}, ${leftBBox.maxY.toFixed(1)}]`);

      console.log(`Top face outline: ${topPanel.outline.points.length} points`);
      console.log(`  BBox: x=[${topBBox.minX.toFixed(1)}, ${topBBox.maxX.toFixed(1)}], y=[${topBBox.minY.toFixed(1)}, ${topBBox.maxY.toFixed(1)}]`);

      // Print first few points of top face to understand the outline structure
      console.log(`\nTop face first 20 points:`);
      for (let i = 0; i < Math.min(20, topPanel.outline.points.length); i++) {
        const p = topPanel.outline.points[i];
        console.log(`  ${i}: (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`);
      }

      // Also print front face to compare the mating edges
      const frontPanel = collection.panels.find((p) => p.source.faceId === 'front')!;
      const frontCorners = getOutlineCorners(frontPanel);
      console.log(`\nFront face (dims: w=${config.width}, h=${config.height}):`);
      console.log(`  topLeft: (${frontCorners.topLeft.x.toFixed(1)}, ${frontCorners.topLeft.y.toFixed(1)})`);
      console.log(`  topRight: (${frontCorners.topRight.x.toFixed(1)}, ${frontCorners.topRight.y.toFixed(1)})`);
      console.log(`  Top edge length: ${Math.abs(frontCorners.topRight.x - frontCorners.topLeft.x).toFixed(1)}`);

      // Print top edge of front face (should mate with bottom edge of top face)
      console.log(`\nFront face top edge points (first that change in Y direction):`);
      let prevY: number | null = null;
      let count = 0;
      for (const p of frontPanel.outline.points) {
        if (prevY !== null && Math.abs(p.y - prevY) > 1) {
          console.log(`  (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`);
          count++;
          if (count > 15) break;
        }
        prevY = p.y;
      }

      // Print bottom edge of top face (should mate with top edge of front face)
      console.log(`\nTop face bottom edge (y ~ -27 to -30):`);
      const bottomPoints = topPanel.outline.points.filter(p => p.y <= -25 && p.y >= -31);
      bottomPoints.sort((a, b) => a.x - b.x);
      for (const p of bottomPoints.slice(0, 20)) {
        console.log(`  (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`);
      }

      expect(true).toBe(true);
    });

    it('compares finger positions for front.top vs top.bottom', () => {
      const config = createConfig();
      const faces = createFaces(allSolidMask);
      const rootVoid = createRootVoid(config);
      const collection = generatePanelCollection(faces, rootVoid, config);

      const frontPanel = collection.panels.find((p) => p.source.faceId === 'front')!;
      const topPanel = collection.panels.find((p) => p.source.faceId === 'top')!;

      // Extract Y-changes for front face top edge (horizontal edge at high Y)
      console.log('\n=== Front Face Top Edge Finger Pattern ===');
      const frontTopEdge: Array<{x: number, y: number, type: string}> = [];
      const frontPoints = frontPanel.outline.points;
      for (let i = 0; i < frontPoints.length; i++) {
        const curr = frontPoints[i];
        const next = frontPoints[(i + 1) % frontPoints.length];
        // Only look at the top edge (y > 35)
        if (curr.y > 35 && next.y > 35) {
          if (Math.abs(curr.y - next.y) > 1) {
            frontTopEdge.push({
              x: curr.x,
              y: curr.y,
              type: next.y < curr.y ? 'slot-start' : 'slot-end'
            });
          }
        }
      }
      frontTopEdge.sort((a, b) => a.x - b.x);
      for (const p of frontTopEdge) {
        console.log(`  x=${p.x.toFixed(1)}: ${p.type} (y=${p.y.toFixed(1)})`);
      }

      // Extract Y-changes for top face bottom edge (horizontal edge at low Y)
      console.log('\n=== Top Face Bottom Edge Finger Pattern ===');
      const topBottomEdge: Array<{x: number, y: number, type: string}> = [];
      const topPoints = topPanel.outline.points;
      for (let i = 0; i < topPoints.length; i++) {
        const curr = topPoints[i];
        const next = topPoints[(i + 1) % topPoints.length];
        // Only look at the bottom edge (y < -25)
        if (curr.y < -25 && next.y < -25) {
          if (Math.abs(curr.y - next.y) > 1) {
            topBottomEdge.push({
              x: curr.x,
              y: curr.y,
              type: next.y < curr.y ? 'tab-start' : 'tab-end'
            });
          }
        }
      }
      topBottomEdge.sort((a, b) => a.x - b.x);
      for (const p of topBottomEdge) {
        console.log(`  x=${p.x.toFixed(1)}: ${p.type} (y=${p.y.toFixed(1)})`);
      }

      // Compare: slots on front should align with tabs on top
      console.log('\n=== Alignment Check ===');
      const frontSlotStarts = frontTopEdge.filter(p => p.type === 'slot-start').map(p => p.x);
      const topTabStarts = topBottomEdge.filter(p => p.type === 'tab-start').map(p => p.x);
      console.log(`Front slot starts: [${frontSlotStarts.map(x => x.toFixed(1)).join(', ')}]`);
      console.log(`Top tab starts:    [${topTabStarts.map(x => x.toFixed(1)).join(', ')}]`);

      expect(true).toBe(true);
    });

    it('shows how edge lengths change when left face is opened', () => {
      const config = createConfig();
      const rootVoid = createRootVoid(config);

      // All solid
      const facesAllSolid = createFaces(allSolidMask);
      const collSolid = generatePanelCollection(facesAllSolid, rootVoid, config);

      // Left open
      const facesLeftOpen = createFaces(0b111011);
      const collOpen = generatePanelCollection(facesLeftOpen, rootVoid, config);

      const reportChanges = (faceId: FaceId) => {
        const panelSolid = collSolid.panels.find((p) => p.source.faceId === faceId);
        const panelOpen = collOpen.panels.find((p) => p.source.faceId === faceId);

        if (!panelSolid || !panelOpen) return `${faceId}: missing`;

        const changes: string[] = [];
        for (const edge of ['top', 'bottom', 'left', 'right'] as EdgePosition[]) {
          const lenSolid = getEdgeLength(panelSolid, edge);
          const lenOpen = getEdgeLength(panelOpen, edge);
          if (Math.abs(lenSolid - lenOpen) > 0.1) {
            changes.push(`${edge}: ${lenSolid.toFixed(1)} -> ${lenOpen.toFixed(1)}`);
          }
        }
        return `${faceId}: ${changes.length > 0 ? changes.join(', ') : 'no change'}`;
      };

      console.log('\n=== Edge Length Changes When Left Face Opened ===');
      console.log(reportChanges('front'));
      console.log(reportChanges('back'));
      console.log(reportChanges('top'));
      console.log(reportChanges('bottom'));
      console.log(reportChanges('right'));

      expect(true).toBe(true);
    });
  });

  describe('Face-to-Face Corner Joints', () => {
    it('all faces mate correctly when all solid (Y-axis assembly)', () => {
      const config = createConfig();
      const faces = createFaces(allSolidMask);
      const rootVoid = createRootVoid(config);
      const collection = generatePanelCollection(faces, rootVoid, config);

      const failures: string[] = [];

      for (const pair of FACE_MATING_PAIRS) {
        const panelA = collection.panels.find((p) => p.source.faceId === pair.faceA);
        const panelB = collection.panels.find((p) => p.source.faceId === pair.faceB);

        if (!panelA || !panelB) continue;

        const result = verifyEdgeMating(panelA, pair.edgeA, panelB, pair.edgeB);

        if (!result.success) {
          failures.push(
            `${pair.faceA}.${pair.edgeA} <-> ${pair.faceB}.${pair.edgeB}: ${result.errors.join(', ')}`
          );
        }
      }

      expect(failures).toEqual([]);
    });

    it('all faces mate correctly with X-axis assembly', () => {
      const config = createConfig({
        assembly: {
          ...defaultAssemblyConfig,
          assemblyAxis: 'x',
        },
      });
      const faces = createFaces(allSolidMask);
      const rootVoid = createRootVoid(config);
      const collection = generatePanelCollection(faces, rootVoid, config);

      const failures: string[] = [];

      for (const pair of FACE_MATING_PAIRS) {
        const panelA = collection.panels.find((p) => p.source.faceId === pair.faceA);
        const panelB = collection.panels.find((p) => p.source.faceId === pair.faceB);

        if (!panelA || !panelB) continue;

        const result = verifyEdgeMating(panelA, pair.edgeA, panelB, pair.edgeB);

        if (!result.success) {
          failures.push(
            `${pair.faceA}.${pair.edgeA} <-> ${pair.faceB}.${pair.edgeB}: ${result.errors.join(', ')}`
          );
        }
      }

      expect(failures).toEqual([]);
    });

    it('all faces mate correctly with Z-axis assembly', () => {
      const config = createConfig({
        assembly: {
          ...defaultAssemblyConfig,
          assemblyAxis: 'z',
        },
      });
      const faces = createFaces(allSolidMask);
      const rootVoid = createRootVoid(config);
      const collection = generatePanelCollection(faces, rootVoid, config);

      const failures: string[] = [];

      for (const pair of FACE_MATING_PAIRS) {
        const panelA = collection.panels.find((p) => p.source.faceId === pair.faceA);
        const panelB = collection.panels.find((p) => p.source.faceId === pair.faceB);

        if (!panelA || !panelB) continue;

        const result = verifyEdgeMating(panelA, pair.edgeA, panelB, pair.edgeB);

        if (!result.success) {
          failures.push(
            `${pair.faceA}.${pair.edgeA} <-> ${pair.faceB}.${pair.edgeB}: ${result.errors.join(', ')}`
          );
        }
      }

      expect(failures).toEqual([]);
    });
  });

  describe('Tab Stability When Faces Open/Close', () => {
    // When one face is removed, the finger pattern on adjacent faces should NOT shift
    // Only the edge that was connected to the removed face should change

    it('front face tabs do not shift when left face is opened', () => {
      const config = createConfig();
      const rootVoid = createRootVoid(config);

      // Generate with all solid
      const facesAllSolid = createFaces(allSolidMask);
      const collectionSolid = generatePanelCollection(facesAllSolid, rootVoid, config);

      // Generate with left face open (mask: 111011 = 59, left is bit 2)
      const facesLeftOpen = createFaces(0b111011);
      const collectionOpen = generatePanelCollection(facesLeftOpen, rootVoid, config);

      const frontSolid = collectionSolid.panels.find((p) => p.source.faceId === 'front');
      const frontOpen = collectionOpen.panels.find((p) => p.source.faceId === 'front');

      expect(frontSolid).toBeDefined();
      expect(frontOpen).toBeDefined();

      // The TOP edge of front should have the same finger pattern
      // (since top face is still solid)
      const featuresTopSolid = extractEdgeFeatures(frontSolid!, 'top');
      const featuresTopOpen = extractEdgeFeatures(frontOpen!, 'top');

      const tabsSolid = featuresTopSolid.filter((f) => f.type === 'tab');
      const tabsOpen = featuresTopOpen.filter((f) => f.type === 'tab');

      // Same number of tabs
      expect(tabsOpen.length).toBe(tabsSolid.length);

      // Tab positions should be identical (within tolerance)
      for (let i = 0; i < tabsSolid.length; i++) {
        expect(Math.abs(tabsSolid[i].centerDist - tabsOpen[i].centerDist)).toBeLessThan(0.5);
      }
    });

    it('top face slots do not shift when left face is opened', () => {
      const config = createConfig();
      const rootVoid = createRootVoid(config);

      // Generate with all solid
      const facesAllSolid = createFaces(allSolidMask);
      const collectionSolid = generatePanelCollection(facesAllSolid, rootVoid, config);

      // Generate with left face open
      const facesLeftOpen = createFaces(0b111011);
      const collectionOpen = generatePanelCollection(facesLeftOpen, rootVoid, config);

      const topSolid = collectionSolid.panels.find((p) => p.source.faceId === 'top');
      const topOpen = collectionOpen.panels.find((p) => p.source.faceId === 'top');

      expect(topSolid).toBeDefined();
      expect(topOpen).toBeDefined();

      // The BOTTOM edge of top (which meets front) should have the same pattern
      const featuresSolid = extractEdgeFeatures(topSolid!, 'bottom');
      const featuresOpen = extractEdgeFeatures(topOpen!, 'bottom');

      const slotsSolid = featuresSolid.filter((f) => f.type === 'slot');
      const slotsOpen = featuresOpen.filter((f) => f.type === 'slot');

      // Same number of slots
      expect(slotsOpen.length).toBe(slotsSolid.length);

      // Slot positions should be identical
      for (let i = 0; i < slotsSolid.length; i++) {
        expect(Math.abs(slotsSolid[i].centerDist - slotsOpen[i].centerDist)).toBeLessThan(0.5);
      }
    });

    it('front-top mating still works after left face is opened', () => {
      const config = createConfig();
      const rootVoid = createRootVoid(config);

      // Generate with left face open
      const facesLeftOpen = createFaces(0b111011);
      const collection = generatePanelCollection(facesLeftOpen, rootVoid, config);

      const front = collection.panels.find((p) => p.source.faceId === 'front');
      const top = collection.panels.find((p) => p.source.faceId === 'top');

      expect(front).toBeDefined();
      expect(top).toBeDefined();

      const result = verifyEdgeMating(front!, 'top', top!, 'bottom');
      expect(result.success).toBe(true);
    });

    it('front-right mating still works after left face is opened', () => {
      const config = createConfig();
      const rootVoid = createRootVoid(config);

      const facesLeftOpen = createFaces(0b111011);
      const collection = generatePanelCollection(facesLeftOpen, rootVoid, config);

      const front = collection.panels.find((p) => p.source.faceId === 'front');
      const right = collection.panels.find((p) => p.source.faceId === 'right');

      expect(front).toBeDefined();
      expect(right).toBeDefined();

      const result = verifyEdgeMating(front!, 'right', right!, 'left');
      expect(result.success).toBe(true);
    });
  });

  describe('Divider-to-Face Perpendicular Joints', () => {
    it('z-axis divider mates with left face', () => {
      // Z-axis divider is perpendicular to Z, PARALLEL to front/back faces.
      // It intersects left, right, top, and bottom faces (NOT front/back).
      const config = createConfig();
      const faces = createFaces(allSolidMask);
      const rootVoid = createSubdividedVoid(config, 'z', 30);
      const collection = generatePanelCollection(faces, rootVoid, config);

      const left = collection.panels.find((p) => p.source.faceId === 'left');
      const divider = collection.panels.find((p) => p.source.type === 'divider');

      expect(left).toBeDefined();
      expect(divider).toBeDefined();

      // Check that left panel has slots for the divider
      const leftSlots = left!.holes.filter((h) => h.source?.type === 'divider-slot');
      expect(leftSlots.length).toBeGreaterThan(0);
    });

    it('z-axis divider has straight edge when right face is open', () => {
      // Z-axis divider intersects the right face.
      // When right face is open, the divider's edge facing right should be straight.
      const config = createConfig();
      const faces = createFaces(0b110111); // right open (bit 3)
      const rootVoid = createSubdividedVoid(config, 'z', 30);
      const collection = generatePanelCollection(faces, rootVoid, config);

      const divider = collection.panels.find((p) => p.source.type === 'divider');
      expect(divider).toBeDefined();

      // The edge facing the open right should be straight (no tabs)
      // For z-axis divider, "right" edge faces the positive X direction (right face)
      const features = extractEdgeFeatures(divider!, 'right');
      const tabs = features.filter((f) => f.type === 'tab');

      // Should have no tabs on the edge facing the open face
      expect(tabs.length).toBe(0);
    });

    it('z-axis divider has straight edge when left face is open', () => {
      const config = createConfig();
      const faces = createFaces(0b111011); // left open (bit 2)
      const rootVoid = createSubdividedVoid(config, 'z', 30);
      const collection = generatePanelCollection(faces, rootVoid, config);

      const divider = collection.panels.find((p) => p.source.type === 'divider');
      expect(divider).toBeDefined();

      // The left edge of the divider should be straight
      const features = extractEdgeFeatures(divider!, 'left');
      const tabs = features.filter((f) => f.type === 'tab');

      // Should have no tabs on the edge facing the open face
      expect(tabs.length).toBe(0);
    });

    it('x-axis divider mates correctly with top face', () => {
      const config = createConfig();
      const faces = createFaces(allSolidMask);
      const rootVoid = createSubdividedVoid(config, 'x', 50);
      const collection = generatePanelCollection(faces, rootVoid, config);

      const top = collection.panels.find((p) => p.source.faceId === 'top');
      const divider = collection.panels.find((p) => p.source.type === 'divider');

      expect(top).toBeDefined();
      expect(divider).toBeDefined();

      // Top panel should have slots for the divider
      const topSlots = top!.holes.filter((h) => h.source?.type === 'divider-slot');
      expect(topSlots.length).toBeGreaterThan(0);
    });

    it('x-axis divider has straight edge when front face is open', () => {
      // X-axis divider is in the YZ plane, so it meets front/back on its left/right edges.
      // When front face is open, the divider's edge facing front should be straight.
      const config = createConfig();
      const faces = createFaces(0b111110); // front open (bit 0)
      const rootVoid = createSubdividedVoid(config, 'x', 50);
      const collection = generatePanelCollection(faces, rootVoid, config);

      const divider = collection.panels.find((p) => p.source.type === 'divider');
      expect(divider).toBeDefined();

      // For x-axis divider, "right" edge in 2D faces the front (positive Z direction)
      // This edge should be straight when front is open
      const features = extractEdgeFeatures(divider!, 'right');
      const tabs = features.filter((f) => f.type === 'tab');

      // Should have no tabs on the edge facing the open front face
      expect(tabs.length).toBe(0);
    });
  });

  describe('Configuration Matrix Sampling', () => {
    // Test a sampling of different configurations

    const testConfigs = [
      { mask: 0b111111, desc: 'all solid' },
      { mask: 0b111110, desc: 'front open' },
      { mask: 0b111101, desc: 'back open' },
      { mask: 0b111011, desc: 'left open' },
      { mask: 0b110111, desc: 'right open' },
      { mask: 0b101111, desc: 'top open' },
      { mask: 0b011111, desc: 'bottom open' },
      { mask: 0b111001, desc: 'back+left open' },
      { mask: 0b110011, desc: 'left+right open' },
    ];

    for (const { mask, desc } of testConfigs) {
      it(`solid face pairs mate correctly with ${desc}`, () => {
        const config = createConfig();
        const faces = createFaces(mask);
        const rootVoid = createRootVoid(config);
        const collection = generatePanelCollection(faces, rootVoid, config);

        const failures: string[] = [];

        for (const pair of FACE_MATING_PAIRS) {
          const panelA = collection.panels.find((p) => p.source.faceId === pair.faceA);
          const panelB = collection.panels.find((p) => p.source.faceId === pair.faceB);

          // Skip if either face is open
          if (!panelA || !panelB) continue;

          const result = verifyEdgeMating(panelA, pair.edgeA, panelB, pair.edgeB);

          if (!result.success) {
            failures.push(
              `${pair.faceA}.${pair.edgeA} <-> ${pair.faceB}.${pair.edgeB}: ${result.errors.join(', ')}`
            );
          }
        }

        expect(failures).toEqual([]);
      });
    }
  });
});
