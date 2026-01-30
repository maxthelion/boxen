import React from 'react';
import {
  FloatingPalette,
  PaletteNumberInput,
  PaletteButton,
} from './FloatingPalette';
import { EdgePosition, EdgeStatus } from '../types';

// Edge info for a single edge
export interface EdgeInfo {
  position: EdgePosition;
  status: EdgeStatus;
  isSelected: boolean;
}

// Panel group with its edges
export interface PanelEdgeGroup {
  panelId: string;
  panelName: string;  // e.g., "Front", "Back", "Divider-1"
  edges: EdgeInfo[];
}

interface InsetPaletteProps {
  visible: boolean;
  position: { x: number; y: number };
  panelEdgeGroups: PanelEdgeGroup[];
  offset: number;
  materialThickness: number;
  onEdgeToggle: (panelId: string, edge: EdgePosition) => void;
  onOffsetChange: (offset: number) => void;
  onApply: () => void;
  onClose: () => void;
  onPositionChange?: (position: { x: number; y: number }) => void;
  containerRef?: React.RefObject<HTMLElement>;
}

// Colors for edge toggle buttons matching the 3D edge colors
const EDGE_BUTTON_COLORS: Record<EdgeStatus, { bg: string; selectedBg: string; text: string }> = {
  locked: { bg: '#3a3d40', selectedBg: '#6c757d', text: '#9ca3af' },
  'outward-only': { bg: '#7c4610', selectedBg: '#fd7e14', text: '#fbbf24' },
  unlocked: { bg: '#166534', selectedBg: '#28a745', text: '#86efac' },
};

// Edge toggle button component
const EdgeToggleButton: React.FC<{
  edge: EdgeInfo;
  panelId: string;
  onToggle: (panelId: string, edge: EdgePosition) => void;
}> = ({ edge, panelId, onToggle }) => {
  const isLocked = edge.status === 'locked';
  const colors = EDGE_BUTTON_COLORS[edge.status];

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isLocked) {
      onToggle(panelId, edge.position);
    }
  };

  const buttonStyle: React.CSSProperties = {
    padding: '4px 8px',
    fontSize: '11px',
    border: 'none',
    borderRadius: '3px',
    cursor: isLocked ? 'not-allowed' : 'pointer',
    backgroundColor: edge.isSelected ? colors.selectedBg : colors.bg,
    color: edge.isSelected ? '#fff' : colors.text,
    opacity: isLocked ? 0.5 : 1,
    minWidth: '45px',
    transition: 'background-color 0.15s, opacity 0.15s',
  };

  // Edge labels - short form
  const edgeLabels: Record<EdgePosition, string> = {
    top: 'T',
    bottom: 'B',
    left: 'L',
    right: 'R',
  };

  return (
    <button
      style={buttonStyle}
      onClick={handleClick}
      title={`${edge.position} (${edge.status})${isLocked ? ' - locked' : ''}`}
      disabled={isLocked}
    >
      {edgeLabels[edge.position]}
    </button>
  );
};

// Panel group component showing panel name and its edge toggles
const PanelGroup: React.FC<{
  group: PanelEdgeGroup;
  onEdgeToggle: (panelId: string, edge: EdgePosition) => void;
}> = ({ group, onEdgeToggle }) => {
  const selectedCount = group.edges.filter(e => e.isSelected).length;
  const editableCount = group.edges.filter(e => e.status !== 'locked').length;

  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{
        fontSize: '12px',
        color: '#e0e0e0',
        marginBottom: '4px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span>{group.panelName}</span>
        <span style={{ fontSize: '10px', color: '#888' }}>
          {selectedCount}/{editableCount}
        </span>
      </div>
      <div style={{ display: 'flex', gap: '4px' }}>
        {group.edges.map((edge) => (
          <EdgeToggleButton
            key={edge.position}
            edge={edge}
            panelId={group.panelId}
            onToggle={onEdgeToggle}
          />
        ))}
      </div>
    </div>
  );
};

export const InsetPalette: React.FC<InsetPaletteProps> = ({
  visible,
  position,
  panelEdgeGroups,
  offset,
  materialThickness,
  onEdgeToggle,
  onOffsetChange,
  onApply,
  onClose,
  onPositionChange,
  containerRef,
}) => {
  // Count total selected edges
  const selectedEdgeCount = panelEdgeGroups.reduce(
    (sum, group) => sum + group.edges.filter(e => e.isSelected).length,
    0
  );

  if (!visible || panelEdgeGroups.length === 0) {
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
      minWidth={220}
      containerRef={containerRef}
    >
      {/* Panel groups with edge toggles */}
      <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '12px' }}>
        {panelEdgeGroups.map((group) => (
          <PanelGroup
            key={group.panelId}
            group={group}
            onEdgeToggle={onEdgeToggle}
          />
        ))}
      </div>

      {/* Extension input */}
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
        disabled={offset === 0 || selectedEdgeCount === 0}
      >
        Apply
      </PaletteButton>
    </FloatingPalette>
  );
};
