import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useEngineConfig, useEngineFaces } from '../engine';
import { FaceId, Face, BoxConfig, Bounds, AssemblyConfig, getFaceRole, getLidSide, getWallPriority } from '../types';
import { generateFingerJointPath, Point } from '../utils/fingerJoints';

// Divider intersection info (passed from Box3D)
export interface DividerIntersection {
  subdivisionId: string;
  position: number;  // Position along the face in local 2D coordinates
  length: number;    // Length of the slot
  orientation: 'horizontal' | 'vertical';
  dividerBounds: Bounds;
  dividerAxis: 'x' | 'y' | 'z';
  startInset: number;  // Inset at start of slot (scaled) - where divider meets perpendicular outer face
  endInset: number;    // Inset at end of slot (scaled)
}

interface FaceWithFingersProps {
  faceId: FaceId;
  position: [number, number, number];
  rotation: [number, number, number];
  sizeW: number;  // Width of face in scaled units
  sizeH: number;  // Height of face in scaled units
  scale: number;  // Scale factor from mm to display units
  isSelected: boolean;
  isSolid: boolean;
  dividerIntersections?: DividerIntersection[];  // Dividers that intersect this face
  lidIntersections?: DividerIntersection[];  // Lid tabs that intersect this wall face
  assembly: AssemblyConfig;  // Assembly configuration for dynamic tab direction
  onClick?: () => void;
}

interface EdgeInfo {
  adjacentFaceId: FaceId;
  position: 'top' | 'bottom' | 'left' | 'right';
}

const getFaceEdges = (faceId: FaceId): EdgeInfo[] => {
  switch (faceId) {
    case 'front':
      return [
        { adjacentFaceId: 'top', position: 'top' },
        { adjacentFaceId: 'bottom', position: 'bottom' },
        { adjacentFaceId: 'left', position: 'left' },
        { adjacentFaceId: 'right', position: 'right' },
      ];
    case 'back':
      return [
        { adjacentFaceId: 'top', position: 'top' },
        { adjacentFaceId: 'bottom', position: 'bottom' },
        { adjacentFaceId: 'right', position: 'left' },
        { adjacentFaceId: 'left', position: 'right' },
      ];
    case 'left':
      return [
        { adjacentFaceId: 'top', position: 'top' },
        { adjacentFaceId: 'bottom', position: 'bottom' },
        { adjacentFaceId: 'back', position: 'left' },
        { adjacentFaceId: 'front', position: 'right' },
      ];
    case 'right':
      return [
        { adjacentFaceId: 'top', position: 'top' },
        { adjacentFaceId: 'bottom', position: 'bottom' },
        { adjacentFaceId: 'front', position: 'left' },
        { adjacentFaceId: 'back', position: 'right' },
      ];
    case 'top':
      return [
        { adjacentFaceId: 'back', position: 'top' },
        { adjacentFaceId: 'front', position: 'bottom' },
        { adjacentFaceId: 'left', position: 'left' },
        { adjacentFaceId: 'right', position: 'right' },
      ];
    case 'bottom':
      return [
        { adjacentFaceId: 'front', position: 'top' },
        { adjacentFaceId: 'back', position: 'bottom' },
        { adjacentFaceId: 'left', position: 'left' },
        { adjacentFaceId: 'right', position: 'right' },
      ];
  }
};

// Dynamic tab direction logic based on assembly configuration
// Returns true if this face should have tabs extending outward at the given edge
// Returns null if the edge should be straight (no finger joint) - e.g., wall edges for inset lids
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
      // Inset lids still have tabs (like dividers) that fit into wall slot holes
      // tabs-out means lid has tabs extending into walls
      return assembly.lids[side].tabDirection === 'tabs-out';
    }
    return false;
  }

  // Wall-to-Lid interactions
  if (adjRole === 'lid') {
    const side = getLidSide(adjacentFaceId, assembly.assemblyAxis);
    if (side) {
      // If lid is inset, wall edge should be straight (no fingers)
      // Wall will have slot holes for the inset lid's tabs instead
      if (assembly.lids[side].inset > 0) {
        return null;  // Straight edge, no fingers - slots are cut as holes
      }
      return assembly.lids[side].tabDirection === 'tabs-in';
    }
    return false;
  }

  return false;
};

export const FaceWithFingers: React.FC<FaceWithFingersProps> = ({
  faceId,
  position,
  rotation,
  sizeW,
  sizeH,
  scale,
  isSelected,
  isSolid,
  dividerIntersections = [],
  lidIntersections = [],
  assembly,
  onClick,
}) => {
  const config = useEngineConfig();
  const faces = useEngineFaces();

  // Early return if engine not initialized
  if (!config) return null;

  const { materialThickness, fingerWidth, fingerGap } = config;

  // Compute data needed for both geometry and outline rendering
  const shapeData = useMemo(() => {
    if (!isSolid) return null;

    const scaledThickness = materialThickness * scale;
    const scaledFingerWidth = fingerWidth * scale;
    const edges = getFaceEdges(faceId);
    const halfW = sizeW / 2;
    const halfH = sizeH / 2;

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

    const corners: Record<string, Point> = {
      topLeft: { x: -halfW + (leftHasTabs ? scaledThickness : 0), y: halfH - (topHasTabs ? scaledThickness : 0) },
      topRight: { x: halfW - (rightHasTabs ? scaledThickness : 0), y: halfH - (topHasTabs ? scaledThickness : 0) },
      bottomRight: { x: halfW - (rightHasTabs ? scaledThickness : 0), y: -halfH + (bottomHasTabs ? scaledThickness : 0) },
      bottomLeft: { x: -halfW + (leftHasTabs ? scaledThickness : 0), y: -halfH + (bottomHasTabs ? scaledThickness : 0) },
    };

    return { scaledThickness, scaledFingerWidth, topHasTabs, bottomHasTabs, leftHasTabs, rightHasTabs, corners, edges };
  }, [faceId, sizeW, sizeH, scale, faces, isSolid, materialThickness, fingerWidth, fingerGap, assembly]);

  // Collect outline paths for custom edge rendering
  const outlinePaths = useMemo(() => {
    if (!isSolid || !shapeData) return null;

    const { scaledThickness, scaledFingerWidth, topHasTabs, bottomHasTabs, leftHasTabs, rightHasTabs, corners, edges } = shapeData;

    const edgeConfigs: { start: Point; end: Point; edgeInfo: EdgeInfo }[] = [
      { start: corners.topLeft, end: corners.topRight, edgeInfo: edges.find(e => e.position === 'top')! },
      { start: corners.topRight, end: corners.bottomRight, edgeInfo: edges.find(e => e.position === 'right')! },
      { start: corners.bottomRight, end: corners.bottomLeft, edgeInfo: edges.find(e => e.position === 'bottom')! },
      { start: corners.bottomLeft, end: corners.topLeft, edgeInfo: edges.find(e => e.position === 'left')! },
    ];

    // Collect outer path points
    const outerPoints: Point[] = [];
    for (const { start, end, edgeInfo } of edgeConfigs) {
      const adjacentFace = faces.find(f => f.id === edgeInfo.adjacentFaceId);
      const isSolidAdjacent = adjacentFace?.solid ?? false;
      const edgeLength = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
      const tabOutResult = isSolidAdjacent ? shouldTabOut(faceId, edgeInfo.adjacentFaceId, assembly) : null;

      let points: Point[];
      if (tabOutResult !== null) {
        const isHorizontalEdge = edgeInfo.position === 'top' || edgeInfo.position === 'bottom';
        // Use Math.max: prioritize correct alignment on the closed/inset side
        // The open side will have a smaller margin, but fit is more important than aesthetics
        const cornerInset = isHorizontalEdge
          ? Math.max(leftHasTabs ? scaledThickness : 0, rightHasTabs ? scaledThickness : 0)
          : Math.max(topHasTabs ? scaledThickness : 0, bottomHasTabs ? scaledThickness : 0);
        const adjustedGapMultiplier = Math.max(0, fingerGap - cornerInset / scaledFingerWidth);
        points = generateFingerJointPath(start, end, {
          edgeLength, fingerWidth: scaledFingerWidth, materialThickness: scaledThickness,
          isTabOut: tabOutResult, kerf: 0, yUp: true, cornerGapMultiplier: adjustedGapMultiplier,
        });
      } else {
        points = [start, end];
      }

      const startIndex = outerPoints.length === 0 ? 0 : 1;
      for (let i = startIndex; i < points.length; i++) {
        outerPoints.push(points[i]);
      }
    }

    // Collect hole paths for slot outlines (must match geometry calculation)
    const holesPaths: Point[][] = [];
    const allIntersections = [...dividerIntersections, ...lidIntersections];
    const cornerGapVal = scaledFingerWidth * fingerGap;

    for (const intersection of allIntersections) {
      const { position: slotPos, length: slotLength, orientation, startInset, endInset } = intersection;
      const effectiveLength = slotLength - startInset - endInset;
      const slotHalfLength = slotLength / 2;
      // Dividers use Math.max of corner insets for gap adjustment
      const maxInset = Math.max(startInset, endInset);
      const adjustedCornerGap = Math.max(0, cornerGapVal - maxInset);
      const usableSlotLength = effectiveLength - (adjustedCornerGap * 2);

      if (usableSlotLength < scaledFingerWidth) continue;

      let numFingers = Math.max(1, Math.floor(usableSlotLength / scaledFingerWidth));
      if (numFingers % 2 === 0) numFingers++;
      const actualFingerWidth = usableSlotLength / numFingers;
      const slotWidth = scaledThickness;
      const slotHalfWidth = slotWidth / 2;
      const fingerRegionStart = -slotHalfLength + startInset + adjustedCornerGap;

      for (let i = 0; i < numFingers; i++) {
        if (i % 2 !== 0) continue;
        const fingerStart = fingerRegionStart + i * actualFingerWidth;
        const fingerEnd = fingerStart + actualFingerWidth;

        const holePoints: Point[] = [];
        if (orientation === 'vertical') {
          holePoints.push({ x: slotPos - slotHalfWidth, y: fingerStart });
          holePoints.push({ x: slotPos + slotHalfWidth, y: fingerStart });
          holePoints.push({ x: slotPos + slotHalfWidth, y: fingerEnd });
          holePoints.push({ x: slotPos - slotHalfWidth, y: fingerEnd });
        } else {
          holePoints.push({ x: fingerStart, y: slotPos - slotHalfWidth });
          holePoints.push({ x: fingerEnd, y: slotPos - slotHalfWidth });
          holePoints.push({ x: fingerEnd, y: slotPos + slotHalfWidth });
          holePoints.push({ x: fingerStart, y: slotPos + slotHalfWidth });
        }
        holesPaths.push(holePoints);
      }
    }

    return { outerPoints, holesPaths, scaledThickness };
  }, [faceId, sizeW, sizeH, scale, faces, isSolid, shapeData, fingerGap, dividerIntersections, lidIntersections, assembly]);

  const geometry = useMemo(() => {
    if (!isSolid || !shapeData) return null;

    const { scaledThickness, scaledFingerWidth, topHasTabs, bottomHasTabs, leftHasTabs, rightHasTabs, corners, edges } = shapeData;

    // Create the face shape with finger joints
    const shape = new THREE.Shape();

    const edgeConfigs: { start: Point; end: Point; edgeInfo: EdgeInfo }[] = [
      { start: corners.topLeft, end: corners.topRight, edgeInfo: edges.find(e => e.position === 'top')! },
      { start: corners.topRight, end: corners.bottomRight, edgeInfo: edges.find(e => e.position === 'right')! },
      { start: corners.bottomRight, end: corners.bottomLeft, edgeInfo: edges.find(e => e.position === 'bottom')! },
      { start: corners.bottomLeft, end: corners.topLeft, edgeInfo: edges.find(e => e.position === 'left')! },
    ];

    let isFirst = true;

    for (const { start, end, edgeInfo } of edgeConfigs) {
      const adjacentFace = faces.find(f => f.id === edgeInfo.adjacentFaceId);
      const isSolidAdjacent = adjacentFace?.solid ?? false;

      const edgeLength = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));

      let points: Point[];

      const tabOutResult = isSolidAdjacent ? shouldTabOut(faceId, edgeInfo.adjacentFaceId, assembly) : null;

      // tabOutResult === null means straight edge (for open faces or inset lids)
      // tabOutResult === true/false means finger joints
      if (tabOutResult !== null) {
        // Calculate corner inset for this edge to adjust finger gap
        // Use the MINIMUM of both corner insets - only reduce gap when BOTH corners are inset
        // This ensures proper alignment when one adjacent face is open (no inset) and other is solid (inset)
        const isHorizontalEdge = edgeInfo.position === 'top' || edgeInfo.position === 'bottom';
        // Use Math.max: prioritize correct alignment on the closed/inset side
        // The open side will have a smaller margin, but fit is more important than aesthetics
        const cornerInset = isHorizontalEdge
          ? Math.max(leftHasTabs ? scaledThickness : 0, rightHasTabs ? scaledThickness : 0)
          : Math.max(topHasTabs ? scaledThickness : 0, bottomHasTabs ? scaledThickness : 0);

        // Reduce corner gap by inset amount so fingers align with mating edges
        const adjustedGapMultiplier = Math.max(0, fingerGap - cornerInset / scaledFingerWidth);

        points = generateFingerJointPath(start, end, {
          edgeLength,
          fingerWidth: scaledFingerWidth,
          materialThickness: scaledThickness,
          isTabOut: tabOutResult,
          kerf: 0,
          yUp: true,  // Three.js uses Y-up coordinate system
          cornerGapMultiplier: adjustedGapMultiplier,
        });
      } else {
        // Straight edge for open adjacent faces or inset lid edges
        points = [start, end];
      }

      // Skip the first point of each edge after the first edge, since it's
      // the same as the last point of the previous edge
      const startIndex = isFirst ? 0 : 1;
      for (let i = startIndex; i < points.length; i++) {
        const pt = points[i];
        if (isFirst && i === 0) {
          shape.moveTo(pt.x, pt.y);
          isFirst = false;
        } else {
          shape.lineTo(pt.x, pt.y);
        }
      }
    }

    shape.closePath();

    // Add slots (rectangular holes) for divider and lid intersections
    // Each slot is a simple rectangle: length = finger width (tab length), width = material thickness
    // Combine divider and lid intersections for slot generation
    const allIntersections = [...dividerIntersections, ...lidIntersections];
    for (const intersection of allIntersections) {
      const { position: slotPos, length: slotLength, orientation, startInset, endInset } = intersection;

      // Calculate finger/tab positions along the divider edge
      // Must match the finger pattern generated by the divider exactly

      // The divider's finger region is inset from the full bounds
      const effectiveLength = slotLength - startInset - endInset;
      const slotHalfLength = slotLength / 2;

      // Dividers use Math.max of corner insets for gap adjustment
      // Prioritize correct alignment on the inset side
      const cornerGapVal = scaledFingerWidth * fingerGap;
      const maxInset = Math.max(startInset, endInset);
      const adjustedCornerGap = Math.max(0, cornerGapVal - maxInset);

      // Usable length for fingers (same calculation as divider)
      const usableSlotLength = effectiveLength - (adjustedCornerGap * 2);

      if (usableSlotLength < scaledFingerWidth) {
        // Too short for any tabs, skip
        continue;
      }

      // Calculate number of fingers (must match divider's finger count)
      let numFingers = Math.max(1, Math.floor(usableSlotLength / scaledFingerWidth));
      if (numFingers % 2 === 0) numFingers++;  // Odd number for symmetry
      const actualFingerWidth = usableSlotLength / numFingers;

      // Slot dimensions
      const slotWidth = scaledThickness;  // Material thickness
      const slotHalfWidth = slotWidth / 2;

      // Starting position for finger region:
      // The divider's fingers start at its physical corner (after inset) + adjustedCornerGap
      // For the slot, we measure from -slotHalfLength (outer dimension)
      const fingerRegionStart = -slotHalfLength + startInset + adjustedCornerGap;

      // Create a rectangular slot for each tab (even positions have tabs)
      for (let i = 0; i < numFingers; i++) {
        const isEvenPosition = i % 2 === 0;
        if (!isEvenPosition) continue;  // Only even positions have tabs

        const fingerStart = fingerRegionStart + i * actualFingerWidth;
        const fingerEnd = fingerStart + actualFingerWidth;

        const holePath = new THREE.Path();

        if (orientation === 'vertical') {
          // Vertical slot - rectangle at X = slotPos, spanning fingerStart to fingerEnd in Y
          // Main shape is clockwise, so holes must be counter-clockwise
          // Counter-clockwise: bottom-left -> bottom-right -> top-right -> top-left
          holePath.moveTo(slotPos - slotHalfWidth, fingerStart);      // bottom-left
          holePath.lineTo(slotPos + slotHalfWidth, fingerStart);      // bottom-right
          holePath.lineTo(slotPos + slotHalfWidth, fingerEnd);        // top-right
          holePath.lineTo(slotPos - slotHalfWidth, fingerEnd);        // top-left
        } else {
          // Horizontal slot - rectangle at Y = slotPos, spanning fingerStart to fingerEnd in X
          // Counter-clockwise: left-bottom -> right-bottom -> right-top -> left-top
          holePath.moveTo(fingerStart, slotPos - slotHalfWidth);      // left-bottom
          holePath.lineTo(fingerEnd, slotPos - slotHalfWidth);        // right-bottom
          holePath.lineTo(fingerEnd, slotPos + slotHalfWidth);        // right-top
          holePath.lineTo(fingerStart, slotPos + slotHalfWidth);      // left-top
        }

        holePath.closePath();
        shape.holes.push(holePath);
      }
    }

    // Extrude the shape to create 3D geometry
    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: scaledThickness,
      bevelEnabled: false,
    };

    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);

    // Center the geometry on its thickness
    geo.translate(0, 0, -scaledThickness / 2);

    return geo;
  }, [faceId, sizeW, sizeH, scale, config, faces, isSolid, shapeData, fingerGap, dividerIntersections, lidIntersections, assembly]);

  // Create custom edge geometry for outline (avoiding triangulation artifacts from EdgesGeometry)
  const customEdgesGeometry = useMemo(() => {
    if (!outlinePaths) return null;

    const { outerPoints, holesPaths, scaledThickness } = outlinePaths;
    const frontZ = scaledThickness / 2;
    const backZ = -scaledThickness / 2;

    // Build line segments: front face outline, back face outline, and connecting edges
    const vertices: number[] = [];

    // Helper to add a line segment
    const addSegment = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) => {
      vertices.push(x1, y1, z1, x2, y2, z2);
    };

    // Helper to add outline for a closed path at a given Z
    const addPathOutline = (points: Point[], z: number) => {
      for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        addSegment(p1.x, p1.y, z, p2.x, p2.y, z);
      }
    };

    // Helper to add connecting edges between front and back for a path
    const addConnectingEdges = (points: Point[]) => {
      for (const p of points) {
        addSegment(p.x, p.y, frontZ, p.x, p.y, backZ);
      }
    };

    // Outer path - front and back outlines
    addPathOutline(outerPoints, frontZ);
    addPathOutline(outerPoints, backZ);
    addConnectingEdges(outerPoints);

    // Hole paths - front and back outlines + connecting edges
    for (const holePath of holesPaths) {
      addPathOutline(holePath, frontZ);
      addPathOutline(holePath, backZ);
      addConnectingEdges(holePath);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    return geometry;
  }, [outlinePaths]);

  if (!isSolid || !geometry) {
    // Render a simple plane for open faces
    return (
      <mesh position={position} rotation={rotation}>
        <planeGeometry args={[sizeW, sizeH]} />
        <meshStandardMaterial
          color="#e74c3c"
          transparent
          opacity={0.1}
          side={THREE.DoubleSide}
        />
      </mesh>
    );
  }

  const handleClick = onClick ? (e: THREE.Event) => {
    e.stopPropagation();
    onClick();
  } : undefined;

  return (
    <group position={position} rotation={rotation}>
      {/* Solid panel mesh */}
      <mesh geometry={geometry} onClick={handleClick}>
        <meshStandardMaterial
          color={isSelected ? '#9b59b6' : '#3498db'}
          transparent
          opacity={isSelected ? 0.9 : 0.7}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Outline - using custom geometry to avoid triangulation artifacts */}
      {customEdgesGeometry && (
        <lineSegments geometry={customEdgesGeometry}>
          <lineBasicMaterial color={isSelected ? '#7b4397' : '#1a5276'} linewidth={1} />
        </lineSegments>
      )}
    </group>
  );
};
