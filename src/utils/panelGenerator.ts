// Panel Generator - Creates PanelPath objects from box configuration
// These paths are the source of truth for both 3D rendering and SVG export

import {
  BoxConfig,
  Face,
  FaceId,
  Void,
  PanelPath,
  PanelHole,
  PathPoint,
  PanelCollection,
  PanelSource,
  AssemblyConfig,
  getFaceRole,
  getLidSide,
  getWallPriority,
} from '../types';
import { generateFingerJointPath, Point } from './fingerJoints';
import { getAllSubdivisions } from '../store/useBoxStore';

// =============================================================================
// Helpers
// =============================================================================

interface FaceDimensions {
  width: number;
  height: number;
}

export const getFaceDimensions = (
  faceId: FaceId,
  config: BoxConfig
): FaceDimensions => {
  switch (faceId) {
    case 'front':
    case 'back':
      return { width: config.width, height: config.height };
    case 'left':
    case 'right':
      return { width: config.depth, height: config.height };
    case 'top':
    case 'bottom':
      return { width: config.width, height: config.depth };
  }
};

interface EdgeInfo {
  adjacentFaceId: FaceId;
  isHorizontal: boolean;
  position: 'top' | 'bottom' | 'left' | 'right';
}

const getFaceEdges = (faceId: FaceId): EdgeInfo[] => {
  switch (faceId) {
    case 'front':
      return [
        { adjacentFaceId: 'top', isHorizontal: true, position: 'top' },
        { adjacentFaceId: 'bottom', isHorizontal: true, position: 'bottom' },
        { adjacentFaceId: 'left', isHorizontal: false, position: 'left' },
        { adjacentFaceId: 'right', isHorizontal: false, position: 'right' },
      ];
    case 'back':
      return [
        { adjacentFaceId: 'top', isHorizontal: true, position: 'top' },
        { adjacentFaceId: 'bottom', isHorizontal: true, position: 'bottom' },
        { adjacentFaceId: 'right', isHorizontal: false, position: 'left' },
        { adjacentFaceId: 'left', isHorizontal: false, position: 'right' },
      ];
    case 'left':
      return [
        { adjacentFaceId: 'top', isHorizontal: true, position: 'top' },
        { adjacentFaceId: 'bottom', isHorizontal: true, position: 'bottom' },
        { adjacentFaceId: 'back', isHorizontal: false, position: 'left' },
        { adjacentFaceId: 'front', isHorizontal: false, position: 'right' },
      ];
    case 'right':
      return [
        { adjacentFaceId: 'top', isHorizontal: true, position: 'top' },
        { adjacentFaceId: 'bottom', isHorizontal: true, position: 'bottom' },
        { adjacentFaceId: 'front', isHorizontal: false, position: 'left' },
        { adjacentFaceId: 'back', isHorizontal: false, position: 'right' },
      ];
    case 'top':
      return [
        { adjacentFaceId: 'back', isHorizontal: true, position: 'top' },
        { adjacentFaceId: 'front', isHorizontal: true, position: 'bottom' },
        { adjacentFaceId: 'left', isHorizontal: false, position: 'left' },
        { adjacentFaceId: 'right', isHorizontal: false, position: 'right' },
      ];
    case 'bottom':
      return [
        { adjacentFaceId: 'front', isHorizontal: true, position: 'top' },
        { adjacentFaceId: 'back', isHorizontal: true, position: 'bottom' },
        { adjacentFaceId: 'left', isHorizontal: false, position: 'left' },
        { adjacentFaceId: 'right', isHorizontal: false, position: 'right' },
      ];
  }
};

// Dynamic tab direction logic based on assembly configuration
const shouldTabOut = (
  faceId: FaceId,
  adjacentFaceId: FaceId,
  assembly: AssemblyConfig
): boolean | null => {
  const myRole = getFaceRole(faceId, assembly.assemblyAxis);
  const adjRole = getFaceRole(adjacentFaceId, assembly.assemblyAxis);

  // Wall-to-Wall: use priority system (lower priority tabs OUT)
  if (myRole === 'wall' && adjRole === 'wall') {
    return getWallPriority(faceId) < getWallPriority(adjacentFaceId);
  }

  // Lid-to-Wall interactions
  if (myRole === 'lid') {
    const side = getLidSide(faceId, assembly.assemblyAxis);
    if (side) {
      return assembly.lids[side].tabDirection === 'tabs-out';
    }
    return false;
  }

  // Wall-to-Lid interactions
  if (adjRole === 'lid') {
    const side = getLidSide(adjacentFaceId, assembly.assemblyAxis);
    if (side) {
      if (assembly.lids[side].inset > 0) {
        return null; // Straight edge for inset lids
      }
      return assembly.lids[side].tabDirection === 'tabs-in';
    }
    return false;
  }

  return false;
};

// Get face 3D position and rotation for rendering
const getFaceTransform = (
  faceId: FaceId,
  config: BoxConfig,
  scale: number
): { position: [number, number, number]; rotation: [number, number, number] } => {
  const { width, height, depth, materialThickness, assembly } = config;
  const halfW = (width * scale) / 2;
  const halfH = (height * scale) / 2;
  const halfD = (depth * scale) / 2;
  const mt = materialThickness * scale;

  // Get lid insets for positioning lid faces
  const getLidInset = (side: 'positive' | 'negative'): number => {
    return (assembly.lids[side].inset || 0) * scale;
  };

  switch (faceId) {
    case 'front':
      return {
        position: [0, 0, halfD - mt / 2],
        rotation: [0, 0, 0],
      };
    case 'back':
      return {
        position: [0, 0, -halfD + mt / 2],
        rotation: [0, Math.PI, 0],
      };
    case 'left':
      return {
        position: [-halfW + mt / 2, 0, 0],
        rotation: [0, -Math.PI / 2, 0],
      };
    case 'right':
      return {
        position: [halfW - mt / 2, 0, 0],
        rotation: [0, Math.PI / 2, 0],
      };
    case 'top':
      // Adjust for lid inset (moves down into the box)
      return {
        position: [0, halfH - mt / 2 - getLidInset('positive'), 0],
        rotation: [-Math.PI / 2, 0, 0],
      };
    case 'bottom':
      // Adjust for lid inset (moves up into the box)
      return {
        position: [0, -halfH + mt / 2 + getLidInset('negative'), 0],
        rotation: [Math.PI / 2, 0, 0],
      };
  }
};

// =============================================================================
// Face Panel Generation
// =============================================================================

const generateFacePanelOutline = (
  faceId: FaceId,
  faces: Face[],
  config: BoxConfig
): PathPoint[] => {
  const dims = getFaceDimensions(faceId, config);
  const edges = getFaceEdges(faceId);
  const { materialThickness, fingerWidth, fingerGap, assembly } = config;

  const halfW = dims.width / 2;
  const halfH = dims.height / 2;

  // Determine which edges have tabs extending outward
  const edgeHasTabs = (position: 'top' | 'bottom' | 'left' | 'right'): boolean => {
    const edgeInfo = edges.find(e => e.position === position)!;
    const adjacentFace = faces.find(f => f.id === edgeInfo.adjacentFaceId);
    const isSolidAdjacent = adjacentFace?.solid ?? false;
    const tabOut = shouldTabOut(faceId, edgeInfo.adjacentFaceId, assembly);
    return isSolidAdjacent && tabOut === true;
  };

  const topHasTabs = edgeHasTabs('top');
  const bottomHasTabs = edgeHasTabs('bottom');
  const leftHasTabs = edgeHasTabs('left');
  const rightHasTabs = edgeHasTabs('right');

  // Corners inset where tabs extend outward
  const corners: Record<string, Point> = {
    topLeft: {
      x: -halfW + (leftHasTabs ? materialThickness : 0),
      y: halfH - (topHasTabs ? materialThickness : 0)
    },
    topRight: {
      x: halfW - (rightHasTabs ? materialThickness : 0),
      y: halfH - (topHasTabs ? materialThickness : 0)
    },
    bottomRight: {
      x: halfW - (rightHasTabs ? materialThickness : 0),
      y: -halfH + (bottomHasTabs ? materialThickness : 0)
    },
    bottomLeft: {
      x: -halfW + (leftHasTabs ? materialThickness : 0),
      y: -halfH + (bottomHasTabs ? materialThickness : 0)
    },
  };

  const edgeConfigs = [
    { start: corners.topLeft, end: corners.topRight, edgeInfo: edges.find((e) => e.position === 'top')! },
    { start: corners.topRight, end: corners.bottomRight, edgeInfo: edges.find((e) => e.position === 'right')! },
    { start: corners.bottomRight, end: corners.bottomLeft, edgeInfo: edges.find((e) => e.position === 'bottom')! },
    { start: corners.bottomLeft, end: corners.topLeft, edgeInfo: edges.find((e) => e.position === 'left')! },
  ];

  const outlinePoints: PathPoint[] = [];

  for (const { start, end, edgeInfo } of edgeConfigs) {
    const adjacentFace = faces.find((f) => f.id === edgeInfo.adjacentFaceId);
    const isSolidAdjacent = adjacentFace?.solid ?? false;
    const tabOutResult = isSolidAdjacent ? shouldTabOut(faceId, edgeInfo.adjacentFaceId, assembly) : null;

    let points: Point[];

    if (tabOutResult !== null) {
      const edgeLength = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));

      // Calculate corner inset for adjusted gap multiplier
      // Use Math.max: prioritize correct alignment on the closed/inset side
      const isHorizontalEdge = edgeInfo.position === 'top' || edgeInfo.position === 'bottom';
      const cornerInset = isHorizontalEdge
        ? Math.max(leftHasTabs ? materialThickness : 0, rightHasTabs ? materialThickness : 0)
        : Math.max(topHasTabs ? materialThickness : 0, bottomHasTabs ? materialThickness : 0);
      const adjustedGapMultiplier = Math.max(0, fingerGap - cornerInset / fingerWidth);

      points = generateFingerJointPath(start, end, {
        edgeLength,
        fingerWidth,
        materialThickness,
        isTabOut: tabOutResult,
        kerf: 0,
        yUp: true,
        cornerGapMultiplier: adjustedGapMultiplier,
      });
    } else {
      points = [start, end];
    }

    // For first edge, add all points including start
    // For subsequent edges, check if we need to add the corner point
    if (outlinePoints.length === 0) {
      // First edge: add all points
      for (let i = 0; i < points.length; i++) {
        outlinePoints.push(points[i]);
      }
    } else {
      // Subsequent edges: ensure corner continuity
      const lastOutlinePoint = outlinePoints[outlinePoints.length - 1];
      const edgeStartPoint = points[0];

      // Check if the last outline point matches the edge start point (the corner)
      const tolerance = 0.001;
      const cornerMatches =
        Math.abs(lastOutlinePoint.x - edgeStartPoint.x) < tolerance &&
        Math.abs(lastOutlinePoint.y - edgeStartPoint.y) < tolerance;

      if (!cornerMatches) {
        // Corner doesn't match - the previous edge didn't end at the corner
        // Add the corner point explicitly
        outlinePoints.push(edgeStartPoint);
      }

      // Skip the first point (corner) and add the rest
      for (let i = 1; i < points.length; i++) {
        outlinePoints.push(points[i]);
      }
    }
  }

  return outlinePoints;
};

// Generate slot holes for dividers that meet this face
const generateDividerSlotHoles = (
  faceId: FaceId,
  faces: Face[],
  rootVoid: Void,
  config: BoxConfig
): PanelHole[] => {
  const holes: PanelHole[] = [];
  const { materialThickness, fingerWidth, fingerGap, width, height, depth } = config;
  const subdivisions = getAllSubdivisions(rootVoid);
  const isFaceSolid = (id: FaceId) => faces.find(f => f.id === id)?.solid ?? false;
  const tolerance = 0.01;

  for (const sub of subdivisions) {
    let slotX: number | null = null;
    let slotY: number | null = null;
    let slotLength: number = 0;
    let isHorizontal: boolean = false;
    let startInset: number = 0;  // Inset at start of slot (mm)
    let endInset: number = 0;    // Inset at end of slot (mm)

    const { bounds, position, axis } = sub;

    // Helper to check if divider meets an outer face
    const meetsBottom = bounds.y < tolerance;
    const meetsTop = bounds.y + bounds.h > height - tolerance;
    const meetsLeft = bounds.x < tolerance;
    const meetsRight = bounds.x + bounds.w > width - tolerance;
    const meetsBack = bounds.z < tolerance;
    const meetsFront = bounds.z + bounds.d > depth - tolerance;

    // Check if this subdivision touches this face
    switch (faceId) {
      case 'front':
        if (meetsFront) {
          if (axis === 'x') {
            slotX = position - width / 2;
            slotLength = bounds.h;
            isHorizontal = false;
            // Vertical slot: start=bottom, end=top
            startInset = meetsBottom && isFaceSolid('bottom') ? materialThickness : 0;
            endInset = meetsTop && isFaceSolid('top') ? materialThickness : 0;
          } else if (axis === 'y') {
            slotY = position - height / 2;
            slotLength = bounds.w;
            isHorizontal = true;
            // Horizontal slot: start=left, end=right
            startInset = meetsLeft && isFaceSolid('left') ? materialThickness : 0;
            endInset = meetsRight && isFaceSolid('right') ? materialThickness : 0;
          }
        }
        break;
      case 'back':
        if (meetsBack) {
          if (axis === 'x') {
            slotX = -(position - width / 2);
            slotLength = bounds.h;
            isHorizontal = false;
            startInset = meetsBottom && isFaceSolid('bottom') ? materialThickness : 0;
            endInset = meetsTop && isFaceSolid('top') ? materialThickness : 0;
          } else if (axis === 'y') {
            slotY = position - height / 2;
            slotLength = bounds.w;
            isHorizontal = true;
            startInset = meetsLeft && isFaceSolid('left') ? materialThickness : 0;
            endInset = meetsRight && isFaceSolid('right') ? materialThickness : 0;
          }
        }
        break;
      case 'left':
        if (meetsLeft) {
          if (axis === 'z') {
            slotX = position - depth / 2;
            slotLength = bounds.h;
            isHorizontal = false;
            startInset = meetsBottom && isFaceSolid('bottom') ? materialThickness : 0;
            endInset = meetsTop && isFaceSolid('top') ? materialThickness : 0;
          } else if (axis === 'y') {
            slotY = position - height / 2;
            slotLength = bounds.d;
            isHorizontal = true;
            // Horizontal slot on left: start=back, end=front
            startInset = meetsBack && isFaceSolid('back') ? materialThickness : 0;
            endInset = meetsFront && isFaceSolid('front') ? materialThickness : 0;
          }
        }
        break;
      case 'right':
        if (meetsRight) {
          if (axis === 'z') {
            slotX = -(position - depth / 2);
            slotLength = bounds.h;
            isHorizontal = false;
            startInset = meetsBottom && isFaceSolid('bottom') ? materialThickness : 0;
            endInset = meetsTop && isFaceSolid('top') ? materialThickness : 0;
          } else if (axis === 'y') {
            slotY = position - height / 2;
            slotLength = bounds.d;
            isHorizontal = true;
            // Horizontal slot on right: start=front, end=back (mirrored from left)
            startInset = meetsFront && isFaceSolid('front') ? materialThickness : 0;
            endInset = meetsBack && isFaceSolid('back') ? materialThickness : 0;
          }
        }
        break;
      case 'top':
        if (meetsTop) {
          if (axis === 'x') {
            slotX = position - width / 2;
            slotLength = bounds.d;
            isHorizontal = false;
            // For top: start=front (negative local Y), end=back
            startInset = meetsFront && isFaceSolid('front') ? materialThickness : 0;
            endInset = meetsBack && isFaceSolid('back') ? materialThickness : 0;
          } else if (axis === 'z') {
            slotY = position - depth / 2;
            slotLength = bounds.w;
            isHorizontal = true;
            startInset = meetsLeft && isFaceSolid('left') ? materialThickness : 0;
            endInset = meetsRight && isFaceSolid('right') ? materialThickness : 0;
          }
        }
        break;
      case 'bottom':
        if (meetsBottom) {
          if (axis === 'x') {
            slotX = position - width / 2;
            slotLength = bounds.d;
            isHorizontal = false;
            // For bottom: start=back (negative local Y), end=front
            startInset = meetsBack && isFaceSolid('back') ? materialThickness : 0;
            endInset = meetsFront && isFaceSolid('front') ? materialThickness : 0;
          } else if (axis === 'z') {
            slotY = -(position - depth / 2);
            slotLength = bounds.w;
            isHorizontal = true;
            startInset = meetsLeft && isFaceSolid('left') ? materialThickness : 0;
            endInset = meetsRight && isFaceSolid('right') ? materialThickness : 0;
          }
        }
        break;
    }

    // Generate finger slot holes
    if (slotX !== null || slotY !== null) {
      // Calculate effective length (after subtracting insets)
      const effectiveLength = slotLength - startInset - endInset;
      const halfSlotLength = slotLength / 2;

      // Use Math.max of corner insets for gap adjustment (matches FaceWithFingers)
      const cornerGapBase = fingerWidth * fingerGap;
      const maxInset = Math.max(startInset, endInset);
      const adjustedCornerGap = Math.max(0, cornerGapBase - maxInset);

      // Usable length for fingers
      const usableLength = effectiveLength - (adjustedCornerGap * 2);

      if (usableLength < fingerWidth) continue;  // Too short for slots

      // Calculate number of fingers - must be odd for symmetry
      let numFingers = Math.max(1, Math.floor(usableLength / fingerWidth));
      if (numFingers % 2 === 0) numFingers++;  // Ensure odd for symmetry

      const actualFingerWidth = usableLength / numFingers;

      // Starting position for finger region
      // Measure from -halfSlotLength (outer dimension), then add startInset and adjustedCornerGap
      const fingerRegionStart = -halfSlotLength + startInset + adjustedCornerGap;

      for (let i = 0; i < numFingers; i++) {
        if (i % 2 === 0) {
          const slotStart = fingerRegionStart + i * actualFingerWidth;
          const slotEnd = slotStart + actualFingerWidth;

          let holePoints: PathPoint[];
          if (isHorizontal) {
            // Horizontal slot
            const y = slotY!;
            holePoints = [
              { x: slotStart, y: y - materialThickness / 2 },
              { x: slotEnd, y: y - materialThickness / 2 },
              { x: slotEnd, y: y + materialThickness / 2 },
              { x: slotStart, y: y + materialThickness / 2 },
            ];
          } else {
            // Vertical slot
            const x = slotX!;
            holePoints = [
              { x: x - materialThickness / 2, y: slotStart },
              { x: x + materialThickness / 2, y: slotStart },
              { x: x + materialThickness / 2, y: slotEnd },
              { x: x - materialThickness / 2, y: slotEnd },
            ];
          }

          holes.push({
            id: `divider-slot-${sub.id}-${i}`,
            type: 'slot',
            path: { points: holePoints, closed: true },
            source: {
              type: 'divider-slot',
              sourceId: sub.id,
            },
          });
        }
      }
    }
  }

  return holes;
};

// Generate slot holes for lid tabs on wall faces
const generateLidSlotHoles = (
  faceId: FaceId,
  faces: Face[],
  config: BoxConfig
): PanelHole[] => {
  const holes: PanelHole[] = [];
  const { assembly, materialThickness, fingerWidth, fingerGap, width, height, depth } = config;
  const isFaceSolid = (id: FaceId) => faces.find(f => f.id === id)?.solid ?? false;

  // Only walls get slots for lid tabs
  if (getFaceRole(faceId, assembly.assemblyAxis) !== 'wall') return [];

  const dims = getFaceDimensions(faceId, config);

  for (const side of ['positive', 'negative'] as const) {
    const lidConfig = assembly.lids[side];

    // Only process if lid has tabs-out AND is inset
    // Non-inset lids have their tabs/slots handled by edge finger joints
    // Inset lids need internal slot holes since the wall edge is straight
    if (lidConfig.tabDirection !== 'tabs-out') continue;
    if (lidConfig.inset <= 0) continue;  // Skip non-inset lids

    let slotPosition: number;
    let slotLength: number;
    let isHorizontal: boolean;
    let startInset: number = 0;
    let endInset: number = 0;

    switch (assembly.assemblyAxis) {
      case 'y':
        // Top/bottom are lids
        if (side === 'positive') {
          slotPosition = dims.height / 2 - materialThickness / 2 - lidConfig.inset;
        } else {
          slotPosition = -dims.height / 2 + materialThickness / 2 + lidConfig.inset;
        }
        isHorizontal = true;
        if (faceId === 'front' || faceId === 'back') {
          slotLength = width;
          startInset = isFaceSolid('left') ? materialThickness : 0;
          endInset = isFaceSolid('right') ? materialThickness : 0;
        } else {
          slotLength = depth;
          if (faceId === 'left') {
            startInset = isFaceSolid('back') ? materialThickness : 0;
            endInset = isFaceSolid('front') ? materialThickness : 0;
          } else {
            startInset = isFaceSolid('front') ? materialThickness : 0;
            endInset = isFaceSolid('back') ? materialThickness : 0;
          }
        }
        break;

      case 'x':
        // Left/right are lids
        if (side === 'positive') {
          slotPosition = dims.width / 2 - materialThickness / 2 - lidConfig.inset;
        } else {
          slotPosition = -dims.width / 2 + materialThickness / 2 + lidConfig.inset;
        }
        isHorizontal = false;
        slotLength = height;
        startInset = isFaceSolid('bottom') ? materialThickness : 0;
        endInset = isFaceSolid('top') ? materialThickness : 0;
        break;

      case 'z':
        // Front/back are lids
        if (faceId === 'left' || faceId === 'right') {
          if (side === 'positive') {
            slotPosition = dims.width / 2 - materialThickness / 2 - lidConfig.inset;
          } else {
            slotPosition = -dims.width / 2 + materialThickness / 2 + lidConfig.inset;
          }
          isHorizontal = false;
          slotLength = height;
          startInset = isFaceSolid('bottom') ? materialThickness : 0;
          endInset = isFaceSolid('top') ? materialThickness : 0;
        } else {
          if (side === 'positive') {
            slotPosition = dims.height / 2 - materialThickness / 2 - lidConfig.inset;
          } else {
            slotPosition = -dims.height / 2 + materialThickness / 2 + lidConfig.inset;
          }
          isHorizontal = true;
          slotLength = width;
          startInset = isFaceSolid('left') ? materialThickness : 0;
          endInset = isFaceSolid('right') ? materialThickness : 0;
        }
        break;

      default:
        continue;
    }

    // Calculate effective length (after subtracting insets)
    const effectiveLength = slotLength - startInset - endInset;
    const halfSlotLength = slotLength / 2;

    // Use Math.max of corner insets for gap adjustment
    const cornerGapBase = fingerWidth * fingerGap;
    const maxInset = Math.max(startInset, endInset);
    const adjustedCornerGap = Math.max(0, cornerGapBase - maxInset);

    // Usable length for fingers
    const usableLength = effectiveLength - (adjustedCornerGap * 2);

    if (usableLength < fingerWidth) continue;  // Too short for slots

    let numFingers = Math.max(1, Math.floor(usableLength / fingerWidth));
    if (numFingers % 2 === 0) numFingers++;  // Ensure odd for symmetry

    const actualFingerWidth = usableLength / numFingers;

    // Starting position for finger region
    const fingerRegionStart = -halfSlotLength + startInset + adjustedCornerGap;

    for (let i = 0; i < numFingers; i++) {
      if (i % 2 === 0) {
        const slotStart = fingerRegionStart + i * actualFingerWidth;
        const slotEnd = slotStart + actualFingerWidth;

        let holePoints: PathPoint[];
        if (isHorizontal) {
          holePoints = [
            { x: slotStart, y: slotPosition - materialThickness / 2 },
            { x: slotEnd, y: slotPosition - materialThickness / 2 },
            { x: slotEnd, y: slotPosition + materialThickness / 2 },
            { x: slotStart, y: slotPosition + materialThickness / 2 },
          ];
        } else {
          holePoints = [
            { x: slotPosition - materialThickness / 2, y: slotStart },
            { x: slotPosition + materialThickness / 2, y: slotStart },
            { x: slotPosition + materialThickness / 2, y: slotEnd },
            { x: slotPosition - materialThickness / 2, y: slotEnd },
          ];
        }

        holes.push({
          id: `lid-slot-${side}-${i}`,
          type: 'slot',
          path: { points: holePoints, closed: true },
          source: {
            type: 'lid-slot',
            sourceId: side,
          },
        });
      }
    }
  }

  return holes;
};

const generateFacePanel = (
  faceId: FaceId,
  faces: Face[],
  rootVoid: Void,
  config: BoxConfig,
  scale: number = 1
): PanelPath | null => {
  const face = faces.find((f) => f.id === faceId);
  if (!face || !face.solid) return null;

  const dims = getFaceDimensions(faceId, config);
  const outlinePoints = generateFacePanelOutline(faceId, faces, config);
  const dividerHoles = generateDividerSlotHoles(faceId, faces, rootVoid, config);
  const lidHoles = generateLidSlotHoles(faceId, faces, config);
  const { position, rotation } = getFaceTransform(faceId, config, scale);

  const source: PanelSource = {
    type: 'face',
    faceId,
  };

  return {
    id: `face-${faceId}`,
    source,
    outline: { points: outlinePoints, closed: true },
    holes: [...dividerHoles, ...lidHoles],
    width: dims.width,
    height: dims.height,
    thickness: config.materialThickness,
    position,
    rotation,
    label: faceId.toUpperCase(),
    visible: true,
  };
};

// =============================================================================
// Divider Panel Generation
// =============================================================================

const generateDividerPanel = (
  subdivision: { id: string; axis: 'x' | 'y' | 'z'; position: number; bounds: any },
  faces: Face[],
  config: BoxConfig,
  scale: number = 1
): PanelPath => {
  const { materialThickness, fingerWidth, fingerGap, width, height, depth } = config;
  const { bounds, axis, position } = subdivision;
  const isFaceSolid = (faceId: FaceId) => faces.find(f => f.id === faceId)?.solid ?? false;
  const tolerance = 0.01;

  // Calculate panel dimensions based on axis
  let panelWidth: number;
  let panelHeight: number;
  let meetsTop: boolean;
  let meetsBottom: boolean;
  let meetsLeft: boolean;
  let meetsRight: boolean;

  switch (axis) {
    case 'x':
      panelWidth = bounds.d;
      panelHeight = bounds.h;
      meetsTop = isFaceSolid('top') && bounds.y + bounds.h >= height - tolerance;
      meetsBottom = isFaceSolid('bottom') && bounds.y <= tolerance;
      meetsLeft = isFaceSolid('back') && bounds.z <= tolerance;
      meetsRight = isFaceSolid('front') && bounds.z + bounds.d >= depth - tolerance;
      break;
    case 'y':
      panelWidth = bounds.w;
      panelHeight = bounds.d;
      meetsTop = isFaceSolid('back') && bounds.z <= tolerance;
      meetsBottom = isFaceSolid('front') && bounds.z + bounds.d >= depth - tolerance;
      meetsLeft = isFaceSolid('left') && bounds.x <= tolerance;
      meetsRight = isFaceSolid('right') && bounds.x + bounds.w >= width - tolerance;
      break;
    case 'z':
      panelWidth = bounds.w;
      panelHeight = bounds.h;
      meetsTop = isFaceSolid('top') && bounds.y + bounds.h >= height - tolerance;
      meetsBottom = isFaceSolid('bottom') && bounds.y <= tolerance;
      meetsLeft = isFaceSolid('left') && bounds.x <= tolerance;
      meetsRight = isFaceSolid('right') && bounds.x + bounds.w >= width - tolerance;
      break;
  }

  const halfW = panelWidth / 2;
  const halfH = panelHeight / 2;

  // Corners inset where tabs extend
  const corners: Record<string, Point> = {
    topLeft: {
      x: -halfW + (meetsLeft ? materialThickness : 0),
      y: halfH - (meetsTop ? materialThickness : 0),
    },
    topRight: {
      x: halfW - (meetsRight ? materialThickness : 0),
      y: halfH - (meetsTop ? materialThickness : 0),
    },
    bottomRight: {
      x: halfW - (meetsRight ? materialThickness : 0),
      y: -halfH + (meetsBottom ? materialThickness : 0),
    },
    bottomLeft: {
      x: -halfW + (meetsLeft ? materialThickness : 0),
      y: -halfH + (meetsBottom ? materialThickness : 0),
    },
  };

  const edgeConfigs = [
    { start: corners.topLeft, end: corners.topRight, hasTabs: meetsTop, position: 'top' as const },
    { start: corners.topRight, end: corners.bottomRight, hasTabs: meetsRight, position: 'right' as const },
    { start: corners.bottomRight, end: corners.bottomLeft, hasTabs: meetsBottom, position: 'bottom' as const },
    { start: corners.bottomLeft, end: corners.topLeft, hasTabs: meetsLeft, position: 'left' as const },
  ];

  const outlinePoints: PathPoint[] = [];

  for (const { start, end, hasTabs, position: edgePosition } of edgeConfigs) {
    const edgeLength = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));

    let points: Point[];
    if (hasTabs) {
      // Calculate corner inset for adjusted gap multiplier
      // Use Math.max: prioritize correct alignment on the closed/inset side
      const isHorizontalEdge = edgePosition === 'top' || edgePosition === 'bottom';
      const cornerInset = isHorizontalEdge
        ? Math.max(meetsLeft ? materialThickness : 0, meetsRight ? materialThickness : 0)
        : Math.max(meetsTop ? materialThickness : 0, meetsBottom ? materialThickness : 0);
      const adjustedGapMultiplier = Math.max(0, fingerGap - cornerInset / fingerWidth);

      points = generateFingerJointPath(start, end, {
        edgeLength,
        fingerWidth,
        materialThickness,
        isTabOut: true,
        kerf: 0,
        yUp: true,
        cornerGapMultiplier: adjustedGapMultiplier,
      });
    } else {
      points = [start, end];
    }

    const startIndex = outlinePoints.length === 0 ? 0 : 1;
    for (let i = startIndex; i < points.length; i++) {
      outlinePoints.push(points[i]);
    }
  }

  // Calculate 3D position
  let panelPosition: [number, number, number];
  let panelRotation: [number, number, number];

  const scaledPos = position * scale;
  const halfWidth = (width * scale) / 2;
  const halfHeight = (height * scale) / 2;
  const halfDepth = (depth * scale) / 2;

  switch (axis) {
    case 'x':
      panelPosition = [scaledPos - halfWidth, 0, 0];
      panelRotation = [0, Math.PI / 2, 0];
      break;
    case 'y':
      panelPosition = [0, scaledPos - halfHeight, 0];
      panelRotation = [Math.PI / 2, 0, 0];
      break;
    case 'z':
      panelPosition = [0, 0, scaledPos - halfDepth];
      panelRotation = [0, 0, 0];
      break;
  }

  const source: PanelSource = {
    type: 'divider',
    subdivisionId: subdivision.id,
    axis,
  };

  return {
    id: `divider-${subdivision.id}`,
    source,
    outline: { points: outlinePoints, closed: true },
    holes: [], // Divider intersection slots would go here
    width: panelWidth,
    height: panelHeight,
    thickness: materialThickness,
    position: panelPosition,
    rotation: panelRotation,
    label: `DIV-${axis.toUpperCase()}@${position.toFixed(1)}mm`,
    visible: true,
  };
};

// =============================================================================
// Main Generation Function
// =============================================================================

export const generatePanelCollection = (
  faces: Face[],
  rootVoid: Void,
  config: BoxConfig,
  scale: number = 1
): PanelCollection => {
  const panels: PanelPath[] = [];

  // Generate face panels
  const faceIds: FaceId[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];
  for (const faceId of faceIds) {
    const panel = generateFacePanel(faceId, faces, rootVoid, config, scale);
    if (panel) {
      panels.push(panel);
    }
  }

  // Generate divider panels
  const subdivisions = getAllSubdivisions(rootVoid);
  for (const sub of subdivisions) {
    const panel = generateDividerPanel(sub, faces, config, scale);
    panels.push(panel);
  }

  return {
    panels,
    augmentations: [],
    generatedAt: Date.now(),
  };
};
