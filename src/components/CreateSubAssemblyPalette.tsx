import React, { useMemo, useCallback, useEffect, useRef, useState } from 'react';
import {
  FloatingPalette,
  PaletteSliderInput,
  PaletteButton,
  PaletteButtonRow,
  PaletteToggleGroup,
} from './FloatingPalette';
import { useBoxStore, findVoid, getLeafVoids } from '../store/useBoxStore';
import { useEngineVoidTree, useEngineMainVoidTree, getEngine, notifyEngineStateChanged } from '../engine';
import { Void, AssemblyAxis } from '../types';
import { isLeafVoid } from '../operations';

interface CreateSubAssemblyPaletteProps {
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

// Get available leaf voids that can have sub-assemblies
const getAvailableVoids = (rootVoid: Void): Void[] => {
  return getLeafVoids(rootVoid).filter(v => !v.subAssembly && !v.lidInsetSide);
};

export const CreateSubAssemblyPalette: React.FC<CreateSubAssemblyPaletteProps> = ({
  visible,
  position,
  onPositionChange,
  onClose,
  containerRef,
}) => {
  // State from engine
  const rootVoid = useEngineVoidTree();
  const mainVoidTree = useEngineMainVoidTree();

  // UI state and actions from store
  const selectedVoidIds = useBoxStore((state) => state.selectedVoidIds);
  const operationState = useBoxStore((state) => state.operationState);
  const startOperation = useBoxStore((state) => state.startOperation);
  const updateOperationParams = useBoxStore((state) => state.updateOperationParams);
  const applyOperation = useBoxStore((state) => state.applyOperation);
  const cancelOperation = useBoxStore((state) => state.cancelOperation);
  const selectVoid = useBoxStore((state) => state.selectVoid);

  // Local state for params before operation starts
  const [localClearance, setLocalClearance] = useState(2);
  const [localAssemblyAxis, setLocalAssemblyAxis] = useState<AssemblyAxis>('y');

  // Track auto-start
  const hasAutoStarted = useRef(false);

  // Get single selected void
  const selectedVoidId = selectedVoidIds.size === 1 ? Array.from(selectedVoidIds)[0] : null;

  // Operation state
  const isActive = operationState.activeOperation === 'create-sub-assembly';
  const opParams = operationState.params as {
    voidId?: string;
    clearance?: number;
    assemblyAxis?: AssemblyAxis;
  };

  // Use main tree for determining if void can have sub-assembly (prevents flickering during preview)
  const mainSelectedVoid = useMemo(() => {
    if (!selectedVoidId || !mainVoidTree) return null;
    return findVoid(mainVoidTree, selectedVoidId);
  }, [selectedVoidId, mainVoidTree]);

  // Use current tree for display bounds
  const selectedVoid = useMemo(() => {
    if (!selectedVoidId || !rootVoid) return null;
    return findVoid(rootVoid, selectedVoidId);
  }, [selectedVoidId, rootVoid]);

  // Check if the selected void can have a sub-assembly
  const canCreateSubAssembly = mainSelectedVoid
    ? isLeafVoid(mainSelectedVoid) && !mainSelectedVoid.lidInsetSide
    : false;

  // Get list of available voids for selection prompt
  const availableVoids = useMemo(() => {
    if (!mainVoidTree) return [];
    return getAvailableVoids(mainVoidTree);
  }, [mainVoidTree]);

  // Current parameter values (from operation if active, otherwise local)
  const currentClearance = isActive ? (opParams.clearance ?? localClearance) : localClearance;
  const currentAssemblyAxis = isActive ? (opParams.assemblyAxis ?? localAssemblyAxis) : localAssemblyAxis;
  const currentVoidId = isActive ? opParams.voidId : selectedVoidId;

  // Auto-start operation when a valid void is selected
  useEffect(() => {
    if (hasAutoStarted.current) return;
    if (!selectedVoidId || !canCreateSubAssembly) return;
    if (isActive) return;

    hasAutoStarted.current = true;

    // Start the operation
    startOperation('create-sub-assembly');
    updateOperationParams({
      voidId: selectedVoidId,
      clearance: localClearance,
      assemblyAxis: localAssemblyAxis,
    });
  }, [selectedVoidId, canCreateSubAssembly, isActive, localClearance, localAssemblyAxis, startOperation, updateOperationParams]);

  // Reset auto-start flag when selection changes (but not during active operation)
  useEffect(() => {
    const currentState = useBoxStore.getState();
    const isOperationActive = currentState.operationState.activeOperation === 'create-sub-assembly';

    if (!isOperationActive) {
      hasAutoStarted.current = false;
    }
  }, [selectedVoidId]);

  // Handle void selection from list
  const handleVoidSelect = useCallback((voidId: string) => {
    selectVoid(voidId, false);
    // The auto-start effect will kick in once the void is selected
  }, [selectVoid]);

  // Handle clearance change
  const handleClearanceChange = useCallback((clearance: number) => {
    const newClearance = Math.max(0, Math.min(20, clearance));
    setLocalClearance(newClearance);

    if (isActive && currentVoidId) {
      updateOperationParams({
        voidId: currentVoidId,
        clearance: newClearance,
        assemblyAxis: currentAssemblyAxis,
      });
    }
  }, [isActive, currentVoidId, currentAssemblyAxis, updateOperationParams]);

  // Handle assembly axis change
  const handleAxisChange = useCallback((axis: string) => {
    const newAxis = axis as AssemblyAxis;
    setLocalAssemblyAxis(newAxis);

    if (isActive && currentVoidId) {
      updateOperationParams({
        voidId: currentVoidId,
        clearance: currentClearance,
        assemblyAxis: newAxis,
      });
    }
  }, [isActive, currentVoidId, currentClearance, updateOperationParams]);

  // Handle apply
  const handleApply = useCallback(() => {
    if (isActive) {
      applyOperation();
    }
    onClose();
  }, [isActive, applyOperation, onClose]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    if (isActive) {
      cancelOperation();
    } else {
      // Clear any preview
      const engine = getEngine();
      if (engine.hasPreview()) {
        engine.discardPreview();
        notifyEngineStateChanged();
      }
    }
    onClose();
  }, [isActive, cancelOperation, onClose]);

  // Clean up preview when palette unmounts
  useEffect(() => {
    return () => {
      const currentState = useBoxStore.getState();
      const isOperationActive = currentState.operationState.activeOperation === 'create-sub-assembly';

      if (!isOperationActive) {
        const engine = getEngine();
        if (engine.hasPreview()) {
          engine.discardPreview();
          notifyEngineStateChanged();
        }
      }
    };
  }, []);

  if (!visible) return null;

  const voidBounds = selectedVoid?.bounds;

  // Assembly axis options with friendly names (shared pattern with AssemblyPalette)
  const axisOptions = [
    { value: 'y', label: 'Top Down' },
    { value: 'x', label: 'Side to Side' },
    { value: 'z', label: 'Front to Back' },
  ];

  const getAxisDescription = (axis: AssemblyAxis): string => {
    switch (axis) {
      case 'y': return 'Lid opens from top';
      case 'x': return 'Opens from the side';
      case 'z': return 'Opens from front';
    }
  };

  return (
    <FloatingPalette
      title="Create Sub-Assembly"
      position={position}
      onPositionChange={onPositionChange}
      onClose={handleCancel}
      onApply={handleApply}
      containerRef={containerRef}
      minWidth={220}
      closeOnClickOutside={false}
    >
      {/* No void selected - show selection prompt */}
      {!selectedVoidId ? (
        <div className="palette-section">
          <p className="palette-hint">Select a void to create a sub-assembly</p>
          {availableVoids.length > 0 ? (
            <div className="palette-void-list">
              <span className="palette-label">Available Voids</span>
              {availableVoids.map((v) => (
                <button
                  key={v.id}
                  className="palette-void-item"
                  onClick={() => handleVoidSelect(v.id)}
                >
                  <span className="void-id">{v.id}</span>
                  <span className="void-size">
                    {v.bounds.w.toFixed(0)} x {v.bounds.h.toFixed(0)} x {v.bounds.d.toFixed(0)}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="palette-hint-small">No available voids. Subdivide first.</p>
          )}
        </div>
      ) : !canCreateSubAssembly ? (
        // Void selected but can't create sub-assembly
        <div className="palette-section">
          <p className="palette-hint">
            {mainSelectedVoid?.subAssembly
              ? 'This void already has a sub-assembly'
              : mainSelectedVoid?.children.length && mainSelectedVoid.children.length > 0
              ? 'Cannot create sub-assembly in subdivided void'
              : mainSelectedVoid?.lidInsetSide
              ? 'Cannot create sub-assembly in lid inset void'
              : 'Cannot create sub-assembly in this void'}
          </p>
        </div>
      ) : (
        // Valid void selected - show configuration
        <>
          <div className="palette-section">
            <div className="palette-info">
              <span className="palette-label">Target Void</span>
              {voidBounds && (
                <span className="palette-value">
                  {voidBounds.w.toFixed(1)} x {voidBounds.h.toFixed(1)} x {voidBounds.d.toFixed(1)} mm
                </span>
              )}
            </div>
          </div>

          <PaletteSliderInput
            label="Clearance (mm)"
            value={currentClearance}
            min={0}
            max={20}
            step={0.5}
            onChange={handleClearanceChange}
          />

          <div className="palette-section">
            <PaletteToggleGroup
              label="Orientation"
              options={axisOptions}
              value={currentAssemblyAxis}
              onChange={handleAxisChange}
            />
            <p className="palette-hint-small">{getAxisDescription(currentAssemblyAxis)}</p>
          </div>

          <PaletteButtonRow>
            <PaletteButton
              variant="primary"
              onClick={handleApply}
              disabled={!isActive || !currentVoidId}
            >
              Create
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
