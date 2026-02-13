/**
 * PanelBuilder - Fluent API for panel-specific operations.
 *
 * Provides chainable methods for configuring panel operations like
 * extensions, cutouts, fillets, and chamfers. Operations are queued
 * and executed when build() is called.
 *
 * @example
 * ```typescript
 * // Extend the top edge of the front panel
 * const { panel } = AssemblyBuilder.basicBox(100, 80, 60)
 *   .panel('front')
 *   .withExtension('top', 30)
 *   .build();
 *
 * // Add multiple cutouts
 * const { panel } = AssemblyBuilder.enclosedBox(100, 80, 60)
 *   .panel('front')
 *   .withCutout(rect(10, 10, 20, 20))
 *   .withCutout(circle(50, 40, 10))
 *   .build();
 * ```
 */

import type { FaceId } from '../types';
import type { AssemblyBuilder } from './AssemblyBuilder';
import type { FixtureResult } from './types';
import type { Shape } from './shapes';
import type { CornerKey } from '../engine/types';

/** Edge identifier for panel edge operations */
export type EdgeId = 'top' | 'bottom' | 'left' | 'right';

/**
 * Builder for panel-specific operations.
 *
 * PanelBuilder allows configuring operations that modify a specific panel.
 * Operations are queued and executed lazily when build() is called.
 */
export class PanelBuilder {
  /** Face ID of the panel being configured */
  private faceId: FaceId;

  constructor(
    private fixture: AssemblyBuilder,
    faceId: FaceId
  ) {
    this.faceId = faceId;
  }

  /** Get the selected face ID */
  getFaceId(): FaceId {
    return this.faceId;
  }

  /**
   * Add an edge extension to the panel.
   *
   * Extensions push an edge outward, making the panel larger.
   * Only edges that are "unlocked" or "outward-only" can be extended.
   *
   * @param edge - Which edge to extend ('top' | 'bottom' | 'left' | 'right')
   * @param amount - Extension amount in mm (positive = outward)
   * @returns this for chaining
   */
  withExtension(edge: EdgeId, amount: number): PanelBuilder {
    // Get the current panel ID
    // Note: Panel ID is resolved at queue time from current engine state
    const panelId = this.resolvePanelId();
    if (!panelId) {
      console.warn(`PanelBuilder: No panel found for face ${this.faceId}, extension will be skipped`);
      return this;
    }

    this.fixture._queueOperation({
      type: 'SET_EDGE_EXTENSION',
      targetId: 'main-assembly',
      payload: {
        panelId,
        edge,
        value: amount,
      },
    });

    return this;
  }

  /**
   * Add extensions to multiple edges.
   *
   * Convenience method for applying the same extension amount to multiple edges.
   *
   * @param edges - Array of edges to extend
   * @param amount - Extension amount in mm (default: 20)
   * @returns this for chaining
   */
  withExtensions(edges: EdgeId[], amount: number = 20): PanelBuilder {
    for (const edge of edges) {
      this.withExtension(edge, amount);
    }
    return this;
  }

  /**
   * Add a cutout (hole) to the panel.
   *
   * Cutouts are shapes cut from the panel body within the safe space.
   *
   * @param shape - Shape to cut from the panel (from shapes.ts helpers)
   * @returns this for chaining
   */
  withCutout(shape: Shape): PanelBuilder {
    const panelId = this.resolvePanelId();
    if (!panelId) {
      console.warn(`PanelBuilder: No panel found for face ${this.faceId}, cutout will be skipped`);
      return this;
    }

    // Convert shape to path points
    const pathPoints = shape.toPath();

    // Calculate center from path bounds
    const xs = pathPoints.map(p => p.x);
    const ys = pathPoints.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Convert to points relative to center (for PathCutout)
    const relativePoints = pathPoints.map(p => ({
      x: p.x - centerX,
      y: p.y - centerY,
    }));

    this.fixture._queueOperation({
      type: 'ADD_CUTOUT',
      targetId: 'main-assembly',
      payload: {
        panelId,
        cutout: {
          id: `cutout-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          type: 'path',
          center: { x: centerX, y: centerY },
          points: relativePoints,
        },
      },
    });

    return this;
  }

  /**
   * Add multiple cutouts to the panel.
   *
   * @param shapes - Array of shapes to cut from the panel
   * @returns this for chaining
   */
  withCutouts(shapes: Shape[]): PanelBuilder {
    for (const shape of shapes) {
      this.withCutout(shape);
    }
    return this;
  }

  /**
   * Add fillets (rounded corners) to the panel.
   *
   * Fillets round the specified corners of the panel.
   *
   * @param corners - Array of corner keys ('bottom:left', 'bottom:right', 'left:top', 'right:top')
   * @param radius - Fillet radius in mm
   * @returns this for chaining
   */
  withFillet(corners: CornerKey[], radius: number): PanelBuilder {
    const panelId = this.resolvePanelId();
    if (!panelId) {
      console.warn(`PanelBuilder: No panel found for face ${this.faceId}, fillet will be skipped`);
      return this;
    }

    // Queue individual fillet operations for each corner
    for (const corner of corners) {
      this.fixture._queueOperation({
        type: 'SET_CORNER_FILLET',
        targetId: 'main-assembly',
        payload: {
          panelId,
          corner,
          radius,
        },
      });
    }

    return this;
  }

  /**
   * Add chamfers (angled corners) to the panel.
   *
   * Chamfers cut the specified corners at an angle.
   *
   * Note: This operation may not be fully implemented in the engine yet.
   * The method is provided for API completeness and will work once
   * the engine action is available.
   *
   * @param corners - Array of corner keys ('bottom:left', 'bottom:right', 'left:top', 'right:top')
   * @param size - Chamfer size in mm
   * @returns this for chaining
   */
  withChamfer(corners: CornerKey[], size: number): PanelBuilder {
    const panelId = this.resolvePanelId();
    if (!panelId) {
      console.warn(`PanelBuilder: No panel found for face ${this.faceId}, chamfer will be skipped`);
      return this;
    }

    // TODO: APPLY_CHAMFER engine action does not exist yet
    // When implemented, it should queue:
    // this.fixture._queueOperation({
    //   type: 'APPLY_CHAMFER',
    //   targetId: 'main-assembly',
    //   payload: {
    //     panelId,
    //     corners,
    //     size,
    //   },
    // });

    // For now, log a warning
    console.warn(
      `PanelBuilder.withChamfer: Engine action APPLY_CHAMFER not implemented yet. ` +
        `Corners: ${corners.join(', ')}, size: ${size}`
    );

    return this;
  }

  /**
   * Return to the AssemblyBuilder for further configuration.
   *
   * This allows chaining back to builder-level operations
   * after configuring panel operations.
   *
   * @returns The parent AssemblyBuilder
   */
  and(): AssemblyBuilder {
    return this.fixture;
  }

  /**
   * Create an independent copy of this PanelBuilder.
   *
   * The clone has its own builder copy and can be modified
   * without affecting the original.
   *
   * @returns New PanelBuilder with cloned builder
   */
  clone(): PanelBuilder {
    return new PanelBuilder(this.fixture.clone(), this.faceId);
  }

  /**
   * Build the assembly and return the result.
   *
   * This triggers execution of all queued operations and returns
   * the final state with engine, panels, and selected panel.
   *
   * @returns FixtureResult from the parent builder
   */
  build(): FixtureResult {
    return this.fixture.build();
  }

  /**
   * Resolve the panel ID for the current face.
   *
   * @internal
   * @returns The panel ID, or null if the face is open
   */
  private resolvePanelId(): string | null {
    const engine = this.fixture._getEngine();
    const { panels } = engine.generatePanelsFromNodes();
    const panel = panels.find(p => p.source.faceId === this.faceId);
    return panel?.id ?? null;
  }
}
