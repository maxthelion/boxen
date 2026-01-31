import React, { useMemo, useRef, useState, useCallback } from 'react';
import { useThree, ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { FaceId } from '../types';
import { useColors } from '../hooks/useColors';

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
    case 'front': return new THREE.Vector3(0, 0, 1);
    case 'back': return new THREE.Vector3(0, 0, -1);
    case 'left': return new THREE.Vector3(-1, 0, 0);
    case 'right': return new THREE.Vector3(1, 0, 0);
    case 'top': return new THREE.Vector3(0, 1, 0);
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
  const { camera, gl } = useThree();
  const colors = useColors();
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const dragStartRef = useRef<{ offset: number; worldPos: THREE.Vector3 } | null>(null);
  const normal = useMemo(() => getFaceNormal(faceId), [faceId]);

  const arrowGeometry = useMemo(() => {
    const arrowLength = size * 0.4;
    const shaftRadius = size * 0.035;  // Slightly thicker shaft
    const headRadius = size * 0.08;    // Slightly larger head
    const headLength = size * 0.12;

    // Shaft (cylinder)
    const shaftGeometry = new THREE.CylinderGeometry(
      shaftRadius,
      shaftRadius,
      arrowLength - headLength,
      8
    );
    shaftGeometry.rotateX(Math.PI / 2);
    shaftGeometry.translate(0, 0, (arrowLength - headLength) / 2);

    // Head (cone)
    const headGeometry = new THREE.ConeGeometry(headRadius, headLength, 8);
    headGeometry.rotateX(Math.PI / 2);
    headGeometry.translate(0, 0, arrowLength - headLength / 2);

    // Large invisible hit area box covering both arrows for easy clicking
    // Extends in both directions along the axis
    const hitAreaGeometry = new THREE.BoxGeometry(
      size * 0.25,   // Width (generous click target)
      size * 0.25,   // Height (generous click target)
      arrowLength * 2.2  // Depth covers both positive and negative arrows
    );
    // Center it (covers both directions from center)

    return { shaftGeometry, headGeometry, hitAreaGeometry, arrowLength };
  }, [size]);

  // Calculate rotation to align arrow with face normal
  const rotation = useMemo(() => {
    const euler = new THREE.Euler();

    if (faceId === 'front') {
      euler.set(0, 0, 0);
    } else if (faceId === 'back') {
      euler.set(0, Math.PI, 0);
    } else if (faceId === 'left') {
      euler.set(0, -Math.PI / 2, 0);
    } else if (faceId === 'right') {
      euler.set(0, Math.PI / 2, 0);
    } else if (faceId === 'top') {
      euler.set(-Math.PI / 2, 0, 0);
    } else if (faceId === 'bottom') {
      euler.set(Math.PI / 2, 0, 0);
    }

    return euler;
  }, [faceId]);

  // Project mouse position to the axis defined by the face normal
  const projectMouseToAxis = useCallback((event: ThreeEvent<PointerEvent>) => {
    const pointer = event.pointer;
    if (!pointer) return null;

    // Create a ray from camera through mouse position
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, camera);

    // Create a plane perpendicular to the view direction that passes through the arrow position
    const planeNormal = camera.getWorldDirection(new THREE.Vector3());
    const plane = new THREE.Plane();
    plane.setFromNormalAndCoplanarPoint(planeNormal, new THREE.Vector3(...position));

    // Find where ray intersects the plane
    const intersection = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, intersection)) {
      return intersection;
    }
    return null;
  }, [camera, position]);

  const handlePointerDown = useCallback((event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    setIsDragging(true);
    onDragStart?.();

    const worldPos = projectMouseToAxis(event);
    if (worldPos) {
      dragStartRef.current = { offset, worldPos };
    }

    // Capture pointer
    (gl.domElement as HTMLElement).setPointerCapture(event.pointerId);
  }, [offset, projectMouseToAxis, gl.domElement, onDragStart]);

  const handlePointerMove = useCallback((event: ThreeEvent<PointerEvent>) => {
    if (!isDragging || !dragStartRef.current) return;
    event.stopPropagation();

    const worldPos = projectMouseToAxis(event);
    if (!worldPos) return;

    // Calculate movement along the face normal axis
    const delta = worldPos.clone().sub(dragStartRef.current.worldPos);
    const movement = delta.dot(normal);

    // Convert world units to mm
    const offsetDelta = movement / scale;
    const newOffset = Math.round(dragStartRef.current.offset + offsetDelta);

    // Clamp to reasonable range
    const clampedOffset = Math.max(-100, Math.min(100, newOffset));
    onOffsetChange(clampedOffset);
  }, [isDragging, projectMouseToAxis, normal, scale, onOffsetChange]);

  const handlePointerUp = useCallback((event: ThreeEvent<PointerEvent>) => {
    if (!isDragging) return;
    event.stopPropagation();
    setIsDragging(false);
    dragStartRef.current = null;
    onDragEnd?.();

    // Release pointer
    (gl.domElement as HTMLElement).releasePointerCapture(event.pointerId);
  }, [isDragging, gl.domElement, onDragEnd]);

  // Hover handlers for cursor change
  const handlePointerEnter = useCallback(() => {
    setIsHovered(true);
    document.body.style.cursor = 'move';
  }, []);

  const handlePointerLeave = useCallback((event: ThreeEvent<PointerEvent>) => {
    setIsHovered(false);
    document.body.style.cursor = 'auto';
    // Also handle pointer up if leaving while dragging
    if (isDragging) {
      setIsDragging(false);
      dragStartRef.current = null;
      onDragEnd?.();
      (gl.domElement as HTMLElement).releasePointerCapture(event.pointerId);
    }
  }, [isDragging, gl.domElement, onDragEnd]);

  // Arrow color - positive/negative based on offset direction, orange when dragging
  const baseColor = offset >= 0 ? colors.operation.positive.base : colors.operation.negative.base;
  const hoverColor = offset >= 0 ? colors.operation.positive.hover : colors.operation.negative.hover;
  const arrowColor = isDragging ? colors.operation.dragging : isHovered ? hoverColor : baseColor;

  // Common pointer handlers for all arrow meshes (to prevent click-through)
  const meshPointerHandlers = {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerEnter: handlePointerEnter,
    onPointerLeave: handlePointerLeave,
  };

  return (
    <group position={position} rotation={rotation}>
      {/* Large transparent hit area for easier grabbing - must be transparent not invisible for raycasting */}
      <mesh
        geometry={arrowGeometry.hitAreaGeometry}
        {...meshPointerHandlers}
      >
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Positive direction arrow (outward) */}
      <mesh geometry={arrowGeometry.shaftGeometry} {...meshPointerHandlers}>
        <meshStandardMaterial
          color={arrowColor}
          emissive={arrowColor}
          emissiveIntensity={isHovered ? 0.5 : 0.3}
          transparent
          opacity={0.95}
        />
      </mesh>
      <mesh geometry={arrowGeometry.headGeometry} {...meshPointerHandlers}>
        <meshStandardMaterial
          color={arrowColor}
          emissive={arrowColor}
          emissiveIntensity={isHovered ? 0.5 : 0.3}
          transparent
          opacity={0.95}
        />
      </mesh>

      {/* Negative direction arrow (inward) - shown fainter */}
      <group rotation={[0, Math.PI, 0]}>
        <mesh geometry={arrowGeometry.shaftGeometry} {...meshPointerHandlers}>
          <meshStandardMaterial
            color={isHovered ? '#888' : '#666'}
            transparent
            opacity={isHovered ? 0.6 : 0.4}
          />
        </mesh>
        <mesh geometry={arrowGeometry.headGeometry} {...meshPointerHandlers}>
          <meshStandardMaterial
            color={isHovered ? '#888' : '#666'}
            transparent
            opacity={isHovered ? 0.6 : 0.4}
          />
        </mesh>
      </group>

      {/* Center disc to show the face center */}
      <mesh rotation={[Math.PI / 2, 0, 0]} {...meshPointerHandlers}>
        <circleGeometry args={[size * 0.035, 16]} />
        <meshStandardMaterial
          color="#fff"
          emissive="#fff"
          emissiveIntensity={0.5}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
};
