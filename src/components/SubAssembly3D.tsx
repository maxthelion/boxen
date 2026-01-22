import React from 'react';
import { useBoxStore } from '../store/useBoxStore';
import { SubAssembly, Bounds } from '../types';
import * as THREE from 'three';

interface SubAssembly3DProps {
  subAssembly: SubAssembly;
  parentBounds: Bounds;  // The void bounds this sub-assembly sits in
  scale: number;
  boxCenter: { x: number; y: number; z: number };
}

export const SubAssembly3D: React.FC<SubAssembly3DProps> = ({
  subAssembly,
  parentBounds,
  scale,
  boxCenter,
}) => {
  const { selectedSubAssemblyIds, selectSubAssembly, selectionMode, selectedAssemblyId, selectAssembly } = useBoxStore();

  const isSelectedSubAssembly = selectedSubAssemblyIds.has(subAssembly.id);
  const isSelectedAssembly = selectedAssemblyId === subAssembly.id;
  const isSelected = isSelectedSubAssembly || isSelectedAssembly;
  const { clearance, rootVoid, materialThickness, faceOffsets } = subAssembly;

  // Get face offsets (default to 0 if not set)
  const offsets = faceOffsets || { left: 0, right: 0, top: 0, bottom: 0, front: 0, back: 0 };

  // Calculate the sub-assembly outer dimensions (inner + 2*materialThickness)
  const subOuterW = rootVoid.bounds.w + 2 * materialThickness;
  const subOuterH = rootVoid.bounds.h + 2 * materialThickness;
  const subOuterD = rootVoid.bounds.d + 2 * materialThickness;

  // Scale the dimensions
  const scaledW = subOuterW * scale;
  const scaledH = subOuterH * scale;
  const scaledD = subOuterD * scale;

  // Calculate the center position of the sub-assembly within the parent void
  // Face offsets shift the base position: positive offset extends outward from clearance boundary
  const subCenterX = (parentBounds.x + clearance - offsets.left + subOuterW / 2 - boxCenter.x) * scale;
  const subCenterY = (parentBounds.y + clearance - offsets.bottom + subOuterH / 2 - boxCenter.y) * scale;
  const subCenterZ = (parentBounds.z + clearance - offsets.back + subOuterD / 2 - boxCenter.z) * scale;

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
    <group position={[subCenterX, subCenterY, subCenterZ]}>
      {/* Wireframe outline for sub-assembly selection */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(scaledW, scaledH, scaledD)]} />
        <lineBasicMaterial color={isSelected ? '#e74c3c' : '#666'} />
      </lineSegments>

      {/* Invisible clickable box for selection (only in void/assembly mode) */}
      {isClickable && (
        <mesh onClick={handleClick}>
          <boxGeometry args={[scaledW, scaledH, scaledD]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
};
