import React, { useMemo, useCallback, useRef, useEffect, useState } from 'react';
import { FloatingPalette, PaletteSliderInput, PaletteButton, PaletteButtonRow } from './FloatingPalette';
import { useBoxStore, findVoid, calculatePreviewPositions } from '../store/useBoxStore';
import { useEngineVoidTree, useEngineFaces, useEngineMainVoidTree, useEnginePanels, getEngine, notifyEngineStateChanged } from '../engine';
import { Face, Void, FaceId, PanelPath } from '../types';
import { Axis } from '../engine/types';
import { debug, enableDebugTag } from '../utils/debug';
import {
  getPanelNormalAxis,
  getPerpendicularAxes,
  getPanelDescription,
  findVoidBetweenPanels,
  getValidSubdivisionAxes,
  isLeafVoid,
  getExistingSubdivisions,
  checkSubdivisionModificationImpact,
  type ExistingSubdivisionInfo,
} from '../operations';

// Enable debug tag for two-panel subdivision debugging
enableDebugTag('two-panel');

interface SubdividePaletteProps {
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

// =============================================================================
// UI Helper functions (not shared with validators)
// =============================================================================

const getAxisTooltip = (axis: 'x' | 'y' | 'z', isValid: boolean, isSelected: boolean): string => {
  if (!isValid) {
    switch (axis) {
      case 'x': return 'Disabled: left or right face is open';
      case 'y': return 'Disabled: top or bottom face is open';
      case 'z': return 'Disabled: front or back face is open';
    }
  }
  if (isSelected) {
    return `Click to deselect ${axis.toUpperCase()} axis`;
  }
  switch (axis) {
    case 'x': return 'Click to add vertical divider (left-right)';
    case 'y': return 'Click to add horizontal shelf (top-bottom)';
    case 'z': return 'Click to add vertical divider (front-back)';
  }
};

// Get which faces a divider panel of the given axis would touch (share an edge with)
// X axis creates YZ plane dividers that touch top, bottom, front, back
// Y axis creates XZ plane dividers that touch left, right, front, back
// Z axis creates XY plane dividers that touch left, right, top, bottom
const getDividerTouchesFaces = (axis: 'x' | 'y' | 'z'): FaceId[] => {
  switch (axis) {
    case 'x': return ['top', 'bottom', 'front', 'back'];
    case 'y': return ['left', 'right', 'front', 'back'];
    case 'z': return ['left', 'right', 'top', 'bottom'];
  }
};

// Select preferred axis: prefer axis whose dividers touch open faces (can be slotted in)
// If no axis touches open faces, fall back to y > x > z preference
const selectPreferredAxis = (
  validAxes: ('x' | 'y' | 'z')[],
  faces: Face[]
): 'x' | 'y' | 'z' => {
  if (validAxes.length === 0) return 'y'; // shouldn't happen
  if (validAxes.length === 1) return validAxes[0];

  // Count how many open faces each axis's dividers would touch
  const countOpenFacesTouched = (axis: 'x' | 'y' | 'z'): number => {
    const touchedFaceIds = getDividerTouchesFaces(axis);
    return touchedFaceIds.filter(faceId => {
      const face = faces.find(f => f.id === faceId);
      return face && !face.solid;
    }).length;
  };

  // Find axis with most open faces touched
  let bestAxis = validAxes[0];
  let bestCount = countOpenFacesTouched(bestAxis);

  for (const axis of validAxes.slice(1)) {
    const count = countOpenFacesTouched(axis);
    if (count > bestCount) {
      bestCount = count;
      bestAxis = axis;
    }
  }

  // If no axis touches open faces, fall back to y > x > z preference
  if (bestCount === 0) {
    if (validAxes.includes('y')) return 'y';
    if (validAxes.includes('x')) return 'x';
    return validAxes[0];
  }

  return bestAxis;
};

// =============================================================================
// Two-panel selection analysis
// =============================================================================

interface TwoPanelSubdivisionInfo {
  isValid: boolean;
  panels: PanelPath[];
  panelDescriptions: string[];
  validAxes: ('x' | 'y' | 'z')[];
  normalAxis: 'x' | 'y' | 'z';
  targetVoid: Void | null;
}

// Analyze two selected panels for subdivision potential
const analyzeTwoPanelSelection = (
  selectedPanelIds: Set<string>,
  panelCollection: { panels: PanelPath[] } | null,
  rootVoid: Void
): TwoPanelSubdivisionInfo => {
  const invalid: TwoPanelSubdivisionInfo = {
    isValid: false,
    panels: [],
    panelDescriptions: [],
    validAxes: [],
    normalAxis: 'x',
    targetVoid: null,
  };

  debug('two-panel', `analyzeTwoPanelSelection: selectedPanelIds=${JSON.stringify(Array.from(selectedPanelIds))}, panelCount=${panelCollection?.panels.length ?? 0}`);

  if (selectedPanelIds.size !== 2 || !panelCollection) {
    debug('two-panel', `  -> rejected: size=${selectedPanelIds.size}, hasCollection=${!!panelCollection}`);
    return invalid;
  }

  const panelIds = Array.from(selectedPanelIds);
  const panels = panelIds
    .map(id => panelCollection.panels.find(p => p.id === id))
    .filter((p): p is PanelPath => p !== undefined);

  debug('two-panel', `  -> found ${panels.length} panels from IDs: ${panelIds.join(', ')}`);
  if (panels.length !== 2) {
    debug('two-panel', `  -> rejected: couldn't find both panels in collection`);
    return invalid;
  }

  const axis1 = getPanelNormalAxis(panels[0]);
  const axis2 = getPanelNormalAxis(panels[1]);

  debug('two-panel', `  -> panel axes: ${axis1}, ${axis2}`);
  if (!axis1 || !axis2 || axis1 !== axis2) {
    debug('two-panel', `  -> rejected: axes don't match or null`);
    return invalid;
  }

  if (panels.some(p => p.source.subAssemblyId)) {
    debug('two-panel', `  -> rejected: contains sub-assembly panel`);
    return invalid;
  }

  const normalAxis = axis1;
  const validAxes = getPerpendicularAxes(normalAxis);

  debug('two-panel', `  -> calling findVoidBetweenPanels with rootVoid.children.length=${rootVoid.children.length}`);
  const targetVoid = findVoidBetweenPanels(panels[0], panels[1], rootVoid);

  if (!targetVoid) {
    debug('two-panel', `  -> rejected: no void found between panels`);
    return invalid;
  }

  const panelDescriptions = panels.map(getPanelDescription);

  debug('two-panel', `  -> SUCCESS: targetVoid=${targetVoid.id}, validAxes=${validAxes.join(',')}`);
  return {
    isValid: true,
    panels,
    panelDescriptions,
    validAxes,
    normalAxis,
    targetVoid,
  };
};

// =============================================================================
// Grid calculations
// =============================================================================

// Calculate total cells from selected axes
const calculateTotalCells = (
  selectedAxes: Axis[],
  counts: Record<Axis, number>
): number => {
  if (selectedAxes.length === 0) return 1;
  let total = 1;
  for (const axis of selectedAxes) {
    total *= (counts[axis] + 1);
  }
  return total;
};

// =============================================================================
// Component
// =============================================================================

export const SubdividePalette: React.FC<SubdividePaletteProps> = ({
  visible,
  position,
  onPositionChange,
  onClose,
  containerRef,
}) => {
  // State from engine
  const rootVoid = useEngineVoidTree();
  const mainVoidTree = useEngineMainVoidTree();
  const faces = useEngineFaces();
  const panelCollection = useEnginePanels();

  // UI state and actions from store
  const selectedVoidIds = useBoxStore((state) => state.selectedVoidIds);
  const selectedPanelIds = useBoxStore((state) => state.selectedPanelIds);
  const operationState = useBoxStore((state) => state.operationState);
  const startOperation = useBoxStore((state) => state.startOperation);
  const updateOperationParams = useBoxStore((state) => state.updateOperationParams);
  const applyOperation = useBoxStore((state) => state.applyOperation);
  const cancelOperation = useBoxStore((state) => state.cancelOperation);

  // Track hover state to prevent cleanup from discarding preview
  const isHoverPreviewRef = useRef(false);

  // Get single selected void
  const selectedVoidId = selectedVoidIds.size === 1 ? Array.from(selectedVoidIds)[0] : null;

  // Analyze two-panel selection - use mainVoidTree to prevent flickering during preview
  const twoPanelInfo = useMemo(() => {
    if (!mainVoidTree) return null;
    return analyzeTwoPanelSelection(selectedPanelIds, panelCollection, mainVoidTree);
  }, [selectedPanelIds, panelCollection, mainVoidTree]);

  // Use main tree for determining if void can be subdivided (prevents button flickering during preview)
  const mainSelectedVoid = useMemo(() => {
    if (!selectedVoidId || !mainVoidTree) return null;
    return findVoid(mainVoidTree, selectedVoidId);
  }, [selectedVoidId, mainVoidTree]);

  // Use current tree for bounds info
  const selectedVoid = useMemo(() => {
    if (!selectedVoidId || !rootVoid) return null;
    return findVoid(rootVoid, selectedVoidId);
  }, [selectedVoidId, rootVoid]);

  // Determine if the void can be subdivided (leaf void) or edited (has subdivisions but no sub-assemblies in children)
  const canSubdivideVoid = mainSelectedVoid ? isLeafVoid(mainSelectedVoid) : false;

  // Read existing subdivisions from the main void (for edit mode)
  const existingSubdivisions = useMemo((): ExistingSubdivisionInfo | null => {
    if (!mainSelectedVoid) return null;
    const existing = getExistingSubdivisions(mainSelectedVoid);
    return existing.hasSubdivisions ? existing : null;
  }, [mainSelectedVoid]);

  // Determine if we're in edit mode (void has existing subdivisions)
  const isEditMode = existingSubdivisions !== null;

  // Valid axes based on open faces (for void mode)
  const validAxes = useMemo(() => getValidSubdivisionAxes(faces), [faces]);

  // Multi-axis state: track selected axes and counts per axis
  const [selectedAxes, setSelectedAxes] = useState<Axis[]>([]);
  const [axisCounts, setAxisCounts] = useState<Record<Axis, number>>({ x: 1, y: 1, z: 1 });

  // Track whether we're modifying existing subdivisions (for warning display)
  const [isModified, setIsModified] = useState(false);

  // Check if operation is active
  const isActive = operationState.activeOperation === 'subdivide' ||
                   operationState.activeOperation === 'subdivide-two-panel' ||
                   operationState.activeOperation === 'subdivide-grid';

  // Determine which mode we're in
  const mode = twoPanelInfo?.isValid ? 'two-panel' : selectedVoidId ? 'void' : 'none';

  // Get the target void for the current mode
  const targetVoid = mode === 'two-panel' ? twoPanelInfo?.targetVoid : selectedVoid;
  const targetVoidId = mode === 'two-panel' ? twoPanelInfo?.targetVoid?.id : selectedVoidId;

  // Get the list of valid axes for the current mode
  const validAxisList = useMemo((): ('x' | 'y' | 'z')[] => {
    let list: ('x' | 'y' | 'z')[] = [];
    if (mode === 'two-panel') {
      list = twoPanelInfo?.validAxes ?? [];
    } else if (mode === 'void') {
      if (validAxes.x) list.push('x');
      if (validAxes.y) list.push('y');
      if (validAxes.z) list.push('z');
    }
    return list;
  }, [mode, twoPanelInfo?.validAxes, validAxes]);

  // Calculate positions for an axis based on count
  const getAxisPositions = useCallback((axis: Axis, count: number): number[] => {
    if (!targetVoid) return [];
    return calculatePreviewPositions(targetVoid.bounds, axis, count);
  }, [targetVoid]);

  // Build axes config for engine action
  const buildAxesConfig = useCallback((axes: Axis[], counts: Record<Axis, number>): { axis: Axis; positions: number[] }[] => {
    return axes.map(axis => ({
      axis,
      positions: getAxisPositions(axis, counts[axis]),
    }));
  }, [getAxisPositions]);

  // Auto-start operation when there are valid axes available
  // Prefers axis whose dividers touch open faces (can be slotted in)
  // Also handles edit mode: pre-populates with existing subdivision config
  const hasAutoStarted = useRef(false);
  useEffect(() => {
    // Only auto-start once per target selection
    if (hasAutoStarted.current) return;

    // Check if we have a valid target that can be subdivided or edited
    const canStart = (mode === 'void' && (canSubdivideVoid || isEditMode)) || mode === 'two-panel';
    if (!canStart || !targetVoidId || !targetVoid) return;

    // Don't auto-start if operation is already active
    if (isActive) return;

    // Need at least one valid axis
    if (validAxisList.length === 0) return;

    hasAutoStarted.current = true;

    // For edit mode: pre-populate with existing configuration
    if (isEditMode && existingSubdivisions) {
      const existingAxes = existingSubdivisions.axes as Axis[];
      const existingCounts: Record<Axis, number> = {
        x: existingSubdivisions.compartments.x ?? 1,
        y: existingSubdivisions.compartments.y ?? 1,
        z: existingSubdivisions.compartments.z ?? 1,
      };

      // Set UI state from existing subdivisions
      // Convert compartment counts to division counts (compartments - 1 = dividers)
      const divisionCounts: Record<Axis, number> = {
        x: Math.max(1, (existingCounts.x || 2) - 1),
        y: Math.max(1, (existingCounts.y || 2) - 1),
        z: Math.max(1, (existingCounts.z || 2) - 1),
      };
      setSelectedAxes(existingAxes);
      setAxisCounts(divisionCounts);
      setIsModified(false);

      // Start the operation
      const operationType = mode === 'two-panel' ? 'subdivide-two-panel' : 'subdivide-grid';
      startOperation(operationType);

      // Build axes config from existing positions
      const axesConfig = existingAxes.map(axis => ({
        axis,
        positions: existingSubdivisions.positions[axis] || calculatePreviewPositions(targetVoid.bounds, axis, divisionCounts[axis]),
      }));

      updateOperationParams({
        voidId: targetVoidId,
        axes: axesConfig,
        isEdit: true,  // Flag to use SET_GRID_SUBDIVISION instead of ADD
      });
    } else {
      // New subdivision mode: select preferred axis based on open faces
      const axis = selectPreferredAxis(validAxisList, faces);

      // Initialize with single axis selected
      setSelectedAxes([axis]);
      setAxisCounts({ x: 1, y: 1, z: 1 });
      setIsModified(false);

      // Start the operation
      const operationType = mode === 'two-panel' ? 'subdivide-two-panel' : 'subdivide-grid';
      startOperation(operationType);

      // Update params with initial axis config
      const positions = calculatePreviewPositions(targetVoid.bounds, axis, 1);
      updateOperationParams({
        voidId: targetVoidId,
        axes: [{ axis, positions }],
        isEdit: false,
      });
    }
  }, [mode, canSubdivideVoid, isEditMode, existingSubdivisions, targetVoidId, targetVoid, isActive, validAxisList, faces, startOperation, updateOperationParams]);

  // Reset auto-start flag when selection changes
  // But don't reset during an active operation (selection may change due to ID remapping)
  useEffect(() => {
    const currentState = useBoxStore.getState();
    const isOperationActive =
      currentState.operationState.activeOperation === 'subdivide' ||
      currentState.operationState.activeOperation === 'subdivide-two-panel' ||
      currentState.operationState.activeOperation === 'subdivide-grid';

    if (!isOperationActive) {
      hasAutoStarted.current = false;
      setSelectedAxes([]);
    }
  }, [selectedVoidId, selectedPanelIds]);

  // Handle axis toggle (multi-select, max 2)
  const handleAxisToggle = useCallback((axis: Axis) => {
    if (!targetVoidId || !targetVoid) return;

    // Clear hover state
    isHoverPreviewRef.current = false;

    // Check if axis is valid
    const isAxisValid = mode === 'two-panel'
      ? (twoPanelInfo?.validAxes ?? []).includes(axis)
      : validAxes[axis];

    if (!isAxisValid) return;

    // Toggle axis selection
    let newSelectedAxes: Axis[];
    if (selectedAxes.includes(axis)) {
      // Deselect axis
      newSelectedAxes = selectedAxes.filter(a => a !== axis);
    } else {
      // Add axis (max 2)
      if (selectedAxes.length >= 2) {
        // Replace oldest selection
        newSelectedAxes = [...selectedAxes.slice(1), axis];
      } else {
        newSelectedAxes = [...selectedAxes, axis];
      }
    }

    setSelectedAxes(newSelectedAxes);

    // Mark as modified if in edit mode
    if (isEditMode) {
      setIsModified(true);
    }

    if (!isActive && newSelectedAxes.length > 0) {
      // Start operation if not active
      const operationType = mode === 'two-panel' ? 'subdivide-two-panel' : 'subdivide-grid';
      startOperation(operationType);
    }

    if (newSelectedAxes.length > 0) {
      // Update operation params with new axes config
      const axesConfig = buildAxesConfig(newSelectedAxes, axisCounts);
      updateOperationParams({
        voidId: targetVoidId,
        axes: axesConfig,
        isEdit: isEditMode,  // Pass edit flag
      });
    } else if (isActive) {
      // No axes selected - cancel operation
      cancelOperation();
    }
  }, [targetVoidId, targetVoid, mode, twoPanelInfo?.validAxes, validAxes, selectedAxes, axisCounts, isActive, isEditMode, startOperation, cancelOperation, updateOperationParams, buildAxesConfig]);

  // Handle axis hover (show preview) - only for single axis hover
  const handleAxisHover = useCallback((axis: Axis) => {
    if (!targetVoidId || !targetVoid) return;
    if (isActive) return; // Don't override if operation is active

    const positions = calculatePreviewPositions(targetVoid.bounds, axis, 1);

    // Mark hover state
    isHoverPreviewRef.current = true;

    // Start engine preview for hover
    const engine = getEngine();
    engine.startPreview();
    engine.dispatch({
      type: 'ADD_SUBDIVISIONS',
      targetId: 'main-assembly',
      payload: { voidId: targetVoidId, axis, positions },
    }, { preview: true });
    notifyEngineStateChanged();
  }, [targetVoidId, targetVoid, isActive]);

  // Handle axis leave (clear hover preview)
  const handleAxisLeave = useCallback(() => {
    // Check current state directly from store (not from closure which might be stale)
    const currentState = useBoxStore.getState();
    const isOperationActive = currentState.operationState.activeOperation === 'subdivide' ||
                              currentState.operationState.activeOperation === 'subdivide-two-panel' ||
                              currentState.operationState.activeOperation === 'subdivide-grid';
    if (isOperationActive) return;

    // Only discard if we actually have a hover preview
    if (isHoverPreviewRef.current) {
      isHoverPreviewRef.current = false;
      const engine = getEngine();
      engine.discardPreview();
      notifyEngineStateChanged();
    }
  }, []);

  // Handle count change for a specific axis
  const handleCountChange = useCallback((axis: Axis, count: number) => {
    const newCount = Math.max(1, Math.min(20, Math.round(count)));

    // Update counts state
    const newCounts = { ...axisCounts, [axis]: newCount };
    setAxisCounts(newCounts);

    // Mark as modified if in edit mode
    if (isEditMode) {
      setIsModified(true);
    }

    // If operation is active, update preview
    if (isActive && selectedAxes.includes(axis) && targetVoid && targetVoidId) {
      const axesConfig = buildAxesConfig(selectedAxes, newCounts);
      updateOperationParams({
        voidId: targetVoidId,
        axes: axesConfig,
        isEdit: isEditMode,  // Pass edit flag
      });
    }
  }, [isActive, targetVoid, targetVoidId, selectedAxes, axisCounts, isEditMode, updateOperationParams, buildAxesConfig]);

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
      // Clear any hover preview
      const engine = getEngine();
      if (engine.hasPreview()) {
        engine.discardPreview();
        notifyEngineStateChanged();
      }
    }
    onClose();
  }, [isActive, cancelOperation, onClose]);

  // Clean up preview when palette unmounts or selection changes
  // Only clean up hover previews (when no operation is active)
  useEffect(() => {
    return () => {
      // Check current state directly from store - not from closure or ref
      // This ensures we get the actual current state, not a stale value
      const currentState = useBoxStore.getState();
      const isOperationActive =
        currentState.operationState.activeOperation === 'subdivide' ||
        currentState.operationState.activeOperation === 'subdivide-two-panel' ||
        currentState.operationState.activeOperation === 'subdivide-grid';

      // Only clean up if not in an active operation
      if (!isOperationActive) {
        const engine = getEngine();
        if (engine.hasPreview()) {
          engine.discardPreview();
          notifyEngineStateChanged();
        }
      }
    };
  }, [selectedVoidId, selectedPanelIds]);

  if (!visible) return null;

  // Get axes for the current mode
  const availableAxes = mode === 'two-panel' ? twoPanelInfo?.validAxes ?? [] : ['x', 'y', 'z'] as const;
  const voidBounds = targetVoid?.bounds;

  // Get panel pair description for two-panel mode
  const panelPairDescription = twoPanelInfo?.panelDescriptions.join(' & ') ?? '';

  // Calculate total cells
  const totalCells = calculateTotalCells(selectedAxes, axisCounts);

  // Check for modification warnings (sub-assemblies that would be affected)
  const modificationWarning = useMemo(() => {
    if (!isEditMode || !mainSelectedVoid || !isModified) return null;
    const newCompartments: Partial<Record<Axis, number>> = {};
    for (const axis of selectedAxes) {
      newCompartments[axis] = axisCounts[axis] + 1;  // divisions + 1 = compartments
    }
    return checkSubdivisionModificationImpact(mainSelectedVoid, selectedAxes, newCompartments);
  }, [isEditMode, mainSelectedVoid, isModified, selectedAxes, axisCounts]);

  return (
    <FloatingPalette
      title={isEditMode ? "Edit Subdivisions" : "Subdivide"}
      position={position}
      onPositionChange={onPositionChange}
      onClose={handleCancel}
      onApply={handleApply}
      containerRef={containerRef}
      minWidth={220}
      closeOnClickOutside={false}
    >
      {/* Selection status */}
      <div className="palette-section">
        {mode === 'none' ? (
          <p className="palette-hint">Select a void or two parallel panels to subdivide</p>
        ) : mode === 'two-panel' ? (
          <div className="palette-info">
            <span className="palette-label">Between Panels</span>
            <span className="palette-value">{panelPairDescription}</span>
          </div>
        ) : !canSubdivideVoid && !isEditMode ? (
          <p className="palette-hint">
            {mainSelectedVoid?.subAssembly
              ? 'Cannot subdivide: void has sub-assembly'
              : 'Cannot subdivide this void'}
          </p>
        ) : (
          <div className="palette-info">
            <span className="palette-label">{isEditMode ? 'Editing Void' : 'Selected Void'}</span>
            {voidBounds && (
              <span className="palette-value">
                {voidBounds.w.toFixed(1)} x {voidBounds.h.toFixed(1)} x {voidBounds.d.toFixed(1)} mm
              </span>
            )}
          </div>
        )}
      </div>

      {/* Target void info for two-panel mode */}
      {mode === 'two-panel' && voidBounds && (
        <div className="palette-info">
          <span className="palette-label">Target Void</span>
          <span className="palette-value">
            {voidBounds.w.toFixed(1)} x {voidBounds.h.toFixed(1)} x {voidBounds.d.toFixed(1)} mm
          </span>
        </div>
      )}

      {/* Edit mode indicator */}
      {isEditMode && (
        <div className="palette-info" style={{ marginBottom: '8px' }}>
          <span className="palette-hint-small" style={{ color: '#6c9' }}>
            ✏️ Editing existing {existingSubdivisions?.axes.length === 1 ? 'subdivision' : 'grid'}
          </span>
        </div>
      )}

      {/* Axis selection - multi-select (max 2) */}
      {((mode === 'void' && (canSubdivideVoid || isEditMode)) || mode === 'two-panel') && (
        <div className="palette-section">
          <span className="palette-label">Select Axes (max 2)</span>
          <div className="palette-axis-buttons">
            {(['x', 'y', 'z'] as const).map((axis) => {
              const isAxisValid = mode === 'two-panel'
                ? availableAxes.includes(axis)
                : validAxes[axis];
              const isAxisSelected = selectedAxes.includes(axis);
              return (
                <button
                  key={axis}
                  className={`palette-axis-btn ${isAxisSelected ? 'selected' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAxisToggle(axis);
                  }}
                  onMouseEnter={() => !isActive && !isEditMode && isAxisValid && !isAxisSelected && handleAxisHover(axis)}
                  onMouseLeave={() => !isActive && !isEditMode && handleAxisLeave()}
                  disabled={!isAxisValid}
                  title={mode === 'two-panel'
                    ? (isAxisValid ? `${isAxisSelected ? 'Deselect' : 'Select'} ${axis.toUpperCase()} axis` : 'Only perpendicular axes available')
                    : getAxisTooltip(axis, isAxisValid, isAxisSelected)}
                >
                  {axis.toUpperCase()}
                </button>
              );
            })}
          </div>
          {mode === 'void' && (!validAxes.x || !validAxes.y || !validAxes.z) && (
            <p className="palette-hint-small">Some axes disabled due to open faces</p>
          )}
          {mode === 'two-panel' && (
            <p className="palette-hint-small">Only perpendicular axes available</p>
          )}
        </div>
      )}

      {/* Count controls for each selected axis */}
      {((mode === 'void' && (canSubdivideVoid || isEditMode)) || mode === 'two-panel') && selectedAxes.length > 0 && (
        <>
          {selectedAxes.map(axis => (
            <PaletteSliderInput
              key={axis}
              label={`${axis.toUpperCase()} Divisions`}
              value={axisCounts[axis]}
              min={1}
              max={20}
              step={1}
              onChange={(value) => handleCountChange(axis, value)}
            />
          ))}

          <div className="palette-info">
            <span className="palette-hint">Creates {totalCells} cells</span>
          </div>

          {/* Modification warning */}
          {modificationWarning?.hasWarning && (
            <div className="palette-warning" style={{
              backgroundColor: 'rgba(255, 150, 50, 0.15)',
              border: '1px solid rgba(255, 150, 50, 0.5)',
              borderRadius: '4px',
              padding: '8px',
              marginBottom: '8px'
            }}>
              <span style={{ color: '#fa3' }}>⚠️ {modificationWarning.message}</span>
            </div>
          )}

          <PaletteButtonRow>
            <PaletteButton
              variant="primary"
              onClick={handleApply}
              disabled={!isActive || selectedAxes.length === 0}
            >
              {isEditMode ? 'Update' : 'Apply'}
            </PaletteButton>
            <PaletteButton variant="secondary" onClick={handleCancel}>
              Cancel
            </PaletteButton>
          </PaletteButtonRow>
        </>
      )}

      {/* Show apply/cancel when target exists but no axes selected */}
      {((mode === 'void' && (canSubdivideVoid || isEditMode)) || mode === 'two-panel') && selectedAxes.length === 0 && (
        <PaletteButtonRow>
          <PaletteButton
            variant="primary"
            onClick={handleApply}
            disabled={true}
          >
            Apply
          </PaletteButton>
          <PaletteButton variant="secondary" onClick={handleCancel}>
            Cancel
          </PaletteButton>
        </PaletteButtonRow>
      )}
    </FloatingPalette>
  );
};
