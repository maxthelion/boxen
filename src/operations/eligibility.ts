/**
 * Eligibility Module - Determine why items are ineligible for operations
 *
 * This module provides functions to check eligibility and return human-readable
 * reasons for ineligibility, used by the ineligibility tooltip system.
 */

import { PanelPath, EdgePosition, EdgeStatus, EdgeStatusInfo } from '../types';
import { CornerKey, CornerEligibility } from '../engine/types';

// =============================================================================
// Ineligibility Reason Types
// =============================================================================

/**
 * Reason codes for why an item is ineligible for an operation.
 * Split into panel-level and item-level reasons.
 */
export type IneligibilityReason =
  // Panel-level reasons (when hovering an ineligible panel)
  | 'panel-is-face'           // Move: only dividers can be moved
  | 'panel-is-divider'        // Push-pull: only faces can be pushed/pulled
  | 'no-unlocked-edges'       // Inset: all edges are locked (male joints)
  | 'no-eligible-corners'     // Fillet: no corners have free length
  // Item-level reasons (when hovering an ineligible edge/corner)
  | 'edge-locked'             // Inset: edge has male joint
  | 'corner-no-free-length'   // Fillet: no free length on adjacent edges
  | 'corner-below-minimum';   // Fillet: max radius < 1mm

/**
 * Panel-level ineligibility messages.
 * Shown when hovering over a panel that can't be operated on.
 */
export const PANEL_INELIGIBILITY_MESSAGES: Record<string, string> = {
  'panel-is-face': 'Only divider panels can be moved',
  'panel-is-divider': 'Only face panels can be pushed/pulled',
  'no-unlocked-edges': 'No eligible edges on this panel',
  'no-eligible-corners': 'No eligible corners on this panel',
};

/**
 * Item-level ineligibility messages.
 * Shown when hovering over a specific edge or corner.
 */
export const ITEM_INELIGIBILITY_MESSAGES: Record<string, string> = {
  'edge-locked': 'Edge has finger joints',
  'corner-no-free-length': 'No free length on adjacent edges',
  'corner-below-minimum': 'Maximum radius below 1mm minimum',
};

/**
 * Result of an eligibility check
 */
export interface EligibilityResult {
  eligible: boolean;
  reason?: IneligibilityReason;
}

// =============================================================================
// Panel Eligibility Functions
// =============================================================================

/**
 * Check panel eligibility for the move operation.
 * Only divider panels can be moved.
 */
export function getMoveEligibility(panel: PanelPath): EligibilityResult {
  if (panel.source.type === 'face') {
    return { eligible: false, reason: 'panel-is-face' };
  }
  return { eligible: true };
}

/**
 * Check panel eligibility for the push-pull operation.
 * Only face panels can be pushed/pulled.
 */
export function getPushPullEligibility(panel: PanelPath): EligibilityResult {
  if (panel.source.type === 'divider') {
    return { eligible: false, reason: 'panel-is-divider' };
  }
  return { eligible: true };
}

/**
 * Check panel eligibility for the inset/outset operation.
 * Panel must have at least one non-locked edge.
 */
export function getInsetPanelEligibility(panel: PanelPath): EligibilityResult {
  const edgeStatuses = panel.edgeStatuses ?? [];
  const hasUnlockedEdge = edgeStatuses.some(s => s.status !== 'locked');

  if (!hasUnlockedEdge) {
    return { eligible: false, reason: 'no-unlocked-edges' };
  }
  return { eligible: true };
}

/**
 * Check panel eligibility for the fillet operation.
 * Panel must have at least one eligible corner.
 */
export function getFilletPanelEligibility(panel: PanelPath): EligibilityResult {
  const cornerEligibility = panel.cornerEligibility ?? [];
  const hasEligibleCorner = cornerEligibility.some(c => c.eligible);

  if (!hasEligibleCorner) {
    return { eligible: false, reason: 'no-eligible-corners' };
  }
  return { eligible: true };
}

// =============================================================================
// Item Eligibility Functions (Edges and Corners)
// =============================================================================

/**
 * Check edge eligibility for inset/outset operation.
 * Edge must not be locked (male joint).
 */
export function getEdgeEligibility(
  panel: PanelPath,
  edgePosition: EdgePosition
): EligibilityResult {
  const edgeStatuses = panel.edgeStatuses ?? [];
  const edgeStatus = edgeStatuses.find(s => s.position === edgePosition);

  if (!edgeStatus || edgeStatus.status === 'locked') {
    return { eligible: false, reason: 'edge-locked' };
  }
  return { eligible: true };
}

/**
 * Check corner eligibility for fillet operation.
 * Returns the specific reason if ineligible.
 */
export function getCornerEligibility(
  panel: PanelPath,
  cornerKey: CornerKey
): EligibilityResult {
  const cornerEligibility = panel.cornerEligibility ?? [];
  const corner = cornerEligibility.find(c => c.corner === cornerKey);

  if (!corner) {
    return { eligible: false, reason: 'corner-no-free-length' };
  }

  if (!corner.eligible) {
    // Use the reason from the engine if available
    if (corner.reason === 'below-minimum') {
      return { eligible: false, reason: 'corner-below-minimum' };
    }
    return { eligible: false, reason: 'corner-no-free-length' };
  }

  return { eligible: true };
}

// =============================================================================
// Message Lookup
// =============================================================================

/**
 * Get the human-readable message for an ineligibility reason.
 */
export function getIneligibilityMessage(reason: IneligibilityReason): string {
  return (
    PANEL_INELIGIBILITY_MESSAGES[reason] ??
    ITEM_INELIGIBILITY_MESSAGES[reason] ??
    'Ineligible'
  );
}
