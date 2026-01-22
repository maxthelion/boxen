import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { useThree } from '@react-three/fiber';
import { useBoxStore, isVoidVisible } from '../store/useBoxStore';
import { Bounds } from '../types';

interface VoidMeshProps {
  voidId: string;
  bounds: Bounds;
  boxCenter: { x: number; y: number; z: number };
}

export const VoidMesh: React.FC<VoidMeshProps> = ({ voidId, bounds, boxCenter }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const { selectedVoidIds, selectVoid, hoveredVoidId, setHoveredVoid, selectionMode, rootVoid, hiddenVoidIds, isolatedVoidId, config, faces } = useBoxStore();
  const { size: canvasSize } = useThree();

  const isSelected = selectedVoidIds.has(voidId);
  const isHovered = hoveredVoidId === voidId;
  const isVoidMode = selectionMode === 'void';
  const visible = isVoidVisible(voidId, rootVoid, hiddenVoidIds, isolatedVoidId);

  const { width, height, depth, materialThickness } = config;
  const tolerance = 0.01;

  // Check which edges of this void are at outer box boundaries
  const atLeft = bounds.x < tolerance;
  const atRight = Math.abs(bounds.x + bounds.w - width) < tolerance;
  const atBottom = bounds.y < tolerance;
  const atTop = Math.abs(bounds.y + bounds.h - height) < tolerance;
  const atBack = bounds.z < tolerance;
  const atFront = Math.abs(bounds.z + bounds.d - depth) < tolerance;

  // Check which outer faces are solid
  const leftSolid = faces.find(f => f.id === 'left')?.solid ?? false;
  const rightSolid = faces.find(f => f.id === 'right')?.solid ?? false;
  const bottomSolid = faces.find(f => f.id === 'bottom')?.solid ?? false;
  const topSolid = faces.find(f => f.id === 'top')?.solid ?? false;
  const backSolid = faces.find(f => f.id === 'back')?.solid ?? false;
  const frontSolid = faces.find(f => f.id === 'front')?.solid ?? false;

  // Calculate insets based on boundary and solid face status
  const insetLeft = (atLeft && leftSolid) ? materialThickness : 0;
  const insetRight = (atRight && rightSolid) ? materialThickness : 0;
  const insetBottom = (atBottom && bottomSolid) ? materialThickness : 0;
  const insetTop = (atTop && topSolid) ? materialThickness : 0;
  const insetBack = (atBack && backSolid) ? materialThickness : 0;
  const insetFront = (atFront && frontSolid) ? materialThickness : 0;

  // Calculate inset bounds
  const insetBounds = {
    x: bounds.x + insetLeft,
    y: bounds.y + insetBottom,
    z: bounds.z + insetBack,
    w: bounds.w - insetLeft - insetRight,
    h: bounds.h - insetBottom - insetTop,
    d: bounds.d - insetBack - insetFront,
  };

  const position: [number, number, number] = [
    insetBounds.x + insetBounds.w / 2 - boxCenter.x,
    insetBounds.y + insetBounds.h / 2 - boxCenter.y,
    insetBounds.z + insetBounds.d / 2 - boxCenter.z,
  ];

  const size: [number, number, number] = [insetBounds.w, insetBounds.h, insetBounds.d];

  // Create thick line wireframe using LineSegments2 (for disconnected segments)
  const { lineGeometry, lineMaterial } = useMemo(() => {
    const [w, h, d] = size;
    const hw = w / 2, hh = h / 2, hd = d / 2;

    // Define box vertices
    const v = [
      [-hw, -hh, -hd], [hw, -hh, -hd], [hw, hh, -hd], [-hw, hh, -hd],  // back face
      [-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd],      // front face
    ];

    // Define all 12 edges of the box as pairs of points
    const positions: number[] = [];
    const edges = [
      // Back face
      [0, 1], [1, 2], [2, 3], [3, 0],
      // Front face
      [4, 5], [5, 6], [6, 7], [7, 4],
      // Connecting edges
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];

    for (const [a, b] of edges) {
      positions.push(...v[a], ...v[b]);
    }

    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(positions);

    const material = new LineMaterial({
      color: 0xff00ff,
      linewidth: 2, // in pixels
      resolution: new THREE.Vector2(canvasSize.width, canvasSize.height),
    });

    return { lineGeometry: geometry, lineMaterial: material };
  }, [size[0], size[1], size[2], canvasSize.width, canvasSize.height]);

  if (!visible) {
    return null;
  }

  // Create LineSegments2 instance
  const lineSegments = useMemo(() => {
    return new LineSegments2(lineGeometry, lineMaterial);
  }, [lineGeometry, lineMaterial]);

  return (
    <group position={position}>
      {/* Magenta wireframe outline - always visible */}
      <primitive object={lineSegments} />

      {/* Interactive mesh - click only in void mode, but always show selection/hover */}
      <mesh
        ref={meshRef}
        scale={[0.95, 0.95, 0.95]}
        onClick={isVoidMode ? (e) => {
          e.stopPropagation();
          selectVoid(voidId, e.shiftKey);
        } : undefined}
        onPointerOver={isVoidMode ? (e) => {
          e.stopPropagation();
          setHoveredVoid(voidId);
          document.body.style.cursor = 'pointer';
        } : undefined}
        onPointerOut={isVoidMode ? () => {
          setHoveredVoid(null);
          document.body.style.cursor = 'auto';
        } : undefined}
      >
        <boxGeometry args={[insetBounds.w, insetBounds.h, insetBounds.d]} />
        <meshStandardMaterial
          color={isSelected ? '#4a90d9' : isHovered ? '#6ab04c' : '#95a5a6'}
          transparent
          opacity={isSelected ? 0.6 : isHovered ? 0.4 : 0.2}
        />
      </mesh>
    </group>
  );
};
