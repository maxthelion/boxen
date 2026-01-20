export interface BoxConfig {
  width: number;
  height: number;
  depth: number;
  materialThickness: number;
  fingerWidth: number;
  fingerGap: number;  // Gap at corners (multiplier of fingerWidth, e.g., 1.5 = 1.5x fingerWidth)
}

export type FaceId = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

export type SelectionMode = 'void' | 'panel' | 'assembly';

export interface Face {
  id: FaceId;
  solid: boolean;
}

export interface Bounds {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
}

// Sub-assembly types (drawer, insert, etc.)
export type SubAssemblyType = 'drawer' | 'insert' | 'tray';

// A sub-assembly is a nested box that fits inside a void
export interface SubAssembly {
  id: string;
  type: SubAssemblyType;
  clearance: number;  // Gap between sub-assembly and parent void (mm)
  faces: Face[];      // Which faces are solid/open
  rootVoid: Void;     // Sub-assembly's internal void structure
  materialThickness: number;
}

// Hierarchical void structure - subdivisions create child voids
export interface Void {
  id: string;
  bounds: Bounds;
  children: Void[];  // Child voids created by subdivision
  subAssembly?: SubAssembly;  // Optional nested sub-assembly (e.g., drawer)
  // If this void was created by splitting a parent:
  splitAxis?: 'x' | 'y' | 'z';
  splitPosition?: number;  // Absolute position in box coordinates where the split occurred
}

// Legacy flat subdivision interface (kept for panel generation)
export interface Subdivision {
  id: string;
  axis: 'x' | 'y' | 'z';
  position: number;  // Absolute position in mm
  bounds: Bounds;    // The bounds of the parent void at time of split
}

// Preview state for showing potential subdivisions before confirming
export interface SubdivisionPreview {
  voidId: string;
  axis: 'x' | 'y' | 'z';
  count: number;  // Number of divisions (1 = single split, 2+ = distribute)
  positions: number[];  // Absolute positions of preview planes
}

export interface BoxState {
  config: BoxConfig;
  faces: Face[];
  rootVoid: Void;  // Single root void that contains the hierarchy
  selectionMode: SelectionMode;
  selectedVoidId: string | null;
  selectedSubAssemblyId: string | null;  // Currently selected sub-assembly
  selectedPanelId: string | null;  // FaceId or subdivision panel id
  selectedAssemblyId: string | null;  // 'main' for main box, or sub-assembly id
  subdivisionPreview: SubdivisionPreview | null;
  // Visibility controls
  hiddenVoidIds: Set<string>;  // Set of void IDs that are hidden
  isolatedVoidId: string | null;  // If set, only show this void and its ancestors/descendants
}

export interface BoxActions {
  setConfig: (config: Partial<BoxConfig>) => void;
  toggleFace: (faceId: FaceId) => void;
  setSelectionMode: (mode: SelectionMode) => void;
  selectVoid: (voidId: string | null) => void;
  selectPanel: (panelId: string | null) => void;
  selectAssembly: (assemblyId: string | null) => void;  // 'main' or sub-assembly id
  setSubdivisionPreview: (preview: SubdivisionPreview | null) => void;
  applySubdivision: () => void;  // Apply the current preview
  removeVoid: (voidId: string) => void;
  resetVoids: () => void;
  // Sub-assembly actions
  createSubAssembly: (voidId: string, type: SubAssemblyType) => void;
  selectSubAssembly: (subAssemblyId: string | null) => void;
  toggleSubAssemblyFace: (subAssemblyId: string, faceId: FaceId) => void;
  setSubAssemblyClearance: (subAssemblyId: string, clearance: number) => void;
  removeSubAssembly: (voidId: string) => void;
  // Visibility actions
  toggleVoidVisibility: (voidId: string) => void;
  setIsolatedVoid: (voidId: string | null) => void;
}

// Subdivision panel - a physical divider piece to be cut
export interface SubdivisionPanel {
  id: string;
  axis: 'x' | 'y' | 'z';
  position: number;      // Absolute position in mm
  parentBounds: Bounds;  // Bounds of the void this subdivision is in
  width: number;         // panel width in mm
  height: number;        // panel height in mm
  // Which outer faces this panel meets (for finger joints)
  meetsTop: boolean;
  meetsBottom: boolean;
  meetsLeft: boolean;
  meetsRight: boolean;
  // Intersecting subdivisions (for interlocking slots)
  intersections: SubdivisionIntersection[];
}

export interface SubdivisionIntersection {
  subdivisionId: string;
  axis: 'x' | 'y' | 'z';
  position: number;      // position along this panel's width in mm
  fromTop: boolean;      // slot comes from top (true) or bottom (false)
}
