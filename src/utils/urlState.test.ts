/**
 * URL State serialization round-trip tests.
 *
 * Verifies that edge extensions survive serialize → deserialize → engine application.
 */

import { describe, it, expect } from 'vitest';
import { serializeProject, deserializeProject, getPanelCanonicalKeyFromPath, type ProjectState } from './urlState';
import { Engine } from '../engine/Engine';
import type { MaterialConfig } from '../engine/types';
import type { BoxConfig, Face, FaceId, EdgeExtensions } from '../types';

const material: MaterialConfig = { thickness: 6, fingerWidth: 10, fingerGap: 10 };

function makeConfig(width = 200, height = 100, depth = 150): BoxConfig {
  return {
    width,
    height,
    depth,
    materialThickness: material.thickness,
    fingerWidth: material.fingerWidth,
    fingerGap: material.fingerGap,
    assembly: {
      assemblyAxis: 'y',
      lids: {
        positive: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
        negative: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
      },
    },
  };
}

function makeFaces(openFaces: string[] = ['top']): Face[] {
  return (['front', 'back', 'left', 'right', 'top', 'bottom'] as FaceId[]).map(id => ({
    id,
    solid: !openFaces.includes(id),
  }));
}

/** Simulate the loadFromUrl flow: deserialize → create engine → apply extensions → read panels */
function loadIntoEngine(state: ProjectState) {
  const engine = new Engine();
  const assembly = engine.createAssembly(
    state.config.width,
    state.config.height,
    state.config.depth,
    material,
  );

  // Sync faces
  for (const face of state.faces) {
    assembly.setFaceSolid(face.id, face.solid);
  }

  // Sync assembly config
  assembly.setAssemblyAxis(state.config.assembly.assemblyAxis);
  assembly.setLidConfig('positive', state.config.assembly.lids.positive);
  assembly.setLidConfig('negative', state.config.assembly.lids.negative);

  // Apply edge extensions using canonical keys (same as urlSlice.ts loadFromUrl)
  const edgeExtensionsMap = state.edgeExtensions;
  if (Object.keys(edgeExtensionsMap).length > 0) {
    const newPanels = engine.generatePanelsFromNodes();
    const keyToPanel = new Map<string, { id: string }>();
    for (const p of newPanels.panels) {
      keyToPanel.set(getPanelCanonicalKeyFromPath(p), p);
    }

    for (const [key, ext] of Object.entries(edgeExtensionsMap)) {
      const panel = keyToPanel.get(key);
      if (panel) {
        assembly.setPanelEdgeExtensions(panel.id, ext);
      }
    }
  }

  // Re-read panels after extensions are applied (this is what rendering does)
  const panels = engine.generatePanelsFromNodes();
  return { engine, panels };
}

describe('URL State Edge Extension Round-Trip', () => {
  it('serialization round-trip preserves edge extensions', () => {
    // 1. Create engine with extensions
    const engine = new Engine();
    const config = makeConfig();
    const faces = makeFaces(['top']);
    const assembly = engine.createAssembly(config.width, config.height, config.depth, material);

    for (const face of faces) {
      assembly.setFaceSolid(face.id, face.solid);
    }

    // Generate panels to get UUIDs
    const initialPanels = engine.generatePanelsFromNodes();
    const frontPanel = initialPanels.panels.find(p => p.source.faceId === 'front');
    expect(frontPanel).toBeDefined();

    // Set extension on front panel's top edge
    assembly.setPanelEdgeExtensions(frontPanel!.id, { top: 20, bottom: 0, left: 0, right: 0 });

    // Re-read panels to get extensions
    const panelsWithExt = engine.generatePanelsFromNodes();
    const frontWithExt = panelsWithExt.panels.find(p => p.source.faceId === 'front');
    expect(frontWithExt!.edgeExtensions?.top).toBe(20);

    // Verify outline reflects extension on source engine
    // Panel outline is centered at origin, so base goes from -height/2 to +height/2
    const srcMaxY = Math.max(...frontWithExt!.outline.points.map(p => p.y));
    const halfHeight = frontWithExt!.height / 2;  // 50
    // With 20mm top extension, maxY should be halfHeight + 20 = 70
    expect(srcMaxY).toBeCloseTo(halfHeight + 20, 0);

    // 2. Serialize (same logic as urlSlice.ts saveToUrl)
    const edgeExtensions: Record<string, EdgeExtensions> = {};
    for (const panel of panelsWithExt.panels) {
      if (panel.edgeExtensions && (
        panel.edgeExtensions.top !== 0 ||
        panel.edgeExtensions.bottom !== 0 ||
        panel.edgeExtensions.left !== 0 ||
        panel.edgeExtensions.right !== 0
      )) {
        edgeExtensions[getPanelCanonicalKeyFromPath(panel)] = panel.edgeExtensions;
      }
    }

    expect(Object.keys(edgeExtensions)).toContain('face:front');
    expect(edgeExtensions['face:front'].top).toBe(20);

    const projectState: ProjectState = {
      config,
      faces,
      rootVoid: {
        id: 'root',
        bounds: { x: 6, y: 6, z: 6, w: 188, h: 88, d: 138 },
        children: [],
      },
      edgeExtensions,
    };

    const encoded = serializeProject(projectState);
    const decoded = deserializeProject(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded!.edgeExtensions['face:front']).toEqual({ top: 20, bottom: 0, left: 0, right: 0 });

    // 3. Load into a fresh engine (simulates loadFromUrl)
    const { panels: loadedPanels } = loadIntoEngine(decoded!);
    const loadedFront = loadedPanels.panels.find(p => p.source.faceId === 'front');
    expect(loadedFront).toBeDefined();
    expect(loadedFront!.edgeExtensions?.top).toBe(20);

    // 4. Verify the panel outline actually has extension geometry
    // Panel outline is centered, so base top is at height/2
    const loadedMaxY = Math.max(...loadedFront!.outline.points.map(p => p.y));
    const loadedHalfHeight = loadedFront!.height / 2;
    // With 20mm top extension, maxY should be halfHeight + 20
    expect(loadedMaxY).toBeCloseTo(loadedHalfHeight + 20, 0);
  });

  it('multiple extensions on different panels survive round-trip', () => {
    const config = makeConfig();
    const faces = makeFaces(['top']);

    const edgeExtensions: Record<string, EdgeExtensions> = {
      'face:front': { top: 20, bottom: 0, left: 0, right: 0 },
      'face:left': { top: 15, bottom: 0, left: 0, right: 0 },
    };

    const projectState: ProjectState = {
      config,
      faces,
      rootVoid: {
        id: 'root',
        bounds: { x: 6, y: 6, z: 6, w: 188, h: 88, d: 138 },
        children: [],
      },
      edgeExtensions,
    };

    const encoded = serializeProject(projectState);
    const decoded = deserializeProject(encoded);
    expect(decoded).not.toBeNull();

    const { panels } = loadIntoEngine(decoded!);

    const front = panels.panels.find(p => p.source.faceId === 'front');
    const left = panels.panels.find(p => p.source.faceId === 'left');

    expect(front!.edgeExtensions?.top).toBe(20);
    expect(left!.edgeExtensions?.top).toBe(15);
  });
});
