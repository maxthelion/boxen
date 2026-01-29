import React from 'react';
import { Html } from '@react-three/drei';
import { FaceId, Face } from '../types';

interface PanelToggleOverlayProps {
  /** Face configurations */
  faces: Face[];
  /** Scaled dimensions of the box */
  dimensions: { width: number; height: number; depth: number };
  /** Material thickness (scaled) */
  thickness: number;
  /** Callback when a face is toggled */
  onToggle: (faceId: FaceId) => void;
  /** Whether to show the overlay */
  visible?: boolean;
}

// Face positions relative to box center
const getFacePosition = (
  faceId: FaceId,
  dimensions: { width: number; height: number; depth: number },
  thickness: number
): [number, number, number] => {
  const { width, height, depth } = dimensions;
  const halfW = width / 2;
  const halfH = height / 2;
  const halfD = depth / 2;
  // Position slightly outside the face (by half thickness + offset)
  const offset = thickness / 2 + 5;

  switch (faceId) {
    case 'front':
      return [0, 0, halfD + offset];
    case 'back':
      return [0, 0, -halfD - offset];
    case 'left':
      return [-halfW - offset, 0, 0];
    case 'right':
      return [halfW + offset, 0, 0];
    case 'top':
      return [0, halfH + offset, 0];
    case 'bottom':
      return [0, -halfH - offset, 0];
  }
};

interface ToggleButtonProps {
  faceId: FaceId;
  isSolid: boolean;
  position: [number, number, number];
  onToggle: () => void;
}

const ToggleButton: React.FC<ToggleButtonProps> = ({
  faceId,
  isSolid,
  position,
  onToggle,
}) => {
  // Face labels
  const labels: Record<FaceId, string> = {
    front: 'Front',
    back: 'Back',
    left: 'Left',
    right: 'Right',
    top: 'Top',
    bottom: 'Bottom',
  };

  return (
    <Html
      position={position}
      center
      style={{ pointerEvents: 'auto' }}
      zIndexRange={[100, 0]}
    >
      <button
        className={`panel-toggle-btn ${isSolid ? 'solid' : 'open'}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        title={`${labels[faceId]}: ${isSolid ? 'Solid (click to open)' : 'Open (click to close)'}`}
      >
        <span className="panel-toggle-icon">{isSolid ? '■' : '□'}</span>
        <span className="panel-toggle-label">{labels[faceId]}</span>
      </button>
    </Html>
  );
};

/**
 * Renders floating toggle buttons at the center of each face.
 * Clicking a button toggles the face between solid and open.
 */
export const PanelToggleOverlay: React.FC<PanelToggleOverlayProps> = ({
  faces,
  dimensions,
  thickness,
  onToggle,
  visible = true,
}) => {
  if (!visible) return null;

  const faceOrder: FaceId[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];

  return (
    <group>
      {faceOrder.map((faceId) => {
        const face = faces.find((f) => f.id === faceId);
        if (!face) return null;

        const position = getFacePosition(faceId, dimensions, thickness);

        return (
          <ToggleButton
            key={faceId}
            faceId={faceId}
            isSolid={face.solid}
            position={position}
            onToggle={() => onToggle(faceId)}
          />
        );
      })}
    </group>
  );
};
