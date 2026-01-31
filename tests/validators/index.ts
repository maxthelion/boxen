/**
 * Test Validators
 *
 * Validators are modules (not tests) that perform specific validation checks.
 * They are primarily used by integration tests to validate operation outputs.
 *
 * The actual validator implementations live in src/engine/validators/.
 * This module re-exports them and provides a unified validateOperation() function.
 */

// Re-export validators from source
export { ComprehensiveValidator, validateGeometry } from '../../src/engine/validators/ComprehensiveValidator';
export type { ValidationResult, ValidationError } from '../../src/engine/validators/ComprehensiveValidator';

export { PathChecker, checkPathValidity } from '../../src/engine/validators/PathChecker';
export type { PathCheckResult, PathValidationError, PathRuleId } from '../../src/engine/validators/PathChecker';

export { EdgeExtensionChecker, checkEdgeExtensions } from '../../src/engine/validators/EdgeExtensionChecker';
export type { EdgeExtensionCheckResult, EdgeExtensionValidationError, EdgeExtensionRuleId } from '../../src/engine/validators/EdgeExtensionChecker';

import type { Engine } from '../../src/engine/Engine';
import { ComprehensiveValidator, ValidationResult } from '../../src/engine/validators/ComprehensiveValidator';
import { PathChecker, PathCheckResult } from '../../src/engine/validators/PathChecker';
import { EdgeExtensionChecker, EdgeExtensionCheckResult } from '../../src/engine/validators/EdgeExtensionChecker';

// =============================================================================
// Unified Validation Interface
// =============================================================================

export interface OperationValidationOptions {
  /** Check path validity (axis-aligned, no diagonals) */
  checkPaths?: boolean;
  /** Check edge extension rules */
  checkEdgeExtensions?: boolean;
  /** Include warnings in valid check (default: false) */
  failOnWarnings?: boolean;
}

export interface OperationValidationResult {
  valid: boolean;
  geometry: ValidationResult;
  paths?: PathCheckResult;
  edgeExtensions?: EdgeExtensionCheckResult;
  summary: {
    totalErrors: number;
    totalWarnings: number;
    rulesChecked: string[];
  };
}

/**
 * Run all validators on an engine and return combined results.
 *
 * This is the primary entry point for validating operation outputs.
 *
 * @param engine - The engine to validate
 * @param options - Validation options
 * @returns Combined validation result
 */
export function validateOperation(
  engine: Engine,
  options: OperationValidationOptions = {}
): OperationValidationResult {
  const {
    checkPaths = true,
    checkEdgeExtensions = true,
    failOnWarnings = false,
  } = options;

  // Run geometry validation (always)
  const geometryValidator = new ComprehensiveValidator(engine);
  const geometry = geometryValidator.validateAll();

  // Run path validation (optional)
  let paths: PathCheckResult | undefined;
  if (checkPaths) {
    const pathChecker = new PathChecker(engine);
    paths = pathChecker.check();
  }

  // Run edge extension validation (optional)
  let edgeExtensions: EdgeExtensionCheckResult | undefined;
  if (checkEdgeExtensions) {
    const edgeChecker = new EdgeExtensionChecker(engine);
    edgeExtensions = edgeChecker.check();
  }

  // Combine results
  const totalErrors =
    geometry.summary.errorCount +
    (paths?.summary.errorCount ?? 0) +
    (edgeExtensions?.summary.errorCount ?? 0);

  const totalWarnings =
    geometry.summary.warningCount +
    (paths?.summary.warningCount ?? 0) +
    (edgeExtensions?.summary.warningCount ?? 0);

  const rulesChecked = [
    ...geometry.summary.rulesChecked,
    ...(paths?.summary.rulesChecked ?? []),
    ...(edgeExtensions?.summary.rulesChecked ?? []),
  ];

  const valid = failOnWarnings
    ? totalErrors === 0 && totalWarnings === 0
    : totalErrors === 0;

  return {
    valid,
    geometry,
    paths,
    edgeExtensions,
    summary: {
      totalErrors,
      totalWarnings,
      rulesChecked,
    },
  };
}
