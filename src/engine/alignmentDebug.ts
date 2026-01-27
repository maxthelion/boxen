/**
 * Alignment Debug Utility
 *
 * Records and formats alignment errors for debugging.
 * Uses the clipboard debug pattern from CLAUDE.md.
 */

import {
  JointAlignmentError,
  VoidAlignmentError,
  Point3D,
} from './types';

interface AlignmentDebugLog {
  timestamp: string;
  assemblyId: string;
  jointErrors: JointAlignmentError[];
  voidErrors: VoidAlignmentError[];
}

let currentDebugLog: AlignmentDebugLog | null = null;

/**
 * Start a new alignment debug log for an assembly
 */
export const startAlignmentDebug = (assemblyId: string): void => {
  currentDebugLog = {
    timestamp: new Date().toISOString(),
    assemblyId,
    jointErrors: [],
    voidErrors: [],
  };
};

/**
 * Record a joint alignment error
 */
export const addJointAlignmentError = (error: JointAlignmentError): void => {
  if (currentDebugLog) {
    currentDebugLog.jointErrors.push(error);
  }
};

/**
 * Record a void alignment error
 */
export const addVoidAlignmentError = (error: VoidAlignmentError): void => {
  if (currentDebugLog) {
    currentDebugLog.voidErrors.push(error);
  }
};

/**
 * Format a Point3D for display
 */
const formatPoint = (p: Point3D): string => {
  return `(${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)})`;
};

/**
 * Format the debug log as human-readable text
 */
export const formatAlignmentDebugLog = (): string => {
  if (!currentDebugLog) {
    return 'No alignment debug log available';
  }

  const lines: string[] = [
    '=== Alignment Debug Log ===',
    `Timestamp: ${currentDebugLog.timestamp}`,
    `Assembly: ${currentDebugLog.assemblyId}`,
    '',
  ];

  // Joint errors
  if (currentDebugLog.jointErrors.length === 0) {
    lines.push('Joint Errors: None');
  } else {
    lines.push(`Joint Errors: ${currentDebugLog.jointErrors.length}`);
    lines.push('');

    for (const error of currentDebugLog.jointErrors) {
      lines.push(`  Joint: ${error.jointId}`);
      lines.push(`    Panel A: ${error.panelAId} (${error.panelAEdge} edge)`);
      lines.push(`      World Point: ${formatPoint(error.panelAWorldPoint)}`);
      lines.push(`    Panel B: ${error.panelBId} (${error.panelBEdge} edge)`);
      lines.push(`      World Point: ${formatPoint(error.panelBWorldPoint)}`);
      lines.push(`    Deviation: ${formatPoint(error.deviation)}`);
      lines.push(`    Magnitude: ${error.deviationMagnitude.toFixed(6)} mm`);
      lines.push('');
    }
  }

  lines.push('');

  // Void errors
  if (currentDebugLog.voidErrors.length === 0) {
    lines.push('Void Errors: None');
  } else {
    lines.push(`Void Errors: ${currentDebugLog.voidErrors.length}`);
    lines.push('');

    for (const error of currentDebugLog.voidErrors) {
      lines.push(`  Constraint: ${error.constraintId}`);
      lines.push(`    Parent Void: ${error.parentVoidId}`);
      lines.push(`      World Point: ${formatPoint(error.parentWorldPoint)}`);
      lines.push(`    Child (${error.childType}): ${error.childId}`);
      lines.push(`      World Point: ${formatPoint(error.childWorldPoint)}`);
      lines.push(`    Deviation: ${formatPoint(error.deviation)}`);
      lines.push(`    Magnitude: ${error.deviationMagnitude.toFixed(6)} mm`);
      lines.push('');
    }
  }

  return lines.join('\n');
};

/**
 * Check if there are any alignment errors
 */
export const hasAlignmentErrors = (): boolean => {
  if (!currentDebugLog) return false;
  return currentDebugLog.jointErrors.length > 0 || currentDebugLog.voidErrors.length > 0;
};

/**
 * Get the total number of alignment errors
 */
export const getAlignmentErrorCount = (): number => {
  if (!currentDebugLog) return 0;
  return currentDebugLog.jointErrors.length + currentDebugLog.voidErrors.length;
};

/**
 * Clear the current debug log
 */
export const clearAlignmentDebug = (): void => {
  currentDebugLog = null;
};

/**
 * Get the raw debug log data
 */
export const getAlignmentDebugLog = (): AlignmentDebugLog | null => {
  return currentDebugLog;
};

/**
 * Alignment tolerance in mm
 * Points within this distance are considered aligned
 */
export const ALIGNMENT_TOLERANCE = 0.001;

/**
 * Check if two points are aligned within tolerance
 */
export const pointsAligned = (a: Point3D, b: Point3D): boolean => {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  const dz = Math.abs(a.z - b.z);
  return dx <= ALIGNMENT_TOLERANCE && dy <= ALIGNMENT_TOLERANCE && dz <= ALIGNMENT_TOLERANCE;
};

/**
 * Calculate deviation between two points
 */
export const calculateDeviation = (a: Point3D, b: Point3D): { deviation: Point3D; magnitude: number } => {
  const deviation: Point3D = {
    x: b.x - a.x,
    y: b.y - a.y,
    z: b.z - a.z,
  };
  const magnitude = Math.sqrt(
    deviation.x * deviation.x +
    deviation.y * deviation.y +
    deviation.z * deviation.z
  );
  return { deviation, magnitude };
};
