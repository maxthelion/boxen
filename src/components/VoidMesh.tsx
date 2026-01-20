import React, { useRef, useState } from 'react';
import { Mesh } from 'three';
import { useBoxStore, isVoidVisible } from '../store/useBoxStore';
import { Bounds } from '../types';

interface VoidMeshProps {
  voidId: string;
  bounds: Bounds;
  boxCenter: { x: number; y: number; z: number };
}

export const VoidMesh: React.FC<VoidMeshProps> = ({ voidId, bounds, boxCenter }) => {
  const meshRef = useRef<Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const { selectedVoidId, selectVoid, selectionMode, rootVoid, hiddenVoidIds, isolatedVoidId } = useBoxStore();

  const isSelected = selectedVoidId === voidId;
  const isVoidMode = selectionMode === 'void';
  const visible = isVoidVisible(voidId, rootVoid, hiddenVoidIds, isolatedVoidId);

  const position: [number, number, number] = [
    bounds.x + bounds.w / 2 - boxCenter.x,
    bounds.y + bounds.h / 2 - boxCenter.y,
    bounds.z + bounds.d / 2 - boxCenter.z,
  ];

  const scale: [number, number, number] = [
    bounds.w * 0.95,
    bounds.h * 0.95,
    bounds.d * 0.95,
  ];

  // Only render interactive void mesh in void selection mode and if visible
  if (!isVoidMode || !visible) {
    return null;
  }

  return (
    <mesh
      ref={meshRef}
      position={position}
      scale={scale}
      onClick={(e) => {
        e.stopPropagation();
        selectVoid(isSelected ? null : voidId);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = 'auto';
      }}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color={isSelected ? '#4a90d9' : hovered ? '#6ab04c' : '#95a5a6'}
        transparent
        opacity={isSelected ? 0.6 : hovered ? 0.4 : 0.2}
      />
    </mesh>
  );
};
