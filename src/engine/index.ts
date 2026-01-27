/**
 * Engine Module - Public API
 *
 * This module exports the OO model engine for the box designer.
 * The engine provides:
 * - Class-based model (authoritative state)
 * - Serializable snapshots (for React rendering)
 * - Action-based updates (for undo/redo support)
 */

// Main entry point
export { Engine, createEngine, createEngineWithAssembly } from './Engine';

// Singleton instance
export {
  getEngine,
  resetEngine,
  syncStoreToEngine,
  getEngineVoidTree,
  ensureEngineInitialized,
  getEngineConfig,
  getEngineFaces,
  getEngineSnapshot,
  dispatchToEngine,
} from './engineInstance';

// State snapshot types
export type { EngineStateSnapshot, DispatchResult } from './engineInstance';

// React integration
export { useEngine, useEngineInstance } from './useEngine';

// Panel generation bridge
export {
  generatePanelsForAssembly,
  generatePanelsForScene,
  generatePanelsWithVoid,
  voidNodeToVoid,
  syncVoidNodeFromStoreVoid,
} from './panelBridge';

// Node classes
export { BaseNode, generateId, resetIdCounter } from './nodes/BaseNode';
export { BaseAssembly } from './nodes/BaseAssembly';
export { BasePanel } from './nodes/BasePanel';
export { AssemblyNode } from './nodes/AssemblyNode';
export { SubAssemblyNode } from './nodes/SubAssemblyNode';
export { VoidNode } from './nodes/VoidNode';
export { FacePanelNode } from './nodes/FacePanelNode';
export { DividerPanelNode } from './nodes/DividerPanelNode';
export { SceneNode } from './nodes/SceneNode';

// Alignment debug utilities
export {
  startAlignmentDebug,
  addJointAlignmentError,
  addVoidAlignmentError,
  formatAlignmentDebugLog,
  hasAlignmentErrors,
  getAlignmentErrorCount,
  clearAlignmentDebug,
  getAlignmentDebugLog,
  ALIGNMENT_TOLERANCE,
  pointsAligned,
  calculateDeviation,
} from './alignmentDebug';

// Types
export * from './types';
