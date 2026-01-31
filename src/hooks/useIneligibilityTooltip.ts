/**
 * useIneligibilityTooltip - Hook for computing ineligibility tooltip message
 *
 * This hook checks what's being hovered and the active tool, then returns
 * an appropriate ineligibility message if the hovered item can't be operated on.
 *
 * Priority: Item-level (corner/edge) > Panel-level
 */

import { useMemo } from 'react';
import { useBoxStore } from '../store/useBoxStore';
import { useEnginePanels } from '../engine';
import { EditorTool, PanelPath } from '../types';
import { CornerKey } from '../engine/types';
import {
  getMoveEligibility,
  getPushPullEligibility,
  getInsetPanelEligibility,
  getFilletPanelEligibility,
  getEdgeEligibility,
  getCornerEligibility,
  getIneligibilityMessage,
  EligibilityResult,
} from '../operations/eligibility';

/**
 * Get the panel object from the panel collection by ID
 */
function findPanel(
  panelId: string | null,
  panelCollection: { panels: PanelPath[] } | null
): PanelPath | null {
  if (!panelId || !panelCollection) return null;
  return panelCollection.panels.find((p) => p.id === panelId) ?? null;
}

/**
 * Check panel-level eligibility for a tool
 */
function checkPanelEligibility(
  tool: EditorTool,
  panel: PanelPath
): EligibilityResult | null {
  switch (tool) {
    case 'move':
      return getMoveEligibility(panel);
    case 'push-pull':
      return getPushPullEligibility(panel);
    case 'inset':
      return getInsetPanelEligibility(panel);
    case 'fillet':
      return getFilletPanelEligibility(panel);
    default:
      return null;
  }
}

/**
 * Parse a hovered edge string (format: "panelId:edge")
 */
function parseHoveredEdge(
  hoveredEdge: string | null
): { panelId: string; edge: string } | null {
  if (!hoveredEdge) return null;
  const colonIndex = hoveredEdge.lastIndexOf(':');
  if (colonIndex <= 0) return null;
  return {
    panelId: hoveredEdge.slice(0, colonIndex),
    edge: hoveredEdge.slice(colonIndex + 1),
  };
}

/**
 * Parse a hovered corner string (format: "panelId:edge1:edge2")
 */
function parseHoveredCorner(
  hoveredCorner: string | null
): { panelId: string; corner: CornerKey } | null {
  if (!hoveredCorner) return null;
  const parts = hoveredCorner.split(':');
  if (parts.length < 3) return null;
  // Panel ID can contain colons, so take everything except last 2 parts
  const panelId = parts.slice(0, -2).join(':');
  const corner = `${parts[parts.length - 2]}:${parts[parts.length - 1]}` as CornerKey;
  return { panelId, corner };
}

/**
 * Hook that returns the ineligibility tooltip message to display, or null.
 */
export function useIneligibilityTooltip(): string | null {
  const activeTool = useBoxStore((state) => state.activeTool);
  const hoveredPanelId = useBoxStore((state) => state.hoveredPanelId);
  const hoveredEdge = useBoxStore((state) => state.hoveredEdge);
  const hoveredCorner = useBoxStore((state) => state.hoveredCorner);
  const panelCollection = useEnginePanels();

  return useMemo(() => {
    // Only show tooltips for tools that have eligibility constraints
    const toolsWithEligibility: EditorTool[] = ['move', 'push-pull', 'inset', 'fillet'];
    if (!toolsWithEligibility.includes(activeTool)) {
      return null;
    }

    // Priority 1: Item-level (corner or edge) - most specific
    if (activeTool === 'fillet' && hoveredCorner) {
      const parsed = parseHoveredCorner(hoveredCorner);
      if (parsed) {
        const panel = findPanel(parsed.panelId, panelCollection);
        if (panel) {
          const result = getCornerEligibility(panel, parsed.corner);
          if (!result.eligible && result.reason) {
            return getIneligibilityMessage(result.reason);
          }
        }
      }
    }

    if (activeTool === 'inset' && hoveredEdge) {
      const parsed = parseHoveredEdge(hoveredEdge);
      if (parsed) {
        const panel = findPanel(parsed.panelId, panelCollection);
        if (panel) {
          const result = getEdgeEligibility(
            panel,
            parsed.edge as 'top' | 'bottom' | 'left' | 'right'
          );
          if (!result.eligible && result.reason) {
            return getIneligibilityMessage(result.reason);
          }
        }
      }
    }

    // Priority 2: Panel-level - when hovering a panel (not a specific item)
    if (hoveredPanelId) {
      const panel = findPanel(hoveredPanelId, panelCollection);
      if (panel) {
        const result = checkPanelEligibility(activeTool, panel);
        if (result && !result.eligible && result.reason) {
          return getIneligibilityMessage(result.reason);
        }
      }
    }

    return null;
  }, [activeTool, hoveredPanelId, hoveredEdge, hoveredCorner, panelCollection]);
}
