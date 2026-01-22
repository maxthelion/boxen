/**
 * URL State Serialization Tests
 *
 * These tests verify that:
 * 1. Serialization and deserialization are lossless for object counts
 * 2. Voids, sub-assemblies, faces, and edge extensions are all preserved
 * 3. Nested structures (sub-assemblies with their own voids) are correctly handled
 */

import { describe, it, expect } from 'vitest';
import { serializeProject, deserializeProject, ProjectState } from './urlState';
import {
  Void,
  Face,
  BoxConfig,
  SubAssembly,
  defaultAssemblyConfig,
  defaultFaceOffsets,
  EdgeExtensions,
} from '../types';

// Helper to count all voids in a tree (including nested in sub-assemblies)
const countVoids = (v: Void): number => {
  let count = 1; // This void
  for (const child of v.children) {
    count += countVoids(child);
  }
  if (v.subAssembly) {
    count += countVoids(v.subAssembly.rootVoid);
  }
  return count;
};

// Helper to count all sub-assemblies in a void tree
const countSubAssemblies = (v: Void): number => {
  let count = v.subAssembly ? 1 : 0;
  for (const child of v.children) {
    count += countSubAssemblies(child);
  }
  if (v.subAssembly) {
    count += countSubAssemblies(v.subAssembly.rootVoid);
  }
  return count;
};

// Helper to count solid faces
const countSolidFaces = (faces: Face[]): number => {
  return faces.filter(f => f.solid).length;
};

// Helper to create default faces (all solid)
const createFaces = (solidIds: string[] = ['front', 'back', 'left', 'right', 'top', 'bottom']): Face[] => {
  const allIds = ['front', 'back', 'left', 'right', 'top', 'bottom'];
  return allIds.map(id => ({ id: id as any, solid: solidIds.includes(id) }));
};

// Helper to create a basic config
const createConfig = (overrides: Partial<BoxConfig> = {}): BoxConfig => ({
  width: 100,
  height: 100,
  depth: 100,
  materialThickness: 3,
  fingerWidth: 10,
  fingerGap: 0.1,
  assembly: { ...defaultAssemblyConfig },
  ...overrides,
});

// Helper to create a basic void
const createVoid = (id: string, bounds = { x: 0, y: 0, z: 0, w: 94, h: 94, d: 94 }): Void => ({
  id,
  bounds,
  children: [],
});

// Helper to create a sub-assembly
const createSubAssembly = (id: string, interiorBounds = { x: 0, y: 0, z: 0, w: 84, h: 84, d: 84 }): SubAssembly => ({
  id,
  clearance: 2,
  faceOffsets: { ...defaultFaceOffsets },
  faces: createFaces(),
  rootVoid: createVoid(`${id}-interior`, interiorBounds),
  materialThickness: 3,
  assembly: { ...defaultAssemblyConfig },
});

describe('URL State Serialization', () => {
  describe('Basic serialization round-trip', () => {
    it('should preserve a simple project state', () => {
      const state: ProjectState = {
        config: createConfig(),
        faces: createFaces(),
        rootVoid: createVoid('root'),
        edgeExtensions: {},
      };

      const serialized = serializeProject(state);
      const deserialized = deserializeProject(serialized);

      expect(deserialized).not.toBeNull();
      expect(deserialized!.config.width).toBe(state.config.width);
      expect(deserialized!.config.height).toBe(state.config.height);
      expect(deserialized!.config.depth).toBe(state.config.depth);
      expect(deserialized!.faces.length).toBe(6);
      expect(countSolidFaces(deserialized!.faces)).toBe(6);
    });

    it('should preserve face solid states', () => {
      const state: ProjectState = {
        config: createConfig(),
        faces: createFaces(['front', 'back', 'bottom']), // Only 3 solid
        rootVoid: createVoid('root'),
        edgeExtensions: {},
      };

      const serialized = serializeProject(state);
      const deserialized = deserializeProject(serialized);

      expect(deserialized).not.toBeNull();
      expect(countSolidFaces(deserialized!.faces)).toBe(3);
      expect(deserialized!.faces.find(f => f.id === 'front')?.solid).toBe(true);
      expect(deserialized!.faces.find(f => f.id === 'top')?.solid).toBe(false);
    });
  });

  describe('Void tree serialization', () => {
    it('should preserve void count with no children', () => {
      const state: ProjectState = {
        config: createConfig(),
        faces: createFaces(),
        rootVoid: createVoid('root'),
        edgeExtensions: {},
      };

      const serialized = serializeProject(state);
      const deserialized = deserializeProject(serialized);

      expect(countVoids(state.rootVoid)).toBe(1);
      expect(countVoids(deserialized!.rootVoid)).toBe(1);
    });

    it('should preserve void count with single subdivision', () => {
      const rootVoid: Void = {
        id: 'root',
        bounds: { x: 0, y: 0, z: 0, w: 94, h: 94, d: 94 },
        children: [
          {
            id: 'child1',
            bounds: { x: 0, y: 0, z: 0, w: 47, h: 94, d: 94 },
            children: [],
            splitAxis: 'x',
            splitPosition: 47,
          },
          {
            id: 'child2',
            bounds: { x: 47, y: 0, z: 0, w: 47, h: 94, d: 94 },
            children: [],
          },
        ],
      };

      const state: ProjectState = {
        config: createConfig(),
        faces: createFaces(),
        rootVoid,
        edgeExtensions: {},
      };

      const originalCount = countVoids(state.rootVoid);
      expect(originalCount).toBe(3); // root + 2 children

      const serialized = serializeProject(state);
      const deserialized = deserializeProject(serialized);

      expect(countVoids(deserialized!.rootVoid)).toBe(originalCount);
    });

    it('should preserve void count with nested subdivisions', () => {
      const rootVoid: Void = {
        id: 'root',
        bounds: { x: 0, y: 0, z: 0, w: 94, h: 94, d: 94 },
        children: [
          {
            id: 'child1',
            bounds: { x: 0, y: 0, z: 0, w: 47, h: 94, d: 94 },
            children: [
              {
                id: 'grandchild1',
                bounds: { x: 0, y: 0, z: 0, w: 47, h: 47, d: 94 },
                children: [],
                splitAxis: 'y',
                splitPosition: 47,
              },
              {
                id: 'grandchild2',
                bounds: { x: 0, y: 47, z: 0, w: 47, h: 47, d: 94 },
                children: [],
              },
            ],
            splitAxis: 'x',
            splitPosition: 47,
          },
          {
            id: 'child2',
            bounds: { x: 47, y: 0, z: 0, w: 47, h: 94, d: 94 },
            children: [],
          },
        ],
      };

      const state: ProjectState = {
        config: createConfig(),
        faces: createFaces(),
        rootVoid,
        edgeExtensions: {},
      };

      const originalCount = countVoids(state.rootVoid);
      expect(originalCount).toBe(5); // root + 2 children + 2 grandchildren

      const serialized = serializeProject(state);
      const deserialized = deserializeProject(serialized);

      expect(countVoids(deserialized!.rootVoid)).toBe(originalCount);
    });

    it('should preserve splitAxis and splitPosition', () => {
      const rootVoid: Void = {
        id: 'root',
        bounds: { x: 0, y: 0, z: 0, w: 94, h: 94, d: 94 },
        children: [
          {
            id: 'child1',
            bounds: { x: 0, y: 0, z: 0, w: 47, h: 94, d: 94 },
            children: [],
            splitAxis: 'x',
            splitPosition: 47,
          },
          {
            id: 'child2',
            bounds: { x: 47, y: 0, z: 0, w: 47, h: 94, d: 94 },
            children: [],
          },
        ],
      };

      const state: ProjectState = {
        config: createConfig(),
        faces: createFaces(),
        rootVoid,
        edgeExtensions: {},
      };

      const serialized = serializeProject(state);
      const deserialized = deserializeProject(serialized);

      const child1 = deserialized!.rootVoid.children[0];
      expect(child1.splitAxis).toBe('x');
      expect(child1.splitPosition).toBe(47);
    });
  });

  describe('Sub-assembly serialization', () => {
    it('should preserve a single sub-assembly', () => {
      const rootVoid: Void = {
        ...createVoid('root'),
        subAssembly: createSubAssembly('sub1'),
      };

      const state: ProjectState = {
        config: createConfig(),
        faces: createFaces(),
        rootVoid,
        edgeExtensions: {},
      };

      expect(countSubAssemblies(state.rootVoid)).toBe(1);

      const serialized = serializeProject(state);
      const deserialized = deserializeProject(serialized);

      expect(countSubAssemblies(deserialized!.rootVoid)).toBe(1);
      expect(deserialized!.rootVoid.subAssembly).toBeDefined();
      expect(deserialized!.rootVoid.subAssembly!.id).toBe('sub1');
    });

    it('should preserve sub-assembly properties', () => {
      const subAssembly: SubAssembly = {
        id: 'sub1',
        clearance: 5,
        faceOffsets: { front: 1, back: 2, left: 3, right: 4, top: 5, bottom: 6 },
        faces: createFaces(['front', 'back', 'left', 'right']), // 4 solid, top/bottom open
        rootVoid: createVoid('sub1-interior'),
        materialThickness: 2.5,
        assembly: {
          assemblyAxis: 'z',
          lids: {
            positive: { enabled: true, tabDirection: 'tabs-in', inset: 10 },
            negative: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
          },
        },
      };

      const rootVoid: Void = {
        ...createVoid('root'),
        subAssembly,
      };

      const state: ProjectState = {
        config: createConfig(),
        faces: createFaces(),
        rootVoid,
        edgeExtensions: {},
      };

      const serialized = serializeProject(state);
      const deserialized = deserializeProject(serialized);

      const sub = deserialized!.rootVoid.subAssembly!;
      expect(sub.clearance).toBe(5);
      expect(sub.faceOffsets.front).toBe(1);
      expect(sub.faceOffsets.back).toBe(2);
      expect(sub.faceOffsets.left).toBe(3);
      expect(sub.faceOffsets.right).toBe(4);
      expect(sub.faceOffsets.top).toBe(5);
      expect(sub.faceOffsets.bottom).toBe(6);
      expect(countSolidFaces(sub.faces)).toBe(4);
      expect(sub.materialThickness).toBe(2.5);
      expect(sub.assembly.assemblyAxis).toBe('z');
      expect(sub.assembly.lids.positive.tabDirection).toBe('tabs-in');
      expect(sub.assembly.lids.positive.inset).toBe(10);
    });

    it('should preserve sub-assembly in a subdivided void', () => {
      const rootVoid: Void = {
        id: 'root',
        bounds: { x: 0, y: 0, z: 0, w: 94, h: 94, d: 94 },
        children: [
          {
            id: 'child1',
            bounds: { x: 0, y: 0, z: 0, w: 47, h: 94, d: 94 },
            children: [],
            splitAxis: 'x',
            splitPosition: 47,
            subAssembly: createSubAssembly('sub1'),
          },
          {
            id: 'child2',
            bounds: { x: 47, y: 0, z: 0, w: 47, h: 94, d: 94 },
            children: [],
          },
        ],
      };

      const state: ProjectState = {
        config: createConfig(),
        faces: createFaces(),
        rootVoid,
        edgeExtensions: {},
      };

      expect(countSubAssemblies(state.rootVoid)).toBe(1);
      expect(countVoids(state.rootVoid)).toBe(4); // root + 2 children + 1 sub-assembly interior

      const serialized = serializeProject(state);
      const deserialized = deserializeProject(serialized);

      expect(countSubAssemblies(deserialized!.rootVoid)).toBe(1);
      expect(countVoids(deserialized!.rootVoid)).toBe(4);
      expect(deserialized!.rootVoid.children[0].subAssembly).toBeDefined();
      expect(deserialized!.rootVoid.children[0].subAssembly!.id).toBe('sub1');
    });

    it('should preserve sub-assembly with subdivided interior', () => {
      const subAssemblyInterior: Void = {
        id: 'sub1-interior',
        bounds: { x: 0, y: 0, z: 0, w: 84, h: 84, d: 84 },
        children: [
          {
            id: 'sub1-cell1',
            bounds: { x: 0, y: 0, z: 0, w: 42, h: 84, d: 84 },
            children: [],
            splitAxis: 'x',
            splitPosition: 42,
          },
          {
            id: 'sub1-cell2',
            bounds: { x: 42, y: 0, z: 0, w: 42, h: 84, d: 84 },
            children: [],
          },
        ],
      };

      const subAssembly: SubAssembly = {
        ...createSubAssembly('sub1'),
        rootVoid: subAssemblyInterior,
      };

      const rootVoid: Void = {
        ...createVoid('root'),
        subAssembly,
      };

      const state: ProjectState = {
        config: createConfig(),
        faces: createFaces(),
        rootVoid,
        edgeExtensions: {},
      };

      // root (1) + sub-assembly interior (1) + 2 cells inside sub-assembly = 4
      expect(countVoids(state.rootVoid)).toBe(4);
      expect(countSubAssemblies(state.rootVoid)).toBe(1);

      const serialized = serializeProject(state);
      const deserialized = deserializeProject(serialized);

      expect(countVoids(deserialized!.rootVoid)).toBe(4);
      expect(countSubAssemblies(deserialized!.rootVoid)).toBe(1);
      expect(deserialized!.rootVoid.subAssembly!.rootVoid.children.length).toBe(2);
    });

    it('should preserve multiple sub-assemblies in different voids', () => {
      const rootVoid: Void = {
        id: 'root',
        bounds: { x: 0, y: 0, z: 0, w: 94, h: 94, d: 94 },
        children: [
          {
            id: 'child1',
            bounds: { x: 0, y: 0, z: 0, w: 47, h: 94, d: 94 },
            children: [],
            splitAxis: 'x',
            splitPosition: 47,
            subAssembly: createSubAssembly('sub1'),
          },
          {
            id: 'child2',
            bounds: { x: 47, y: 0, z: 0, w: 47, h: 94, d: 94 },
            children: [],
            subAssembly: createSubAssembly('sub2'),
          },
        ],
      };

      const state: ProjectState = {
        config: createConfig(),
        faces: createFaces(),
        rootVoid,
        edgeExtensions: {},
      };

      expect(countSubAssemblies(state.rootVoid)).toBe(2);
      // root + 2 children + 2 sub-assembly interiors = 5
      expect(countVoids(state.rootVoid)).toBe(5);

      const serialized = serializeProject(state);
      const deserialized = deserializeProject(serialized);

      expect(countSubAssemblies(deserialized!.rootVoid)).toBe(2);
      expect(countVoids(deserialized!.rootVoid)).toBe(5);
    });
  });

  describe('Edge extensions serialization', () => {
    it('should preserve edge extensions', () => {
      const edgeExtensions: Record<string, EdgeExtensions> = {
        'face-front': { top: 5, bottom: -3, left: 0, right: 2 },
        'face-back': { top: 0, bottom: 0, left: 1, right: 1 },
      };

      const state: ProjectState = {
        config: createConfig(),
        faces: createFaces(),
        rootVoid: createVoid('root'),
        edgeExtensions,
      };

      const serialized = serializeProject(state);
      const deserialized = deserializeProject(serialized);

      expect(Object.keys(deserialized!.edgeExtensions).length).toBe(2);
      expect(deserialized!.edgeExtensions['face-front'].top).toBe(5);
      expect(deserialized!.edgeExtensions['face-front'].bottom).toBe(-3);
      expect(deserialized!.edgeExtensions['face-front'].left).toBe(0);
      expect(deserialized!.edgeExtensions['face-front'].right).toBe(2);
    });

    it('should not include all-zero extensions', () => {
      const edgeExtensions: Record<string, EdgeExtensions> = {
        'face-front': { top: 5, bottom: 0, left: 0, right: 0 },
        'face-back': { top: 0, bottom: 0, left: 0, right: 0 }, // All zero - should be omitted
      };

      const state: ProjectState = {
        config: createConfig(),
        faces: createFaces(),
        rootVoid: createVoid('root'),
        edgeExtensions,
      };

      const serialized = serializeProject(state);
      const deserialized = deserializeProject(serialized);

      // Only face-front should be in the result
      expect(Object.keys(deserialized!.edgeExtensions).length).toBe(1);
      expect(deserialized!.edgeExtensions['face-front']).toBeDefined();
    });
  });

  describe('Assembly config serialization', () => {
    it('should preserve non-default assembly config', () => {
      const config = createConfig({
        assembly: {
          assemblyAxis: 'z',
          lids: {
            positive: { enabled: true, tabDirection: 'tabs-in', inset: 15 },
            negative: { enabled: true, tabDirection: 'tabs-out', inset: 5 },
          },
        },
      });

      const state: ProjectState = {
        config,
        faces: createFaces(),
        rootVoid: createVoid('root'),
        edgeExtensions: {},
      };

      const serialized = serializeProject(state);
      const deserialized = deserializeProject(serialized);

      expect(deserialized!.config.assembly.assemblyAxis).toBe('z');
      expect(deserialized!.config.assembly.lids.positive.tabDirection).toBe('tabs-in');
      expect(deserialized!.config.assembly.lids.positive.inset).toBe(15);
      expect(deserialized!.config.assembly.lids.negative.inset).toBe(5);
    });
  });

  describe('Complex scenario', () => {
    it('should preserve a complex project with subdivisions, sub-assemblies, and extensions', () => {
      // Create a complex nested structure
      const subAssemblyInterior: Void = {
        id: 'sub1-interior',
        bounds: { x: 0, y: 0, z: 0, w: 38, h: 84, d: 84 },
        children: [
          {
            id: 'sub1-cell1',
            bounds: { x: 0, y: 0, z: 0, w: 38, h: 42, d: 84 },
            children: [],
            splitAxis: 'y',
            splitPosition: 42,
          },
          {
            id: 'sub1-cell2',
            bounds: { x: 0, y: 42, z: 0, w: 38, h: 42, d: 84 },
            children: [],
          },
        ],
      };

      const rootVoid: Void = {
        id: 'root',
        bounds: { x: 0, y: 0, z: 0, w: 94, h: 94, d: 94 },
        children: [
          {
            id: 'left-section',
            bounds: { x: 0, y: 0, z: 0, w: 47, h: 94, d: 94 },
            children: [],
            splitAxis: 'x',
            splitPosition: 47,
            subAssembly: {
              id: 'drawer',
              clearance: 2,
              faceOffsets: { front: 0, back: 0, left: 0, right: 0, top: 5, bottom: 0 },
              faces: createFaces(['front', 'back', 'left', 'right', 'bottom']),
              rootVoid: subAssemblyInterior,
              materialThickness: 3,
              assembly: { ...defaultAssemblyConfig, assemblyAxis: 'y' },
            },
          },
          {
            id: 'right-section',
            bounds: { x: 47, y: 0, z: 0, w: 47, h: 94, d: 94 },
            children: [
              {
                id: 'right-top',
                bounds: { x: 47, y: 47, z: 0, w: 47, h: 47, d: 94 },
                children: [],
                splitAxis: 'y',
                splitPosition: 47,
              },
              {
                id: 'right-bottom',
                bounds: { x: 47, y: 0, z: 0, w: 47, h: 47, d: 94 },
                children: [],
              },
            ],
          },
        ],
      };

      const edgeExtensions: Record<string, EdgeExtensions> = {
        'face-top': { top: 0, bottom: 0, left: 5, right: 5 },
        'subasm-drawer-face-front': { top: 2, bottom: 0, left: 0, right: 0 },
      };

      const state: ProjectState = {
        config: createConfig({
          assembly: {
            assemblyAxis: 'y',
            lids: {
              positive: { enabled: true, tabDirection: 'tabs-in', inset: 10 },
              negative: { enabled: true, tabDirection: 'tabs-out', inset: 0 },
            },
          },
        }),
        faces: createFaces(['front', 'back', 'left', 'right', 'bottom']), // Open top
        rootVoid,
        edgeExtensions,
      };

      // Count original objects
      const originalVoidCount = countVoids(state.rootVoid);
      const originalSubAssemblyCount = countSubAssemblies(state.rootVoid);
      const originalSolidFaceCount = countSolidFaces(state.faces);
      const originalExtensionCount = Object.keys(state.edgeExtensions).length;

      // Verify our counting
      expect(originalVoidCount).toBe(8); // root + 2 main children + 2 right children + sub-asm interior + 2 sub-asm cells
      expect(originalSubAssemblyCount).toBe(1);
      expect(originalSolidFaceCount).toBe(5);
      expect(originalExtensionCount).toBe(2);

      // Serialize and deserialize
      const serialized = serializeProject(state);
      const deserialized = deserializeProject(serialized);

      // Verify all counts match
      expect(countVoids(deserialized!.rootVoid)).toBe(originalVoidCount);
      expect(countSubAssemblies(deserialized!.rootVoid)).toBe(originalSubAssemblyCount);
      expect(countSolidFaces(deserialized!.faces)).toBe(originalSolidFaceCount);
      expect(Object.keys(deserialized!.edgeExtensions).length).toBe(originalExtensionCount);

      // Verify specific structure
      expect(deserialized!.rootVoid.children[0].subAssembly).toBeDefined();
      expect(deserialized!.rootVoid.children[0].subAssembly!.id).toBe('drawer');
      expect(deserialized!.rootVoid.children[0].subAssembly!.rootVoid.children.length).toBe(2);
      expect(deserialized!.rootVoid.children[1].children.length).toBe(2);
    });
  });
});
