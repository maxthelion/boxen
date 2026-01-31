/**
 * Sub-Assembly Integration Tests
 *
 * Tests sub-assembly creation via the operation system:
 * 1. Single subdivision + sub-assembly
 * 2. Nested subdivision + sub-assembly
 * 3. Dimension correctness checks
 * 4. Preview/commit flow
 *
 * Note: These tests verify the operation system and engine dispatch work correctly.
 * Panel source tracking (subAssemblyId in panel source) is not fully implemented,
 * so tests verify sub-assembly creation via the engine snapshot tree instead.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useBoxStore } from '../../../src/store/useBoxStore';
import {
  getEngine,
  syncStoreToEngine,
  resetEngine,
} from '../../../src/engine';
import { defaultAssemblyConfig } from '../../../src/types';
import { INITIAL_OPERATION_STATE } from '../../../src/operations/types';

// ==========================================================================
// Test Setup
// ==========================================================================

const resetStore = () => {
  // Reset engine to get a completely fresh state
  resetEngine();

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
      { id: 'front', solid: true },
      { id: 'back', solid: true },
      { id: 'left', solid: true },
      { id: 'right', solid: true },
      { id: 'top', solid: true },
      { id: 'bottom', solid: true },
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
 * Helper to find a void in the snapshot by ID
 */
const findVoidInSnapshot = (voidId: string) => {
  const engine = getEngine();
  const snapshot = engine.getSnapshot();
  const assembly = snapshot.children?.[0];
  if (!assembly) return null;

  const findVoid = (node: any): any => {
    if (node.id === voidId && node.kind === 'void') return node;
    if (node.children) {
      for (const child of node.children) {
        const found = findVoid(child);
        if (found) return found;
      }
    }
    return null;
  };

  return findVoid(assembly);
};

/**
 * Helper to find child void IDs after subdivision
 */
const getChildVoidIds = (parentVoidId: string): string[] => {
  const parentVoid = findVoidInSnapshot(parentVoidId);
  if (!parentVoid || !parentVoid.children) return [];
  return parentVoid.children
    .filter((c: any) => c.kind === 'void')
    .map((c: any) => c.id);
};

// ==========================================================================
// Single Subdivision + Sub-Assembly Tests
// ==========================================================================

describe('Single Subdivision + Sub-Assembly', () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    const engine = getEngine();
    if (engine.hasPreview()) {
      engine.discardPreview();
    }
  });

  it('should create sub-assembly in subdivided void', () => {
    const engine = getEngine();

    // Step 1: Subdivide root void on Y axis
    engine.dispatch({
      type: 'ADD_SUBDIVISIONS',
      targetId: 'main-assembly',
      payload: {
        voidId: 'root',
        axis: 'y',
        positions: [40], // Split at Y=40
      },
    });

    // Get child void IDs
    const childVoidIds = getChildVoidIds('root');
    expect(childVoidIds.length).toBe(2);

    // Step 2: Create sub-assembly in the first child void
    const targetVoidId = childVoidIds[0];
    const clearance = 2;

    const result = engine.dispatch({
      type: 'CREATE_SUB_ASSEMBLY',
      targetId: 'main-assembly',
      payload: {
        voidId: targetVoidId,
        clearance,
      },
    });

    expect(result).toBe(true);

    // Step 3: Verify sub-assembly was created in the snapshot
    const targetVoid = findVoidInSnapshot(targetVoidId);
    expect(targetVoid).not.toBeNull();

    // Find sub-assembly in the void's children
    const subAssembly = targetVoid?.children?.find(
      (c: any) => c.kind === 'sub-assembly'
    );
    expect(subAssembly).toBeDefined();
    expect(subAssembly!.kind).toBe('sub-assembly');
  });

  it('should compute correct sub-assembly dimensions with clearance', () => {
    const engine = getEngine();

    // Subdivide root void
    engine.dispatch({
      type: 'ADD_SUBDIVISIONS',
      targetId: 'main-assembly',
      payload: {
        voidId: 'root',
        axis: 'y',
        positions: [40],
      },
    });

    const childVoidIds = getChildVoidIds('root');
    const targetVoidId = childVoidIds[0];
    const clearance = 2;

    // Get target void bounds before creating sub-assembly
    const targetVoid = findVoidInSnapshot(targetVoidId);
    expect(targetVoid).not.toBeNull();
    const voidBounds = targetVoid.derived.bounds;

    // Create sub-assembly
    engine.dispatch({
      type: 'CREATE_SUB_ASSEMBLY',
      targetId: 'main-assembly',
      payload: {
        voidId: targetVoidId,
        clearance,
      },
    });

    // Get snapshot after sub-assembly creation
    const snapshot = engine.getSnapshot();
    const assembly = snapshot.children?.[0];
    const rootVoid = assembly?.children?.[0];

    // Find the sub-assembly in the void's children
    const targetVoidSnapshot = rootVoid?.children?.find(
      (c: any) => c.id === targetVoidId
    );
    const subAssembly = targetVoidSnapshot?.children?.find(
      (c: any) => c.kind === 'sub-assembly'
    );

    expect(subAssembly).toBeDefined();
    expect(subAssembly!.kind).toBe('sub-assembly');

    // Verify sub-assembly dimensions account for clearance
    const expectedWidth = voidBounds.w - (clearance * 2);
    const expectedHeight = voidBounds.h - (clearance * 2);
    const expectedDepth = voidBounds.d - (clearance * 2);

    // Sub-assembly props should have width/height/depth
    const subAssemblyProps = subAssembly!.props as { width: number; height: number; depth: number };
    expect(subAssemblyProps.width).toBeCloseTo(expectedWidth, 1);
    expect(subAssemblyProps.height).toBeCloseTo(expectedHeight, 1);
    expect(subAssemblyProps.depth).toBeCloseTo(expectedDepth, 1);
  });
});

// ==========================================================================
// Nested Subdivision + Sub-Assembly Tests
// ==========================================================================

describe('Nested Subdivision + Sub-Assembly', () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    const engine = getEngine();
    if (engine.hasPreview()) {
      engine.discardPreview();
    }
  });

  it('should create sub-assembly in nested void', () => {
    const engine = getEngine();

    // Step 1: First subdivision on Y axis
    engine.dispatch({
      type: 'ADD_SUBDIVISIONS',
      targetId: 'main-assembly',
      payload: {
        voidId: 'root',
        axis: 'y',
        positions: [40],
      },
    });

    const firstLevelVoids = getChildVoidIds('root');
    expect(firstLevelVoids.length).toBe(2);

    // Step 2: Second subdivision on X axis in first child
    const firstChildId = firstLevelVoids[0];
    engine.dispatch({
      type: 'ADD_SUBDIVISIONS',
      targetId: 'main-assembly',
      payload: {
        voidId: firstChildId,
        axis: 'x',
        positions: [50],
      },
    });

    const secondLevelVoids = getChildVoidIds(firstChildId);
    expect(secondLevelVoids.length).toBe(2);

    // Step 3: Create sub-assembly in nested void
    const nestedVoidId = secondLevelVoids[0];
    const clearance = 1;

    const result = engine.dispatch({
      type: 'CREATE_SUB_ASSEMBLY',
      targetId: 'main-assembly',
      payload: {
        voidId: nestedVoidId,
        clearance,
      },
    });

    expect(result).toBe(true);

    // Step 4: Verify sub-assembly was created in the snapshot
    const nestedVoid = findVoidInSnapshot(nestedVoidId);
    expect(nestedVoid).not.toBeNull();

    const subAssembly = nestedVoid?.children?.find(
      (c: any) => c.kind === 'sub-assembly'
    );
    expect(subAssembly).toBeDefined();
  });

  it('should correctly size sub-assembly in nested void', () => {
    const engine = getEngine();

    // First subdivision on Y axis
    engine.dispatch({
      type: 'ADD_SUBDIVISIONS',
      targetId: 'main-assembly',
      payload: {
        voidId: 'root',
        axis: 'y',
        positions: [40],
      },
    });

    const firstLevelVoids = getChildVoidIds('root');
    const firstChildId = firstLevelVoids[0];

    // Second subdivision on X axis
    engine.dispatch({
      type: 'ADD_SUBDIVISIONS',
      targetId: 'main-assembly',
      payload: {
        voidId: firstChildId,
        axis: 'x',
        positions: [50],
      },
    });

    const secondLevelVoids = getChildVoidIds(firstChildId);
    const nestedVoidId = secondLevelVoids[0];

    // Get nested void bounds before creating sub-assembly
    const nestedVoid = findVoidInSnapshot(nestedVoidId);
    expect(nestedVoid).not.toBeNull();
    const voidBounds = nestedVoid.derived.bounds;

    // Create sub-assembly
    const clearance = 2;
    const result = engine.dispatch({
      type: 'CREATE_SUB_ASSEMBLY',
      targetId: 'main-assembly',
      payload: {
        voidId: nestedVoidId,
        clearance,
      },
    });

    expect(result).toBe(true);

    // Get the sub-assembly from snapshot
    const updatedVoid = findVoidInSnapshot(nestedVoidId);
    const subAssembly = updatedVoid?.children?.find(
      (c: any) => c.kind === 'sub-assembly'
    );

    expect(subAssembly).toBeDefined();

    // Verify sub-assembly dimensions account for clearance
    const subProps = subAssembly!.props as { width: number; height: number; depth: number };
    expect(subProps.width).toBeCloseTo(voidBounds.w - clearance * 2, 1);
    expect(subProps.height).toBeCloseTo(voidBounds.h - clearance * 2, 1);
    expect(subProps.depth).toBeCloseTo(voidBounds.d - clearance * 2, 1);
  });
});

// ==========================================================================
// Preview/Commit Flow Tests
// ==========================================================================

describe('Create Sub-Assembly Preview Flow', () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    const engine = getEngine();
    if (engine.hasPreview()) {
      engine.discardPreview();
    }
  });

  it('should show sub-assembly in preview before commit', () => {
    const engine = getEngine();

    // Start the operation
    useBoxStore.getState().startOperation('create-sub-assembly');
    expect(engine.hasPreview()).toBe(true);

    // Update params to create sub-assembly in root void
    useBoxStore.getState().updateOperationParams({
      voidId: 'root',
      clearance: 2,
      assemblyAxis: 'y',
    });

    // Verify preview has sub-assembly in the snapshot tree
    const snapshot = engine.getSnapshot();
    const assembly = snapshot.children?.[0];
    const rootVoid = assembly?.children?.[0];
    const subAssembly = rootVoid?.children?.find((c: any) => c.kind === 'sub-assembly');
    expect(subAssembly).toBeDefined();

    // Cancel to verify it doesn't persist
    useBoxStore.getState().cancelOperation();

    // Main scene should NOT have sub-assembly
    const mainSnapshot = engine.getSnapshot();
    const mainAssembly = mainSnapshot.children?.[0];
    const mainRootVoid = mainAssembly?.children?.[0];
    const mainSubAssembly = mainRootVoid?.children?.find((c: any) => c.kind === 'sub-assembly');
    expect(mainSubAssembly).toBeUndefined();
  });

  it('should persist sub-assembly after commit', () => {
    const engine = getEngine();

    // Start the operation
    useBoxStore.getState().startOperation('create-sub-assembly');

    // Update params
    useBoxStore.getState().updateOperationParams({
      voidId: 'root',
      clearance: 2,
      assemblyAxis: 'y',
    });

    // Apply operation
    useBoxStore.getState().applyOperation();

    // Preview should be gone
    expect(engine.hasPreview()).toBe(false);

    // Main scene should have sub-assembly
    const snapshot = engine.getSnapshot();
    const assembly = snapshot.children?.[0];
    const rootVoid = assembly?.children?.[0];
    const subAssembly = rootVoid?.children?.find((c: any) => c.kind === 'sub-assembly');
    expect(subAssembly).toBeDefined();
  });

  it('should update preview when clearance changes', () => {
    const engine = getEngine();

    // Start operation with initial clearance
    useBoxStore.getState().startOperation('create-sub-assembly');
    useBoxStore.getState().updateOperationParams({
      voidId: 'root',
      clearance: 2,
      assemblyAxis: 'y',
    });

    // Get initial sub-assembly dimensions
    let snapshot = engine.getSnapshot();
    let assembly = snapshot.children?.[0];
    let rootVoid = assembly?.children?.[0];
    let subAssembly = rootVoid?.children?.find((c: any) => c.kind === 'sub-assembly');
    const initialProps = subAssembly?.props as { width: number } | undefined;
    const initialWidth = initialProps?.width;

    // Update clearance
    useBoxStore.getState().updateOperationParams({
      voidId: 'root',
      clearance: 5,
      assemblyAxis: 'y',
    });

    // Get updated sub-assembly dimensions
    snapshot = engine.getSnapshot();
    assembly = snapshot.children?.[0];
    rootVoid = assembly?.children?.[0];
    subAssembly = rootVoid?.children?.find((c: any) => c.kind === 'sub-assembly');
    const updatedProps = subAssembly?.props as { width: number } | undefined;
    const updatedWidth = updatedProps?.width;

    // Width should be smaller with larger clearance
    expect(updatedWidth).toBeDefined();
    expect(initialWidth).toBeDefined();
    expect(updatedWidth!).toBeLessThan(initialWidth!);

    // Cleanup
    useBoxStore.getState().cancelOperation();
  });
});

// ==========================================================================
// Error Cases
// ==========================================================================

describe('Sub-Assembly Error Cases', () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    const engine = getEngine();
    if (engine.hasPreview()) {
      engine.discardPreview();
    }
  });

  it('should not create sub-assembly in subdivided void', () => {
    const engine = getEngine();

    // Subdivide root void
    engine.dispatch({
      type: 'ADD_SUBDIVISIONS',
      targetId: 'main-assembly',
      payload: {
        voidId: 'root',
        axis: 'y',
        positions: [40],
      },
    });

    // Try to create sub-assembly in root (which now has children)
    const result = engine.dispatch({
      type: 'CREATE_SUB_ASSEMBLY',
      targetId: 'main-assembly',
      payload: {
        voidId: 'root',
        clearance: 2,
      },
    });

    // Should fail (return false)
    expect(result).toBe(false);

    // Root void should not have a sub-assembly
    const snapshot = engine.getSnapshot();
    const assembly = snapshot.children?.[0];
    const rootVoid = assembly?.children?.[0];
    const subAssembly = rootVoid?.children?.find((c: any) => c.kind === 'sub-assembly');
    expect(subAssembly).toBeUndefined();
  });

  it('should not create second sub-assembly in same void', () => {
    const engine = getEngine();

    // Create first sub-assembly
    const firstResult = engine.dispatch({
      type: 'CREATE_SUB_ASSEMBLY',
      targetId: 'main-assembly',
      payload: {
        voidId: 'root',
        clearance: 2,
      },
    });

    expect(firstResult).toBe(true);

    // Verify first sub-assembly exists
    let snapshot = engine.getSnapshot();
    let assembly = snapshot.children?.[0];
    let rootVoid = assembly?.children?.[0];
    let subAssemblies = rootVoid?.children?.filter((c: any) => c.kind === 'sub-assembly') ?? [];
    expect(subAssemblies.length).toBe(1);

    // Try to create second sub-assembly in same void
    const secondResult = engine.dispatch({
      type: 'CREATE_SUB_ASSEMBLY',
      targetId: 'main-assembly',
      payload: {
        voidId: 'root',
        clearance: 3,
      },
    });

    // Should fail
    expect(secondResult).toBe(false);

    // Count should still be 1
    snapshot = engine.getSnapshot();
    assembly = snapshot.children?.[0];
    rootVoid = assembly?.children?.[0];
    subAssemblies = rootVoid?.children?.filter((c: any) => c.kind === 'sub-assembly') ?? [];
    expect(subAssemblies.length).toBe(1);
  });
});
