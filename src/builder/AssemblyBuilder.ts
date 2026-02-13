/**
 * AssemblyBuilder - Core class for composable assembly builder system.
 *
 * Provides a fluent API for setting up assembly scenarios with engines.
 * Uses lazy execution pattern - operations are queued and executed
 * when build() is called.
 *
 * @example
 * ```typescript
 * // Create a basic box with open top
 * const { engine, panels } = AssemblyBuilder.basicBox(100, 80, 60).build();
 *
 * // Create an enclosed box and select the front panel
 * const { panel } = AssemblyBuilder.enclosedBox(100, 80, 60)
 *   .panel('front')
 *   .build();
 *
 * // Create matrix of test scenarios
 * const base = AssemblyBuilder.basicBox(100, 80, 60);
 * const scenarios = ['top', 'front', 'left'].map(face =>
 *   base.clone().withOpenFaces([face as FaceId])
 * );
 * ```
 */

import { Engine, createEngineWithAssembly } from '../engine/Engine';
import type { FaceId } from '../types';
import type { MaterialConfig, EngineAction, Axis, FeetConfig, LidConfig, VoidSnapshot } from '../engine/types';
import type { FixtureResult, QueuedOperation } from './types';
import { PanelBuilder } from './PanelBuilder';

/** Void selector: 'root' for the root void, or a callback that receives the builder and returns a void ID */
export type VoidSelector = 'root' | ((fixture: AssemblyBuilder) => string);

/** Default material configuration */
const defaultMaterial: MaterialConfig = {
  thickness: 3,
  fingerWidth: 10,
  fingerGap: 1.5,
};

/** All face IDs for iteration */
const ALL_FACES: FaceId[] = ['top', 'bottom', 'left', 'right', 'front', 'back'];

/**
 * Core assembly builder class for setting up scenarios.
 *
 * AssemblyBuilder uses a builder pattern with lazy execution:
 * - Factory methods (basicBox, enclosedBox) create the initial state
 * - Configuration methods (withOpenFaces) queue modifications
 * - build() executes all queued operations and returns the result
 */
export class AssemblyBuilder {
  /** The engine instance (created by factory methods) */
  private engine: Engine;

  /** Face ID of the selected panel (resolved at build time) */
  private _selectedFace: FaceId | null = null;

  /** Queued operations to execute at build time */
  private operations: QueuedOperation[] = [];

  /** Child void IDs from the most recent subdivision operation */
  private _lastChildVoids: string[] = [];

  /** Configuration state for cloning */
  private _config: {
    width: number;
    height: number;
    depth: number;
    material: MaterialConfig;
    openFaces: FaceId[];
  };

  /**
   * Private constructor - use factory methods instead.
   */
  private constructor(
    width: number,
    height: number,
    depth: number,
    material: MaterialConfig,
    openFaces: FaceId[] = []
  ) {
    this._config = { width, height, depth, material, openFaces };
    this.engine = createEngineWithAssembly(width, height, depth, material);

    // Apply initial open faces
    for (const face of openFaces) {
      this.engine.dispatch({
        type: 'TOGGLE_FACE',
        targetId: 'main-assembly',
        payload: { faceId: face },
      });
    }
  }

  // ===========================================================================
  // Factory Methods
  // ===========================================================================

  /**
   * Create a basic box with open top face.
   *
   * This is the most common starting point - a box with
   * one open face (top) like a typical storage container.
   *
   * @param width - Box width in mm
   * @param height - Box height in mm
   * @param depth - Box depth in mm
   * @param material - Optional material configuration
   * @returns AssemblyBuilder configured as open-top box
   */
  static basicBox(
    width: number,
    height: number,
    depth: number,
    material: MaterialConfig = defaultMaterial
  ): AssemblyBuilder {
    return new AssemblyBuilder(width, height, depth, material, ['top']);
  }

  /**
   * Create an enclosed box with all faces solid.
   *
   * @param width - Box width in mm
   * @param height - Box height in mm
   * @param depth - Box depth in mm
   * @param material - Optional material configuration
   * @returns AssemblyBuilder configured as enclosed box
   */
  static enclosedBox(
    width: number,
    height: number,
    depth: number,
    material: MaterialConfig = defaultMaterial
  ): AssemblyBuilder {
    return new AssemblyBuilder(width, height, depth, material, []);
  }

  // ===========================================================================
  // Configuration Methods (Chainable)
  // ===========================================================================

  /**
   * Configure which faces are open (not solid).
   *
   * This replaces any previous open face configuration.
   * All faces not in the list will be solid.
   *
   * @param faces - Array of face IDs to make open
   * @returns this for chaining
   */
  withOpenFaces(faces: FaceId[]): AssemblyBuilder {
    // First, ensure all faces are solid
    for (const face of ALL_FACES) {
      const shouldBeOpen = faces.includes(face);
      const currentlyOpen = this._config.openFaces.includes(face);

      if (shouldBeOpen !== currentlyOpen) {
        this.engine.dispatch({
          type: 'TOGGLE_FACE',
          targetId: 'main-assembly',
          payload: { faceId: face },
        });
      }
    }

    // Update config
    this._config.openFaces = [...faces];

    return this;
  }

  // ===========================================================================
  // Dimension & Material Configuration (Chainable)
  // ===========================================================================

  /**
   * Update assembly dimensions (partial).
   *
   * @param dims - Partial dimensions to update
   * @returns this for chaining
   */
  withDimensions(dims: { width?: number; height?: number; depth?: number }): AssemblyBuilder {
    this.engine.dispatch({
      type: 'SET_DIMENSIONS',
      targetId: 'main-assembly',
      payload: dims,
    });
    if (dims.width !== undefined) this._config.width = dims.width;
    if (dims.height !== undefined) this._config.height = dims.height;
    if (dims.depth !== undefined) this._config.depth = dims.depth;
    return this;
  }

  /**
   * Update material configuration (partial).
   *
   * @param config - Partial material config to update
   * @returns this for chaining
   */
  withMaterial(config: Partial<MaterialConfig>): AssemblyBuilder {
    this.engine.dispatch({
      type: 'SET_MATERIAL',
      targetId: 'main-assembly',
      payload: config,
    });
    Object.assign(this._config.material, config);
    return this;
  }

  /**
   * Set feet configuration.
   *
   * @param config - Feet config, or null to disable
   * @returns this for chaining
   */
  withFeet(config: FeetConfig | null): AssemblyBuilder {
    this.engine.dispatch({
      type: 'SET_FEET_CONFIG',
      targetId: 'main-assembly',
      payload: config,
    });
    return this;
  }

  /**
   * Set lid configuration for a face.
   *
   * @param side - Which lid side ('positive' or 'negative')
   * @param config - Partial lid config
   * @returns this for chaining
   */
  withLid(side: 'positive' | 'negative', config: Partial<LidConfig>): AssemblyBuilder {
    this.engine.dispatch({
      type: 'SET_LID_CONFIG',
      targetId: 'main-assembly',
      payload: { side, config },
    });
    return this;
  }

  /**
   * Set the assembly axis.
   *
   * @param axis - The axis to set ('x', 'y', or 'z')
   * @returns this for chaining
   */
  withAxis(axis: Axis): AssemblyBuilder {
    this.engine.dispatch({
      type: 'SET_ASSEMBLY_AXIS',
      targetId: 'main-assembly',
      payload: { axis },
    });
    return this;
  }

  // ===========================================================================
  // Subdivision Methods (Chainable)
  // ===========================================================================

  /**
   * Add a single subdivision to a void.
   *
   * After this call, `childVoid(0)` and `childVoid(1)` return the
   * IDs of the two child voids created by the split.
   *
   * @param voidSelector - 'root' or a callback returning a void ID
   * @param axis - Axis to subdivide along
   * @param position - World-space position of the divider
   * @returns this for chaining
   */
  subdivide(voidSelector: VoidSelector, axis: Axis, position: number): AssemblyBuilder {
    const voidId = this._resolveVoidId(voidSelector);

    this.engine.dispatch({
      type: 'ADD_SUBDIVISION',
      targetId: 'main-assembly',
      payload: { voidId, axis, position },
    });

    this._snapshotChildVoids(voidId);
    return this;
  }

  /**
   * Evenly subdivide a void into `count` compartments along an axis.
   *
   * Computes evenly-spaced positions from the void bounds and dispatches
   * multiple subdivisions. After this call, `childVoid(i)` returns the
   * ID of the i-th child void (0-indexed, in axis order).
   *
   * @param voidSelector - 'root' or a callback returning a void ID
   * @param axis - Axis to subdivide along
   * @param count - Number of compartments (creates count-1 dividers)
   * @returns this for chaining
   */
  subdivideEvenly(voidSelector: VoidSelector, axis: Axis, count: number): AssemblyBuilder {
    if (count < 2) return this;

    const voidId = this._resolveVoidId(voidSelector);
    const voidNode = this.engine.findVoid(voidId);
    if (!voidNode) {
      throw new Error(`AssemblyBuilder.subdivideEvenly: void '${voidId}' not found`);
    }

    const bounds = voidNode.bounds;
    const axisMap = { x: { start: bounds.x, size: bounds.w }, y: { start: bounds.y, size: bounds.h }, z: { start: bounds.z, size: bounds.d } };
    const { start, size } = axisMap[axis];

    const positions: number[] = [];
    for (let i = 1; i < count; i++) {
      positions.push(start + (size * i) / count);
    }

    this.engine.dispatch({
      type: 'ADD_SUBDIVISIONS',
      targetId: 'main-assembly',
      payload: { voidId, axis, positions },
    });

    this._snapshotChildVoids(voidId);
    return this;
  }

  /**
   * Create a grid subdivision (multi-axis).
   *
   * Computes evenly-spaced positions for each axis and dispatches
   * a grid subdivision. After this call, `childVoid(i)` returns the
   * ID of the i-th child void (row-major order).
   *
   * @param voidSelector - 'root' or a callback returning a void ID
   * @param xCount - Number of compartments along X axis
   * @param zCount - Number of compartments along Z axis
   * @returns this for chaining
   */
  grid(voidSelector: VoidSelector, xCount: number, zCount: number): AssemblyBuilder {
    const voidId = this._resolveVoidId(voidSelector);
    const voidNode = this.engine.findVoid(voidId);
    if (!voidNode) {
      throw new Error(`AssemblyBuilder.grid: void '${voidId}' not found`);
    }

    const bounds = voidNode.bounds;
    const axes: { axis: Axis; positions: number[] }[] = [];

    if (xCount >= 2) {
      const positions: number[] = [];
      for (let i = 1; i < xCount; i++) {
        positions.push(bounds.x + (bounds.w * i) / xCount);
      }
      axes.push({ axis: 'x', positions });
    }

    if (zCount >= 2) {
      const positions: number[] = [];
      for (let i = 1; i < zCount; i++) {
        positions.push(bounds.z + (bounds.d * i) / zCount);
      }
      axes.push({ axis: 'z', positions });
    }

    if (axes.length === 0) return this;

    this.engine.dispatch({
      type: 'ADD_GRID_SUBDIVISION',
      targetId: 'main-assembly',
      payload: { voidId, axes },
    });

    this._snapshotChildVoids(voidId);
    return this;
  }

  /**
   * Get the ID of a child void created by the most recent subdivision.
   *
   * @param index - Zero-based index into the child voids (ordered by axis position)
   * @returns The child void ID
   */
  childVoid(index: number): string {
    if (index < 0 || index >= this._lastChildVoids.length) {
      throw new Error(
        `AssemblyBuilder.childVoid(${index}): index out of range. ` +
        `Last subdivision created ${this._lastChildVoids.length} child voids.`
      );
    }
    return this._lastChildVoids[index];
  }

  // ===========================================================================
  // Panel Selection
  // ===========================================================================

  /**
   * Select a panel by face ID.
   *
   * The selected panel will be available in the build result as `panel`.
   * Returns a PanelBuilder for additional panel-specific configuration.
   *
   * @param face - The face ID to select
   * @returns PanelBuilder for additional configuration
   */
  panel(face: FaceId): PanelBuilder {
    this._selectedFace = face;
    return new PanelBuilder(this, face);
  }

  // ===========================================================================
  // Cloning
  // ===========================================================================

  /**
   * Create an independent deep copy of this builder.
   *
   * The clone has its own engine and can be modified without
   * affecting the original. Useful for creating test matrices.
   *
   * @returns New AssemblyBuilder with copied state
   */
  clone(): AssemblyBuilder {
    const copy = new AssemblyBuilder(
      this._config.width,
      this._config.height,
      this._config.depth,
      { ...this._config.material },
      [...this._config.openFaces]
    );

    // Copy selection state
    copy._selectedFace = this._selectedFace;
    copy._lastChildVoids = [...this._lastChildVoids];

    // Copy queued operations (deep copy the action objects)
    copy.operations = this.operations.map(op => ({
      action: { ...op.action } as EngineAction,
    }));

    return copy;
  }

  // ===========================================================================
  // Build (Lazy Execution)
  // ===========================================================================

  /**
   * Execute all queued operations and return the result.
   *
   * This triggers:
   * 1. Execution of all queued operations
   * 2. Panel generation from engine state
   * 3. Resolution of selected panel (if any) by faceId
   *
   * @returns FixtureResult with engine, panels, and optionally selected panel
   */
  build(): FixtureResult {
    // Execute queued operations
    for (const op of this.operations) {
      this.engine.dispatch(op.action);
    }

    // Generate fresh panel list
    const panels = this.engine.generatePanelsFromNodes().panels;

    // Re-resolve selected panel by faceId
    const selectedPanel = this._selectedFace
      ? panels.find(p => p.source.faceId === this._selectedFace)
      : undefined;

    return {
      engine: this.engine,
      panels,
      panel: selectedPanel,
    };
  }

  // ===========================================================================
  // Internal Methods (for PanelBuilder and future extensions)
  // ===========================================================================

  /**
   * Queue an operation for lazy execution.
   * @internal
   */
  _queueOperation(action: EngineAction): void {
    this.operations.push({ action });
  }

  /**
   * Get the current engine instance.
   * @internal
   */
  _getEngine(): Engine {
    return this.engine;
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Resolve a VoidSelector to a concrete void ID.
   * @internal
   */
  private _resolveVoidId(selector: VoidSelector): string {
    if (selector === 'root') {
      const assembly = this.engine.assembly;
      if (!assembly) throw new Error('AssemblyBuilder: no assembly found');
      return assembly.rootVoid.id;
    }
    return selector(this);
  }

  /**
   * Snapshot the child voids of a parent void after a subdivision.
   * Stores them in `_lastChildVoids` for use with `childVoid()`.
   * @internal
   */
  private _snapshotChildVoids(parentVoidId: string): void {
    const snapshot = this.engine.getSnapshot();
    const assembly = snapshot.children[0];
    if (!assembly) {
      this._lastChildVoids = [];
      return;
    }
    const parentVoid = this._findVoidInSnapshot(assembly.children[0], parentVoidId);
    if (!parentVoid) {
      this._lastChildVoids = [];
      return;
    }
    this._lastChildVoids = parentVoid.children
      .filter((c): c is VoidSnapshot => c.kind === 'void')
      .map(v => v.id);
  }

  /**
   * Recursively find a void in the snapshot tree.
   * @internal
   */
  private _findVoidInSnapshot(node: VoidSnapshot | undefined, id: string): VoidSnapshot | undefined {
    if (!node) return undefined;
    if (node.id === id) return node;
    for (const child of node.children) {
      if (child.kind === 'void') {
        const found = this._findVoidInSnapshot(child as VoidSnapshot, id);
        if (found) return found;
      }
    }
    return undefined;
  }
}

// Re-export PanelBuilder for convenience
export { PanelBuilder } from './PanelBuilder';
