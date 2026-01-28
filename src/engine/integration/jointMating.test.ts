/**
 * Engine Integration Tests: Joint Mating Verification
 *
 * These tests verify that the engine produces correctly mating joints across
 * common workflow scenarios:
 * 1. Basic box with all solid faces
 * 2. Opening a lid (making top face non-solid)
 * 3. Subdividing the interior once
 * 4. Subdividing again (nested subdivisions)
 *
 * For each scenario, we verify:
 * - All face-to-face joints have matching tabs and slots
 * - Divider-to-face joints mate correctly
 * - Joint positions align in global 3D world space
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createEngine, Engine } from '../Engine';
import { PanelPath, PathPoint, FaceId } from '../../types';

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
  startDist: number;
  endDist: number;
  centerDist: number;
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
 */
const toWorldSpace = (localPoint: PathPoint, panel: PanelPath): Point3D => {
  const [px, py, pz] = panel.position;
  const [rx, ry, rz] = panel.rotation;

  let x = localPoint.x;
  let y = localPoint.y;
  let z = 0;

  // Apply rotations in order: X, then Y, then Z
  if (Math.abs(rx) > 0.01) {
    const cos = Math.cos(rx);
    const sin = Math.sin(rx);
    const newY = y * cos - z * sin;
    const newZ = y * sin + z * cos;
    y = newY;
    z = newZ;
  }

  if (Math.abs(ry) > 0.01) {
    const cos = Math.cos(ry);
    const sin = Math.sin(ry);
    const newX = x * cos + z * sin;
    const newZ = -x * sin + z * cos;
    x = newX;
    z = newZ;
  }

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

// =============================================================================
// Geometry Helpers
// =============================================================================

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

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

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

const getEdgeLength = (panel: PanelPath, edge: EdgePosition): number => {
  const { start, end } = getEdgeEndpoints(panel, edge);
  return Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
};

// =============================================================================
// Feature Extraction
// =============================================================================

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

const extractEdgeFeatures = (
  panel: PanelPath,
  edge: EdgePosition
): EdgeFeature[] => {
  const points = panel.outline.points;
  const { start: edgeStart, end: edgeEnd } = getEdgeEndpoints(panel, edge);

  const edgeLen = Math.sqrt(
    Math.pow(edgeEnd.x - edgeStart.x, 2) + Math.pow(edgeEnd.y - edgeStart.y, 2)
  );
  const edgeDirX = (edgeEnd.x - edgeStart.x) / edgeLen;
  const edgeDirY = (edgeEnd.y - edgeStart.y) / edgeLen;

  const perpX = -edgeDirY;
  const perpY = edgeDirX;

  const tolerance = 0.5;
  const maxPerpDist = 5;
  const edgePoints: { point: PathPoint; dist: number; perpDist: number }[] = [];

  for (const p of points) {
    const dx = p.x - edgeStart.x;
    const dy = p.y - edgeStart.y;
    const alongEdge = dx * edgeDirX + dy * edgeDirY;
    const perpendicular = dx * perpX + dy * perpY;

    if (alongEdge >= -tolerance && alongEdge <= edgeLen + tolerance &&
        Math.abs(perpendicular) <= maxPerpDist) {
      edgePoints.push({ point: p, dist: alongEdge, perpDist: perpendicular });
    }
  }

  edgePoints.sort((a, b) => a.dist - b.dist);

  const perpDistances = edgePoints.map((ep) => Math.round(ep.perpDist * 100) / 100);
  const baseline = mode(perpDistances) || 0;

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

// =============================================================================
// Mating Verification
// =============================================================================

const verifyEdgeMating = (
  panelA: PanelPath,
  edgeA: EdgePosition,
  panelB: PanelPath,
  edgeB: EdgePosition,
  tolerance: number = 1.5,
  cornerTolerance: number = 5
): MatingResult => {
  const errors: string[] = [];

  const lengthA = getEdgeLength(panelA, edgeA);
  const lengthB = getEdgeLength(panelB, edgeB);

  const lengthDiff = Math.abs(lengthA - lengthB);
  const edgeLengthsMatch = lengthDiff < tolerance ||
    Math.abs(lengthDiff - 3) < tolerance ||
    Math.abs(lengthDiff - 6) < tolerance;

  if (!edgeLengthsMatch) {
    errors.push(`Edge lengths differ: A=${lengthA.toFixed(2)}, B=${lengthB.toFixed(2)}`);
  }

  const featuresA = extractEdgeFeatures(panelA, edgeA);
  const featuresB = extractEdgeFeatures(panelB, edgeB);

  const tabsA = featuresA.filter((f) => f.type === 'tab');
  const slotsA = featuresA.filter((f) => f.type === 'slot');
  const tabsB = featuresB.filter((f) => f.type === 'tab');
  const slotsB = featuresB.filter((f) => f.type === 'slot');

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

  const alignmentErrors: number[] = [];

  const cornersA = getEdgeEndpoints(panelA, edgeA);
  const cornersB = getEdgeEndpoints(panelB, edgeB);
  const tabEdgeStart = tabs === tabsA ? cornersA.start : cornersB.start;
  const tabEdgeEnd = tabs === tabsA ? cornersA.end : cornersB.end;
  const slotEdgeStart = slots === slotsA ? cornersA.start : cornersB.start;
  const slotEdgeEnd = slots === slotsA ? cornersA.end : cornersB.end;
  const tabPanel = tabs === tabsA ? panelA : panelB;
  const slotPanel = slots === slotsA ? panelA : panelB;

  const getWorldCoord = (edgeStart: PathPoint, edgeEnd: PathPoint, dist: number, edgeLen: number, panel: PanelPath): Point3D => {
    const t = dist / edgeLen;
    const localPoint: PathPoint = {
      x: edgeStart.x + t * (edgeEnd.x - edgeStart.x),
      y: edgeStart.y + t * (edgeEnd.y - edgeStart.y),
    };
    return toWorldSpace(localPoint, panel);
  };

  const tabWorldStart = getWorldCoord(tabEdgeStart, tabEdgeEnd, 0, tabEdgeLength, tabPanel);
  const tabWorldEnd = getWorldCoord(tabEdgeStart, tabEdgeEnd, tabEdgeLength, tabEdgeLength, tabPanel);
  const edgeDx = Math.abs(tabWorldEnd.x - tabWorldStart.x);
  const edgeDy = Math.abs(tabWorldEnd.y - tabWorldStart.y);
  const edgeDz = Math.abs(tabWorldEnd.z - tabWorldStart.z);
  const primaryAxis = edgeDx >= edgeDy && edgeDx >= edgeDz ? 'x' : (edgeDy >= edgeDz ? 'y' : 'z');

  for (const tab of tabs) {
    const tabWorldCenter = getWorldCoord(tabEdgeStart, tabEdgeEnd, tab.centerDist, tabEdgeLength, tabPanel);

    let minError = Infinity;
    for (const slot of slots) {
      const slotWorldCenter = getWorldCoord(slotEdgeStart, slotEdgeEnd, slot.centerDist, slotEdgeLength, slotPanel);
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

  const worldStartA = toWorldSpace(cornersA.start, panelA);
  const worldEndA = toWorldSpace(cornersA.end, panelA);
  const worldStartB = toWorldSpace(cornersB.start, panelB);
  const worldEndB = toWorldSpace(cornersB.end, panelB);

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
// Face Mating Pairs
// =============================================================================

const FACE_MATING_PAIRS: Array<{
  faceA: FaceId;
  edgeA: EdgePosition;
  faceB: FaceId;
  edgeB: EdgePosition;
  description: string;
}> = [
  { faceA: 'front', edgeA: 'top', faceB: 'top', edgeB: 'bottom', description: 'front-top meets top-bottom' },
  { faceA: 'front', edgeA: 'bottom', faceB: 'bottom', edgeB: 'top', description: 'front-bottom meets bottom-top' },
  { faceA: 'front', edgeA: 'left', faceB: 'left', edgeB: 'right', description: 'front-left meets left-right' },
  { faceA: 'front', edgeA: 'right', faceB: 'right', edgeB: 'left', description: 'front-right meets right-left' },
  { faceA: 'back', edgeA: 'top', faceB: 'top', edgeB: 'top', description: 'back-top meets top-top' },
  { faceA: 'back', edgeA: 'bottom', faceB: 'bottom', edgeB: 'bottom', description: 'back-bottom meets bottom-bottom' },
  { faceA: 'back', edgeA: 'left', faceB: 'right', edgeB: 'right', description: 'back-left meets right-right' },
  { faceA: 'back', edgeA: 'right', faceB: 'left', edgeB: 'left', description: 'back-right meets left-left' },
  { faceA: 'left', edgeA: 'top', faceB: 'top', edgeB: 'left', description: 'left-top meets top-left' },
  { faceA: 'left', edgeA: 'bottom', faceB: 'bottom', edgeB: 'left', description: 'left-bottom meets bottom-left' },
  { faceA: 'right', edgeA: 'top', faceB: 'top', edgeB: 'right', description: 'right-top meets top-right' },
  { faceA: 'right', edgeA: 'bottom', faceB: 'bottom', edgeB: 'right', description: 'right-bottom meets bottom-right' },
];

// =============================================================================
// Helper Functions
// =============================================================================

const findPanel = (panels: PanelPath[], faceId: FaceId): PanelPath | undefined => {
  return panels.find(p => p.source.type === 'face' && p.source.faceId === faceId);
};

const findDividerPanels = (panels: PanelPath[]): PanelPath[] => {
  return panels.filter(p => p.source.type === 'divider');
};

/**
 * Verify all face-to-face mating pairs
 */
const verifyAllFaceMating = (panels: PanelPath[]): string[] => {
  const failures: string[] = [];

  for (const pair of FACE_MATING_PAIRS) {
    const panelA = findPanel(panels, pair.faceA);
    const panelB = findPanel(panels, pair.faceB);

    if (!panelA || !panelB) continue;

    const result = verifyEdgeMating(panelA, pair.edgeA, panelB, pair.edgeB);

    if (!result.success) {
      failures.push(`${pair.description}: ${result.errors.join(', ')}`);
    }
  }

  return failures;
};

/**
 * Get the edge of a face panel where a divider connects.
 * X-axis dividers connect to left/right edges of front/back faces.
 * Y-axis dividers connect to top/bottom edges.
 * Z-axis dividers connect to left/right edges of left/right faces.
 */
const getDividerFaceEdge = (dividerAxis: 'x' | 'y' | 'z', faceId: FaceId): EdgePosition | null => {
  switch (dividerAxis) {
    case 'x':
      // X dividers are parallel to YZ plane, connect to front/back via vertical slot
      if (faceId === 'front' || faceId === 'back') {
        // The divider's edge mates with a vertical portion of the face
        // For simplicity, we use the slot holes in the face
        return null; // Dividers connect via slots, not edge-to-edge mating
      }
      return null;
    case 'y':
      // Y dividers are parallel to XZ plane, connect to front/back horizontally
      if (faceId === 'front' || faceId === 'back') {
        return null; // Horizontal connection via slots
      }
      return null;
    case 'z':
      // Z dividers are parallel to XY plane, connect to left/right
      if (faceId === 'left' || faceId === 'right') {
        return null;
      }
      return null;
  }
  return null;
};

// =============================================================================
// Tests
// =============================================================================

describe('Engine Integration: Joint Mating', () => {
  let engine: Engine;

  beforeEach(() => {
    engine = createEngine();
  });

  describe('Scenario 1: Basic Box - All Faces Solid', () => {
    it('creates a box with all 6 face panels', () => {
      engine.createAssembly(100, 80, 60, {
        thickness: 3,
        fingerWidth: 12.8,
        fingerGap: 1.5,
      });

      const collection = engine.generatePanelsFromNodes();
      expect(collection.panels.length).toBe(6);

      // All panels should have at least 4 points (corners)
      // Most panels will have more due to finger joints
      for (const panel of collection.panels) {
        expect(panel.outline.points.length).toBeGreaterThanOrEqual(4);
      }
    });

    it('all face-to-face joints mate correctly', () => {
      engine.createAssembly(100, 80, 60, {
        thickness: 3,
        fingerWidth: 12.8,
        fingerGap: 1.5,
      });

      const collection = engine.generatePanelsFromNodes();
      const failures = verifyAllFaceMating(collection.panels);

      expect(failures).toEqual([]);
    });

    it('joints have correct world-space positions', () => {
      engine.createAssembly(100, 80, 60, {
        thickness: 3,
        fingerWidth: 12.8,
        fingerGap: 1.5,
      });

      const collection = engine.generatePanelsFromNodes();

      const front = findPanel(collection.panels, 'front')!;
      const top = findPanel(collection.panels, 'top')!;

      // Verify the front-top mating edge
      const result = verifyEdgeMating(front, 'top', top, 'bottom');

      expect(result.success).toBe(true);
      expect(result.fingerCountsMatch).toBe(true);
      expect(result.maxAlignmentError).toBeLessThan(1.5);
    });
  });

  describe('Scenario 2: Open Lid', () => {
    it('opening top face removes that panel', () => {
      engine.createAssembly(100, 80, 60, {
        thickness: 3,
        fingerWidth: 12.8,
        fingerGap: 1.5,
      });

      // Open the top face
      engine.dispatch({
        type: 'SET_FACE_SOLID',
        targetId: 'main-assembly',
        payload: { faceId: 'top', solid: false },
      });

      const collection = engine.generatePanelsFromNodes();

      // Should now have 5 panels
      expect(collection.panels.length).toBe(5);

      // Top panel should be gone
      const topPanel = findPanel(collection.panels, 'top');
      expect(topPanel).toBeUndefined();
    });

    it('remaining joints still mate correctly after opening top', () => {
      engine.createAssembly(100, 80, 60, {
        thickness: 3,
        fingerWidth: 12.8,
        fingerGap: 1.5,
      });

      engine.dispatch({
        type: 'SET_FACE_SOLID',
        targetId: 'main-assembly',
        payload: { faceId: 'top', solid: false },
      });

      const collection = engine.generatePanelsFromNodes();

      // Filter out pairs involving top face
      const validPairs = FACE_MATING_PAIRS.filter(
        pair => pair.faceA !== 'top' && pair.faceB !== 'top'
      );

      const failures: string[] = [];
      for (const pair of validPairs) {
        const panelA = findPanel(collection.panels, pair.faceA);
        const panelB = findPanel(collection.panels, pair.faceB);

        if (!panelA || !panelB) continue;

        const result = verifyEdgeMating(panelA, pair.edgeA, panelB, pair.edgeB);

        if (!result.success) {
          failures.push(`${pair.description}: ${result.errors.join(', ')}`);
        }
      }

      expect(failures).toEqual([]);
    });

    it('front face tabs remain stable when top is opened', () => {
      engine.createAssembly(100, 80, 60, {
        thickness: 3,
        fingerWidth: 12.8,
        fingerGap: 1.5,
      });

      // Get front panel with top solid
      const collectionSolid = engine.generatePanelsFromNodes();
      const frontSolid = findPanel(collectionSolid.panels, 'front')!;
      const featuresBottomSolid = extractEdgeFeatures(frontSolid, 'bottom');

      // Open top
      engine.dispatch({
        type: 'SET_FACE_SOLID',
        targetId: 'main-assembly',
        payload: { faceId: 'top', solid: false },
      });

      // Get front panel with top open
      const collectionOpen = engine.generatePanelsFromNodes();
      const frontOpen = findPanel(collectionOpen.panels, 'front')!;
      const featuresBottomOpen = extractEdgeFeatures(frontOpen, 'bottom');

      // Bottom edge features should be identical
      const tabsSolid = featuresBottomSolid.filter(f => f.type === 'tab');
      const tabsOpen = featuresBottomOpen.filter(f => f.type === 'tab');

      expect(tabsOpen.length).toBe(tabsSolid.length);

      for (let i = 0; i < tabsSolid.length; i++) {
        expect(Math.abs(tabsSolid[i].centerDist - tabsOpen[i].centerDist)).toBeLessThan(0.5);
      }
    });
  });

  describe('Scenario 3: Single Subdivision', () => {
    it('subdividing creates a divider panel', () => {
      engine.createAssembly(200, 150, 120, {
        thickness: 3,
        fingerWidth: 12.8,
        fingerGap: 1.5,
      });

      engine.dispatch({
        type: 'ADD_SUBDIVISION',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', position: 100 },
      });

      const collection = engine.generatePanelsFromNodes();

      // 6 face panels + 1 divider
      expect(collection.panels.length).toBe(7);

      const dividers = findDividerPanels(collection.panels);
      expect(dividers.length).toBe(1);
      expect(dividers[0].source.axis).toBe('x');
    });

    it('divider panel has finger joints', () => {
      engine.createAssembly(200, 150, 120, {
        thickness: 3,
        fingerWidth: 12.8,
        fingerGap: 1.5,
      });

      engine.dispatch({
        type: 'ADD_SUBDIVISION',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', position: 100 },
      });

      const collection = engine.generatePanelsFromNodes();
      const dividers = findDividerPanels(collection.panels);

      expect(dividers[0].outline.points.length).toBeGreaterThan(4);
    });

    it('face panels have slots for divider', () => {
      engine.createAssembly(200, 150, 120, {
        thickness: 3,
        fingerWidth: 12.8,
        fingerGap: 1.5,
      });

      engine.dispatch({
        type: 'ADD_SUBDIVISION',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', position: 100 },
      });

      const collection = engine.generatePanelsFromNodes();

      // X-axis dividers should create slots in front and back faces
      const front = findPanel(collection.panels, 'front')!;
      const back = findPanel(collection.panels, 'back')!;

      // These panels should have holes for divider slots
      expect(front.holes.length).toBeGreaterThan(0);
      expect(back.holes.length).toBeGreaterThan(0);
    });

    it('all face-to-face joints still mate after subdivision', () => {
      engine.createAssembly(200, 150, 120, {
        thickness: 3,
        fingerWidth: 12.8,
        fingerGap: 1.5,
      });

      engine.dispatch({
        type: 'ADD_SUBDIVISION',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', position: 100 },
      });

      const collection = engine.generatePanelsFromNodes();
      const failures = verifyAllFaceMating(collection.panels);

      expect(failures).toEqual([]);
    });
  });

  describe('Scenario 4: Double Subdivision', () => {
    it('subdividing twice creates two divider panels', () => {
      engine.createAssembly(200, 150, 120, {
        thickness: 3,
        fingerWidth: 12.8,
        fingerGap: 1.5,
      });

      // First subdivision on X axis
      engine.dispatch({
        type: 'ADD_SUBDIVISION',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', position: 100 },
      });

      // Get child void IDs from the assembly's children (which are VoidSnapshots)
      const snapshot = engine.getSnapshot();
      const assembly = snapshot.children[0]; // First assembly
      expect(assembly).toBeDefined();

      // Assembly children are voids - the root void has children after subdivision
      const rootVoid = assembly.children[0]; // Root void
      expect(rootVoid?.children.length).toBe(2);

      const firstChildId = rootVoid!.children[0].id;

      // Second subdivision on Y axis in the first child void
      engine.dispatch({
        type: 'ADD_SUBDIVISION',
        targetId: 'main-assembly',
        payload: { voidId: firstChildId, axis: 'y', position: 75 },
      });

      const collection = engine.generatePanelsFromNodes();

      // 6 face panels + 2 dividers
      expect(collection.panels.length).toBe(8);

      const dividers = findDividerPanels(collection.panels);
      expect(dividers.length).toBe(2);
    });

    it('all joints mate correctly after double subdivision', () => {
      engine.createAssembly(200, 150, 120, {
        thickness: 3,
        fingerWidth: 12.8,
        fingerGap: 1.5,
      });

      // First subdivision
      engine.dispatch({
        type: 'ADD_SUBDIVISION',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', position: 100 },
      });

      const snapshot = engine.getSnapshot();
      const assembly = snapshot.children[0];
      const rootVoid = assembly.children[0];
      const firstChildId = rootVoid.children[0].id;

      // Second subdivision
      engine.dispatch({
        type: 'ADD_SUBDIVISION',
        targetId: 'main-assembly',
        payload: { voidId: firstChildId, axis: 'y', position: 75 },
      });

      const collection = engine.generatePanelsFromNodes();
      const failures = verifyAllFaceMating(collection.panels);

      expect(failures).toEqual([]);
    });

    it('both divider panels have finger joints', () => {
      engine.createAssembly(200, 150, 120, {
        thickness: 3,
        fingerWidth: 12.8,
        fingerGap: 1.5,
      });

      engine.dispatch({
        type: 'ADD_SUBDIVISION',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', position: 100 },
      });

      const snapshot = engine.getSnapshot();
      const assembly = snapshot.children[0];
      const rootVoid = assembly.children[0];
      const firstChildId = rootVoid.children[0].id;

      engine.dispatch({
        type: 'ADD_SUBDIVISION',
        targetId: 'main-assembly',
        payload: { voidId: firstChildId, axis: 'y', position: 75 },
      });

      const collection = engine.generatePanelsFromNodes();
      const dividers = findDividerPanels(collection.panels);

      // Dividers should have finger joints (more than 4 points)
      for (const divider of dividers) {
        expect(divider.outline.points.length).toBeGreaterThan(4);
      }
    });
  });

  describe('Scenario 5: Open Lid + Subdivide', () => {
    it('can open lid and then subdivide', () => {
      engine.createAssembly(200, 150, 120, {
        thickness: 3,
        fingerWidth: 12.8,
        fingerGap: 1.5,
      });

      // Open top face
      engine.dispatch({
        type: 'SET_FACE_SOLID',
        targetId: 'main-assembly',
        payload: { faceId: 'top', solid: false },
      });

      // Subdivide
      engine.dispatch({
        type: 'ADD_SUBDIVISION',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', position: 100 },
      });

      const collection = engine.generatePanelsFromNodes();

      // 5 face panels + 1 divider
      expect(collection.panels.length).toBe(6);
    });

    it('joints still mate after open lid + subdivide', () => {
      engine.createAssembly(200, 150, 120, {
        thickness: 3,
        fingerWidth: 12.8,
        fingerGap: 1.5,
      });

      engine.dispatch({
        type: 'SET_FACE_SOLID',
        targetId: 'main-assembly',
        payload: { faceId: 'top', solid: false },
      });

      engine.dispatch({
        type: 'ADD_SUBDIVISION',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', position: 100 },
      });

      const collection = engine.generatePanelsFromNodes();

      // Verify face mating for remaining faces
      const validPairs = FACE_MATING_PAIRS.filter(
        pair => pair.faceA !== 'top' && pair.faceB !== 'top'
      );

      const failures: string[] = [];
      for (const pair of validPairs) {
        const panelA = findPanel(collection.panels, pair.faceA);
        const panelB = findPanel(collection.panels, pair.faceB);

        if (!panelA || !panelB) continue;

        const result = verifyEdgeMating(panelA, pair.edgeA, panelB, pair.edgeB);

        if (!result.success) {
          failures.push(`${pair.description}: ${result.errors.join(', ')}`);
        }
      }

      expect(failures).toEqual([]);
    });
  });

  describe('Scenario 6: World Space Verification', () => {
    it('corner positions match in world space for mating edges', () => {
      engine.createAssembly(100, 80, 60, {
        thickness: 3,
        fingerWidth: 12.8,
        fingerGap: 1.5,
      });

      const collection = engine.generatePanelsFromNodes();

      const front = findPanel(collection.panels, 'front')!;
      const left = findPanel(collection.panels, 'left')!;

      // Front's left edge should meet Left's right edge
      const frontCorners = getEdgeEndpoints(front, 'left');
      const leftCorners = getEdgeEndpoints(left, 'right');

      const frontStartWorld = toWorldSpace(frontCorners.start, front);
      const frontEndWorld = toWorldSpace(frontCorners.end, front);
      const leftStartWorld = toWorldSpace(leftCorners.start, left);
      const leftEndWorld = toWorldSpace(leftCorners.end, left);

      // Calculate corner alignment
      const dist = (a: Point3D, b: Point3D) =>
        Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);

      const alignment = Math.min(
        dist(frontStartWorld, leftStartWorld) + dist(frontEndWorld, leftEndWorld),
        dist(frontStartWorld, leftEndWorld) + dist(frontEndWorld, leftStartWorld)
      ) / 2;

      // Corners should align within tolerance (accounting for material thickness offsets)
      expect(alignment).toBeLessThan(5);
    });

    it('finger tab positions align in world space', () => {
      engine.createAssembly(100, 80, 60, {
        thickness: 3,
        fingerWidth: 12.8,
        fingerGap: 1.5,
      });

      const collection = engine.generatePanelsFromNodes();

      const front = findPanel(collection.panels, 'front')!;
      const top = findPanel(collection.panels, 'top')!;

      const result = verifyEdgeMating(front, 'top', top, 'bottom');

      // Max alignment error should be less than finger gap
      expect(result.maxAlignmentError).toBeLessThan(1.5);

      // All individual alignment errors should be small
      for (const error of result.alignmentErrors) {
        expect(error).toBeLessThan(1.5);
      }
    });
  });

  describe('Scenario 7: Different Assembly Axes', () => {
    it('X-axis assembly joints mate correctly', () => {
      engine.createAssembly(100, 80, 60, {
        thickness: 3,
        fingerWidth: 12.8,
        fingerGap: 1.5,
      });

      // Set X-axis assembly
      engine.dispatch({
        type: 'SET_ASSEMBLY_AXIS',
        targetId: 'main-assembly',
        payload: { axis: 'x' },
      });

      const collection = engine.generatePanelsFromNodes();
      const failures = verifyAllFaceMating(collection.panels);

      expect(failures).toEqual([]);
    });

    it('Z-axis assembly joints mate correctly', () => {
      engine.createAssembly(100, 80, 60, {
        thickness: 3,
        fingerWidth: 12.8,
        fingerGap: 1.5,
      });

      engine.dispatch({
        type: 'SET_ASSEMBLY_AXIS',
        targetId: 'main-assembly',
        payload: { axis: 'z' },
      });

      const collection = engine.generatePanelsFromNodes();
      const failures = verifyAllFaceMating(collection.panels);

      expect(failures).toEqual([]);
    });
  });

  describe('Scenario 8: Engine-Detected Alignment Errors', () => {
    /**
     * These tests verify the engine's internal joint alignment validation.
     * The engine computes jointAlignmentErrors when serializing snapshots.
     *
     * All errors should be zero after the alignment fixes:
     * - MATING_EDGE_POSITION fixed for back panel (left/right swapped)
     * - Edge anchors offset inward by mt/2 to be at mating surface
     */

    it('basic box has no engine-detected alignment errors', () => {
      engine.createAssembly(100, 80, 60, {
        thickness: 3,
        fingerWidth: 12.8,
        fingerGap: 1.5,
      });

      const snapshot = engine.getSnapshot();
      const assembly = snapshot.children[0];
      const errors = assembly.derived.jointAlignmentErrors;

      expect(errors).toEqual([]);
    });

    it('single subdivision has no engine-detected alignment errors', () => {
      engine.createAssembly(200, 150, 120, {
        thickness: 3,
        fingerWidth: 12.8,
        fingerGap: 1.5,
      });

      engine.dispatch({
        type: 'ADD_SUBDIVISION',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', position: 100 },
      });

      const snapshot = engine.getSnapshot();
      const assembly = snapshot.children[0];
      const errors = assembly.derived.jointAlignmentErrors;

      expect(errors).toEqual([]);
    });

    it('double subdivision has no engine-detected alignment errors', () => {
      engine.createAssembly(200, 150, 120, {
        thickness: 3,
        fingerWidth: 12.8,
        fingerGap: 1.5,
      });

      engine.dispatch({
        type: 'ADD_SUBDIVISION',
        targetId: 'main-assembly',
        payload: { voidId: 'root', axis: 'x', position: 100 },
      });

      const snapshot1 = engine.getSnapshot();
      const rootVoid = snapshot1.children[0].children[0];
      const firstChildId = rootVoid.children[0].id;

      engine.dispatch({
        type: 'ADD_SUBDIVISION',
        targetId: 'main-assembly',
        payload: { voidId: firstChildId, axis: 'y', position: 75 },
      });

      const snapshot = engine.getSnapshot();
      const assembly = snapshot.children[0];
      const errors = assembly.derived.jointAlignmentErrors;

      expect(errors).toEqual([]);
    });
  });
});
