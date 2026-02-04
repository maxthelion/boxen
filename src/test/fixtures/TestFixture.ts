/**
 * TestFixture - Core class for composable test fixture system.
 *
 * Provides a fluent API for setting up test scenarios with engines.
 * Uses lazy execution pattern - operations are queued and executed
 * when build() is called.
 *
 * @example
 * ```typescript
 * // Create a basic box with open top
 * const { engine, panels } = TestFixture.basicBox(100, 80, 60).build();
 *
 * // Create an enclosed box and select the front panel
 * const { panel } = TestFixture.enclosedBox(100, 80, 60)
 *   .panel('front')
 *   .build();
 *
 * // Create matrix of test scenarios
 * const base = TestFixture.basicBox(100, 80, 60);
 * const scenarios = ['top', 'front', 'left'].map(face =>
 *   base.clone().withOpenFaces([face as FaceId])
 * );
 * ```
 */

import { Engine, createEngineWithAssembly } from '../../engine/Engine';
import type { FaceId } from '../../types';
import type { MaterialConfig, EngineAction } from '../../engine/types';
import type { FixtureResult, QueuedOperation } from './types';
import { PanelBuilder } from './PanelBuilder';

/** Default material configuration for test fixtures */
const defaultMaterial: MaterialConfig = {
  thickness: 3,
  fingerWidth: 10,
  fingerGap: 1.5,
};

/** All face IDs for iteration */
const ALL_FACES: FaceId[] = ['top', 'bottom', 'left', 'right', 'front', 'back'];

/**
 * Core test fixture class for setting up test scenarios.
 *
 * TestFixture uses a builder pattern with lazy execution:
 * - Factory methods (basicBox, enclosedBox) create the initial state
 * - Configuration methods (withOpenFaces) queue modifications
 * - build() executes all queued operations and returns the result
 */
export class TestFixture {
  /** The engine instance (created by factory methods) */
  private engine: Engine;

  /** Face ID of the selected panel (resolved at build time) */
  private _selectedFace: FaceId | null = null;

  /** Queued operations to execute at build time */
  private operations: QueuedOperation[] = [];

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
   * This is the most common starting point for tests - a box with
   * one open face (top) like a typical storage container.
   *
   * @param width - Box width in mm
   * @param height - Box height in mm
   * @param depth - Box depth in mm
   * @param material - Optional material configuration
   * @returns TestFixture configured as open-top box
   */
  static basicBox(
    width: number,
    height: number,
    depth: number,
    material: MaterialConfig = defaultMaterial
  ): TestFixture {
    return new TestFixture(width, height, depth, material, ['top']);
  }

  /**
   * Create an enclosed box with all faces solid.
   *
   * @param width - Box width in mm
   * @param height - Box height in mm
   * @param depth - Box depth in mm
   * @param material - Optional material configuration
   * @returns TestFixture configured as enclosed box
   */
  static enclosedBox(
    width: number,
    height: number,
    depth: number,
    material: MaterialConfig = defaultMaterial
  ): TestFixture {
    return new TestFixture(width, height, depth, material, []);
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
  withOpenFaces(faces: FaceId[]): TestFixture {
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
   * Create an independent deep copy of this fixture.
   *
   * The clone has its own engine and can be modified without
   * affecting the original. Useful for creating test matrices.
   *
   * @returns New TestFixture with copied state
   */
  clone(): TestFixture {
    const copy = new TestFixture(
      this._config.width,
      this._config.height,
      this._config.depth,
      { ...this._config.material },
      [...this._config.openFaces]
    );

    // Copy selection state
    copy._selectedFace = this._selectedFace;

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
   * Execute all queued operations and return the fixture result.
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
}

// Re-export PanelBuilder for convenience
export { PanelBuilder } from './PanelBuilder';
