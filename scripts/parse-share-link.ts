/**
 * Parse a Boxen share link and display its contents.
 *
 * Usage:
 *   npx tsx scripts/parse-share-link.ts "http://localhost:5173/?p=NoIgLg..."
 *   npx tsx scripts/parse-share-link.ts "NoIgLg..."        # just compressed string
 *   npx tsx scripts/parse-share-link.ts --raw "..."          # output raw JSON
 */

import { deserializeProject } from '../src/utils/urlState';
import type { ProjectState } from '../src/utils/urlState';
import type { Void } from '../src/types';

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
let raw = false;
let input: string | undefined;

for (const arg of args) {
  if (arg === '--raw') {
    raw = true;
  } else if (!input) {
    input = arg;
  }
}

if (!input) {
  console.error('Usage: npx tsx scripts/parse-share-link.ts [--raw] <url-or-compressed-string>');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Extract compressed string from input
// ---------------------------------------------------------------------------

function extractCompressed(value: string): string {
  // Try parsing as URL first
  try {
    const url = new URL(value);
    const p = url.searchParams.get('p');
    if (p) return p;
  } catch {
    // Not a valid URL - continue
  }

  // Try regex for ?p= or &p= (partial URLs without protocol)
  const match = value.match(/[?&]p=([^&]+)/);
  if (match) return match[1];

  // Treat as raw compressed string
  return value;
}

// ---------------------------------------------------------------------------
// Pretty printing
// ---------------------------------------------------------------------------

function formatVoidTree(v: Void, indent = '  ', isLast = true, prefix = ''): string {
  const lines: string[] = [];
  const connector = prefix ? (isLast ? '\u2514\u2500\u2500 ' : '\u251C\u2500\u2500 ') : '';
  const { bounds } = v;
  const size = `${bounds.w.toFixed(1)}x${bounds.h.toFixed(1)}x${bounds.d.toFixed(1)}`;
  const pos = `${bounds.x.toFixed(1)},${bounds.y.toFixed(1)},${bounds.z.toFixed(1)}`;

  let label = `${v.id} (${pos} -> ${size})`;
  if (v.splitAxis && v.splitPosition !== undefined) {
    label += ` [split ${v.splitAxis.toUpperCase()} @ ${v.splitPosition}]`;
  }
  if (v.gridSubdivision) {
    const g = v.gridSubdivision;
    label += ` [grid]`;
  }
  if (v.subAssembly) {
    label += ` [sub-assembly]`;
  }

  lines.push(`${prefix}${connector}${label}`);

  const childPrefix = prefix + (prefix ? (isLast ? '    ' : '\u2502   ') : indent);
  for (let i = 0; i < v.children.length; i++) {
    lines.push(formatVoidTree(v.children[i], indent, i === v.children.length - 1, childPrefix));
  }

  return lines.join('\n');
}

function prettyPrint(state: ProjectState): void {
  const { config, faces, rootVoid, edgeExtensions, panelOperations } = state;

  // Dimensions
  console.log(
    `Dimensions: ${config.width} x ${config.height} x ${config.depth} mm`
  );

  // Material
  console.log(
    `Material: ${config.materialThickness}mm thick, finger ${config.fingerWidth}/${config.fingerGap}`
  );

  // Assembly config
  const ac = config.assembly;
  console.log(`Assembly axis: ${ac.assemblyAxis}`);

  // Faces
  const solidFaces = faces.filter((f) => f.solid).map((f) => f.id);
  const openFaces = faces.filter((f) => !f.solid).map((f) => f.id);
  let faceStr = solidFaces.join(' ');
  if (openFaces.length > 0) {
    faceStr += ` (${openFaces.map((f) => `${f}: OPEN`).join(', ')})`;
  }
  console.log(`Faces: ${faceStr}`);

  // Void tree
  console.log('\nVoid Tree:');
  console.log(formatVoidTree(rootVoid));

  // Edge extensions
  const extKeys = Object.keys(edgeExtensions);
  if (extKeys.length > 0) {
    console.log('\nEdge Extensions:');
    for (const [panelId, ext] of Object.entries(edgeExtensions)) {
      const parts: string[] = [];
      if (ext.top !== 0) parts.push(`top=${ext.top}`);
      if (ext.bottom !== 0) parts.push(`bottom=${ext.bottom}`);
      if (ext.left !== 0) parts.push(`left=${ext.left}`);
      if (ext.right !== 0) parts.push(`right=${ext.right}`);
      console.log(`  ${panelId}: ${parts.join(', ')}`);
    }
  } else {
    console.log('\nEdge Extensions: none');
  }

  // Panel operations
  if (panelOperations && Object.keys(panelOperations).length > 0) {
    console.log('\nPanel Operations:');
    for (const [panelId, ops] of Object.entries(panelOperations)) {
      const parts: string[] = [];
      if (ops.cornerFillets?.length) parts.push(`${ops.cornerFillets.length} corner fillet(s)`);
      if (ops.allCornerFillets?.length) parts.push(`${ops.allCornerFillets.length} all-corner fillet(s)`);
      if (ops.cutouts?.length) parts.push(`${ops.cutouts.length} cutout(s)`);
      console.log(`  ${panelId}: ${parts.join(', ')}`);
    }
  } else {
    console.log('\nPanel Operations: none');
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const compressed = extractCompressed(input);
const state = deserializeProject(compressed);

if (!state) {
  console.error('Failed to deserialize project. The input may be malformed.');
  process.exit(1);
}

if (raw) {
  console.log(JSON.stringify(state, null, 2));
} else {
  prettyPrint(state);
}
