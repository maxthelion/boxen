import React from 'react';
import {
  FloatingPalette,
  PaletteNumberInput,
  PaletteButton,
} from './FloatingPalette';

interface InsetPaletteProps {
  visible: boolean;
  position: { x: number; y: number };
  selectedEdgeCount: number;
  offset: number;
  materialThickness: number;
  onOffsetChange: (offset: number) => void;
  onApply: () => void;
  onClose: () => void;
  onPositionChange?: (position: { x: number; y: number }) => void;
  containerRef?: React.RefObject<HTMLElement>;
}

export const InsetPalette: React.FC<InsetPaletteProps> = ({
  visible,
  position,
  selectedEdgeCount,
  offset,
  materialThickness,
  onOffsetChange,
  onApply,
  onClose,
  onPositionChange,
  containerRef,
}) => {
  if (!visible || selectedEdgeCount === 0) {
    return null;
  }

  const edgeLabel = selectedEdgeCount === 1 ? '1 edge' : `${selectedEdgeCount} edges`;
  const title = `Inset/Outset: ${edgeLabel}`;

  return (
    <FloatingPalette
      visible={visible}
      position={position}
      title={title}
      onClose={onClose}
      onApply={onApply}
      onPositionChange={onPositionChange}
      minWidth={200}
      containerRef={containerRef}
    >
      <PaletteNumberInput
        label="Extension"
        value={offset}
        step={1}
        min={-materialThickness}
        unit="mm"
        onChange={onOffsetChange}
      />
      <div className="palette-hint">
        {offset > 0
          ? 'Extends edge outward'
          : offset < 0
            ? 'Retracts edge inward'
            : 'No change'}
      </div>
      <PaletteButton
        variant="primary"
        onClick={onApply}
        disabled={offset === 0}
      >
        Apply
      </PaletteButton>
    </FloatingPalette>
  );
};
