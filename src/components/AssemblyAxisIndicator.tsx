import React, { useMemo } from 'react';
import { Line, Html } from '@react-three/drei';
import * as THREE from 'three';

type Axis = 'x' | 'y' | 'z';

interface AssemblyAxisIndicatorProps {
  /** The assembly axis direction */
  axis: Axis;
  /** Scaled dimensions of the box */
  dimensions: { width: number; height: number; depth: number };
  /** Whether to show the indicator */
  visible?: boolean;
  /** Opacity of the indicator */
  opacity?: number;
}

// Colors for each axis (standard RGB convention)
const AXIS_COLORS: Record<Axis, string> = {
  x: '#e74c3c', // Red
  y: '#2ecc71', // Green
  z: '#3498db', // Blue
};

// Friendly names for axes
const AXIS_LABELS: Record<Axis, string> = {
  x: 'Side',
  y: 'Top',
  z: 'Front',
};

/**
 * Shows a 3D arrow indicating the assembly axis direction.
 * The arrow points in the positive direction of the axis,
 * showing where the "positive" lid would open.
 */
export const AssemblyAxisIndicator: React.FC<AssemblyAxisIndicatorProps> = ({
  axis,
  dimensions,
  visible = true,
  opacity = 0.8,
}) => {
  // Calculate arrow geometry
  const { arrowStart, arrowEnd, conePosition, coneRotation, labelPosition } = useMemo(() => {
    const { width, height, depth } = dimensions;
    const minDim = Math.min(width, height, depth);
    const arrowLength = minDim * 0.4;
    const coneLength = arrowLength * 0.25;

    // Arrow starts at center, points in positive axis direction
    const start: [number, number, number] = [0, 0, 0];
    const end: [number, number, number] = [0, 0, 0];
    const conePos: [number, number, number] = [0, 0, 0];
    const coneRot: [number, number, number] = [0, 0, 0];
    const labelPos: [number, number, number] = [0, 0, 0];

    switch (axis) {
      case 'x':
        end[0] = arrowLength;
        conePos[0] = arrowLength - coneLength / 2;
        coneRot[2] = -Math.PI / 2; // Point along +X
        labelPos[0] = arrowLength + coneLength;
        break;
      case 'y':
        end[1] = arrowLength;
        conePos[1] = arrowLength - coneLength / 2;
        // Cone default is +Y, no rotation needed
        labelPos[1] = arrowLength + coneLength;
        break;
      case 'z':
        end[2] = arrowLength;
        conePos[2] = arrowLength - coneLength / 2;
        coneRot[0] = Math.PI / 2; // Point along +Z
        labelPos[2] = arrowLength + coneLength;
        break;
    }

    return {
      arrowStart: start,
      arrowEnd: end,
      conePosition: conePos,
      coneRotation: coneRot,
      coneLength,
      labelPosition: labelPos,
    };
  }, [axis, dimensions]);

  if (!visible) return null;

  const color = AXIS_COLORS[axis];
  const minDim = Math.min(dimensions.width, dimensions.height, dimensions.depth);
  const coneRadius = minDim * 0.03;
  const coneHeight = minDim * 0.1;
  const lineWidth = 3;

  return (
    <group>
      {/* Arrow line */}
      <Line
        points={[arrowStart, arrowEnd]}
        color={color}
        lineWidth={lineWidth}
        transparent
        opacity={opacity}
      />

      {/* Arrow head (cone) */}
      <mesh position={conePosition} rotation={coneRotation}>
        <coneGeometry args={[coneRadius, coneHeight, 12]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={opacity}
        />
      </mesh>

      {/* Label */}
      <Html
        position={labelPosition}
        center
        style={{
          color: color,
          fontSize: '12px',
          fontWeight: 'bold',
          textShadow: '0 0 3px rgba(0,0,0,0.8)',
          pointerEvents: 'none',
          userSelect: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {AXIS_LABELS[axis]}
      </Html>
    </group>
  );
};

/**
 * Shows translucent highlights on the two lid faces.
 */
interface LidFaceHighlightProps {
  axis: Axis;
  dimensions: { width: number; height: number; depth: number };
  visible?: boolean;
}

export const LidFaceHighlight: React.FC<LidFaceHighlightProps> = ({
  axis,
  dimensions,
  visible = true,
}) => {
  const { positiveFace, negativeFace } = useMemo(() => {
    const { width, height, depth } = dimensions;
    const halfW = width / 2;
    const halfH = height / 2;
    const halfD = depth / 2;

    // Determine face positions and dimensions based on axis
    let positive: { position: [number, number, number]; rotation: [number, number, number]; size: [number, number] };
    let negative: { position: [number, number, number]; rotation: [number, number, number]; size: [number, number] };

    switch (axis) {
      case 'x':
        // Left/Right faces
        positive = {
          position: [halfW + 0.5, 0, 0],
          rotation: [0, Math.PI / 2, 0],
          size: [depth, height],
        };
        negative = {
          position: [-halfW - 0.5, 0, 0],
          rotation: [0, -Math.PI / 2, 0],
          size: [depth, height],
        };
        break;
      case 'y':
        // Top/Bottom faces
        positive = {
          position: [0, halfH + 0.5, 0],
          rotation: [-Math.PI / 2, 0, 0],
          size: [width, depth],
        };
        negative = {
          position: [0, -halfH - 0.5, 0],
          rotation: [Math.PI / 2, 0, 0],
          size: [width, depth],
        };
        break;
      case 'z':
        // Front/Back faces
        positive = {
          position: [0, 0, halfD + 0.5],
          rotation: [0, 0, 0],
          size: [width, height],
        };
        negative = {
          position: [0, 0, -halfD - 0.5],
          rotation: [0, Math.PI, 0],
          size: [width, height],
        };
        break;
    }

    return { positiveFace: positive, negativeFace: negative };
  }, [axis, dimensions]);

  if (!visible) return null;

  const color = AXIS_COLORS[axis];

  return (
    <group>
      {/* Positive lid face highlight */}
      <mesh position={positiveFace.position} rotation={positiveFace.rotation}>
        <planeGeometry args={positiveFace.size} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.1}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Negative lid face highlight */}
      <mesh position={negativeFace.position} rotation={negativeFace.rotation}>
        <planeGeometry args={negativeFace.size} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.1}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
};
