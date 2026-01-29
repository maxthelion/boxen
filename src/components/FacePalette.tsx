import React, { useCallback, useEffect, useRef, useMemo } from 'react';
import {
  FloatingPalette,
  PaletteButton,
  PaletteButtonRow,
  PaletteToggleGroup,
} from './FloatingPalette';
import { useBoxStore } from '../store/useBoxStore';
import { useEngineConfig, useEngineFaces, useEnginePanels } from '../engine';
import { FaceId, getLidSide, LidTabDirection } from '../types';

interface FacePaletteProps {
  /** Whether the palette is visible */
  visible: boolean;
  /** Screen position for the palette */
  position: { x: number; y: number };
  /** Called when position changes (from dragging) */
  onPositionChange: (position: { x: number; y: number }) => void;
  /** Called when the palette should close */
  onClose: () => void;
  /** Optional container ref to constrain palette within */
  containerRef?: React.RefObject<HTMLElement>;
}

const faceLabels: Record<FaceId, string> = {
  front: 'Front',
  back: 'Back',
  left: 'Left',
  right: 'Right',
  top: 'Top',
  bottom: 'Bottom',
};

const tabDirectionOptions = [
  { value: 'tabs-out', label: 'Tabs Out' },
  { value: 'tabs-in', label: 'Tabs In' },
];

export const FacePalette: React.FC<FacePaletteProps> = ({
  visible,
  position,
  onPositionChange,
  onClose,
  containerRef,
}) => {
  // Get config and faces from engine
  const config = useEngineConfig();
  const faces = useEngineFaces();
  const panelCollection = useEnginePanels();

  // Selection state from store
  const selectedPanelIds = useBoxStore((state) => state.selectedPanelIds);

  // Actions from store
  const toggleFace = useBoxStore((state) => state.toggleFace);
  const setLidTabDirection = useBoxStore((state) => state.setLidTabDirection);

  // Track if we've initialized
  const hasInitialized = useRef(false);

  // Get the selected face panel info
  const selectedFaceInfo = useMemo(() => {
    if (!panelCollection || selectedPanelIds.size !== 1) return null;

    const panelId = Array.from(selectedPanelIds)[0];
    const panel = panelCollection.panels.find((p) => p.id === panelId);

    if (!panel || panel.source.type !== 'face' || !panel.source.faceId) return null;

    // Only main assembly faces (not sub-assembly faces)
    if (panel.source.subAssemblyId) return null;

    return {
      panelId,
      faceId: panel.source.faceId,
    };
  }, [panelCollection, selectedPanelIds]);

  // Get face data and lid info
  const faceData = useMemo(() => {
    if (!selectedFaceInfo || !config) return null;

    const face = faces.find((f) => f.id === selectedFaceInfo.faceId);
    if (!face) return null;

    const lidSide = getLidSide(selectedFaceInfo.faceId, config.assembly.assemblyAxis);
    const isLid = lidSide !== null;
    const lidConfig = isLid ? config.assembly.lids[lidSide!] : null;

    return {
      faceId: selectedFaceInfo.faceId,
      solid: face.solid,
      isLid,
      lidSide,
      tabDirection: lidConfig?.tabDirection ?? 'tabs-out',
    };
  }, [selectedFaceInfo, faces, config]);

  // Reset initialization when selection changes
  useEffect(() => {
    hasInitialized.current = false;
  }, [selectedPanelIds]);

  // Initialize when palette becomes visible
  useEffect(() => {
    if (hasInitialized.current) return;
    if (!visible || !faceData) return;
    hasInitialized.current = true;
  }, [visible, faceData]);

  // Handle solid toggle
  const handleSolidToggle = useCallback(() => {
    if (faceData) {
      toggleFace(faceData.faceId);
    }
  }, [faceData, toggleFace]);

  // Handle tab direction change
  const handleTabDirectionChange = useCallback((direction: string) => {
    if (faceData?.isLid && faceData.lidSide) {
      setLidTabDirection(faceData.lidSide, direction as LidTabDirection);
    }
  }, [faceData, setLidTabDirection]);

  // Handle close
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!visible || !config || !faceData) return null;

  return (
    <FloatingPalette
      title={`${faceLabels[faceData.faceId]} Face`}
      position={position}
      onPositionChange={onPositionChange}
      onClose={handleClose}
      containerRef={containerRef}
      minWidth={200}
      closeOnClickOutside={false}
    >
      {/* Solid/Open Toggle */}
      <div className="palette-section">
        <label className="palette-checkbox">
          <input
            type="checkbox"
            checked={faceData.solid}
            onChange={handleSolidToggle}
          />
          <span>Include in cut (solid)</span>
        </label>
        {!faceData.solid && (
          <p className="palette-hint-small">Face is open - no panel will be cut</p>
        )}
      </div>

      {/* Tab Direction - only for solid lid faces */}
      {faceData.solid && faceData.isLid && (
        <div className="palette-section">
          <div className="palette-section-title">Tab Direction</div>
          <PaletteToggleGroup
            label=""
            options={tabDirectionOptions}
            value={faceData.tabDirection}
            onChange={handleTabDirectionChange}
          />
          <p className="palette-hint-small">
            {faceData.tabDirection === 'tabs-out'
              ? 'Lid has tabs that go into wall slots'
              : 'Walls have tabs that go into lid slots'}
          </p>
        </div>
      )}

      {/* Actions */}
      <PaletteButtonRow>
        <PaletteButton variant="secondary" onClick={handleClose}>
          Done
        </PaletteButton>
      </PaletteButtonRow>
    </FloatingPalette>
  );
};
