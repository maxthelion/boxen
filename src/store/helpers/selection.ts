import { Void, Bounds, Subdivision, PanelPath, PanelSource } from '../../types';

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
 * Get the assembly ID that a panel belongs to from its source properties.
 * - Face panels of main assembly: 'main'
 * - Face panels of sub-assembly: the sub-assembly ID
 * - Divider panels: 'main' (all dividers belong to main assembly currently)
 */
export const getAssemblyIdFromSource = (source: PanelSource): string => {
  return source.subAssemblyId ?? 'main';
};

/**
 * Get the assembly ID that a panel belongs to.
 * Uses the panel's source properties (not string parsing).
 */
export const getAssemblyIdFromPanel = (panel: PanelPath): string => {
  return getAssemblyIdFromSource(panel.source);
};

/**
 * Get the assembly ID for a panel ID.
 * Requires a panel lookup to find the panel by ID.
 * Returns 'main' if panel is not found.
 *
 * @deprecated Prefer getAssemblyIdFromPanel when you have the panel object
 */
export const getAssemblyIdForPanel = (
  panelId: string,
  panels?: PanelPath[]
): string => {
  if (!panels) {
    // Fallback: try to parse legacy semantic IDs (for backwards compatibility)
    const subAsmMatch = panelId.match(/^subasm-(.+)-face-(front|back|left|right|top|bottom)$/);
    if (subAsmMatch) {
      return subAsmMatch[1];
    }
    return 'main';
  }

  const panel = panels.find(p => p.id === panelId);
  return panel ? getAssemblyIdFromPanel(panel) : 'main';
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
 * @param panels - All panels currently in the scene
 * @returns Set of panel IDs that should appear visually selected
 */
export const computeVisuallySelectedPanelIds = (
  selection: ActualSelection,
  panels: PanelPath[]
): Set<string> => {
  const visuallySelected = new Set<string>();

  // Add directly selected panels
  for (const panelId of selection.selectedPanelIds) {
    visuallySelected.add(panelId);
  }

  // If an assembly is selected, add all its panels
  if (selection.selectedAssemblyId) {
    for (const panel of panels) {
      if (getAssemblyIdFromPanel(panel) === selection.selectedAssemblyId) {
        visuallySelected.add(panel.id);
      }
    }
  }

  // Add panels from selected sub-assemblies
  for (const subAsmId of selection.selectedSubAssemblyIds) {
    for (const panel of panels) {
      if (getAssemblyIdFromPanel(panel) === subAsmId) {
        visuallySelected.add(panel.id);
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
 *
 * @param panel - The panel to check (or just panelId if panels array not provided)
 * @param selection - The actual selection state
 * @param panels - Optional: all panels for assembly lookup (required for UUID panel IDs)
 */
export const isPanelSelectedIn3DView = (
  panelOrId: PanelPath | string,
  selection: ActualSelection,
  panels?: PanelPath[]
): boolean => {
  const panelId = typeof panelOrId === 'string' ? panelOrId : panelOrId.id;
  const panel = typeof panelOrId === 'string'
    ? panels?.find(p => p.id === panelOrId)
    : panelOrId;

  // Direct panel selection
  if (selection.selectedPanelIds.has(panelId)) {
    return true;
  }

  // Assembly cascade - panel appears selected if its assembly is selected
  const panelAssemblyId = panel ? getAssemblyIdFromPanel(panel) : 'main';

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
