/**
 * Panel ID Utilities
 *
 * Centralized utilities for creating and parsing panel IDs.
 * This ensures consistent ID formats across the codebase.
 *
 * ID Formats:
 * - Face panels: `face-{faceId}` (e.g., `face-front`, `face-top`)
 * - Sub-assembly face panels: `{subAssemblyId}-face-{faceId}` (e.g., `sub123-face-front`)
 * - Divider panels: `divider-{voidId}-{axis}-{position}` (e.g., `divider-abc123-x-50`)
 * - Divider slots: `divider-slot-{subdivisionId}-{index}` (for holes in face panels)
 */

import { FaceId } from '../types';

// =============================================================================
// Face Panel IDs
// =============================================================================

/**
 * Create a face panel ID
 */
export function createFacePanelId(faceId: FaceId, subAssemblyId?: string): string {
  if (subAssemblyId) {
    return `${subAssemblyId}-face-${faceId}`;
  }
  return `face-${faceId}`;
}

/**
 * Parse a face panel ID to extract the faceId and optional subAssemblyId
 * Returns null if the ID is not a valid face panel ID
 */
export function parseFacePanelId(panelId: string): { faceId: FaceId; subAssemblyId?: string } | null {
  // Sub-assembly face panel: {subAssemblyId}-face-{faceId}
  const subAsmMatch = panelId.match(/^(.+)-face-(front|back|left|right|top|bottom)$/);
  if (subAsmMatch) {
    return {
      subAssemblyId: subAsmMatch[1],
      faceId: subAsmMatch[2] as FaceId,
    };
  }

  // Main assembly face panel: face-{faceId}
  const mainMatch = panelId.match(/^face-(front|back|left|right|top|bottom)$/);
  if (mainMatch) {
    return {
      faceId: mainMatch[1] as FaceId,
    };
  }

  return null;
}

/**
 * Check if a panel ID is a face panel
 */
export function isFacePanelId(panelId: string): boolean {
  return parseFacePanelId(panelId) !== null;
}

// =============================================================================
// Divider Panel IDs
// =============================================================================

/**
 * Create a divider panel ID
 */
export function createDividerPanelId(
  voidId: string,
  axis: 'x' | 'y' | 'z',
  position: number
): string {
  return `divider-${voidId}-${axis}-${position}`;
}

/**
 * Parse a divider panel ID to extract the voidId, axis, and position
 * Returns null if the ID is not a valid divider panel ID
 */
export function parseDividerPanelId(panelId: string): {
  voidId: string;
  axis: 'x' | 'y' | 'z';
  position: number;
} | null {
  // New format: divider-{voidId}-{axis}-{position}
  // The axis must be x, y, or z, and position must be a number
  const match = panelId.match(/^divider-(.+)-(x|y|z)-(-?\d+(?:\.\d+)?)$/);
  if (match) {
    return {
      voidId: match[1],
      axis: match[2] as 'x' | 'y' | 'z',
      position: parseFloat(match[3]),
    };
  }

  // Legacy format: divider-{voidId}-split (for backwards compatibility)
  // We can't extract axis/position from this format, but we can get the voidId
  const legacyMatch = panelId.match(/^divider-(.+)-split$/);
  if (legacyMatch) {
    // Return with undefined axis/position to indicate legacy format
    // Note: This should only be used for parsing, not for creating new IDs
    console.warn(`[panelIds] Legacy divider ID format detected: ${panelId}. Consider updating to new format.`);
    return null; // Return null since we can't fully parse it
  }

  return null;
}

/**
 * Check if a panel ID is a divider panel
 */
export function isDividerPanelId(panelId: string): boolean {
  return panelId.startsWith('divider-') && !panelId.includes('-slot-');
}

/**
 * Extract the voidId from a divider panel ID (supports both old and new formats)
 * This is a more lenient parser that just gets the voidId
 */
export function getVoidIdFromDividerPanelId(panelId: string): string | null {
  if (!panelId.startsWith('divider-')) {
    return null;
  }

  // New format: divider-{voidId}-{axis}-{position}
  const newMatch = panelId.match(/^divider-(.+)-(x|y|z)-(-?\d+(?:\.\d+)?)$/);
  if (newMatch) {
    return newMatch[1];
  }

  // Legacy format: divider-{voidId}-split
  const legacyMatch = panelId.match(/^divider-(.+)-split$/);
  if (legacyMatch) {
    return legacyMatch[1];
  }

  // Very old format: divider-{voidId}
  const simpleMatch = panelId.match(/^divider-(.+)$/);
  if (simpleMatch) {
    // Exclude slot IDs
    if (simpleMatch[1].includes('-slot-')) {
      return null;
    }
    return simpleMatch[1];
  }

  return null;
}

// =============================================================================
// Panel Type Detection
// =============================================================================

export type PanelType = 'face' | 'divider' | 'divider-slot' | 'unknown';

/**
 * Determine the type of a panel from its ID
 */
export function getPanelType(panelId: string): PanelType {
  if (panelId.includes('-slot-')) {
    return 'divider-slot';
  }
  if (panelId.startsWith('divider-')) {
    return 'divider';
  }
  if (panelId.includes('face-')) {
    return 'face';
  }
  return 'unknown';
}

// =============================================================================
// Panel ID Generation for Tree View
// =============================================================================

/**
 * Generate the expected divider panel ID for a void with subdivision info.
 * Use this in the tree view to match IDs from the engine.
 */
export function getDividerPanelIdForVoid(
  voidId: string,
  splitAxis: 'x' | 'y' | 'z',
  splitPosition: number
): string {
  return createDividerPanelId(voidId, splitAxis, splitPosition);
}

// =============================================================================
// Void Tree Utilities
// =============================================================================

/**
 * Interface for void nodes (simplified for panel ID generation)
 */
interface VoidLike {
  id: string;
  children?: VoidLike[];
  splitAxis?: 'x' | 'y' | 'z';
  splitPosition?: number;
  subAssembly?: {
    rootVoid: VoidLike;
  };
}

/**
 * Get all divider panel IDs from a void tree.
 * Traverses the tree and generates IDs for all voids that have splitAxis/splitPosition.
 */
export function getAllDividerPanelIds(rootVoid: VoidLike): string[] {
  const ids: string[] = [];

  const traverse = (node: VoidLike) => {
    for (const child of node.children || []) {
      if (child.splitAxis && child.splitPosition !== undefined) {
        ids.push(createDividerPanelId(child.id, child.splitAxis, child.splitPosition));
      }
      traverse(child);
    }

    // Also traverse sub-assembly interior
    if (node.subAssembly) {
      traverse(node.subAssembly.rootVoid);
    }
  };

  traverse(rootVoid);
  return ids;
}

/**
 * Get the divider panel ID for a specific void ID (if it has a divider).
 * Returns null if the void doesn't have split info or isn't found.
 */
export function getDividerPanelIdByVoidId(
  rootVoid: VoidLike,
  targetVoidId: string
): string | null {
  const findVoidAndGetDividerId = (node: VoidLike): string | null => {
    for (const child of node.children || []) {
      if (child.id === targetVoidId && child.splitAxis && child.splitPosition !== undefined) {
        return createDividerPanelId(child.id, child.splitAxis, child.splitPosition);
      }
      const result = findVoidAndGetDividerId(child);
      if (result) return result;
    }

    // Also check sub-assembly interior
    if (node.subAssembly) {
      const result = findVoidAndGetDividerId(node.subAssembly.rootVoid);
      if (result) return result;
    }

    return null;
  };

  return findVoidAndGetDividerId(rootVoid);
}
