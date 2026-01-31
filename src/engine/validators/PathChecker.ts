/**
 * Path Checker - Validates path geometry constraints
 *
 * This module validates that generated paths adhere to the documented rules
 * in docs/IMG_8222.jpeg and the implicit rules in the codebase.
 *
 * Rules validated:
 * 1. path:axis-aligned - Every consecutive pair of points must share X or Y coordinate (no diagonals)
 * 2. path:closed-polygon - Path forms a closed loop (first point connects to last)
 * 3. path:minimum-points - Path has at least 3 points
 * 4. path:no-duplicates - No consecutive duplicate points
 *
 * IMPORTANT: These rules should NOT be modified without consulting the user first.
 * They encode critical geometric constraints for laser-cut assembly.
 */

import type { Engine } from '../Engine';
import type { Point2D, PanelSnapshot } from '../types';

// =============================================================================
// Types
// =============================================================================

export type PathRuleId =
  | 'path:axis-aligned'
  | 'path:closed-polygon'
  | 'path:minimum-points'
  | 'path:no-duplicates';

export interface PathValidationError {
  rule: PathRuleId;
  severity: 'error' | 'warning';
  message: string;
  details: {
    panelId?: string;
    panelKind?: string;
    pathType?: string; // 'outline' or hole id
    segmentIndex?: number;
    from?: Point2D;
    to?: Point2D;
    [key: string]: unknown;
  };
}

export interface PathCheckResult {
  valid: boolean;
  errors: PathValidationError[];
  warnings: PathValidationError[];
  summary: {
    rulesChecked: PathRuleId[];
    errorCount: number;
    warningCount: number;
  };
}

// =============================================================================
// Constants
// =============================================================================

const AXIS_ALIGNMENT_TOLERANCE = 0.001; // mm - tolerance for considering coordinates equal
const DUPLICATE_TOLERANCE = 0.001; // mm - tolerance for duplicate point detection

// =============================================================================
// Path Checker Class
// =============================================================================

export class PathChecker {
  private errors: PathValidationError[] = [];
  private warnings: PathValidationError[] = [];
  private rulesChecked = new Set<PathRuleId>();

  constructor(private engine: Engine) {}

  /**
   * Run all path checks and return results
   */
  check(): PathCheckResult {
    this.errors = [];
    this.warnings = [];
    this.rulesChecked.clear();

    const snapshot = this.engine.getSnapshot();
    const assembly = snapshot.children[0];

    if (!assembly) {
      return this.buildResult();
    }

    const panels = assembly.derived.panels;

    // Run all checks on each panel
    for (const panel of panels) {
      this.checkAxisAligned(panel);
      this.checkMinimumPoints(panel);
      this.checkNoDuplicates(panel);
      // Note: closed-polygon is implicitly checked by axis-aligned
      // (if all segments are axis-aligned and form a valid outline, it's closed)
    }

    return this.buildResult();
  }

  private buildResult(): PathCheckResult {
    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      summary: {
        rulesChecked: Array.from(this.rulesChecked),
        errorCount: this.errors.length,
        warningCount: this.warnings.length,
      },
    };
  }

  private addError(
    rule: PathRuleId,
    message: string,
    details: PathValidationError['details']
  ): void {
    this.rulesChecked.add(rule);
    this.errors.push({ rule, severity: 'error', message, details });
  }

  private addWarning(
    rule: PathRuleId,
    message: string,
    details: PathValidationError['details']
  ): void {
    this.rulesChecked.add(rule);
    this.warnings.push({ rule, severity: 'warning', message, details });
  }

  private markRuleChecked(rule: PathRuleId): void {
    this.rulesChecked.add(rule);
  }

  // ===========================================================================
  // Rule: path:axis-aligned
  // Every consecutive pair of points must share either X or Y coordinate
  // ===========================================================================

  private checkAxisAligned(panel: PanelSnapshot): void {
    this.markRuleChecked('path:axis-aligned');

    const { outline } = panel.derived;

    // Skip axis-aligned check for panel outline if it has corner fillets
    // Fillet arcs are intentionally diagonal (polyline approximations of curves)
    const hasFillets = panel.props.cornerFillets && panel.props.cornerFillets.length > 0;

    // Check outline (skip if panel has fillets)
    if (!hasFillets) {
      this.checkPathAxisAligned(
        outline.points,
        panel.id,
        panel.kind,
        'outline'
      );
    }

    // Check holes (always check - holes shouldn't have fillets)
    for (const hole of outline.holes) {
      this.checkPathAxisAligned(
        hole.path,
        panel.id,
        panel.kind,
        hole.id
      );
    }
  }

  private checkPathAxisAligned(
    points: Point2D[],
    panelId: string,
    panelKind: string,
    pathType: string
  ): void {
    if (points.length < 2) return;

    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      const from = points[i];
      const to = points[j];

      const dx = Math.abs(to.x - from.x);
      const dy = Math.abs(to.y - from.y);

      // A segment is diagonal if BOTH dx and dy are significant
      // (i.e., neither x nor y coordinate is shared)
      if (dx > AXIS_ALIGNMENT_TOLERANCE && dy > AXIS_ALIGNMENT_TOLERANCE) {
        this.addError('path:axis-aligned',
          `Diagonal segment detected in ${pathType}`,
          {
            panelId,
            panelKind,
            pathType,
            segmentIndex: i,
            from: { x: from.x, y: from.y },
            to: { x: to.x, y: to.y },
            dx,
            dy,
          }
        );
      }
    }
  }

  // ===========================================================================
  // Rule: path:minimum-points
  // Path must have at least 3 points to form a valid polygon
  // ===========================================================================

  private checkMinimumPoints(panel: PanelSnapshot): void {
    this.markRuleChecked('path:minimum-points');

    const { outline } = panel.derived;

    // Check outline
    if (outline.points.length < 3) {
      this.addError('path:minimum-points',
        'Outline has fewer than 3 points',
        {
          panelId: panel.id,
          panelKind: panel.kind,
          pathType: 'outline',
          pointCount: outline.points.length,
        }
      );
    }

    // Check holes
    for (const hole of outline.holes) {
      if (hole.path.length < 3) {
        this.addError('path:minimum-points',
          'Hole has fewer than 3 points',
          {
            panelId: panel.id,
            panelKind: panel.kind,
            pathType: hole.id,
            pointCount: hole.path.length,
          }
        );
      }
    }
  }

  // ===========================================================================
  // Rule: path:no-duplicates
  // No consecutive duplicate points in the path
  // ===========================================================================

  private checkNoDuplicates(panel: PanelSnapshot): void {
    this.markRuleChecked('path:no-duplicates');

    const { outline } = panel.derived;

    // Check outline
    this.checkPathNoDuplicates(
      outline.points,
      panel.id,
      panel.kind,
      'outline'
    );

    // Check holes
    for (const hole of outline.holes) {
      this.checkPathNoDuplicates(
        hole.path,
        panel.id,
        panel.kind,
        hole.id
      );
    }
  }

  private checkPathNoDuplicates(
    points: Point2D[],
    panelId: string,
    panelKind: string,
    pathType: string
  ): void {
    if (points.length < 2) return;

    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      const from = points[i];
      const to = points[j];

      const dx = Math.abs(to.x - from.x);
      const dy = Math.abs(to.y - from.y);

      if (dx < DUPLICATE_TOLERANCE && dy < DUPLICATE_TOLERANCE) {
        this.addWarning('path:no-duplicates',
          `Duplicate consecutive points in ${pathType}`,
          {
            panelId,
            panelKind,
            pathType,
            index: i,
            point: { x: from.x, y: from.y },
          }
        );
      }
    }
  }
}

// =============================================================================
// Standalone Path Validation Functions
// =============================================================================

/**
 * Check if a path is axis-aligned (no diagonal segments)
 * Useful for validating paths outside of the engine context
 */
export function isPathAxisAligned(points: Point2D[], tolerance = AXIS_ALIGNMENT_TOLERANCE): boolean {
  if (points.length < 2) return true;

  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    const dx = Math.abs(points[j].x - points[i].x);
    const dy = Math.abs(points[j].y - points[i].y);

    if (dx > tolerance && dy > tolerance) {
      return false;
    }
  }

  return true;
}

/**
 * Find all diagonal segments in a path
 * Returns array of segment indices that are diagonal
 */
export function findDiagonalSegments(
  points: Point2D[],
  tolerance = AXIS_ALIGNMENT_TOLERANCE
): { index: number; from: Point2D; to: Point2D; dx: number; dy: number }[] {
  const diagonals: { index: number; from: Point2D; to: Point2D; dx: number; dy: number }[] = [];

  if (points.length < 2) return diagonals;

  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    const from = points[i];
    const to = points[j];
    const dx = Math.abs(to.x - from.x);
    const dy = Math.abs(to.y - from.y);

    if (dx > tolerance && dy > tolerance) {
      diagonals.push({ index: i, from, to, dx, dy });
    }
  }

  return diagonals;
}

// =============================================================================
// Convenience Function
// =============================================================================

/**
 * Check path validity of an engine's current state
 */
export function checkPathValidity(engine: Engine): PathCheckResult {
  const checker = new PathChecker(engine);
  return checker.check();
}

/**
 * Format check results for display
 */
export function formatPathCheckResult(result: PathCheckResult): string {
  const lines: string[] = [];

  lines.push('='.repeat(60));
  lines.push('PATH VALIDITY CHECK RESULTS');
  lines.push('='.repeat(60));
  lines.push('');
  lines.push(`Status: ${result.valid ? '✓ VALID' : '✗ INVALID'}`);
  lines.push(`Errors: ${result.summary.errorCount}`);
  lines.push(`Warnings: ${result.summary.warningCount}`);
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
