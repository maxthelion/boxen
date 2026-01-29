import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  FloatingPalette,
  PaletteButton,
  PaletteButtonRow,
  PaletteToggleGroup,
} from './FloatingPalette';
import { NumberInput } from './UI/NumberInput';
import { useBoxStore, getAllSubAssemblies } from '../store/useBoxStore';
import { useEngineConfig, useEngineVoidTree, getEngine, notifyEngineStateChanged } from '../engine';
import { Axis } from '../engine/types';

interface AssemblyPaletteProps {
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

// Friendly axis names
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

export const AssemblyPalette: React.FC<AssemblyPaletteProps> = ({
  visible,
  position,
  onPositionChange,
  onClose,
  containerRef,
}) => {
  // Get config from engine
  const config = useEngineConfig();
  const rootVoid = useEngineVoidTree();

  // Selection state from store
  const selectedAssemblyId = useBoxStore((state) => state.selectedAssemblyId);
  const selectAssembly = useBoxStore((state) => state.selectAssembly);

  // Operation state from store
  const operationState = useBoxStore((state) => state.operationState);
  const startOperation = useBoxStore((state) => state.startOperation);
  const updateOperationParams = useBoxStore((state) => state.updateOperationParams);
  const applyOperation = useBoxStore((state) => state.applyOperation);
  const cancelOperation = useBoxStore((state) => state.cancelOperation);

  // Track if we've auto-started the operation
  const hasAutoStarted = useRef(false);

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

  // Local state for parameters (before operation starts or as fallback)
  const [localThickness, setLocalThickness] = useState(config?.materialThickness ?? 3);
  const [localFingerWidth, setLocalFingerWidth] = useState(config?.fingerWidth ?? 10);
  const [localFingerGap, setLocalFingerGap] = useState(config?.fingerGap ?? 1.5);
  const [localAxis, setLocalAxis] = useState<Axis>(config?.assembly?.assemblyAxis ?? 'y');

  // Initialize local state from config when it changes
  useEffect(() => {
    if (config) {
      setLocalThickness(config.materialThickness);
      setLocalFingerWidth(config.fingerWidth);
      setLocalFingerGap(config.fingerGap);
      setLocalAxis(config.assembly?.assemblyAxis ?? 'y');
    }
  }, [config]);

  // Operation state
  const isActive = operationState.activeOperation === 'configure-assembly';
  const opParams = operationState.params as {
    thickness?: number;
    fingerWidth?: number;
    fingerGap?: number;
    assemblyAxis?: Axis;
  };

  // Current values (from operation if active, otherwise local)
  const currentThickness = isActive ? (opParams.thickness ?? localThickness) : localThickness;
  const currentFingerWidth = isActive ? (opParams.fingerWidth ?? localFingerWidth) : localFingerWidth;
  const currentFingerGap = isActive ? (opParams.fingerGap ?? localFingerGap) : localFingerGap;
  const currentAxis = isActive ? (opParams.assemblyAxis ?? localAxis) : localAxis;

  // Auto-start operation when palette becomes visible and assembly is selected
  useEffect(() => {
    if (hasAutoStarted.current) return;
    if (!visible) return;
    if (isActive) return;
    if (!config) return;
    if (!selectedAssemblyId) return; // Don't auto-start without selection

    hasAutoStarted.current = true;
    startOperation('configure-assembly');
    updateOperationParams({
      thickness: config.materialThickness,
      fingerWidth: config.fingerWidth,
      fingerGap: config.fingerGap,
      assemblyAxis: config.assembly?.assemblyAxis ?? 'y',
    });
  }, [visible, isActive, config, selectedAssemblyId, startOperation, updateOperationParams]);

  // Reset auto-start flag when visibility or selection changes
  useEffect(() => {
    if (!visible) {
      hasAutoStarted.current = false;
    }
  }, [visible]);

  // Reset auto-start when selection changes (to allow re-starting with new selection)
  useEffect(() => {
    const currentState = useBoxStore.getState();
    const isOperationActive = currentState.operationState.activeOperation === 'configure-assembly';
    if (!isOperationActive) {
      hasAutoStarted.current = false;
    }
  }, [selectedAssemblyId]);

  // Handle assembly selection from prompt
  const handleSelectAssembly = useCallback((assemblyId: string) => {
    selectAssembly(assemblyId);
  }, [selectAssembly]);

  // Handle parameter changes
  const handleParamChange = useCallback((updates: Partial<typeof opParams>) => {
    // Update local state
    if (updates.thickness !== undefined) setLocalThickness(updates.thickness);
    if (updates.fingerWidth !== undefined) setLocalFingerWidth(updates.fingerWidth);
    if (updates.fingerGap !== undefined) setLocalFingerGap(updates.fingerGap);
    if (updates.assemblyAxis !== undefined) setLocalAxis(updates.assemblyAxis);

    // Update operation params if active
    if (isActive) {
      updateOperationParams({
        ...opParams,
        ...updates,
      });
    }
  }, [isActive, opParams, updateOperationParams]);

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
      // Clean up any preview
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
      const isOperationActive = currentState.operationState.activeOperation === 'configure-assembly';

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

  // Get assembly name for title
  const assemblyName = selectedAssemblyId === 'main' ? 'Main Assembly' : 'Sub-Assembly';

  return (
    <FloatingPalette
      title={selectedAssemblyId ? `Configure: ${assemblyName}` : 'Configure Assembly'}
      position={position}
      onPositionChange={onPositionChange}
      onClose={handleCancel}
      onApply={selectedAssemblyId ? handleApply : undefined}
      containerRef={containerRef}
      minWidth={260}
      closeOnClickOutside={false}
    >
      {/* No assembly selected - show selection prompt */}
      {!selectedAssemblyId ? (
        <div className="palette-section">
          <p className="palette-hint">Select an assembly to configure</p>
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
      ) : (
        /* Assembly selected - show configuration */
        <>
          {/* Orientation Section */}
          <div className="palette-section">
            <div className="palette-section-title">Orientation</div>
            <PaletteToggleGroup
              label=""
              options={axisOptions}
              value={currentAxis}
              onChange={(v) => handleParamChange({ assemblyAxis: v as Axis })}
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
                    onChange={(v) => handleParamChange({ thickness: v })}
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
                    onChange={(v) => handleParamChange({ fingerWidth: v })}
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
                    onChange={(v) => handleParamChange({ fingerGap: v })}
                    min={0}
                    max={5}
                    step={0.1}
                  />
                  <span className="unit">x</span>
                </div>
              </label>
            </div>
          </div>

          {/* Actions */}
          <PaletteButtonRow>
            <PaletteButton
              variant="primary"
              onClick={handleApply}
              disabled={!isActive}
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
