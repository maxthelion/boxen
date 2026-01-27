/**
 * AssemblyNode - The main/root assembly (the outer box)
 *
 * This is the primary container that represents the main box.
 * It sits at the world origin and contains:
 * - Box dimensions (width, height, depth)
 * - Material configuration
 * - Face configurations (6 faces)
 * - Assembly configuration (axis, lids)
 * - Optional feet
 * - Root void (interior space for subdivisions and sub-assemblies)
 */

import { BaseAssembly } from './BaseAssembly';
import {
  NodeKind,
  MaterialConfig,
  Transform3D,
  AssemblySnapshot,
} from '../types';

export class AssemblyNode extends BaseAssembly {
  readonly kind: NodeKind = 'assembly';

  constructor(
    width: number,
    height: number,
    depth: number,
    material: MaterialConfig,
    id?: string
  ) {
    super(width, height, depth, material, id ?? 'main-assembly');
  }

  // ==========================================================================
  // Transform
  // ==========================================================================

  /**
   * Main assembly is always at world origin with no rotation
   */
  getWorldTransform(): Transform3D {
    return {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
    };
  }

  // ==========================================================================
  // Serialization
  // ==========================================================================

  serialize(): AssemblySnapshot {
    return this.serializeBase('assembly');
  }

  // ==========================================================================
  // Cloning
  // ==========================================================================

  /**
   * Create a deep clone of this assembly
   */
  clone(): AssemblyNode {
    const cloned = new AssemblyNode(
      this._width,
      this._height,
      this._depth,
      { ...this._material },
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
}
