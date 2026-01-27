/**
 * SubAssemblyNode - A nested assembly within a void (drawer, tray, insert)
 *
 * Sub-assemblies:
 * - Live inside a parent void
 * - Have their own dimensions (sized to fit the void with clearance)
 * - Have their own face configurations
 * - Can have their own interior subdivisions
 * - Are positioned within the parent void
 */

import { BaseAssembly } from './BaseAssembly';
import { VoidNode } from './VoidNode';
import {
  NodeKind,
  MaterialConfig,
  Transform3D,
  AssemblySnapshot,
} from '../types';

export class SubAssemblyNode extends BaseAssembly {
  readonly kind: NodeKind = 'sub-assembly';

  // Reference to parent void
  protected _parentVoid: VoidNode;

  // Clearance from void walls (mm)
  protected _clearance: number;

  constructor(
    parentVoid: VoidNode,
    material: MaterialConfig,
    clearance: number = 1,
    id?: string
  ) {
    // Calculate dimensions from parent void bounds minus clearance
    const bounds = parentVoid.bounds;
    const width = bounds.w - 2 * clearance;
    const height = bounds.h - 2 * clearance;
    const depth = bounds.d - 2 * clearance;

    super(width, height, depth, material, id);

    this._parentVoid = parentVoid;
    this._clearance = clearance;
  }

  // ==========================================================================
  // Accessors
  // ==========================================================================

  get parentVoid(): VoidNode {
    return this._parentVoid;
  }

  get parentVoidId(): string {
    return this._parentVoid.id;
  }

  get clearance(): number {
    return this._clearance;
  }

  setClearance(clearance: number): void {
    if (this._clearance !== clearance) {
      this._clearance = clearance;
      this.updateDimensionsFromVoid();
      this.markDirty();
    }
  }

  /**
   * Update dimensions when parent void bounds change
   */
  updateDimensionsFromVoid(): void {
    const bounds = this._parentVoid.bounds;
    this._width = bounds.w - 2 * this._clearance;
    this._height = bounds.h - 2 * this._clearance;
    this._depth = bounds.d - 2 * this._clearance;
    this.updateRootVoidBounds();
  }

  // ==========================================================================
  // Transform
  // ==========================================================================

  /**
   * Position sub-assembly within the parent void
   * Centered in the void with clearance offset
   */
  getWorldTransform(): Transform3D {
    const bounds = this._parentVoid.bounds;

    // Find the root assembly to get the world offset
    const rootAssembly = this.findRootAssembly();
    if (!rootAssembly) {
      throw new Error('SubAssemblyNode must have a root assembly ancestor');
    }

    // Calculate center of void in assembly-local coordinates
    const voidCenterX = bounds.x + bounds.w / 2;
    const voidCenterY = bounds.y + bounds.h / 2;
    const voidCenterZ = bounds.z + bounds.d / 2;

    // Convert to world coordinates (assembly is centered at origin)
    const halfW = rootAssembly.width / 2;
    const halfH = rootAssembly.height / 2;
    const halfD = rootAssembly.depth / 2;

    return {
      position: [
        voidCenterX - halfW,
        voidCenterY - halfH,
        voidCenterZ - halfD,
      ],
      rotation: [0, 0, 0],
    };
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  protected findRootAssembly(): BaseAssembly | null {
    let node = this._parentVoid.parent;
    while (node) {
      // Keep going until we find an assembly that's not a sub-assembly
      if (node instanceof BaseAssembly && node.kind === 'assembly') {
        return node;
      }
      node = node.parent;
    }
    return null;
  }

  // ==========================================================================
  // Serialization
  // ==========================================================================

  serialize(): AssemblySnapshot {
    const base = this.serializeBase('sub-assembly');

    // Add sub-assembly specific props
    return {
      ...base,
      props: {
        ...base.props,
        clearance: this._clearance,
        parentVoidId: this._parentVoid.id,
      },
    };
  }

  // ==========================================================================
  // Cloning
  // ==========================================================================

  /**
   * Clone this sub-assembly into a new parent void
   * Called by VoidNode.clone() to properly set up the parent reference
   */
  cloneIntoVoid(newParentVoid: VoidNode): SubAssemblyNode {
    const cloned = new SubAssemblyNode(
      newParentVoid,
      { ...this._material },
      this._clearance,
      this.id
    );

    // Copy base assembly properties
    this.copyBasePropertiesTo(cloned);

    // Remove the default root void and replace with cloned one
    cloned.removeChild(cloned._rootVoid);
    cloned._rootVoid = this._rootVoid.clone();
    cloned.addChild(cloned._rootVoid);

    return cloned;
  }

  /**
   * Clone this sub-assembly (uses current parent void)
   * Note: For proper cloning during scene cloning, use cloneIntoVoid()
   */
  clone(): SubAssemblyNode {
    return this.cloneIntoVoid(this._parentVoid);
  }
}
