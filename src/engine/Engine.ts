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
  Axis,
  FaceId,
  MaterialConfig,
  SceneSnapshot,
  PanelCollectionSnapshot,
  EngineAction,
} from './types';
import { PanelCollection } from '../types';
import { generatePanelsFromEngine } from './panelBridge';
import { appendDebug } from '../utils/debug';
import {
  unionPolygons,
  differencePolygons,
} from '../utils/polygonBoolean';

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
    const stack = new Error().stack?.split('\n').slice(2, 5).map(s => s.trim()).join('\n    ') || '';
    appendDebug(`[${new Date().toISOString()}] startPreview (existing: ${!!this._previewScene})\n    ${stack}`);
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
    const stack = new Error().stack?.split('\n').slice(2, 5).map(s => s.trim()).join('\n    ') || '';
    appendDebug(`[${new Date().toISOString()}] commitPreview (has: ${!!this._previewScene})\n    ${stack}`);
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
    const stack = new Error().stack?.split('\n').slice(2, 5).map(s => s.trim()).join('\n    ') || '';
    appendDebug(`[${new Date().toISOString()}] discardPreview (has: ${!!this._previewScene})\n    ${stack}`);
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
   * Clear all assemblies from the active scene (preview if active, otherwise main)
   * Used when instantiating templates to ensure a clean slate
   */
  clearScene(): void {
    const targetScene = this.getActiveScene();
    for (const assembly of targetScene.assemblies) {
      targetScene.removeAssembly(assembly);
    }
    this.invalidateNodeMap();
  }

  /**
   * Create a new main assembly and add it to the active scene
   * When in preview mode, adds to the preview scene
   */
  createAssembly(
    width: number,
    height: number,
    depth: number,
    material: MaterialConfig
  ): AssemblyNode {
    const assembly = new AssemblyNode(width, height, depth, material);
    const targetScene = this.getActiveScene();
    targetScene.addAssembly(assembly);
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
  // Grid Divider Movement
  // ==========================================================================

  /**
   * Move a grid divider to a new position
   * Updates the gridSubdivision.positions array and recalculates child void bounds
   *
   * @param voidNode - The void with gridSubdivision
   * @param axis - The axis of the divider being moved
   * @param positionIndex - Index in the positions array
   * @param newPosition - New absolute position
   * @param materialThickness - Material thickness for bounds calculation
   * @returns true if successful
   */
  private moveGridDivider(
    voidNode: VoidNode,
    axis: Axis,
    positionIndex: number,
    newPosition: number,
    materialThickness: number
  ): boolean {
    const gridSub = voidNode.gridSubdivision;
    if (!gridSub) return false;

    const positions = gridSub.positions[axis];
    if (!positions || positionIndex < 0 || positionIndex >= positions.length) return false;

    const bounds = voidNode.bounds;

    // Get axis-specific bounds values
    const dimStart = axis === 'x' ? bounds.x : axis === 'y' ? bounds.y : bounds.z;
    const dimSize = axis === 'x' ? bounds.w : axis === 'y' ? bounds.h : bounds.d;
    const dimEnd = dimStart + dimSize;

    // Calculate valid range for new position
    const prevPosition = positionIndex > 0 ? positions[positionIndex - 1] : null;
    const nextPosition = positionIndex < positions.length - 1 ? positions[positionIndex + 1] : null;

    const minPosition = prevPosition !== null ? prevPosition + materialThickness : dimStart + materialThickness;
    const maxPosition = nextPosition !== null ? nextPosition - materialThickness : dimEnd - materialThickness;

    // Validate new position
    if (newPosition < minPosition || newPosition > maxPosition) {
      return false;
    }

    // Update the position in the array
    positions[positionIndex] = newPosition;

    // Recalculate all child void bounds
    // Grid cells are created as Cartesian product of all axis regions
    // Need to recalculate bounds for all cells affected by this position change
    this.recalculateGridCellBounds(voidNode, materialThickness);

    voidNode.markDirty();
    return true;
  }

  /**
   * Recalculate bounds for all grid cell children after a position change
   */
  private recalculateGridCellBounds(voidNode: VoidNode, materialThickness: number): void {
    const gridSub = voidNode.gridSubdivision;
    if (!gridSub || gridSub.axes.length !== 2) return;

    const bounds = voidNode.bounds;
    const halfMt = materialThickness / 2;

    const axis1 = gridSub.axes[0];
    const axis2 = gridSub.axes[1];
    const positions1 = gridSub.positions[axis1] || [];
    const positions2 = gridSub.positions[axis2] || [];

    // Helper to get axis-specific values
    const getAxisBounds = (axis: Axis) => {
      switch (axis) {
        case 'x': return { start: bounds.x, size: bounds.w };
        case 'y': return { start: bounds.y, size: bounds.h };
        case 'z': return { start: bounds.z, size: bounds.d };
      }
    };

    // Calculate regions for each axis
    const calcRegions = (positions: number[], axis: Axis) => {
      const { start: dimStart, size: dimSize } = getAxisBounds(axis);
      const dimEnd = dimStart + dimSize;
      const regions: { start: number; end: number }[] = [];

      for (let i = 0; i <= positions.length; i++) {
        const regionStart = i === 0 ? dimStart : positions[i - 1] + halfMt;
        const regionEnd = i === positions.length ? dimEnd : positions[i] - halfMt;
        regions.push({ start: regionStart, end: regionEnd });
      }
      return regions;
    };

    const regions1 = calcRegions(positions1, axis1);
    const regions2 = calcRegions(positions2, axis2);

    // Get void children
    const children = voidNode.getVoidChildren();

    // Children are arranged in order: for each region1, iterate all region2
    let childIndex = 0;
    for (let i = 0; i < regions1.length; i++) {
      for (let j = 0; j < regions2.length; j++) {
        if (childIndex >= children.length) break;

        const r1 = regions1[i];
        const r2 = regions2[j];
        const child = children[childIndex];

        // Build new bounds
        const newBounds = { ...bounds };

        // Set axis1 bounds
        switch (axis1) {
          case 'x':
            newBounds.x = r1.start;
            newBounds.w = r1.end - r1.start;
            break;
          case 'y':
            newBounds.y = r1.start;
            newBounds.h = r1.end - r1.start;
            break;
          case 'z':
            newBounds.z = r1.start;
            newBounds.d = r1.end - r1.start;
            break;
        }

        // Set axis2 bounds
        switch (axis2) {
          case 'x':
            newBounds.x = r2.start;
            newBounds.w = r2.end - r2.start;
            break;
          case 'y':
            newBounds.y = r2.start;
            newBounds.h = r2.end - r2.start;
            break;
          case 'z':
            newBounds.z = r2.start;
            newBounds.d = r2.end - r2.start;
            break;
        }

        child.setBounds(newBounds);
        childIndex++;
      }
    }
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
    const isPreview = this._previewScene !== null;

    // Debug: Log which scene we're generating from
    appendDebug(`[${new Date().toISOString()}] generatePanelsFromNodes (preview=${isPreview})`);

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
    // By default, use the active scene (preview if active, otherwise main)
    // Use options.preview=false to explicitly target the main scene during preview
    const targetScene =
      options?.preview === false
        ? this._scene
        : this._previewScene ?? this._scene;

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
          // For sub-assemblies with faceId, calculate position offset to anchor opposite face
          if (assembly.kind === 'sub-assembly' && action.payload.faceId) {
            const subAsm = assembly as SubAssemblyNode;
            const faceId = action.payload.faceId as FaceId;

            // Get current dimensions before change
            const oldWidth = subAsm.width;
            const oldHeight = subAsm.height;
            const oldDepth = subAsm.depth;

            // Apply dimension changes
            assembly.setDimensions(action.payload);

            // Calculate dimension deltas
            const deltaW = subAsm.width - oldWidth;
            const deltaH = subAsm.height - oldHeight;
            const deltaD = subAsm.depth - oldDepth;

            // Calculate position offset to anchor the opposite face
            // When pushing right face (+X), shift position +delta/2 to keep left face fixed
            const currentOffset = subAsm.positionOffset;
            const newOffset = { ...currentOffset };

            switch (faceId) {
              case 'right':
                newOffset.x = currentOffset.x + deltaW / 2;
                break;
              case 'left':
                newOffset.x = currentOffset.x - deltaW / 2;
                break;
              case 'top':
                newOffset.y = currentOffset.y + deltaH / 2;
                break;
              case 'bottom':
                newOffset.y = currentOffset.y - deltaH / 2;
                break;
              case 'front':
                newOffset.z = currentOffset.z + deltaD / 2;
                break;
              case 'back':
                newOffset.z = currentOffset.z - deltaD / 2;
                break;
            }

            subAsm.setPositionOffset(newOffset);
          } else {
            assembly.setDimensions(action.payload);
          }
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

      case 'CONFIGURE_FACE':
        if (assembly) {
          const { faceId, solid, lidTabDirection } = action.payload;
          // Set solid state if provided
          if (solid !== undefined) {
            assembly.setFaceSolid(faceId, solid);
          }
          // Set lid tab direction if provided (only applies to lid faces)
          if (lidTabDirection !== undefined) {
            // Determine which lid side this face is on based on assembly axis
            const axis = assembly.assemblyAxis;
            const lidMap: Record<string, { positive: string; negative: string }> = {
              y: { positive: 'top', negative: 'bottom' },
              x: { positive: 'right', negative: 'left' },
              z: { positive: 'front', negative: 'back' },
            };
            const mapping = lidMap[axis];
            let lidSide: 'positive' | 'negative' | null = null;
            if (faceId === mapping.positive) lidSide = 'positive';
            else if (faceId === mapping.negative) lidSide = 'negative';

            if (lidSide) {
              assembly.setLidConfig(lidSide, { tabDirection: lidTabDirection });
            }
          }
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

      case 'CONFIGURE_ASSEMBLY': {
        if (assembly) {
          const { width, height, depth, materialConfig, assemblyAxis, lids, feet } = action.payload;

          // Update dimensions
          if (width !== undefined || height !== undefined || depth !== undefined) {
            assembly.setDimensions({
              width: width ?? assembly.width,
              height: height ?? assembly.height,
              depth: depth ?? assembly.depth,
            });
          }

          // Update material config
          if (materialConfig) {
            assembly.setMaterial(materialConfig);
          }

          // Update assembly axis
          if (assemblyAxis !== undefined) {
            assembly.setAssemblyAxis(assemblyAxis);
          }

          // Update lid configs
          if (lids) {
            if (lids.positive) {
              assembly.setLidConfig('positive', lids.positive);
            }
            if (lids.negative) {
              assembly.setLidConfig('negative', lids.negative);
            }
          }

          // Update feet config
          if (feet !== undefined) {
            assembly.setFeet(feet);
          }

          return true;
        }
        break;
      }

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

      case 'ADD_GRID_SUBDIVISION': {
        const voidNodeRaw = findInScene(action.payload.voidId);
        const voidNode = voidNodeRaw instanceof VoidNode ? voidNodeRaw : null;
        if (voidNode && assembly) {
          voidNode.subdivideGrid(
            action.payload.axes,
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

      case 'SET_GRID_SUBDIVISION': {
        // Atomic operation: clear existing subdivisions and create new ones
        // Used when editing existing subdivisions
        const voidNodeRaw = findInScene(action.payload.voidId);
        const voidNode = voidNodeRaw instanceof VoidNode ? voidNodeRaw : null;
        if (voidNode && assembly) {
          // Clear existing subdivisions (if any)
          voidNode.clearSubdivision();

          // Create new subdivisions with the given configuration
          if (action.payload.axes.length > 0) {
            voidNode.subdivideGrid(
              action.payload.axes,
              assembly.material.thickness
            );
          }

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

      case 'SET_EDGE_EXTENSIONS_BATCH': {
        // Batch edge extensions - atomic operation for undo/redo
        if (assembly) {
          for (const ext of action.payload.extensions) {
            assembly.setPanelEdgeExtension(ext.panelId, ext.edge, ext.value);
          }
          return true;
        }
        break;
      }

      case 'SET_CORNER_FILLET': {
        // Corner fillets are stored at the assembly level
        if (assembly) {
          assembly.setPanelCornerFillet(
            action.payload.panelId,
            action.payload.corner,
            action.payload.radius
          );
          return true;
        }
        break;
      }

      case 'SET_CORNER_FILLETS_BATCH': {
        // Batch corner fillets - atomic operation for undo/redo
        if (assembly) {
          for (const fillet of action.payload.fillets) {
            assembly.setPanelCornerFillet(fillet.panelId, fillet.corner, fillet.radius);
          }
          return true;
        }
        break;
      }

      case 'SET_ALL_CORNER_FILLET': {
        // All-corner fillet for any corner in panel geometry
        if (assembly) {
          assembly.setPanelAllCornerFillet(
            action.payload.panelId,
            action.payload.cornerId,
            action.payload.radius
          );
          return true;
        }
        break;
      }

      case 'SET_ALL_CORNER_FILLETS_BATCH': {
        // Batch all-corner fillets - atomic operation for undo/redo
        if (assembly) {
          for (const fillet of action.payload.fillets) {
            assembly.setPanelAllCornerFillet(fillet.panelId, fillet.cornerId, fillet.radius);
          }
          return true;
        }
        break;
      }

      case 'SET_EDGE_PATH': {
        // Custom edge paths are stored at the assembly level
        if (assembly) {
          assembly.setPanelCustomEdgePath(action.payload.panelId, action.payload.path);
          return true;
        }
        break;
      }

      case 'CLEAR_EDGE_PATH': {
        // Clear a custom edge path
        if (assembly) {
          assembly.clearPanelCustomEdgePath(action.payload.panelId, action.payload.edge);
          return true;
        }
        break;
      }

      case 'ADD_CUTOUT': {
        // Add a cutout to a panel
        if (assembly) {
          assembly.addPanelCutout(action.payload.panelId, action.payload.cutout);
          return true;
        }
        break;
      }

      case 'UPDATE_CUTOUT': {
        // Update an existing cutout
        if (assembly) {
          assembly.updatePanelCutout(
            action.payload.panelId,
            action.payload.cutoutId,
            action.payload.updates
          );
          return true;
        }
        break;
      }

      case 'DELETE_CUTOUT': {
        // Delete a cutout from a panel
        if (assembly) {
          assembly.deletePanelCutout(action.payload.panelId, action.payload.cutoutId);
          return true;
        }
        break;
      }

      case 'APPLY_EDGE_OPERATION': {
        // Apply boolean operation (union/difference) to panel safe area
        if (assembly) {
          const { panelId, operation, shape } = action.payload;
          const success = this.applyEdgeOperation(assembly, panelId, operation, shape);
          return success;
        }
        break;
      }

      case 'CLEAR_MODIFIED_SAFE_AREA': {
        // Clear modified safe area for a panel (revert to default)
        if (assembly) {
          assembly.clearModifiedSafeArea(action.payload.panelId);
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

          // Set assembly axis if provided
          if (action.payload.assemblyAxis) {
            subAssembly.setAssemblyAxis(action.payload.assemblyAxis);
          }

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

      case 'PURGE_VOID': {
        const voidNodeRaw = findInScene(action.payload.voidId);
        const voidNode = voidNodeRaw instanceof VoidNode ? voidNodeRaw : null;
        if (voidNode) {
          // Clear all children and sub-assembly
          voidNode.clearSubdivision();
          this.invalidateNodeMap();
          return true;
        }
        break;
      }

      case 'SET_SUB_ASSEMBLY_CLEARANCE': {
        const subAssemblyNode = findInScene(action.payload.subAssemblyId);
        if (subAssemblyNode instanceof SubAssemblyNode) {
          subAssemblyNode.setClearance(action.payload.clearance);
          return true;
        }
        break;
      }

      case 'TOGGLE_SUB_ASSEMBLY_FACE': {
        const subAssemblyNode = findInScene(action.payload.subAssemblyId);
        if (subAssemblyNode instanceof SubAssemblyNode) {
          subAssemblyNode.toggleFace(action.payload.faceId);
          return true;
        }
        break;
      }

      case 'SET_SUB_ASSEMBLY_AXIS': {
        const subAssemblyNode = findInScene(action.payload.subAssemblyId);
        if (subAssemblyNode instanceof SubAssemblyNode) {
          subAssemblyNode.setAssemblyAxis(action.payload.axis);
          return true;
        }
        break;
      }

      case 'SET_SUB_ASSEMBLY_LID_TAB_DIRECTION': {
        const subAssemblyNode = findInScene(action.payload.subAssemblyId);
        if (subAssemblyNode instanceof SubAssemblyNode) {
          subAssemblyNode.setLidConfig(action.payload.side, {
            tabDirection: action.payload.tabDirection,
          });
          return true;
        }
        break;
      }

      case 'MOVE_SUBDIVISIONS': {
        const { moves } = action.payload;
        let anyMoved = false;

        for (const move of moves) {
          const { subdivisionId, newPosition, isGridDivider, gridPositionIndex, parentVoidId, axis } = move;

          // Handle grid dividers
          if (isGridDivider && parentVoidId !== undefined && gridPositionIndex !== undefined && axis) {
            const voidNode = findInScene(parentVoidId);
            if (voidNode instanceof VoidNode && voidNode.gridSubdivision && assembly) {
              const success = this.moveGridDivider(
                voidNode,
                axis,
                gridPositionIndex,
                newPosition,
                assembly.material.thickness
              );
              if (success) {
                anyMoved = true;
              }
            }
            continue;
          }

          // Regular subdivision handling
          // subdivisionId is the void that has the split info (the one after the divider)
          const voidNode = findInScene(subdivisionId);
          if (voidNode instanceof VoidNode && voidNode.splitPosition !== undefined) {
            // Find the parent void that contains this subdivision
            const parentVoid = voidNode.parent instanceof VoidNode ? voidNode.parent : null;
            if (parentVoid && assembly) {
              const success = parentVoid.moveSubdivision(
                subdivisionId,
                newPosition,
                assembly.material.thickness
              );
              if (success) {
                anyMoved = true;
              }
            }
          }
        }

        if (anyMoved) {
          this.invalidateNodeMap();
          return true;
        }
        break;
      }
    }

    return false;
  }

  // ==========================================================================
  // Boolean Edge Operations
  // ==========================================================================

  /**
   * Apply a boolean operation (union or difference) to modify a panel's outline.
   *
   * APPROACH: Compute boolean against the actual panel outline (with finger joints),
   * then store the result directly. This preserves finger joints in unmodified areas.
   *
   * @param assembly - The assembly containing the panel
   * @param panelId - The panel to modify
   * @param operation - 'union' to add material, 'difference' to remove material
   * @param shape - The polygon shape to apply (in panel coordinates)
   * @returns true if operation was applied successfully
   */
  private applyEdgeOperation(
    assembly: BaseAssembly,
    panelId: string,
    operation: 'union' | 'difference',
    shape: { x: number; y: number }[]
  ): boolean {
    // Find the panel to get its current outline
    const panels = assembly.getPanels();
    const panel = panels.find(p => p.id === panelId);
    if (!panel) {
      console.warn(`Panel ${panelId} not found`);
      return false;
    }

    // Get the current panel outline (WITH finger joints)
    // If there's already a modified outline, use that; otherwise use the derived outline
    let currentOutline = assembly.getModifiedSafeArea(panelId);
    if (!currentOutline) {
      // Use the actual panel outline with finger joints
      currentOutline = panel.derived.outline.points.map(p => ({ x: p.x, y: p.y }));
    }

    // Apply the boolean operation to the current outline
    let resultPolygon: { x: number; y: number }[] | null;

    if (operation === 'union') {
      resultPolygon = unionPolygons(currentOutline, shape);
    } else {
      resultPolygon = differencePolygons(currentOutline, shape);
    }

    if (!resultPolygon || resultPolygon.length < 3) {
      console.warn('Boolean operation resulted in invalid polygon');
      return false;
    }

    // Verify the operation actually changed something
    if (resultPolygon.length === currentOutline.length) {
      // Check if points are actually different
      let anyDifferent = false;
      for (let i = 0; i < resultPolygon.length; i++) {
        const r = resultPolygon[i];
        const c = currentOutline[i];
        if (Math.abs(r.x - c.x) > 0.01 || Math.abs(r.y - c.y) > 0.01) {
          anyDifferent = true;
          break;
        }
      }
      if (!anyDifferent) {
        console.warn('Boolean operation did not change the outline');
        return false;
      }
    }

    // Store the modified outline directly
    // This preserves finger joints in unmodified areas
    assembly.setModifiedSafeArea(panelId, resultPolygon);
    console.log(`Applied ${operation} boolean operation to panel (${resultPolygon.length} points)`);

    return true;
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
