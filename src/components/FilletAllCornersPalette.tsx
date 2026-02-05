/**
 * FilletAllCornersPalette - Floating palette for the batch fillet tool
 *
 * Allows selecting any corner in panel geometry (outline + holes) and
 * applying a fillet radius to all selected corners at once.
 */

import React from 'react';
import {
  FloatingPalette,
  PaletteNumberInput,
  PaletteButton,
  PaletteButtonRow,
} from './FloatingPalette';
import { AllCornerId } from '../engine/types';
import { getColors } from '../config/colors';

// Corner info for display
export interface AllCornerInfo {
  id: AllCornerId;
  isEligible: boolean;
  maxRadius: number;
  isSelected: boolean;
  position: { x: number; y: number };
  type: 'convex' | 'concave';
  location: 'outline' | 'hole';
}

// Group of corners for a panel
export interface PanelAllCornerGroup {
  panelId: string;
  panelName: string;
  corners: AllCornerInfo[];
}

interface FilletAllCornersPaletteProps {
  visible: boolean;
  position: { x: number; y: number };
  panelCornerGroups: PanelAllCornerGroup[];
  radius: number;
  maxRadius: number;  // Minimum of all selected corners' max radii
  onCornerToggle: (panelId: string, cornerId: AllCornerId) => void;
  onSelectAllEligible: () => void;
  onClearSelection: () => void;
  onRadiusChange: (radius: number) => void;
  onApply: () => void;
  onClose: () => void;
  onPositionChange?: (position: { x: number; y: number }) => void;
  containerRef?: React.RefObject<HTMLElement>;
  closeOnClickOutside?: boolean;
}

export const FilletAllCornersPalette: React.FC<FilletAllCornersPaletteProps> = ({
  visible,
  position,
  panelCornerGroups,
  radius,
  maxRadius,
  onCornerToggle,
  onSelectAllEligible,
  onClearSelection,
  onRadiusChange,
  onApply,
  onClose,
  onPositionChange,
  containerRef,
  closeOnClickOutside,
}) => {
  // Count total selected corners
  const selectedCornerCount = panelCornerGroups.reduce(
    (count, group) => count + group.corners.filter(c => c.isSelected).length,
    0
  );

  // Count total eligible corners
  const eligibleCornerCount = panelCornerGroups.reduce(
    (count, group) => count + group.corners.filter(c => c.isEligible).length,
    0
  );

  if (!visible) {
    return null;
  }

  const cornerLabel = selectedCornerCount === 1 ? '1 corner' : `${selectedCornerCount} corners`;
  const title = selectedCornerCount > 0 ? `Fillet: ${cornerLabel}` : 'Fillet Corners';

  // Get colors from config
  const colors = getColors();

  // Get color for a corner based on eligibility, selection, and type
  const getCornerColor = (corner: AllCornerInfo): string => {
    if (corner.isSelected) {
      return corner.isEligible ? colors.corner.selected.base : colors.interactive.disabled.base;
    }
    if (!corner.isEligible) {
      return colors.corner.ineligible.base;
    }
    // Eligible but not selected - use different colors for convex vs concave
    return corner.type === 'convex'
      ? colors.corner.eligible.base
      : colors.corner.eligible.hover || colors.corner.eligible.base;
  };

  // Get icon for corner type
  const getCornerIcon = (corner: AllCornerInfo): string => {
    if (corner.isSelected) return '●';
    if (!corner.isEligible) return '·';
    return corner.type === 'convex' ? '○' : '◇';
  };

  return (
    <FloatingPalette
      visible={visible}
      position={position}
      title={title}
      onClose={onClose}
      onApply={selectedCornerCount > 0 ? onApply : undefined}
      onPositionChange={onPositionChange}
      minWidth={260}
      containerRef={containerRef}
      closeOnClickOutside={closeOnClickOutside}
    >
      {/* Quick actions */}
      <div className="palette-quick-actions">
        <button
          className="palette-quick-btn"
          onClick={onSelectAllEligible}
          disabled={eligibleCornerCount === 0}
          title="Select all eligible corners"
        >
          Select All ({eligibleCornerCount})
        </button>
        <button
          className="palette-quick-btn"
          onClick={onClearSelection}
          disabled={selectedCornerCount === 0}
          title="Clear selection"
        >
          Clear
        </button>
      </div>

      {/* Panel corner groups */}
      <div className="palette-corner-groups">
        {panelCornerGroups.map(group => (
          <div key={group.panelId} className="palette-corner-group">
            <div className="palette-corner-group-header">
              <span className="palette-corner-group-name">{group.panelName}</span>
              <span className="palette-corner-group-count">
                {group.corners.filter(c => c.isSelected).length}/{group.corners.filter(c => c.isEligible).length}
              </span>
            </div>

            {/* Corner list - show eligible corners */}
            <div className="palette-corner-list">
              {group.corners
                .filter(c => c.isEligible)
                .map(corner => {
                  const color = getCornerColor(corner);
                  const icon = getCornerIcon(corner);

                  return (
                    <button
                      key={corner.id}
                      className={`palette-corner-item ${corner.isSelected ? 'selected' : ''}`}
                      onClick={() => onCornerToggle(group.panelId, corner.id)}
                      style={{
                        borderColor: color,
                        backgroundColor: corner.isSelected ? color : 'transparent',
                        color: corner.isSelected ? '#fff' : color,
                      }}
                      title={`${corner.type} corner (${corner.location}, max: ${corner.maxRadius.toFixed(1)}mm)`}
                    >
                      <span className="corner-icon">{icon}</span>
                      <span className="corner-label">{corner.type === 'convex' ? 'ext' : 'int'}</span>
                    </button>
                  );
                })}
            </div>

            {/* Show count of ineligible if any */}
            {group.corners.filter(c => !c.isEligible).length > 0 && (
              <div className="palette-corner-ineligible-note">
                +{group.corners.filter(c => !c.isEligible).length} ineligible
              </div>
            )}
          </div>
        ))}
      </div>

      {selectedCornerCount > 0 && (
        <>
          <PaletteNumberInput
            label="Radius"
            value={radius}
            step={1}
            min={1}
            max={maxRadius > 0 ? maxRadius : undefined}
            unit="mm"
            onChange={onRadiusChange}
          />

          {maxRadius > 0 && (
            <div className="palette-max-radius-hint">
              Max: {maxRadius.toFixed(1)}mm
            </div>
          )}
        </>
      )}

      <PaletteButtonRow>
        <PaletteButton onClick={onClose}>
          Cancel
        </PaletteButton>
        <PaletteButton
          variant="primary"
          onClick={onApply}
          disabled={radius <= 0 || selectedCornerCount === 0}
        >
          Apply
        </PaletteButton>
      </PaletteButtonRow>

      <style>{`
        .palette-quick-actions {
          display: flex;
          gap: 8px;
          margin-bottom: 12px;
        }
        .palette-quick-btn {
          flex: 1;
          padding: 4px 8px;
          font-size: 11px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 4px;
          color: #ccc;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .palette-quick-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.2);
        }
        .palette-quick-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .palette-corner-groups {
          margin-bottom: 12px;
          max-height: 200px;
          overflow-y: auto;
        }
        .palette-corner-group {
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .palette-corner-group:last-child {
          border-bottom: none;
          margin-bottom: 0;
        }
        .palette-corner-group-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
        }
        .palette-corner-group-name {
          font-size: 11px;
          color: #888;
        }
        .palette-corner-group-count {
          font-size: 10px;
          color: #666;
        }
        .palette-corner-list {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }
        .palette-corner-item {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 3px 8px;
          border: 1.5px solid;
          border-radius: 12px;
          font-size: 10px;
          cursor: pointer;
          transition: all 0.15s ease;
          background: transparent;
        }
        .palette-corner-item:hover {
          transform: scale(1.05);
        }
        .corner-icon {
          font-size: 10px;
        }
        .corner-label {
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .palette-corner-ineligible-note {
          font-size: 9px;
          color: #555;
          margin-top: 4px;
          font-style: italic;
        }
        .palette-max-radius-hint {
          font-size: 10px;
          color: #666;
          margin-top: -8px;
          margin-bottom: 8px;
          text-align: right;
        }
      `}</style>
    </FloatingPalette>
  );
};
