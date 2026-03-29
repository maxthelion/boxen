import React from 'react';
import { useBoxStore } from '../store/useBoxStore';
import { SubAssembly, Bounds } from '../types';
import * as THREE from 'three';
import { AssemblyAxisIndicator, LidFaceHighlight } from './AssemblyAxisIndicator';
import { useColors } from '../hooks/useColors';

interface SubAssembly3DProps {
  subAssembly: SubAssembly;
  parentBounds: Bounds;  // The void bounds this sub-assembly sits in
  scale: number;
  boxCenter: { x: number; y: number; z: number };
}

export const SubAssembly3D: React.FC<SubAssembly3DProps> = ({
  subAssembly,
  parentBounds,
  scale: _scale,  // No longer used: 1 world unit = 1mm
  boxCenter,
}) => {
  const { selectedSubAssemblyIds, selectSubAssembly, selectionMode, selectedAssemblyId, selectAssembly, operationState } = useBoxStore();
  const colors = useColors();

  const isSelectedSubAssembly = selectedSubAssemblyIds.has(subAssembly.id);
  const isSelectedAssembly = selectedAssemblyId === subAssembly.id;
  const isSelected = isSelectedSubAssembly || isSelectedAssembly;
  const isCreating = operationState.activeOperation === 'create-sub-assembly';
  const showAxisIndicator = isSelected || isCreating;
  const { clearance, rootVoid, materialThickness, faceOffsets } = subAssembly;

  // Get face offsets (default to 0 if not set)
  const offsets = faceOffsets || { left: 0, right: 0, top: 0, bottom: 0, front: 0, back: 0 };

  // Calculate the sub-assembly outer dimensions (inner + 2*materialThickness)
  const subOuterW = rootVoid.bounds.w + 2 * materialThickness;
  const subOuterH = rootVoid.bounds.h + 2 * materialThickness;
  const subOuterD = rootVoid.bounds.d + 2 * materialThickness;

  // 1 world unit = 1mm, so dimensions are used directly
  const scaledW = subOuterW;
  const scaledH = subOuterH;
  const scaledD = subOuterD;

  // Calculate the center position of the sub-assembly within the parent void
  // Face offsets shift the base position: positive offset extends outward from clearance boundary
  const subCenterX = parentBounds.x + clearance - offsets.left + subOuterW / 2 - boxCenter.x;
  const subCenterY = parentBounds.y + clearance - offsets.bottom + subOuterH / 2 - boxCenter.y;
  const subCenterZ = parentBounds.z + clearance - offsets.back + subOuterD / 2 - boxCenter.z;

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
      {/* Scale slightly to prevent z-fighting with coplanar panel surfaces */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(scaledW * 1.001, scaledH * 1.001, scaledD * 1.001)]} />
        <lineBasicMaterial color={isSelected ? colors.subAssemblyOutline.selected : colors.subAssemblyOutline.unselected} />
      </lineSegments>

      {/* Invisible clickable box for selection (only in void/assembly mode) */}
      {isClickable && (
        <mesh onClick={handleClick}>
          <boxGeometry args={[scaledW, scaledH, scaledD]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}

      {/* Assembly axis indicator - shows when selected or during creation */}
      {showAxisIndicator && (
        <>
          <AssemblyAxisIndicator
            axis={subAssembly.assembly.assemblyAxis}
            dimensions={{ width: scaledW, height: scaledH, depth: scaledD }}
            visible={true}
          />
          <LidFaceHighlight
            axis={subAssembly.assembly.assemblyAxis}
            dimensions={{ width: scaledW, height: scaledH, depth: scaledD }}
            visible={true}
          />
        </>
      )}
    </group>
  );
};
