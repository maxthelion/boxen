import React from 'react';
import {
  FloatingPalette,
  PaletteNumberInput,
  PaletteToggleGroup,
  PaletteButton,
  PaletteButtonRow,
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
  isSubAssembly?: boolean;
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
  isSubAssembly = false,
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

  const title = isSubAssembly
    ? `Push/Pull: Sub-Assembly ${faceNames[selectedFaceId]}`
    : `Push/Pull: ${faceNames[selectedFaceId]}`;
  const canInsetFace = offset < 0;

  // For sub-assemblies, always use extend mode (scale doesn't make sense)
  const effectiveMode = isSubAssembly ? 'extend' : mode;

  return (
    <FloatingPalette
      visible={visible}
      position={position}
      title={title}
      onClose={onClose}
      onApply={onApply}
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
      {!isSubAssembly && (
        <PaletteToggleGroup
          label="Resize Mode"
          options={[
            { value: 'scale', label: 'Scale' },
            { value: 'extend', label: 'Extend' },
          ]}
          value={effectiveMode}
          onChange={(v) => onModeChange(v as PushPullMode)}
        />
      )}
      <div className="palette-hint">
        {isSubAssembly
          ? 'Extends face, opposite face stays anchored'
          : effectiveMode === 'scale'
            ? 'Scales box and all children'
            : 'Extends box, adjacent void grows'}
      </div>
      <PaletteButtonRow>
        <PaletteButton onClick={onClose}>
          Cancel
        </PaletteButton>
        <PaletteButton
          variant="primary"
          onClick={onApply}
          disabled={offset === 0}
        >
          Apply
        </PaletteButton>
      </PaletteButtonRow>
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
