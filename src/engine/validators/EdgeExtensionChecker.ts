/**
 * Edge Extension Checker - Validates edge extension geometry constraints
 *
 * This module validates that edge extensions adhere to the documented rules
 * in docs/IMG_8222.jpeg.
 *
 * Rules validated:
 * 1. edge-extensions:eligibility - Only open/female edges can be extended
 * 2. edge-extensions:full-width - Extension spans full panel dimension
 * 3. edge-extensions:far-edge-open - Extended cap has no finger joints (straight line)
 * 4. edge-extensions:corner-ownership - Female occupies corner, other insets by MT
 * 5. edge-extensions:long-fingers - Long extensions should have finger joints (warning only)
 *
 * IMPORTANT: These rules should NOT be modified without consulting the user first.
 * They encode critical geometric constraints for laser-cut assembly.
 */

import type { Engine } from '../Engine';
import type {
  PanelSnapshot,
  FacePanelSnapshot,
  EdgePosition,
  Point2D,
} from '../types';

// =============================================================================
// Types
// =============================================================================

export type EdgeExtensionRuleId =
  | 'edge-extensions:eligibility'
  | 'edge-extensions:full-width'
  | 'edge-extensions:far-edge-open'
  | 'edge-extensions:corner-ownership'
  | 'edge-extensions:long-fingers';

export interface EdgeExtensionValidationError {
  rule: EdgeExtensionRuleId;
  severity: 'error' | 'warning';
  message: string;
  details: {
    panelId?: string;
    panelKind?: string;
    faceId?: string;
    edge?: EdgePosition;
    extensionAmount?: number;
    [key: string]: unknown;
  };
}

export interface EdgeExtensionCheckResult {
  valid: boolean;
  errors: EdgeExtensionValidationError[];
  warnings: EdgeExtensionValidationError[];
  summary: {
    rulesChecked: EdgeExtensionRuleId[];
    errorCount: number;
    warningCount: number;
    panelsWithExtensions: number;
  };
}

// =============================================================================
// Constants
// =============================================================================

const TOLERANCE = 0.01; // mm - standard geometry tolerance
const EXTENSION_THRESHOLD = 0.001; // mm - minimum to consider an extension active

// =============================================================================
// Edge Extension Checker Class
// =============================================================================

export class EdgeExtensionChecker {
  private errors: EdgeExtensionValidationError[] = [];
  private warnings: EdgeExtensionValidationError[] = [];
  private rulesChecked = new Set<EdgeExtensionRuleId>();
  private panelsWithExtensions = 0;

  constructor(private engine: Engine) {}

  /**
   * Run all edge extension checks and return results
   */
  check(): EdgeExtensionCheckResult {
    this.errors = [];
    this.warnings = [];
    this.rulesChecked.clear();
    this.panelsWithExtensions = 0;

    const snapshot = this.engine.getSnapshot();
    const assembly = snapshot.children[0];

    if (!assembly) {
      return this.buildResult();
    }

    const panels = assembly.derived.panels;
    const mt = assembly.props.material.thickness;

    // Run checks on each panel
    for (const panel of panels) {
      this.checkPanelExtensions(panel, mt, panels);
    }

    return this.buildResult();
  }

  private buildResult(): EdgeExtensionCheckResult {
    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      summary: {
        rulesChecked: Array.from(this.rulesChecked),
        errorCount: this.errors.length,
        warningCount: this.warnings.length,
        panelsWithExtensions: this.panelsWithExtensions,
      },
    };
  }

  private addError(
    rule: EdgeExtensionRuleId,
    message: string,
    details: EdgeExtensionValidationError['details']
  ): void {
    this.rulesChecked.add(rule);
    this.errors.push({ rule, severity: 'error', message, details });
  }

  private addWarning(
    rule: EdgeExtensionRuleId,
    message: string,
    details: EdgeExtensionValidationError['details']
  ): void {
    this.rulesChecked.add(rule);
    this.warnings.push({ rule, severity: 'warning', message, details });
  }

  private markRuleChecked(rule: EdgeExtensionRuleId): void {
    this.rulesChecked.add(rule);
  }

  // ===========================================================================
  // Check extensions for a single panel
  // ===========================================================================

  private checkPanelExtensions(
    panel: PanelSnapshot,
    mt: number,
    allPanels: PanelSnapshot[]
  ): void {
    const extensions = panel.props.edgeExtensions;

    // Check each edge for extensions
    const edges: EdgePosition[] = ['top', 'bottom', 'left', 'right'];
    let hasAnyExtension = false;

    for (const edge of edges) {
      const extensionAmount = extensions[edge];
      if (extensionAmount > EXTENSION_THRESHOLD) {
        hasAnyExtension = true;
        this.checkSingleExtension(panel, edge, extensionAmount, mt, allPanels);
      }
    }

    if (hasAnyExtension) {
      this.panelsWithExtensions++;
    }
  }

  private checkSingleExtension(
    panel: PanelSnapshot,
    edge: EdgePosition,
    extensionAmount: number,
    mt: number,
    allPanels: PanelSnapshot[]
  ): void {
    const faceId = panel.kind === 'face-panel' ? (panel as FacePanelSnapshot).props.faceId : undefined;

    // Rule 1: Check eligibility (only open/female edges can be extended)
    this.checkEligibility(panel, edge, extensionAmount, faceId);

    // Rule 2: Check full-width (extension spans full panel dimension)
    this.checkFullWidth(panel, edge, extensionAmount, faceId);

    // Rule 3: Check far-edge-open (cap has no fingers)
    this.checkFarEdgeOpen(panel, edge, extensionAmount, faceId);

    // Rule 4: Check corner ownership (if adjacent panels also extended)
    this.checkCornerOwnership(panel, edge, extensionAmount, mt, allPanels, faceId);

    // Rule 5: Check for long extensions that should have fingers (warning)
    this.checkLongFingers(panel, edge, extensionAmount, mt, faceId);
  }

  // ===========================================================================
  // Rule: edge-extensions:eligibility
  // Only edges that are open (no mating panel) or female (has slots) can be extended
  // ===========================================================================

  private checkEligibility(
    panel: PanelSnapshot,
    edge: EdgePosition,
    extensionAmount: number,
    faceId?: string
  ): void {
    this.markRuleChecked('edge-extensions:eligibility');

    const edgeStatuses = panel.derived.edgeStatuses;
    const edgeStatus = edgeStatuses.find(s => s.position === edge);

    if (!edgeStatus) {
      // No status info - can't validate
      return;
    }

    // Extension is NOT allowed on 'locked' edges (male joints)
    if (edgeStatus.status === 'locked') {
      this.addError('edge-extensions:eligibility',
        `Edge extension on locked (male) edge is not allowed`,
        {
          panelId: panel.id,
          panelKind: panel.kind,
          faceId,
          edge,
          extensionAmount,
          edgeStatus: edgeStatus.status,
          reason: 'Male edges have tabs that interlock with another panel',
        }
      );
    }
  }

  // ===========================================================================
  // Rule: edge-extensions:full-width
  // The sides of an extended edge should extend the full width of the panel
  // Note: "full width" means the finger joint body (between finger corners),
  // not including tabs that extend past the corners on male edges.
  // ===========================================================================

  private checkFullWidth(
    panel: PanelSnapshot,
    edge: EdgePosition,
    extensionAmount: number,
    faceId?: string
  ): void {
    this.markRuleChecked('edge-extensions:full-width');

    const { outline } = panel.derived;
    const { width: panelWidth, height: panelHeight, thickness, edgeStatuses } = panel.derived;

    // For left/right extensions, sides should span full panel height (minus insets for male top/bottom)
    // For top/bottom extensions, sides should span full panel width (minus insets for male left/right)
    // Male edges have tabs that extend past the finger corner, so the body is smaller.
    const isEdgeMale = (edgePos: EdgePosition): boolean => {
      const status = edgeStatuses.find(s => s.position === edgePos);
      return status?.status === 'locked';
    };

    let expectedSpan: number;
    if (edge === 'left' || edge === 'right') {
      // Vertical extension - sides span height, minus insets for male top/bottom
      expectedSpan = panelHeight;
      if (isEdgeMale('top')) expectedSpan -= thickness;
      if (isEdgeMale('bottom')) expectedSpan -= thickness;
    } else {
      // Horizontal extension - sides span width, minus insets for male left/right
      expectedSpan = panelWidth;
      if (isEdgeMale('left')) expectedSpan -= thickness;
      if (isEdgeMale('right')) expectedSpan -= thickness;
    }

    // Find the extension geometry in the outline
    const extensionGeometry = this.findExtensionGeometry(outline.points, edge, extensionAmount);

    if (!extensionGeometry) {
      // Extension geometry not found - this might be a bug in the extension implementation
      this.addWarning('edge-extensions:full-width',
        `Could not find extension geometry in outline`,
        {
          panelId: panel.id,
          panelKind: panel.kind,
          faceId,
          edge,
          extensionAmount,
        }
      );
      return;
    }

    const { sideSpan } = extensionGeometry;

    // Check if the extension sides span the full dimension
    if (Math.abs(sideSpan - expectedSpan) > TOLERANCE) {
      this.addError('edge-extensions:full-width',
        `Extension sides don't span full panel dimension`,
        {
          panelId: panel.id,
          panelKind: panel.kind,
          faceId,
          edge,
          extensionAmount,
          expectedSpan,
          actualSpan: sideSpan,
          deficit: expectedSpan - sideSpan,
        }
      );
    }
  }

  // ===========================================================================
  // Rule: edge-extensions:far-edge-open
  // The far edge (cap) should have no fingers and behave as if it's an open face
  // ===========================================================================

  private checkFarEdgeOpen(
    panel: PanelSnapshot,
    edge: EdgePosition,
    extensionAmount: number,
    faceId?: string
  ): void {
    this.markRuleChecked('edge-extensions:far-edge-open');

    const { outline } = panel.derived;

    // Find the extension geometry in the outline
    const extensionGeometry = this.findExtensionGeometry(outline.points, edge, extensionAmount);

    if (!extensionGeometry) {
      // Already warned in full-width check
      return;
    }

    const { capSegment } = extensionGeometry;

    if (!capSegment) {
      return;
    }

    // The cap should be a straight line (2 points, axis-aligned)
    // If it has fingers, there would be multiple intermediate points

    // Check that cap is a single straight segment (no fingers)
    // For a proper cap, it should just be 2 points defining a line
    const capPointCount = capSegment.points.length;
    if (capPointCount > 2) {
      this.addWarning('edge-extensions:far-edge-open',
        `Extension cap appears to have finger joints (should be straight)`,
        {
          panelId: panel.id,
          panelKind: panel.kind,
          faceId,
          edge,
          extensionAmount,
          capPointCount,
        }
      );
    }
  }

  // ===========================================================================
  // Rule: edge-extensions:corner-ownership
  // If adjacent panels are also extended, only one should occupy the corner
  // ===========================================================================

  private checkCornerOwnership(
    panel: PanelSnapshot,
    edge: EdgePosition,
    extensionAmount: number,
    mt: number,
    allPanels: PanelSnapshot[],
    faceId?: string
  ): void {
    this.markRuleChecked('edge-extensions:corner-ownership');

    // Only applies to face panels
    if (panel.kind !== 'face-panel') {
      return;
    }

    const facePanelProps = (panel as FacePanelSnapshot).props;
    const thisFaceId = facePanelProps.faceId;

    // Find adjacent faces and check if they have extensions on the shared edge
    const adjacentFaces = this.getAdjacentFaces(thisFaceId, edge);

    for (const adjFaceId of adjacentFaces) {
      const adjPanel = allPanels.find(
        p => p.kind === 'face-panel' && (p as FacePanelSnapshot).props.faceId === adjFaceId
      );

      if (!adjPanel) continue;

      const adjExtensions = adjPanel.props.edgeExtensions;
      const sharedEdge = this.getSharedEdge(thisFaceId, adjFaceId, edge);

      if (sharedEdge && adjExtensions[sharedEdge] > EXTENSION_THRESHOLD) {
        // Both panels have extensions on their shared edge
        // One should be inset by MT
        // This is a simplified check - full implementation would verify actual geometry

        this.addWarning('edge-extensions:corner-ownership',
          `Both ${thisFaceId} and ${adjFaceId} have extensions on shared edge`,
          {
            panelId: panel.id,
            panelKind: panel.kind,
            faceId,
            edge,
            extensionAmount,
            adjacentFaceId: adjFaceId,
            adjacentExtension: adjExtensions[sharedEdge],
            expectedInset: mt,
            note: 'One panel should occupy the corner, the other should be inset by MT',
          }
        );
      }
    }
  }

  // ===========================================================================
  // Rule: edge-extensions:long-fingers
  // If extension > corner gap + finger width + MT, fingers should appear
  // ===========================================================================

  private checkLongFingers(
    panel: PanelSnapshot,
    edge: EdgePosition,
    extensionAmount: number,
    mt: number,
    faceId?: string
  ): void {
    this.markRuleChecked('edge-extensions:long-fingers');

    // Get finger width from assembly (approximate - would need full context)
    // For now, use a reasonable default of 10mm
    const fingerWidth = 10;
    const cornerGap = mt; // Gap at corner typically equals MT

    const fingerThreshold = cornerGap + fingerWidth + mt;

    if (extensionAmount > fingerThreshold) {
      // Long extension - should have fingers along the joint
      // This is a warning since the feature may not be implemented yet
      this.addWarning('edge-extensions:long-fingers',
        `Long extension should have finger joints`,
        {
          panelId: panel.id,
          panelKind: panel.kind,
          faceId,
          edge,
          extensionAmount,
          fingerThreshold,
          excess: extensionAmount - fingerThreshold,
          note: 'Fingers should start rendering along the joint according to finger point spacing',
        }
      );
    }
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  /**
   * Find extension geometry in the outline
   * Returns the side span and cap segment info
   */
  private findExtensionGeometry(
    points: Point2D[],
    edge: EdgePosition,
    _extensionAmount: number
  ): { sideSpan: number; capSegment: { points: Point2D[] } | null } | null {
    if (points.length < 4) return null;

    // Calculate bounding box
    const bounds = this.computeBounds(points);

    // For the extension geometry, we need to find points that are beyond the base panel
    // The "far" position depends on the edge
    let farCoord: number;
    let sideAxis: 'x' | 'y';

    switch (edge) {
      case 'top':
        farCoord = bounds.maxY;
        sideAxis = 'x';
        break;
      case 'bottom':
        farCoord = bounds.minY;
        sideAxis = 'x';
        break;
      case 'left':
        farCoord = bounds.minX;
        sideAxis = 'y';
        break;
      case 'right':
        farCoord = bounds.maxX;
        sideAxis = 'y';
        break;
    }

    // Find points at the far edge (extension cap)
    const capPoints = points.filter(p => {
      const coord = (edge === 'top' || edge === 'bottom') ? p.y : p.x;
      return Math.abs(coord - farCoord) < TOLERANCE;
    });

    if (capPoints.length < 2) {
      return null;
    }

    // Calculate side span from cap points
    const sideCoords = capPoints.map(p => sideAxis === 'x' ? p.x : p.y);
    const sideSpan = Math.max(...sideCoords) - Math.min(...sideCoords);

    return {
      sideSpan,
      capSegment: { points: capPoints },
    };
  }

  private computeBounds(points: Point2D[]): { minX: number; maxX: number; minY: number; maxY: number } {
    if (points.length === 0) {
      return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    }

    let minX = points[0].x;
    let maxX = points[0].x;
    let minY = points[0].y;
    let maxY = points[0].y;

    for (const p of points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }

    return { minX, maxX, minY, maxY };
  }

  /**
   * Get faces that are adjacent to a given face on a specific edge
   */
  private getAdjacentFaces(faceId: string, edge: EdgePosition): string[] {
    // Map of face + edge → adjacent faces
    const adjacencyMap: Record<string, Record<EdgePosition, string[]>> = {
      front: { top: ['top'], bottom: ['bottom'], left: ['left'], right: ['right'] },
      back: { top: ['top'], bottom: ['bottom'], left: ['right'], right: ['left'] },
      left: { top: ['top'], bottom: ['bottom'], left: ['back'], right: ['front'] },
      right: { top: ['top'], bottom: ['bottom'], left: ['front'], right: ['back'] },
      top: { top: ['back'], bottom: ['front'], left: ['left'], right: ['right'] },
      bottom: { top: ['front'], bottom: ['back'], left: ['left'], right: ['right'] },
    };

    return adjacencyMap[faceId]?.[edge] || [];
  }

  /**
   * Get the shared edge on the adjacent face
   */
  private getSharedEdge(
    thisFaceId: string,
    adjFaceId: string,
    thisEdge: EdgePosition
  ): EdgePosition | null {
    // This is a simplified mapping - full implementation would use geometry
    // For face-to-face connections, the shared edge depends on face orientations

    // Common case: if this face's top edge meets adjacent face's bottom edge
    const sharedEdgeMap: Record<string, Record<string, Record<EdgePosition, EdgePosition | null>>> = {
      front: {
        top: { top: 'bottom', bottom: null, left: null, right: null },
        bottom: { bottom: 'top', top: null, left: null, right: null },
        left: { left: 'right', right: null, top: null, bottom: null },
        right: { right: 'left', left: null, top: null, bottom: null },
      },
      // Add more mappings as needed
    };

    return sharedEdgeMap[thisFaceId]?.[adjFaceId]?.[thisEdge] || null;
  }
}

// =============================================================================
// Convenience Function
// =============================================================================

/**
 * Check edge extensions of an engine's current state
 */
export function checkEdgeExtensions(engine: Engine): EdgeExtensionCheckResult {
  const checker = new EdgeExtensionChecker(engine);
  return checker.check();
}

/**
 * Format check results for display
 */
export function formatEdgeExtensionCheckResult(result: EdgeExtensionCheckResult): string {
  const lines: string[] = [];

  lines.push('='.repeat(60));
  lines.push('EDGE EXTENSION CHECK RESULTS');
  lines.push('='.repeat(60));
  lines.push('');
  lines.push(`Status: ${result.valid ? '✓ VALID' : '✗ INVALID'}`);
  lines.push(`Errors: ${result.summary.errorCount}`);
  lines.push(`Warnings: ${result.summary.warningCount}`);
  lines.push(`Panels with Extensions: ${result.summary.panelsWithExtensions}`);
  lines.push(`Rules Checked: ${result.summary.rulesChecked.length}`);
  lines.push('');

  if (result.errors.length > 0) {
    lines.push('-'.repeat(60));
    lines.push('ERRORS');
    lines.push('-'.repeat(60));

    for (const error of result.errors) {
      lines.push('');
      lines.push(`✗ [${error.rule}]`);
      lines.push(`  ${error.message}`);
      for (const [key, value] of Object.entries(error.details)) {
        if (value !== undefined) {
          lines.push(`  ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
        }
      }
    }
  }

  if (result.warnings.length > 0) {
    lines.push('');
    lines.push('-'.repeat(60));
    lines.push('WARNINGS');
    lines.push('-'.repeat(60));

    for (const warning of result.warnings) {
      lines.push('');
      lines.push(`⚠ [${warning.rule}]`);
      lines.push(`  ${warning.message}`);
      for (const [key, value] of Object.entries(warning.details)) {
        if (value !== undefined) {
          lines.push(`  ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
        }
      }
    }
  }

  lines.push('');
  lines.push('='.repeat(60));

  return lines.join('\n');
}
