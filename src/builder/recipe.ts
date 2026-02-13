/**
 * JSON Recipe Schema, Validator, and Interpreter.
 *
 * The LLM returns a structured JSON recipe that this module validates
 * and translates into AssemblyBuilder calls. No eval(), no dynamic code.
 */

import { AssemblyBuilder } from './AssemblyBuilder';
import { rect, circle, polygon } from './shapes';
import type { FaceId } from '../types';
import type { Axis, CornerKey } from '../engine/types';
import type { Engine } from '../engine/Engine';
import type { EdgeId } from './PanelBuilder';

// =============================================================================
// Recipe Types
// =============================================================================

export interface AssemblyRecipe {
  type: 'basicBox' | 'enclosedBox';
  width: number;
  height: number;
  depth: number;
  openFaces?: string[];
  material?: { thickness?: number; fingerWidth?: number; fingerGap?: number };
  feet?: { height: number; width: number; inset: number; gap?: number };
  lid?: { face: 'positive' | 'negative'; tabDirection: 'tabs-in' | 'tabs-out' };
  axis?: 'x' | 'y' | 'z';
  subdivisions?: SubdivisionStep[];
  panels?: PanelStep[];
}

export interface SubdivisionStep {
  type: 'grid' | 'subdivideEvenly';
  void: string;
  axis?: 'x' | 'y' | 'z';
  columns?: number;
  rows?: number;
  count?: number;
}

export interface CutoutShape {
  shape: 'rect' | 'circle' | 'polygon';
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  cx?: number;
  cy?: number;
  radius?: number;
  points?: [number, number][];
}

export interface PanelStep {
  face: string;
  extensions?: Record<string, number>;
  cutouts?: CutoutShape[];
  fillets?: { corners: string[]; radius: number }[];
}

// =============================================================================
// Limits
// =============================================================================

const LIMITS = {
  maxDimension: 2000,
  maxGridColumns: 20,
  maxGridRows: 20,
  maxSubdivisions: 50,
  maxExtension: 200,
  maxCutoutsPerPanel: 20,
  maxPanelOperations: 50,
  maxFilletRadius: 100,
} as const;

// =============================================================================
// Validation
// =============================================================================

const VALID_FACES: string[] = ['top', 'bottom', 'left', 'right', 'front', 'back'];
const VALID_EDGES: string[] = ['top', 'bottom', 'left', 'right'];
const VALID_CORNERS: string[] = ['bottom:left', 'bottom:right', 'left:top', 'right:top'];
const VALID_AXES: string[] = ['x', 'y', 'z'];
const VALID_SUBDIVISION_AXES: string[] = ['x', 'y', 'z'];

function assertNumber(value: unknown, field: string): asserts value is number {
  if (typeof value !== 'number' || !isFinite(value)) {
    throw new RecipeError(`${field} must be a finite number, got ${typeof value}`);
  }
}

function assertPositiveNumber(value: unknown, field: string): asserts value is number {
  assertNumber(value, field);
  if (value <= 0) {
    throw new RecipeError(`${field} must be positive, got ${value}`);
  }
}

export class RecipeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecipeError';
  }
}

/** Known top-level keys in AssemblyRecipe */
const KNOWN_TOP_LEVEL_KEYS = new Set([
  'type', 'width', 'height', 'depth', 'openFaces', 'material',
  'feet', 'lid', 'axis', 'subdivisions', 'panels',
]);

export function validateRecipe(raw: unknown): AssemblyRecipe {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new RecipeError('Recipe must be a JSON object');
  }

  const obj = raw as Record<string, unknown>;

  // Reject unknown top-level fields
  for (const key of Object.keys(obj)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
      throw new RecipeError(`Unknown recipe field: "${key}"`);
    }
  }

  // type
  if (obj.type !== 'basicBox' && obj.type !== 'enclosedBox') {
    throw new RecipeError(`type must be "basicBox" or "enclosedBox", got "${obj.type}"`);
  }

  // dimensions
  assertPositiveNumber(obj.width, 'width');
  assertPositiveNumber(obj.height, 'height');
  assertPositiveNumber(obj.depth, 'depth');

  const mt = (obj.material as Record<string, unknown>)?.thickness;
  const minDim = typeof mt === 'number' && mt > 0 ? mt * 3 : 10;

  if ((obj.width as number) < minDim) {
    throw new RecipeError(`Width ${obj.width}mm is too small — minimum is ${minDim}mm (3× material thickness). Try a larger dimension.`);
  }
  if ((obj.height as number) < minDim) {
    throw new RecipeError(`Height ${obj.height}mm is too small — minimum is ${minDim}mm (3× material thickness). Try a larger dimension.`);
  }
  if ((obj.depth as number) < minDim) {
    throw new RecipeError(`Depth ${obj.depth}mm is too small — minimum is ${minDim}mm (3× material thickness). Try a larger dimension.`);
  }
  if ((obj.width as number) > LIMITS.maxDimension) {
    throw new RecipeError(`Width ${obj.width}mm exceeds the maximum of ${LIMITS.maxDimension}mm.`);
  }
  if ((obj.height as number) > LIMITS.maxDimension) {
    throw new RecipeError(`Height ${obj.height}mm exceeds the maximum of ${LIMITS.maxDimension}mm.`);
  }
  if ((obj.depth as number) > LIMITS.maxDimension) {
    throw new RecipeError(`Depth ${obj.depth}mm exceeds the maximum of ${LIMITS.maxDimension}mm.`);
  }

  // openFaces
  if (obj.openFaces !== undefined) {
    if (!Array.isArray(obj.openFaces)) {
      throw new RecipeError('openFaces must be an array');
    }
    for (const face of obj.openFaces) {
      if (typeof face !== 'string' || !VALID_FACES.includes(face)) {
        throw new RecipeError(`Invalid face in openFaces: "${face}". Valid: ${VALID_FACES.join(', ')}`);
      }
    }
  }

  // material
  if (obj.material !== undefined) {
    if (typeof obj.material !== 'object' || obj.material === null) {
      throw new RecipeError('material must be an object');
    }
    const mat = obj.material as Record<string, unknown>;
    const knownMatKeys = new Set(['thickness', 'fingerWidth', 'fingerGap']);
    for (const key of Object.keys(mat)) {
      if (!knownMatKeys.has(key)) {
        throw new RecipeError(`Unknown material field: "${key}"`);
      }
    }
    if (mat.thickness !== undefined) assertPositiveNumber(mat.thickness, 'material.thickness');
    if (mat.fingerWidth !== undefined) assertPositiveNumber(mat.fingerWidth, 'material.fingerWidth');
    if (mat.fingerGap !== undefined) assertPositiveNumber(mat.fingerGap, 'material.fingerGap');
  }

  // feet
  if (obj.feet !== undefined) {
    if (typeof obj.feet !== 'object' || obj.feet === null) {
      throw new RecipeError('feet must be an object');
    }
    const feet = obj.feet as Record<string, unknown>;
    assertPositiveNumber(feet.height, 'feet.height');
    assertPositiveNumber(feet.width, 'feet.width');
    assertNumber(feet.inset, 'feet.inset');
  }

  // lid
  if (obj.lid !== undefined) {
    if (typeof obj.lid !== 'object' || obj.lid === null) {
      throw new RecipeError('lid must be an object');
    }
    const lid = obj.lid as Record<string, unknown>;
    if (lid.face !== 'positive' && lid.face !== 'negative') {
      throw new RecipeError('lid.face must be "positive" or "negative"');
    }
    if (lid.tabDirection !== 'tabs-in' && lid.tabDirection !== 'tabs-out') {
      throw new RecipeError('lid.tabDirection must be "tabs-in" or "tabs-out"');
    }
  }

  // axis
  if (obj.axis !== undefined) {
    if (typeof obj.axis !== 'string' || !VALID_AXES.includes(obj.axis)) {
      throw new RecipeError(`axis must be one of ${VALID_AXES.join(', ')}, got "${obj.axis}"`);
    }
  }

  // subdivisions
  let totalSubdivisions = 0;
  if (obj.subdivisions !== undefined) {
    if (!Array.isArray(obj.subdivisions)) {
      throw new RecipeError('subdivisions must be an array');
    }
    for (let i = 0; i < obj.subdivisions.length; i++) {
      const step = obj.subdivisions[i] as Record<string, unknown>;
      if (typeof step !== 'object' || step === null) {
        throw new RecipeError(`subdivisions[${i}] must be an object`);
      }
      if (step.type !== 'grid' && step.type !== 'subdivideEvenly') {
        throw new RecipeError(`subdivisions[${i}].type must be "grid" or "subdivideEvenly"`);
      }
      if (typeof step.void !== 'string') {
        throw new RecipeError(`subdivisions[${i}].void must be a string`);
      }

      if (step.type === 'grid') {
        if (step.columns !== undefined) {
          assertPositiveNumber(step.columns, `subdivisions[${i}].columns`);
          if (step.columns > LIMITS.maxGridColumns) {
            throw new RecipeError(`Grid too large — maximum ${LIMITS.maxGridColumns} columns`);
          }
        }
        if (step.rows !== undefined) {
          assertPositiveNumber(step.rows, `subdivisions[${i}].rows`);
          if (step.rows > LIMITS.maxGridRows) {
            throw new RecipeError(`Grid too large — maximum ${LIMITS.maxGridRows} rows`);
          }
        }
        const cols = (step.columns as number) || 1;
        const rows = (step.rows as number) || 1;
        totalSubdivisions += (cols - 1) + (rows - 1);
      } else {
        // subdivideEvenly
        if (step.axis !== undefined) {
          if (typeof step.axis !== 'string' || !VALID_SUBDIVISION_AXES.includes(step.axis)) {
            throw new RecipeError(`subdivisions[${i}].axis must be "x" or "z", got "${step.axis}"`);
          }
        }
        if (step.count !== undefined) {
          assertPositiveNumber(step.count, `subdivisions[${i}].count`);
          totalSubdivisions += (step.count as number) - 1;
        }
      }
    }
    if (totalSubdivisions > LIMITS.maxSubdivisions) {
      throw new RecipeError(`Too many subdivisions — maximum ${LIMITS.maxSubdivisions} dividers total, recipe creates ${totalSubdivisions}`);
    }
  }

  // panels
  let totalPanelOps = 0;
  if (obj.panels !== undefined) {
    if (!Array.isArray(obj.panels)) {
      throw new RecipeError('panels must be an array');
    }
    for (let i = 0; i < obj.panels.length; i++) {
      const panel = obj.panels[i] as Record<string, unknown>;
      if (typeof panel !== 'object' || panel === null) {
        throw new RecipeError(`panels[${i}] must be an object`);
      }
      if (typeof panel.face !== 'string' || !VALID_FACES.includes(panel.face)) {
        throw new RecipeError(`panels[${i}].face must be a valid face, got "${panel.face}"`);
      }

      // extensions
      if (panel.extensions !== undefined) {
        if (typeof panel.extensions !== 'object' || panel.extensions === null) {
          throw new RecipeError(`panels[${i}].extensions must be an object`);
        }
        const ext = panel.extensions as Record<string, unknown>;
        for (const [edge, value] of Object.entries(ext)) {
          if (!VALID_EDGES.includes(edge)) {
            throw new RecipeError(`Can't extend edge "${edge}" on ${panel.face} panel — valid edges are: ${VALID_EDGES.join(', ')}. Try rephrasing your description.`);
          }
          assertPositiveNumber(value, `panels[${i}].extensions.${edge}`);
          if ((value as number) > LIMITS.maxExtension) {
            throw new RecipeError(`Extension too large — maximum ${LIMITS.maxExtension}mm`);
          }
          totalPanelOps++;
        }
      }

      // cutouts
      if (panel.cutouts !== undefined) {
        if (!Array.isArray(panel.cutouts)) {
          throw new RecipeError(`panels[${i}].cutouts must be an array`);
        }
        if (panel.cutouts.length > LIMITS.maxCutoutsPerPanel) {
          throw new RecipeError(`Too many cutouts on panels[${i}] — maximum ${LIMITS.maxCutoutsPerPanel}`);
        }
        for (let j = 0; j < panel.cutouts.length; j++) {
          const cutout = panel.cutouts[j] as Record<string, unknown>;
          if (typeof cutout !== 'object' || cutout === null) {
            throw new RecipeError(`panels[${i}].cutouts[${j}] must be an object`);
          }
          if (cutout.shape !== 'rect' && cutout.shape !== 'circle' && cutout.shape !== 'polygon') {
            throw new RecipeError(`panels[${i}].cutouts[${j}].shape must be "rect", "circle", or "polygon"`);
          }
          totalPanelOps++;
        }
      }

      // fillets
      if (panel.fillets !== undefined) {
        if (!Array.isArray(panel.fillets)) {
          throw new RecipeError(`panels[${i}].fillets must be an array`);
        }
        for (let j = 0; j < panel.fillets.length; j++) {
          const fillet = panel.fillets[j] as Record<string, unknown>;
          if (typeof fillet !== 'object' || fillet === null) {
            throw new RecipeError(`panels[${i}].fillets[${j}] must be an object`);
          }
          if (!Array.isArray(fillet.corners)) {
            throw new RecipeError(`panels[${i}].fillets[${j}].corners must be an array`);
          }
          for (const corner of fillet.corners as unknown[]) {
            if (typeof corner !== 'string' || !VALID_CORNERS.includes(corner)) {
              throw new RecipeError(`Invalid corner: "${corner}". Valid: ${VALID_CORNERS.join(', ')}`);
            }
          }
          assertPositiveNumber(fillet.radius, `panels[${i}].fillets[${j}].radius`);
          if ((fillet.radius as number) > LIMITS.maxFilletRadius) {
            throw new RecipeError(`Fillet radius too large — maximum ${LIMITS.maxFilletRadius}mm`);
          }
          totalPanelOps += (fillet.corners as unknown[]).length;
        }
      }
    }
    if (totalPanelOps > LIMITS.maxPanelOperations) {
      throw new RecipeError(`Too many panel operations — maximum ${LIMITS.maxPanelOperations}, recipe has ${totalPanelOps}`);
    }
  }

  return obj as unknown as AssemblyRecipe;
}

// =============================================================================
// Interpreter
// =============================================================================

/** Map of void selectors by name. 'root' is always available. */
type VoidMap = Map<string, string>;

function resolveVoidSelector(voidRef: string, voidMap: VoidMap): string {
  const id = voidMap.get(voidRef);
  if (id) return id;
  // LLMs often get the void reference wrong — fall back to 'root' if it's the only option
  if (voidMap.size === 1 && voidMap.has('root')) {
    return voidMap.get('root')!;
  }
  throw new RecipeError(`Unknown void reference: "${voidRef}". Available: ${[...voidMap.keys()].join(', ')}`);
}

export function executeRecipe(recipe: AssemblyRecipe): { engine: Engine } {
  // Create builder
  const material = recipe.material
    ? {
        thickness: recipe.material.thickness ?? 3,
        fingerWidth: recipe.material.fingerWidth ?? 10,
        fingerGap: recipe.material.fingerGap ?? 1.5,
      }
    : undefined;

  let builder: AssemblyBuilder;
  if (recipe.type === 'basicBox') {
    builder = material
      ? AssemblyBuilder.basicBox(recipe.width, recipe.height, recipe.depth, material)
      : AssemblyBuilder.basicBox(recipe.width, recipe.height, recipe.depth);
  } else {
    builder = material
      ? AssemblyBuilder.enclosedBox(recipe.width, recipe.height, recipe.depth, material)
      : AssemblyBuilder.enclosedBox(recipe.width, recipe.height, recipe.depth);
  }

  // Open faces
  if (recipe.openFaces && recipe.openFaces.length > 0) {
    const currentOpen = recipe.type === 'basicBox' ? ['top'] : [];
    const desired = recipe.openFaces as FaceId[];
    // Only call withOpenFaces if different from default
    const defaultStr = currentOpen.sort().join(',');
    const desiredStr = [...desired].sort().join(',');
    if (defaultStr !== desiredStr) {
      builder.withOpenFaces(desired);
    }
  }

  // Axis
  if (recipe.axis) {
    builder.withAxis(recipe.axis as Axis);
  }

  // Lid config
  if (recipe.lid) {
    builder.withLid(recipe.lid.face, { tabDirection: recipe.lid.tabDirection });
  }

  // Feet
  if (recipe.feet) {
    builder.withFeet({
      enabled: true,
      height: recipe.feet.height,
      width: recipe.feet.width,
      inset: recipe.feet.inset,
      gap: recipe.feet.gap ?? 0,
    });
  }

  // Build a void map for subdivision targeting
  const voidMap: VoidMap = new Map();
  // 'root' maps to the engine's root void
  const assembly = builder._getEngine().assembly;
  if (assembly) {
    voidMap.set('root', assembly.rootVoid.id);
  }

  // Determine which subdivision axes would create inaccessible sealed compartments.
  // A divider parallel to an open face is fine (compartments face the opening).
  // A divider perpendicular to ALL open faces seals off compartments.
  // Each face pair maps to the axis perpendicular to it:
  //   top/bottom → y,  front/back → z,  left/right → x
  // An axis is blocked if dividers along it would be parallel to a closed face
  // that has no corresponding open face on either side.
  const openFaceSet = new Set(recipe.openFaces ?? (recipe.type === 'basicBox' ? ['top'] : []));
  const blockedAxes = new Set<string>();
  // Y-axis dividers are parallel to top/bottom — blocked unless top or bottom is open
  if (!openFaceSet.has('top') && !openFaceSet.has('bottom')) blockedAxes.add('y');
  // Z-axis dividers are parallel to front/back — blocked unless front or back is open
  if (!openFaceSet.has('front') && !openFaceSet.has('back')) blockedAxes.add('z');
  // X-axis dividers are parallel to left/right — blocked unless left or right is open
  if (!openFaceSet.has('left') && !openFaceSet.has('right')) blockedAxes.add('x');

  // Subdivisions
  if (recipe.subdivisions) {
    for (const step of recipe.subdivisions) {
      const voidId = resolveVoidSelector(step.void, voidMap);

      if (step.type === 'grid') {
        const cols = step.columns ?? 1;
        const rows = step.rows ?? 1;
        builder.grid(() => voidId, cols, rows);

        // Register child voids
        for (let i = 0; i < cols * rows; i++) {
          try {
            const childId = builder.childVoid(i);
            voidMap.set(`child:${i}`, childId);
          } catch {
            // Out of range, stop
            break;
          }
        }
      } else {
        // subdivideEvenly
        const axis = (step.axis ?? 'x') as Axis;
        const count = step.count ?? 2;

        if (blockedAxes.has(axis)) {
          const axisName = { x: 'left-right', y: 'horizontal', z: 'front-back' }[axis];
          const suggestion = ['x', 'y', 'z'].filter(a => !blockedAxes.has(a)).join(' or ');
          throw new RecipeError(
            `Can't subdivide along the ${axis}-axis (${axisName}) — all compartments would be sealed with no open face to access them. ` +
            (suggestion ? `Try the ${suggestion} axis instead.` : 'Open a face first.')
          );
        }

        builder.subdivideEvenly(() => voidId, axis, count);

        // Register child voids
        for (let i = 0; i < count; i++) {
          try {
            const childId = builder.childVoid(i);
            voidMap.set(`child:${i}`, childId);
          } catch {
            break;
          }
        }
      }
    }
  }

  // Panel operations
  if (recipe.panels) {
    for (const panelStep of recipe.panels) {
      const face = panelStep.face as FaceId;
      let panelBuilder = builder.panel(face);

      // Extensions
      if (panelStep.extensions) {
        for (const [edge, amount] of Object.entries(panelStep.extensions)) {
          panelBuilder = panelBuilder.withExtension(edge as EdgeId, amount);
        }
      }

      // Cutouts
      if (panelStep.cutouts) {
        for (const cutout of panelStep.cutouts) {
          let shape;
          if (cutout.shape === 'rect') {
            shape = rect(cutout.x ?? 0, cutout.y ?? 0, cutout.width ?? 10, cutout.height ?? 10);
          } else if (cutout.shape === 'circle') {
            shape = circle(cutout.cx ?? 0, cutout.cy ?? 0, cutout.radius ?? 5);
          } else if (cutout.shape === 'polygon' && cutout.points) {
            shape = polygon(...cutout.points);
          } else {
            continue;
          }
          panelBuilder = panelBuilder.withCutout(shape);
        }
      }

      // Fillets
      if (panelStep.fillets) {
        for (const fillet of panelStep.fillets) {
          panelBuilder = panelBuilder.withFillet(fillet.corners as CornerKey[], fillet.radius);
        }
      }

      // Return to builder
      panelBuilder.and();
    }
  }

  const { engine } = builder.build();
  return { engine };
}
