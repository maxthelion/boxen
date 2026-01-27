/**
 * Engine Types - Snapshot interfaces for serialization
 *
 * These are plain data types that React will render.
 * No methods, no class instances - only serializable data.
 */

// =============================================================================
// Core Types
// =============================================================================

export type NodeKind =
  | 'scene'
  | 'assembly'
  | 'sub-assembly'
  | 'void'
  | 'face-panel'
  | 'divider-panel';

export type Axis = 'x' | 'y' | 'z';

export type FaceId = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

export type EdgePosition = 'top' | 'bottom' | 'left' | 'right';

// =============================================================================
// Geometry Types
// =============================================================================

export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface Bounds3D {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
}

export interface Transform3D {
  position: [number, number, number];
  rotation: [number, number, number];
}

export interface EdgeExtensions {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

// =============================================================================
// Configuration Types (Input Properties)
// =============================================================================

export interface MaterialConfig {
  thickness: number;
  fingerWidth: number;
  fingerGap: number;
}

export interface LidConfig {
  tabDirection: 'tabs-in' | 'tabs-out';
  inset: number;
}

export interface AssemblyConfig {
  assemblyAxis: Axis;
  lids: {
    positive: LidConfig;
    negative: LidConfig;
  };
}

export interface FeetConfig {
  enabled: boolean;
  height: number;
  inset: number;
  gap: number;
}

export interface FaceConfig {
  id: FaceId;
  solid: boolean;
}

// =============================================================================
// Panel Types
// =============================================================================

export interface PanelEdge {
  position: EdgePosition;
  hasTabs: boolean;
  meetsFaceId: FaceId | null;
  meetsDividerId: string | null;
}

export interface PanelHole {
  id: string;
  path: Point2D[];
  source: {
    type: 'divider-slot' | 'sub-assembly-slot' | 'custom';
    sourceId?: string;
  };
}

export interface PanelOutline {
  points: Point2D[];
  holes: PanelHole[];
}

// =============================================================================
// Snapshot Types - What React renders
// =============================================================================

/**
 * Base snapshot interface - all nodes serialize to this shape
 */
export interface BaseSnapshot {
  id: string;
  kind: NodeKind;
  children: BaseSnapshot[];
}

/**
 * Scene snapshot - root of the tree
 */
export interface SceneSnapshot extends BaseSnapshot {
  kind: 'scene';
  children: AssemblySnapshot[];
}

/**
 * Assembly snapshot - a box with faces and interior voids
 * Used for both main assembly and sub-assemblies
 */
export interface AssemblySnapshot extends BaseSnapshot {
  kind: 'assembly' | 'sub-assembly';

  // Input properties
  props: {
    width: number;
    height: number;
    depth: number;
    material: MaterialConfig;
    assembly: AssemblyConfig;
    faces: FaceConfig[];
    feet?: FeetConfig;
    // Sub-assembly specific
    clearance?: number;
    parentVoidId?: string;
  };

  // Derived properties
  derived: {
    worldTransform: Transform3D;
    interiorBounds: Bounds3D;
    // Panels are derived from the assembly configuration
    panels: PanelSnapshot[];
  };

  // Children are voids (interior spaces)
  children: VoidSnapshot[];
}

/**
 * Void snapshot - interior space that can be subdivided or contain sub-assembly
 */
export interface VoidSnapshot extends BaseSnapshot {
  kind: 'void';

  props: {
    // If this void was created by subdivision
    splitAxis?: Axis;
    splitPosition?: number;
    splitPositionMode?: 'absolute' | 'percentage';
    splitPercentage?: number;
  };

  derived: {
    bounds: Bounds3D;
    isLeaf: boolean;
  };

  // Children are either more voids (subdivisions) or a sub-assembly
  children: (VoidSnapshot | AssemblySnapshot)[];
}

/**
 * Base panel snapshot - shared between face and divider panels
 * Panels are leaf nodes (no children)
 */
export interface BasePanelSnapshot extends BaseSnapshot {
  // Input properties
  props: {
    edgeExtensions: EdgeExtensions;
    visible: boolean;
  };
  // Panels never have children
  children: [];

  // Derived properties - computed from assembly/void state
  derived: {
    // 2D geometry
    width: number;
    height: number;
    thickness: number;
    outline: PanelOutline;
    edges: PanelEdge[];

    // 3D placement
    worldTransform: Transform3D;
  };
}

/**
 * Face panel snapshot
 */
export interface FacePanelSnapshot extends BasePanelSnapshot {
  kind: 'face-panel';
  props: BasePanelSnapshot['props'] & {
    faceId: FaceId;
  };
}

/**
 * Divider panel snapshot
 */
export interface DividerPanelSnapshot extends BasePanelSnapshot {
  kind: 'divider-panel';
  props: BasePanelSnapshot['props'] & {
    axis: Axis;
    position: number;
    voidId: string;
  };
}

export type PanelSnapshot = FacePanelSnapshot | DividerPanelSnapshot;

// =============================================================================
// Panel Collection - Derived from all panels in the scene
// =============================================================================

/**
 * Flat collection of all panels for rendering/export
 * This is a derived view computed from the scene tree
 */
export interface PanelCollectionSnapshot {
  panels: PanelSnapshot[];
  // Global finger alignment data
  fingerData: {
    xPoints: number[];
    yPoints: number[];
    zPoints: number[];
  };
}

// =============================================================================
// Action Types - UI → Engine commands
// =============================================================================

export type EngineAction =
  | { type: 'SET_DIMENSIONS'; targetId: string; payload: { width?: number; height?: number; depth?: number } }
  | { type: 'SET_MATERIAL'; targetId: string; payload: Partial<MaterialConfig> }
  | { type: 'SET_FACE_SOLID'; targetId: string; payload: { faceId: FaceId; solid: boolean } }
  | { type: 'TOGGLE_FACE'; targetId: string; payload: { faceId: FaceId } }
  | { type: 'ADD_SUBDIVISION'; targetId: string; payload: { voidId: string; axis: Axis; position: number } }
  | { type: 'REMOVE_SUBDIVISION'; targetId: string; payload: { voidId: string } }
  | { type: 'SET_EDGE_EXTENSION'; targetId: string; payload: { panelId: string; edge: EdgePosition; value: number } }
  | { type: 'CREATE_SUB_ASSEMBLY'; targetId: string; payload: { voidId: string; clearance?: number } }
  | { type: 'REMOVE_SUB_ASSEMBLY'; targetId: string; payload: { subAssemblyId: string } }
  | { type: 'SET_LID_CONFIG'; targetId: string; payload: { side: 'positive' | 'negative'; config: Partial<LidConfig> } }
  | { type: 'SET_ASSEMBLY_AXIS'; targetId: string; payload: { axis: Axis } }
  | { type: 'SET_FEET_CONFIG'; targetId: string; payload: FeetConfig | null };
