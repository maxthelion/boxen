import React from 'react';
import {
  FloatingPalette,
  PaletteNumberInput,
  PaletteToggleGroup,
  PaletteButton,
} from './FloatingPalette';
import { FaceId } from '../types';

const faceNames: Record<FaceId, string> = {
  front: 'Front',
  back: 'Back',
  left: 'Left',
  right: 'Right',
  top: 'Top',
  bottom: 'Bottom',
};

export type PushPullMode = 'scale' | 'extend';

interface PushPullPaletteProps {
  visible: boolean;
  position: { x: number; y: number };
  selectedFaceId: FaceId | null;
  offset: number;
  mode: PushPullMode;
  onOffsetChange: (offset: number) => void;
  onModeChange: (mode: PushPullMode) => void;
  onApply: () => void;
  onInsetFace: () => void;
  onClose: () => void;
  onPositionChange?: (position: { x: number; y: number }) => void;
  containerRef?: React.RefObject<HTMLElement>;
}

export const PushPullPalette: React.FC<PushPullPaletteProps> = ({
  visible,
  position,
  selectedFaceId,
  offset,
  mode,
  onOffsetChange,
  onModeChange,
  onApply,
  onInsetFace,
  onClose,
  onPositionChange,
  containerRef,
}) => {
  if (!visible || !selectedFaceId) {
    return null;
  }

  const title = `Push/Pull: ${faceNames[selectedFaceId]}`;
  const canInsetFace = offset < 0;

  return (
    <FloatingPalette
      visible={visible}
      position={position}
      title={title}
      onClose={onClose}
      onPositionChange={onPositionChange}
      minWidth={220}
      containerRef={containerRef}
    >
      <PaletteNumberInput
        label="Offset"
        value={offset}
        step={1}
        unit="mm"
        onChange={onOffsetChange}
      />
      <PaletteToggleGroup
        label="Resize Mode"
        options={[
          { value: 'scale', label: 'Scale' },
          { value: 'extend', label: 'Extend' },
        ]}
        value={mode}
        onChange={(v) => onModeChange(v as PushPullMode)}
      />
      <div className="palette-hint">
        {mode === 'scale'
          ? 'Scales box and all children'
          : 'Extends box, adjacent void grows'}
      </div>
      <PaletteButton
        variant="primary"
        onClick={onApply}
        disabled={offset === 0}
      >
        Apply
      </PaletteButton>
      {canInsetFace && (
        <PaletteButton variant="secondary" onClick={onInsetFace}>
          Inset Face
        </PaletteButton>
      )}
      {canInsetFace && (
        <div className="palette-hint">
          Opens face and creates divider at offset
        </div>
      )}
    </FloatingPalette>
  );
};
