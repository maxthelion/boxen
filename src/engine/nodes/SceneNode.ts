/**
 * SceneNode - Root of the scene tree
 *
 * The scene contains all assemblies and provides:
 * - Root-level assembly management
 * - Full tree serialization
 * - Panel collection derivation
 */

import { BaseNode } from './BaseNode';
import { AssemblyNode } from './AssemblyNode';
import {
  NodeKind,
  SceneSnapshot,
  AssemblySnapshot,
  PanelSnapshot,
  PanelCollectionSnapshot,
} from '../types';

export class SceneNode extends BaseNode {
  readonly kind: NodeKind = 'scene';

  constructor(id?: string) {
    super(id ?? 'scene');
  }

  // ==========================================================================
  // Assembly Management
  // ==========================================================================

  /**
   * Get all top-level assemblies in the scene
   */
  get assemblies(): AssemblyNode[] {
    return this._children.filter(c => c instanceof AssemblyNode) as AssemblyNode[];
  }

  /**
   * Get the primary assembly (usually there's just one)
   */
  get primaryAssembly(): AssemblyNode | null {
    return this.assemblies[0] ?? null;
  }

  /**
   * Add an assembly to the scene
   */
  addAssembly(assembly: AssemblyNode): void {
    this.addChild(assembly);
  }

  /**
   * Remove an assembly from the scene
   */
  removeAssembly(assembly: AssemblyNode): void {
    this.removeChild(assembly);
  }

  // ==========================================================================
  // Panel Collection
  // ==========================================================================

  /**
   * Collect all panels from all assemblies in the scene
   * This is a derived view for rendering and export
   */
  collectPanels(): PanelCollectionSnapshot {
    const panels: PanelSnapshot[] = [];

    for (const assembly of this.assemblies) {
      panels.push(...assembly.getPanels());
    }

    // TODO: Compute global finger alignment data
    const fingerData = {
      xPoints: [] as number[],
      yPoints: [] as number[],
      zPoints: [] as number[],
    };

    return { panels, fingerData };
  }

  // ==========================================================================
  // Recomputation
  // ==========================================================================

  recompute(): void {
    for (const child of this._children) {
      if (child.isDirty) {
        child.recompute();
      }
    }
  }

  // ==========================================================================
  // Serialization
  // ==========================================================================

  serialize(): SceneSnapshot {
    return {
      id: this.id,
      kind: 'scene',
      children: this.assemblies.map(a => a.serialize()) as AssemblySnapshot[],
    };
  }
}
