import React, { useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { useColors } from '../hooks/useColors';

type Axis = 'x' | 'y' | 'z';

interface AssemblyCenterLinesProps {
  /** Whether to show the lines */
  visible?: boolean;
  /** Opacity of the lines */
  opacity?: number;
}

// Large extent value to simulate "infinite" lines within the viewport
const LINE_EXTENT = 10000;

/**
 * Shows infinite center lines through the origin on all 3 axes (X/Y/Z).
 * Lines are thin, slightly transparent, and render through geometry
 * (not occluded by panels) using depthTest: false.
 */
export const AssemblyCenterLines: React.FC<AssemblyCenterLinesProps> = ({
  visible = true,
  opacity = 0.35,
}) => {
  const colors = useColors();
  const axisColors = colors.axis;

  const lines = useMemo(() => {
    return [
      {
        axis: 'x' as Axis,
        start: [-LINE_EXTENT, 0, 0] as [number, number, number],
        end: [LINE_EXTENT, 0, 0] as [number, number, number],
        color: axisColors.x,
      },
      {
        axis: 'y' as Axis,
        start: [0, -LINE_EXTENT, 0] as [number, number, number],
        end: [0, LINE_EXTENT, 0] as [number, number, number],
        color: axisColors.y,
      },
      {
        axis: 'z' as Axis,
        start: [0, 0, -LINE_EXTENT] as [number, number, number],
        end: [0, 0, LINE_EXTENT] as [number, number, number],
        color: axisColors.z,
      },
    ];
  }, [axisColors]);

  if (!visible) return null;

  return (
    <group>
      {lines.map(({ axis, start, end, color }) => (
        <Line
          key={axis}
          points={[start, end]}
          color={color}
          lineWidth={1}
          transparent
          opacity={opacity}
          depthTest={false}
        />
      ))}
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
  const colors = useColors();
  const axisColors = colors.axis;

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

  const color = axisColors[axis];

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
