import React from 'react';
import {
  FloatingPalette,
  PaletteNumberInput,
  PaletteButton,
  PaletteButtonRow,
} from './FloatingPalette';
import { EdgePosition, EdgeStatus } from '../types';
import { getColors } from '../config/colors';

// Edge info for a single edge
export interface PanelEdgeInfo {
  position: EdgePosition;
  status: EdgeStatus;
  isSelected: boolean;
}

// Group of edges for a panel
export interface PanelEdgeGroup {
  panelId: string;
  panelName: string;
  edges: PanelEdgeInfo[];
}

interface InsetPaletteProps {
  visible: boolean;
  position: { x: number; y: number };
  panelEdgeGroups: PanelEdgeGroup[];
  offset: number;
  onEdgeToggle: (panelId: string, edge: EdgePosition) => void;
  onOffsetChange: (offset: number) => void;
  onApply: () => void;
  onClose: () => void;
  onPositionChange?: (position: { x: number; y: number }) => void;
  containerRef?: React.RefObject<HTMLElement>;
  closeOnClickOutside?: boolean;
}

export const InsetPalette: React.FC<InsetPaletteProps> = ({
  visible,
  position,
  panelEdgeGroups,
  offset,
  onEdgeToggle,
  onOffsetChange,
  onApply,
  onClose,
  onPositionChange,
  containerRef,
  closeOnClickOutside,
}) => {
  // Count total selected edges
  const selectedEdgeCount = panelEdgeGroups.reduce(
    (count, group) => count + group.edges.filter(e => e.isSelected).length,
    0
  );

  if (!visible || selectedEdgeCount === 0) {
    return null;
  }

  const edgeLabel = selectedEdgeCount === 1 ? '1 edge' : `${selectedEdgeCount} edges`;
  const title = `Inset/Outset: ${edgeLabel}`;

  // Get colors from config
  const colors = getColors();

  // Get status color for an edge
  // Status values: 'locked' | 'outward-only' | 'unlocked'
  const getEdgeColor = (status: EdgeStatus, isSelected: boolean): string => {
    if (isSelected) {
      return status === 'locked' ? colors.interactive.disabled.base : colors.edge.selected.base;
    }
    switch (status) {
      case 'locked': return colors.edge.locked.base;
      case 'unlocked': return colors.edge.unlocked.base;
      case 'outward-only': return colors.edge.outwardOnly.base;
      default: return colors.interactive.disabled.base;
    }
  };

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
      closeOnClickOutside={closeOnClickOutside}
    >
      {/* Panel edge groups */}
      <div className="palette-edge-groups">
        {panelEdgeGroups.map(group => (
          <div key={group.panelId} className="palette-edge-group">
            <div className="palette-edge-group-name">{group.panelName}</div>
            <div className="palette-edge-buttons">
              {group.edges.map(edge => {
                const isDisabled = edge.status === 'locked';
                const color = getEdgeColor(edge.status, edge.isSelected);

                return (
                  <button
                    key={edge.position}
                    className={`palette-edge-btn ${edge.isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                    onClick={() => !isDisabled && onEdgeToggle(group.panelId, edge.position)}
                    disabled={isDisabled}
                    style={{
                      borderColor: color,
                      backgroundColor: edge.isSelected ? color : 'transparent',
                      color: edge.isSelected ? '#fff' : color,
                      opacity: isDisabled ? 0.4 : 1,
                    }}
                    title={`${edge.position} (${edge.status})`}
                  >
                    {edge.position.charAt(0).toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <PaletteNumberInput
        label="Extension"
        value={offset}
        step={1}
        min={0}
        unit="mm"
        onChange={onOffsetChange}
      />

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

      <style>{`
        .palette-edge-groups {
          margin-bottom: 12px;
        }
        .palette-edge-group {
          margin-bottom: 8px;
        }
        .palette-edge-group-name {
          font-size: 11px;
          color: #888;
          margin-bottom: 4px;
        }
        .palette-edge-buttons {
          display: flex;
          gap: 4px;
        }
        .palette-edge-btn {
          width: 28px;
          height: 24px;
          border: 1.5px solid;
          border-radius: 3px;
          font-size: 10px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .palette-edge-btn:hover:not(.disabled) {
          transform: scale(1.05);
        }
        .palette-edge-btn.disabled {
          cursor: not-allowed;
        }
      `}</style>
    </FloatingPalette>
  );
};
