import { PanelPath } from '../../types';

// =============================================================================
// Panel ID Lookup (from Engine)
// =============================================================================
//
// Panel IDs are UUIDs, not deterministic strings. To find a panel by its
// semantic properties (void ID, axis, etc.), we must look it up from the
// engine's generated panels using PanelPath.source metadata.
// =============================================================================

/**
 * Build a lookup map from child void ID to its divider panel ID.
 *
 * Divider panels are associated with child voids that have split info.
 * The panel's source.subdivisionId is the PARENT void's ID (the void being subdivided),
 * so we need to match by axis and position to find the right child.
 */
export function buildDividerPanelLookup(panels: PanelPath[]): Map<string, string> {
  const lookup = new Map<string, string>();

  for (const panel of panels) {
    if (panel.source.type === 'divider' && panel.source.subdivisionId) {
      // Key format: "parentVoidId-axis-position"
      // This matches how getDividerPanels in BoxTree.tsx builds its lookup
      const key = `${panel.source.subdivisionId}-${panel.source.axis}-${panel.source.position}`;
      lookup.set(key, panel.id);
    }
  }

  return lookup;
}

/**
 * Get the divider panel ID for a child void that has split info.
 * Returns null if no matching panel is found.
 *
 * @param panels - All panels from engine.generatePanelsFromNodes()
 * @param parentVoidId - The ID of the parent void (void being subdivided)
 * @param axis - The split axis
 * @param position - The split position
 */
export function getDividerPanelId(
  panels: PanelPath[],
  parentVoidId: string,
  axis: 'x' | 'y' | 'z',
  position: number
): string | null {
  const panel = panels.find(p =>
    p.source.type === 'divider' &&
    p.source.subdivisionId === parentVoidId &&
    p.source.axis === axis &&
    p.source.position === position
  );
  return panel?.id ?? null;
}

/**
 * Get all divider panel IDs from the engine panels.
 */
export function getAllDividerPanelIdsFromEngine(panels: PanelPath[]): string[] {
  return panels
    .filter(p => p.source.type === 'divider')
    .map(p => p.id);
}
