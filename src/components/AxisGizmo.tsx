/**
 * AxisGizmo - A reusable 3D drag-along-axis gizmo component.
 *
 * Renders arrow(s) along a specified world-space axis at a given position.
 * Meshes are passive raycast targets — all drag logic lives in InteractionController.
 * Sets userData.interactionTarget on every mesh so InteractionController can
 * start a drag when the user clicks.
 *
 * Usage example:
 *
 *   <AxisGizmo
 *     position={[0, 0, 0]}
 *     axis={new THREE.Vector3(0, 0, 1)}
 *     size={20}
 *     onDelta={(deltaMm) => setOffset(offset + deltaMm)}
 *     onDragStart={() => beginOperation()}
 *     onDragEnd={() => endOperation()}
 *   />
 */

import React, { useMemo, useState, useCallback, useId } from 'react';
import * as THREE from 'three';
import type { InteractionTarget } from '../interaction/InteractionManager';
import { getColors } from '../hooks/useColors';

const _colors = getColors();

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
   * @deprecated No longer used by AxisGizmo (drag math is in InteractionController).
   * Kept for backward compatibility with callers.
   */
  scale?: number;

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

  /**
   * Color when dragging.
   * @deprecated No longer used (drag state is managed by InteractionController).
   * Kept for backward compatibility with callers.
   */
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
  size = 20,
  bidirectional = true,
  color = _colors.gizmo.default,
  hoverColor = _colors.gizmo.defaultHover,
  onDelta,
  onDragStart,
  onDragEnd,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  // Stable gizmo identity for InteractionManager drag tracking
  const rawId = useId();
  const gizmoId = `gizmo-${rawId}`;

  // Normalise the axis to guard against non-unit vectors
  const normalizedAxis = useMemo(() => axis.clone().normalize(), [axis]);

  // Compute rotation to align +Z arrows with the target axis
  const rotation = useMemo(() => computeRotationForAxis(normalizedAxis), [normalizedAxis]);

  // World-space gizmo position (position prop is already in Three.js world space)
  const worldPos = useMemo(
    () => new THREE.Vector3(position[0], position[1], position[2]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [position[0], position[1], position[2]],
  );

  // InteractionTarget set on every mesh so InteractionController can start a drag.
  // Functions are captured by InteractionManager at drag-start time.
  const interactionTarget: InteractionTarget = useMemo(
    () => ({
      type: 'gizmo',
      gizmoId,
      axis: normalizedAxis,
      worldPos,
      onDelta,
      onDragStart: onDragStart ?? (() => {}),
      onDragEnd: onDragEnd ?? (() => {}),
    }),
    // gizmoId is stable; normalizedAxis/worldPos update on prop changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gizmoId, normalizedAxis, worldPos, onDelta, onDragStart, onDragEnd],
  );

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

    // Cone head at the tip (openEnded removes the flat bottom cap disc artifact)
    const headGeometry = new THREE.ConeGeometry(headRadius, headLength, 8, 1, true);
    headGeometry.rotateX(Math.PI / 2);
    headGeometry.translate(0, 0, arrowLength - headLength / 2);

    // Large invisible hit area covering both arrow directions for easy clicking
    const hitDepth = bidirectional ? arrowLength * 2.2 : arrowLength * 1.2;
    const hitAreaGeometry = new THREE.BoxGeometry(size * 0.25, size * 0.25, hitDepth);

    return { shaftGeometry, headGeometry, hitAreaGeometry, arrowLength };
  }, [size, bidirectional]);

  const handlePointerEnter = useCallback(() => {
    setIsHovered(true);
    document.body.style.cursor = 'move';
  }, []);

  const handlePointerLeave = useCallback(() => {
    setIsHovered(false);
    document.body.style.cursor = 'auto';
  }, []);

  const arrowColor = isHovered ? hoverColor : color;
  const emissiveIntensity = isHovered ? 0.5 : 0.3;

  const meshHandlers = {
    onPointerEnter: handlePointerEnter,
    onPointerLeave: handlePointerLeave,
  };

  return (
    <group position={position} rotation={rotation}>
      {/* Transparent hit area for easier interaction */}
      <mesh geometry={geometry.hitAreaGeometry} {...meshHandlers} userData={{ interactionTarget }}>
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Positive-direction arrow */}
      <mesh geometry={geometry.shaftGeometry} {...meshHandlers} userData={{ interactionTarget }}>
        <meshStandardMaterial
          color={arrowColor}
          emissive={arrowColor}
          emissiveIntensity={emissiveIntensity}
          transparent
          opacity={0.95}
        />
      </mesh>
      <mesh geometry={geometry.headGeometry} {...meshHandlers} userData={{ interactionTarget }}>
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
          <mesh geometry={geometry.shaftGeometry} {...meshHandlers} userData={{ interactionTarget }}>
            <meshStandardMaterial
              color={isHovered ? _colors.gizmo.shaftHover : _colors.gizmo.shaft}
              transparent
              opacity={isHovered ? 0.6 : 0.4}
            />
          </mesh>
          <mesh geometry={geometry.headGeometry} {...meshHandlers} userData={{ interactionTarget }}>
            <meshStandardMaterial
              color={isHovered ? _colors.gizmo.shaftHover : _colors.gizmo.shaft}
              transparent
              opacity={isHovered ? 0.6 : 0.4}
            />
          </mesh>
        </group>
      )}

      {/* Center disc */}
      <mesh rotation={[Math.PI / 2, 0, 0]} {...meshHandlers} userData={{ interactionTarget }}>
        <circleGeometry args={[size * 0.035, 16]} />
        <meshStandardMaterial
          color={_colors.gizmo.label}
          emissive={_colors.gizmo.label}
          emissiveIntensity={0.5}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
};
