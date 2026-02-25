/**
 * InteractionManager - Core module owning all pointer event interpretation in the 3D view.
 *
 * Responsibilities:
 * - Define the types for interaction targets, modes, and actions
 * - Provide a pure routing function (resolveAction) that maps pointer context to actions
 * - Provide raycasting helpers to find InteractionTarget from hit meshes
 * - Provide pure math functions for drag-along-axis projection
 * - Track drag state (isDragging, activeDrag, cameraEnabled)
 *
 * The routing function is pure — no side effects, no store access.
 * Side effects (store updates, engine dispatch) are handled by callers.
 */

import * as THREE from 'three';

// ============================================================================
// Types
// ============================================================================

/**
 * What a mesh can be — set via userData.interactionTarget on the THREE.Object3D.
 * Walk up the parent chain to find the nearest ancestor with this set.
 */
export type InteractionTarget =
  | { type: 'panel'; panelId: string }
  | { type: 'void'; voidId: string }
  | { type: 'edge'; panelId: string; edge: string; locked: boolean }
  | { type: 'corner'; panelId: string; cornerId: string }
  | {
      type: 'gizmo';
      gizmoId: string;
      axis: THREE.Vector3;
      /** World-space position of the gizmo centre — used to set up the drag projection plane */
      worldPos?: THREE.Vector3;
      onDelta: (d: number) => void;
      onDragStart: () => void;
      onDragEnd: () => void;
    }
  | { type: 'assembly'; assemblyId: string };

/**
 * Current interaction mode — derived from activeTool + operationState.
 * 'select' mode targets a specific entity type; 'operate' mode is during an active operation.
 */
export type InteractionMode =
  | { type: 'select'; target: 'panel' | 'void' | 'edge' | 'corner' }
  | { type: 'operate'; operation: string }
  | { type: 'idle' };

/**
 * What the manager decides to do with a pointer event.
 * Returned by resolveAction and consumed by callers to update store/engine.
 */
export type InteractionAction =
  | { type: 'select-panel'; panelId: string; additive: boolean }
  | { type: 'select-void'; voidId: string; additive: boolean }
  | { type: 'select-edge'; panelId: string; edge: string; additive: boolean }
  | { type: 'select-corner'; panelId: string; cornerId: string; additive: boolean }
  | { type: 'select-assembly'; assemblyId: string }
  | { type: 'start-drag'; gizmoId: string; axis: THREE.Vector3; startPos: THREE.Vector2 }
  | { type: 'continue-drag'; delta: number }
  | { type: 'end-drag' }
  | { type: 'clear-selection' }
  | { type: 'cancel-operation' }
  | { type: 'camera' } // let OrbitControls handle it
  | { type: 'noop' };

/**
 * All the context needed to resolve what action should happen.
 */
export interface PointerContext {
  /** Current interaction mode */
  mode: InteractionMode;
  /** Raycast hit target (or null for background) */
  hit: InteractionTarget | null;
  /** Whether a drag is currently in progress */
  isDragging: boolean;
  /** Whether shift key is held (additive selection) */
  shiftKey: boolean;
  /** Pointer position in NDC (-1..1) */
  pointerPos: THREE.Vector2;
  /** True if this is a double-click event */
  isDoubleClick?: boolean;
}

// ============================================================================
// Routing Table (pure function)
// ============================================================================

/**
 * Resolve an interaction action from the current pointer context.
 *
 * This is a pure function — no side effects, no store access.
 *
 * Priority-ordered rules:
 *  1. If dragging → continue-drag (or end-drag on pointerUp — handled by caller)
 *  2. If hit gizmo during operation → start-drag
 *  3. If hit panel/void/edge/corner during operation → noop (DON'T re-select)
 *  4. If hit nothing during operation → noop (don't cancel — user might miss gizmo)
 *  5. If hit panel during panel-select → select-panel
 *  6. If hit void during void-select → select-void
 *  7. If hit edge during edge-select → select-edge (unless locked)
 *  8. If hit corner during corner-select → select-corner
 *  9. If double-click panel → select-assembly
 * 10. If hit nothing during select → clear-selection
 * 11. Fallthrough → camera
 */
export function resolveAction(context: PointerContext): InteractionAction {
  const { mode, hit, isDragging, shiftKey, isDoubleClick = false } = context;

  // Rule 1: Active drag takes highest priority
  if (isDragging) {
    return { type: 'continue-drag', delta: 0 };
  }

  // Rules 2-4: During an active operation
  if (mode.type === 'operate') {
    if (hit?.type === 'gizmo') {
      // Rule 2: Hit gizmo during operation → start drag
      return {
        type: 'start-drag',
        gizmoId: hit.gizmoId,
        axis: hit.axis,
        startPos: context.pointerPos,
      };
    }
    // Rules 3-4: Hit anything else (or nothing) during operation → noop
    // Don't cancel because user might miss the gizmo accidentally
    return { type: 'noop' };
  }

  // Rules 5-10: During select mode
  if (mode.type === 'select') {
    // Rule 9: Double-click on panel → select-assembly
    // Check before other rules because double-click is a special gesture
    if (isDoubleClick && hit?.type === 'panel') {
      // Use panelId as assemblyId lookup key — consumer resolves via getAssemblyIdForPanel
      return { type: 'select-assembly', assemblyId: hit.panelId };
    }

    // Rule 10: Hit nothing → clear selection
    if (!hit) {
      return { type: 'clear-selection' };
    }

    switch (mode.target) {
      case 'panel':
        // Rule 5: Hit panel during panel-select
        if (hit.type === 'panel') {
          return { type: 'select-panel', panelId: hit.panelId, additive: shiftKey };
        }
        break;

      case 'void':
        // Rule 6: Hit void during void-select
        if (hit.type === 'void') {
          return { type: 'select-void', voidId: hit.voidId, additive: shiftKey };
        }
        break;

      case 'edge':
        // Rule 7: Hit edge during edge-select
        if (hit.type === 'edge') {
          if (hit.locked) {
            // Locked edges cannot be selected
            return { type: 'noop' };
          }
          return {
            type: 'select-edge',
            panelId: hit.panelId,
            edge: hit.edge,
            additive: shiftKey,
          };
        }
        break;

      case 'corner':
        // Rule 8: Hit corner during corner-select
        if (hit.type === 'corner') {
          return {
            type: 'select-corner',
            panelId: hit.panelId,
            cornerId: hit.cornerId,
            additive: shiftKey,
          };
        }
        break;
    }

    // Hit something of wrong type during select mode → fall through to camera
  }

  // Rule 11: Fallthrough → let camera (OrbitControls) handle it
  return { type: 'camera' };
}

// ============================================================================
// Drag Math (pure functions, extracted from AxisGizmo.tsx)
// ============================================================================

/**
 * Project a world-space delta vector onto an axis and convert to mm.
 *
 * This is the core math used during drag. The dot product gives the signed
 * projection of the delta onto the axis direction, and dividing by scale
 * converts from world units to millimeters.
 *
 * @param worldDelta - World-space displacement vector (current - start position)
 * @param axis - Unit vector defining the constrained axis (should be normalised)
 * @param scale - World units per mm (from the scene scale factor)
 * @returns Displacement in mm along the axis (positive = same direction as axis)
 */
export function projectDeltaToAxis(
  worldDelta: THREE.Vector3,
  axis: THREE.Vector3,
  scale: number,
): number {
  const worldDisplacement = worldDelta.dot(axis);
  return worldDisplacement / scale;
}

/**
 * Unproject a normalised device coordinate (NDC) pointer position to a
 * world-space point on a plane perpendicular to the camera, passing through
 * a given origin point.
 *
 * This is the first step of drag projection: pointer → world space.
 *
 * @param pointerNDC - Pointer in NDC space (-1..1 on each axis)
 * @param planeOrigin - World-space point the plane passes through (e.g. gizmo position)
 * @param camera - The scene camera
 * @returns World-space intersection point, or null if ray is parallel to plane
 */
export function unprojectPointerToPlane(
  pointerNDC: THREE.Vector2,
  planeOrigin: THREE.Vector3,
  camera: THREE.Camera,
): THREE.Vector3 | null {
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointerNDC, camera);

  // Plane perpendicular to camera view direction, through the origin point
  const planeNormal = camera.getWorldDirection(new THREE.Vector3());
  const plane = new THREE.Plane();
  plane.setFromNormalAndCoplanarPoint(planeNormal, planeOrigin);

  const intersection = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(plane, intersection)) {
    return intersection;
  }
  return null;
}

/**
 * Project a pointer position to a displacement in mm along a constrained axis.
 *
 * Combines pointer-to-world unprojection with axis projection. This is the
 * full computation done each frame during a drag:
 *   pointer NDC → world pos → delta from drag start → project onto axis → mm
 *
 * @param pointerNDC - Current pointer in NDC space
 * @param gizmoWorldPos - Gizmo world position (used to set up projection plane)
 * @param dragStartWorldPos - World position recorded at drag start
 * @param axis - Constrained drag axis (unit vector)
 * @param camera - Scene camera
 * @param scale - World units per mm
 * @returns Displacement in mm from drag start, or 0 if projection fails
 */
export function projectPointerToAxisDelta(
  pointerNDC: THREE.Vector2,
  gizmoWorldPos: THREE.Vector3,
  dragStartWorldPos: THREE.Vector3,
  axis: THREE.Vector3,
  camera: THREE.Camera,
  scale: number,
): number {
  const currentWorldPos = unprojectPointerToPlane(pointerNDC, gizmoWorldPos, camera);
  if (!currentWorldPos) return 0;

  const delta = currentWorldPos.clone().sub(dragStartWorldPos);
  return projectDeltaToAxis(delta, axis, scale);
}

// ============================================================================
// Raycasting
// ============================================================================

/**
 * Walk up an object's parent chain to find the nearest ancestor with
 * userData.interactionTarget set.
 *
 * @param object - Starting THREE.Object3D
 * @returns The first InteractionTarget found walking upward, or null
 */
function findInteractionTarget(object: THREE.Object3D): InteractionTarget | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    const target = current.userData?.interactionTarget as InteractionTarget | undefined;
    if (target) return target;
    current = current.parent;
  }
  return null;
}

/**
 * Raycast into a scene and return the first InteractionTarget hit.
 *
 * For each intersection, walks up the parent chain to find the nearest
 * ancestor with userData.interactionTarget. Returns the first one found,
 * or null if no targetable object was hit.
 *
 * @param pointerNDC - Pointer in NDC space (-1..1)
 * @param camera - Scene camera
 * @param scene - Root object to raycast against
 * @returns First InteractionTarget hit, or null
 */
export function raycastScene(
  pointerNDC: THREE.Vector2,
  camera: THREE.Camera,
  scene: THREE.Object3D,
): InteractionTarget | null {
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointerNDC, camera);

  const intersections = raycaster.intersectObject(scene, true);

  for (const intersection of intersections) {
    const target = findInteractionTarget(intersection.object);
    if (target) return target;
  }

  return null;
}

// ============================================================================
// InteractionManager (stateful class)
// ============================================================================

export interface ActiveDrag {
  gizmoId: string;
  axis: THREE.Vector3;
  startWorldPos: THREE.Vector3;
  /** Gizmo world position for setting up the drag projection plane on subsequent frames */
  gizmoWorldPos: THREE.Vector3;
  callbacks: {
    onDelta: (d: number) => void;
    onDragStart: () => void;
    onDragEnd: () => void;
  };
}

/**
 * Stateful interaction manager that tracks drag state and camera lock.
 *
 * Callers use resolveAction() to determine what should happen, then call
 * the appropriate methods on this class to update state.
 */
export class InteractionManager {
  isDragging: boolean = false;
  activeDrag: ActiveDrag | null = null;
  /** True when no interaction is consuming pointer events (camera can move) */
  cameraEnabled: boolean = true;

  /**
   * Start a drag operation on a gizmo.
   *
   * @param gizmoId - Unique identifier for the gizmo being dragged
   * @param axis - Unit vector defining the constrained drag axis
   * @param startWorldPos - World-space pointer position at drag start (on the projection plane)
   * @param callbacks - Drag lifecycle callbacks
   * @param gizmoWorldPos - World-space centre of the gizmo (used for projection plane on subsequent frames).
   *                        Defaults to startWorldPos if not provided.
   */
  startDrag(
    gizmoId: string,
    axis: THREE.Vector3,
    startWorldPos: THREE.Vector3,
    callbacks: ActiveDrag['callbacks'],
    gizmoWorldPos?: THREE.Vector3,
  ): void {
    this.isDragging = true;
    this.cameraEnabled = false;
    this.activeDrag = {
      gizmoId,
      axis,
      startWorldPos,
      gizmoWorldPos: gizmoWorldPos ?? startWorldPos.clone(),
      callbacks,
    };
    callbacks.onDragStart();
  }

  /**
   * Continue an active drag with a new pointer position.
   * Computes the delta from drag start and calls onDelta.
   *
   * @param currentWorldPos - Current pointer world position (from unprojectPointerToPlane)
   * @param scale - World units per mm
   */
  continueDrag(currentWorldPos: THREE.Vector3, scale: number): void {
    if (!this.isDragging || !this.activeDrag) return;

    const delta = currentWorldPos.clone().sub(this.activeDrag.startWorldPos);
    const deltaMm = projectDeltaToAxis(delta, this.activeDrag.axis, scale);
    this.activeDrag.callbacks.onDelta(deltaMm);
  }

  /**
   * End the current drag operation.
   */
  endDrag(): void {
    if (!this.isDragging || !this.activeDrag) return;

    this.activeDrag.callbacks.onDragEnd();
    this.isDragging = false;
    this.activeDrag = null;
    this.cameraEnabled = true;
  }

  /**
   * Reset all state (e.g. when operation is cancelled).
   */
  reset(): void {
    if (this.isDragging && this.activeDrag) {
      this.activeDrag.callbacks.onDragEnd();
    }
    this.isDragging = false;
    this.activeDrag = null;
    this.cameraEnabled = true;
  }
}
