import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useBoxStore } from '../store/useBoxStore';
import { FaceId, Face, BoxConfig } from '../types';
import { generateFingerJointPath, Point } from '../utils/fingerJoints';

interface FaceWithFingersProps {
  faceId: FaceId;
  position: [number, number, number];
  rotation: [number, number, number];
  sizeW: number;  // Width of face in scaled units
  sizeH: number;  // Height of face in scaled units
  scale: number;  // Scale factor from mm to display units
  isSelected: boolean;
  isSolid: boolean;
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

const shouldTabOut = (faceId: FaceId, position: 'top' | 'bottom' | 'left' | 'right'): boolean => {
  const tabOutMap: Record<FaceId, ('top' | 'bottom' | 'left' | 'right')[]> = {
    front: ['top', 'left'],
    back: ['top', 'right'],
    left: ['top', 'left'],
    right: ['top', 'right'],
    top: ['top', 'left'],
    bottom: ['bottom', 'right'],
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
  onClick,
}) => {
  const { config, faces } = useBoxStore();
  const { materialThickness, fingerWidth } = config;

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

    const corners: Record<string, Point> = {
      topLeft: { x: -halfW, y: halfH },
      topRight: { x: halfW, y: halfH },
      bottomRight: { x: halfW, y: -halfH },
      bottomLeft: { x: -halfW, y: -halfH },
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
        points = generateFingerJointPath(start, end, {
          edgeLength,
          fingerWidth: scaledFingerWidth,
          materialThickness: scaledThickness,
          isTabOut,
          kerf: 0,
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

    // Extrude the shape to create 3D geometry
    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: scaledThickness,
      bevelEnabled: false,
    };

    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);

    // Center the geometry on its thickness
    geo.translate(0, 0, -scaledThickness / 2);

    return geo;
  }, [faceId, sizeW, sizeH, scale, config, faces, isSolid, materialThickness, fingerWidth]);

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
    <mesh
      position={position}
      rotation={rotation}
      geometry={geometry}
      onClick={onClick}
    >
      <meshStandardMaterial
        color={isSelected ? '#9b59b6' : '#3498db'}
        transparent
        opacity={isSelected ? 0.9 : 0.85}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};
