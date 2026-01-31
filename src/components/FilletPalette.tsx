/**
 * FilletPalette - Floating palette for the corner fillet tool
 *
 * Shows selected panels with their corner indicators and radius control.
 */

import React from 'react';
import {
  FloatingPalette,
  PaletteNumberInput,
  PaletteButton,
  PaletteButtonRow,
} from './FloatingPalette';
import { CornerKey } from '../engine/types';
import { getColors } from '../config/colors';

// Corner info for display
export interface PanelCornerInfo {
  corner: CornerKey;
  isEligible: boolean;
  maxRadius: number;
  isSelected: boolean;
}

// Group of corners for a panel
export interface PanelCornerGroup {
  panelId: string;
  panelName: string;
  corners: PanelCornerInfo[];
}

interface FilletPaletteProps {
  visible: boolean;
  position: { x: number; y: number };
  panelCornerGroups: PanelCornerGroup[];
  radius: number;
  maxRadius: number;  // Minimum of all selected corners' max radii
  onCornerToggle: (panelId: string, corner: CornerKey) => void;
  onRadiusChange: (radius: number) => void;
  onApply: () => void;
  onClose: () => void;
  onPositionChange?: (position: { x: number; y: number }) => void;
  containerRef?: React.RefObject<HTMLElement>;
  closeOnClickOutside?: boolean;
}

// Corner display tooltips
const CORNER_TOOLTIPS: Record<CornerKey, string> = {
  'left:top': 'Top-Left',
  'right:top': 'Top-Right',
  'bottom:left': 'Bottom-Left',
  'bottom:right': 'Bottom-Right',
};

export const FilletPalette: React.FC<FilletPaletteProps> = ({
  visible,
  position,
  panelCornerGroups,
  radius,
  maxRadius,
  onCornerToggle,
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

  if (!visible || selectedCornerCount === 0) {
    return null;
  }

  const cornerLabel = selectedCornerCount === 1 ? '1 corner' : `${selectedCornerCount} corners`;
  const title = `Fillet: ${cornerLabel}`;

  // Get colors from config
  const colors = getColors();

  // Get color for a corner based on eligibility and selection
  const getCornerColor = (isEligible: boolean, isSelected: boolean): string => {
    if (isSelected) {
      return isEligible ? colors.corner.selected.base : colors.interactive.disabled.base;
    }
    return isEligible ? colors.corner.eligible.base : colors.corner.ineligible.base;
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
      {/* Panel corner groups */}
      <div className="palette-corner-groups">
        {panelCornerGroups.map(group => (
          <div key={group.panelId} className="palette-corner-group">
            <div className="palette-corner-group-name">{group.panelName}</div>
            <div className="palette-corner-grid">
              {/* Top row: TL, TR */}
              <div className="palette-corner-row">
                {(['left:top', 'right:top'] as CornerKey[]).map(corner => {
                  const info = group.corners.find(c => c.corner === corner);
                  if (!info) return <div key={corner} className="palette-corner-placeholder" />;

                  const isDisabled = !info.isEligible;
                  const color = getCornerColor(info.isEligible, info.isSelected);

                  return (
                    <button
                      key={corner}
                      className={`palette-corner-btn ${info.isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                      onClick={() => !isDisabled && onCornerToggle(group.panelId, corner)}
                      disabled={isDisabled}
                      style={{
                        borderColor: color,
                        backgroundColor: info.isSelected ? color : 'transparent',
                        color: info.isSelected ? '#fff' : color,
                        opacity: isDisabled ? 0.4 : 1,
                      }}
                      title={`${CORNER_TOOLTIPS[corner]}${info.isEligible ? ` (max: ${info.maxRadius.toFixed(1)}mm)` : ' (ineligible)'}`}
                    >
                      {info.isSelected ? '●' : info.isEligible ? '○' : '·'}
                    </button>
                  );
                })}
              </div>
              {/* Bottom row: BL, BR */}
              <div className="palette-corner-row">
                {(['bottom:left', 'bottom:right'] as CornerKey[]).map(corner => {
                  const info = group.corners.find(c => c.corner === corner);
                  if (!info) return <div key={corner} className="palette-corner-placeholder" />;

                  const isDisabled = !info.isEligible;
                  const color = getCornerColor(info.isEligible, info.isSelected);

                  return (
                    <button
                      key={corner}
                      className={`palette-corner-btn ${info.isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                      onClick={() => !isDisabled && onCornerToggle(group.panelId, corner)}
                      disabled={isDisabled}
                      style={{
                        borderColor: color,
                        backgroundColor: info.isSelected ? color : 'transparent',
                        color: info.isSelected ? '#fff' : color,
                        opacity: isDisabled ? 0.4 : 1,
                      }}
                      title={`${CORNER_TOOLTIPS[corner]}${info.isEligible ? ` (max: ${info.maxRadius.toFixed(1)}mm)` : ' (ineligible)'}`}
                    >
                      {info.isSelected ? '●' : info.isEligible ? '○' : '·'}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

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
        .palette-corner-groups {
          margin-bottom: 12px;
        }
        .palette-corner-group {
          margin-bottom: 8px;
        }
        .palette-corner-group-name {
          font-size: 11px;
          color: #888;
          margin-bottom: 4px;
        }
        .palette-corner-grid {
          display: flex;
          flex-direction: column;
          gap: 2px;
          width: fit-content;
        }
        .palette-corner-row {
          display: flex;
          gap: 24px;
        }
        .palette-corner-btn {
          width: 24px;
          height: 24px;
          border: 1.5px solid;
          border-radius: 50%;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .palette-corner-btn:hover:not(.disabled) {
          transform: scale(1.1);
        }
        .palette-corner-btn.disabled {
          cursor: not-allowed;
        }
        .palette-corner-placeholder {
          width: 24px;
          height: 24px;
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
