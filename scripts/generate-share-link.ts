/**
 * Generate a Boxen share link with pre-applied operations.
 *
 * Usage:
 *   npx tsx --import ./scripts/register-lz-compat.mjs scripts/generate-share-link.ts basic
 *   npx tsx --import ./scripts/register-lz-compat.mjs scripts/generate-share-link.ts grid-2x2
 *   npx tsx --import ./scripts/register-lz-compat.mjs scripts/generate-share-link.ts --json '{"width":100,...,"actions":[...]}'
 *
 * Presets: basic, subdivided-x, subdivided-z, grid-2x2, grid-3x3
 */

import { TestFixture } from '../src/test/fixtures';
import { serializeProject } from '../src/utils/urlState';
import type { ProjectState } from '../src/utils/urlState';
import type { Engine } from '../src/engine/Engine';
import type { AssemblySnapshot, VoidSnapshot, MaterialConfig, EngineAction } from '../src/engine/types';
import type { BoxConfig, Face, FaceId, Void, EdgeExtensions } from '../src/types';

// ---------------------------------------------------------------------------
// Snapshot → ProjectState converters (inlined to avoid React imports)
// ---------------------------------------------------------------------------

function voidSnapshotToVoid(snapshot: VoidSnapshot): Void {
  return {
    id: snapshot.id,
    bounds: {
      x: snapshot.derived.bounds.x,
      y: snapshot.derived.bounds.y,
      z: snapshot.derived.bounds.z,
      w: snapshot.derived.bounds.w,
      h: snapshot.derived.bounds.h,
      d: snapshot.derived.bounds.d,
    },
    splitAxis: snapshot.props.splitAxis,
    splitPosition: snapshot.props.splitPosition,
    splitPositionMode: snapshot.props.splitPositionMode,
    splitPercentage: snapshot.props.splitPercentage,
    gridSubdivision: snapshot.props.gridSubdivision,
    children: snapshot.children
      .filter((c): c is VoidSnapshot => c.kind === 'void')
      .map(voidSnapshotToVoid),
  };
}

function assemblySnapshotToConfig(snapshot: AssemblySnapshot): BoxConfig {
  const { props } = snapshot;
  return {
    width: props.width,
    height: props.height,
    depth: props.depth,
    materialThickness: props.material.thickness,
    fingerWidth: props.material.fingerWidth,
    fingerGap: props.material.fingerGap,
    assembly: {
      assemblyAxis: props.assembly.assemblyAxis,
      lids: {
        positive: {
          enabled: true,
          tabDirection: props.assembly.lids.positive.tabDirection,
          inset: props.assembly.lids.positive.inset,
        },
        negative: {
          enabled: true,
          tabDirection: props.assembly.lids.negative.tabDirection,
          inset: props.assembly.lids.negative.inset,
        },
      },
      feet: props.feet
        ? { enabled: props.feet.enabled, height: props.feet.height }
        : undefined,
      faceOffsets: undefined,
    },
  };
}

function buildProjectState(engine: Engine): ProjectState {
  const sceneSnapshot = engine.getSnapshot();
  const assembly = sceneSnapshot.children[0] as AssemblySnapshot | undefined;
  if (!assembly) throw new Error('No assembly found in engine');

  const rootVoidSnapshot = assembly.children.find(
    (c): c is VoidSnapshot => c.kind === 'void',
  );
  if (!rootVoidSnapshot) throw new Error('No root void found in assembly');

  const panelCollection = engine.generatePanelsFromNodes();
  const edgeExtensions: Record<string, EdgeExtensions> = {};
  for (const panel of panelCollection.panels) {
    if (
      panel.edgeExtensions &&
      (panel.edgeExtensions.top !== 0 ||
        panel.edgeExtensions.bottom !== 0 ||
        panel.edgeExtensions.left !== 0 ||
        panel.edgeExtensions.right !== 0)
    ) {
      edgeExtensions[panel.id] = panel.edgeExtensions;
    }
  }

  return {
    config: assemblySnapshotToConfig(assembly),
    faces: assembly.props.faces.map((fc) => ({ id: fc.id, solid: fc.solid })),
    rootVoid: voidSnapshotToVoid(rootVoidSnapshot),
    edgeExtensions,
  };
}

// ---------------------------------------------------------------------------
// Presets (using TestFixture)
// ---------------------------------------------------------------------------

/**
 * Compute evenly-spaced divider positions for N compartments along an axis.
 */
function evenPositions(axisSize: number, mt: number, compartments: number): number[] {
  if (compartments <= 1) return [];
  const lo = mt;
  const hi = axisSize - mt;
  const span = hi - lo;
  const positions: number[] = [];
  for (let i = 1; i < compartments; i++) {
    positions.push(lo + (span * i) / compartments);
  }
  return positions;
}

const W = 100, H = 80, D = 60;
const MT = 3; // default material thickness

type PresetBuilder = () => Engine;

const PRESETS: Record<string, PresetBuilder> = {
  basic: () =>
    TestFixture.enclosedBox(W, H, D).build().engine,

  'subdivided-x': () => {
    const fixture = TestFixture.enclosedBox(W, H, D);
    fixture._queueOperation({
      type: 'ADD_SUBDIVISIONS',
      targetId: 'main-assembly',
      payload: { voidId: 'root', axis: 'x', positions: evenPositions(W, MT, 2) },
    });
    return fixture.build().engine;
  },

  'subdivided-z': () => {
    const fixture = TestFixture.enclosedBox(W, H, D);
    fixture._queueOperation({
      type: 'ADD_SUBDIVISIONS',
      targetId: 'main-assembly',
      payload: { voidId: 'root', axis: 'z', positions: evenPositions(D, MT, 2) },
    });
    return fixture.build().engine;
  },

  'grid-2x2': () => {
    const fixture = TestFixture.enclosedBox(W, H, D);
    fixture._queueOperation({
      type: 'ADD_GRID_SUBDIVISION',
      targetId: 'main-assembly',
      payload: {
        voidId: 'root',
        axes: [
          { axis: 'x', positions: evenPositions(W, MT, 2) },
          { axis: 'z', positions: evenPositions(D, MT, 2) },
        ],
      },
    });
    return fixture.build().engine;
  },

  'grid-3x3': () => {
    const fixture = TestFixture.enclosedBox(W, H, D);
    fixture._queueOperation({
      type: 'ADD_GRID_SUBDIVISION',
      targetId: 'main-assembly',
      payload: {
        voidId: 'root',
        axes: [
          { axis: 'x', positions: evenPositions(W, MT, 3) },
          { axis: 'z', positions: evenPositions(D, MT, 3) },
        ],
      },
    });
    return fixture.build().engine;
  },
};

// ---------------------------------------------------------------------------
// JSON spec mode
// ---------------------------------------------------------------------------

interface JsonSpec {
  width: number;
  height: number;
  depth: number;
  materialThickness?: number;
  fingerWidth?: number;
  fingerGap?: number;
  faces?: Record<string, boolean>;
  actions?: EngineAction[];
}

function buildFromJsonSpec(spec: JsonSpec): Engine {
  const material: MaterialConfig = {
    thickness: spec.materialThickness ?? 3,
    fingerWidth: spec.fingerWidth ?? 10,
    fingerGap: spec.fingerGap ?? 1.5,
  };

  // Start with enclosed box, then open specified faces
  const fixture = TestFixture.enclosedBox(spec.width, spec.height, spec.depth, material);

  if (spec.faces) {
    const openFaces = Object.entries(spec.faces)
      .filter(([, solid]) => !solid)
      .map(([faceId]) => faceId as FaceId);
    if (openFaces.length > 0) {
      fixture.withOpenFaces(openFaces);
    }
  }

  // Queue arbitrary actions
  if (spec.actions) {
    for (const action of spec.actions) {
      fixture._queueOperation(action);
    }
  }

  return fixture.build().engine;
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
let baseUrl = process.env.BOXEN_URL || 'http://localhost:5173';
let jsonInput: string | undefined;
let presetName: string | undefined;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--base-url' && i + 1 < args.length) {
    baseUrl = args[++i];
  } else if (arg === '--json' && i + 1 < args.length) {
    jsonInput = args[++i];
  } else if (!presetName) {
    presetName = arg;
  }
}

if (!presetName && !jsonInput) {
  console.error('Usage: npx tsx --import ./scripts/register-lz-compat.mjs scripts/generate-share-link.ts [--base-url URL] <preset|--json spec>');
  console.error(`\nPresets: ${Object.keys(PRESETS).join(', ')}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

let engine: Engine;

if (jsonInput) {
  let spec: JsonSpec;
  try {
    spec = JSON.parse(jsonInput);
  } catch (e) {
    console.error('Invalid JSON:', (e as Error).message);
    process.exit(1);
  }
  engine = buildFromJsonSpec(spec);
} else {
  const builder = PRESETS[presetName!];
  if (!builder) {
    console.error(`Unknown preset: ${presetName}`);
    console.error(`Available presets: ${Object.keys(PRESETS).join(', ')}`);
    process.exit(1);
  }
  engine = builder();
}

const projectState = buildProjectState(engine);
const compressed = serializeProject(projectState);
const url = `${baseUrl.replace(/\/$/, '')}/?p=${compressed}`;
console.log(url);
