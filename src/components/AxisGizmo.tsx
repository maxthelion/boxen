/**
 * AxisGizmo - A reusable 3D drag-along-axis gizmo component.
 *
 * Renders arrow(s) along a specified world-space axis at a given position.
 * Handles raycasting, drag projection onto the constrained axis, and reports
 * displacement via an `onDelta` callback.
 *
 * Used by push-pull, move, and offset/inset tools for consistent drag behavior.
 *
 * Usage example:
 *
 *   <AxisGizmo
 *     position={[0, 0, 0]}
 *     axis={new THREE.Vector3(0, 0, 1)}
 *     scale={worldUnitsPerMm}
 *     size={20}
 *     onDelta={(deltaMm) => setOffset(offset + deltaMm)}
 *     onDragStart={() => beginOperation()}
 *     onDragEnd={() => endOperation()}
 *   />
 */

import React, { useMemo, useRef, useState, useCallback } from 'react';
import { useThree, ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Project a world-space delta vector onto an axis and convert to mm.
 * This is the core math used during drag.
 */
export function projectDeltaToAxis(
  worldDelta: THREE.Vector3,
  axis: THREE.Vector3,
  scale: number,
): number {
  // Dot product gives the component of delta along the axis (in world units)
  const worldDisplacement = worldDelta.dot(axis);
  // Convert from world units to mm
  return worldDisplacement / scale;
}

export interface AxisGizmoProps {
  /** World-space position for the gizmo center */
  position: [number, number, number];

  /**
   * World-space unit axis vector. Drag movement is projected onto this axis.
   * Should be a unit vector (length 1).
   */
  axis: THREE.Vector3;

  /**
   * World units per mm.
   * Used to convert world-space displacement to mm for the onDelta callback.
   */
  scale: number;

  /** Size of the arrow (in world units). Controls all proportional dimensions. Default: 20 */
  size?: number;

  /**
   * Whether to show an arrow in the negative axis direction as well.
   * Default: true
   */
  bidirectional?: boolean;

  /** Base color for the positive-direction arrow. Default: '#4fc3f7' */
  color?: string;

  /** Color when hovered. Default: '#81d4fa' */
  hoverColor?: string;

  /** Color when dragging. Default: '#ff9800' */
  draggingColor?: string;

  /**
   * Called during drag with the displacement in mm from the drag-start position.
   * This is a delta relative to where the drag started, not accumulated across calls.
   */
  onDelta: (deltaMm: number) => void;

  /** Called when the user starts dragging */
  onDragStart?: () => void;

  /** Called when the user releases the drag */
  onDragEnd?: () => void;
}

/**
 * Compute the rotation (as Euler) needed to orient arrows along a given world-space axis.
 * Arrows are constructed pointing in the +Z direction, so we rotate from +Z to the target axis.
 */
function computeRotationForAxis(axis: THREE.Vector3): THREE.Euler {
  const zAxis = new THREE.Vector3(0, 0, 1);
  const quaternion = new THREE.Quaternion();
  quaternion.setFromUnitVectors(zAxis, axis.clone().normalize());
  return new THREE.Euler().setFromQuaternion(quaternion);
}

export const AxisGizmo: React.FC<AxisGizmoProps> = ({
  position,
  axis,
  scale,
  size = 20,
  bidirectional = true,
  color = '#4fc3f7',
  hoverColor = '#81d4fa',
  draggingColor = '#ff9800',
  onDelta,
  onDragStart,
  onDragEnd,
}) => {
  const { camera, gl } = useThree();
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const dragStartWorldPos = useRef<THREE.Vector3 | null>(null);

  // Normalise the axis to guard against non-unit vectors
  const normalizedAxis = useMemo(() => axis.clone().normalize(), [axis]);

  // Compute rotation to align +Z arrows with the target axis
  const rotation = useMemo(() => computeRotationForAxis(normalizedAxis), [normalizedAxis]);

  // Arrow and hit-area geometries
  const geometry = useMemo(() => {
    const arrowLength = size * 0.4;
    const shaftRadius = size * 0.035;
    const headRadius = size * 0.08;
    const headLength = size * 0.12;

    // Shaft cylinder pointing in +Z
    const shaftGeometry = new THREE.CylinderGeometry(shaftRadius, shaftRadius, arrowLength - headLength, 8);
    shaftGeometry.rotateX(Math.PI / 2);
    shaftGeometry.translate(0, 0, (arrowLength - headLength) / 2);

    // Cone head at the tip
    const headGeometry = new THREE.ConeGeometry(headRadius, headLength, 8);
    headGeometry.rotateX(Math.PI / 2);
    headGeometry.translate(0, 0, arrowLength - headLength / 2);

    // Large invisible hit area covering both arrow directions for easy clicking
    const hitDepth = bidirectional ? arrowLength * 2.2 : arrowLength * 1.2;
    const hitAreaGeometry = new THREE.BoxGeometry(size * 0.25, size * 0.25, hitDepth);

    return { shaftGeometry, headGeometry, hitAreaGeometry, arrowLength };
  }, [size, bidirectional]);

  /**
   * Project the current pointer onto a plane through the gizmo position,
   * perpendicular to the camera view direction. Returns the world-space intersection.
   */
  const getWorldPointerPos = useCallback(
    (event: ThreeEvent<PointerEvent>): THREE.Vector3 | null => {
      const pointer = event.pointer;
      if (!pointer) return null;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(pointer, camera);

      // Plane perpendicular to camera direction, through gizmo position
      const planeNormal = camera.getWorldDirection(new THREE.Vector3());
      const plane = new THREE.Plane();
      plane.setFromNormalAndCoplanarPoint(planeNormal, new THREE.Vector3(...position));

      const intersection = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(plane, intersection)) {
        return intersection;
      }
      return null;
    },
    [camera, position],
  );

  const handlePointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      setIsDragging(true);
      onDragStart?.();

      const worldPos = getWorldPointerPos(event);
      dragStartWorldPos.current = worldPos;

      (gl.domElement as HTMLElement).setPointerCapture(event.pointerId);
    },
    [getWorldPointerPos, gl.domElement, onDragStart],
  );

  const handlePointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (!isDragging || !dragStartWorldPos.current) return;
      event.stopPropagation();

      const worldPos = getWorldPointerPos(event);
      if (!worldPos) return;

      const delta = worldPos.clone().sub(dragStartWorldPos.current);
      const deltaMm = projectDeltaToAxis(delta, normalizedAxis, scale);
      onDelta(deltaMm);
    },
    [isDragging, getWorldPointerPos, normalizedAxis, scale, onDelta],
  );

  const endDrag = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (!isDragging) return;
      setIsDragging(false);
      dragStartWorldPos.current = null;
      onDragEnd?.();
      (gl.domElement as HTMLElement).releasePointerCapture(event.pointerId);
    },
    [isDragging, gl.domElement, onDragEnd],
  );

  const handlePointerUp = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      endDrag(event);
    },
    [endDrag],
  );

  const handlePointerEnter = useCallback(() => {
    setIsHovered(true);
    document.body.style.cursor = 'move';
  }, []);

  const handlePointerLeave = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      setIsHovered(false);
      document.body.style.cursor = 'auto';
      // End drag if the pointer leaves while dragging (e.g. fast movement)
      if (isDragging) {
        endDrag(event);
      }
    },
    [isDragging, endDrag],
  );

  const arrowColor = isDragging ? draggingColor : isHovered ? hoverColor : color;
  const emissiveIntensity = isHovered ? 0.5 : 0.3;

  const meshHandlers = {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerEnter: handlePointerEnter,
    onPointerLeave: handlePointerLeave,
  };

  return (
    <group position={position} rotation={rotation}>
      {/* Transparent hit area for easier interaction */}
      <mesh geometry={geometry.hitAreaGeometry} {...meshHandlers}>
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Positive-direction arrow */}
      <mesh geometry={geometry.shaftGeometry} {...meshHandlers}>
        <meshStandardMaterial
          color={arrowColor}
          emissive={arrowColor}
          emissiveIntensity={emissiveIntensity}
          transparent
          opacity={0.95}
        />
      </mesh>
      <mesh geometry={geometry.headGeometry} {...meshHandlers}>
        <meshStandardMaterial
          color={arrowColor}
          emissive={arrowColor}
          emissiveIntensity={emissiveIntensity}
          transparent
          opacity={0.95}
        />
      </mesh>

      {/* Negative-direction arrow (shown fainter, only when bidirectional) */}
      {bidirectional && (
        <group rotation={[0, Math.PI, 0]}>
          <mesh geometry={geometry.shaftGeometry} {...meshHandlers}>
            <meshStandardMaterial
              color={isHovered ? '#888' : '#666'}
              transparent
              opacity={isHovered ? 0.6 : 0.4}
            />
          </mesh>
          <mesh geometry={geometry.headGeometry} {...meshHandlers}>
            <meshStandardMaterial
              color={isHovered ? '#888' : '#666'}
              transparent
              opacity={isHovered ? 0.6 : 0.4}
            />
          </mesh>
        </group>
      )}

      {/* Center disc */}
      <mesh rotation={[Math.PI / 2, 0, 0]} {...meshHandlers}>
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
