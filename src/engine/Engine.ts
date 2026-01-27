/**
 * Engine - Main entry point for the box model
 *
 * The Engine:
 * - Creates and manages the scene tree
 * - Processes actions (command pattern)
 * - Provides snapshot access for React rendering
 * - Handles finding nodes by ID
 */

import { SceneNode } from './nodes/SceneNode';
import { AssemblyNode } from './nodes/AssemblyNode';
import { VoidNode } from './nodes/VoidNode';
import { BaseNode } from './nodes/BaseNode';
import { BaseAssembly } from './nodes/BaseAssembly';
import {
  MaterialConfig,
  SceneSnapshot,
  PanelCollectionSnapshot,
  EngineAction,
} from './types';
import { PanelCollection, PanelPath, Void } from '../types';
import { generatePanelsWithVoid } from './panelBridge';

export class Engine {
  private _scene: SceneNode;

  constructor() {
    this._scene = new SceneNode();
  }

  // ==========================================================================
  // Scene Access
  // ==========================================================================

  get scene(): SceneNode {
    return this._scene;
  }

  /**
   * Get the primary assembly (convenience for single-assembly scenes)
   */
  get assembly(): AssemblyNode | null {
    return this._scene.primaryAssembly;
  }

  // ==========================================================================
  // Assembly Creation
  // ==========================================================================

  /**
   * Create a new main assembly and add it to the scene
   */
  createAssembly(
    width: number,
    height: number,
    depth: number,
    material: MaterialConfig
  ): AssemblyNode {
    const assembly = new AssemblyNode(width, height, depth, material);
    this._scene.addAssembly(assembly);
    return assembly;
  }

  // ==========================================================================
  // Node Lookup
  // ==========================================================================

  /**
   * Find any node by ID
   */
  findById(id: string): BaseNode | null {
    return this._scene.findById(id);
  }

  /**
   * Find an assembly by ID
   */
  findAssembly(id: string): BaseAssembly | null {
    const node = this.findById(id);
    if (node instanceof BaseAssembly) {
      return node;
    }
    return null;
  }

  /**
   * Find a void by ID
   */
  findVoid(id: string): VoidNode | null {
    const node = this.findById(id);
    if (node instanceof VoidNode) {
      return node;
    }
    return null;
  }

  // ==========================================================================
  // Snapshot Access
  // ==========================================================================

  /**
   * Get the full scene snapshot for React rendering
   */
  getSnapshot(): SceneSnapshot {
    // Recompute any dirty nodes first
    if (this._scene.isDirty) {
      this._scene.recompute();
      this._scene.clearDirty();
    }
    return this._scene.serialize();
  }

  /**
   * Get the panel collection for rendering and export (engine types)
   */
  getPanelCollection(): PanelCollectionSnapshot {
    // Ensure scene is up to date
    if (this._scene.isDirty) {
      this._scene.recompute();
      this._scene.clearDirty();
    }
    return this._scene.collectPanels();
  }

  /**
   * Generate panels using the existing panelGenerator (store types)
   * This bridges the engine to the existing panel generation logic.
   *
   * @param rootVoid - The void tree from the store (has subdivisions)
   * @param existingPanels - Existing panels for preserving edge extensions
   */
  generatePanels(rootVoid: Void, existingPanels?: PanelPath[]): PanelCollection {
    // Ensure scene is up to date
    if (this._scene.isDirty) {
      this._scene.recompute();
      this._scene.clearDirty();
    }

    const assembly = this._scene.primaryAssembly;
    if (!assembly) {
      return { panels: [], augmentations: [], generatedAt: Date.now() };
    }

    return generatePanelsWithVoid(assembly, rootVoid, existingPanels);
  }

  // ==========================================================================
  // Action Dispatch
  // ==========================================================================

  /**
   * Process an action to update the model
   * Returns true if the action was handled
   */
  dispatch(action: EngineAction): boolean {
    const assembly = this.findAssembly(action.targetId);

    switch (action.type) {
      case 'SET_DIMENSIONS':
        if (assembly) {
          assembly.setDimensions(action.payload);
          return true;
        }
        break;

      case 'SET_MATERIAL':
        if (assembly) {
          assembly.setMaterial(action.payload);
          return true;
        }
        break;

      case 'SET_FACE_SOLID':
        if (assembly) {
          assembly.setFaceSolid(action.payload.faceId, action.payload.solid);
          return true;
        }
        break;

      case 'TOGGLE_FACE':
        if (assembly) {
          assembly.toggleFace(action.payload.faceId);
          return true;
        }
        break;

      case 'SET_ASSEMBLY_AXIS':
        if (assembly) {
          assembly.setAssemblyAxis(action.payload.axis);
          return true;
        }
        break;

      case 'SET_LID_CONFIG':
        if (assembly) {
          assembly.setLidConfig(action.payload.side, action.payload.config);
          return true;
        }
        break;

      case 'SET_FEET_CONFIG':
        if (assembly) {
          assembly.setFeet(action.payload);
          return true;
        }
        break;

      case 'ADD_SUBDIVISION': {
        const voidNode = this.findVoid(action.payload.voidId);
        if (voidNode && assembly) {
          voidNode.subdivide(
            action.payload.axis,
            action.payload.position,
            assembly.material.thickness
          );
          return true;
        }
        break;
      }

      case 'REMOVE_SUBDIVISION': {
        const voidNode = this.findVoid(action.payload.voidId);
        if (voidNode) {
          voidNode.clearSubdivision();
          return true;
        }
        break;
      }

      case 'SET_EDGE_EXTENSION':
        // TODO: Find panel and set edge extension
        break;

      case 'CREATE_SUB_ASSEMBLY':
        // TODO: Create sub-assembly in void
        break;

      case 'REMOVE_SUB_ASSEMBLY':
        // TODO: Remove sub-assembly
        break;
    }

    return false;
  }
}

/**
 * Create a new engine with default configuration
 */
export function createEngine(): Engine {
  return new Engine();
}

/**
 * Create an engine with a pre-configured assembly
 */
export function createEngineWithAssembly(
  width: number,
  height: number,
  depth: number,
  material: MaterialConfig
): Engine {
  const engine = new Engine();
  engine.createAssembly(width, height, depth, material);
  return engine;
}
