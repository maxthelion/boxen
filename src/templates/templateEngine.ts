/**
 * Template Engine
 *
 * Replays template action sequences with user-provided variable values.
 * Creates assemblies and dispatches actions to the engine.
 */

import { Engine } from '../engine/Engine';
import { EngineAction, Axis, Bounds3D, VoidSnapshot, AssemblySnapshot } from '../engine/types';
import { ProjectTemplate, TemplateAction, InstantiationValues } from './types';

/**
 * Resolve template target IDs to actual IDs
 * $assembly -> main-assembly, $rootVoid -> root
 */
function resolveTargetIds(action: TemplateAction): EngineAction {
  const resolvedPayload = { ...action.payload };

  // Resolve voidId if present
  if (resolvedPayload.voidId === '$rootVoid') {
    resolvedPayload.voidId = 'root';
  }

  return {
    type: action.type,
    targetId: action.targetId.replace('$assembly', 'main-assembly'),
    payload: resolvedPayload,
  } as EngineAction;
}

/**
 * Compute evenly-spaced subdivision positions for a void
 */
function computePositionsForVoid(
  voidBounds: Bounds3D,
  axis: Axis,
  compartmentCount: number
): number[] {
  // Get dimension along subdivision axis
  const axisDimension =
    axis === 'x' ? voidBounds.w : axis === 'y' ? voidBounds.h : voidBounds.d;

  // Get start position along the axis
  const axisStart =
    axis === 'x' ? voidBounds.x : axis === 'y' ? voidBounds.y : voidBounds.z;

  // For N compartments, we need N-1 dividers
  const dividerCount = compartmentCount - 1;
  if (dividerCount <= 0) return [];

  // Calculate evenly-spaced positions within the void
  const spacing = axisDimension / compartmentCount;
  const positions: number[] = [];

  for (let i = 1; i <= dividerCount; i++) {
    // Position is relative to the assembly origin, not the void
    positions.push(axisStart + spacing * i);
  }

  return positions;
}

/**
 * Recursively get leaf void info from a void snapshot
 */
interface VoidInfo {
  id: string;
  bounds: Bounds3D;
}

function getLeafVoidsFromVoidSnapshot(voidSnapshot: VoidSnapshot): VoidInfo[] {
  const leaves: VoidInfo[] = [];

  function traverse(v: VoidSnapshot) {
    // A void is a leaf if it has no children or only has sub-assemblies
    const voidChildren = v.children.filter((c): c is VoidSnapshot => c.kind === 'void');
    if (voidChildren.length === 0) {
      leaves.push({ id: v.id, bounds: v.derived.bounds });
    } else {
      for (const child of voidChildren) {
        traverse(child);
      }
    }
  }

  traverse(voidSnapshot);
  return leaves;
}

/**
 * Generate subdivision actions for all current leaf voids
 * This handles multi-axis grids by applying subdivisions to each leaf void
 */
function generateSubdivisionActionsForLeafVoids(
  engine: Engine,
  axis: Axis,
  compartmentCount: number,
  options?: { preview?: boolean }
): void {
  // Get the active snapshot (preview if active, otherwise main)
  const snapshot = engine.getSnapshot();

  // Find the main assembly
  const assembly = snapshot.children.find(
    (c): c is AssemblySnapshot => c.kind === 'assembly'
  );
  if (!assembly) return;

  // Get root voids (children of the assembly)
  const rootVoids = assembly.children.filter((c): c is VoidSnapshot => c.kind === 'void');
  if (rootVoids.length === 0) return;

  // Get all leaf voids from all root voids
  const leafVoids: VoidInfo[] = [];
  for (const rootVoid of rootVoids) {
    leafVoids.push(...getLeafVoidsFromVoidSnapshot(rootVoid));
  }

  // For each leaf void, compute positions and dispatch subdivision action
  for (const leafVoid of leafVoids) {
    const bounds = leafVoid.bounds;
    const positions = computePositionsForVoid(bounds, axis, compartmentCount);

    if (positions.length > 0) {
      const action: EngineAction = {
        type: 'ADD_SUBDIVISIONS',
        targetId: 'main-assembly',
        payload: {
          voidId: leafVoid.id,
          axis,
          positions,
        },
      };
      engine.dispatch(action, options);
    }
  }
}

/**
 * Generate a grid subdivision action for the root void
 * This creates full-spanning dividers with proper cross-lap joints
 */
function generateGridSubdivisionAction(
  engine: Engine,
  axesConfig: { axis: Axis; count: number }[],
  options?: { preview?: boolean }
): void {
  // Get the active snapshot
  const snapshot = engine.getSnapshot();

  // Find the main assembly
  const assembly = snapshot.children.find(
    (c): c is AssemblySnapshot => c.kind === 'assembly'
  );
  if (!assembly) return;

  // Get root void
  const rootVoid = assembly.children.find((c): c is VoidSnapshot => c.kind === 'void');
  if (!rootVoid) return;

  const bounds = rootVoid.derived.bounds;

  // Build axes array with computed positions
  const axes = axesConfig
    .filter(({ count }) => count > 1) // Only include axes with actual subdivisions
    .map(({ axis, count }) => ({
      axis,
      positions: computePositionsForVoid(bounds, axis, count),
    }))
    .filter(({ positions }) => positions.length > 0);

  if (axes.length === 0) return;

  const action: EngineAction = {
    type: 'ADD_GRID_SUBDIVISION',
    targetId: 'main-assembly',
    payload: {
      voidId: rootVoid.id,
      axes,
    },
  };

  engine.dispatch(action, options);
}

/**
 * Instantiate a template into an engine
 *
 * This creates a new assembly and replays all actions with the provided values.
 * Can be used with preview or main scene.
 *
 * @param template - The template to instantiate
 * @param values - User-provided variable values
 * @param engine - The engine to instantiate into
 * @param options - Optional configuration (e.g., preview mode)
 */
export function instantiateTemplate(
  template: ProjectTemplate,
  values: InstantiationValues,
  engine: Engine,
  options?: { preview?: boolean }
): void {
  const mt = template.initialAssembly.materialThickness;

  // Clear any existing assemblies to ensure a clean slate
  engine.clearScene();

  // Create assembly with user-specified dimensions
  // Note: This creates in the main scene; for preview, engine should already have startPreview() called
  engine.createAssembly(values.width, values.height, values.depth, {
    thickness: mt,
    fingerWidth: template.initialAssembly.fingerWidth,
    fingerGap: template.initialAssembly.fingerGap,
  });

  // Replay each action in the sequence
  for (const templateAction of template.actionSequence) {
    if (templateAction.gridSubdivisionConfig) {
      // This is a grid subdivision action - creates full-spanning dividers on multiple axes
      const axesConfig = templateAction.gridSubdivisionConfig.axes.map(({ axis, defaultCount }) => ({
        axis,
        count: values.subdivisionCounts?.[axis] ?? defaultCount,
      }));

      // Generate and dispatch grid subdivision action for the root void
      generateGridSubdivisionAction(engine, axesConfig, options);
    } else if (templateAction.subdivisionConfig) {
      // This is a parameterized subdivision action
      // For multi-axis grids, we need to subdivide ALL current leaf voids
      const { axis } = templateAction.subdivisionConfig;
      const count =
        values.subdivisionCounts?.[axis] ?? templateAction.subdivisionConfig.defaultCount;

      // Generate and dispatch subdivision actions for all leaf voids
      generateSubdivisionActionsForLeafVoids(engine, axis, count, options);
    } else {
      // Regular action - dispatch with resolved target IDs
      const resolvedAction = resolveTargetIds(templateAction);
      engine.dispatch(resolvedAction, options);
    }
  }
}

/**
 * Instantiate a template into the preview scene
 *
 * This clears any existing preview, starts a new preview,
 * and replays the template into it.
 */
export function instantiateTemplateIntoPreview(
  template: ProjectTemplate,
  values: InstantiationValues,
  engine: Engine
): void {
  // Clear any existing preview and main assembly
  engine.discardPreview();

  // Clear the main scene by replacing it with a fresh one
  // We need to remove any existing assembly first
  const existingAssembly = engine.assembly;
  if (existingAssembly) {
    // The engine doesn't have a removeAssembly method, so we'll work around this
    // by starting fresh with preview
  }

  // Start preview mode
  engine.startPreview();

  // Instantiate into preview
  instantiateTemplate(template, values, engine, { preview: true });
}

/**
 * Compute subdivision positions for a given count
 * Utility for UI components that need to show preview info
 */
export function computeSubdivisionPositions(
  axis: Axis,
  compartmentCount: number,
  dimensions: { width: number; height: number; depth: number },
  materialThickness: number
): number[] {
  const axisDimension =
    axis === 'x' ? dimensions.width : axis === 'y' ? dimensions.height : dimensions.depth;

  const interiorSize = axisDimension - 2 * materialThickness;
  const dividerCount = compartmentCount - 1;

  if (dividerCount <= 0) return [];

  const spacing = interiorSize / compartmentCount;
  const positions: number[] = [];

  for (let i = 1; i <= dividerCount; i++) {
    positions.push(materialThickness + spacing * i);
  }

  return positions;
}
