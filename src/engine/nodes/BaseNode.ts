/**
 * BaseNode - Abstract base class for all nodes in the engine
 *
 * Provides:
 * - Unique ID management
 * - Parent/child relationship management
 * - Dirty tracking for efficient updates
 * - Abstract serialization interface
 */

import { NodeKind, BaseSnapshot } from '../types';

let nextId = 1;

export function generateId(): string {
  return `node-${nextId++}`;
}

export function resetIdCounter(): void {
  nextId = 1;
}

export abstract class BaseNode {
  readonly id: string;
  abstract readonly kind: NodeKind;

  protected _parent: BaseNode | null = null;
  protected _children: BaseNode[] = [];
  protected _dirty: boolean = true;

  constructor(id?: string) {
    this.id = id ?? generateId();
  }

  // ==========================================================================
  // Parent/Child Management
  // ==========================================================================

  get parent(): BaseNode | null {
    return this._parent;
  }

  get children(): readonly BaseNode[] {
    return this._children;
  }

  /**
   * Add a child node. Sets the child's parent reference.
   */
  addChild(child: BaseNode): void {
    if (child._parent === this) return;

    // Remove from previous parent
    if (child._parent) {
      child._parent.removeChild(child);
    }

    child._parent = this;
    this._children.push(child);
    this.markDirty();
  }

  /**
   * Remove a child node. Clears the child's parent reference.
   */
  removeChild(child: BaseNode): void {
    const index = this._children.indexOf(child);
    if (index === -1) return;

    this._children.splice(index, 1);
    child._parent = null;
    this.markDirty();
  }

  /**
   * Remove all children
   */
  clearChildren(): void {
    for (const child of this._children) {
      child._parent = null;
    }
    this._children = [];
    this.markDirty();
  }

  /**
   * Find a descendant node by ID
   */
  findById(id: string): BaseNode | null {
    if (this.id === id) return this;

    for (const child of this._children) {
      const found = child.findById(id);
      if (found) return found;
    }

    return null;
  }

  /**
   * Get all descendant nodes (depth-first)
   */
  getAllDescendants(): BaseNode[] {
    const result: BaseNode[] = [];
    for (const child of this._children) {
      result.push(child);
      result.push(...child.getAllDescendants());
    }
    return result;
  }

  /**
   * Get the root node of this tree
   */
  getRoot(): BaseNode {
    let node: BaseNode = this;
    while (node._parent) {
      node = node._parent;
    }
    return node;
  }

  /**
   * Get the path from root to this node (array of IDs)
   */
  getPath(): string[] {
    const path: string[] = [];
    let node: BaseNode | null = this;
    while (node) {
      path.unshift(node.id);
      node = node._parent;
    }
    return path;
  }

  // ==========================================================================
  // Dirty Tracking
  // ==========================================================================

  get isDirty(): boolean {
    return this._dirty;
  }

  /**
   * Mark this node and all ancestors as dirty
   */
  markDirty(): void {
    this._dirty = true;
    if (this._parent) {
      this._parent.markDirty();
    }
  }

  /**
   * Clear dirty flag after recomputation
   */
  clearDirty(): void {
    this._dirty = false;
  }

  /**
   * Check if any descendant is dirty
   */
  hasAnyDirtyDescendant(): boolean {
    if (this._dirty) return true;
    for (const child of this._children) {
      if (child.hasAnyDirtyDescendant()) return true;
    }
    return false;
  }

  // ==========================================================================
  // Serialization (Abstract)
  // ==========================================================================

  /**
   * Serialize this node to a plain snapshot object.
   * Must be implemented by subclasses.
   */
  abstract serialize(): BaseSnapshot;

  /**
   * Recompute derived values.
   * Called before serialization when dirty.
   */
  abstract recompute(): void;

  /**
   * Create a deep clone of this node and all descendants.
   * Must be implemented by subclasses.
   * The clone has no parent reference - it's a new tree root.
   */
  abstract clone(): BaseNode;

  /**
   * Serialize with automatic recomputation if dirty
   */
  serializeWithRecompute(): BaseSnapshot {
    if (this._dirty) {
      this.recompute();
      this._dirty = false;
    }
    return this.serialize();
  }
}
