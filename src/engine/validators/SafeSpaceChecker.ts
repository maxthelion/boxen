/**
 * Safe Space Checker - Validates safe space calculation results
 *
 * This module validates that safe space regions computed by safeSpace.ts
 * match the expected mental model:
 * - Simple panels have 1 safe rectangle
 * - Panels with internal slots (dividers) have multiple safe rectangles
 * - Result paths are closed, rectangular polygons within panel bounds
 *
 * Rules validated:
 * 1. safe-space:result-count - Number of result paths matches expected
 * 2. safe-space:result-closed - Each result path is a closed polygon
 * 3. safe-space:result-rectangular - Each result is an axis-aligned rectangle
 * 4. safe-space:result-within-panel - All result paths are within panel bounds
 *
 * Note: This checker validates the COMPUTED result, not the raw outline/exclusions.
 */

import type { PathPoint, PanelPath } from '../../types';
import type { SafeSpaceRegion } from '../safeSpace';

// =============================================================================
// Types
// =============================================================================

export type SafeSpaceRuleId =
  | 'safe-space:result-count'
  | 'safe-space:result-closed'
  | 'safe-space:result-rectangular'
  | 'safe-space:result-within-panel';

export interface SafeSpaceValidationError {
  rule: SafeSpaceRuleId;
  severity: 'error' | 'warning';
  message: string;
  details: {
    panelId?: string;
    resultPathIndex?: number;
    expected?: number;
    actual?: number;
    [key: string]: unknown;
  };
}

export interface SafeSpaceCheckResult {
  valid: boolean;
  errors: SafeSpaceValidationError[];
  warnings: SafeSpaceValidationError[];
  summary: {
    rulesChecked: SafeSpaceRuleId[];
    errorCount: number;
    warningCount: number;
    resultPathCount: number;
  };
}

// =============================================================================
// Constants
// =============================================================================

const TOLERANCE = 0.001; // mm - tolerance for coordinate comparisons

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if a polygon is rectangular (4 points, axis-aligned sides)
 */
function isRectangular(points: PathPoint[]): boolean {
  if (points.length !== 4) return false;

  // Check that each segment is either horizontal or vertical
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    const dx = Math.abs(points[j].x - points[i].x);
    const dy = Math.abs(points[j].y - points[i].y);

    // Segment must be horizontal (dy=0) or vertical (dx=0)
    if (dx > TOLERANCE && dy > TOLERANCE) {
      return false; // Diagonal segment
    }
  }

  return true;
}

/**
 * Get bounding box of a polygon
 */
function getBounds(points: PathPoint[]): { minX: number; maxX: number; minY: number; maxY: number } {
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

/**
 * Check if bounds A is within bounds B
 */
function isWithinBounds(
  inner: { minX: number; maxX: number; minY: number; maxY: number },
  outer: { minX: number; maxX: number; minY: number; maxY: number }
): boolean {
  return (
    inner.minX >= outer.minX - TOLERANCE &&
    inner.maxX <= outer.maxX + TOLERANCE &&
    inner.minY >= outer.minY - TOLERANCE &&
    inner.maxY <= outer.maxY + TOLERANCE
  );
}

/**
 * Count internal slots that span the full dimension of the safe space
 * (slots that would split the safe area into separate regions)
 */
function countSplittingSlots(
  panel: PanelPath,
  safeSpace: SafeSpaceRegion
): number {
  let count = 0;

  // Get panel body dimensions
  const halfW = panel.width / 2;
  const halfH = panel.height / 2;

  // Get safe space outline bounds (after edge exclusions)
  const outlineBounds = getBounds(safeSpace.outline);

  // Check each slot hole
  for (const hole of panel.holes) {
    const isSlot = hole.source?.type === 'divider-slot' ||
                   hole.source?.type === 'extension-slot' ||
                   hole.type === 'slot';

    if (!isSlot) continue;

    const holeBounds = getBounds(hole.path.points);

    // Check if slot spans full width (creates horizontal split)
    const spansWidth = holeBounds.minX <= -halfW + TOLERANCE &&
                       holeBounds.maxX >= halfW - TOLERANCE;

    // Check if slot spans full height (creates vertical split)
    const spansHeight = holeBounds.minY <= -halfH + TOLERANCE &&
                        holeBounds.maxY >= halfH - TOLERANCE;

    // Also check relative to the outline (including extensions)
    const spansOutlineWidth = holeBounds.minX <= outlineBounds.minX + TOLERANCE &&
                               holeBounds.maxX >= outlineBounds.maxX - TOLERANCE;
    const spansOutlineHeight = holeBounds.minY <= outlineBounds.minY + TOLERANCE &&
                                holeBounds.maxY >= outlineBounds.maxY - TOLERANCE;

    if (spansWidth || spansHeight || spansOutlineWidth || spansOutlineHeight) {
      count++;
    }
  }

  return count;
}

// =============================================================================
// Safe Space Checker Class
// =============================================================================

export class SafeSpaceChecker {
  private errors: SafeSpaceValidationError[] = [];
  private warnings: SafeSpaceValidationError[] = [];
  private rulesChecked = new Set<SafeSpaceRuleId>();

  constructor(
    private panel: PanelPath,
    private safeSpace: SafeSpaceRegion
  ) {}

  /**
   * Run all safe space checks and return results
   */
  check(): SafeSpaceCheckResult {
    this.errors = [];
    this.warnings = [];
    this.rulesChecked.clear();

    this.checkResultClosed();
    this.checkResultRectangular();
    this.checkResultWithinPanel();
    this.checkResultCount();

    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      summary: {
        rulesChecked: Array.from(this.rulesChecked),
        errorCount: this.errors.length,
        warningCount: this.warnings.length,
        resultPathCount: this.safeSpace.resultPaths.length,
      },
    };
  }

  private addError(
    rule: SafeSpaceRuleId,
    message: string,
    details: SafeSpaceValidationError['details']
  ): void {
    this.rulesChecked.add(rule);
    this.errors.push({ rule, severity: 'error', message, details });
  }

  private addWarning(
    rule: SafeSpaceRuleId,
    message: string,
    details: SafeSpaceValidationError['details']
  ): void {
    this.rulesChecked.add(rule);
    this.warnings.push({ rule, severity: 'warning', message, details });
  }

  private markRuleChecked(rule: SafeSpaceRuleId): void {
    this.rulesChecked.add(rule);
  }

  // ===========================================================================
  // Rule: safe-space:result-closed
  // Each result path must form a closed polygon (at least 3 points)
  // ===========================================================================

  private checkResultClosed(): void {
    this.markRuleChecked('safe-space:result-closed');

    for (let i = 0; i < this.safeSpace.resultPaths.length; i++) {
      const path = this.safeSpace.resultPaths[i];

      if (path.length < 3) {
        this.addError('safe-space:result-closed',
          `Result path ${i} has fewer than 3 points (not a valid polygon)`,
          {
            panelId: this.panel.id,
            resultPathIndex: i,
            pointCount: path.length,
          }
        );
      }
    }
  }

  // ===========================================================================
  // Rule: safe-space:result-rectangular
  // Each result path should be a rectangular polygon (4 points, axis-aligned)
  // ===========================================================================

  private checkResultRectangular(): void {
    this.markRuleChecked('safe-space:result-rectangular');

    for (let i = 0; i < this.safeSpace.resultPaths.length; i++) {
      const path = this.safeSpace.resultPaths[i];

      if (!isRectangular(path)) {
        // This is a warning, not an error - non-rectangular regions can be valid
        // but they don't match the simplified mental model
        this.addWarning('safe-space:result-rectangular',
          `Result path ${i} is not a simple rectangle`,
          {
            panelId: this.panel.id,
            resultPathIndex: i,
            pointCount: path.length,
            isRectangular: false,
          }
        );
      }
    }
  }

  // ===========================================================================
  // Rule: safe-space:result-within-panel
  // All result paths must be within the panel's outline bounds
  // ===========================================================================

  private checkResultWithinPanel(): void {
    this.markRuleChecked('safe-space:result-within-panel');

    const outlineBounds = getBounds(this.safeSpace.outline);

    for (let i = 0; i < this.safeSpace.resultPaths.length; i++) {
      const path = this.safeSpace.resultPaths[i];
      const pathBounds = getBounds(path);

      if (!isWithinBounds(pathBounds, outlineBounds)) {
        this.addError('safe-space:result-within-panel',
          `Result path ${i} extends outside panel outline`,
          {
            panelId: this.panel.id,
            resultPathIndex: i,
            pathBounds,
            outlineBounds,
          }
        );
      }
    }
  }

  // ===========================================================================
  // Rule: safe-space:result-count
  // Number of result paths should match expected based on slots
  // ===========================================================================

  private checkResultCount(): void {
    this.markRuleChecked('safe-space:result-count');

    // Expected result count based on mental model:
    // - Base case: 1 rectangle
    // - Each full-spanning slot adds 1 region (splits into 2, 3, etc.)
    const splittingSlotCount = countSplittingSlots(this.panel, this.safeSpace);
    const expectedMinCount = 1;  // At minimum, we expect 1 safe region
    const expectedMaxCount = splittingSlotCount + 1;  // Each splitting slot adds 1 region

    const actualCount = this.safeSpace.resultPaths.length;

    // Warn if count doesn't match expected range
    if (actualCount < expectedMinCount) {
      this.addWarning('safe-space:result-count',
        `Result has fewer paths than expected`,
        {
          panelId: this.panel.id,
          expected: expectedMinCount,
          actual: actualCount,
          splittingSlots: splittingSlotCount,
        }
      );
    }

    // Note: Having more result paths than expected is acceptable
    // (e.g., complex slot arrangements may create more regions)
    // We only warn if there are significantly more than expected
    if (actualCount > expectedMaxCount + 2) {
      this.addWarning('safe-space:result-count',
        `Result has more paths than expected (may indicate complex geometry)`,
        {
          panelId: this.panel.id,
          expected: expectedMaxCount,
          actual: actualCount,
          splittingSlots: splittingSlotCount,
        }
      );
    }
  }
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Check safe space validity for a panel
 */
export function checkSafeSpaceValidity(
  panel: PanelPath,
  safeSpace: SafeSpaceRegion
): SafeSpaceCheckResult {
  const checker = new SafeSpaceChecker(panel, safeSpace);
  return checker.check();
}

/**
 * Format check results for display
 */
export function formatSafeSpaceCheckResult(result: SafeSpaceCheckResult): string {
  const lines: string[] = [];

  lines.push('='.repeat(60));
  lines.push('SAFE SPACE CHECK RESULTS');
  lines.push('='.repeat(60));
  lines.push('');
  lines.push(`Status: ${result.valid ? '✓ VALID' : '✗ INVALID'}`);
  lines.push(`Result Paths: ${result.summary.resultPathCount}`);
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
