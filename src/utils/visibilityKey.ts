/**
 * Visibility Key Utilities
 *
 * Computes stable visibility keys from panel properties.
 * These keys are stable across scene clones (when UUIDs change during preview).
 *
 * Key format:
 * - Face panels: "{assemblyId}:{faceId}" e.g., "main:front", "drawer1:back"
 * - Divider panels: "{parentVoidId}:divider:{axis}:{position}" e.g., "root:divider:x:50"
 */

import { PanelPath, PanelSource } from '../types';

/**
 * Compute a visibility key from a panel's source properties.
 * This key is stable across scene clones.
 */
export function getVisibilityKey(panel: PanelPath): string {
  return getVisibilityKeyFromSource(panel.source);
}

/**
 * Compute a visibility key from panel source properties.
 * Useful when you have the source but not the full panel.
 */
export function getVisibilityKeyFromSource(source: PanelSource): string {
  if (source.type === 'face' && source.faceId) {
    const assemblyId = source.subAssemblyId ?? 'main';
    return `${assemblyId}:${source.faceId}`;
  }

  if (source.type === 'divider' && source.subdivisionId && source.axis !== undefined) {
    // Include position for uniqueness when multiple dividers on same axis
    return `${source.subdivisionId}:divider:${source.axis}:${source.position}`;
  }

  // Fallback - shouldn't happen for well-formed panels
  return `unknown:${source.type}`;
}

/**
 * Build a visibility key for a main assembly face panel.
 * Convenience function for UI components that know the face ID.
 */
export function getFaceVisibilityKey(faceId: string, subAssemblyId?: string): string {
  const assemblyId = subAssemblyId ?? 'main';
  return `${assemblyId}:${faceId}`;
}

/**
 * Build a visibility key for a divider panel.
 * Convenience function for UI components.
 */
export function getDividerVisibilityKey(
  parentVoidId: string,
  axis: 'x' | 'y' | 'z',
  position: number
): string {
  return `${parentVoidId}:divider:${axis}:${position}`;
}
