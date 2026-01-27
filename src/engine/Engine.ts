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
import { SubAssemblyNode } from './nodes/SubAssemblyNode';
import { VoidNode } from './nodes/VoidNode';
import { BaseNode } from './nodes/BaseNode';
import { BaseAssembly } from './nodes/BaseAssembly';
import {
  MaterialConfig,
  SceneSnapshot,
  PanelCollectionSnapshot,
  EngineAction,
} from './types';
import { PanelCollection } from '../types';
import { generatePanelsFromEngine } from './panelBridge';

export class Engine {
  private _scene: SceneNode;
  private _previewScene: SceneNode | null = null;
  private _nodeMap: Map<string, BaseNode> | null = null;

  constructor() {
    this._scene = new SceneNode();
  }

  // ==========================================================================
  // Preview Management
  // ==========================================================================

  /**
   * Start a preview by cloning the current scene
   * All subsequent dispatches with preview: true will modify the preview scene
   */
  startPreview(): void {
    if (this._previewScene) {
      console.warn('Preview already active, discarding previous preview');
    }
    this._previewScene = this._scene.clone();
    this.invalidateNodeMap();
  }

  /**
   * Commit the preview, making it the new main scene
   */
  commitPreview(): void {
    if (this._previewScene) {
      this._scene = this._previewScene;
      this._previewScene = null;
      this.invalidateNodeMap();
    }
  }

  /**
   * Discard the preview, reverting to the main scene
   */
  discardPreview(): void {
    if (this._previewScene) {
      this._previewScene = null;
      this.invalidateNodeMap();
    }
  }

  /**
   * Check if a preview is currently active
   */
  hasPreview(): boolean {
    return this._previewScene !== null;
  }

  /**
   * Get the active scene (preview if active, otherwise main)
   */
  private getActiveScene(): SceneNode {
    return this._previewScene ?? this._scene;
  }

  /**
   * Get the main (committed) scene, ignoring any active preview
   * Useful for getting original state during preview operations
   */
  getMainScene(): SceneNode {
    return this._scene;
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
    this.invalidateNodeMap();
    return assembly;
  }

  // ==========================================================================
  // Node Lookup (with fast map-based lookups)
  // ==========================================================================

  /**
   * Invalidate the node map, forcing rebuild on next lookup
   * Called when tree structure changes
   */
  private invalidateNodeMap(): void {
    this._nodeMap = null;
  }

  /**
   * Build the node map by traversing the entire tree
   * Uses the active scene (preview if active)
   */
  private buildNodeMap(): Map<string, BaseNode> {
    const map = new Map<string, BaseNode>();

    const addNodeToMap = (node: BaseNode): void => {
      map.set(node.id, node);
      for (const child of node.children) {
        addNodeToMap(child);
      }
    };

    addNodeToMap(this.getActiveScene());
    return map;
  }

  /**
   * Get the node map, building it if necessary
   */
  private getNodeMap(): Map<string, BaseNode> {
    if (!this._nodeMap) {
      this._nodeMap = this.buildNodeMap();
    }
    return this._nodeMap;
  }

  /**
   * Find any node by ID (O(1) lookup using map)
   */
  findById(id: string): BaseNode | null {
    return this.getNodeMap().get(id) ?? null;
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
   * Returns preview scene if active, otherwise main scene
   */
  getSnapshot(): SceneSnapshot {
    const scene = this.getActiveScene();
    // Recompute any dirty nodes first
    if (scene.isDirty) {
      scene.recompute();
      scene.clearDirty();
    }
    return scene.serialize();
  }

  /**
   * Get the panel collection for rendering and export (engine types)
   * Returns preview scene panels if active
   */
  getPanelCollection(): PanelCollectionSnapshot {
    const scene = this.getActiveScene();
    // Ensure scene is up to date
    if (scene.isDirty) {
      scene.recompute();
      scene.clearDirty();
    }
    return scene.collectPanels();
  }

  /**
   * Generate panels using engine nodes directly (engine-first approach)
   * Panels are computed by engine nodes with finger joints and edge extensions.
   * Returns preview panels if preview is active
   */
  generatePanelsFromNodes(): PanelCollection {
    const scene = this.getActiveScene();
    // Ensure scene is up to date
    if (scene.isDirty) {
      scene.recompute();
      scene.clearDirty();
    }

    const assembly = scene.primaryAssembly;
    if (!assembly) {
      return { panels: [], augmentations: [], generatedAt: Date.now() };
    }

    return generatePanelsFromEngine(assembly);
  }

  // ==========================================================================
  // Action Dispatch
  // ==========================================================================

  /**
   * Process an action to update the model
   * Returns true if the action was handled
   *
   * @param action - The action to dispatch
   * @param options - Optional dispatch options
   *   - preview: If true and a preview is active, only modifies the preview scene
   */
  dispatch(action: EngineAction, options?: { preview?: boolean }): boolean {
    // Determine which scene to operate on
    // If preview option is set and we have a preview, use preview scene
    // Otherwise, use the active scene (which returns preview if active anyway)
    const usePreview = options?.preview && this._previewScene;
    const targetScene = usePreview ? this._previewScene! : this._scene;

    // Find assembly in the target scene
    const findInScene = (id: string): BaseNode | null => {
      const findById = (node: BaseNode): BaseNode | null => {
        if (node.id === id) return node;
        for (const child of node.children) {
          const found = findById(child);
          if (found) return found;
        }
        return null;
      };
      return findById(targetScene);
    };

    const assemblyNode = findInScene(action.targetId);
    const assembly = assemblyNode instanceof BaseAssembly ? assemblyNode : null;

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
        const voidNodeRaw = findInScene(action.payload.voidId);
        const voidNode = voidNodeRaw instanceof VoidNode ? voidNodeRaw : null;
        if (voidNode && assembly) {
          voidNode.subdivide(
            action.payload.axis,
            action.payload.position,
            assembly.material.thickness
          );
          this.invalidateNodeMap(); // Tree structure changed
          return true;
        }
        break;
      }

      case 'ADD_SUBDIVISIONS': {
        const voidNodeRaw = findInScene(action.payload.voidId);
        const voidNode = voidNodeRaw instanceof VoidNode ? voidNodeRaw : null;
        if (voidNode && assembly) {
          voidNode.subdivideMultiple(
            action.payload.axis,
            action.payload.positions,
            assembly.material.thickness
          );
          this.invalidateNodeMap(); // Tree structure changed
          return true;
        }
        break;
      }

      case 'REMOVE_SUBDIVISION': {
        const voidNodeRaw = findInScene(action.payload.voidId);
        const voidNode = voidNodeRaw instanceof VoidNode ? voidNodeRaw : null;
        if (voidNode) {
          voidNode.clearSubdivision();
          this.invalidateNodeMap(); // Tree structure changed
          return true;
        }
        break;
      }

      case 'SET_EDGE_EXTENSION': {
        // Edge extensions are stored at the assembly level
        if (assembly) {
          assembly.setPanelEdgeExtension(
            action.payload.panelId,
            action.payload.edge,
            action.payload.value
          );
          return true;
        }
        break;
      }

      case 'CREATE_SUB_ASSEMBLY': {
        const voidNodeRaw = findInScene(action.payload.voidId);
        const voidNode = voidNodeRaw instanceof VoidNode ? voidNodeRaw : null;
        if (voidNode && assembly) {
          // Can only create sub-assembly in a leaf void
          if (!voidNode.isLeaf) {
            console.warn('Cannot create sub-assembly in a subdivided void');
            return false;
          }
          if (voidNode.hasSubAssembly) {
            console.warn('Void already has a sub-assembly');
            return false;
          }

          // Create sub-assembly with same material as parent assembly
          const clearance = action.payload.clearance ?? 1;
          const subAssembly = new SubAssemblyNode(
            voidNode,
            assembly.material,
            clearance
          );

          // Add to void
          voidNode.addChild(subAssembly);
          this.invalidateNodeMap();
          return true;
        }
        break;
      }

      case 'REMOVE_SUB_ASSEMBLY': {
        const subAssembly = findInScene(action.payload.subAssemblyId);
        if (subAssembly && subAssembly.kind === 'sub-assembly' && subAssembly.parent) {
          subAssembly.parent.removeChild(subAssembly);
          this.invalidateNodeMap();
          return true;
        }
        break;
      }
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
