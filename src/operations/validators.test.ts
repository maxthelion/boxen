/**
 * Operation Validators Tests
 *
 * Tests for the declarative validation system that determines
 * which selections are valid for each operation.
 */

import { describe, it, expect } from 'vitest';
import {
  validateSubdivideSelection,
  validateSubdivideTwoPanelSelection,
  validatePushPullSelection,
  validateCreateSubAssemblySelection,
  validateToggleFaceSelection,
  validateSelection,
  getSelectionRequirements,
  getFaceNormalAxis,
  getPanelNormalAxis,
  getPerpendicularAxes,
  areOpposingFaces,
  isLeafVoid,
  findVoidBetweenPanels,
  getValidSubdivisionAxes,
} from './validators';
import { Void, Face, PanelPath, FaceId } from '../types';
import { Axis } from '../engine/types';

// =============================================================================
// Test Fixtures
// =============================================================================

const createTestFaces = (overrides: Partial<Record<FaceId, boolean>> = {}): Face[] => {
  const defaults: Record<FaceId, boolean> = {
    front: true, back: true, left: true, right: true, top: true, bottom: true,
    ...overrides,
  };
  return Object.entries(defaults).map(([id, solid]) => ({
    id: id as FaceId,
    label: id.charAt(0).toUpperCase() + id.slice(1),
    axis: (id === 'left' || id === 'right') ? 'x' :
          (id === 'top' || id === 'bottom') ? 'y' : 'z',
    solid,
  }));
};

const createLeafVoid = (id: string, bounds = { x: 3, y: 3, z: 3, w: 94, h: 74, d: 54 }): Void => ({
  id,
  bounds,
  children: [],
});

const createSubdividedVoid = (id: string, childIds: string[]): Void => ({
  id,
  bounds: { x: 3, y: 3, z: 3, w: 94, h: 74, d: 54 },
  children: childIds.map((childId, i) => ({
    id: childId,
    bounds: { x: 3 + i * 30, y: 3, z: 3, w: 28, h: 74, d: 54 },
    children: [],
    splitAxis: 'x' as Axis,
    splitPosition: 33 + i * 30,
  })),
  splitAxis: 'x',
});

const createFacePanel = (faceId: FaceId, subAssemblyId?: string): PanelPath => ({
  id: subAssemblyId ? `${subAssemblyId}-face-${faceId}` : `face-${faceId}`,
  source: {
    type: 'face',
    faceId,
    subAssemblyId,
  },
  outline: { points: [], closed: true },
  holes: [],
  thickness: 3,
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  visible: true,
  edgeExtensions: { top: 0, bottom: 0, left: 0, right: 0 },
});

const createDividerPanel = (voidId: string, axis: Axis, position: number): PanelPath => ({
  id: `divider-${voidId}-${axis}-${position}`,
  source: {
    type: 'divider',
    axis,
    subdivisionId: `divider-${voidId}-${axis}-${position}`,
  },
  outline: { points: [], closed: true },
  holes: [],
  thickness: 3,
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  visible: true,
  edgeExtensions: { top: 0, bottom: 0, left: 0, right: 0 },
});

// =============================================================================
// Helper Function Tests
// =============================================================================

describe('Helper Functions', () => {
  describe('getFaceNormalAxis', () => {
    it('returns x for left and right faces', () => {
      expect(getFaceNormalAxis('left')).toBe('x');
      expect(getFaceNormalAxis('right')).toBe('x');
    });

    it('returns y for top and bottom faces', () => {
      expect(getFaceNormalAxis('top')).toBe('y');
      expect(getFaceNormalAxis('bottom')).toBe('y');
    });

    it('returns z for front and back faces', () => {
      expect(getFaceNormalAxis('front')).toBe('z');
      expect(getFaceNormalAxis('back')).toBe('z');
    });
  });

  describe('getPanelNormalAxis', () => {
    it('returns correct axis for face panels', () => {
      expect(getPanelNormalAxis(createFacePanel('left'))).toBe('x');
      expect(getPanelNormalAxis(createFacePanel('top'))).toBe('y');
      expect(getPanelNormalAxis(createFacePanel('front'))).toBe('z');
    });

    it('returns correct axis for divider panels', () => {
      expect(getPanelNormalAxis(createDividerPanel('root', 'x', 50))).toBe('x');
      expect(getPanelNormalAxis(createDividerPanel('root', 'y', 40))).toBe('y');
      expect(getPanelNormalAxis(createDividerPanel('root', 'z', 30))).toBe('z');
    });
  });

  describe('getPerpendicularAxes', () => {
    it('returns y and z for x axis', () => {
      expect(getPerpendicularAxes('x')).toEqual(['y', 'z']);
    });

    it('returns x and z for y axis', () => {
      expect(getPerpendicularAxes('y')).toEqual(['x', 'z']);
    });

    it('returns x and y for z axis', () => {
      expect(getPerpendicularAxes('z')).toEqual(['x', 'y']);
    });
  });

  describe('areOpposingFaces', () => {
    it('returns true for opposing face pairs', () => {
      expect(areOpposingFaces('left', 'right')).toBe(true);
      expect(areOpposingFaces('right', 'left')).toBe(true);
      expect(areOpposingFaces('top', 'bottom')).toBe(true);
      expect(areOpposingFaces('bottom', 'top')).toBe(true);
      expect(areOpposingFaces('front', 'back')).toBe(true);
      expect(areOpposingFaces('back', 'front')).toBe(true);
    });

    it('returns false for non-opposing faces', () => {
      expect(areOpposingFaces('left', 'top')).toBe(false);
      expect(areOpposingFaces('front', 'right')).toBe(false);
      expect(areOpposingFaces('left', 'left')).toBe(false);
    });
  });

  describe('isLeafVoid', () => {
    it('returns true for void with no children and no sub-assembly', () => {
      expect(isLeafVoid(createLeafVoid('root'))).toBe(true);
    });

    it('returns false for void with children', () => {
      expect(isLeafVoid(createSubdividedVoid('root', ['child1', 'child2']))).toBe(false);
    });

    it('returns false for void with sub-assembly', () => {
      const voidWithSubAssembly: Void = {
        ...createLeafVoid('root'),
        subAssembly: {
          id: 'sub-1',
          rootVoid: createLeafVoid('sub-root'),
          clearance: 2,
          assemblyAxis: 'y',
        },
      };
      expect(isLeafVoid(voidWithSubAssembly)).toBe(false);
    });
  });

  describe('getValidSubdivisionAxes', () => {
    it('returns all axes valid when all faces are solid', () => {
      const faces = createTestFaces();
      const result = getValidSubdivisionAxes(faces);
      expect(result).toEqual({ x: true, y: true, z: true });
    });

    it('returns x invalid when left is open', () => {
      const faces = createTestFaces({ left: false });
      const result = getValidSubdivisionAxes(faces);
      expect(result.x).toBe(false);
      expect(result.y).toBe(true);
      expect(result.z).toBe(true);
    });

    it('returns x invalid when right is open', () => {
      const faces = createTestFaces({ right: false });
      const result = getValidSubdivisionAxes(faces);
      expect(result.x).toBe(false);
    });

    it('returns y invalid when top or bottom is open', () => {
      expect(getValidSubdivisionAxes(createTestFaces({ top: false })).y).toBe(false);
      expect(getValidSubdivisionAxes(createTestFaces({ bottom: false })).y).toBe(false);
    });

    it('returns z invalid when front or back is open', () => {
      expect(getValidSubdivisionAxes(createTestFaces({ front: false })).z).toBe(false);
      expect(getValidSubdivisionAxes(createTestFaces({ back: false })).z).toBe(false);
    });
  });
});

// =============================================================================
// Subdivide (Single Void) Validation Tests
// =============================================================================

describe('validateSubdivideSelection', () => {
  const faces = createTestFaces();

  it('rejects empty selection', () => {
    const result = validateSubdivideSelection(new Set(), createLeafVoid('root'), faces);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Select a void');
  });

  it('rejects multiple void selection', () => {
    const result = validateSubdivideSelection(
      new Set(['void1', 'void2']),
      createLeafVoid('root'),
      faces
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('only one');
  });

  it('rejects non-leaf void (has children)', () => {
    const rootVoid = createSubdividedVoid('root', ['child1', 'child2']);
    const result = validateSubdivideSelection(new Set(['root']), rootVoid, faces);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('already has subdivisions');
  });

  it('rejects void with sub-assembly', () => {
    const rootVoid: Void = {
      ...createLeafVoid('root'),
      subAssembly: {
        id: 'sub-1',
        rootVoid: createLeafVoid('sub-root'),
        clearance: 2,
        assemblyAxis: 'y',
      },
    };
    const result = validateSubdivideSelection(new Set(['root']), rootVoid, faces);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('sub-assembly');
  });

  it('accepts leaf void selection', () => {
    const result = validateSubdivideSelection(
      new Set(['root']),
      createLeafVoid('root'),
      faces
    );
    expect(result.valid).toBe(true);
    expect(result.derived?.targetVoidId).toBe('root');
    expect(result.derived?.validAxes).toEqual(['x', 'y', 'z']);
  });

  it('returns limited valid axes when faces are open', () => {
    const facesWithOpenTop = createTestFaces({ top: false });
    const result = validateSubdivideSelection(
      new Set(['root']),
      createLeafVoid('root'),
      facesWithOpenTop
    );
    expect(result.valid).toBe(true);
    expect(result.derived?.validAxes).toEqual(['x', 'z']);
  });
});

// =============================================================================
// Subdivide Two-Panel Validation Tests
// =============================================================================

describe('validateSubdivideTwoPanelSelection', () => {
  const createPanelCollection = (panels: PanelPath[]) => ({ panels });

  describe('Selection Count', () => {
    it('rejects selection with less than 2 panels', () => {
      const panels = [createFacePanel('left')];
      const result = validateSubdivideTwoPanelSelection(
        new Set(['face-left']),
        createPanelCollection(panels),
        createLeafVoid('root')
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('two parallel panels');
    });

    it('rejects selection with more than 2 panels', () => {
      const panels = [createFacePanel('left'), createFacePanel('right'), createFacePanel('top')];
      const result = validateSubdivideTwoPanelSelection(
        new Set(['face-left', 'face-right', 'face-top']),
        createPanelCollection(panels),
        createLeafVoid('root')
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('exactly two');
    });
  });

  describe('Opposing Face Panels', () => {
    it('accepts opposing face panels (left & right)', () => {
      const panels = [createFacePanel('left'), createFacePanel('right')];
      const result = validateSubdivideTwoPanelSelection(
        new Set(['face-left', 'face-right']),
        createPanelCollection(panels),
        createLeafVoid('root')
      );
      expect(result.valid).toBe(true);
      expect(result.derived?.normalAxis).toBe('x');
      expect(result.derived?.validAxes).toEqual(['y', 'z']);
    });

    it('accepts opposing face panels (top & bottom)', () => {
      const panels = [createFacePanel('top'), createFacePanel('bottom')];
      const result = validateSubdivideTwoPanelSelection(
        new Set(['face-top', 'face-bottom']),
        createPanelCollection(panels),
        createLeafVoid('root')
      );
      expect(result.valid).toBe(true);
      expect(result.derived?.normalAxis).toBe('y');
      expect(result.derived?.validAxes).toEqual(['x', 'z']);
    });

    it('accepts opposing face panels (front & back)', () => {
      const panels = [createFacePanel('front'), createFacePanel('back')];
      const result = validateSubdivideTwoPanelSelection(
        new Set(['face-front', 'face-back']),
        createPanelCollection(panels),
        createLeafVoid('root')
      );
      expect(result.valid).toBe(true);
      expect(result.derived?.normalAxis).toBe('z');
      expect(result.derived?.validAxes).toEqual(['x', 'y']);
    });

    it('rejects non-opposing face panels (left & top)', () => {
      const panels = [createFacePanel('left'), createFacePanel('top')];
      const result = validateSubdivideTwoPanelSelection(
        new Set(['face-left', 'face-top']),
        createPanelCollection(panels),
        createLeafVoid('root')
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('parallel');
    });

    it('rejects non-opposing face panels on same axis (left & left)', () => {
      // This would require two panels with same ID which is impossible,
      // so test left & front (different axes)
      const panels = [createFacePanel('left'), createFacePanel('front')];
      const result = validateSubdivideTwoPanelSelection(
        new Set(['face-left', 'face-front']),
        createPanelCollection(panels),
        createLeafVoid('root')
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('parallel');
    });

    it('rejects when void between panels is not leaf', () => {
      const panels = [createFacePanel('left'), createFacePanel('right')];
      const subdividedRoot = createSubdividedVoid('root', ['child1', 'child2']);
      const result = validateSubdivideTwoPanelSelection(
        new Set(['face-left', 'face-right']),
        createPanelCollection(panels),
        subdividedRoot
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('empty void');
    });
  });

  describe('Sub-Assembly Panels', () => {
    it('rejects sub-assembly panels', () => {
      const panels = [
        createFacePanel('left', 'sub-1'),
        createFacePanel('right', 'sub-1'),
      ];
      const result = validateSubdivideTwoPanelSelection(
        new Set(['sub-1-face-left', 'sub-1-face-right']),
        createPanelCollection(panels),
        createLeafVoid('root')
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Sub-assembly');
    });
  });

  describe('Derived State', () => {
    it('includes target void in derived state', () => {
      const panels = [createFacePanel('left'), createFacePanel('right')];
      const rootVoid = createLeafVoid('root');
      const result = validateSubdivideTwoPanelSelection(
        new Set(['face-left', 'face-right']),
        createPanelCollection(panels),
        rootVoid
      );
      expect(result.derived?.targetVoid).toBeDefined();
      expect(result.derived?.targetVoidId).toBe('root');
    });

    it('includes panel descriptions in derived state', () => {
      const panels = [createFacePanel('left'), createFacePanel('right')];
      const result = validateSubdivideTwoPanelSelection(
        new Set(['face-left', 'face-right']),
        createPanelCollection(panels),
        createLeafVoid('root')
      );
      expect(result.derived?.panelDescriptions).toContain('Left');
      expect(result.derived?.panelDescriptions).toContain('Right');
    });
  });

  describe('Face + Divider Panels', () => {
    it('accepts face panel + adjacent divider on same axis (right face + divider)', () => {
      // Subdivided void: left | child0 | divider | child1 | right
      const subdividedRoot = createSubdividedVoid('root', ['child0', 'child1']);
      const panels = [
        createFacePanel('right'),
        createDividerPanel('child0', 'x', 50),  // divider between child0 and child1
      ];
      const result = validateSubdivideTwoPanelSelection(
        new Set(['face-right', 'divider-child0-x-50']),
        createPanelCollection(panels),
        subdividedRoot
      );
      expect(result.valid).toBe(true);
      expect(result.derived?.targetVoidId).toBe('child1');  // void between right face and divider
      expect(result.derived?.validAxes).toEqual(['y', 'z']);  // perpendicular to X
    });

    it('accepts face panel + adjacent divider on same axis (left face + divider)', () => {
      // Subdivided void: left | child0 | divider | child1 | right
      const subdividedRoot = createSubdividedVoid('root', ['child0', 'child1']);
      const panels = [
        createFacePanel('left'),
        createDividerPanel('child0', 'x', 50),
      ];
      const result = validateSubdivideTwoPanelSelection(
        new Set(['face-left', 'divider-child0-x-50']),
        createPanelCollection(panels),
        subdividedRoot
      );
      expect(result.valid).toBe(true);
      expect(result.derived?.targetVoidId).toBe('child0');  // void between left face and divider
      expect(result.derived?.validAxes).toEqual(['y', 'z']);
    });

    it('rejects face panel + divider on different axis', () => {
      const subdividedRoot = createSubdividedVoid('root', ['child0', 'child1']);
      const panels = [
        createFacePanel('top'),  // Y axis
        createDividerPanel('child0', 'x', 50),  // X axis
      ];
      const result = validateSubdivideTwoPanelSelection(
        new Set(['face-top', 'divider-child0-x-50']),
        createPanelCollection(panels),
        subdividedRoot
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('parallel');
    });

    it('rejects when void between face and divider is not leaf', () => {
      // Create nested subdivision where child1 has its own children
      const nestedRoot: Void = {
        id: 'root',
        bounds: { x: 3, y: 3, z: 3, w: 94, h: 74, d: 54 },
        children: [
          { id: 'child0', bounds: { x: 3, y: 3, z: 3, w: 28, h: 74, d: 54 }, children: [] },
          {
            id: 'child1',
            bounds: { x: 33, y: 3, z: 3, w: 28, h: 74, d: 54 },
            children: [
              { id: 'grandchild0', bounds: { x: 33, y: 3, z: 3, w: 14, h: 74, d: 54 }, children: [] },
              { id: 'grandchild1', bounds: { x: 47, y: 3, z: 3, w: 14, h: 74, d: 54 }, children: [] },
            ],
          },
        ],
        splitAxis: 'x',
      };
      const panels = [
        createFacePanel('right'),
        createDividerPanel('child0', 'x', 50),
      ];
      const result = validateSubdivideTwoPanelSelection(
        new Set(['face-right', 'divider-child0-x-50']),
        createPanelCollection(panels),
        nestedRoot
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('empty void');
    });
  });
});

// =============================================================================
// Push-Pull Validation Tests
// =============================================================================

describe('validatePushPullSelection', () => {
  const createPanelCollection = (panels: PanelPath[]) => ({ panels });

  it('rejects empty selection', () => {
    const panels = [createFacePanel('front')];
    const result = validatePushPullSelection(
      new Set(),
      createPanelCollection(panels)
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Select a face panel');
  });

  it('rejects multiple panel selection', () => {
    const panels = [createFacePanel('front'), createFacePanel('back')];
    const result = validatePushPullSelection(
      new Set(['face-front', 'face-back']),
      createPanelCollection(panels)
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('only one');
  });

  it('accepts face panel selection', () => {
    const panels = [createFacePanel('front')];
    const result = validatePushPullSelection(
      new Set(['face-front']),
      createPanelCollection(panels)
    );
    expect(result.valid).toBe(true);
  });

  it('rejects divider panel selection', () => {
    const panels = [createDividerPanel('root', 'x', 50)];
    const result = validatePushPullSelection(
      new Set(['divider-root-x-50']),
      createPanelCollection(panels)
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Only face panels');
  });

  it('rejects sub-assembly panel selection', () => {
    const panels = [createFacePanel('front', 'sub-1')];
    const result = validatePushPullSelection(
      new Set(['sub-1-face-front']),
      createPanelCollection(panels)
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Sub-assembly');
  });
});

// =============================================================================
// Create Sub-Assembly Validation Tests
// =============================================================================

describe('validateCreateSubAssemblySelection', () => {
  it('rejects empty selection', () => {
    const result = validateCreateSubAssemblySelection(
      new Set(),
      createLeafVoid('root')
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Select a void');
  });

  it('rejects non-leaf void', () => {
    const subdividedRoot = createSubdividedVoid('root', ['child1', 'child2']);
    const result = validateCreateSubAssemblySelection(
      new Set(['root']),
      subdividedRoot
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('subdivisions');
  });

  it('rejects void with existing sub-assembly', () => {
    const voidWithSubAssembly: Void = {
      ...createLeafVoid('root'),
      subAssembly: {
        id: 'sub-1',
        rootVoid: createLeafVoid('sub-root'),
        clearance: 2,
        assemblyAxis: 'y',
      },
    };
    const result = validateCreateSubAssemblySelection(
      new Set(['root']),
      voidWithSubAssembly
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('already contains');
  });

  it('accepts leaf void', () => {
    const result = validateCreateSubAssemblySelection(
      new Set(['root']),
      createLeafVoid('root')
    );
    expect(result.valid).toBe(true);
    expect(result.derived?.targetVoidId).toBe('root');
  });
});

// =============================================================================
// Toggle Face Validation Tests
// =============================================================================

describe('validateToggleFaceSelection', () => {
  const createPanelCollection = (panels: PanelPath[]) => ({ panels });

  it('accepts face panel', () => {
    const panels = [createFacePanel('front')];
    const result = validateToggleFaceSelection(
      new Set(['face-front']),
      createPanelCollection(panels)
    );
    expect(result.valid).toBe(true);
  });

  it('rejects divider panel', () => {
    const panels = [createDividerPanel('root', 'x', 50)];
    const result = validateToggleFaceSelection(
      new Set(['divider-root-x-50']),
      createPanelCollection(panels)
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Only face panels');
  });
});

// =============================================================================
// Selection Requirements Tests
// =============================================================================

describe('getSelectionRequirements', () => {
  it('returns correct requirements for subdivide', () => {
    const req = getSelectionRequirements('subdivide');
    expect(req.targetType).toBe('leaf-void');
    expect(req.minCount).toBe(1);
    expect(req.maxCount).toBe(1);
  });

  it('returns correct requirements for subdivide-two-panel', () => {
    const req = getSelectionRequirements('subdivide-two-panel');
    expect(req.targetType).toBe('opposing-panels');
    expect(req.minCount).toBe(2);
    expect(req.maxCount).toBe(2);
    expect(req.constraints).toContainEqual({ type: 'must-be-parallel-panels' });
    expect(req.constraints).toContainEqual(
      expect.objectContaining({ type: 'must-have-void-between' })
    );
  });

  it('returns correct requirements for push-pull', () => {
    const req = getSelectionRequirements('push-pull');
    expect(req.targetType).toBe('face-panel');
    expect(req.minCount).toBe(1);
    expect(req.maxCount).toBe(1);
  });

  it('returns correct requirements for create-sub-assembly', () => {
    const req = getSelectionRequirements('create-sub-assembly');
    expect(req.targetType).toBe('leaf-void');
    expect(req.minCount).toBe(1);
    expect(req.maxCount).toBe(1);
  });

  it('returns correct requirements for chamfer-fillet', () => {
    const req = getSelectionRequirements('chamfer-fillet');
    expect(req.targetType).toBe('corner');
    expect(req.minCount).toBe(1);
    expect(req.maxCount).toBe(Infinity);
  });
});

// =============================================================================
// Unified Validation Tests
// =============================================================================

describe('validateSelection (unified)', () => {
  const faces = createTestFaces();

  it('routes to correct validator for each operation', () => {
    const context = {
      selectedVoidIds: new Set(['root']),
      selectedPanelIds: new Set<string>(),
      panelCollection: { panels: [] },
      rootVoid: createLeafVoid('root'),
      faces,
    };

    // Test subdivide routing
    const subdivideResult = validateSelection('subdivide', context);
    expect(subdivideResult.valid).toBe(true);

    // Test push-pull routing (should fail because no panel selected)
    const pushPullResult = validateSelection('push-pull', context);
    expect(pushPullResult.valid).toBe(false);
  });

  it('returns error for unknown operation', () => {
    const context = {
      selectedVoidIds: new Set<string>(),
      selectedPanelIds: new Set<string>(),
      panelCollection: null,
      rootVoid: null,
      faces: [],
    };

    const result = validateSelection('unknown-op' as any, context);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Unknown');
  });
});
