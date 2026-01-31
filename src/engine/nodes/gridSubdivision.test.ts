/**
 * Tests for grid subdivision functionality
 * Tests multi-axis subdivision that creates full-spanning dividers
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { VoidNode } from './VoidNode';
import { AssemblyNode } from './AssemblyNode';
import { Engine, createEngineWithAssembly } from '../Engine';
import { MaterialConfig, Bounds3D } from '../types';

const defaultMaterial: MaterialConfig = {
  thickness: 3,
  fingerWidth: 6,
  fingerGap: 1,
};

describe('Grid Subdivision', () => {
  let engine: Engine;
  let assembly: AssemblyNode;

  beforeEach(() => {
    engine = createEngineWithAssembly(100, 80, 60, defaultMaterial);
    assembly = engine.assembly!;
  });

  describe('VoidNode.subdivideGrid()', () => {
    it('should create 4 cells for 2x2 grid (1 divider per axis)', () => {
      const rootVoid = assembly.rootVoid;
      const bounds = rootVoid.bounds;
      const mt = defaultMaterial.thickness;

      // Calculate center positions for single dividers on each axis
      const xCenter = bounds.x + bounds.w / 2;
      const zCenter = bounds.z + bounds.d / 2;

      rootVoid.subdivideGrid([
        { axis: 'x', positions: [xCenter] },
        { axis: 'z', positions: [zCenter] },
      ], mt);

      // Should have 4 children (2x2 grid cells)
      expect(rootVoid.getVoidChildren().length).toBe(4);

      // Check that grid subdivision info is stored
      expect(rootVoid.gridSubdivision).toBeDefined();
      expect(rootVoid.gridSubdivision!.axes).toEqual(['x', 'z']);
      expect(rootVoid.gridSubdivision!.positions['x']).toEqual([xCenter]);
      expect(rootVoid.gridSubdivision!.positions['z']).toEqual([zCenter]);
    });

    it('should create 9 cells for 3x3 grid (2 dividers per axis)', () => {
      const rootVoid = assembly.rootVoid;
      const bounds = rootVoid.bounds;
      const mt = defaultMaterial.thickness;

      // Calculate positions for 2 dividers on each axis (creating 3 cells per axis)
      const xPos1 = bounds.x + bounds.w / 3;
      const xPos2 = bounds.x + 2 * bounds.w / 3;
      const zPos1 = bounds.z + bounds.d / 3;
      const zPos2 = bounds.z + 2 * bounds.d / 3;

      rootVoid.subdivideGrid([
        { axis: 'x', positions: [xPos1, xPos2] },
        { axis: 'z', positions: [zPos1, zPos2] },
      ], mt);

      // Should have 9 children (3x3 grid cells)
      expect(rootVoid.getVoidChildren().length).toBe(9);
    });

    it('should delegate to subdivideMultiple for single axis', () => {
      const rootVoid = assembly.rootVoid;
      const bounds = rootVoid.bounds;
      const mt = defaultMaterial.thickness;

      const xCenter = bounds.x + bounds.w / 2;

      rootVoid.subdivideGrid([
        { axis: 'x', positions: [xCenter] },
      ], mt);

      // Should have 2 children (single axis creates 2 cells)
      expect(rootVoid.getVoidChildren().length).toBe(2);

      // Grid subdivision info should NOT be set (single axis uses regular subdivision)
      expect(rootVoid.gridSubdivision).toBeUndefined();
    });

    it('should throw if more than 2 axes are provided', () => {
      const rootVoid = assembly.rootVoid;
      const bounds = rootVoid.bounds;
      const mt = defaultMaterial.thickness;

      expect(() => rootVoid.subdivideGrid([
        { axis: 'x', positions: [bounds.x + bounds.w / 2] },
        { axis: 'y', positions: [bounds.y + bounds.h / 2] },
        { axis: 'z', positions: [bounds.z + bounds.d / 2] },
      ], mt)).toThrow('Grid subdivision supports maximum 2 axes');
    });

    it('should throw if void is not a leaf', () => {
      const rootVoid = assembly.rootVoid;
      const bounds = rootVoid.bounds;
      const mt = defaultMaterial.thickness;

      // First subdivide normally
      rootVoid.subdivide('x', bounds.x + bounds.w / 2, mt);

      // Now try to grid subdivide - should fail
      expect(() => rootVoid.subdivideGrid([
        { axis: 'x', positions: [bounds.x + bounds.w / 2] },
        { axis: 'z', positions: [bounds.z + bounds.d / 2] },
      ], mt)).toThrow('Cannot subdivide a non-leaf void');
    });
  });

  describe('Engine ADD_GRID_SUBDIVISION action', () => {
    it('should handle ADD_GRID_SUBDIVISION action', () => {
      const rootVoid = assembly.rootVoid;
      const bounds = rootVoid.bounds;

      const xCenter = bounds.x + bounds.w / 2;
      const zCenter = bounds.z + bounds.d / 2;

      const result = engine.dispatch({
        type: 'ADD_GRID_SUBDIVISION',
        targetId: 'main-assembly',
        payload: {
          voidId: rootVoid.id,
          axes: [
            { axis: 'x', positions: [xCenter] },
            { axis: 'z', positions: [zCenter] },
          ],
        },
      });

      expect(result).toBe(true);
      expect(rootVoid.getVoidChildren().length).toBe(4);
      expect(rootVoid.gridSubdivision).toBeDefined();
    });
  });

  describe('Grid divider panel generation', () => {
    it('should generate full-spanning dividers for grid subdivisions', () => {
      const rootVoid = assembly.rootVoid;
      const bounds = rootVoid.bounds;
      const mt = defaultMaterial.thickness;

      const xCenter = bounds.x + bounds.w / 2;
      const zCenter = bounds.z + bounds.d / 2;

      rootVoid.subdivideGrid([
        { axis: 'x', positions: [xCenter] },
        { axis: 'z', positions: [zCenter] },
      ], mt);

      // Get panels
      const panels = assembly.getPanels();

      // Find divider panels
      const dividerPanels = panels.filter(p => p.kind === 'divider-panel');

      // Should have 2 divider panels (1 X-divider, 1 Z-divider)
      expect(dividerPanels.length).toBe(2);

      // Check that dividers span full dimensions
      const xDivider = dividerPanels.find(p => p.props.axis === 'x');
      const zDivider = dividerPanels.find(p => p.props.axis === 'z');

      expect(xDivider).toBeDefined();
      expect(zDivider).toBeDefined();

      // Divider body extends to assembly boundaries for proper joint mating
      // (not just void interior bounds)
      // X-divider: width spans Z (depth), height spans Y (height)
      expect(xDivider!.derived.width).toBeCloseTo(assembly.depth, 1);
      expect(xDivider!.derived.height).toBeCloseTo(assembly.height, 1);

      // Z-divider: width spans X (width), height spans Y (height)
      expect(zDivider!.derived.width).toBeCloseTo(assembly.width, 1);
      expect(zDivider!.derived.height).toBeCloseTo(assembly.height, 1);
    });

    it('should generate subdivisions for cross-lap slot calculation', () => {
      const rootVoid = assembly.rootVoid;
      const bounds = rootVoid.bounds;
      const mt = defaultMaterial.thickness;

      const xCenter = bounds.x + bounds.w / 2;
      const zCenter = bounds.z + bounds.d / 2;

      rootVoid.subdivideGrid([
        { axis: 'x', positions: [xCenter] },
        { axis: 'z', positions: [zCenter] },
      ], mt);

      // Get subdivisions for cross-lap calculation
      const subdivisions = assembly.getSubdivisions();

      // Should have 2 subdivisions (1 for each axis)
      expect(subdivisions.length).toBe(2);

      const xSub = subdivisions.find(s => s.axis === 'x');
      const zSub = subdivisions.find(s => s.axis === 'z');

      expect(xSub).toBeDefined();
      expect(zSub).toBeDefined();

      // Both should use the parent void's bounds (full-spanning)
      expect(xSub!.bounds).toEqual(bounds);
      expect(zSub!.bounds).toEqual(bounds);
    });
  });

  describe('Grid subdivision clone()', () => {
    it('should preserve grid subdivision info when cloning', () => {
      const rootVoid = assembly.rootVoid;
      const bounds = rootVoid.bounds;
      const mt = defaultMaterial.thickness;

      const xCenter = bounds.x + bounds.w / 2;
      const zCenter = bounds.z + bounds.d / 2;

      rootVoid.subdivideGrid([
        { axis: 'x', positions: [xCenter] },
        { axis: 'z', positions: [zCenter] },
      ], mt);

      // Clone the root void
      const cloned = rootVoid.clone();

      // Check grid subdivision info is preserved
      expect(cloned.gridSubdivision).toBeDefined();
      expect(cloned.gridSubdivision!.axes).toEqual(['x', 'z']);
      expect(cloned.gridSubdivision!.positions['x']).toEqual([xCenter]);
      expect(cloned.gridSubdivision!.positions['z']).toEqual([zCenter]);

      // Check children are cloned
      expect(cloned.getVoidChildren().length).toBe(4);
    });
  });

  describe('clearSubdivision()', () => {
    it('should clear grid subdivision info', () => {
      const rootVoid = assembly.rootVoid;
      const bounds = rootVoid.bounds;
      const mt = defaultMaterial.thickness;

      const xCenter = bounds.x + bounds.w / 2;
      const zCenter = bounds.z + bounds.d / 2;

      rootVoid.subdivideGrid([
        { axis: 'x', positions: [xCenter] },
        { axis: 'z', positions: [zCenter] },
      ], mt);

      expect(rootVoid.gridSubdivision).toBeDefined();
      expect(rootVoid.getVoidChildren().length).toBe(4);

      // Clear subdivision
      rootVoid.clearSubdivision();

      expect(rootVoid.gridSubdivision).toBeUndefined();
      expect(rootVoid.getVoidChildren().length).toBe(0);
      expect(rootVoid.isLeaf).toBe(true);
    });
  });

  describe('Cross-lap slots', () => {
    it('should create cross-lap slots on BOTH dividers in grid subdivision', () => {
      const rootVoid = assembly.rootVoid;
      const bounds = rootVoid.bounds;
      const mt = defaultMaterial.thickness;

      const xCenter = bounds.x + bounds.w / 2;
      const zCenter = bounds.z + bounds.d / 2;

      rootVoid.subdivideGrid([
        { axis: 'x', positions: [xCenter] },
        { axis: 'z', positions: [zCenter] },
      ], mt);

      // Get panels
      const panels = assembly.getPanels();
      const dividerPanels = panels.filter(p => p.kind === 'divider-panel');

      expect(dividerPanels.length).toBe(2);

      const xDivider = dividerPanels.find(p => p.props.axis === 'x');
      const zDivider = dividerPanels.find(p => p.props.axis === 'z');

      expect(xDivider).toBeDefined();
      expect(zDivider).toBeDefined();

      // The panel dimensions (height spans Y = 80)
      const panelHalfHeight = assembly.height / 2; // 40

      const xOutlinePoints = xDivider!.derived.outline.points;
      const zOutlinePoints = zDivider!.derived.outline.points;

      // Find cross-lap notch in X-divider (should be from TOP, so Y values at 0)
      const xNotchPoints = xOutlinePoints.filter((p: {x: number, y: number}) => Math.abs(p.y) < panelHalfHeight * 0.1);

      // Find cross-lap notch in Z-divider (should be from BOTTOM, so Y values at 0)
      const zNotchPoints = zOutlinePoints.filter((p: {x: number, y: number}) => Math.abs(p.y) < panelHalfHeight * 0.1);

      // Both should have cross-lap notch points at Y ≈ 0
      // Cross-lap slots create points at the center of the panel (y=0)
      expect(xNotchPoints.length).toBeGreaterThan(0);
      expect(zNotchPoints.length).toBeGreaterThan(0);

      // Check that the notch points are at the expected X position (around 0)
      // The X-divider's notch should be around x=0 (center of Z span)
      // The Z-divider's notch should be around x=0 (center of X span)
      const xNotchCenter = xNotchPoints.find((p: {x: number, y: number}) => Math.abs(p.x) < 2);
      const zNotchCenter = zNotchPoints.find((p: {x: number, y: number}) => Math.abs(p.x) < 2);
      expect(xNotchCenter).toBeDefined();
      expect(zNotchCenter).toBeDefined();
    });
  });
});
