/**
 * Operations and Preview System Tests
 *
 * These tests verify:
 * 1. Divider IDs are unique when creating multiple dividers
 * 2. Preview lifecycle (start, commit, discard)
 * 3. Cancel always cleans up preview for parameter operations
 * 4. Operation state transitions work correctly
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useBoxStore } from './useBoxStore';
import {
  getEngine,
  syncStoreToEngine,
  dispatchToEngine,
} from '../engine';
import {
  OPERATION_DEFINITIONS,
  operationHasPreview,
  getOperationsByType,
} from '../operations/registry';
import { OperationId, INITIAL_OPERATION_STATE } from '../operations/types';
import { defaultAssemblyConfig } from '../types';

// ==========================================================================
// Test Setup
// ==========================================================================

const resetStore = () => {
  // First, make sure no preview is active
  const engine = getEngine();
  if (engine.hasPreview()) {
    engine.discardPreview();
  }

  useBoxStore.setState({
    config: {
      width: 100,
      height: 80,
      depth: 60,
      materialThickness: 3,
      fingerWidth: 10,
      fingerGap: 3,
      assembly: defaultAssemblyConfig,
    },
    faces: [
      { id: 'front', label: 'Front', axis: 'z', solid: true },
      { id: 'back', label: 'Back', axis: 'z', solid: true },
      { id: 'left', label: 'Left', axis: 'x', solid: true },
      { id: 'right', label: 'Right', axis: 'x', solid: true },
      { id: 'top', label: 'Top', axis: 'y', solid: true },
      { id: 'bottom', label: 'Bottom', axis: 'y', solid: true },
    ],
    rootVoid: {
      id: 'root',
      bounds: { x: 3, y: 3, z: 3, w: 94, h: 74, d: 54 },
      children: [],
    },
    selectedVoidIds: new Set(),
    selectedPanelIds: new Set(),
    operationState: INITIAL_OPERATION_STATE,
  });

  // Sync to engine
  const state = useBoxStore.getState();
  syncStoreToEngine(state.config, state.faces, state.rootVoid);
};

/**
 * Helper to get assembly dimensions from engine snapshot
 */
const getAssemblyDimensions = () => {
  const engine = getEngine();
  const snapshot = engine.getSnapshot();
  const assembly = snapshot.children?.[0];
  if (!assembly || assembly.kind !== 'assembly') {
    return null;
  }
  return {
    width: assembly.props.width,
    height: assembly.props.height,
    depth: assembly.props.depth,
  };
};

// ==========================================================================
// Divider ID Uniqueness Tests
// ==========================================================================

describe('Divider ID Uniqueness', () => {
  beforeEach(() => {
    resetStore();
  });

  it('should create unique IDs for multiple dividers on same axis', () => {
    // Create subdivision with 2 positions (creates 2 dividers)
    const result = dispatchToEngine({
      type: 'ADD_SUBDIVISIONS',
      targetId: 'main-assembly',
      payload: {
        voidId: 'root',
        axis: 'x',
        positions: [30, 60],
      },
    });

    expect(result.success).toBe(true);

    // Get panels from engine
    const engine = getEngine();
    const panels = engine.generatePanelsFromNodes();

    // Find divider panels
    const dividerPanels = panels.panels.filter(p =>
      p.source.type === 'divider'
    );

    // Should have 2 dividers
    expect(dividerPanels.length).toBe(2);

    // All IDs should be unique
    const dividerIds = dividerPanels.map(p => p.id);
    const uniqueIds = new Set(dividerIds);
    expect(uniqueIds.size).toBe(dividerIds.length);

    // All IDs should be unique UUIDs
    expect(dividerIds[0]).not.toBe(dividerIds[1]);
    // Axis info is in source, not ID
    expect(dividerPanels[0].source.axis).toBe('x');
    expect(dividerPanels[1].source.axis).toBe('x');
  });

  it('should create unique IDs for dividers on different axes', () => {
    const engine = getEngine();

    // Create first subdivision on X axis
    dispatchToEngine({
      type: 'ADD_SUBDIVISIONS',
      targetId: 'main-assembly',
      payload: {
        voidId: 'root',
        axis: 'x',
        positions: [50],
      },
    });

    // Get the snapshot to find child void IDs
    const snapshot = engine.getSnapshot();
    const assembly = snapshot.children?.[0];
    expect(assembly).toBeDefined();

    // The root void should now have children
    const rootVoid = assembly?.children?.[0];
    expect(rootVoid).toBeDefined();
    expect(rootVoid?.kind).toBe('void');

    const voidChildren = rootVoid?.children?.filter((c: any) => c.kind === 'void') ?? [];
    expect(voidChildren.length).toBe(2);

    // Get the first child void ID for the second subdivision
    const firstChildVoid = voidChildren[0];
    expect(firstChildVoid).toBeDefined();

    // Create subdivision in child void on Y axis
    dispatchToEngine({
      type: 'ADD_SUBDIVISIONS',
      targetId: 'main-assembly',
      payload: {
        voidId: firstChildVoid.id,
        axis: 'y',
        positions: [40],
      },
    });

    // Get panels
    const panels = engine.generatePanelsFromNodes();

    // Find divider panels
    const dividerPanels = panels.panels.filter(p =>
      p.source.type === 'divider'
    );

    // Should have 2 dividers
    expect(dividerPanels.length).toBe(2);

    // All IDs should be unique
    const dividerIds = dividerPanels.map(p => p.id);
    const uniqueIds = new Set(dividerIds);
    expect(uniqueIds.size).toBe(dividerIds.length);

    // One should be x-axis, one should be y-axis
    expect(dividerPanels.some(p => p.source.axis === 'x')).toBe(true);
    expect(dividerPanels.some(p => p.source.axis === 'y')).toBe(true);
  });

  it('should create unique IDs for many dividers (stress test)', () => {
    // Create subdivision with 5 positions
    const positions = [20, 35, 50, 65, 80];
    const result = dispatchToEngine({
      type: 'ADD_SUBDIVISIONS',
      targetId: 'main-assembly',
      payload: {
        voidId: 'root',
        axis: 'x',
        positions,
      },
    });

    expect(result.success).toBe(true);

    // Get panels
    const engine = getEngine();
    const panels = engine.generatePanelsFromNodes();

    // Find divider panels
    const dividerPanels = panels.panels.filter(p =>
      p.source.type === 'divider'
    );

    // Should have 5 dividers
    expect(dividerPanels.length).toBe(5);

    // All IDs should be unique
    const dividerIds = dividerPanels.map(p => p.id);
    const uniqueIds = new Set(dividerIds);
    expect(uniqueIds.size).toBe(5);
  });
});

// ==========================================================================
// Preview Lifecycle Tests
// ==========================================================================

describe('Preview Lifecycle', () => {
  beforeEach(() => {
    resetStore();
  });

  it('should start preview when starting parameter operation', () => {
    const engine = getEngine();
    expect(engine.hasPreview()).toBe(false);

    // Start a parameter operation
    useBoxStore.getState().startOperation('subdivide');

    expect(engine.hasPreview()).toBe(true);
  });

  it('should NOT start preview for immediate operations', () => {
    // toggle-face is an immediate operation
    // Since it's immediate, it shouldn't create a preview
    // Note: immediate operations typically don't go through startOperation
    // but we verify the operationHasPreview check
    expect(operationHasPreview('toggle-face')).toBe(false);
    expect(operationHasPreview('remove-subdivision')).toBe(false);
    expect(operationHasPreview('remove-sub-assembly')).toBe(false);
  });

  it('should NOT start preview for view operations', () => {
    expect(operationHasPreview('edit-in-2d')).toBe(false);
  });

  it('should commit preview on applyOperation', () => {
    const engine = getEngine();

    // Start operation and add subdivision to preview
    useBoxStore.getState().startOperation('subdivide');
    expect(engine.hasPreview()).toBe(true);

    // Update params to create subdivision in preview
    useBoxStore.getState().updateOperationParams({
      voidId: 'root',
      axis: 'x',
      positions: [50],
    });

    // Verify preview has subdivision
    const previewPanels = engine.generatePanelsFromNodes();
    const previewDividers = previewPanels.panels.filter(p => p.source.type === 'divider');
    expect(previewDividers.length).toBe(1);

    // Apply operation
    useBoxStore.getState().applyOperation();

    // Preview should be gone
    expect(engine.hasPreview()).toBe(false);

    // Main scene should have the subdivision
    const mainPanels = engine.generatePanelsFromNodes();
    const mainDividers = mainPanels.panels.filter(p => p.source.type === 'divider');
    expect(mainDividers.length).toBe(1);
  });

  it('should discard preview on cancelOperation', () => {
    const engine = getEngine();

    // Start operation and add subdivision to preview
    useBoxStore.getState().startOperation('subdivide');
    expect(engine.hasPreview()).toBe(true);

    // Update params to create subdivision in preview
    useBoxStore.getState().updateOperationParams({
      voidId: 'root',
      axis: 'x',
      positions: [50],
    });

    // Verify preview has subdivision
    let panels = engine.generatePanelsFromNodes();
    let dividers = panels.panels.filter(p => p.source.type === 'divider');
    expect(dividers.length).toBe(1);

    // Cancel operation
    useBoxStore.getState().cancelOperation();

    // Preview should be gone
    expect(engine.hasPreview()).toBe(false);

    // Main scene should NOT have the subdivision
    panels = engine.generatePanelsFromNodes();
    dividers = panels.panels.filter(p => p.source.type === 'divider');
    expect(dividers.length).toBe(0);
  });
});

// ==========================================================================
// Cancel Cleanup Tests for All Parameter Operations
// ==========================================================================

describe('Cancel Cleanup for Parameter Operations', () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    // Ensure no dangling preview after each test
    const engine = getEngine();
    if (engine.hasPreview()) {
      engine.discardPreview();
    }
  });

  // Get all parameter operations
  const parameterOperations = getOperationsByType('parameter');

  parameterOperations.forEach((operation) => {
    it(`should cleanup preview when cancelling ${operation.id} operation`, () => {
      const engine = getEngine();

      // Start the operation
      useBoxStore.getState().startOperation(operation.id);

      // Verify preview was created
      expect(engine.hasPreview()).toBe(true);

      // Cancel the operation
      useBoxStore.getState().cancelOperation();

      // Verify preview was discarded
      expect(engine.hasPreview()).toBe(false);

      // Verify operation state is reset
      const state = useBoxStore.getState();
      expect(state.operationState.activeOperation).toBeNull();
      expect(state.operationState.phase).toBe('idle');
    });
  });

  it('should cleanup preview even when params were modified', () => {
    const engine = getEngine();

    // Start subdivide operation
    useBoxStore.getState().startOperation('subdivide');
    expect(engine.hasPreview()).toBe(true);

    // Modify params multiple times (simulating user interaction)
    useBoxStore.getState().updateOperationParams({
      voidId: 'root',
      axis: 'x',
      positions: [30],
    });

    useBoxStore.getState().updateOperationParams({
      voidId: 'root',
      axis: 'x',
      positions: [30, 60],
    });

    useBoxStore.getState().updateOperationParams({
      voidId: 'root',
      axis: 'y',
      positions: [40],
    });

    // Cancel operation
    useBoxStore.getState().cancelOperation();

    // Preview should be gone
    expect(engine.hasPreview()).toBe(false);

    // Main scene should be unchanged (no dividers)
    const panels = engine.generatePanelsFromNodes();
    const dividers = panels.panels.filter(p => p.source.type === 'divider');
    expect(dividers.length).toBe(0);
  });
});

// ==========================================================================
// Operation State Transition Tests
// ==========================================================================

describe('Operation State Transitions', () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    // Cleanup any dangling preview
    const engine = getEngine();
    if (engine.hasPreview()) {
      engine.discardPreview();
    }
  });

  it('should transition from idle to active when starting operation', () => {
    let state = useBoxStore.getState();
    expect(state.operationState.activeOperation).toBeNull();
    expect(state.operationState.phase).toBe('idle');

    useBoxStore.getState().startOperation('subdivide');

    state = useBoxStore.getState();
    expect(state.operationState.activeOperation).toBe('subdivide');
    expect(state.operationState.phase).toBe('active');
  });

  it('should transition back to idle when applying operation', () => {
    useBoxStore.getState().startOperation('subdivide');
    useBoxStore.getState().updateOperationParams({
      voidId: 'root',
      axis: 'x',
      positions: [50],
    });
    useBoxStore.getState().applyOperation();

    const state = useBoxStore.getState();
    expect(state.operationState.activeOperation).toBeNull();
    expect(state.operationState.phase).toBe('idle');
    expect(state.operationState.params).toEqual({});
  });

  it('should transition back to idle when cancelling operation', () => {
    useBoxStore.getState().startOperation('push-pull');
    useBoxStore.getState().updateOperationParams({
      faceId: 'front',
      offset: 10,
      mode: 'scale',
    });
    useBoxStore.getState().cancelOperation();

    const state = useBoxStore.getState();
    expect(state.operationState.activeOperation).toBeNull();
    expect(state.operationState.phase).toBe('idle');
    expect(state.operationState.params).toEqual({});
  });

  it('should preserve params during updateOperationParams', () => {
    useBoxStore.getState().startOperation('subdivide');

    useBoxStore.getState().updateOperationParams({ voidId: 'root' });
    let state = useBoxStore.getState();
    expect(state.operationState.params.voidId).toBe('root');

    useBoxStore.getState().updateOperationParams({ axis: 'x' });
    state = useBoxStore.getState();
    expect(state.operationState.params.voidId).toBe('root');
    expect(state.operationState.params.axis).toBe('x');

    useBoxStore.getState().updateOperationParams({ positions: [50] });
    state = useBoxStore.getState();
    expect(state.operationState.params.voidId).toBe('root');
    expect(state.operationState.params.axis).toBe('x');
    expect(state.operationState.params.positions).toEqual([50]);

    // Cleanup
    useBoxStore.getState().cancelOperation();
  });

  it('should do nothing when cancelling with no active operation', () => {
    const stateBefore = useBoxStore.getState();
    expect(stateBefore.operationState.activeOperation).toBeNull();

    useBoxStore.getState().cancelOperation();

    const stateAfter = useBoxStore.getState();
    expect(stateAfter.operationState).toEqual(stateBefore.operationState);
  });

  it('should do nothing when applying with no active operation', () => {
    const stateBefore = useBoxStore.getState();
    expect(stateBefore.operationState.activeOperation).toBeNull();

    useBoxStore.getState().applyOperation();

    const stateAfter = useBoxStore.getState();
    expect(stateAfter.operationState).toEqual(stateBefore.operationState);
  });
});

// ==========================================================================
// Engine Preview State Consistency Tests
// ==========================================================================

describe('Engine Preview State Consistency', () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    const engine = getEngine();
    if (engine.hasPreview()) {
      engine.discardPreview();
    }
  });

  it('should warn when starting preview with existing preview', () => {
    const engine = getEngine();
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    engine.startPreview();
    expect(engine.hasPreview()).toBe(true);

    // Starting another preview should warn
    engine.startPreview();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Preview already active, discarding previous preview'
    );

    consoleWarnSpy.mockRestore();
  });

  it('should handle discardPreview when no preview exists', () => {
    const engine = getEngine();
    expect(engine.hasPreview()).toBe(false);

    // Should not throw
    expect(() => engine.discardPreview()).not.toThrow();
    expect(engine.hasPreview()).toBe(false);
  });

  it('should handle commitPreview when no preview exists', () => {
    const engine = getEngine();
    expect(engine.hasPreview()).toBe(false);

    // Should not throw
    expect(() => engine.commitPreview()).not.toThrow();
    expect(engine.hasPreview()).toBe(false);
  });

  it('should isolate preview changes from main scene', () => {
    const engine = getEngine();

    // Get initial panel count
    let mainPanels = engine.generatePanelsFromNodes();
    const initialPanelCount = mainPanels.panels.length;

    // Start preview and add subdivision
    engine.startPreview();
    engine.dispatch({
      type: 'ADD_SUBDIVISIONS',
      targetId: 'main-assembly',
      payload: {
        voidId: 'root',
        axis: 'x',
        positions: [50],
      },
    }, { preview: true });

    // Preview should have more panels
    let previewPanels = engine.generatePanelsFromNodes();
    expect(previewPanels.panels.length).toBeGreaterThan(initialPanelCount);

    // Discard preview
    engine.discardPreview();

    // Main scene should be unchanged
    mainPanels = engine.generatePanelsFromNodes();
    expect(mainPanels.panels.length).toBe(initialPanelCount);
  });

  it('should persist preview changes after commit', () => {
    const engine = getEngine();

    // Get initial panel count
    let mainPanels = engine.generatePanelsFromNodes();
    const initialPanelCount = mainPanels.panels.length;

    // Start preview and add subdivision
    engine.startPreview();
    engine.dispatch({
      type: 'ADD_SUBDIVISIONS',
      targetId: 'main-assembly',
      payload: {
        voidId: 'root',
        axis: 'x',
        positions: [50],
      },
    }, { preview: true });

    // Commit preview
    engine.commitPreview();

    // Main scene should now have the subdivision
    mainPanels = engine.generatePanelsFromNodes();
    expect(mainPanels.panels.length).toBeGreaterThan(initialPanelCount);

    // Divider should exist
    const dividers = mainPanels.panels.filter(p => p.source.type === 'divider');
    expect(dividers.length).toBe(1);
  });
});

// ==========================================================================
// Push-Pull Operation Tests
// ==========================================================================

describe('Push-Pull Operation', () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    const engine = getEngine();
    if (engine.hasPreview()) {
      engine.discardPreview();
    }
  });

  it('should start preview when operation starts', () => {
    const engine = getEngine();
    expect(engine.hasPreview()).toBe(false);

    // Start push-pull operation
    useBoxStore.getState().startOperation('push-pull');
    expect(engine.hasPreview()).toBe(true);

    // Cleanup
    useBoxStore.getState().cancelOperation();
  });

  it('should cleanup preview on cancel', () => {
    const engine = getEngine();

    // Start push-pull operation
    useBoxStore.getState().startOperation('push-pull');
    expect(engine.hasPreview()).toBe(true);

    // Set some params (even if preview doesn't update, the cancel should still work)
    useBoxStore.getState().updateOperationParams({
      faceId: 'right',
      offset: 20,
      mode: 'scale',
    });

    // Cancel operation
    useBoxStore.getState().cancelOperation();

    // Preview should be discarded
    expect(engine.hasPreview()).toBe(false);
  });

  it('should cleanup preview on apply', () => {
    const engine = getEngine();

    // Start push-pull operation
    useBoxStore.getState().startOperation('push-pull');
    expect(engine.hasPreview()).toBe(true);

    // Apply operation (commits preview)
    useBoxStore.getState().applyOperation();

    // Preview should be gone (committed to main)
    expect(engine.hasPreview()).toBe(false);
  });

  it('should reset operation state on cancel', () => {
    // Start push-pull with params
    useBoxStore.getState().startOperation('push-pull');
    useBoxStore.getState().updateOperationParams({
      faceId: 'front',
      offset: 10,
      mode: 'scale',
    });

    // Verify params are set
    let state = useBoxStore.getState();
    expect(state.operationState.params.faceId).toBe('front');

    // Cancel
    useBoxStore.getState().cancelOperation();

    // State should be reset
    state = useBoxStore.getState();
    expect(state.operationState.activeOperation).toBeNull();
    expect(state.operationState.params).toEqual({});
  });
});

// ==========================================================================
// Subdivide-Two-Panel Operation Tests
// ==========================================================================

describe('Subdivide-Two-Panel Operation', () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    const engine = getEngine();
    if (engine.hasPreview()) {
      engine.discardPreview();
    }
  });

  it('should cleanup preview on cancel', () => {
    const engine = getEngine();

    // Start subdivide-two-panel operation
    useBoxStore.getState().startOperation('subdivide-two-panel');
    expect(engine.hasPreview()).toBe(true);

    // Update params
    useBoxStore.getState().updateOperationParams({
      voidId: 'root',
      axis: 'y',
      positions: [40],
    });

    // Verify preview has divider
    let panels = engine.generatePanelsFromNodes();
    expect(panels.panels.some(p => p.source.type === 'divider')).toBe(true);

    // Cancel
    useBoxStore.getState().cancelOperation();

    // Preview should be gone and no dividers in main scene
    expect(engine.hasPreview()).toBe(false);
    panels = engine.generatePanelsFromNodes();
    expect(panels.panels.some(p => p.source.type === 'divider')).toBe(false);
  });
});

// ==========================================================================
// Operation Registry Tests
// ==========================================================================

describe('Operation Registry', () => {
  it('should have preview flag for all parameter operations', () => {
    const parameterOps = getOperationsByType('parameter');

    for (const op of parameterOps) {
      expect(operationHasPreview(op.id)).toBe(true);
    }
  });

  it('should NOT have preview flag for immediate operations', () => {
    const immediateOps = getOperationsByType('immediate');

    for (const op of immediateOps) {
      expect(operationHasPreview(op.id)).toBe(false);
    }
  });

  it('should NOT have preview flag for view operations', () => {
    const viewOps = getOperationsByType('view');

    for (const op of viewOps) {
      expect(operationHasPreview(op.id)).toBe(false);
    }
  });

  it('should have all operations defined in registry', () => {
    const allOperationIds: OperationId[] = [
      'push-pull',
      'subdivide',
      'subdivide-two-panel',
      'create-sub-assembly',
      'configure-assembly',
      'scale',
      'chamfer-fillet',
      'toggle-face',
      'remove-subdivision',
      'remove-sub-assembly',
      'edit-in-2d',
    ];

    for (const id of allOperationIds) {
      expect(OPERATION_DEFINITIONS[id]).toBeDefined();
      expect(OPERATION_DEFINITIONS[id].id).toBe(id);
    }
  });
});

// ==========================================================================
// Configure Assembly Operation Tests
// ==========================================================================

describe('Configure Assembly Operation', () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    // Clean up any preview
    const engine = getEngine();
    if (engine.hasPreview()) {
      engine.discardPreview();
    }
  });

  it('should start preview when operation starts', () => {
    const engine = getEngine();
    expect(engine.hasPreview()).toBe(false);

    useBoxStore.getState().startOperation('configure-assembly');
    expect(engine.hasPreview()).toBe(true);
  });

  it('should update material config in preview', () => {
    const engine = getEngine();

    // Start operation
    useBoxStore.getState().startOperation('configure-assembly');

    // Update material params - note: fingerWidth may be constrained by validation
    // With 60mm smallest dimension, thickness=5, fingerGap=3:
    // maxJointLength = 60 - 10 = 50mm
    // maxFingerWidth = 50 / (3 + 2*3) = 5.5mm
    // So fingerWidth=15 will be constrained to ~5.5mm
    useBoxStore.getState().updateOperationParams({
      thickness: 5,
      fingerWidth: 8, // Use a value that should be valid (will be slightly constrained)
    });

    // Check preview has new material config
    const snapshot = engine.getSnapshot();
    const assembly = snapshot.children?.[0];
    expect(assembly?.props.material.thickness).toBe(5);
    // fingerWidth is constrained to ensure 3 sections fit on smallest edge
    expect(assembly?.props.material.fingerWidth).toBeLessThanOrEqual(8);
    expect(assembly?.props.material.fingerWidth).toBeGreaterThan(0);
  });

  it('should update assembly axis in preview', () => {
    const engine = getEngine();

    // Start operation
    useBoxStore.getState().startOperation('configure-assembly');

    // Update axis
    useBoxStore.getState().updateOperationParams({
      assemblyAxis: 'x',
    });

    // Check preview has new axis
    const snapshot = engine.getSnapshot();
    const assembly = snapshot.children?.[0];
    expect(assembly?.props.assembly.assemblyAxis).toBe('x');
  });

  it('should commit material changes on apply', () => {
    const engine = getEngine();

    // Start operation
    useBoxStore.getState().startOperation('configure-assembly');

    // Update params
    useBoxStore.getState().updateOperationParams({
      thickness: 6,
    });

    // Apply
    useBoxStore.getState().applyOperation();

    // Preview should be gone
    expect(engine.hasPreview()).toBe(false);

    // Main scene should have new material config
    const snapshot = engine.getSnapshot();
    const assembly = snapshot.children?.[0];
    expect(assembly?.props.material.thickness).toBe(6);
  });

  it('should discard changes on cancel', () => {
    const engine = getEngine();

    // Get original thickness
    const originalSnapshot = engine.getSnapshot();
    const originalThickness = originalSnapshot.children?.[0]?.props.material.thickness;

    // Start operation
    useBoxStore.getState().startOperation('configure-assembly');

    // Update params
    useBoxStore.getState().updateOperationParams({
      thickness: 99,
    });

    // Cancel
    useBoxStore.getState().cancelOperation();

    // Preview should be gone
    expect(engine.hasPreview()).toBe(false);

    // Main scene should have original thickness
    const snapshot = engine.getSnapshot();
    const assembly = snapshot.children?.[0];
    expect(assembly?.props.material.thickness).toBe(originalThickness);
  });
});

// ==========================================================================
// Scale Operation Tests
// ==========================================================================

describe('Scale Operation', () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    // Clean up any preview
    const engine = getEngine();
    if (engine.hasPreview()) {
      engine.discardPreview();
    }
  });

  it('should start preview when operation starts', () => {
    const engine = getEngine();
    expect(engine.hasPreview()).toBe(false);

    useBoxStore.getState().startOperation('scale');
    expect(engine.hasPreview()).toBe(true);
  });

  it('should update dimensions in preview', () => {
    const engine = getEngine();

    // Start operation
    useBoxStore.getState().startOperation('scale');

    // Update params
    useBoxStore.getState().updateOperationParams({
      width: 150,
      height: 100,
      depth: 80,
    });

    // Check preview has new dimensions
    const snapshot = engine.getSnapshot();
    const assembly = snapshot.children?.[0];
    expect(assembly?.props.width).toBe(150);
    expect(assembly?.props.height).toBe(100);
    expect(assembly?.props.depth).toBe(80);
  });

  it('should commit dimensions on apply', () => {
    const engine = getEngine();

    // Start operation
    useBoxStore.getState().startOperation('scale');

    // Update params
    useBoxStore.getState().updateOperationParams({
      width: 200,
    });

    // Apply
    useBoxStore.getState().applyOperation();

    // Preview should be gone
    expect(engine.hasPreview()).toBe(false);

    // Main scene should have new dimensions
    const snapshot = engine.getSnapshot();
    const assembly = snapshot.children?.[0];
    expect(assembly?.props.width).toBe(200);
  });

  it('should discard dimensions on cancel', () => {
    const engine = getEngine();

    // Get original dimensions
    const originalSnapshot = engine.getSnapshot();
    const originalWidth = originalSnapshot.children?.[0]?.props.width;

    // Start operation
    useBoxStore.getState().startOperation('scale');

    // Update params
    useBoxStore.getState().updateOperationParams({
      width: 999,
    });

    // Cancel
    useBoxStore.getState().cancelOperation();

    // Preview should be gone
    expect(engine.hasPreview()).toBe(false);

    // Main scene should have original dimensions
    const snapshot = engine.getSnapshot();
    const assembly = snapshot.children?.[0];
    expect(assembly?.props.width).toBe(originalWidth);
  });
});
