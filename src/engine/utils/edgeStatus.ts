/**
 * Edge Status Utilities
 *
 * Determines edge editability for the inset/outset tool.
 * This is the authoritative source for edge status in the engine.
 *
 * Edge status is derived from joint gender:
 * - male joint (tabs out) → locked (cannot modify)
 * - female joint (slots) → outward-only (can extend outward)
 * - no joint (open face) → unlocked (can extend or retract)
 */

import { EdgeStatus, EdgeStatusInfo, JointGender } from '../types';

// Re-export types for convenience
export type { EdgeStatus, EdgeStatusInfo } from '../types';

// =============================================================================
// Status Derivation
// =============================================================================

/**
 * Convert joint gender to edge status.
 *
 * @param gender - The joint gender (male, female, or null for no joint)
 * @returns Edge status for UI/validation
 */
export function genderToEdgeStatus(gender: JointGender | null): EdgeStatus {
  if (gender === 'male') {
    return 'locked';
  } else if (gender === 'female') {
    return 'outward-only';
  } else {
    return 'unlocked';
  }
}

/**
 * Check if an edge can be selected for inset/outset operations.
 *
 * @param status - The edge status
 * @returns true if the edge can be modified
 */
export function isEdgeSelectable(status: EdgeStatus): boolean {
  return status !== 'locked';
}

/**
 * Check if an edge can be extended inward (negative extension).
 *
 * @param status - The edge status
 * @returns true if inward extension is allowed
 */
export function canExtendInward(status: EdgeStatus): boolean {
  // Only unlocked edges can extend inward
  return status === 'unlocked';
}

/**
 * Check if an edge can be extended outward (positive extension).
 *
 * @param status - The edge status
 * @returns true if outward extension is allowed
 */
export function canExtendOutward(status: EdgeStatus): boolean {
  // Both unlocked and outward-only edges can extend outward
  return status !== 'locked';
}

/**
 * Clamp an extension value based on edge status and material thickness.
 *
 * @param value - The desired extension value
 * @param status - The edge status
 * @param materialThickness - The material thickness (max inward extension)
 * @returns The clamped extension value
 */
export function clampEdgeExtension(
  value: number,
  status: EdgeStatus,
  materialThickness: number
): number {
  if (status === 'locked') {
    return 0; // Locked edges cannot be modified
  }

  if (status === 'outward-only') {
    return Math.max(0, value); // Can only extend outward
  }

  // Unlocked: can go negative up to -materialThickness
  return Math.max(-materialThickness, value);
}
