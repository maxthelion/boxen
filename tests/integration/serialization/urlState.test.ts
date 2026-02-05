/**
 * Serialization roundtrip tests
 * Ensures that all project state survives serialize/deserialize cycles
 */

import { describe, it, expect } from 'vitest';
import { serializeProject, deserializeProject, ProjectState, serializePanelOperations, deserializePanelOperations, getPanelStableKey } from '../../../src/utils/urlState';
import { BoxConfig, Face, Void, SubAssembly } from '../../../src/types';
import type { AssemblySnapshot } from '../../../src/engine/types';

// Helper to create a basic config
const createBasicConfig = (overrides?: Partial<BoxConfig>): BoxConfig => ({
  width: 100,
  height: 80,
  depth: 60,
  materialThickness: 3,
  fingerWidth: 10,
  fingerGap: 1.5,
  assembly: {
    assemblyAxis: 'y',
    lids: {
      positive: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
      negative: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
    },
  },
  ...overrides,
});

// Helper to create default faces
const createDefaultFaces = (): Face[] => [
  { id: 'front', solid: true },
  { id: 'back', solid: true },
  { id: 'left', solid: true },
  { id: 'right', solid: true },
  { id: 'top', solid: true },
  { id: 'bottom', solid: true },
];

// Helper to create a basic root void (matches assembly interior)
const createRootVoid = (config: BoxConfig): Void => {
  const mt = config.materialThickness;
  return {
    id: 'root',
    bounds: {
      x: mt,
      y: mt,
      z: mt,
      w: config.width - 2 * mt,
      h: config.height - 2 * mt,
      d: config.depth - 2 * mt,
    },
    children: [],
  };
};

// Deep comparison helper that handles floating point precision
const compareVoids = (a: Void, b: Void, path: string = 'root'): void => {
  expect(a.id, `${path}.id`).toBe(b.id);
  expect(a.bounds.x, `${path}.bounds.x`).toBeCloseTo(b.bounds.x, 2);
  expect(a.bounds.y, `${path}.bounds.y`).toBeCloseTo(b.bounds.y, 2);
  expect(a.bounds.z, `${path}.bounds.z`).toBeCloseTo(b.bounds.z, 2);
  expect(a.bounds.w, `${path}.bounds.w`).toBeCloseTo(b.bounds.w, 2);
  expect(a.bounds.h, `${path}.bounds.h`).toBeCloseTo(b.bounds.h, 2);
  expect(a.bounds.d, `${path}.bounds.d`).toBeCloseTo(b.bounds.d, 2);
  expect(a.splitAxis, `${path}.splitAxis`).toBe(b.splitAxis);
  if (a.splitPosition !== undefined) {
    expect(a.splitPosition, `${path}.splitPosition`).toBeCloseTo(b.splitPosition!, 2);
  } else {
    expect(b.splitPosition, `${path}.splitPosition`).toBeUndefined();
  }

  // Compare grid subdivision
  if (a.gridSubdivision) {
    expect(b.gridSubdivision, `${path}.gridSubdivision`).toBeDefined();
    expect(a.gridSubdivision.axes, `${path}.gridSubdivision.axes`).toEqual(b.gridSubdivision!.axes);
    for (const axis of a.gridSubdivision.axes) {
      const aPositions = a.gridSubdivision.positions[axis];
      const bPositions = b.gridSubdivision!.positions[axis];
      expect(aPositions?.length, `${path}.gridSubdivision.positions.${axis}.length`).toBe(bPositions?.length);
      if (aPositions && bPositions) {
        for (let i = 0; i < aPositions.length; i++) {
          expect(aPositions[i], `${path}.gridSubdivision.positions.${axis}[${i}]`).toBeCloseTo(bPositions[i], 2);
        }
      }
    }
  } else {
    expect(b.gridSubdivision, `${path}.gridSubdivision`).toBeUndefined();
  }

  // Compare children
  expect(a.children.length, `${path}.children.length`).toBe(b.children.length);
  for (let i = 0; i < a.children.length; i++) {
    compareVoids(a.children[i], b.children[i], `${path}.children[${i}]`);
  }

  // Compare sub-assembly
  if (a.subAssembly) {
    expect(b.subAssembly, `${path}.subAssembly`).toBeDefined();
    compareSubAssemblies(a.subAssembly, b.subAssembly!, `${path}.subAssembly`);
  } else {
    expect(b.subAssembly, `${path}.subAssembly`).toBeUndefined();
  }
};

const compareSubAssemblies = (a: SubAssembly, b: SubAssembly, path: string): void => {
  expect(a.id, `${path}.id`).toBe(b.id);
  expect(a.clearance, `${path}.clearance`).toBeCloseTo(b.clearance, 2);
  expect(a.materialThickness, `${path}.materialThickness`).toBeCloseTo(b.materialThickness, 2);

  // Compare face offsets
  expect(a.faceOffsets.front, `${path}.faceOffsets.front`).toBeCloseTo(b.faceOffsets.front, 2);
  expect(a.faceOffsets.back, `${path}.faceOffsets.back`).toBeCloseTo(b.faceOffsets.back, 2);
  expect(a.faceOffsets.left, `${path}.faceOffsets.left`).toBeCloseTo(b.faceOffsets.left, 2);
  expect(a.faceOffsets.right, `${path}.faceOffsets.right`).toBeCloseTo(b.faceOffsets.right, 2);
  expect(a.faceOffsets.top, `${path}.faceOffsets.top`).toBeCloseTo(b.faceOffsets.top, 2);
  expect(a.faceOffsets.bottom, `${path}.faceOffsets.bottom`).toBeCloseTo(b.faceOffsets.bottom, 2);

  // Compare faces
  expect(a.faces.length, `${path}.faces.length`).toBe(b.faces.length);
  for (let i = 0; i < a.faces.length; i++) {
    expect(a.faces[i].id, `${path}.faces[${i}].id`).toBe(b.faces[i].id);
    expect(a.faces[i].solid, `${path}.faces[${i}].solid`).toBe(b.faces[i].solid);
  }

  // Compare assembly config
  expect(a.assembly.assemblyAxis, `${path}.assembly.assemblyAxis`).toBe(b.assembly.assemblyAxis);
  expect(a.assembly.lids.positive.tabDirection, `${path}.assembly.lids.positive.tabDirection`).toBe(b.assembly.lids.positive.tabDirection);
  expect(a.assembly.lids.positive.inset, `${path}.assembly.lids.positive.inset`).toBeCloseTo(b.assembly.lids.positive.inset, 2);
  expect(a.assembly.lids.negative.tabDirection, `${path}.assembly.lids.negative.tabDirection`).toBe(b.assembly.lids.negative.tabDirection);
  expect(a.assembly.lids.negative.inset, `${path}.assembly.lids.negative.inset`).toBeCloseTo(b.assembly.lids.negative.inset, 2);

  // Compare root void
  compareVoids(a.rootVoid, b.rootVoid, `${path}.rootVoid`);
};

const compareProjectStates = (original: ProjectState, deserialized: ProjectState): void => {
  // Compare config
  expect(deserialized.config.width).toBeCloseTo(original.config.width, 2);
  expect(deserialized.config.height).toBeCloseTo(original.config.height, 2);
  expect(deserialized.config.depth).toBeCloseTo(original.config.depth, 2);
  expect(deserialized.config.materialThickness).toBeCloseTo(original.config.materialThickness, 2);
  expect(deserialized.config.fingerWidth).toBeCloseTo(original.config.fingerWidth, 2);
  expect(deserialized.config.fingerGap).toBeCloseTo(original.config.fingerGap, 2);
  expect(deserialized.config.assembly.assemblyAxis).toBe(original.config.assembly.assemblyAxis);
  expect(deserialized.config.assembly.lids.positive.tabDirection).toBe(original.config.assembly.lids.positive.tabDirection);
  expect(deserialized.config.assembly.lids.positive.inset).toBeCloseTo(original.config.assembly.lids.positive.inset, 2);
  expect(deserialized.config.assembly.lids.negative.tabDirection).toBe(original.config.assembly.lids.negative.tabDirection);
  expect(deserialized.config.assembly.lids.negative.inset).toBeCloseTo(original.config.assembly.lids.negative.inset, 2);

  // Compare faces
  expect(deserialized.faces.length).toBe(original.faces.length);
  for (let i = 0; i < original.faces.length; i++) {
    const origFace = original.faces.find(f => f.id === deserialized.faces[i].id);
    expect(origFace, `Face ${deserialized.faces[i].id} exists`).toBeDefined();
    expect(deserialized.faces[i].solid).toBe(origFace!.solid);
  }

  // Compare voids
  compareVoids(original.rootVoid, deserialized.rootVoid);

  // Compare edge extensions
  const origExtKeys = Object.keys(original.edgeExtensions);
  const deserExtKeys = Object.keys(deserialized.edgeExtensions);
  expect(deserExtKeys.length).toBe(origExtKeys.length);
  for (const key of origExtKeys) {
    expect(deserialized.edgeExtensions[key], `edgeExtensions[${key}]`).toBeDefined();
    expect(deserialized.edgeExtensions[key].top).toBeCloseTo(original.edgeExtensions[key].top, 2);
    expect(deserialized.edgeExtensions[key].bottom).toBeCloseTo(original.edgeExtensions[key].bottom, 2);
    expect(deserialized.edgeExtensions[key].left).toBeCloseTo(original.edgeExtensions[key].left, 2);
    expect(deserialized.edgeExtensions[key].right).toBeCloseTo(original.edgeExtensions[key].right, 2);
  }
};

describe('Serialization Roundtrip', () => {
  describe('Basic project state', () => {
    it('should roundtrip a simple box with default settings', () => {
      const config = createBasicConfig();
      const original: ProjectState = {
        config,
        faces: createDefaultFaces(),
        rootVoid: createRootVoid(config),
        edgeExtensions: {},
      };

      const serialized = serializeProject(original);
      const deserialized = deserializeProject(serialized);

      expect(deserialized).not.toBeNull();
      compareProjectStates(original, deserialized!);
    });

    it('should roundtrip with some faces removed', () => {
      const config = createBasicConfig();
      const original: ProjectState = {
        config,
        faces: [
          { id: 'front', solid: false },
          { id: 'back', solid: true },
          { id: 'left', solid: false },
          { id: 'right', solid: true },
          { id: 'top', solid: false },
          { id: 'bottom', solid: true },
        ],
        rootVoid: createRootVoid(config),
        edgeExtensions: {},
      };

      const serialized = serializeProject(original);
      const deserialized = deserializeProject(serialized);

      expect(deserialized).not.toBeNull();
      compareProjectStates(original, deserialized!);
    });

    it('should roundtrip with non-default assembly config', () => {
      const config = createBasicConfig({
        assembly: {
          assemblyAxis: 'x',
          lids: {
            positive: { enabled: true, tabDirection: 'tabs-in', inset: 5 },
            negative: { enabled: true, tabDirection: 'tabs-out', inset: 10 },
          },
        },
      });
      const original: ProjectState = {
        config,
        faces: createDefaultFaces(),
        rootVoid: createRootVoid(config),
        edgeExtensions: {},
      };

      const serialized = serializeProject(original);
      const deserialized = deserializeProject(serialized);

      expect(deserialized).not.toBeNull();
      compareProjectStates(original, deserialized!);
    });
  });

  describe('Subdivisions', () => {
    it('should roundtrip single-axis subdivision', () => {
      const config = createBasicConfig();
      const mt = config.materialThickness;
      const rootVoid = createRootVoid(config);
      const splitPosition = config.width / 2;

      // Create subdivision children
      rootVoid.splitAxis = 'x';
      rootVoid.splitPosition = splitPosition;
      rootVoid.children = [
        {
          id: 'void-left',
          bounds: {
            x: mt,
            y: mt,
            z: mt,
            w: splitPosition - mt - mt / 2,
            h: config.height - 2 * mt,
            d: config.depth - 2 * mt,
          },
          children: [],
        },
        {
          id: 'void-right',
          bounds: {
            x: splitPosition + mt / 2,
            y: mt,
            z: mt,
            w: config.width - splitPosition - mt - mt / 2,
            h: config.height - 2 * mt,
            d: config.depth - 2 * mt,
          },
          children: [],
        },
      ];

      const original: ProjectState = {
        config,
        faces: createDefaultFaces(),
        rootVoid,
        edgeExtensions: {},
      };

      const serialized = serializeProject(original);
      const deserialized = deserializeProject(serialized);

      expect(deserialized).not.toBeNull();
      compareProjectStates(original, deserialized!);
    });

    it('should roundtrip grid subdivision (multi-axis)', () => {
      const config = createBasicConfig();
      const mt = config.materialThickness;
      const rootVoid = createRootVoid(config);

      const xCenter = config.width / 2;
      const zCenter = config.depth / 2;

      // Set grid subdivision info
      rootVoid.gridSubdivision = {
        axes: ['x', 'z'],
        positions: {
          x: [xCenter],
          z: [zCenter],
        },
      };

      // Create 2x2 grid children
      const halfW = (config.width - 2 * mt - mt) / 2;
      const halfD = (config.depth - 2 * mt - mt) / 2;
      const fullH = config.height - 2 * mt;

      rootVoid.children = [
        {
          id: 'void-0-0',
          bounds: { x: mt, y: mt, z: mt, w: halfW, h: fullH, d: halfD },
          children: [],
        },
        {
          id: 'void-1-0',
          bounds: { x: xCenter + mt / 2, y: mt, z: mt, w: halfW, h: fullH, d: halfD },
          children: [],
        },
        {
          id: 'void-0-1',
          bounds: { x: mt, y: mt, z: zCenter + mt / 2, w: halfW, h: fullH, d: halfD },
          children: [],
        },
        {
          id: 'void-1-1',
          bounds: { x: xCenter + mt / 2, y: mt, z: zCenter + mt / 2, w: halfW, h: fullH, d: halfD },
          children: [],
        },
      ];

      const original: ProjectState = {
        config,
        faces: createDefaultFaces(),
        rootVoid,
        edgeExtensions: {},
      };

      const serialized = serializeProject(original);
      const deserialized = deserializeProject(serialized);

      expect(deserialized).not.toBeNull();
      compareProjectStates(original, deserialized!);
    });

    it('should roundtrip 3x3 grid subdivision', () => {
      const config = createBasicConfig();
      const mt = config.materialThickness;
      const rootVoid = createRootVoid(config);

      const xPos1 = config.width / 3;
      const xPos2 = (2 * config.width) / 3;
      const zPos1 = config.depth / 3;
      const zPos2 = (2 * config.depth) / 3;

      // Set grid subdivision info
      rootVoid.gridSubdivision = {
        axes: ['x', 'z'],
        positions: {
          x: [xPos1, xPos2],
          z: [zPos1, zPos2],
        },
      };

      // Create placeholder children (we just verify the gridSubdivision info survives)
      rootVoid.children = [];
      for (let xi = 0; xi < 3; xi++) {
        for (let zi = 0; zi < 3; zi++) {
          rootVoid.children.push({
            id: `void-${xi}-${zi}`,
            bounds: { x: mt + xi * 10, y: mt, z: mt + zi * 10, w: 10, h: 10, d: 10 },
            children: [],
          });
        }
      }

      const original: ProjectState = {
        config,
        faces: createDefaultFaces(),
        rootVoid,
        edgeExtensions: {},
      };

      const serialized = serializeProject(original);
      const deserialized = deserializeProject(serialized);

      expect(deserialized).not.toBeNull();
      compareProjectStates(original, deserialized!);
    });
  });

  describe('Edge extensions (inset/outset)', () => {
    it('should roundtrip edge extensions', () => {
      const config = createBasicConfig();
      const original: ProjectState = {
        config,
        faces: createDefaultFaces(),
        rootVoid: createRootVoid(config),
        edgeExtensions: {
          'panel-front': { top: 5, bottom: -3, left: 0, right: 10 },
          'panel-back': { top: 0, bottom: 0, left: 8, right: -2 },
        },
      };

      const serialized = serializeProject(original);
      const deserialized = deserializeProject(serialized);

      expect(deserialized).not.toBeNull();
      compareProjectStates(original, deserialized!);
    });

    it('should not serialize zero-value edge extensions', () => {
      const config = createBasicConfig();
      const original: ProjectState = {
        config,
        faces: createDefaultFaces(),
        rootVoid: createRootVoid(config),
        edgeExtensions: {
          'panel-front': { top: 0, bottom: 0, left: 0, right: 0 },
        },
      };

      const serialized = serializeProject(original);
      const deserialized = deserializeProject(serialized);

      expect(deserialized).not.toBeNull();
      // Zero-value extensions should be omitted
      expect(Object.keys(deserialized!.edgeExtensions).length).toBe(0);
    });
  });

  describe('Sub-assemblies', () => {
    it('should roundtrip a void with sub-assembly', () => {
      const config = createBasicConfig();
      const mt = config.materialThickness;
      const rootVoid = createRootVoid(config);

      // Add a sub-assembly to the root void
      rootVoid.subAssembly = {
        id: 'drawer-1',
        clearance: 2,
        faceOffsets: { front: 0, back: 0, left: 0, right: 0, top: 5, bottom: 0 },
        faces: [
          { id: 'front', solid: true },
          { id: 'back', solid: true },
          { id: 'left', solid: true },
          { id: 'right', solid: true },
          { id: 'top', solid: false },
          { id: 'bottom', solid: true },
        ],
        rootVoid: {
          id: 'drawer-1-root',
          bounds: { x: mt, y: mt, z: mt, w: 50, h: 30, d: 40 },
          children: [],
        },
        materialThickness: 3,
        assembly: {
          assemblyAxis: 'z',
          lids: {
            positive: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
            negative: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
          },
        },
      };

      const original: ProjectState = {
        config,
        faces: createDefaultFaces(),
        rootVoid,
        edgeExtensions: {},
      };

      const serialized = serializeProject(original);
      const deserialized = deserializeProject(serialized);

      expect(deserialized).not.toBeNull();
      compareProjectStates(original, deserialized!);
    });

    it('should roundtrip sub-assembly with non-default assembly config', () => {
      const config = createBasicConfig();
      const mt = config.materialThickness;
      const rootVoid = createRootVoid(config);

      rootVoid.subAssembly = {
        id: 'tray-1',
        clearance: 1.5,
        faceOffsets: { front: 10, back: 10, left: 5, right: 5, top: 0, bottom: 0 },
        faces: createDefaultFaces(),
        rootVoid: {
          id: 'tray-1-root',
          bounds: { x: mt, y: mt, z: mt, w: 30, h: 20, d: 25 },
          children: [],
        },
        materialThickness: 2,
        assembly: {
          assemblyAxis: 'x',
          lids: {
            positive: { enabled: true, tabDirection: 'tabs-in', inset: 3 },
            negative: { enabled: true, tabDirection: 'tabs-in', inset: 3 },
          },
        },
      };

      const original: ProjectState = {
        config,
        faces: createDefaultFaces(),
        rootVoid,
        edgeExtensions: {},
      };

      const serialized = serializeProject(original);
      const deserialized = deserializeProject(serialized);

      expect(deserialized).not.toBeNull();
      compareProjectStates(original, deserialized!);
    });
  });

  describe('Complex combined scenarios', () => {
    it('should roundtrip a project with subdivisions, sub-assemblies, and extensions', () => {
      const config = createBasicConfig({
        width: 200,
        height: 150,
        depth: 100,
        assembly: {
          assemblyAxis: 'z',
          lids: {
            positive: { enabled: true, tabDirection: 'tabs-out', inset: 5 },
            negative: { enabled: true, tabDirection: 'tabs-in', inset: 0 },
          },
        },
      });
      const mt = config.materialThickness;
      const rootVoid = createRootVoid(config);

      const xCenter = config.width / 2;

      // Create a single-axis subdivision
      rootVoid.splitAxis = 'x';
      rootVoid.splitPosition = xCenter;

      // Create two child voids
      rootVoid.children = [
        {
          id: 'void-left',
          bounds: { x: mt, y: mt, z: mt, w: 95, h: 144, d: 94 },
          children: [],
          // Left void has a sub-assembly
          subAssembly: {
            id: 'drawer-left',
            clearance: 2,
            faceOffsets: { front: 0, back: 0, left: 0, right: 0, top: 10, bottom: 0 },
            faces: [
              { id: 'front', solid: true },
              { id: 'back', solid: true },
              { id: 'left', solid: true },
              { id: 'right', solid: true },
              { id: 'top', solid: false },
              { id: 'bottom', solid: true },
            ],
            rootVoid: {
              id: 'drawer-left-root',
              bounds: { x: mt, y: mt, z: mt, w: 85, h: 50, d: 84 },
              children: [],
            },
            materialThickness: 3,
            assembly: {
              assemblyAxis: 'z',
              lids: {
                positive: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
                negative: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
              },
            },
          },
        },
        {
          id: 'void-right',
          bounds: { x: xCenter + mt / 2, y: mt, z: mt, w: 95, h: 144, d: 94 },
          children: [],
        },
      ];

      const original: ProjectState = {
        config,
        faces: [
          { id: 'front', solid: true },
          { id: 'back', solid: true },
          { id: 'left', solid: false },  // One face open
          { id: 'right', solid: true },
          { id: 'top', solid: true },
          { id: 'bottom', solid: true },
        ],
        rootVoid,
        edgeExtensions: {
          'panel-front': { top: 0, bottom: -5, left: 3, right: 3 },
          'panel-top': { top: 10, bottom: 0, left: 0, right: 0 },
        },
      };

      const serialized = serializeProject(original);
      const deserialized = deserializeProject(serialized);

      expect(deserialized).not.toBeNull();
      compareProjectStates(original, deserialized!);
    });
  });

  describe('Precision handling', () => {
    it('should handle floating point values with proper precision', () => {
      const config = createBasicConfig({
        width: 100.123456,
        height: 80.987654,
        depth: 60.555555,
        materialThickness: 3.14159,
        fingerWidth: 10.666666,
        fingerGap: 1.333333,
      });
      const original: ProjectState = {
        config,
        faces: createDefaultFaces(),
        rootVoid: createRootVoid(config),
        edgeExtensions: {
          'panel-1': { top: 5.123456, bottom: -3.654321, left: 0.111111, right: 10.999999 },
        },
      };

      const serialized = serializeProject(original);
      const deserialized = deserializeProject(serialized);

      expect(deserialized).not.toBeNull();
      // Values should be rounded to 2 decimal places
      expect(deserialized!.config.width).toBeCloseTo(100.12, 2);
      expect(deserialized!.config.height).toBeCloseTo(80.99, 2);
      expect(deserialized!.config.depth).toBeCloseTo(60.56, 2);
    });
  });
});

describe('URL Loading Integration', () => {
  it('should load subdivided project from URL and have subdivisions in engine', async () => {
    // This tests the full roundtrip: serialize -> deserialize -> engine has correct state
    const { resetEngine, syncStoreToEngine, getEngine } = await import('../../../src/engine');

    // Reset engine to simulate fresh page load
    resetEngine();

    // Create a project state with a subdivision
    const config = createBasicConfig();
    const mt = config.materialThickness;
    const rootVoid = createRootVoid(config);
    const splitPosition = config.width / 2;

    // Add subdivision - splitAxis/splitPosition go on the FIRST child
    rootVoid.children = [
      {
        id: 'void-left',
        bounds: {
          x: mt,
          y: mt,
          z: mt,
          w: splitPosition - mt - mt / 2,
          h: config.height - 2 * mt,
          d: config.depth - 2 * mt,
        },
        children: [],
        splitAxis: 'x',
        splitPosition: splitPosition,
      },
      {
        id: 'void-right',
        bounds: {
          x: splitPosition + mt / 2,
          y: mt,
          z: mt,
          w: config.width - splitPosition - mt - mt / 2,
          h: config.height - 2 * mt,
          d: config.depth - 2 * mt,
        },
        children: [],
      },
    ];

    const original: ProjectState = {
      config,
      faces: createDefaultFaces(),
      rootVoid,
      edgeExtensions: {},
    };

    // Serialize and deserialize (simulates URL storage)
    const serialized = serializeProject(original);
    const deserialized = deserializeProject(serialized);
    expect(deserialized).not.toBeNull();

    // Sync to engine (simulates what loadFromUrl does)
    syncStoreToEngine(deserialized!.config, deserialized!.faces, deserialized!.rootVoid);

    // Generate panels from engine
    const engine = getEngine();
    const panels = engine.generatePanelsFromNodes();

    // Verify the engine has the subdivision
    const assembly = engine.assembly;
    expect(assembly).toBeDefined();
    expect(assembly!.rootVoid.getVoidChildren().length).toBe(2);

    // Should have a divider panel (PanelPath uses source.type, not kind)
    const dividerPanels = panels.panels.filter((p: any) => p.source?.type === 'divider');
    expect(dividerPanels.length).toBe(1);
  });

  it('should load grid subdivision from URL and have grid in engine', async () => {
    const { resetEngine, syncStoreToEngine, getEngine } = await import('../../../src/engine');

    // Reset engine to simulate fresh page load
    resetEngine();

    const config = createBasicConfig();
    const mt = config.materialThickness;
    const rootVoid = createRootVoid(config);

    const xCenter = config.width / 2;
    const zCenter = config.depth / 2;

    // Add grid subdivision
    rootVoid.gridSubdivision = {
      axes: ['x', 'z'],
      positions: {
        x: [xCenter],
        z: [zCenter],
      },
    };

    // Create 2x2 grid children
    const halfW = (config.width - 2 * mt - mt) / 2;
    const halfD = (config.depth - 2 * mt - mt) / 2;
    const fullH = config.height - 2 * mt;

    rootVoid.children = [
      { id: 'void-0-0', bounds: { x: mt, y: mt, z: mt, w: halfW, h: fullH, d: halfD }, children: [] },
      { id: 'void-1-0', bounds: { x: xCenter + mt / 2, y: mt, z: mt, w: halfW, h: fullH, d: halfD }, children: [] },
      { id: 'void-0-1', bounds: { x: mt, y: mt, z: zCenter + mt / 2, w: halfW, h: fullH, d: halfD }, children: [] },
      { id: 'void-1-1', bounds: { x: xCenter + mt / 2, y: mt, z: zCenter + mt / 2, w: halfW, h: fullH, d: halfD }, children: [] },
    ];

    const original: ProjectState = {
      config,
      faces: createDefaultFaces(),
      rootVoid,
      edgeExtensions: {},
    };

    // Serialize and deserialize
    const serialized = serializeProject(original);
    const deserialized = deserializeProject(serialized);
    expect(deserialized).not.toBeNull();

    // Sync to engine
    syncStoreToEngine(deserialized!.config, deserialized!.faces, deserialized!.rootVoid);

    // Generate panels from engine
    const engine = getEngine();
    const panels = engine.generatePanelsFromNodes();

    // Verify the engine has the grid subdivision
    const assembly = engine.assembly;
    expect(assembly).toBeDefined();
    expect(assembly!.rootVoid.getVoidChildren().length).toBe(4);
    expect(assembly!.rootVoid.gridSubdivision).toBeDefined();
    expect(assembly!.rootVoid.gridSubdivision!.axes).toEqual(['x', 'z']);

    // Should have 2 divider panels (one X, one Z)
    const dividerPanels = panels.panels.filter((p: any) => p.source?.type === 'divider');
    expect(dividerPanels.length).toBe(2);
  });
});

// =============================================================================
// Panel Operations Serialization
// =============================================================================
// These tests verify that panel-level operations (fillets, cutouts) survive
// serialization roundtrips. Currently, these operations are NOT serialized,
// so these tests should FAIL initially.
// =============================================================================

describe('Panel Operations Serialization', () => {
  /**
   * These tests apply panel-level operations through the engine,
   * then serialize the project state and verify the operations are preserved.
   *
   * IMPORTANT: These tests are expected to FAIL initially because the
   * ProjectState type does not include panel operations (corner fillets,
   * all-corner fillets, cutouts, custom edge paths). When serialization
   * support is added, these tests should pass.
   *
   * We measure the effect of operations by:
   * - Corner fillets: outline.points.length increases (arc points added)
   * - Cutouts: holes array has entries with source.type === 'decorative'
   */

  describe('Corner Fillets', () => {
    it('should preserve corner fillet after roundtrip', async () => {
      // Setup: Create engine with assembly and apply a corner fillet
      const { resetEngine, syncStoreToEngine, getEngine } = await import('../../../src/engine');

      resetEngine();

      const config = createBasicConfig();
      const original: ProjectState = {
        config,
        faces: createDefaultFaces(),
        rootVoid: createRootVoid(config),
        edgeExtensions: {},
      };

      // Sync initial state to engine
      syncStoreToEngine(original.config, original.faces, original.rootVoid);

      const engine = getEngine();

      // To get an eligible corner, we need to disable two adjacent faces
      // (e.g., top and left) so the left:top corner has no joints
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'top' },
      });
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'left' },
      });

      // Get baseline point count before fillet
      const panelsBefore = engine.generatePanelsFromNodes();
      const frontBefore = panelsBefore.panels.find((p: any) => p.source?.faceId === 'front');
      expect(frontBefore).toBeDefined();
      const pointsBeforeFillet = frontBefore!.outline.points.length;

      // Apply corner fillet (left:top corner should be eligible now)
      const filletSuccess = engine.dispatch({
        type: 'SET_CORNER_FILLET',
        targetId: 'main-assembly',
        payload: {
          panelId: frontBefore!.id,
          corner: 'left:top',
          radius: 5,
        },
      });
      expect(filletSuccess).toBe(true);

      // Verify fillet was applied by checking point count increased
      const panelsAfterFillet = engine.generatePanelsFromNodes();
      const frontAfterFillet = panelsAfterFillet.panels.find((p: any) => p.source?.faceId === 'front');
      const pointsAfterFillet = frontAfterFillet!.outline.points.length;
      expect(
        pointsAfterFillet,
        'Fillet should add arc points to outline'
      ).toBeGreaterThan(pointsBeforeFillet);

      // Now serialize and deserialize
      // Note: We need to update original state to reflect face toggles
      const updatedFaces = original.faces.map(f =>
        f.id === 'top' || f.id === 'left' ? { ...f, solid: false } : f
      );

      // Extract panel operations from the engine snapshot
      const snapshot = engine.getSnapshot();
      const assemblySnapshot = snapshot.children[0] as AssemblySnapshot;
      const serializedPanelOps = serializePanelOperations(assemblySnapshot);
      const panelOperations = deserializePanelOperations(serializedPanelOps);

      const stateToSerialize: ProjectState = {
        ...original,
        faces: updatedFaces,
        panelOperations: Object.keys(panelOperations).length > 0 ? panelOperations : undefined,
      };

      const serialized = serializeProject(stateToSerialize);
      const deserialized = deserializeProject(serialized);
      expect(deserialized).not.toBeNull();

      // Reload the deserialized state into a fresh engine, including panel operations
      resetEngine();
      syncStoreToEngine(deserialized!.config, deserialized!.faces, deserialized!.rootVoid, undefined, deserialized!.panelOperations);

      const reloadedEngine = getEngine();
      const reloadedPanels = reloadedEngine.generatePanelsFromNodes();
      const reloadedFrontPanel = reloadedPanels.panels.find((p: any) => p.source?.faceId === 'front');
      const pointsAfterReload = reloadedFrontPanel!.outline.points.length;

      // Corner fillet should be preserved after serialization roundtrip
      expect(
        pointsAfterReload,
        `Corner fillet should survive serialization (had ${pointsAfterFillet} points, got ${pointsAfterReload})`
      ).toBe(pointsAfterFillet);
    });
  });

  describe('All-Corner Fillets', () => {
    it('should preserve all-corner fillet after roundtrip', async () => {
      // Setup: Create engine and apply an all-corner fillet to a cutout corner
      const { resetEngine, syncStoreToEngine, getEngine } = await import('../../../src/engine');

      resetEngine();

      const config = createBasicConfig();
      const original: ProjectState = {
        config,
        faces: createDefaultFaces(),
        rootVoid: createRootVoid(config),
        edgeExtensions: {},
      };

      // Sync initial state to engine
      syncStoreToEngine(original.config, original.faces, original.rootVoid);

      const engine = getEngine();
      const panels = engine.generatePanelsFromNodes();
      const frontPanel = panels.panels.find((p: any) => p.source?.faceId === 'front');
      expect(frontPanel).toBeDefined();

      // First add a cutout (cutout corners can be filleted even in closed box)
      engine.dispatch({
        type: 'ADD_CUTOUT',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel!.id,
          cutout: {
            id: 'test-cutout-for-fillet',
            type: 'rect' as const,
            center: { x: 0, y: 0 },
            width: 20,
            height: 20,
          },
        },
      });

      // Get updated panels after cutout
      const panelsWithCutout = engine.generatePanelsFromNodes();
      const frontWithCutout = panelsWithCutout.panels.find((p: any) => p.source?.faceId === 'front');

      // Verify cutout was added
      const cutoutHolesBefore = frontWithCutout?.holes?.filter(
        (h: any) => h.source?.type === 'decorative'
      ) ?? [];
      expect(cutoutHolesBefore.length).toBe(1);

      // Apply fillet to cutout corner
      // The all-corner fillet may or may not add arc points depending on implementation
      // What matters for this test is that the fillet CONFIG is preserved
      const allCornerFilletSuccess = engine.dispatch({
        type: 'SET_ALL_CORNER_FILLET',
        targetId: 'main-assembly',
        payload: {
          panelId: frontWithCutout!.id,
          cornerId: 'hole:test-cutout-for-fillet:0',
          radius: 3,
        },
      });
      expect(allCornerFilletSuccess).toBe(true);

      // Verify fillet was stored by checking engine snapshot (not PanelPath)
      const snapshot = engine.getSnapshot();
      const snapshotPanels = snapshot.children[0].derived.panels;
      const snapshotFront = snapshotPanels.find((p: any) => p.kind === 'face-panel' && p.props.faceId === 'front');
      const storedFillets = snapshotFront?.props?.allCornerFillets ?? [];
      expect(
        storedFillets.length,
        'All-corner fillet should be stored in panel props'
      ).toBeGreaterThan(0);

      // Extract panel operations from engine snapshot
      const fullSnapshot = engine.getSnapshot();
      const assemblySnap = fullSnapshot.children[0] as AssemblySnapshot;
      const serializedPanelOps = serializePanelOperations(assemblySnap);
      const panelOps = deserializePanelOperations(serializedPanelOps);

      // Serialize including panel operations
      const stateToSerialize: ProjectState = {
        ...original,
        panelOperations: Object.keys(panelOps).length > 0 ? panelOps : undefined,
      };
      const serialized = serializeProject(stateToSerialize);
      const deserialized = deserializeProject(serialized);
      expect(deserialized).not.toBeNull();

      // Reload into fresh engine with panel operations
      resetEngine();
      syncStoreToEngine(deserialized!.config, deserialized!.faces, deserialized!.rootVoid, undefined, deserialized!.panelOperations);

      const reloadedEngine = getEngine();

      // Check engine snapshot after reload for fillet config
      const reloadedSnapshot = reloadedEngine.getSnapshot();
      const reloadedSnapshotPanels = reloadedSnapshot.children[0].derived.panels;
      const reloadedSnapshotFront = reloadedSnapshotPanels.find((p: any) => p.kind === 'face-panel' && p.props.faceId === 'front');

      // Check cutout exists in PanelPath format
      const reloadedPanels = reloadedEngine.generatePanelsFromNodes();
      const reloadedFrontPanel = reloadedPanels.panels.find((p: any) => p.source?.faceId === 'front');
      const reloadedCutoutHoles = reloadedFrontPanel?.holes?.filter(
        (h: any) => h.source?.type === 'decorative'
      ) ?? [];

      // Cutout and all-corner fillet should be preserved
      expect(
        reloadedCutoutHoles.length,
        'Cutout should survive serialization roundtrip'
      ).toBe(1);

      // Check fillet config is preserved (this is the key test)
      const reloadedFillets = reloadedSnapshotFront?.props?.allCornerFillets ?? [];
      expect(
        reloadedFillets.length,
        `All-corner fillet config should survive serialization (had ${storedFillets.length}, got ${reloadedFillets.length})`
      ).toBe(storedFillets.length);
    });
  });

  describe('Cutouts', () => {
    it('should preserve rectangular cutout after roundtrip', async () => {
      // Setup
      const { resetEngine, syncStoreToEngine, getEngine } = await import('../../../src/engine');

      resetEngine();

      const config = createBasicConfig();
      const original: ProjectState = {
        config,
        faces: createDefaultFaces(),
        rootVoid: createRootVoid(config),
        edgeExtensions: {},
      };

      syncStoreToEngine(original.config, original.faces, original.rootVoid);

      const engine = getEngine();
      const panels = engine.generatePanelsFromNodes();
      const frontPanel = panels.panels.find((p: any) => p.source?.faceId === 'front');
      expect(frontPanel).toBeDefined();

      // Add a rectangular cutout
      const cutoutSuccess = engine.dispatch({
        type: 'ADD_CUTOUT',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel!.id,
          cutout: {
            id: 'rect-cutout-1',
            type: 'rect' as const,
            center: { x: 10, y: 10 },
            width: 15,
            height: 10,
          },
        },
      });
      expect(cutoutSuccess).toBe(true);

      // Verify cutout was added (creates a hole with source.type === 'decorative')
      const panelsAfterCutout = engine.generatePanelsFromNodes();
      const frontAfterCutout = panelsAfterCutout.panels.find((p: any) => p.source?.faceId === 'front');

      // Count holes that are cutouts (source.type === 'decorative' after bridge conversion)
      const cutoutHoles = frontAfterCutout?.holes?.filter(
        (h: any) => h.source?.type === 'decorative'
      ) ?? [];
      expect(cutoutHoles.length).toBe(1);

      // Extract panel operations from engine snapshot
      const snapshot = engine.getSnapshot();
      const assemblySnap = snapshot.children[0] as AssemblySnapshot;
      const serializedPanelOps = serializePanelOperations(assemblySnap);
      const panelOps = deserializePanelOperations(serializedPanelOps);

      // Serialize including panel operations
      const stateToSerialize: ProjectState = {
        ...original,
        panelOperations: Object.keys(panelOps).length > 0 ? panelOps : undefined,
      };
      const serialized = serializeProject(stateToSerialize);
      const deserialized = deserializeProject(serialized);
      expect(deserialized).not.toBeNull();

      // Reload into fresh engine with panel operations
      resetEngine();
      syncStoreToEngine(deserialized!.config, deserialized!.faces, deserialized!.rootVoid, undefined, deserialized!.panelOperations);

      const reloadedEngine = getEngine();
      const reloadedPanels = reloadedEngine.generatePanelsFromNodes();
      const reloadedFrontPanel = reloadedPanels.panels.find((p: any) => p.source?.faceId === 'front');

      // Count decorative holes after reload
      const reloadedCutoutHoles = reloadedFrontPanel?.holes?.filter(
        (h: any) => h.source?.type === 'decorative'
      ) ?? [];

      // Cutout should be preserved
      expect(
        reloadedCutoutHoles.length,
        'Rectangular cutout should survive serialization roundtrip'
      ).toBe(1);
    });

    it('should preserve circular cutout after roundtrip', async () => {
      const { resetEngine, syncStoreToEngine, getEngine } = await import('../../../src/engine');

      resetEngine();

      const config = createBasicConfig();
      const original: ProjectState = {
        config,
        faces: createDefaultFaces(),
        rootVoid: createRootVoid(config),
        edgeExtensions: {},
      };

      syncStoreToEngine(original.config, original.faces, original.rootVoid);

      const engine = getEngine();
      const panels = engine.generatePanelsFromNodes();
      const frontPanel = panels.panels.find((p: any) => p.source?.faceId === 'front');
      expect(frontPanel).toBeDefined();

      // Add a circular cutout
      const cutoutSuccess = engine.dispatch({
        type: 'ADD_CUTOUT',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel!.id,
          cutout: {
            id: 'circle-cutout-1',
            type: 'circle' as const,
            center: { x: 0, y: 0 },
            radius: 8,
          },
        },
      });
      expect(cutoutSuccess).toBe(true);

      // Verify cutout was added
      const panelsAfterCutout = engine.generatePanelsFromNodes();
      const frontAfterCutout = panelsAfterCutout.panels.find((p: any) => p.source?.faceId === 'front');
      const cutoutHoles = frontAfterCutout?.holes?.filter(
        (h: any) => h.source?.type === 'decorative'
      ) ?? [];
      expect(cutoutHoles.length).toBe(1);

      // Extract panel operations from engine snapshot
      const snapshot = engine.getSnapshot();
      const assemblySnap = snapshot.children[0] as AssemblySnapshot;
      const serializedPanelOps = serializePanelOperations(assemblySnap);
      const panelOps = deserializePanelOperations(serializedPanelOps);

      // Serialize including panel operations
      const stateToSerialize: ProjectState = {
        ...original,
        panelOperations: Object.keys(panelOps).length > 0 ? panelOps : undefined,
      };
      const serialized = serializeProject(stateToSerialize);
      const deserialized = deserializeProject(serialized);
      expect(deserialized).not.toBeNull();

      // Reload into fresh engine with panel operations
      resetEngine();
      syncStoreToEngine(deserialized!.config, deserialized!.faces, deserialized!.rootVoid, undefined, deserialized!.panelOperations);

      const reloadedEngine = getEngine();
      const reloadedPanels = reloadedEngine.generatePanelsFromNodes();
      const reloadedFrontPanel = reloadedPanels.panels.find((p: any) => p.source?.faceId === 'front');

      const reloadedCutoutHoles = reloadedFrontPanel?.holes?.filter(
        (h: any) => h.source?.type === 'decorative'
      ) ?? [];

      // Circular cutout should be preserved
      expect(
        reloadedCutoutHoles.length,
        'Circular cutout should survive serialization roundtrip'
      ).toBe(1);
    });
  });

  describe('Combined Panel Operations', () => {
    it('should preserve multiple operation types after roundtrip', async () => {
      /**
       * This test applies multiple panel operations and verifies they ALL
       * survive serialization. This is a comprehensive test that will fail
       * if ANY of the panel operations are not being serialized.
       */
      const { resetEngine, syncStoreToEngine, getEngine } = await import('../../../src/engine');

      resetEngine();

      const config = createBasicConfig();
      const original: ProjectState = {
        config,
        faces: createDefaultFaces(),
        rootVoid: createRootVoid(config),
        edgeExtensions: {},
      };

      syncStoreToEngine(original.config, original.faces, original.rootVoid);

      const engine = getEngine();

      // Operation 1: Disable two faces to make a corner eligible for fillet
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'top' },
      });
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'left' },
      });

      // Get baseline measurements
      const panelsBefore = engine.generatePanelsFromNodes();
      const frontBefore = panelsBefore.panels.find((p: any) => p.source?.faceId === 'front');
      const pointsBeforeFillet = frontBefore!.outline.points.length;

      // Operation 2: Apply corner fillet to the eligible corner
      engine.dispatch({
        type: 'SET_CORNER_FILLET',
        targetId: 'main-assembly',
        payload: {
          panelId: frontBefore!.id,
          corner: 'left:top',
          radius: 5,
        },
      });

      // Operation 3: Add a rectangular cutout
      engine.dispatch({
        type: 'ADD_CUTOUT',
        targetId: 'main-assembly',
        payload: {
          panelId: frontBefore!.id,
          cutout: {
            id: 'combined-rect-cutout',
            type: 'rect' as const,
            center: { x: -10, y: -10 },
            width: 12,
            height: 8,
          },
        },
      });

      // Operation 4: Add a circular cutout
      engine.dispatch({
        type: 'ADD_CUTOUT',
        targetId: 'main-assembly',
        payload: {
          panelId: frontBefore!.id,
          cutout: {
            id: 'combined-circle-cutout',
            type: 'circle' as const,
            center: { x: 15, y: 15 },
            radius: 5,
          },
        },
      });

      // Verify all operations were applied
      const panelsWithOps = engine.generatePanelsFromNodes();
      const frontWithOps = panelsWithOps.panels.find((p: any) => p.source?.faceId === 'front');

      const pointsAfterFillet = frontWithOps!.outline.points.length;
      const appliedCutouts = frontWithOps?.holes?.filter(
        (h: any) => h.source?.type === 'decorative'
      )?.length ?? 0;

      expect(
        pointsAfterFillet,
        'Fillet should add arc points'
      ).toBeGreaterThan(pointsBeforeFillet);
      expect(appliedCutouts).toBe(2);  // Rect + circle cutouts

      // Update faces in original to reflect toggles
      const updatedFaces = original.faces.map(f =>
        f.id === 'top' || f.id === 'left' ? { ...f, solid: false } : f
      );

      // Extract panel operations from engine snapshot
      const snapshot = engine.getSnapshot();
      const assemblySnap = snapshot.children[0] as AssemblySnapshot;
      const serializedPanelOps = serializePanelOperations(assemblySnap);
      const panelOps = deserializePanelOperations(serializedPanelOps);

      const stateToSerialize: ProjectState = {
        ...original,
        faces: updatedFaces,
        panelOperations: Object.keys(panelOps).length > 0 ? panelOps : undefined,
      };

      // Serialize and deserialize
      const serialized = serializeProject(stateToSerialize);
      const deserialized = deserializeProject(serialized);
      expect(deserialized).not.toBeNull();

      // Reload into fresh engine with panel operations
      resetEngine();
      syncStoreToEngine(deserialized!.config, deserialized!.faces, deserialized!.rootVoid, undefined, deserialized!.panelOperations);

      const reloadedEngine = getEngine();
      const reloadedPanels = reloadedEngine.generatePanelsFromNodes();
      const reloadedFrontPanel = reloadedPanels.panels.find((p: any) => p.source?.faceId === 'front');

      // Measure preserved operations
      const pointsAfterReload = reloadedFrontPanel!.outline.points.length;
      const preservedCutouts = reloadedFrontPanel?.holes?.filter(
        (h: any) => h.source?.type === 'decorative'
      )?.length ?? 0;

      // Operations should be preserved after serialization roundtrip
      expect(
        pointsAfterReload,
        `Corner fillet should be preserved (had ${pointsAfterFillet} outline points, got ${pointsAfterReload})`
      ).toBe(pointsAfterFillet);

      expect(
        preservedCutouts,
        `Cutouts should be preserved (had ${appliedCutouts}, got ${preservedCutouts})`
      ).toBe(appliedCutouts);
    });
  });
});

// =============================================================================
// serializePanelOperations Unit Tests
// =============================================================================

describe('serializePanelOperations', () => {
  // Import the function under test
  const getSerializePanelOperations = async () => {
    const { serializePanelOperations } = await import('../../../src/utils/urlState');
    return serializePanelOperations;
  };

  // Helper to get engine functions
  const getEngineFunctions = async () => {
    const { resetEngine, syncStoreToEngine, getEngine } = await import('../../../src/engine');
    return { resetEngine, syncStoreToEngine, getEngine };
  };

  describe('returns undefined when no operations', () => {
    it('should return undefined for assembly with no panel operations', async () => {
      const { resetEngine, syncStoreToEngine, getEngine } = await getEngineFunctions();
      const serializePanelOperations = await getSerializePanelOperations();

      resetEngine();

      const config = createBasicConfig();
      const original: ProjectState = {
        config,
        faces: createDefaultFaces(),
        rootVoid: createRootVoid(config),
        edgeExtensions: {},
      };

      syncStoreToEngine(original.config, original.faces, original.rootVoid);

      const engine = getEngine();
      const snapshot = engine.getSnapshot();
      const assemblySnapshot = snapshot.children[0] as any;

      const result = serializePanelOperations(assemblySnapshot);

      expect(result).toBeUndefined();
    });
  });

  describe('corner fillets serialization', () => {
    it('should serialize corner fillets to compact Record<cornerKey, radius>', async () => {
      const { resetEngine, syncStoreToEngine, getEngine } = await getEngineFunctions();
      const serializePanelOperations = await getSerializePanelOperations();

      resetEngine();

      const config = createBasicConfig();
      const original: ProjectState = {
        config,
        faces: createDefaultFaces(),
        rootVoid: createRootVoid(config),
        edgeExtensions: {},
      };

      syncStoreToEngine(original.config, original.faces, original.rootVoid);

      const engine = getEngine();

      // Disable top and left faces to make left:top corner eligible
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'top' },
      });
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'left' },
      });

      // Get panel and apply fillet
      const panels = engine.generatePanelsFromNodes();
      const frontPanel = panels.panels.find((p: any) => p.source?.faceId === 'front');
      expect(frontPanel).toBeDefined();

      engine.dispatch({
        type: 'SET_CORNER_FILLET',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel!.id,
          corner: 'left:top',
          radius: 5.123,
        },
      });

      const snapshot = engine.getSnapshot();
      const assemblySnapshot = snapshot.children[0] as any;

      const result = serializePanelOperations(assemblySnapshot);

      expect(result).toBeDefined();
      // Keys are now stable source-based (e.g., 'face:front') not UUIDs
      expect(result!['face:front']).toBeDefined();
      expect(result!['face:front'].cf).toBeDefined();
      expect(result!['face:front'].cf!['left:top']).toBe(5.12); // Rounded to 2 decimal places
    });
  });

  describe('all-corner fillets serialization', () => {
    it('should serialize all-corner fillets to compact Record<cornerId, radius>', async () => {
      const { resetEngine, syncStoreToEngine, getEngine } = await getEngineFunctions();
      const serializePanelOperations = await getSerializePanelOperations();

      resetEngine();

      const config = createBasicConfig();
      const original: ProjectState = {
        config,
        faces: createDefaultFaces(),
        rootVoid: createRootVoid(config),
        edgeExtensions: {},
      };

      syncStoreToEngine(original.config, original.faces, original.rootVoid);

      const engine = getEngine();
      const panels = engine.generatePanelsFromNodes();
      const frontPanel = panels.panels.find((p: any) => p.source?.faceId === 'front');
      expect(frontPanel).toBeDefined();

      // Add a cutout first (cutout corners can be filleted)
      engine.dispatch({
        type: 'ADD_CUTOUT',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel!.id,
          cutout: {
            id: 'test-cutout',
            type: 'rect' as const,
            center: { x: 0, y: 0 },
            width: 20,
            height: 20,
          },
        },
      });

      // Apply all-corner fillet to the cutout corner
      engine.dispatch({
        type: 'SET_ALL_CORNER_FILLET',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel!.id,
          cornerId: 'hole:test-cutout:0',
          radius: 3.567,
        },
      });

      const snapshot = engine.getSnapshot();
      const assemblySnapshot = snapshot.children[0] as any;

      const result = serializePanelOperations(assemblySnapshot);

      expect(result).toBeDefined();
      expect(result!['face:front']).toBeDefined();
      expect(result!['face:front'].acf).toBeDefined();
      expect(result!['face:front'].acf!['hole:test-cutout:0']).toBe(3.57); // Rounded
    });
  });

  describe('cutouts serialization', () => {
    it('should serialize rectangular cutout to compact format', async () => {
      const { resetEngine, syncStoreToEngine, getEngine } = await getEngineFunctions();
      const serializePanelOperations = await getSerializePanelOperations();

      resetEngine();

      const config = createBasicConfig();
      const original: ProjectState = {
        config,
        faces: createDefaultFaces(),
        rootVoid: createRootVoid(config),
        edgeExtensions: {},
      };

      syncStoreToEngine(original.config, original.faces, original.rootVoid);

      const engine = getEngine();
      const panels = engine.generatePanelsFromNodes();
      const frontPanel = panels.panels.find((p: any) => p.source?.faceId === 'front');
      expect(frontPanel).toBeDefined();

      engine.dispatch({
        type: 'ADD_CUTOUT',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel!.id,
          cutout: {
            id: 'rect-1',
            type: 'rect' as const,
            center: { x: 10.555, y: 15.333 },
            width: 20.789,
            height: 12.456,
            cornerRadius: 2.5,
          },
        },
      });

      const snapshot = engine.getSnapshot();
      const assemblySnapshot = snapshot.children[0] as any;

      const result = serializePanelOperations(assemblySnapshot);

      expect(result).toBeDefined();
      expect(result!['face:front']).toBeDefined();
      expect(result!['face:front'].co).toBeDefined();
      expect(result!['face:front'].co!.length).toBe(1);

      const cutout = result!['face:front'].co![0];
      expect(cutout.t).toBe('r'); // rect type
      expect(cutout.id).toBe('rect-1');
      expect(cutout.c).toEqual([10.56, 15.33]); // center rounded
      expect((cutout as any).w).toBe(20.79); // width rounded
      expect((cutout as any).h).toBe(12.46); // height rounded
      expect((cutout as any).cr).toBe(2.5); // corner radius
    });

    it('should serialize circular cutout to compact format', async () => {
      const { resetEngine, syncStoreToEngine, getEngine } = await getEngineFunctions();
      const serializePanelOperations = await getSerializePanelOperations();

      resetEngine();

      const config = createBasicConfig();
      const original: ProjectState = {
        config,
        faces: createDefaultFaces(),
        rootVoid: createRootVoid(config),
        edgeExtensions: {},
      };

      syncStoreToEngine(original.config, original.faces, original.rootVoid);

      const engine = getEngine();
      const panels = engine.generatePanelsFromNodes();
      const frontPanel = panels.panels.find((p: any) => p.source?.faceId === 'front');
      expect(frontPanel).toBeDefined();

      engine.dispatch({
        type: 'ADD_CUTOUT',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel!.id,
          cutout: {
            id: 'circle-1',
            type: 'circle' as const,
            center: { x: -5.5, y: 8.333 },
            radius: 7.777,
          },
        },
      });

      const snapshot = engine.getSnapshot();
      const assemblySnapshot = snapshot.children[0] as any;

      const result = serializePanelOperations(assemblySnapshot);

      expect(result).toBeDefined();
      expect(result!['face:front']).toBeDefined();
      expect(result!['face:front'].co).toBeDefined();
      expect(result!['face:front'].co!.length).toBe(1);

      const cutout = result!['face:front'].co![0];
      expect(cutout.t).toBe('c'); // circle type
      expect(cutout.id).toBe('circle-1');
      expect(cutout.c).toEqual([-5.5, 8.33]); // center rounded
      expect((cutout as any).r).toBe(7.78); // radius rounded
    });

    it('should serialize path cutout to compact format', async () => {
      const { resetEngine, syncStoreToEngine, getEngine } = await getEngineFunctions();
      const serializePanelOperations = await getSerializePanelOperations();

      resetEngine();

      const config = createBasicConfig();
      const original: ProjectState = {
        config,
        faces: createDefaultFaces(),
        rootVoid: createRootVoid(config),
        edgeExtensions: {},
      };

      syncStoreToEngine(original.config, original.faces, original.rootVoid);

      const engine = getEngine();
      const panels = engine.generatePanelsFromNodes();
      const frontPanel = panels.panels.find((p: any) => p.source?.faceId === 'front');
      expect(frontPanel).toBeDefined();

      engine.dispatch({
        type: 'ADD_CUTOUT',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel!.id,
          cutout: {
            id: 'path-1',
            type: 'path' as const,
            center: { x: 0, y: 0 },
            points: [
              { x: -5.123, y: -5.456 },
              { x: 5.789, y: -5.456 },
              { x: 0, y: 5.111 },
            ],
          },
        },
      });

      const snapshot = engine.getSnapshot();
      const assemblySnapshot = snapshot.children[0] as any;

      const result = serializePanelOperations(assemblySnapshot);

      expect(result).toBeDefined();
      expect(result!['face:front']).toBeDefined();
      expect(result!['face:front'].co).toBeDefined();
      expect(result!['face:front'].co!.length).toBe(1);

      const cutout = result!['face:front'].co![0];
      expect(cutout.t).toBe('p'); // path type
      expect(cutout.id).toBe('path-1');
      expect(cutout.c).toEqual([0, 0]); // center
      expect((cutout as any).pts).toEqual([
        [-5.12, -5.46],
        [5.79, -5.46],
        [0, 5.11],
      ]); // points rounded
    });

    it('should serialize cutout mode when additive', async () => {
      const { resetEngine, syncStoreToEngine, getEngine } = await getEngineFunctions();
      const serializePanelOperations = await getSerializePanelOperations();

      resetEngine();

      const config = createBasicConfig();
      const original: ProjectState = {
        config,
        faces: createDefaultFaces(),
        rootVoid: createRootVoid(config),
        edgeExtensions: {},
      };

      syncStoreToEngine(original.config, original.faces, original.rootVoid);

      const engine = getEngine();
      const panels = engine.generatePanelsFromNodes();
      const frontPanel = panels.panels.find((p: any) => p.source?.faceId === 'front');
      expect(frontPanel).toBeDefined();

      engine.dispatch({
        type: 'ADD_CUTOUT',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel!.id,
          cutout: {
            id: 'additive-1',
            type: 'rect' as const,
            center: { x: 0, y: 0 },
            width: 10,
            height: 10,
            mode: 'additive',
          },
        },
      });

      const snapshot = engine.getSnapshot();
      const assemblySnapshot = snapshot.children[0] as any;

      const result = serializePanelOperations(assemblySnapshot);

      expect(result).toBeDefined();
      expect(result!['face:front']).toBeDefined();
      expect(result!['face:front'].co).toBeDefined();

      const cutout = result!['face:front'].co![0];
      expect(cutout.m).toBe('a'); // additive mode
    });
  });

  describe('combined operations', () => {
    it('should serialize multiple operation types on the same panel', async () => {
      const { resetEngine, syncStoreToEngine, getEngine } = await getEngineFunctions();
      const serializePanelOperations = await getSerializePanelOperations();

      resetEngine();

      const config = createBasicConfig();
      const original: ProjectState = {
        config,
        faces: createDefaultFaces(),
        rootVoid: createRootVoid(config),
        edgeExtensions: {},
      };

      syncStoreToEngine(original.config, original.faces, original.rootVoid);

      const engine = getEngine();

      // Disable faces to enable corner fillet
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'top' },
      });
      engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: 'left' },
      });

      const panels = engine.generatePanelsFromNodes();
      const frontPanel = panels.panels.find((p: any) => p.source?.faceId === 'front');
      expect(frontPanel).toBeDefined();

      // Add corner fillet
      engine.dispatch({
        type: 'SET_CORNER_FILLET',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel!.id,
          corner: 'left:top',
          radius: 5,
        },
      });

      // Add cutout
      engine.dispatch({
        type: 'ADD_CUTOUT',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel!.id,
          cutout: {
            id: 'test-cutout',
            type: 'rect' as const,
            center: { x: 10, y: 10 },
            width: 15,
            height: 10,
          },
        },
      });

      // Add all-corner fillet on cutout
      engine.dispatch({
        type: 'SET_ALL_CORNER_FILLET',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel!.id,
          cornerId: 'hole:test-cutout:0',
          radius: 2,
        },
      });

      const snapshot = engine.getSnapshot();
      const assemblySnapshot = snapshot.children[0] as any;

      const result = serializePanelOperations(assemblySnapshot);

      expect(result).toBeDefined();
      expect(result!['face:front']).toBeDefined();
      expect(result!['face:front'].cf).toBeDefined();
      expect(result!['face:front'].cf!['left:top']).toBe(5);
      expect(result!['face:front'].acf).toBeDefined();
      expect(result!['face:front'].acf!['hole:test-cutout:0']).toBe(2);
      expect(result!['face:front'].co).toBeDefined();
      expect(result!['face:front'].co!.length).toBe(1);
    });

    it('should only include panels with operations in the result', async () => {
      const { resetEngine, syncStoreToEngine, getEngine } = await getEngineFunctions();
      const serializePanelOperations = await getSerializePanelOperations();

      resetEngine();

      const config = createBasicConfig();
      const original: ProjectState = {
        config,
        faces: createDefaultFaces(),
        rootVoid: createRootVoid(config),
        edgeExtensions: {},
      };

      syncStoreToEngine(original.config, original.faces, original.rootVoid);

      const engine = getEngine();
      const panels = engine.generatePanelsFromNodes();
      const frontPanel = panels.panels.find((p: any) => p.source?.faceId === 'front');
      expect(frontPanel).toBeDefined();

      // Only add cutout to front panel
      engine.dispatch({
        type: 'ADD_CUTOUT',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel!.id,
          cutout: {
            id: 'only-cutout',
            type: 'circle' as const,
            center: { x: 0, y: 0 },
            radius: 5,
          },
        },
      });

      const snapshot = engine.getSnapshot();
      const assemblySnapshot = snapshot.children[0] as any;

      const result = serializePanelOperations(assemblySnapshot);

      expect(result).toBeDefined();
      // Should only contain the front panel (keyed by stable source key)
      const panelKeys = Object.keys(result!);
      expect(panelKeys.length).toBe(1);
      expect(panelKeys[0]).toBe('face:front');
    });
  });
});

// =============================================================================
// deserializePanelOperations Unit Tests
// =============================================================================

describe('deserializePanelOperations', () => {
  const getDeserializePanelOperations = async () => {
    const { deserializePanelOperations } = await import('../../../src/utils/urlState');
    return deserializePanelOperations;
  };

  describe('returns empty object when input is undefined', () => {
    it('should return empty object for undefined input', async () => {
      const deserializePanelOperations = await getDeserializePanelOperations();

      const result = deserializePanelOperations(undefined);

      expect(result).toEqual({});
    });
  });

  describe('corner fillets deserialization', () => {
    it('should reconstruct CornerFillet[] from compact Record<cornerKey, radius>', async () => {
      const deserializePanelOperations = await getDeserializePanelOperations();

      const input = {
        'panel-1': {
          cf: { 'left:top': 5, 'bottom:right': 3.5 },
        },
      };

      const result = deserializePanelOperations(input);

      expect(result['panel-1']).toBeDefined();
      expect(result['panel-1'].cornerFillets).toHaveLength(2);
      expect(result['panel-1'].cornerFillets).toContainEqual({ corner: 'left:top', radius: 5 });
      expect(result['panel-1'].cornerFillets).toContainEqual({ corner: 'bottom:right', radius: 3.5 });
    });

    it('should return empty cornerFillets when cf is absent', async () => {
      const deserializePanelOperations = await getDeserializePanelOperations();

      const input = {
        'panel-1': {
          co: [{ t: 'c' as const, id: 'c1', c: [0, 0] as [number, number], r: 5 }],
        },
      };

      const result = deserializePanelOperations(input);

      expect(result['panel-1'].cornerFillets).toHaveLength(0);
    });
  });

  describe('all-corner fillets deserialization', () => {
    it('should reconstruct AllCornerFillet[] from compact Record<cornerId, radius>', async () => {
      const deserializePanelOperations = await getDeserializePanelOperations();

      const input = {
        'panel-1': {
          acf: { 'outline:5': 2, 'hole:cutout-1:0': 3.5 },
        },
      };

      const result = deserializePanelOperations(input);

      expect(result['panel-1']).toBeDefined();
      expect(result['panel-1'].allCornerFillets).toHaveLength(2);
      expect(result['panel-1'].allCornerFillets).toContainEqual({ cornerId: 'outline:5', radius: 2 });
      expect(result['panel-1'].allCornerFillets).toContainEqual({ cornerId: 'hole:cutout-1:0', radius: 3.5 });
    });

    it('should return empty allCornerFillets when acf is absent', async () => {
      const deserializePanelOperations = await getDeserializePanelOperations();

      const input = {
        'panel-1': {
          cf: { 'left:top': 5 },
        },
      };

      const result = deserializePanelOperations(input);

      expect(result['panel-1'].allCornerFillets).toHaveLength(0);
    });
  });

  describe('cutouts deserialization', () => {
    it('should reconstruct rectangular cutout from compact format', async () => {
      const deserializePanelOperations = await getDeserializePanelOperations();

      const input = {
        'panel-1': {
          co: [{
            t: 'r' as const,
            id: 'rect-1',
            c: [10.56, 15.33] as [number, number],
            w: 20.79,
            h: 12.46,
            cr: 2.5,
          }],
        },
      };

      const result = deserializePanelOperations(input);

      expect(result['panel-1'].cutouts).toHaveLength(1);
      const cutout = result['panel-1'].cutouts[0];
      expect(cutout.type).toBe('rect');
      expect(cutout.id).toBe('rect-1');
      expect(cutout.center).toEqual({ x: 10.56, y: 15.33 });
      if (cutout.type === 'rect') {
        expect(cutout.width).toBe(20.79);
        expect(cutout.height).toBe(12.46);
        expect(cutout.cornerRadius).toBe(2.5);
      }
    });

    it('should reconstruct circular cutout from compact format', async () => {
      const deserializePanelOperations = await getDeserializePanelOperations();

      const input = {
        'panel-1': {
          co: [{
            t: 'c' as const,
            id: 'circle-1',
            c: [-5.5, 8.33] as [number, number],
            r: 7.78,
          }],
        },
      };

      const result = deserializePanelOperations(input);

      expect(result['panel-1'].cutouts).toHaveLength(1);
      const cutout = result['panel-1'].cutouts[0];
      expect(cutout.type).toBe('circle');
      expect(cutout.id).toBe('circle-1');
      expect(cutout.center).toEqual({ x: -5.5, y: 8.33 });
      if (cutout.type === 'circle') {
        expect(cutout.radius).toBe(7.78);
      }
    });

    it('should reconstruct path cutout from compact format', async () => {
      const deserializePanelOperations = await getDeserializePanelOperations();

      const input = {
        'panel-1': {
          co: [{
            t: 'p' as const,
            id: 'path-1',
            c: [0, 0] as [number, number],
            pts: [[-5.12, -5.46], [5.79, -5.46], [0, 5.11]] as [number, number][],
          }],
        },
      };

      const result = deserializePanelOperations(input);

      expect(result['panel-1'].cutouts).toHaveLength(1);
      const cutout = result['panel-1'].cutouts[0];
      expect(cutout.type).toBe('path');
      expect(cutout.id).toBe('path-1');
      expect(cutout.center).toEqual({ x: 0, y: 0 });
      if (cutout.type === 'path') {
        expect(cutout.points).toEqual([
          { x: -5.12, y: -5.46 },
          { x: 5.79, y: -5.46 },
          { x: 0, y: 5.11 },
        ]);
      }
    });

    it('should reconstruct cutout mode when additive', async () => {
      const deserializePanelOperations = await getDeserializePanelOperations();

      const input = {
        'panel-1': {
          co: [{
            t: 'r' as const,
            id: 'add-1',
            c: [0, 0] as [number, number],
            w: 10,
            h: 10,
            m: 'a' as const,
          }],
        },
      };

      const result = deserializePanelOperations(input);

      const cutout = result['panel-1'].cutouts[0];
      expect(cutout.mode).toBe('additive');
    });

    it('should reconstruct cutout mode when subtractive', async () => {
      const deserializePanelOperations = await getDeserializePanelOperations();

      const input = {
        'panel-1': {
          co: [{
            t: 'c' as const,
            id: 'sub-1',
            c: [0, 0] as [number, number],
            r: 5,
            m: 's' as const,
          }],
        },
      };

      const result = deserializePanelOperations(input);

      const cutout = result['panel-1'].cutouts[0];
      expect(cutout.mode).toBe('subtractive');
    });

    it('should not set mode when absent in serialized data', async () => {
      const deserializePanelOperations = await getDeserializePanelOperations();

      const input = {
        'panel-1': {
          co: [{
            t: 'r' as const,
            id: 'no-mode',
            c: [0, 0] as [number, number],
            w: 10,
            h: 10,
          }],
        },
      };

      const result = deserializePanelOperations(input);

      const cutout = result['panel-1'].cutouts[0];
      expect(cutout.mode).toBeUndefined();
    });

    it('should not set cornerRadius when absent in serialized rect cutout', async () => {
      const deserializePanelOperations = await getDeserializePanelOperations();

      const input = {
        'panel-1': {
          co: [{
            t: 'r' as const,
            id: 'no-cr',
            c: [0, 0] as [number, number],
            w: 10,
            h: 10,
          }],
        },
      };

      const result = deserializePanelOperations(input);

      const cutout = result['panel-1'].cutouts[0];
      if (cutout.type === 'rect') {
        expect(cutout.cornerRadius).toBeUndefined();
      }
    });
  });

  describe('combined operations', () => {
    it('should deserialize multiple operation types on the same panel', async () => {
      const deserializePanelOperations = await getDeserializePanelOperations();

      const input = {
        'panel-1': {
          cf: { 'left:top': 5 },
          acf: { 'hole:test-cutout:0': 2 },
          co: [{
            t: 'r' as const,
            id: 'test-cutout',
            c: [10, 10] as [number, number],
            w: 15,
            h: 10,
          }],
        },
      };

      const result = deserializePanelOperations(input);

      expect(result['panel-1'].cornerFillets).toHaveLength(1);
      expect(result['panel-1'].cornerFillets[0]).toEqual({ corner: 'left:top', radius: 5 });
      expect(result['panel-1'].allCornerFillets).toHaveLength(1);
      expect(result['panel-1'].allCornerFillets[0]).toEqual({ cornerId: 'hole:test-cutout:0', radius: 2 });
      expect(result['panel-1'].cutouts).toHaveLength(1);
      expect(result['panel-1'].cutouts[0].type).toBe('rect');
    });

    it('should handle multiple panels with different operations', async () => {
      const deserializePanelOperations = await getDeserializePanelOperations();

      const input = {
        'panel-1': {
          cf: { 'left:top': 5 },
        },
        'panel-2': {
          co: [{
            t: 'c' as const,
            id: 'c1',
            c: [0, 0] as [number, number],
            r: 8,
          }],
        },
        'panel-3': {
          acf: { 'outline:3': 4 },
        },
      };

      const result = deserializePanelOperations(input);

      expect(Object.keys(result)).toHaveLength(3);

      expect(result['panel-1'].cornerFillets).toHaveLength(1);
      expect(result['panel-1'].cutouts).toHaveLength(0);
      expect(result['panel-1'].allCornerFillets).toHaveLength(0);

      expect(result['panel-2'].cutouts).toHaveLength(1);
      expect(result['panel-2'].cornerFillets).toHaveLength(0);
      expect(result['panel-2'].allCornerFillets).toHaveLength(0);

      expect(result['panel-3'].allCornerFillets).toHaveLength(1);
      expect(result['panel-3'].cornerFillets).toHaveLength(0);
      expect(result['panel-3'].cutouts).toHaveLength(0);
    });
  });

  describe('roundtrip with serializePanelOperations', () => {
    it('should roundtrip corner fillets through serialize/deserialize', async () => {
      const { resetEngine, syncStoreToEngine, getEngine } = await import('../../../src/engine');
      const { serializePanelOperations, deserializePanelOperations } = await import('../../../src/utils/urlState');

      resetEngine();

      const config = createBasicConfig();
      syncStoreToEngine(config, createDefaultFaces(), createRootVoid(config));

      const engine = getEngine();

      // Disable faces to make corner eligible
      engine.dispatch({ type: 'TOGGLE_FACE', targetId: 'main-assembly', payload: { faceId: 'top' } });
      engine.dispatch({ type: 'TOGGLE_FACE', targetId: 'main-assembly', payload: { faceId: 'left' } });

      const panels = engine.generatePanelsFromNodes();
      const frontPanel = panels.panels.find((p: any) => p.source?.faceId === 'front');
      expect(frontPanel).toBeDefined();

      engine.dispatch({
        type: 'SET_CORNER_FILLET',
        targetId: 'main-assembly',
        payload: { panelId: frontPanel!.id, corner: 'left:top', radius: 5 },
      });

      const snapshot = engine.getSnapshot();
      const assemblySnapshot = snapshot.children[0] as any;

      // Serialize then deserialize
      const serialized = serializePanelOperations(assemblySnapshot);
      expect(serialized).toBeDefined();

      const deserialized = deserializePanelOperations(serialized);
      expect(deserialized['face:front']).toBeDefined();
      expect(deserialized['face:front'].cornerFillets).toContainEqual({ corner: 'left:top', radius: 5 });
    });

    it('should roundtrip cutouts through serialize/deserialize', async () => {
      const { resetEngine, syncStoreToEngine, getEngine } = await import('../../../src/engine');
      const { serializePanelOperations, deserializePanelOperations } = await import('../../../src/utils/urlState');

      resetEngine();

      const config = createBasicConfig();
      syncStoreToEngine(config, createDefaultFaces(), createRootVoid(config));

      const engine = getEngine();
      const panels = engine.generatePanelsFromNodes();
      const frontPanel = panels.panels.find((p: any) => p.source?.faceId === 'front');
      expect(frontPanel).toBeDefined();

      // Add rect cutout
      engine.dispatch({
        type: 'ADD_CUTOUT',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel!.id,
          cutout: { id: 'r1', type: 'rect' as const, center: { x: 5, y: 10 }, width: 20, height: 15, cornerRadius: 2 },
        },
      });

      // Add circle cutout
      engine.dispatch({
        type: 'ADD_CUTOUT',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel!.id,
          cutout: { id: 'c1', type: 'circle' as const, center: { x: -10, y: -10 }, radius: 8 },
        },
      });

      const snapshot = engine.getSnapshot();
      const assemblySnapshot = snapshot.children[0] as any;

      const serialized = serializePanelOperations(assemblySnapshot);
      expect(serialized).toBeDefined();

      const deserialized = deserializePanelOperations(serialized);
      expect(deserialized['face:front']).toBeDefined();
      expect(deserialized['face:front'].cutouts).toHaveLength(2);

      const rect = deserialized['face:front'].cutouts.find(c => c.id === 'r1');
      expect(rect).toBeDefined();
      expect(rect!.type).toBe('rect');
      if (rect!.type === 'rect') {
        expect(rect!.center).toEqual({ x: 5, y: 10 });
        expect(rect!.width).toBe(20);
        expect(rect!.height).toBe(15);
        expect(rect!.cornerRadius).toBe(2);
      }

      const circle = deserialized['face:front'].cutouts.find(c => c.id === 'c1');
      expect(circle).toBeDefined();
      expect(circle!.type).toBe('circle');
      if (circle!.type === 'circle') {
        expect(circle!.center).toEqual({ x: -10, y: -10 });
        expect(circle!.radius).toBe(8);
      }
    });
  });
});

// =============================================================================
// Combined Features Serialization
// =============================================================================
// These tests verify that COMBINATIONS of features (subdivisions, edge extensions,
// panel operations) all survive serialization roundtrips together.
// =============================================================================

describe('Combined Features Serialization', () => {
  // Helper to build a subdivided void tree in the store format that
  // syncVoidNodeFromStoreVoid expects (splitAxis/splitPosition on first child)
  const createSubdividedRootVoid = (config: BoxConfig): Void => {
    const mt = config.materialThickness;
    const splitPosition = config.width / 2;
    const halfMt = mt / 2;

    return {
      id: 'root',
      bounds: {
        x: mt,
        y: mt,
        z: mt,
        w: config.width - 2 * mt,
        h: config.height - 2 * mt,
        d: config.depth - 2 * mt,
      },
      children: [
        {
          id: 'void-left',
          bounds: {
            x: mt,
            y: mt,
            z: mt,
            w: splitPosition - mt - halfMt,
            h: config.height - 2 * mt,
            d: config.depth - 2 * mt,
          },
          children: [],
          splitAxis: 'x',
          splitPosition: splitPosition,
        },
        {
          id: 'void-right',
          bounds: {
            x: splitPosition + halfMt,
            y: mt,
            z: mt,
            w: config.width - splitPosition - mt - halfMt,
            h: config.height - 2 * mt,
            d: config.depth - 2 * mt,
          },
          children: [],
        },
      ],
    };
  };

  describe('Panel operations + subdivisions', () => {
    it('should preserve both subdivision structure and cutout after roundtrip', async () => {
      const { resetEngine, syncStoreToEngine, getEngine } = await import('../../../src/engine');

      resetEngine();

      const config = createBasicConfig();
      const subdividedVoid = createSubdividedRootVoid(config);

      // Initialize engine with subdivision
      syncStoreToEngine(config, createDefaultFaces(), subdividedVoid);

      const engine = getEngine();
      const assembly = engine.assembly!;
      expect(assembly.rootVoid.getVoidChildren().length).toBe(2);

      // Add a cutout to the front face panel
      const panels = engine.generatePanelsFromNodes();
      const frontPanel = panels.panels.find((p: any) => p.source?.faceId === 'front');
      expect(frontPanel).toBeDefined();

      engine.dispatch({
        type: 'ADD_CUTOUT',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel!.id,
          cutout: {
            id: 'subdiv-cutout-1',
            type: 'rect' as const,
            center: { x: 0, y: 0 },
            width: 15,
            height: 10,
          },
        },
      });

      // Verify cutout was added
      const panelsAfter = engine.generatePanelsFromNodes();
      const frontAfter = panelsAfter.panels.find((p: any) => p.source?.faceId === 'front');
      const cutoutHoles = frontAfter?.holes?.filter((h: any) => h.source?.type === 'decorative') ?? [];
      expect(cutoutHoles.length).toBe(1);

      // Build ProjectState for serialization
      const snapshot = engine.getSnapshot();
      const assemblySnap = snapshot.children[0] as AssemblySnapshot;
      const serializedPanelOps = serializePanelOperations(assemblySnap);
      const panelOps = deserializePanelOperations(serializedPanelOps);

      const stateToSerialize: ProjectState = {
        config,
        faces: createDefaultFaces(),
        rootVoid: subdividedVoid,
        edgeExtensions: {},
        panelOperations: Object.keys(panelOps).length > 0 ? panelOps : undefined,
      };

      // Serialize → deserialize
      const serialized = serializeProject(stateToSerialize);
      const deserialized = deserializeProject(serialized);
      expect(deserialized).not.toBeNull();

      // Reload into fresh engine
      resetEngine();
      syncStoreToEngine(
        deserialized!.config,
        deserialized!.faces,
        deserialized!.rootVoid,
        undefined,
        deserialized!.panelOperations
      );

      const reloadedEngine = getEngine();
      const reloadedAssembly = reloadedEngine.assembly!;

      // Verify subdivision structure survived
      const reloadedVoidChildren = reloadedAssembly.rootVoid.getVoidChildren();
      expect(reloadedVoidChildren.length, 'Subdivision should survive roundtrip').toBe(2);

      // Verify cutout survived
      const reloadedPanels = reloadedEngine.generatePanelsFromNodes();
      const reloadedFront = reloadedPanels.panels.find((p: any) => p.source?.faceId === 'front');
      const reloadedCutouts = reloadedFront?.holes?.filter((h: any) => h.source?.type === 'decorative') ?? [];
      expect(reloadedCutouts.length, 'Cutout should survive roundtrip with subdivision').toBe(1);

      // Verify divider panels exist
      const dividerPanels = reloadedPanels.panels.filter((p: any) => p.source?.type === 'divider');
      expect(dividerPanels.length, 'Divider panel should exist after roundtrip').toBe(1);
    });
  });

  describe('Panel operations + edge extensions', () => {
    it('should preserve both edge extension and corner fillet after roundtrip', async () => {
      const { resetEngine, syncStoreToEngine, getEngine } = await import('../../../src/engine');

      resetEngine();

      const config = createBasicConfig();

      // Disable top and left faces to make left:top corner eligible for fillet
      const faces = createDefaultFaces().map(f =>
        f.id === 'top' || f.id === 'left' ? { ...f, solid: false } : f
      );

      syncStoreToEngine(config, faces, createRootVoid(config));

      const engine = getEngine();

      // Step 1: Apply edge extension to the front panel (bottom edge)
      const panels = engine.generatePanelsFromNodes();
      const frontPanel = panels.panels.find((p: any) => p.source?.faceId === 'front');
      expect(frontPanel).toBeDefined();

      engine.dispatch({
        type: 'SET_EDGE_EXTENSION',
        targetId: 'main-assembly',
        payload: { panelId: frontPanel!.id, edge: 'bottom', value: 10 },
      });

      // Step 2: Apply corner fillet on the eligible corner
      engine.dispatch({
        type: 'SET_CORNER_FILLET',
        targetId: 'main-assembly',
        payload: { panelId: frontPanel!.id, corner: 'left:top', radius: 5 },
      });

      // Record baseline state (point count after both operations)
      const panelsAfterBoth = engine.generatePanelsFromNodes();
      const frontAfterBoth = panelsAfterBoth.panels.find((p: any) => p.source?.faceId === 'front');
      const pointsAfterBoth = frontAfterBoth!.outline.points.length;

      // Step 3: Build serialization state
      const snapshot = engine.getSnapshot();
      const assemblySnap = snapshot.children[0] as AssemblySnapshot;
      const serializedPanelOps = serializePanelOperations(assemblySnap);
      const panelOps = deserializePanelOperations(serializedPanelOps);

      // Edge extensions keyed by the same panel key used in serialization
      const stateToSerialize: ProjectState = {
        config,
        faces,
        rootVoid: createRootVoid(config),
        edgeExtensions: {
          'front': { top: 0, bottom: 10, left: 0, right: 0 },
        },
        panelOperations: Object.keys(panelOps).length > 0 ? panelOps : undefined,
      };

      // Step 4: Serialize → deserialize
      const serialized = serializeProject(stateToSerialize);
      const deserialized = deserializeProject(serialized);
      expect(deserialized).not.toBeNull();

      // Verify edge extension survived in deserialized state
      expect(deserialized!.edgeExtensions['front'], 'Edge extension should survive serialization').toBeDefined();
      expect(deserialized!.edgeExtensions['front'].bottom).toBeCloseTo(10, 2);

      // Step 5: Reload engine and apply edge extension + panel operations
      resetEngine();
      syncStoreToEngine(
        deserialized!.config,
        deserialized!.faces,
        deserialized!.rootVoid,
        undefined,
        deserialized!.panelOperations
      );

      const reloadedEngine = getEngine();

      // Re-apply edge extensions from deserialized state (simulates what loadFromUrl does)
      const reloadedPanels = reloadedEngine.generatePanelsFromNodes();
      const reloadedFrontPanel = reloadedPanels.panels.find((p: any) => p.source?.faceId === 'front');
      expect(reloadedFrontPanel).toBeDefined();

      // Apply the deserialized edge extension to the reloaded engine
      reloadedEngine.dispatch({
        type: 'SET_EDGE_EXTENSION',
        targetId: 'main-assembly',
        payload: { panelId: reloadedFrontPanel!.id, edge: 'bottom', value: deserialized!.edgeExtensions['front'].bottom },
      });

      // Regenerate panels to see the effect of both extension and fillet
      const finalPanels = reloadedEngine.generatePanelsFromNodes();
      const finalFront = finalPanels.panels.find((p: any) => p.source?.faceId === 'front');

      // Check fillet survived by comparing point counts
      const reloadedPoints = finalFront!.outline.points.length;
      expect(
        reloadedPoints,
        `Corner fillet + edge extension should survive roundtrip (had ${pointsAfterBoth} points, got ${reloadedPoints})`
      ).toBe(pointsAfterBoth);
    });
  });

  describe('Full combination', () => {
    it('should preserve subdivision + edge extension + cutout + fillet with valid geometry', async () => {
      const { resetEngine, syncStoreToEngine, getEngine } = await import('../../../src/engine');
      const { checkGeometry } = await import('../../../src/engine/geometryChecker');

      resetEngine();

      const config = createBasicConfig();

      // Disable top and left faces to make corners eligible for fillet
      const faces = createDefaultFaces().map(f =>
        f.id === 'top' || f.id === 'left' ? { ...f, solid: false } : f
      );

      // Initialize engine with subdivision already in place
      const subdividedVoid = createSubdividedRootVoid(config);
      syncStoreToEngine(config, faces, subdividedVoid);

      const engine = getEngine();
      const assembly = engine.assembly!;
      expect(assembly.rootVoid.getVoidChildren().length).toBe(2);

      // Feature 2: Apply edge extension on back panel (bottom edge)
      const panels = engine.generatePanelsFromNodes();
      const backPanel = panels.panels.find((p: any) => p.source?.faceId === 'back');
      expect(backPanel).toBeDefined();

      engine.dispatch({
        type: 'SET_EDGE_EXTENSION',
        targetId: 'main-assembly',
        payload: { panelId: backPanel!.id, edge: 'bottom', value: 8 },
      });

      // Feature 3: Add cutout to front panel
      const frontPanel = panels.panels.find((p: any) => p.source?.faceId === 'front');
      expect(frontPanel).toBeDefined();

      engine.dispatch({
        type: 'ADD_CUTOUT',
        targetId: 'main-assembly',
        payload: {
          panelId: frontPanel!.id,
          cutout: {
            id: 'combo-cutout-1',
            type: 'circle' as const,
            center: { x: 0, y: 0 },
            radius: 5,
          },
        },
      });

      // Feature 4: Add corner fillet to front panel (left:top corner eligible since top+left disabled)
      engine.dispatch({
        type: 'SET_CORNER_FILLET',
        targetId: 'main-assembly',
        payload: { panelId: frontPanel!.id, corner: 'left:top', radius: 4 },
      });

      // Record all features' state before serialization
      const finalPanels = engine.generatePanelsFromNodes();
      const finalFront = finalPanels.panels.find((p: any) => p.source?.faceId === 'front');
      const frontPointCount = finalFront!.outline.points.length;
      const frontCutouts = finalFront?.holes?.filter((h: any) => h.source?.type === 'decorative') ?? [];
      const dividerPanelsBefore = finalPanels.panels.filter((p: any) => p.source?.type === 'divider');

      expect(frontCutouts.length, 'Cutout should exist before serialization').toBe(1);
      expect(dividerPanelsBefore.length, 'Divider should exist before serialization').toBeGreaterThanOrEqual(1);

      // Build serialization state
      const snapshot = engine.getSnapshot();
      const assemblySnap = snapshot.children[0] as AssemblySnapshot;
      const serializedPanelOps = serializePanelOperations(assemblySnap);
      const panelOps = deserializePanelOperations(serializedPanelOps);

      const stateToSerialize: ProjectState = {
        config,
        faces,
        rootVoid: subdividedVoid,
        edgeExtensions: {
          'back': { top: 0, bottom: 8, left: 0, right: 0 },
        },
        panelOperations: Object.keys(panelOps).length > 0 ? panelOps : undefined,
      };

      // Serialize → deserialize
      const serialized = serializeProject(stateToSerialize);
      const deserialized = deserializeProject(serialized);
      expect(deserialized).not.toBeNull();

      // Reload into fresh engine
      resetEngine();
      syncStoreToEngine(
        deserialized!.config,
        deserialized!.faces,
        deserialized!.rootVoid,
        undefined,
        deserialized!.panelOperations
      );

      const reloadedEngine = getEngine();

      // Verify Feature 1: Subdivision survived
      const reloadedAssembly = reloadedEngine.assembly!;
      const reloadedVoidChildren = reloadedAssembly.rootVoid.getVoidChildren();
      expect(reloadedVoidChildren.length, 'Subdivision should survive full combination roundtrip').toBe(2);

      // Verify Feature 2: Edge extension survived in deserialized state
      expect(deserialized!.edgeExtensions['back'], 'Back edge extension should survive').toBeDefined();
      expect(deserialized!.edgeExtensions['back'].bottom).toBeCloseTo(8, 2);

      // Re-apply edge extension to reloaded engine (simulates what loadFromUrl does)
      const reloadedPanelsForExt = reloadedEngine.generatePanelsFromNodes();
      const reloadedBack = reloadedPanelsForExt.panels.find((p: any) => p.source?.faceId === 'back');
      if (reloadedBack) {
        reloadedEngine.dispatch({
          type: 'SET_EDGE_EXTENSION',
          targetId: 'main-assembly',
          payload: { panelId: reloadedBack.id, edge: 'bottom', value: 8 },
        });
      }

      // Verify Feature 3: Cutout survived
      const reloadedPanels = reloadedEngine.generatePanelsFromNodes();
      const reloadedFront = reloadedPanels.panels.find((p: any) => p.source?.faceId === 'front');
      const reloadedCutouts = reloadedFront?.holes?.filter((h: any) => h.source?.type === 'decorative') ?? [];
      expect(reloadedCutouts.length, 'Cutout should survive full combination roundtrip').toBe(1);

      // Verify Feature 4: Corner fillet survived (point count should match)
      const reloadedFrontPoints = reloadedFront!.outline.points.length;
      expect(
        reloadedFrontPoints,
        `Corner fillet should survive full combination (had ${frontPointCount} points, got ${reloadedFrontPoints})`
      ).toBe(frontPointCount);

      // Verify divider panels exist
      const reloadedDividers = reloadedPanels.panels.filter((p: any) => p.source?.type === 'divider');
      expect(reloadedDividers.length, 'Divider panels should survive full combination roundtrip').toBeGreaterThanOrEqual(1);

      // Verify geometry is valid
      const geometryResult = checkGeometry(reloadedEngine);
      expect(geometryResult.summary.errors, 'Geometry should have 0 errors after full combination roundtrip').toBe(0);
    });
  });
});
