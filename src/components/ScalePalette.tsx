import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  FloatingPalette,
  PaletteButton,
  PaletteButtonRow,
} from './FloatingPalette';
import { NumberInput } from './UI/NumberInput';
import { useBoxStore, getAllSubAssemblies } from '../store/useBoxStore';
import { useEngineConfig, useEngineVoidTree, getEngine, notifyEngineStateChanged } from '../engine';

interface ScalePaletteProps {
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

export const ScalePalette: React.FC<ScalePaletteProps> = ({
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

  // Local state for parameters (before operation starts or as fallback)
  const [localWidth, setLocalWidth] = useState(config?.width ?? 100);
  const [localHeight, setLocalHeight] = useState(config?.height ?? 100);
  const [localDepth, setLocalDepth] = useState(config?.depth ?? 100);

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

  // Initialize local state from config when it changes
  useEffect(() => {
    if (config) {
      setLocalWidth(config.width);
      setLocalHeight(config.height);
      setLocalDepth(config.depth);
    }
  }, [config]);

  // Operation state
  const isActive = operationState.activeOperation === 'scale';
  const opParams = operationState.params as {
    width?: number;
    height?: number;
    depth?: number;
  };

  // Current values (from operation if active, otherwise local)
  const currentWidth = isActive ? (opParams.width ?? localWidth) : localWidth;
  const currentHeight = isActive ? (opParams.height ?? localHeight) : localHeight;
  const currentDepth = isActive ? (opParams.depth ?? localDepth) : localDepth;

  // Auto-start operation when palette becomes visible and assembly is selected
  useEffect(() => {
    if (hasAutoStarted.current) return;
    if (!visible) return;
    if (isActive) return;
    if (!config) return;
    if (!selectedAssemblyId) return; // Don't auto-start without selection

    hasAutoStarted.current = true;
    startOperation('scale');
    updateOperationParams({
      width: config.width,
      height: config.height,
      depth: config.depth,
    });
  }, [visible, isActive, config, selectedAssemblyId, startOperation, updateOperationParams]);

  // Reset auto-start flag when visibility changes
  useEffect(() => {
    if (!visible) {
      hasAutoStarted.current = false;
    }
  }, [visible]);

  // Reset auto-start when selection changes (to allow re-starting with new selection)
  useEffect(() => {
    const currentState = useBoxStore.getState();
    const isOperationActive = currentState.operationState.activeOperation === 'scale';
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
    if (updates.width !== undefined) setLocalWidth(updates.width);
    if (updates.height !== undefined) setLocalHeight(updates.height);
    if (updates.depth !== undefined) setLocalDepth(updates.depth);

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
      const isOperationActive = currentState.operationState.activeOperation === 'scale';

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
      title={selectedAssemblyId ? `Scale: ${assemblyName}` : 'Scale Assembly'}
      position={position}
      onPositionChange={onPositionChange}
      onClose={handleCancel}
      onApply={selectedAssemblyId ? handleApply : undefined}
      containerRef={containerRef}
      minWidth={240}
      closeOnClickOutside={false}
    >
      {/* No assembly selected - show selection prompt */}
      {!selectedAssemblyId ? (
        <div className="palette-section">
          <p className="palette-hint">Select an assembly to scale</p>
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
        /* Assembly selected - show dimensions */
        <>
          {/* Dimensions */}
          <div className="palette-section">
            <div className="palette-section-title">Dimensions</div>
            <div className="palette-form-row">
              <label>
                <span>W</span>
                <div className="input-with-unit">
                  <NumberInput
                    value={currentWidth}
                    onChange={(v) => handleParamChange({ width: v })}
                    min={10}
                    step={1}
                  />
                  <span className="unit">mm</span>
                </div>
              </label>
              <label>
                <span>H</span>
                <div className="input-with-unit">
                  <NumberInput
                    value={currentHeight}
                    onChange={(v) => handleParamChange({ height: v })}
                    min={10}
                    step={1}
                  />
                  <span className="unit">mm</span>
                </div>
              </label>
              <label>
                <span>D</span>
                <div className="input-with-unit">
                  <NumberInput
                    value={currentDepth}
                    onChange={(v) => handleParamChange({ depth: v })}
                    min={10}
                    step={1}
                  />
                  <span className="unit">mm</span>
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
