import React from 'react';
import { useBoxStore } from '../store/useBoxStore';
import { Panel } from './UI/Panel';
import { FaceId } from '../types';

const faceLabels: Record<FaceId, string> = {
  front: 'Front',
  back: 'Back',
  left: 'Left',
  right: 'Right',
  top: 'Top',
  bottom: 'Bottom',
};

export const FaceSelector: React.FC = () => {
  const { faces, toggleFace } = useBoxStore();

  return (
    <Panel title="Faces">
      <div className="face-grid">
        {/* Top row: Top */}
        <div className="face-row">
          <div className="face-spacer" />
          <FaceButton
            faceId="top"
            solid={faces.find((f) => f.id === 'top')?.solid ?? true}
            onToggle={toggleFace}
          />
          <div className="face-spacer" />
        </div>
        {/* Middle row: Left, Front, Right */}
        <div className="face-row">
          <FaceButton
            faceId="left"
            solid={faces.find((f) => f.id === 'left')?.solid ?? true}
            onToggle={toggleFace}
          />
          <FaceButton
            faceId="front"
            solid={faces.find((f) => f.id === 'front')?.solid ?? true}
            onToggle={toggleFace}
          />
          <FaceButton
            faceId="right"
            solid={faces.find((f) => f.id === 'right')?.solid ?? true}
            onToggle={toggleFace}
          />
        </div>
        {/* Bottom row: Bottom */}
        <div className="face-row">
          <div className="face-spacer" />
          <FaceButton
            faceId="bottom"
            solid={faces.find((f) => f.id === 'bottom')?.solid ?? true}
            onToggle={toggleFace}
          />
          <div className="face-spacer" />
        </div>
        {/* Back */}
        <div className="face-row">
          <div className="face-spacer" />
          <FaceButton
            faceId="back"
            solid={faces.find((f) => f.id === 'back')?.solid ?? true}
            onToggle={toggleFace}
          />
          <div className="face-spacer" />
        </div>
      </div>
    </Panel>
  );
};

interface FaceButtonProps {
  faceId: FaceId;
  solid: boolean;
  onToggle: (faceId: FaceId) => void;
}

const FaceButton: React.FC<FaceButtonProps> = ({ faceId, solid, onToggle }) => {
  return (
    <button
      className={`face-button ${solid ? 'solid' : 'open'}`}
      onClick={() => onToggle(faceId)}
      title={`${faceLabels[faceId]}: ${solid ? 'Solid' : 'Open'} (click to toggle)`}
    >
      {faceLabels[faceId]}
      <span className="face-status">{solid ? 'Solid' : 'Open'}</span>
    </button>
  );
};
