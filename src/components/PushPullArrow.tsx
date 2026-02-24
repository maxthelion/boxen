/**
 * PushPullArrow - A thin wrapper around AxisGizmo for the push-pull tool.
 *
 * Derives the world-space axis from faceId and maps onDelta to onOffsetChange.
 * All drag/raycast logic lives in AxisGizmo.
 */

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { FaceId } from '../types';
import { useColors } from '../hooks/useColors';
import { AxisGizmo } from './AxisGizmo';

interface PushPullArrowProps {
  faceId: FaceId;
  position: [number, number, number];
  size: number;
  offset: number;
  scale: number; // World units per mm
  onOffsetChange: (newOffset: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

// Get the perpendicular direction (outward normal) for each face
const getFaceNormal = (faceId: FaceId): THREE.Vector3 => {
  switch (faceId) {
    case 'front':  return new THREE.Vector3(0, 0, 1);
    case 'back':   return new THREE.Vector3(0, 0, -1);
    case 'left':   return new THREE.Vector3(-1, 0, 0);
    case 'right':  return new THREE.Vector3(1, 0, 0);
    case 'top':    return new THREE.Vector3(0, 1, 0);
    case 'bottom': return new THREE.Vector3(0, -1, 0);
  }
};

export const PushPullArrow: React.FC<PushPullArrowProps> = ({
  faceId,
  position,
  size,
  offset,
  scale,
  onOffsetChange,
  onDragStart,
  onDragEnd,
}) => {
  const colors = useColors();
  const normal = useMemo(() => getFaceNormal(faceId), [faceId]);

  const baseColor = offset >= 0 ? colors.operation.positive.base : colors.operation.negative.base;
  const hoverColor = offset >= 0 ? colors.operation.positive.hover : colors.operation.negative.hover;
  const draggingColor = colors.operation.dragging;

  const handleDelta = (deltaMm: number) => {
    // Convert delta from drag start to absolute offset
    const newOffset = Math.round(offset + deltaMm);
    const clampedOffset = Math.max(-100, Math.min(100, newOffset));
    onOffsetChange(clampedOffset);
  };

  return (
    <AxisGizmo
      position={position}
      axis={normal}
      scale={scale}
      size={size}
      bidirectional={true}
      color={baseColor}
      hoverColor={hoverColor}
      draggingColor={draggingColor}
      onDelta={handleDelta}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    />
  );
};
