import React from 'react';
import { useBoxStore } from '../store/useBoxStore';
import { SubAssembly, Bounds, FaceId } from '../types';
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
  const { selectedSubAssemblyId, selectSubAssembly, selectionMode, selectedAssemblyId, selectAssembly } = useBoxStore();

  const isSelectedSubAssembly = selectedSubAssemblyId === subAssembly.id;
  const isSelectedAssembly = selectedAssemblyId === subAssembly.id;
  const isSelected = isSelectedSubAssembly || isSelectedAssembly;
  const { clearance, faces, rootVoid } = subAssembly;

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
        const [sizeW, sizeH] = faceConfig.size(scaledW, scaledH, scaledD);
        const position = faceConfig.position(scaledW, scaledH, scaledD);

        const handleClick = (e: any) => {
          e.stopPropagation();
          if (selectionMode === 'void') {
            selectSubAssembly(isSelectedSubAssembly ? null : subAssembly.id);
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
