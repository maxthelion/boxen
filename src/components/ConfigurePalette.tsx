import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  FloatingPalette,
  PaletteButton,
  PaletteButtonRow,
  PaletteToggleGroup,
} from './FloatingPalette';
import { NumberInput } from './UI/NumberInput';
import { useBoxStore, getAllSubAssemblies } from '../store/useBoxStore';
import { useEngineConfig, useEngineVoidTree, useEngineFaces, useEnginePanels, getEngine, notifyEngineStateChanged } from '../engine';
import { Axis } from '../engine/types';
import { defaultFeetConfig, FeetConfig, FaceId, getLidSide, LidTabDirection } from '../types';

interface ConfigurePaletteProps {
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

// Friendly axis names for assembly orientation
const axisOptions = [
  { value: 'y', label: 'Top Down' },
  { value: 'x', label: 'Side to Side' },
  { value: 'z', label: 'Front to Back' },
];

const getAxisDescription = (axis: Axis): string => {
  switch (axis) {
    case 'y': return 'Lid opens from top';
    case 'x': return 'Opens from the side';
    case 'z': return 'Opens from front';
  }
};

// Face labels
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

type SelectionMode = 'none' | 'assembly' | 'face';

// Operation params type for assembly mode
interface AssemblyParams {
  thickness?: number;
  fingerWidth?: number;
  fingerGap?: number;
  assemblyAxis?: Axis;
  feet?: FeetConfig;
}

// Operation params type for face mode
interface FaceParams {
  faceId?: FaceId;
  faceSolid?: boolean;
  faceTabDirection?: LidTabDirection;
}

export const ConfigurePalette: React.FC<ConfigurePaletteProps> = ({
  visible,
  position,
  onPositionChange,
  onClose,
  containerRef,
}) => {
  // Get config and state from engine
  const config = useEngineConfig();
  const rootVoid = useEngineVoidTree();
  const faces = useEngineFaces();
  const panelCollection = useEnginePanels();

  // Selection state from store
  const selectedAssemblyId = useBoxStore((state) => state.selectedAssemblyId);
  const selectedPanelIds = useBoxStore((state) => state.selectedPanelIds);
  const selectAssembly = useBoxStore((state) => state.selectAssembly);

  // Operation state from store
  const operationState = useBoxStore((state) => state.operationState);
  const startOperation = useBoxStore((state) => state.startOperation);
  const updateOperationParams = useBoxStore((state) => state.updateOperationParams);
  const applyOperation = useBoxStore((state) => state.applyOperation);
  const cancelOperation = useBoxStore((state) => state.cancelOperation);

  // Track if we've auto-started the operation
  const hasAutoStarted = useRef(false);

  // Determine what's selected - face panel or assembly
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

  // Determine selection mode
  const selectionMode: SelectionMode = useMemo(() => {
    if (selectedAssemblyId) return 'assembly';
    if (selectedFaceInfo) return 'face';
    return 'none';
  }, [selectedAssemblyId, selectedFaceInfo]);

  // Get initial face data for face mode (from committed state)
  const initialFaceData = useMemo(() => {
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

  // Get available assemblies for selection prompt
  const availableAssemblies = useMemo(() => {
    const assemblies: { id: string; name: string; dimensions?: string }[] = [
      { id: 'main', name: 'Main Assembly', dimensions: config ? `${config.width} x ${config.height} x ${config.depth} mm` : undefined }
    ];

    // Add sub-assemblies if any
    if (rootVoid) {
      const subAssemblies = getAllSubAssemblies(rootVoid);
      for (const { subAssembly, bounds } of subAssemblies) {
        assemblies.push({
          id: subAssembly.id,
          name: `Sub-Assembly`,
          dimensions: `${bounds.w.toFixed(0)} x ${bounds.h.toFixed(0)} x ${bounds.d.toFixed(0)} mm`,
        });
      }
    }

    return assemblies;
  }, [config, rootVoid]);

  // Local state for assembly parameters (before operation starts or as fallback)
  const [localThickness, setLocalThickness] = useState(config?.materialThickness ?? 3);
  const [localFingerWidth, setLocalFingerWidth] = useState(config?.fingerWidth ?? 10);
  const [localFingerGap, setLocalFingerGap] = useState(config?.fingerGap ?? 1.5);
  const [localAxis, setLocalAxis] = useState<Axis>(config?.assembly?.assemblyAxis ?? 'y');
  const [localFeet, setLocalFeet] = useState<FeetConfig>(config?.assembly?.feet ?? defaultFeetConfig);

  // Initialize local state from config when it changes
  useEffect(() => {
    if (config) {
      setLocalThickness(config.materialThickness);
      setLocalFingerWidth(config.fingerWidth);
      setLocalFingerGap(config.fingerGap);
      setLocalAxis(config.assembly?.assemblyAxis ?? 'y');
      setLocalFeet(config.assembly?.feet ?? defaultFeetConfig);
    }
  }, [config]);

  // Operation state
  const isOpActive = operationState.activeOperation === 'configure';
  const opParams = operationState.params as AssemblyParams & FaceParams;

  // Current values for assembly mode (from operation if active, otherwise local)
  const currentThickness = isOpActive ? (opParams.thickness ?? localThickness) : localThickness;
  const currentFingerWidth = isOpActive ? (opParams.fingerWidth ?? localFingerWidth) : localFingerWidth;
  const currentFingerGap = isOpActive ? (opParams.fingerGap ?? localFingerGap) : localFingerGap;
  const currentAxis = isOpActive ? (opParams.assemblyAxis ?? localAxis) : localAxis;
  const currentFeet = isOpActive ? (opParams.feet ?? localFeet) : localFeet;

  // Current values for face mode (from operation params if active, otherwise from initial data)
  const currentFaceSolid = isOpActive && opParams.faceSolid !== undefined
    ? opParams.faceSolid
    : initialFaceData?.solid ?? true;
  const currentFaceTabDirection = isOpActive && opParams.faceTabDirection !== undefined
    ? opParams.faceTabDirection
    : initialFaceData?.tabDirection ?? 'tabs-out';

  // Auto-start operation when palette becomes visible with valid selection
  useEffect(() => {
    if (hasAutoStarted.current) return;
    if (!visible) return;
    if (isOpActive) return;
    if (!config) return;
    if (selectionMode === 'none') return;

    hasAutoStarted.current = true;
    startOperation('configure');

    if (selectionMode === 'assembly') {
      // Initialize with assembly params
      updateOperationParams({
        thickness: config.materialThickness,
        fingerWidth: config.fingerWidth,
        fingerGap: config.fingerGap,
        assemblyAxis: config.assembly?.assemblyAxis ?? 'y',
        feet: config.assembly?.feet ?? defaultFeetConfig,
      });
    } else if (selectionMode === 'face' && initialFaceData) {
      // Initialize with face params
      updateOperationParams({
        faceId: initialFaceData.faceId,
        faceSolid: initialFaceData.solid,
        faceTabDirection: initialFaceData.tabDirection,
      });
    }
  }, [visible, isOpActive, config, selectionMode, initialFaceData, startOperation, updateOperationParams]);

  // Reset auto-start flag when visibility changes
  useEffect(() => {
    if (!visible) {
      hasAutoStarted.current = false;
    }
  }, [visible]);

  // Reset auto-start when selection changes
  useEffect(() => {
    const currentState = useBoxStore.getState();
    const isOperationActive = currentState.operationState.activeOperation === 'configure';
    if (!isOperationActive) {
      hasAutoStarted.current = false;
    }
  }, [selectedAssemblyId, selectedPanelIds]);

  // Handle assembly selection from prompt
  const handleSelectAssembly = useCallback((assemblyId: string) => {
    selectAssembly(assemblyId);
  }, [selectAssembly]);

  // Handle assembly parameter changes
  const handleAssemblyParamChange = useCallback((updates: Partial<AssemblyParams>) => {
    // Update local state
    if (updates.thickness !== undefined) setLocalThickness(updates.thickness);
    if (updates.fingerWidth !== undefined) setLocalFingerWidth(updates.fingerWidth);
    if (updates.fingerGap !== undefined) setLocalFingerGap(updates.fingerGap);
    if (updates.assemblyAxis !== undefined) setLocalAxis(updates.assemblyAxis);
    if (updates.feet !== undefined) setLocalFeet(updates.feet);

    // Update operation params if active
    if (isOpActive) {
      updateOperationParams({
        ...opParams,
        ...updates,
      });
    }
  }, [isOpActive, opParams, updateOperationParams]);

  // Handle feet toggle and updates
  const handleFeetToggle = useCallback((enabled: boolean) => {
    const newFeet = { ...currentFeet, enabled };
    handleAssemblyParamChange({ feet: newFeet });
  }, [currentFeet, handleAssemblyParamChange]);

  const handleFeetUpdate = useCallback((updates: Partial<FeetConfig>) => {
    const newFeet = { ...currentFeet, ...updates };
    handleAssemblyParamChange({ feet: newFeet });
  }, [currentFeet, handleAssemblyParamChange]);

  // Handle face parameter changes
  const handleFaceParamChange = useCallback((updates: Partial<FaceParams>) => {
    if (isOpActive && initialFaceData) {
      updateOperationParams({
        faceId: initialFaceData.faceId,
        faceSolid: currentFaceSolid,
        faceTabDirection: currentFaceTabDirection,
        ...updates,
      });
    }
  }, [isOpActive, initialFaceData, currentFaceSolid, currentFaceTabDirection, updateOperationParams]);

  // Handle face solid toggle
  const handleSolidToggle = useCallback(() => {
    handleFaceParamChange({ faceSolid: !currentFaceSolid });
  }, [handleFaceParamChange, currentFaceSolid]);

  // Handle face tab direction change
  const handleTabDirectionChange = useCallback((direction: string) => {
    handleFaceParamChange({ faceTabDirection: direction as LidTabDirection });
  }, [handleFaceParamChange]);

  // Handle apply
  const handleApply = useCallback(() => {
    if (isOpActive) {
      applyOperation();
    }
    onClose();
  }, [isOpActive, applyOperation, onClose]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    if (isOpActive) {
      cancelOperation();
    } else {
      // Clean up any preview
      const engine = getEngine();
      if (engine.hasPreview()) {
        engine.discardPreview();
        notifyEngineStateChanged();
      }
    }
    onClose();
  }, [isOpActive, cancelOperation, onClose]);

  // Clean up preview when palette unmounts
  useEffect(() => {
    return () => {
      const currentState = useBoxStore.getState();
      const isOperationActive = currentState.operationState.activeOperation === 'configure';

      if (!isOperationActive) {
        const engine = getEngine();
        if (engine.hasPreview()) {
          engine.discardPreview();
          notifyEngineStateChanged();
        }
      }
    };
  }, []);

  if (!visible || !config) return null;

  // Determine title based on selection
  const getTitle = () => {
    if (selectionMode === 'assembly') {
      const assemblyName = selectedAssemblyId === 'main' ? 'Main Assembly' : 'Sub-Assembly';
      return `Configure: ${assemblyName}`;
    }
    if (selectionMode === 'face' && initialFaceData) {
      return `Configure: ${faceLabels[initialFaceData.faceId]} Face`;
    }
    return 'Configure';
  };

  return (
    <FloatingPalette
      title={getTitle()}
      position={position}
      onPositionChange={onPositionChange}
      onClose={handleCancel}
      onApply={handleApply}
      containerRef={containerRef}
      minWidth={260}
      closeOnClickOutside={false}
    >
      {/* No valid selection - show selection prompt */}
      {selectionMode === 'none' && (
        <div className="palette-section">
          <p className="palette-hint">Select an assembly or face to configure</p>
          <div className="palette-section-title" style={{ marginTop: 12 }}>Assemblies</div>
          <div className="palette-assembly-list">
            {availableAssemblies.map((assembly) => (
              <button
                key={assembly.id}
                className="palette-assembly-item"
                onClick={() => handleSelectAssembly(assembly.id)}
              >
                <span className="assembly-name">{assembly.name}</span>
                {assembly.dimensions && (
                  <span className="assembly-size">{assembly.dimensions}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Assembly selected - show assembly configuration */}
      {selectionMode === 'assembly' && (
        <>
          {/* Orientation Section */}
          <div className="palette-section">
            <div className="palette-section-title">Orientation</div>
            <PaletteToggleGroup
              label=""
              options={axisOptions}
              value={currentAxis}
              onChange={(v) => handleAssemblyParamChange({ assemblyAxis: v as Axis })}
            />
            <p className="palette-hint-small">{getAxisDescription(currentAxis)}</p>
          </div>

          {/* Material Section */}
          <div className="palette-section">
            <div className="palette-section-title">Material</div>
            <div className="palette-form-grid">
              <label>
                <span>Thickness</span>
                <div className="input-with-unit">
                  <NumberInput
                    value={currentThickness}
                    onChange={(v) => handleAssemblyParamChange({ thickness: v })}
                    min={0.5}
                    max={20}
                    step={0.5}
                  />
                  <span className="unit">mm</span>
                </div>
              </label>
            </div>
          </div>

          {/* Finger Joints Section */}
          <div className="palette-section">
            <div className="palette-section-title">Finger Joints</div>
            <div className="palette-form-grid">
              <label>
                <span>Finger Width</span>
                <div className="input-with-unit">
                  <NumberInput
                    value={currentFingerWidth}
                    onChange={(v) => handleAssemblyParamChange({ fingerWidth: v })}
                    min={3}
                    max={50}
                    step={1}
                  />
                  <span className="unit">mm</span>
                </div>
              </label>
              <label>
                <span>Corner Gap</span>
                <div className="input-with-unit">
                  <NumberInput
                    value={currentFingerGap}
                    onChange={(v) => handleAssemblyParamChange({ fingerGap: v })}
                    min={0}
                    max={5}
                    step={0.1}
                  />
                  <span className="unit">x</span>
                </div>
              </label>
            </div>
          </div>

          {/* Feet Section */}
          <div className="palette-section">
            <div className="palette-section-title">Feet</div>
            <label className="palette-checkbox">
              <input
                type="checkbox"
                checked={currentFeet.enabled}
                onChange={(e) => handleFeetToggle(e.target.checked)}
              />
              <span>Add feet to box</span>
            </label>
            {currentFeet.enabled && (
              <div className="palette-form-grid">
                <label>
                  <span>Height</span>
                  <div className="input-with-unit">
                    <NumberInput
                      value={currentFeet.height}
                      onChange={(v) => handleFeetUpdate({ height: v })}
                      min={5}
                      max={100}
                      step={5}
                    />
                    <span className="unit">mm</span>
                  </div>
                </label>
                <label>
                  <span>Width</span>
                  <div className="input-with-unit">
                    <NumberInput
                      value={currentFeet.width}
                      onChange={(v) => handleFeetUpdate({ width: v })}
                      min={10}
                      max={100}
                      step={5}
                    />
                    <span className="unit">mm</span>
                  </div>
                </label>
                <label>
                  <span>Inset</span>
                  <div className="input-with-unit">
                    <NumberInput
                      value={currentFeet.inset}
                      onChange={(v) => handleFeetUpdate({ inset: v })}
                      min={0}
                      max={50}
                      step={1}
                    />
                    <span className="unit">mm</span>
                  </div>
                </label>
              </div>
            )}
          </div>

          {/* Actions */}
          <PaletteButtonRow>
            <PaletteButton
              variant="primary"
              onClick={handleApply}
              disabled={!isOpActive}
            >
              Apply
            </PaletteButton>
            <PaletteButton variant="secondary" onClick={handleCancel}>
              Cancel
            </PaletteButton>
          </PaletteButtonRow>
        </>
      )}

      {/* Face selected - show face configuration */}
      {selectionMode === 'face' && initialFaceData && (
        <>
          {/* Solid/Open Toggle */}
          <div className="palette-section">
            <label className="palette-checkbox">
              <input
                type="checkbox"
                checked={currentFaceSolid}
                onChange={handleSolidToggle}
              />
              <span>Include in cut (solid)</span>
            </label>
            {!currentFaceSolid && (
              <p className="palette-hint-small">Face is open - no panel will be cut</p>
            )}
          </div>

          {/* Tab Direction */}
          <div className="palette-section">
            <div className="palette-section-title">Tab Direction</div>
            {initialFaceData.isLid ? (
              <>
                <PaletteToggleGroup
                  label=""
                  options={tabDirectionOptions}
                  value={currentFaceTabDirection}
                  onChange={handleTabDirectionChange}
                  disabled={!currentFaceSolid}
                />
                <p className="palette-hint-small">
                  {!currentFaceSolid
                    ? 'Open faces have no tabs'
                    : currentFaceTabDirection === 'tabs-out'
                      ? 'Lid has tabs that go into wall slots'
                      : 'Walls have tabs that go into lid slots'}
                </p>
              </>
            ) : (
              <>
                <PaletteToggleGroup
                  label=""
                  options={tabDirectionOptions}
                  value={currentFaceTabDirection}
                  onChange={handleTabDirectionChange}
                  disabled={true}
                />
                <p className="palette-hint-small">
                  Tab direction can only be changed on lid faces (faces on the assembly axis)
                </p>
              </>
            )}
          </div>

          {/* Actions */}
          <PaletteButtonRow>
            <PaletteButton
              variant="primary"
              onClick={handleApply}
              disabled={!isOpActive}
            >
              Apply
            </PaletteButton>
            <PaletteButton variant="secondary" onClick={handleCancel}>
              Cancel
            </PaletteButton>
          </PaletteButtonRow>
        </>
      )}
    </FloatingPalette>
  );
};
