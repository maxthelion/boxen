/**
 * Debug utility for Push/Pull Extend Mode
 * Captures void tree state before and after extend operations
 */

import { Void, Bounds, FaceId } from '../types';
import { setDebug, appendDebug, clearDebug } from './debug';
import { getAllSubdivisions } from '../store/useBoxStore';

// Debug subdivision creation
export const debugSubdivisionCreation = (
  source: 'two-panel' | 'void-selection',
  voidId: string,
  voidBounds: Bounds,
  axis: 'x' | 'y' | 'z',
  positions: number[]
): void => {
  // Clear previous debug for fresh comparison
  clearDebug();

  const lines: string[] = [];
  lines.push(`=== SUBDIVISION REQUEST (${source}) ===`);
  lines.push(`Void ID: ${voidId}`);
  lines.push(`Bounds used for position calc: x=${voidBounds.x}, y=${voidBounds.y}, z=${voidBounds.z}, w=${voidBounds.w}, h=${voidBounds.h}, d=${voidBounds.d}`);
  lines.push(`Axis: ${axis}`);
  lines.push(`Calculated positions: [${positions.map(p => p.toFixed(1)).join(', ')}]`);

  // Calculate what the splitPercentage would be
  const dimStart = axis === 'x' ? voidBounds.x : axis === 'y' ? voidBounds.y : voidBounds.z;
  const dimSize = axis === 'x' ? voidBounds.w : axis === 'y' ? voidBounds.h : voidBounds.d;
  const percentages = positions.map(p => ((p - dimStart) / dimSize).toFixed(3));
  lines.push(`Expected percentages: [${percentages.join(', ')}]`);

  appendDebug(lines.join('\n'));
};

interface VoidSnapshot {
  id: string;
  bounds: Bounds;
  splitAxis?: 'x' | 'y' | 'z';
  splitPosition?: number;
  splitPositionMode?: 'absolute' | 'percentage';
  childCount: number;
}

interface ExtendModeDebugLog {
  timestamp: string;
  faceId: FaceId;
  offset: number;
  oldDimensions: { width: number; height: number; depth: number };
  newDimensions: { width: number; height: number; depth: number };
  deltas: { deltaW: number; deltaH: number; deltaD: number };
  voidsBefore: VoidSnapshot[];
  voidsAfter: VoidSnapshot[];
}

let currentDebugLog: ExtendModeDebugLog | null = null;

const flattenVoidTree = (root: Void, prefix = ''): VoidSnapshot[] => {
  const snapshots: VoidSnapshot[] = [];

  const traverse = (v: Void, depth: number) => {
    snapshots.push({
      id: `${'  '.repeat(depth)}${v.id}`,
      bounds: { ...v.bounds },
      splitAxis: v.splitAxis,
      splitPosition: v.splitPosition,
      splitPositionMode: v.splitPositionMode,
      childCount: v.children?.length || 0,
    });

    for (const child of (v.children || [])) {
      traverse(child, depth + 1);
    }
  };

  traverse(root, 0);
  return snapshots;
};

export const startExtendModeDebug = (
  faceId: FaceId,
  offset: number,
  oldDims: { width: number; height: number; depth: number },
  newDims: { width: number; height: number; depth: number },
  rootVoidBefore: Void
): void => {
  currentDebugLog = {
    timestamp: new Date().toISOString(),
    faceId,
    offset,
    oldDimensions: oldDims,
    newDimensions: newDims,
    deltas: {
      deltaW: newDims.width - oldDims.width,
      deltaH: newDims.height - oldDims.height,
      deltaD: newDims.depth - oldDims.depth,
    },
    voidsBefore: flattenVoidTree(rootVoidBefore),
    voidsAfter: [],
  };
};

export const finishExtendModeDebug = (rootVoidAfter: Void): void => {
  if (currentDebugLog) {
    currentDebugLog.voidsAfter = flattenVoidTree(rootVoidAfter);
    // Write formatted output to global debug, including subdivision info
    let output = formatExtendModeDebugInternal();

    // Add subdivision info
    const subs = getAllSubdivisions(rootVoidAfter);
    if (subs.length > 0) {
      output += '\n\n--- Subdivisions (used for panel generation) ---';
      for (const sub of subs) {
        const b = sub.bounds;
        output += `\n${sub.id}: axis=${sub.axis}, pos=${sub.position.toFixed(1)}, parentBounds(x=${b.x}, y=${b.y}, z=${b.z}, w=${b.w}, h=${b.h}, d=${b.d})`;
      }
    }

    setDebug(output);
  }
};

const formatExtendModeDebugInternal = (): string => {
  if (!currentDebugLog) return 'No extend mode debug data available';

  const log = currentDebugLog;
  const lines: string[] = [];

  lines.push('=== EXTEND MODE DEBUG ===');
  lines.push(`Timestamp: ${log.timestamp}`);
  lines.push(`Face: ${log.faceId}, Offset: ${log.offset}mm`);
  lines.push('');
  lines.push('--- Dimensions ---');
  lines.push(`Before: ${log.oldDimensions.width} x ${log.oldDimensions.height} x ${log.oldDimensions.depth}`);
  lines.push(`After:  ${log.newDimensions.width} x ${log.newDimensions.height} x ${log.newDimensions.depth}`);
  lines.push(`Deltas: dW=${log.deltas.deltaW}, dH=${log.deltas.deltaH}, dD=${log.deltas.deltaD}`);
  lines.push('');

  lines.push('--- Voids BEFORE ---');
  for (const v of log.voidsBefore) {
    const b = v.bounds;
    let line = `${v.id}: bounds(x=${b.x}, y=${b.y}, z=${b.z}, w=${b.w}, h=${b.h}, d=${b.d})`;
    if (v.splitAxis) {
      line += ` split(${v.splitAxis}@${v.splitPosition?.toFixed(1)}, mode=${v.splitPositionMode})`;
    }
    lines.push(line);
  }
  lines.push('');

  lines.push('--- Voids AFTER ---');
  for (const v of log.voidsAfter) {
    const b = v.bounds;
    let line = `${v.id}: bounds(x=${b.x}, y=${b.y}, z=${b.z}, w=${b.w}, h=${b.h}, d=${b.d})`;
    if (v.splitAxis) {
      line += ` split(${v.splitAxis}@${v.splitPosition?.toFixed(1)}, mode=${v.splitPositionMode})`;
    }
    lines.push(line);
  }
  lines.push('');

  // Compare before/after for changes
  lines.push('--- Changes ---');
  const beforeMap = new Map(log.voidsBefore.map(v => [v.id.trim(), v]));
  for (const after of log.voidsAfter) {
    const before = beforeMap.get(after.id.trim());
    if (before) {
      const changes: string[] = [];
      if (before.bounds.x !== after.bounds.x) changes.push(`x: ${before.bounds.x} -> ${after.bounds.x}`);
      if (before.bounds.y !== after.bounds.y) changes.push(`y: ${before.bounds.y} -> ${after.bounds.y}`);
      if (before.bounds.z !== after.bounds.z) changes.push(`z: ${before.bounds.z} -> ${after.bounds.z}`);
      if (before.bounds.w !== after.bounds.w) changes.push(`w: ${before.bounds.w} -> ${after.bounds.w}`);
      if (before.bounds.h !== after.bounds.h) changes.push(`h: ${before.bounds.h} -> ${after.bounds.h}`);
      if (before.bounds.d !== after.bounds.d) changes.push(`d: ${before.bounds.d} -> ${after.bounds.d}`);
      if (before.splitPosition !== after.splitPosition) {
        changes.push(`splitPos: ${before.splitPosition?.toFixed(1)} -> ${after.splitPosition?.toFixed(1)}`);
      }
      if (changes.length > 0) {
        lines.push(`${after.id.trim()}: ${changes.join(', ')}`);
      }
    }
  }

  return lines.join('\n');
};
