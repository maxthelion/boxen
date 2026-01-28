/**
 * useOperationPalette - Shared hook for operation palette lifecycle
 *
 * Handles the common pattern of:
 * - Starting an operation with initial params
 * - Updating params (triggers preview)
 * - Applying (commits preview)
 * - Canceling (discards preview)
 */

import { useCallback, useEffect, useRef } from 'react';
import { useBoxStore } from '../store/useBoxStore';
import { OperationId } from '../types';
import { getEngine, notifyEngineStateChanged } from '../engine';

export interface UseOperationPaletteOptions {
  /** The operation ID this palette controls */
  operationId: OperationId;
  /**
   * Called when the operation is applied successfully.
   * Use this for cleanup like closing the palette.
   */
  onApply?: () => void;
  /**
   * Called when the operation is canceled.
   * Use this for cleanup like closing the palette.
   */
  onCancel?: () => void;
}

export interface UseOperationPaletteResult<TParams extends Record<string, unknown>> {
  /** Whether this operation is currently active */
  isActive: boolean;
  /** Current operation parameters */
  params: Partial<TParams>;
  /** Update operation parameters (triggers preview if operation is active) */
  updateParams: (newParams: Partial<TParams>) => void;
  /** Start the operation with initial parameters */
  start: (initialParams: Partial<TParams>) => void;
  /** Apply the operation (commit preview) */
  apply: () => void;
  /** Cancel the operation (discard preview) */
  cancel: () => void;
  /** Start operation if not active, otherwise update params */
  startOrUpdate: (newParams: Partial<TParams>) => void;
}

export function useOperationPalette<TParams extends Record<string, unknown>>(
  options: UseOperationPaletteOptions
): UseOperationPaletteResult<TParams> {
  const { operationId, onApply, onCancel } = options;

  // Get store state and actions
  const operationState = useBoxStore((state) => state.operationState);
  const startOperation = useBoxStore((state) => state.startOperation);
  const updateOperationParams = useBoxStore((state) => state.updateOperationParams);
  const applyOperation = useBoxStore((state) => state.applyOperation);
  const cancelOperation = useBoxStore((state) => state.cancelOperation);

  // Track if this operation is active
  const isActive = operationState.activeOperation === operationId;
  const params = (isActive ? operationState.params : {}) as Partial<TParams>;

  // Track pending params for hover previews (before operation starts)
  const pendingParamsRef = useRef<Partial<TParams> | null>(null);

  // Start the operation
  const start = useCallback(
    (initialParams: Partial<TParams>) => {
      if (isActive) return; // Already active

      startOperation(operationId);
      if (Object.keys(initialParams).length > 0) {
        updateOperationParams(initialParams as Record<string, unknown>);
      }
    },
    [isActive, operationId, startOperation, updateOperationParams]
  );

  // Update params (only if active)
  const updateParams = useCallback(
    (newParams: Partial<TParams>) => {
      if (!isActive) {
        // Store pending params for when operation starts
        pendingParamsRef.current = { ...pendingParamsRef.current, ...newParams };
        return;
      }
      updateOperationParams(newParams as Record<string, unknown>);
    },
    [isActive, updateOperationParams]
  );

  // Start if not active, otherwise update
  const startOrUpdate = useCallback(
    (newParams: Partial<TParams>) => {
      if (isActive) {
        updateOperationParams(newParams as Record<string, unknown>);
      } else {
        start(newParams);
      }
    },
    [isActive, start, updateOperationParams]
  );

  // Apply the operation
  const apply = useCallback(() => {
    if (!isActive) return;
    applyOperation();
    onApply?.();
  }, [isActive, applyOperation, onApply]);

  // Cancel the operation
  const cancel = useCallback(() => {
    if (isActive) {
      cancelOperation();
    } else {
      // Clean up any hover preview if not active
      const engine = getEngine();
      if (engine.hasPreview()) {
        engine.discardPreview();
        notifyEngineStateChanged();
      }
    }
    onCancel?.();
  }, [isActive, cancelOperation, onCancel]);

  // Clean up on unmount - only if operation isn't active
  useEffect(() => {
    return () => {
      // Check current state directly to avoid closure issues
      const currentState = useBoxStore.getState();
      const isStillActive = currentState.operationState.activeOperation === operationId;

      if (!isStillActive) {
        const engine = getEngine();
        if (engine.hasPreview()) {
          engine.discardPreview();
          notifyEngineStateChanged();
        }
      }
    };
  }, [operationId]);

  return {
    isActive,
    params,
    updateParams,
    start,
    apply,
    cancel,
    startOrUpdate,
  };
}
