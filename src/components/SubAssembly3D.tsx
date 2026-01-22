import React from 'react';
import { useBoxStore } from '../store/useBoxStore';
import { SubAssembly, Bounds, FaceId, getFaceRole, getLidSide } from '../types';
import * as THREE from 'three';

interface SubAssembly3DProps {
  subAssembly: SubAssembly;
  parentBounds: Bounds;  // The void bounds this sub-assembly sits in
  scale: number;
  boxCenter: { x: number; y: number; z: number };
}

const faceConfigs: {
  id: FaceId;
  position: (w: number, h: number, d: number) => [number, number, number];
  rotation: [number, number, number];
  size: (w: number, h: number, d: number) => [number, number];
}[] = [
  {
    id: 'front',
    position: (w, h, d) => [0, 0, d / 2],
    rotation: [0, 0, 0],
    size: (w, h) => [w, h],
  },
  {
    id: 'back',
    position: (w, h, d) => [0, 0, -d / 2],
    rotation: [0, Math.PI, 0],
    size: (w, h) => [w, h],
  },
  {
    id: 'left',
    position: (w, h, d) => [-w / 2, 0, 0],
    rotation: [0, -Math.PI / 2, 0],
    size: (w, h, d) => [d, h],
  },
  {
    id: 'right',
    position: (w, h, d) => [w / 2, 0, 0],
    rotation: [0, Math.PI / 2, 0],
    size: (w, h, d) => [d, h],
  },
  {
    id: 'top',
    position: (w, h, d) => [0, h / 2, 0],
    rotation: [-Math.PI / 2, 0, 0],
    size: (w, h, d) => [w, d],
  },
  {
    id: 'bottom',
    position: (w, h, d) => [0, -h / 2, 0],
    rotation: [Math.PI / 2, 0, 0],
    size: (w, h, d) => [w, d],
  },
];

export const SubAssembly3D: React.FC<SubAssembly3DProps> = ({
  subAssembly,
  parentBounds,
  scale,
  boxCenter,
}) => {
  const { selectedSubAssemblyIds, selectSubAssembly, selectionMode, selectedAssemblyId, selectAssembly, hiddenFaceIds } = useBoxStore();

  const isSelectedSubAssembly = selectedSubAssemblyIds.has(subAssembly.id);
  const isSelectedAssembly = selectedAssemblyId === subAssembly.id;
  const isSelected = isSelectedSubAssembly || isSelectedAssembly;
  const { clearance, faces, rootVoid, assembly } = subAssembly;

  // Calculate the sub-assembly dimensions (inner dimensions of the sub-assembly box)
  const subW = rootVoid.bounds.w;
  const subH = rootVoid.bounds.h;
  const subD = rootVoid.bounds.d;

  // Scale the dimensions
  const scaledW = subW * scale;
  const scaledH = subH * scale;
  const scaledD = subD * scale;

  // Calculate the center position of the sub-assembly within the parent void
  // The sub-assembly is centered in the void with clearance on all sides
  const subCenterX = (parentBounds.x + clearance + subW / 2 - boxCenter.x) * scale;
  const subCenterY = (parentBounds.y + clearance + subH / 2 - boxCenter.y) * scale;
  const subCenterZ = (parentBounds.z + clearance + subD / 2 - boxCenter.z) * scale;

  // Color based on type
  const getColor = () => {
    if (isSelected) return '#e74c3c';
    switch (subAssembly.type) {
      case 'drawer': return '#9b59b6';
      case 'tray': return '#1abc9c';
      case 'insert': return '#e67e22';
      default: return '#9b59b6';
    }
  };

  const baseColor = getColor();

  return (
    <group position={[subCenterX, subCenterY, subCenterZ]}>
      {/* Wireframe outline for sub-assembly */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(scaledW, scaledH, scaledD)]} />
        <lineBasicMaterial color={isSelected ? '#e74c3c' : '#666'} />
      </lineSegments>

      {/* Face planes */}
      {faceConfigs.map((faceConfig) => {
        const face = faces.find((f) => f.id === faceConfig.id);
        const isSolid = face?.solid ?? true;
        const faceId = `subasm-${subAssembly.id}-face-${faceConfig.id}`;
        const isHidden = hiddenFaceIds.has(faceId);

        // Skip hidden faces
        if (isHidden) return null;

        const [sizeW, sizeH] = faceConfig.size(scaledW, scaledH, scaledD);
        let position = faceConfig.position(scaledW, scaledH, scaledD);

        // Apply inset adjustments for lid faces
        const faceRole = getFaceRole(faceConfig.id, assembly.assemblyAxis);
        const lidSide = getLidSide(faceConfig.id, assembly.assemblyAxis);
        if (faceRole === 'lid' && lidSide) {
          const lidConfig = assembly.lids[lidSide];
          const inset = lidConfig.inset * scale;

          if (inset > 0) {
            const insetDirection = lidSide === 'positive' ? -1 : 1;

            switch (assembly.assemblyAxis) {
              case 'y':
                position = [position[0], position[1] + insetDirection * inset, position[2]];
                break;
              case 'x':
                position = [position[0] + insetDirection * inset, position[1], position[2]];
                break;
              case 'z':
                position = [position[0], position[1], position[2] + insetDirection * inset];
                break;
            }
          }
        }

        const handleClick = (e: any) => {
          e.stopPropagation();
          if (selectionMode === 'void') {
            selectSubAssembly(subAssembly.id, e.shiftKey);
          } else if (selectionMode === 'assembly') {
            selectAssembly(isSelectedAssembly ? null : subAssembly.id);
          }
        };

        const isClickable = selectionMode === 'void' || selectionMode === 'assembly';

        return (
          <mesh
            key={faceConfig.id}
            position={position}
            rotation={faceConfig.rotation}
            onClick={isClickable ? handleClick : undefined}
          >
            <planeGeometry args={[sizeW, sizeH]} />
            <meshStandardMaterial
              color={isSolid ? baseColor : '#e74c3c'}
              transparent
              opacity={isSolid ? (isSelected ? 0.7 : 0.5) : 0.1}
              side={THREE.DoubleSide}
            />
          </mesh>
        );
      })}
    </group>
  );
};
