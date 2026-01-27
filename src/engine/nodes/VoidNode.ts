/**
 * VoidNode - Represents an interior space that can be subdivided
 *
 * Voids are the interior spaces within an assembly.
 * They can be:
 * - Subdivided into child voids (creating divider panels)
 * - Filled with a sub-assembly (drawer, tray, etc.)
 * - Left empty (leaf void)
 */

import { BaseNode } from './BaseNode';
import {
  NodeKind,
  Axis,
  Bounds3D,
  VoidSnapshot,
} from '../types';

export class VoidNode extends BaseNode {
  readonly kind: NodeKind = 'void';

  // Bounds within parent coordinate space
  protected _bounds: Bounds3D;

  // Subdivision info (if this void was created by splitting a parent)
  protected _splitAxis?: Axis;
  protected _splitPosition?: number;
  protected _splitPositionMode?: 'absolute' | 'percentage';
  protected _splitPercentage?: number;

  constructor(bounds: Bounds3D, id?: string) {
    super(id);
    this._bounds = { ...bounds };
  }

  // ==========================================================================
  // Bounds Accessors
  // ==========================================================================

  get bounds(): Bounds3D {
    return { ...this._bounds };
  }

  setBounds(bounds: Bounds3D): void {
    this._bounds = { ...bounds };
    this.markDirty();
    // Update children bounds if subdivided
    this.updateChildBounds();
  }

  // ==========================================================================
  // Subdivision Info
  // ==========================================================================

  get splitAxis(): Axis | undefined {
    return this._splitAxis;
  }

  get splitPosition(): number | undefined {
    return this._splitPosition;
  }

  get splitPositionMode(): 'absolute' | 'percentage' | undefined {
    return this._splitPositionMode;
  }

  get splitPercentage(): number | undefined {
    return this._splitPercentage;
  }

  setSplitInfo(info: {
    axis: Axis;
    position: number;
    mode: 'absolute' | 'percentage';
    percentage?: number;
  }): void {
    this._splitAxis = info.axis;
    this._splitPosition = info.position;
    this._splitPositionMode = info.mode;
    this._splitPercentage = info.percentage;
    this.markDirty();
  }

  // ==========================================================================
  // State Queries
  // ==========================================================================

  /**
   * Is this a leaf void (no children)?
   */
  get isLeaf(): boolean {
    return this._children.length === 0;
  }

  /**
   * Does this void contain a sub-assembly?
   */
  get hasSubAssembly(): boolean {
    return this._children.some(c => c.kind === 'sub-assembly');
  }

  /**
   * Is this void subdivided?
   */
  get isSubdivided(): boolean {
    return this._children.some(c => c.kind === 'void');
  }

  // ==========================================================================
  // Subdivision Operations
  // ==========================================================================

  /**
   * Subdivide this void at the given position along the given axis
   */
  subdivide(axis: Axis, position: number, materialThickness: number): [VoidNode, VoidNode] {
    if (!this.isLeaf) {
      throw new Error('Cannot subdivide a non-leaf void');
    }

    const { x, y, z, w, h, d } = this._bounds;
    const halfMt = materialThickness / 2;

    let bounds1: Bounds3D;
    let bounds2: Bounds3D;

    switch (axis) {
      case 'x':
        bounds1 = { x, y, z, w: position - x - halfMt, h, d };
        bounds2 = { x: position + halfMt, y, z, w: x + w - position - halfMt, h, d };
        break;
      case 'y':
        bounds1 = { x, y, z, w, h: position - y - halfMt, d };
        bounds2 = { x, y: position + halfMt, z, w, h: y + h - position - halfMt, d };
        break;
      case 'z':
        bounds1 = { x, y, z, w, h, d: position - z - halfMt };
        bounds2 = { x, y, z: position + halfMt, w, h, d: z + d - position - halfMt };
        break;
    }

    const child1 = new VoidNode(bounds1);
    const child2 = new VoidNode(bounds2);

    // Set split info on the second child (it has the divider before it)
    const dimSize = axis === 'x' ? w : axis === 'y' ? h : d;
    const dimStart = axis === 'x' ? x : axis === 'y' ? y : z;
    const percentage = (position - dimStart) / dimSize;

    child2.setSplitInfo({
      axis,
      position,
      mode: 'percentage',
      percentage,
    });

    this.addChild(child1);
    this.addChild(child2);

    return [child1, child2];
  }

  /**
   * Remove subdivision and return to leaf state
   */
  clearSubdivision(): void {
    // Remove all void children
    const voidChildren = this._children.filter(c => c.kind === 'void');
    for (const child of voidChildren) {
      this.removeChild(child);
    }
  }

  /**
   * Update child bounds when parent bounds change
   */
  protected updateChildBounds(): void {
    // TODO: Recalculate child bounds based on split percentages
  }

  // ==========================================================================
  // Recomputation
  // ==========================================================================

  recompute(): void {
    // Recompute children
    for (const child of this._children) {
      if (child.isDirty) {
        child.recompute();
      }
    }
  }

  // ==========================================================================
  // Serialization
  // ==========================================================================

  serialize(): VoidSnapshot {
    return {
      id: this.id,
      kind: 'void',
      props: {
        splitAxis: this._splitAxis,
        splitPosition: this._splitPosition,
        splitPositionMode: this._splitPositionMode,
        splitPercentage: this._splitPercentage,
      },
      derived: {
        bounds: this.bounds,
        isLeaf: this.isLeaf,
      },
      children: this._children.map(c => c.serialize()) as (VoidSnapshot | any)[],
    };
  }
}
