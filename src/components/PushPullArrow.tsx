/**
 * PushPullArrow - A thin wrapper around AxisGizmo for the push-pull tool.
 *
 * Derives the world-space axis from faceId and maps onDelta to onOffsetChange.
 * All drag/raycast logic lives in AxisGizmo.
 */

import React, { useMemo, useRef } from 'react';
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
  // Captures the offset value at drag start so cumulative deltas from AxisGizmo
  // are computed as initialOffset + deltaMm (not currentOffset + deltaMm, which
  // would compound across re-renders and cause exponential growth).
  const initialOffsetRef = useRef<number>(0);

  const baseColor = offset >= 0 ? colors.operation.positive.base : colors.operation.negative.base;
  const hoverColor = offset >= 0 ? colors.operation.positive.hover : colors.operation.negative.hover;
  const draggingColor = colors.operation.dragging;

  const handleDelta = (deltaMm: number) => {
    // deltaMm is cumulative from drag start (not incremental per frame).
    // Use initialOffsetRef to avoid double-counting across re-renders.
    const newOffset = Math.round(initialOffsetRef.current + deltaMm);
    const clampedOffset = Math.max(-100, Math.min(100, newOffset));
    onOffsetChange(clampedOffset);
  };

  const handleDragStart = () => {
    initialOffsetRef.current = offset;
    onDragStart?.();
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
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
    />
  );
};
