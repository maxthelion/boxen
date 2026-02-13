/**
 * Helpers for build-assembly scripts. Generated scripts import `output()`
 * from this module to serialize an engine to a share link URL.
 */

import { serializeProject } from '../src/utils/urlState';
import type { ProjectState } from '../src/utils/urlState';
import type { Engine } from '../src/engine/Engine';
import type { AssemblySnapshot, VoidSnapshot } from '../src/engine/types';
import type { BoxConfig, Void, EdgeExtensions } from '../src/types';

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
        ? { enabled: props.feet.enabled, height: props.feet.height, width: props.feet.width, inset: props.feet.inset }
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

/**
 * Serialize an engine's state to a share link URL and print it to stdout.
 */
export function output(engine: Engine): void {
  const baseUrl = process.env.BOXEN_URL || 'http://localhost:5173';
  const projectState = buildProjectState(engine);
  const compressed = serializeProject(projectState);
  const url = `${baseUrl.replace(/\/$/, '')}/?p=${compressed}`;
  console.log(url);
}
