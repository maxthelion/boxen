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
}
