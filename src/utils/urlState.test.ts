/**
 * Serialization roundtrip tests
 * Ensures that all project state survives serialize/deserialize cycles
 */

import { describe, it, expect } from 'vitest';
import { serializeProject, deserializeProject, ProjectState } from './urlState';
import { BoxConfig, Face, Void, SubAssembly, EdgeExtensions } from '../types';

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
    const { resetEngine, syncStoreToEngine, getEngine } = await import('../engine');

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
    const { resetEngine, syncStoreToEngine, getEngine } = await import('../engine');

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
