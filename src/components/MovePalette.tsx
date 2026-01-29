import React, { useMemo, useCallback, useRef, useEffect, useState } from 'react';
import { FloatingPalette, PaletteSliderInput, PaletteButton, PaletteButtonRow } from './FloatingPalette';
import { useBoxStore, findVoid } from '../store/useBoxStore';
import { useEnginePanels, useEngineMainVoidTree, getEngine, notifyEngineStateChanged } from '../engine';
import { PanelPath, Void } from '../types';
import { Axis } from '../engine/types';

interface MovePaletteProps {
  visible: boolean;
  position: { x: number; y: number };
  onPositionChange: (position: { x: number; y: number }) => void;
  onClose: () => void;
  containerRef?: React.RefObject<HTMLElement>;
}

// =============================================================================
// Helper functions
// =============================================================================

/**
 * Find the child void that corresponds to a divider at the given position
 * Returns the child void ID and its bounds constraints
 */
function findChildVoidForDivider(
  parentVoid: Void,
  axis: Axis,
  position: number
): { childVoidId: string; minPosition: number; maxPosition: number } | null {
  const tolerance = 0.01;

  // Find child void with matching split info
  for (let i = 0; i < parentVoid.children.length; i++) {
    const child = parentVoid.children[i];
    if (
      child.splitAxis === axis &&
      child.splitPosition !== undefined &&
      Math.abs(child.splitPosition - position) < tolerance
    ) {
      // Found the child void with this divider
      // Calculate position bounds based on adjacent siblings
      const prevSibling = i > 0 ? parentVoid.children[i - 1] : null;
      const nextSibling = i < parentVoid.children.length - 1 ? parentVoid.children[i + 1] : null;

      const dimStart = axis === 'x' ? parentVoid.bounds.x : axis === 'y' ? parentVoid.bounds.y : parentVoid.bounds.z;
      const dimSize = axis === 'x' ? parentVoid.bounds.w : axis === 'y' ? parentVoid.bounds.h : parentVoid.bounds.d;
      const dimEnd = dimStart + dimSize;

      // Get the material thickness from the engine
      const engine = getEngine();
      const snapshot = engine.getSnapshot();
      const assembly = snapshot.children.find(c => c.kind === 'assembly');
      const mt = assembly?.props.material.thickness ?? 3;

      // Min position: after previous divider or start of parent + mt
      let minPosition: number;
      if (prevSibling && prevSibling.splitPosition !== undefined) {
        minPosition = prevSibling.splitPosition + mt;
      } else {
        minPosition = dimStart + mt;
      }

      // Max position: before next divider or end of parent - mt
      let maxPosition: number;
      if (nextSibling && nextSibling.splitPosition !== undefined) {
        maxPosition = nextSibling.splitPosition - mt;
      } else {
        maxPosition = dimEnd - mt;
      }

      return {
        childVoidId: child.id,
        minPosition,
        maxPosition,
      };
    }
  }

  return null;
}

/**
 * Analyze selected panels for move operation validity
 */
interface MoveOperationInfo {
  isValid: boolean;
  panels: PanelPath[];
  axis: Axis | null;
  moves: {
    panel: PanelPath;
    childVoidId: string;
    currentPosition: number;
    minPosition: number;
    maxPosition: number;
  }[];
  errorMessage?: string;
}

function analyzeMoveSelection(
  selectedPanelIds: Set<string>,
  panelCollection: { panels: PanelPath[] } | null,
  voidTree: Void | null
): MoveOperationInfo {
  const invalid: MoveOperationInfo = {
    isValid: false,
    panels: [],
    axis: null,
    moves: [],
  };

  if (selectedPanelIds.size === 0 || !panelCollection || !voidTree) {
    return { ...invalid, errorMessage: 'Select divider panels to move' };
  }

  // Get selected panels
  const panelIds = Array.from(selectedPanelIds);
  const panels = panelIds
    .map(id => panelCollection.panels.find(p => p.id === id))
    .filter((p): p is PanelPath => p !== undefined);

  if (panels.length === 0) {
    return { ...invalid, errorMessage: 'No valid panels selected' };
  }

  // Check all panels are dividers
  const dividerPanels = panels.filter(p => p.source.type === 'divider');
  if (dividerPanels.length === 0) {
    return { ...invalid, panels, errorMessage: 'Select divider panels (not face panels)' };
  }

  if (dividerPanels.length !== panels.length) {
    return { ...invalid, panels, errorMessage: 'Mix of panel types selected' };
  }

  // Check all panels have the same axis
  const axes = new Set(dividerPanels.map(p => p.source.axis));
  if (axes.size > 1) {
    return { ...invalid, panels: dividerPanels, errorMessage: 'All dividers must be on the same axis' };
  }

  const axis = dividerPanels[0].source.axis;
  if (!axis) {
    return { ...invalid, panels: dividerPanels, errorMessage: 'Invalid divider axis' };
  }

  // Build move info for each panel
  const moves: MoveOperationInfo['moves'] = [];

  for (const panel of dividerPanels) {
    const { subdivisionId, axis: panelAxis, position } = panel.source;

    if (!subdivisionId || !panelAxis || position === undefined) {
      continue;
    }

    // Find the parent void
    const parentVoid = findVoid(voidTree, subdivisionId);
    if (!parentVoid) {
      continue;
    }

    // Find the child void for this divider
    const childInfo = findChildVoidForDivider(parentVoid, panelAxis, position);
    if (!childInfo) {
      continue;
    }

    moves.push({
      panel,
      childVoidId: childInfo.childVoidId,
      currentPosition: position,
      minPosition: childInfo.minPosition,
      maxPosition: childInfo.maxPosition,
    });
  }

  if (moves.length === 0) {
    return { ...invalid, panels: dividerPanels, errorMessage: 'Could not find divider info' };
  }

  return {
    isValid: true,
    panels: dividerPanels,
    axis,
    moves,
  };
}

// =============================================================================
// Component
// =============================================================================

export const MovePalette: React.FC<MovePaletteProps> = ({
  visible,
  position,
  onPositionChange,
  onClose,
  containerRef,
}) => {
  // State from engine
  const mainVoidTree = useEngineMainVoidTree();
  const panelCollection = useEnginePanels();

  // UI state from store
  const selectedPanelIds = useBoxStore((state) => state.selectedPanelIds);
  const operationState = useBoxStore((state) => state.operationState);
  const startOperation = useBoxStore((state) => state.startOperation);
  const updateOperationParams = useBoxStore((state) => state.updateOperationParams);
  const applyOperation = useBoxStore((state) => state.applyOperation);
  const cancelOperation = useBoxStore((state) => state.cancelOperation);

  // Track delta position for moving
  const [delta, setDelta] = useState(0);

  // Check if operation is active
  const isActive = operationState.activeOperation === 'move';

  // Cache move info when operation starts (to avoid recalculating during preview)
  const cachedMoveInfoRef = useRef<MoveOperationInfo | null>(null);

  // Analyze selection using main void tree (stable during preview)
  const freshMoveInfo = useMemo(() => {
    return analyzeMoveSelection(selectedPanelIds, panelCollection, mainVoidTree);
  }, [selectedPanelIds, panelCollection, mainVoidTree]);

  // Use cached info during operation, fresh info otherwise
  const moveInfo = isActive && cachedMoveInfoRef.current ? cachedMoveInfoRef.current : freshMoveInfo;

  // Calculate position bounds (intersection of all selected dividers' bounds)
  const positionBounds = useMemo(() => {
    if (!moveInfo.isValid || moveInfo.moves.length === 0) {
      return { min: -50, max: 50 };
    }

    // For a single divider, use its bounds directly
    const firstMove = moveInfo.moves[0];
    let minDelta = firstMove.minPosition - firstMove.currentPosition;
    let maxDelta = firstMove.maxPosition - firstMove.currentPosition;

    // For multiple dividers, use the intersection of their delta ranges
    for (const move of moveInfo.moves.slice(1)) {
      const moveMinDelta = move.minPosition - move.currentPosition;
      const moveMaxDelta = move.maxPosition - move.currentPosition;
      minDelta = Math.max(minDelta, moveMinDelta);
      maxDelta = Math.min(maxDelta, moveMaxDelta);
    }

    return { min: minDelta, max: maxDelta };
  }, [moveInfo]);

  // Auto-start operation when valid selection
  const hasAutoStarted = useRef(false);
  useEffect(() => {
    if (hasAutoStarted.current) return;
    if (!freshMoveInfo.isValid || isActive) return;

    hasAutoStarted.current = true;
    // Cache the move info at the start of the operation
    cachedMoveInfoRef.current = freshMoveInfo;
    setDelta(0);
    startOperation('move');

    // Don't dispatch any preview yet - wait for user to change the slider
  }, [freshMoveInfo.isValid, freshMoveInfo, isActive, startOperation]);

  // Reset auto-start flag and cached info when selection changes or operation ends
  // Use a ref to track previous isActive to only reset when transitioning from active to inactive
  const wasActiveRef = useRef(false);
  useEffect(() => {
    // Only reset when transitioning from active to inactive, not on initial mount
    if (wasActiveRef.current && !isActive) {
      hasAutoStarted.current = false;
      cachedMoveInfoRef.current = null;
      setDelta(0);
    }
    wasActiveRef.current = isActive;
  }, [selectedPanelIds, isActive]);

  // Handle delta change
  const handleDeltaChange = useCallback((newDelta: number) => {
    // Clamp to valid range
    const clampedDelta = Math.max(positionBounds.min, Math.min(positionBounds.max, newDelta));
    setDelta(clampedDelta);

    // Read current operation state directly from store to avoid stale closure
    const currentState = useBoxStore.getState();
    const currentlyActive = currentState.operationState.activeOperation === 'move';

    // Use cached move info (which was saved at operation start)
    const cachedInfo = cachedMoveInfoRef.current;

    if (currentlyActive && cachedInfo && cachedInfo.isValid) {
      // Build moves array with new positions
      const moves = cachedInfo.moves.map(m => ({
        subdivisionId: m.childVoidId,
        newPosition: m.currentPosition + clampedDelta,
      }));

      updateOperationParams({ moves });
    }
  }, [positionBounds, updateOperationParams]);

  // Handle apply
  const handleApply = useCallback(() => {
    if (isActive && delta !== 0) {
      applyOperation();
    }
    onClose();
  }, [isActive, delta, applyOperation, onClose]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    if (isActive) {
      cancelOperation();
    }
    onClose();
  }, [isActive, cancelOperation, onClose]);

  // Clean up preview when palette unmounts
  useEffect(() => {
    return () => {
      const currentState = useBoxStore.getState();
      if (currentState.operationState.activeOperation === 'move') {
        // Don't clean up - let store handle it
        return;
      }
      const engine = getEngine();
      if (engine.hasPreview()) {
        engine.discardPreview();
        notifyEngineStateChanged();
      }
    };
  }, []);

  if (!visible) return null;

  const axisLabel = moveInfo.axis ? moveInfo.axis.toUpperCase() : '';
  const canApply = isActive && delta !== 0 && moveInfo.isValid;

  return (
    <FloatingPalette
      title="Move Divider"
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
        {!moveInfo.isValid ? (
          <p className="palette-hint">{moveInfo.errorMessage}</p>
        ) : (
          <div className="palette-info">
            <span className="palette-label">Selected</span>
            <span className="palette-value">
              {moveInfo.moves.length} {axisLabel}-divider{moveInfo.moves.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* Position slider */}
      {moveInfo.isValid && (
        <>
          <PaletteSliderInput
            label={`Move (${axisLabel} axis)`}
            value={delta}
            min={positionBounds.min}
            max={positionBounds.max}
            step={0.5}
            unit="mm"
            onChange={handleDeltaChange}
          />

          {moveInfo.moves.length === 1 && (
            <div className="palette-info">
              <span className="palette-label">New Position</span>
              <span className="palette-value">
                {(moveInfo.moves[0].currentPosition + delta).toFixed(1)} mm
              </span>
            </div>
          )}

          <PaletteButtonRow>
            <PaletteButton
              variant="primary"
              onClick={handleApply}
              disabled={!canApply}
            >
              Apply
            </PaletteButton>
            <PaletteButton variant="secondary" onClick={handleCancel}>
              Cancel
            </PaletteButton>
          </PaletteButtonRow>
        </>
      )}

      {/* Show cancel when no valid selection */}
      {!moveInfo.isValid && (
        <PaletteButtonRow>
          <PaletteButton variant="secondary" onClick={handleCancel}>
            Cancel
          </PaletteButton>
        </PaletteButtonRow>
      )}
    </FloatingPalette>
  );
};
