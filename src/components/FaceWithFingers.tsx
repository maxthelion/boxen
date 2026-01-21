import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useBoxStore } from '../store/useBoxStore';
import { FaceId, Face, BoxConfig, Bounds } from '../types';
import { generateFingerJointPath, Point } from '../utils/fingerJoints';

// Divider intersection info (passed from Box3D)
export interface DividerIntersection {
  subdivisionId: string;
  position: number;  // Position along the face in local 2D coordinates
  length: number;    // Length of the slot
  orientation: 'horizontal' | 'vertical';
  dividerBounds: Bounds;
  dividerAxis: 'x' | 'y' | 'z';
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

// Determines which face has tabs vs slots at each edge.
// Front/back have tabs on ALL edges (they're the primary faces).
// Left/right have tabs on top/bottom, slots on front/back edges.
// Top/bottom have slots on all edges (receive tabs from all vertical faces).
const shouldTabOut = (faceId: FaceId, position: 'top' | 'bottom' | 'left' | 'right'): boolean => {
  const tabOutMap: Record<FaceId, ('top' | 'bottom' | 'left' | 'right')[]> = {
    front: ['top', 'bottom', 'left', 'right'],  // tabs on all edges
    back: ['top', 'bottom', 'left', 'right'],   // tabs on all edges
    left: ['top', 'bottom'],                     // tabs on top/bottom only
    right: ['top', 'bottom'],                    // tabs on top/bottom only
    top: [],                                     // never tabs out
    bottom: [],                                  // never tabs out
  };
  return tabOutMap[faceId].includes(position);
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
  onClick,
}) => {
  const { config, faces } = useBoxStore();
  const { materialThickness, fingerWidth, fingerGap } = config;

  const geometry = useMemo(() => {
    if (!isSolid) return null;

    const scaledThickness = materialThickness * scale;
    const scaledFingerWidth = fingerWidth * scale;

    // Create the face shape with finger joints
    const shape = new THREE.Shape();
    const edges = getFaceEdges(faceId);

    // Define corners (centered at origin)
    const halfW = sizeW / 2;
    const halfH = sizeH / 2;

    // Check which edges have tabs extending outward (only if adjacent face is solid)
    // Corners need to be inset when their adjacent edges have tabs,
    // so that tabs extend TO (not beyond) the outer dimensions
    const edgeHasTabs = (position: 'top' | 'bottom' | 'left' | 'right'): boolean => {
      const edgeInfo = edges.find(e => e.position === position)!;
      const adjacentFace = faces.find(f => f.id === edgeInfo.adjacentFaceId);
      const isSolidAdjacent = adjacentFace?.solid ?? false;
      return isSolidAdjacent && shouldTabOut(faceId, position);
    };

    const topHasTabs = edgeHasTabs('top');
    const bottomHasTabs = edgeHasTabs('bottom');
    const leftHasTabs = edgeHasTabs('left');
    const rightHasTabs = edgeHasTabs('right');

    // Inset corners by material thickness where tabs will extend outward
    // This ensures the total panel size (base + tabs) equals the intended outer dimensions
    const corners: Record<string, Point> = {
      topLeft: {
        x: -halfW + (leftHasTabs ? scaledThickness : 0),
        y: halfH - (topHasTabs ? scaledThickness : 0),
      },
      topRight: {
        x: halfW - (rightHasTabs ? scaledThickness : 0),
        y: halfH - (topHasTabs ? scaledThickness : 0),
      },
      bottomRight: {
        x: halfW - (rightHasTabs ? scaledThickness : 0),
        y: -halfH + (bottomHasTabs ? scaledThickness : 0),
      },
      bottomLeft: {
        x: -halfW + (leftHasTabs ? scaledThickness : 0),
        y: -halfH + (bottomHasTabs ? scaledThickness : 0),
      },
    };

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

      if (isSolidAdjacent) {
        const isTabOut = shouldTabOut(faceId, edgeInfo.position);

        // Calculate corner inset for this edge to adjust finger gap
        // Horizontal edges (top/bottom): corners inset in X if left/right edges have tabs
        // Vertical edges (left/right): corners inset in Y if top/bottom edges have tabs
        const isHorizontalEdge = edgeInfo.position === 'top' || edgeInfo.position === 'bottom';
        const cornerInset = isHorizontalEdge
          ? (leftHasTabs ? scaledThickness : 0)  // left and right have same tab status
          : (topHasTabs ? scaledThickness : 0);  // top and bottom have same tab status

        // Reduce corner gap by inset amount so fingers align with mating edges
        // Gap from outer dimension should be uniform for both tabbed and slotted edges
        const adjustedGapMultiplier = Math.max(0, fingerGap - cornerInset / scaledFingerWidth);

        points = generateFingerJointPath(start, end, {
          edgeLength,
          fingerWidth: scaledFingerWidth,
          materialThickness: scaledThickness,
          isTabOut,
          kerf: 0,
          yUp: true,  // Three.js uses Y-up coordinate system
          cornerGapMultiplier: adjustedGapMultiplier,
        });
      } else {
        // Straight edge for open adjacent faces
        points = [start, end];
      }

      for (let i = 0; i < points.length; i++) {
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

    // Add slots (rectangular holes) for divider intersections
    // Each slot is a simple rectangle: length = finger width (tab length), width = material thickness
    for (const intersection of dividerIntersections) {
      const { position: slotPos, length: slotLength, orientation } = intersection;

      // Calculate finger/tab positions along the divider edge
      // This must match the finger pattern generated by the divider
      const cornerGapVal = scaledFingerWidth * fingerGap;
      const usableSlotLength = slotLength - (cornerGapVal * 2);

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
      const slotHalfLength = slotLength / 2;

      // Create a rectangular slot for each tab (even positions have tabs)
      for (let i = 0; i < numFingers; i++) {
        const isEvenPosition = i % 2 === 0;
        if (!isEvenPosition) continue;  // Only even positions have tabs

        const fingerStart = -slotHalfLength + cornerGapVal + i * actualFingerWidth;
        const fingerEnd = fingerStart + actualFingerWidth;

        const holePath = new THREE.Path();

        if (orientation === 'vertical') {
          // Vertical slot - rectangle at X = slotPos, spanning fingerStart to fingerEnd in Y
          holePath.moveTo(slotPos - slotHalfWidth, fingerStart);
          holePath.lineTo(slotPos + slotHalfWidth, fingerStart);
          holePath.lineTo(slotPos + slotHalfWidth, fingerEnd);
          holePath.lineTo(slotPos - slotHalfWidth, fingerEnd);
        } else {
          // Horizontal slot - rectangle at Y = slotPos, spanning fingerStart to fingerEnd in X
          holePath.moveTo(fingerStart, slotPos - slotHalfWidth);
          holePath.lineTo(fingerEnd, slotPos - slotHalfWidth);
          holePath.lineTo(fingerEnd, slotPos + slotHalfWidth);
          holePath.lineTo(fingerStart, slotPos + slotHalfWidth);
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
  }, [faceId, sizeW, sizeH, scale, config, faces, isSolid, materialThickness, fingerWidth, fingerGap, dividerIntersections]);

  // Create edge geometry for outline - must be before any early returns to maintain hooks order
  const edgesGeometry = useMemo(() => {
    if (!geometry) return null;
    return new THREE.EdgesGeometry(geometry, 1);  // threshold angle of 1 degree
  }, [geometry]);

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

  return (
    <group position={position} rotation={rotation}>
      {/* Solid panel mesh */}
      <mesh geometry={geometry} onClick={onClick}>
        <meshStandardMaterial
          color={isSelected ? '#9b59b6' : '#3498db'}
          transparent
          opacity={isSelected ? 0.9 : 0.7}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Outline */}
      {edgesGeometry && (
        <lineSegments geometry={edgesGeometry}>
          <lineBasicMaterial color={isSelected ? '#7b4397' : '#1a5276'} linewidth={1} />
        </lineSegments>
      )}
    </group>
  );
};
