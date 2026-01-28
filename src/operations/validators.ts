/**
 * Operation Validators - Declarative validation system for operation selection rules
 *
 * This module provides:
 * 1. SelectionRequirement - Describes what an operation needs selected
 * 2. ValidationResult - Result of validating a selection
 * 3. Validator functions for each operation
 * 4. Helper functions for common validation patterns
 */

import { FaceId, Axis } from '../engine/types';
import { Void, PanelPath, Face } from '../types';
import { OperationId } from './types';

// =============================================================================
// Selection Requirement Types
// =============================================================================

/**
 * Types of selection targets
 */
export type SelectionTargetType =
  | 'void'           // A single void
  | 'leaf-void'      // A void with no children and no sub-assembly
  | 'panel'          // Any panel (face or divider)
  | 'face-panel'     // A face panel specifically
  | 'parallel-panels' // Two panels with the same normal axis
  | 'opposing-panels' // Two panels that are opposing (e.g., left & right, or two adjacent dividers)
  | 'corner'         // A corner of a panel (for chamfer/fillet)
  | 'assembly'       // An assembly or sub-assembly
  | 'none';          // No selection required

/**
 * Describes what selection an operation requires
 */
export interface SelectionRequirement {
  /** Primary selection target type */
  targetType: SelectionTargetType;
  /** Minimum number of items required */
  minCount: number;
  /** Maximum number of items allowed (Infinity for unlimited) */
  maxCount: number;
  /** Human-readable description of the requirement */
  description: string;
  /** Additional constraints (optional) */
  constraints?: SelectionConstraint[];
}

/**
 * Additional constraints on selections
 */
export type SelectionConstraint =
  | { type: 'must-be-leaf-void' }
  | { type: 'must-be-parallel-panels' }
  | { type: 'must-have-void-between'; description: string }
  | { type: 'must-be-main-assembly-panels' }
  | { type: 'panels-must-be-opposing' }
  | { type: 'panels-same-axis' };

// =============================================================================
// Validation Result Types
// =============================================================================

/**
 * Result of validating a selection for an operation
 */
export interface SelectionValidationResult {
  /** Whether the selection is valid */
  valid: boolean;
  /** Reason for invalid selection */
  reason?: string;
  /** Derived state from valid selection */
  derived?: DerivedSelectionState;
}

/**
 * Derived state computed from a valid selection
 */
export interface DerivedSelectionState {
  /** Target void for operations that need one */
  targetVoid?: Void;
  /** Target void ID */
  targetVoidId?: string;
  /** Valid subdivision axes */
  validAxes?: Axis[];
  /** Normal axis of selected panels */
  normalAxis?: Axis;
  /** Selected panels */
  panels?: PanelPath[];
  /** Description of selected panels */
  panelDescriptions?: string[];
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the normal axis of a face (perpendicular to the face plane)
 */
export const getFaceNormalAxis = (faceId: FaceId): Axis => {
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

/**
 * Get the normal axis of any panel (face or divider)
 */
export const getPanelNormalAxis = (panel: PanelPath): Axis | null => {
  if (panel.source.type === 'face' && panel.source.faceId) {
    return getFaceNormalAxis(panel.source.faceId);
  }
  if (panel.source.type === 'divider' && panel.source.axis) {
    return panel.source.axis;
  }
  return null;
};

/**
 * Get axes perpendicular to a given axis
 */
export const getPerpendicularAxes = (axis: Axis): Axis[] => {
  switch (axis) {
    case 'x': return ['y', 'z'];
    case 'y': return ['x', 'z'];
    case 'z': return ['x', 'y'];
  }
};

/**
 * Check if two face IDs are opposing (on same axis but opposite sides)
 */
export const areOpposingFaces = (face1: FaceId, face2: FaceId): boolean => {
  const pairs: [FaceId, FaceId][] = [
    ['left', 'right'],
    ['top', 'bottom'],
    ['front', 'back'],
  ];
  return pairs.some(([a, b]) =>
    (face1 === a && face2 === b) || (face1 === b && face2 === a)
  );
};

/**
 * Get human-readable description for a panel
 */
export const getPanelDescription = (panel: PanelPath): string => {
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

/**
 * Find a void by ID in a void tree
 */
export const findVoidById = (root: Void, id: string): Void | null => {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findVoidById(child, id);
    if (found) return found;
  }
  if (root.subAssembly?.rootVoid) {
    const found = findVoidById(root.subAssembly.rootVoid, id);
    if (found) return found;
  }
  return null;
};

/**
 * Check if a void is a leaf (no children and no sub-assembly)
 */
export const isLeafVoid = (voidNode: Void): boolean => {
  return voidNode.children.length === 0 && !voidNode.subAssembly;
};

/**
 * Get the main interior void (root or first level with bounds)
 */
export const getMainInteriorVoid = (rootVoid: Void): Void => {
  // If root has no children, it's the main interior
  if (rootVoid.children.length === 0) {
    return rootVoid;
  }
  // Otherwise return root itself (children are subdivisions)
  return rootVoid;
};

/**
 * Extract void ID from subdivision ID (removes position suffix)
 */
const getVoidIdFromSubdivisionId = (subdivisionId: string): string => {
  // Format is divider-{voidId}-{axis}-{position}
  // We need to extract the voidId
  const parts = subdivisionId.split('-');
  if (parts.length >= 3 && parts[0] === 'divider') {
    // Handle old format: divider-{voidId}-split
    if (parts[parts.length - 1] === 'split') {
      return parts.slice(1, -1).join('-');
    }
    // Handle new format: divider-{voidId}-{axis}-{position}
    // voidId might contain hyphens, so we need to be careful
    // Axis is single char (x, y, z) and position is a number
    if (parts.length >= 4) {
      const lastPart = parts[parts.length - 1];
      const secondLastPart = parts[parts.length - 2];
      if (['x', 'y', 'z'].includes(secondLastPart) && !isNaN(Number(lastPart))) {
        return parts.slice(1, -2).join('-');
      }
    }
  }
  return subdivisionId;
};

/**
 * Find the parent void of a child void
 */
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
  if (root.subAssembly?.rootVoid) {
    const found = findParentVoid(root.subAssembly.rootVoid, childVoidId);
    if (found) return found;
  }
  return null;
};

/**
 * Find the leaf void between two parallel panels
 */
export const findVoidBetweenPanels = (
  panel1: PanelPath,
  panel2: PanelPath,
  rootVoid: Void
): Void | null => {
  // Case 1: Both are face panels (opposite faces)
  if (panel1.source.type === 'face' && panel2.source.type === 'face') {
    const faceId1 = panel1.source.faceId;
    const faceId2 = panel2.source.faceId;

    if (!faceId1 || !faceId2) return null;

    // Must be opposing faces
    if (!areOpposingFaces(faceId1, faceId2)) return null;

    const mainVoid = getMainInteriorVoid(rootVoid);
    if (isLeafVoid(mainVoid)) {
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

    // Both dividers must be children of the same parent
    if (parent1.id !== parent2.id) return null;

    const childIds = parent1.children.map(c => c.id);
    const idx1 = childIds.indexOf(voidId1);
    const idx2 = childIds.indexOf(voidId2);

    if (idx1 === -1 || idx2 === -1) return null;

    const minIdx = Math.min(idx1, idx2);
    const maxIdx = Math.max(idx1, idx2);

    // Dividers must be adjacent (exactly one void between them)
    if (maxIdx - minIdx !== 1) return null;

    const voidBetween = parent1.children[minIdx];
    if (voidBetween && isLeafVoid(voidBetween)) {
      return voidBetween;
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

    // Face and divider must be on the same axis
    const faceAxis = getFaceNormalAxis(faceId);
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
      // Void between low face and divider is children[dividerIdx] (the void just before the divider)
      targetIdx = dividerIdx;
    } else {
      // High face is adjacent to children[last]
      // Void between high face and divider is children[dividerIdx + 1] (the void just after the divider)
      targetIdx = dividerIdx + 1;
    }

    if (targetIdx < 0 || targetIdx >= mainInterior.children.length) return null;

    const targetVoid = mainInterior.children[targetIdx];

    if (targetVoid && isLeafVoid(targetVoid)) {
      return targetVoid;
    }
    return null;
  }

  return null;
};

/**
 * Determine which axes are valid for subdivision based on open faces
 */
export const getValidSubdivisionAxes = (faces: Face[]): { x: boolean; y: boolean; z: boolean } => {
  const isSolid = (id: FaceId) => faces.find(f => f.id === id)?.solid ?? true;

  // X subdivisions create YZ planes (parallel to left/right faces)
  const xValid = isSolid('left') && isSolid('right');

  // Y subdivisions create XZ planes (parallel to top/bottom faces)
  const yValid = isSolid('top') && isSolid('bottom');

  // Z subdivisions create XY planes (parallel to front/back faces)
  const zValid = isSolid('front') && isSolid('back');

  return { x: xValid, y: yValid, z: zValid };
};

// =============================================================================
// Operation-Specific Validators
// =============================================================================

/**
 * Validate selection for subdivide operation (single void)
 */
export const validateSubdivideSelection = (
  selectedVoidIds: Set<string>,
  rootVoid: Void | null,
  faces: Face[]
): SelectionValidationResult => {
  if (!rootVoid) {
    return { valid: false, reason: 'No void tree available' };
  }

  if (selectedVoidIds.size === 0) {
    return { valid: false, reason: 'Select a void to subdivide' };
  }

  if (selectedVoidIds.size > 1) {
    return { valid: false, reason: 'Select only one void' };
  }

  const voidId = Array.from(selectedVoidIds)[0];
  const targetVoid = findVoidById(rootVoid, voidId);

  if (!targetVoid) {
    return { valid: false, reason: 'Selected void not found' };
  }

  if (!isLeafVoid(targetVoid)) {
    if (targetVoid.children.length > 0) {
      return { valid: false, reason: 'Cannot subdivide: void already has subdivisions' };
    }
    if (targetVoid.subAssembly) {
      return { valid: false, reason: 'Cannot subdivide: void contains a sub-assembly' };
    }
  }

  // Get valid axes
  const validAxesMap = getValidSubdivisionAxes(faces);
  const validAxes: Axis[] = [];
  if (validAxesMap.x) validAxes.push('x');
  if (validAxesMap.y) validAxes.push('y');
  if (validAxesMap.z) validAxes.push('z');

  if (validAxes.length === 0) {
    return { valid: false, reason: 'No valid axes: all opposing faces are open' };
  }

  return {
    valid: true,
    derived: {
      targetVoid,
      targetVoidId: voidId,
      validAxes,
    },
  };
};

/**
 * Validate selection for subdivide-two-panel operation
 */
export const validateSubdivideTwoPanelSelection = (
  selectedPanelIds: Set<string>,
  panelCollection: { panels: PanelPath[] } | null,
  rootVoid: Void | null
): SelectionValidationResult => {
  if (!rootVoid) {
    return { valid: false, reason: 'No void tree available' };
  }

  if (!panelCollection) {
    return { valid: false, reason: 'No panels available' };
  }

  if (selectedPanelIds.size < 2) {
    return { valid: false, reason: 'Select two parallel panels' };
  }

  if (selectedPanelIds.size > 2) {
    return { valid: false, reason: 'Select exactly two panels' };
  }

  const panelIds = Array.from(selectedPanelIds);
  const panels = panelIds
    .map(id => panelCollection.panels.find(p => p.id === id))
    .filter((p): p is PanelPath => p !== undefined);

  if (panels.length !== 2) {
    return { valid: false, reason: 'Could not find selected panels' };
  }

  // Check that both panels are from the main assembly (not sub-assemblies)
  if (panels.some(p => p.source.subAssemblyId)) {
    return { valid: false, reason: 'Sub-assembly panels cannot be used for subdivision' };
  }

  // Get normal axes of both panels
  const axis1 = getPanelNormalAxis(panels[0]);
  const axis2 = getPanelNormalAxis(panels[1]);

  if (!axis1 || !axis2) {
    return { valid: false, reason: 'Could not determine panel orientations' };
  }

  if (axis1 !== axis2) {
    return { valid: false, reason: 'Panels must be parallel (same orientation)' };
  }

  const normalAxis = axis1;

  // Check if panels are opposing (have a void between them)
  const targetVoid = findVoidBetweenPanels(panels[0], panels[1], rootVoid);

  if (!targetVoid) {
    // Provide specific error messages based on panel types
    if (panels[0].source.type === 'face' && panels[1].source.type === 'face') {
      const faceId1 = panels[0].source.faceId;
      const faceId2 = panels[1].source.faceId;
      if (faceId1 && faceId2 && !areOpposingFaces(faceId1, faceId2)) {
        return { valid: false, reason: 'Face panels must be opposing (e.g., Left & Right)' };
      }
      return { valid: false, reason: 'No empty void between the selected faces' };
    }
    if (panels[0].source.type === 'divider' && panels[1].source.type === 'divider') {
      return { valid: false, reason: 'Dividers must be adjacent with an empty void between them' };
    }
    return { valid: false, reason: 'No empty void found between selected panels' };
  }

  // Get valid subdivision axes (perpendicular to the panel normal)
  const validAxes = getPerpendicularAxes(normalAxis);

  const panelDescriptions = panels.map(getPanelDescription);

  return {
    valid: true,
    derived: {
      targetVoid,
      targetVoidId: targetVoid.id,
      validAxes,
      normalAxis,
      panels,
      panelDescriptions,
    },
  };
};

/**
 * Validate selection for push-pull operation
 */
export const validatePushPullSelection = (
  selectedPanelIds: Set<string>,
  panelCollection: { panels: PanelPath[] } | null
): SelectionValidationResult => {
  if (!panelCollection) {
    return { valid: false, reason: 'No panels available' };
  }

  if (selectedPanelIds.size === 0) {
    return { valid: false, reason: 'Select a face panel to push or pull' };
  }

  if (selectedPanelIds.size > 1) {
    return { valid: false, reason: 'Select only one panel' };
  }

  const panelId = Array.from(selectedPanelIds)[0];
  const panel = panelCollection.panels.find(p => p.id === panelId);

  if (!panel) {
    return { valid: false, reason: 'Selected panel not found' };
  }

  if (panel.source.type !== 'face') {
    return { valid: false, reason: 'Only face panels can be pushed or pulled' };
  }

  if (panel.source.subAssemblyId) {
    return { valid: false, reason: 'Sub-assembly panels cannot be pushed or pulled' };
  }

  return {
    valid: true,
    derived: {
      panels: [panel],
      panelDescriptions: [getPanelDescription(panel)],
    },
  };
};

/**
 * Validate selection for create-sub-assembly operation
 */
export const validateCreateSubAssemblySelection = (
  selectedVoidIds: Set<string>,
  rootVoid: Void | null
): SelectionValidationResult => {
  if (!rootVoid) {
    return { valid: false, reason: 'No void tree available' };
  }

  if (selectedVoidIds.size === 0) {
    return { valid: false, reason: 'Select a void to create a sub-assembly in' };
  }

  if (selectedVoidIds.size > 1) {
    return { valid: false, reason: 'Select only one void' };
  }

  const voidId = Array.from(selectedVoidIds)[0];
  const targetVoid = findVoidById(rootVoid, voidId);

  if (!targetVoid) {
    return { valid: false, reason: 'Selected void not found' };
  }

  if (!isLeafVoid(targetVoid)) {
    if (targetVoid.children.length > 0) {
      return { valid: false, reason: 'Cannot create sub-assembly: void has subdivisions' };
    }
    if (targetVoid.subAssembly) {
      return { valid: false, reason: 'Void already contains a sub-assembly' };
    }
  }

  return {
    valid: true,
    derived: {
      targetVoid,
      targetVoidId: voidId,
    },
  };
};

/**
 * Validate selection for toggle-face operation
 */
export const validateToggleFaceSelection = (
  selectedPanelIds: Set<string>,
  panelCollection: { panels: PanelPath[] } | null
): SelectionValidationResult => {
  if (!panelCollection) {
    return { valid: false, reason: 'No panels available' };
  }

  if (selectedPanelIds.size === 0) {
    return { valid: false, reason: 'Select a face panel to toggle' };
  }

  if (selectedPanelIds.size > 1) {
    return { valid: false, reason: 'Select only one panel' };
  }

  const panelId = Array.from(selectedPanelIds)[0];
  const panel = panelCollection.panels.find(p => p.id === panelId);

  if (!panel) {
    return { valid: false, reason: 'Selected panel not found' };
  }

  if (panel.source.type !== 'face') {
    return { valid: false, reason: 'Only face panels can be toggled' };
  }

  return {
    valid: true,
    derived: {
      panels: [panel],
    },
  };
};

// =============================================================================
// Selection Requirements by Operation
// =============================================================================

/**
 * Get selection requirements for an operation
 */
export const getSelectionRequirements = (operationId: OperationId): SelectionRequirement => {
  switch (operationId) {
    case 'subdivide':
      return {
        targetType: 'leaf-void',
        minCount: 1,
        maxCount: 1,
        description: 'Select an empty void to subdivide',
        constraints: [{ type: 'must-be-leaf-void' }],
      };

    case 'subdivide-two-panel':
      return {
        targetType: 'opposing-panels',
        minCount: 2,
        maxCount: 2,
        description: 'Select two opposing panels (faces or adjacent dividers)',
        constraints: [
          { type: 'must-be-parallel-panels' },
          { type: 'must-have-void-between', description: 'An empty void must exist between the panels' },
          { type: 'must-be-main-assembly-panels' },
        ],
      };

    case 'push-pull':
      return {
        targetType: 'face-panel',
        minCount: 1,
        maxCount: 1,
        description: 'Select a face panel to push or pull',
        constraints: [{ type: 'must-be-main-assembly-panels' }],
      };

    case 'create-sub-assembly':
      return {
        targetType: 'leaf-void',
        minCount: 1,
        maxCount: 1,
        description: 'Select an empty void to create a sub-assembly in',
        constraints: [{ type: 'must-be-leaf-void' }],
      };

    case 'chamfer-fillet':
      return {
        targetType: 'corner',
        minCount: 1,
        maxCount: Infinity,
        description: 'Select corners to chamfer or fillet',
      };

    case 'toggle-face':
      return {
        targetType: 'face-panel',
        minCount: 1,
        maxCount: 1,
        description: 'Select a face panel to toggle open/closed',
      };

    case 'remove-subdivision':
      return {
        targetType: 'void',
        minCount: 1,
        maxCount: 1,
        description: 'Select a void to remove its subdivision',
      };

    case 'remove-sub-assembly':
      return {
        targetType: 'void',
        minCount: 1,
        maxCount: 1,
        description: 'Select a void to remove its sub-assembly',
      };

    case 'edit-in-2d':
      return {
        targetType: 'panel',
        minCount: 1,
        maxCount: 1,
        description: 'Select a panel to edit in 2D view',
      };

    default:
      return {
        targetType: 'none',
        minCount: 0,
        maxCount: 0,
        description: 'Unknown operation',
      };
  }
};

// =============================================================================
// Unified Validation Function
// =============================================================================

export interface ValidationContext {
  selectedVoidIds: Set<string>;
  selectedPanelIds: Set<string>;
  panelCollection: { panels: PanelPath[] } | null;
  rootVoid: Void | null;
  faces: Face[];
}

/**
 * Validate selection for any operation
 */
export const validateSelection = (
  operationId: OperationId,
  context: ValidationContext
): SelectionValidationResult => {
  switch (operationId) {
    case 'subdivide':
      return validateSubdivideSelection(
        context.selectedVoidIds,
        context.rootVoid,
        context.faces
      );

    case 'subdivide-two-panel':
      return validateSubdivideTwoPanelSelection(
        context.selectedPanelIds,
        context.panelCollection,
        context.rootVoid
      );

    case 'push-pull':
      return validatePushPullSelection(
        context.selectedPanelIds,
        context.panelCollection
      );

    case 'create-sub-assembly':
      return validateCreateSubAssemblySelection(
        context.selectedVoidIds,
        context.rootVoid
      );

    case 'toggle-face':
      return validateToggleFaceSelection(
        context.selectedPanelIds,
        context.panelCollection
      );

    // For operations without specific validators, return valid with no derived state
    case 'remove-subdivision':
    case 'remove-sub-assembly':
    case 'edit-in-2d':
    case 'chamfer-fillet':
      return { valid: true };

    default:
      return { valid: false, reason: 'Unknown operation' };
  }
};
