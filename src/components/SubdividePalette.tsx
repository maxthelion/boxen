import React, { useMemo, useCallback, useRef, useEffect, useState } from 'react';
import { FloatingPalette, PaletteSliderInput, PaletteButton, PaletteButtonRow } from './FloatingPalette';
import { useBoxStore, findVoid, calculatePreviewPositions, getMainInteriorVoid } from '../store/useBoxStore';
import { useEngineVoidTree, useEngineFaces, useEngineMainVoidTree, useEnginePanels, getEngine, notifyEngineStateChanged } from '../engine';
import { Face, Void, FaceId, PanelPath } from '../types';

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
// Helper functions for void-based subdivision
// =============================================================================

// Determine which axes are valid based on open faces
const getValidAxes = (faces: Face[]): { x: boolean; y: boolean; z: boolean } => {
  const isSolid = (id: string) => faces.find(f => f.id === id)?.solid ?? true;

  // X subdivisions create YZ planes (parallel to left/right faces)
  const xValid = isSolid('left') && isSolid('right');

  // Y subdivisions create XZ planes (parallel to top/bottom faces)
  const yValid = isSolid('top') && isSolid('bottom');

  // Z subdivisions create XY planes (parallel to front/back faces)
  const zValid = isSolid('front') && isSolid('back');

  return { x: xValid, y: yValid, z: zValid };
};

const getAxisTooltip = (axis: 'x' | 'y' | 'z', isValid: boolean): string => {
  if (isValid) {
    switch (axis) {
      case 'x': return 'Split with vertical divider (left-right)';
      case 'y': return 'Split with horizontal shelf (top-bottom)';
      case 'z': return 'Split with vertical divider (front-back)';
    }
  }
  switch (axis) {
    case 'x': return 'Disabled: left or right face is open';
    case 'y': return 'Disabled: top or bottom face is open';
    case 'z': return 'Disabled: front or back face is open';
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
// Helper functions for two-panel subdivision
// =============================================================================

// Get the normal axis for a face (the axis perpendicular to the face plane)
const getFaceNormalAxis = (faceId: FaceId): 'x' | 'y' | 'z' => {
  switch (faceId) {
    case 'left':
    case 'right':
      return 'x';
    case 'top':
    case 'bottom':
      return 'y';
    case 'front':
    case 'back':
      return 'z';
  }
};

// Get the normal axis for any panel (face or divider)
const getPanelNormalAxis = (panel: PanelPath): 'x' | 'y' | 'z' | null => {
  if (panel.source.type === 'face' && panel.source.faceId) {
    return getFaceNormalAxis(panel.source.faceId);
  }
  if (panel.source.type === 'divider' && panel.source.axis) {
    return panel.source.axis;
  }
  return null;
};

// Get the axes perpendicular to a normal axis (valid for subdivision)
const getPerpendicularAxes = (normalAxis: 'x' | 'y' | 'z'): ('x' | 'y' | 'z')[] => {
  switch (normalAxis) {
    case 'x': return ['y', 'z'];
    case 'y': return ['x', 'z'];
    case 'z': return ['x', 'y'];
  }
};

// Get panel description for display
const getPanelDescription = (panel: PanelPath): string => {
  if (panel.source.type === 'face' && panel.source.faceId) {
    const labels: Record<FaceId, string> = {
      front: 'Front', back: 'Back', left: 'Left',
      right: 'Right', top: 'Top', bottom: 'Bottom',
    };
    return labels[panel.source.faceId];
  }
  if (panel.source.type === 'divider') {
    return 'Divider';
  }
  return 'Panel';
};

// Extract void ID from subdivision ID (removes '-split' suffix)
const getVoidIdFromSubdivisionId = (subdivisionId: string): string => {
  return subdivisionId.replace('-split', '');
};

// Find the parent void of a child void by the child's ID
const findParentVoid = (root: Void, childVoidId: string): Void | null => {
  for (const child of root.children) {
    if (child.id === childVoidId) {
      return root;
    }
  }
  for (const child of root.children) {
    const found = findParentVoid(child, childVoidId);
    if (found) return found;
  }
  if (root.subAssembly) {
    const found = findParentVoid(root.subAssembly.rootVoid, childVoidId);
    if (found) return found;
  }
  return null;
};

// Find a leaf void between two parallel panels
const findVoidBetweenPanels = (
  panel1: PanelPath,
  panel2: PanelPath,
  rootVoid: Void
): Void | null => {
  // Case 1: Both are face panels (opposite faces)
  if (panel1.source.type === 'face' && panel2.source.type === 'face') {
    const mainVoid = getMainInteriorVoid(rootVoid);
    if (mainVoid.children.length === 0 && !mainVoid.subAssembly) {
      return mainVoid;
    }
    return null;
  }

  // Case 2: Both are dividers - find the void between them
  if (panel1.source.type === 'divider' && panel2.source.type === 'divider') {
    const subId1 = panel1.source.subdivisionId;
    const subId2 = panel2.source.subdivisionId;
    if (!subId1 || !subId2) return null;

    const voidId1 = getVoidIdFromSubdivisionId(subId1);
    const voidId2 = getVoidIdFromSubdivisionId(subId2);

    const parent1 = findParentVoid(rootVoid, voidId1);
    const parent2 = findParentVoid(rootVoid, voidId2);

    if (!parent1 || !parent2) return null;

    if (parent1.id === parent2.id) {
      const childIds = parent1.children.map(c => c.id);
      const idx1 = childIds.indexOf(voidId1);
      const idx2 = childIds.indexOf(voidId2);

      if (idx1 === -1 || idx2 === -1) return null;

      const minIdx = Math.min(idx1, idx2);
      const maxIdx = Math.max(idx1, idx2);

      if (maxIdx - minIdx === 1) {
        const voidBetween = parent1.children[minIdx];
        if (voidBetween && voidBetween.children.length === 0 && !voidBetween.subAssembly) {
          return voidBetween;
        }
      }
    }
    return null;
  }

  // Case 3: One face, one divider
  if ((panel1.source.type === 'face' && panel2.source.type === 'divider') ||
      (panel1.source.type === 'divider' && panel2.source.type === 'face')) {
    const facePanel = panel1.source.type === 'face' ? panel1 : panel2;
    const dividerPanel = panel1.source.type === 'divider' ? panel1 : panel2;

    const subId = dividerPanel.source.subdivisionId;
    if (!subId) return null;

    const faceId = facePanel.source.faceId;
    const dividerAxis = dividerPanel.source.axis;

    if (!faceId || !dividerAxis) return null;

    const faceAxis = (faceId === 'left' || faceId === 'right') ? 'x' :
                     (faceId === 'top' || faceId === 'bottom') ? 'y' : 'z';

    if (faceAxis !== dividerAxis) return null;

    const mainInterior = getMainInteriorVoid(rootVoid);
    if (mainInterior.children.length === 0) return null;

    const voidId = getVoidIdFromSubdivisionId(subId);
    const childIds = mainInterior.children.map(c => c.id);
    const dividerIdx = childIds.indexOf(voidId);

    if (dividerIdx === -1) return null;

    // Determine which void is between the face and divider
    // The divider sits AFTER children[dividerIdx], between children[dividerIdx] and children[dividerIdx + 1]
    const isLowFace = faceId === 'left' || faceId === 'bottom' || faceId === 'back';

    let targetIdx: number;
    if (isLowFace) {
      // Low face is adjacent to children[0]
      // Void between low face and divider is children[dividerIdx]
      targetIdx = dividerIdx;
    } else {
      // High face is adjacent to children[last]
      // Void between high face and divider is children[dividerIdx + 1]
      targetIdx = dividerIdx + 1;
    }

    if (targetIdx < 0 || targetIdx >= mainInterior.children.length) return null;

    const targetVoid = mainInterior.children[targetIdx];

    if (targetVoid && targetVoid.children.length === 0 && !targetVoid.subAssembly) {
      return targetVoid;
    }
    return null;
  }

  return null;
};

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

  if (selectedPanelIds.size !== 2 || !panelCollection) {
    return invalid;
  }

  const panelIds = Array.from(selectedPanelIds);
  const panels = panelIds
    .map(id => panelCollection.panels.find(p => p.id === id))
    .filter((p): p is PanelPath => p !== undefined);

  if (panels.length !== 2) {
    return invalid;
  }

  const axis1 = getPanelNormalAxis(panels[0]);
  const axis2 = getPanelNormalAxis(panels[1]);

  if (!axis1 || !axis2 || axis1 !== axis2) {
    return invalid;
  }

  if (panels.some(p => p.source.subAssemblyId)) {
    return invalid;
  }

  const normalAxis = axis1;
  const validAxes = getPerpendicularAxes(normalAxis);

  const targetVoid = findVoidBetweenPanels(panels[0], panels[1], rootVoid);

  if (!targetVoid) {
    return invalid;
  }

  const panelDescriptions = panels.map(getPanelDescription);

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

  // Determine if the void can be subdivided
  const isLeafVoid = mainSelectedVoid && mainSelectedVoid.children.length === 0 && !mainSelectedVoid.subAssembly;
  const canSubdivideVoid = !!isLeafVoid;

  // Valid axes based on open faces (for void mode)
  const validAxes = useMemo(() => getValidAxes(faces), [faces]);

  // Local state for count (used before operation starts)
  const [localCount, setLocalCount] = useState(1);

  // Get current operation params
  const opParams = operationState.params as {
    axis?: 'x' | 'y' | 'z';
    count?: number;
    voidId?: string;
  };
  const isActive = operationState.activeOperation === 'subdivide' || operationState.activeOperation === 'subdivide-two-panel';
  const currentAxis = opParams.axis;
  // Use operation count when active, otherwise local count
  const currentCount = isActive ? (opParams.count ?? localCount) : localCount;

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
  }, [mode, twoPanelInfo?.validAxes, validAxes, targetVoidId]);

  // Auto-start operation when there are valid axes available
  // Prefers axis whose dividers touch open faces (can be slotted in)
  const hasAutoStarted = useRef(false);
  useEffect(() => {
    // Only auto-start once per target selection
    if (hasAutoStarted.current) return;

    // Check if we have a valid target that can be subdivided
    const canStart = (mode === 'void' && canSubdivideVoid) || mode === 'two-panel';
    if (!canStart || !targetVoidId || !targetVoid) return;

    // Don't auto-start if operation is already active
    if (isActive) return;

    // Need at least one valid axis
    if (validAxisList.length === 0) return;

    // Select preferred axis based on open faces
    const axis = selectPreferredAxis(validAxisList, faces);

    hasAutoStarted.current = true;

    // Start the operation with the preferred axis
    const positions = calculatePreviewPositions(targetVoid.bounds, axis, localCount);
    const operationType = mode === 'two-panel' ? 'subdivide-two-panel' : 'subdivide';
    startOperation(operationType);
    updateOperationParams({
      voidId: targetVoidId,
      axis,
      count: localCount,
      positions,
    });
  }, [mode, canSubdivideVoid, targetVoidId, targetVoid, isActive, validAxisList, faces, localCount, startOperation, updateOperationParams]);

  // Reset auto-start flag when selection changes
  useEffect(() => {
    hasAutoStarted.current = false;
  }, [selectedVoidId, selectedPanelIds]);

  // Handle axis selection (starts operation if not already started, or changes axis if active)
  const handleAxisSelect = useCallback((axis: 'x' | 'y' | 'z') => {
    if (!targetVoidId || !targetVoid) return;

    // Clear hover state
    isHoverPreviewRef.current = false;

    if (isActive) {
      // Operation already active - just change the axis
      const count = currentCount || 1;
      const positions = calculatePreviewPositions(targetVoid.bounds, axis, count);
      updateOperationParams({
        voidId: targetVoidId,
        axis,
        count,
        positions,
      });
    } else {
      // Start fresh operation with the current local count
      const positions = calculatePreviewPositions(targetVoid.bounds, axis, localCount);
      const operationType = mode === 'two-panel' ? 'subdivide-two-panel' : 'subdivide';
      startOperation(operationType);
      updateOperationParams({
        voidId: targetVoidId,
        axis,
        count: localCount,
        positions,
      });
    }
  }, [targetVoidId, targetVoid, mode, isActive, currentCount, localCount, startOperation, updateOperationParams]);

  // Handle axis hover (show preview)
  const handleAxisHover = useCallback((axis: 'x' | 'y' | 'z') => {
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
                              currentState.operationState.activeOperation === 'subdivide-two-panel';
    if (isOperationActive) return;

    // Only discard if we actually have a hover preview
    if (isHoverPreviewRef.current) {
      isHoverPreviewRef.current = false;
      const engine = getEngine();
      engine.discardPreview();
      notifyEngineStateChanged();
    }
  }, []);

  // Handle count change
  const handleCountChange = useCallback((count: number) => {
    const newCount = Math.max(1, Math.min(20, Math.round(count)));

    // Always update local count
    setLocalCount(newCount);

    // If operation is active with an axis, also update operation params
    if (isActive && currentAxis && targetVoid && targetVoidId) {
      const positions = calculatePreviewPositions(targetVoid.bounds, currentAxis, newCount);
      updateOperationParams({
        voidId: targetVoidId,
        axis: currentAxis,
        count: newCount,
        positions,
      });
    }
  }, [isActive, targetVoid, targetVoidId, currentAxis, updateOperationParams]);

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

  // Track isActive in a ref so cleanup can read current value (not stale closure)
  const isActiveRef = useRef(isActive);
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  // Clean up preview when palette unmounts or selection changes
  useEffect(() => {
    return () => {
      // Only clean up if not in an active operation
      // Use ref to get current value, not stale closure value
      if (!isActiveRef.current) {
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

  return (
    <FloatingPalette
      title="Subdivide"
      position={position}
      onPositionChange={onPositionChange}
      onClose={handleCancel}
      containerRef={containerRef}
      minWidth={200}
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
        ) : !canSubdivideVoid ? (
          <p className="palette-hint">
            {mainSelectedVoid?.children.length && mainSelectedVoid.children.length > 0
              ? 'Cannot subdivide: void has children'
              : mainSelectedVoid?.subAssembly
              ? 'Cannot subdivide: void has sub-assembly'
              : 'Cannot subdivide this void'}
          </p>
        ) : (
          <div className="palette-info">
            <span className="palette-label">Selected Void</span>
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

      {/* Axis selection - shown when valid target exists */}
      {((mode === 'void' && canSubdivideVoid) || mode === 'two-panel') && (
        <div className="palette-section">
          <span className="palette-label">{isActive ? 'Axis' : 'Select Axis'}</span>
          <div className="palette-axis-buttons">
            {(['x', 'y', 'z'] as const).map((axis) => {
              const isValid = mode === 'two-panel'
                ? availableAxes.includes(axis)
                : validAxes[axis];
              const isSelected = isActive && currentAxis === axis;
              return (
                <button
                  key={axis}
                  className={`palette-axis-btn ${isSelected ? 'selected' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAxisSelect(axis);
                  }}
                  onMouseEnter={() => !isActive && isValid && handleAxisHover(axis)}
                  onMouseLeave={() => !isActive && handleAxisLeave()}
                  disabled={!isValid}
                  title={mode === 'two-panel'
                    ? (isValid ? `Split along ${axis.toUpperCase()} axis` : 'Only perpendicular axes available')
                    : getAxisTooltip(axis, isValid)}
                >
                  {axis.toUpperCase()}
                </button>
              );
            })}
          </div>
          {!isActive && mode === 'void' && (!validAxes.x || !validAxes.y || !validAxes.z) && (
            <p className="palette-hint-small">Some axes disabled due to open faces</p>
          )}
          {!isActive && mode === 'two-panel' && (
            <p className="palette-hint-small">Only perpendicular axes available</p>
          )}
        </div>
      )}

      {/* Count control and action buttons - always shown when valid target exists */}
      {((mode === 'void' && canSubdivideVoid) || mode === 'two-panel') && (
        <>
          <PaletteSliderInput
            label="Divisions"
            value={currentCount}
            min={1}
            max={20}
            step={1}
            onChange={handleCountChange}
          />

          <div className="palette-info">
            <span className="palette-hint">Creates {currentCount + 1} cells</span>
          </div>

          <PaletteButtonRow>
            <PaletteButton
              variant="primary"
              onClick={handleApply}
              disabled={!isActive || !currentAxis}
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
