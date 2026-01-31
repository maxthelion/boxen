import { Void, Bounds, Subdivision } from '../../types';

// =============================================================================
// Selection Manager
// =============================================================================
//
// Selection has two related concepts:
// 1. Actual Selection - what the user actually selected (assembly, sub-assembly, or panels)
//    This is what operations apply to.
// 2. Visual Selection - which panels should appear selected in the UI
//    When an assembly is selected, all its component panels appear visually selected.
//
// The SelectionManager computes visual selection from actual selection.
// =============================================================================

/**
 * Get the assembly ID that a panel belongs to.
 * - Face panels of main assembly: 'main'
 * - Face panels of sub-assembly: the sub-assembly ID (extracted from panel ID)
 * - Divider panels: 'main' (all dividers belong to main assembly currently)
 */
export const getAssemblyIdForPanel = (panelId: string): string => {
  // Sub-assembly face panel: subasm-{subAssemblyId}-face-{faceId}
  const subAsmMatch = panelId.match(/^subasm-(.+)-face-(front|back|left|right|top|bottom)$/);
  if (subAsmMatch) {
    return subAsmMatch[1];
  }

  // Main assembly face panel (face-{faceId}) or divider panel (divider-...)
  return 'main';
};

/**
 * Selection state from the store (actual selection)
 */
export interface ActualSelection {
  selectedPanelIds: Set<string>;
  selectedAssemblyId: string | null;
  selectedSubAssemblyIds: Set<string>;
}

/**
 * Compute the set of panel IDs that should appear visually selected.
 *
 * Visual selection includes:
 * - Directly selected panels (from selectedPanelIds)
 * - All panels belonging to selected assemblies/sub-assemblies
 *
 * @param selection - The actual selection state from the store
 * @param allPanelIds - All panel IDs currently in the scene
 * @returns Set of panel IDs that should appear visually selected
 */
export const computeVisuallySelectedPanelIds = (
  selection: ActualSelection,
  allPanelIds: string[]
): Set<string> => {
  const visuallySelected = new Set<string>();

  // Add directly selected panels
  for (const panelId of selection.selectedPanelIds) {
    visuallySelected.add(panelId);
  }

  // If an assembly is selected, add all its panels
  if (selection.selectedAssemblyId) {
    for (const panelId of allPanelIds) {
      if (getAssemblyIdForPanel(panelId) === selection.selectedAssemblyId) {
        visuallySelected.add(panelId);
      }
    }
  }

  // Add panels from selected sub-assemblies
  for (const subAsmId of selection.selectedSubAssemblyIds) {
    for (const panelId of allPanelIds) {
      if (getAssemblyIdForPanel(panelId) === subAsmId) {
        visuallySelected.add(panelId);
      }
    }
  }

  return visuallySelected;
};

/**
 * Check if a panel should appear selected in the 3D view.
 *
 * In 3D, we show visual cascade: when an assembly is selected,
 * all its component panels appear selected to show what the assembly contains.
 *
 * The tree view should NOT use this - it shows actual selection only.
 */
export const isPanelSelectedIn3DView = (
  panelId: string,
  selection: ActualSelection
): boolean => {
  // Direct panel selection
  if (selection.selectedPanelIds.has(panelId)) {
    return true;
  }

  // Assembly cascade - panel appears selected if its assembly is selected
  const panelAssemblyId = getAssemblyIdForPanel(panelId);

  if (selection.selectedAssemblyId === panelAssemblyId) {
    return true;
  }

  // Sub-assembly cascade
  if (panelAssemblyId !== 'main' && selection.selectedSubAssemblyIds.has(panelAssemblyId)) {
    return true;
  }

  return false;
};

/**
 * Get all subdivisions (non-leaf voids have split info)
 */
export const getAllSubdivisions = (root: Void): Subdivision[] => {
  const subdivisions: Subdivision[] = [];

  const traverse = (node: Void, parentBounds: Bounds) => {
    if (node.splitAxis && node.splitPosition !== undefined) {
      subdivisions.push({
        id: node.id + '-split',
        axis: node.splitAxis,
        position: node.splitPosition,
        bounds: parentBounds,  // Bounds of the parent void (where the divider can move)
        positionMode: node.splitPositionMode,
        percentage: node.splitPercentage,
      });
    }

    for (const child of (node.children || [])) {
      traverse(child, node.bounds);
    }
  };

  for (const child of (root.children || [])) {
    traverse(child, root.bounds);
  }

  return subdivisions;
};
