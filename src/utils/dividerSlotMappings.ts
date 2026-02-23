// Table-driven slot mappings for generateDividerSlotHoles.
//
// Each (faceId, axis) pair encodes the coordinate transformation needed to
// compute slot geometry for a divider intersecting a face panel.  The 6×3
// combinations that were previously a nested switch/if become 12 compact,
// independently-testable objects in a flat lookup table.
//
// Exported for direct unit testing — callers should use FACE_AXIS_MAPPINGS.

import { FaceId, Bounds, EdgeExtensions } from '../types';

// ------------------------------------------------------------------
// Supporting types
// ------------------------------------------------------------------

/** Which assembly boundary conditions a divider meets (computed per sub). */
export interface MeetsBoundary {
  meetsBottom: boolean;
  meetsTop: boolean;
  meetsLeft: boolean;
  meetsRight: boolean;
  meetsBack: boolean;
  meetsFront: boolean;
}

/** Assembly outer dimensions. */
export interface BoxDims {
  width: number;
  height: number;
  depth: number;
}

/** Predicate: is a given face solid (has material)? */
export type SolidCheck = (id: FaceId) => boolean;

// ------------------------------------------------------------------
// Mapping interface
// ------------------------------------------------------------------

/**
 * Everything needed to compute slot geometry for one (faceId, axis) pair.
 * All functions are pure — they receive the per-iteration values as arguments.
 */
export interface FaceAxisSlotMapping {
  /** True when this divider meets the relevant face boundary. */
  matches: (meets: MeetsBoundary) => boolean;

  /** Slot X position in face-local 2D coords (null when slot is horizontal). */
  getSlotX: ((position: number, dims: BoxDims) => number) | null;

  /** Slot Y position in face-local 2D coords (null when slot is vertical). */
  getSlotY: ((position: number, dims: BoxDims) => number) | null;

  /** Whether the slot runs horizontally across the face. */
  isHorizontal: boolean;

  /** Length of the slot along the panel (used by the V1 fallback). */
  getLength: (bounds: Bounds) => number;

  /** Offset to centre the slot within the sub-void bounds (V1 fallback only). */
  getCenterOffset: (bounds: Bounds, dims: BoxDims) => number;

  /** Inset at the start (low) end of the slot due to an adjacent solid face. */
  getStartInset: (meets: MeetsBoundary, isSolid: SolidCheck, mt: number) => number;

  /** Inset at the end (high) end of the slot due to an adjacent solid face. */
  getEndInset: (meets: MeetsBoundary, isSolid: SolidCheck, mt: number) => number;

  /**
   * Extension at the start of the slot edge.
   * 0 when the adjacent face is solid (edge locked); ext[edge] otherwise.
   */
  getExtStart: (meets: MeetsBoundary, isSolid: SolidCheck, ext: EdgeExtensions) => number;

  /**
   * Extension at the end of the slot edge.
   * 0 when the adjacent face is solid (edge locked); ext[edge] otherwise.
   */
  getExtEnd: (meets: MeetsBoundary, isSolid: SolidCheck, ext: EdgeExtensions) => number;
}

// ------------------------------------------------------------------
// Lookup table: (faceId, axis) → FaceAxisSlotMapping
// ------------------------------------------------------------------

export const FACE_AXIS_MAPPINGS: Partial<
  Record<FaceId, Partial<Record<'x' | 'y' | 'z', FaceAxisSlotMapping>>>
> = {
  // ----------------------------------------------------------------
  // FRONT face  (meets when divider's far-Z edge reaches front wall)
  // ----------------------------------------------------------------
  front: {
    // X-axis divider crossing the front face — vertical slot (runs Y)
    x: {
      matches: (m) => m.meetsFront,
      getSlotX: (pos, d) => pos - d.width / 2,
      getSlotY: null,
      isHorizontal: false,
      getLength: (b) => b.h,
      getCenterOffset: (b, d) => (b.y + b.h / 2) - d.height / 2,
      getStartInset: (m, s, mt) => m.meetsBottom && s('bottom') ? mt : 0,
      getEndInset:   (m, s, mt) => m.meetsTop    && s('top')    ? mt : 0,
      getExtStart: (m, s, e) => m.meetsBottom && s('bottom') ? 0 : e.bottom,
      getExtEnd:   (m, s, e) => m.meetsTop    && s('top')    ? 0 : e.top,
    },
    // Y-axis divider crossing the front face — horizontal slot (runs X)
    y: {
      matches: (m) => m.meetsFront,
      getSlotX: null,
      getSlotY: (pos, d) => pos - d.height / 2,
      isHorizontal: true,
      getLength: (b) => b.w,
      getCenterOffset: (b, d) => (b.x + b.w / 2) - d.width / 2,
      getStartInset: (m, s, mt) => m.meetsLeft  && s('left')  ? mt : 0,
      getEndInset:   (m, s, mt) => m.meetsRight && s('right') ? mt : 0,
      getExtStart: (m, s, e) => m.meetsLeft  && s('left')  ? 0 : e.left,
      getExtEnd:   (m, s, e) => m.meetsRight && s('right') ? 0 : e.right,
    },
  },

  // ----------------------------------------------------------------
  // BACK face  (meets when divider's near-Z edge reaches back wall)
  // Mirrored from front: slotX is negated, centerOffset (Y-axis) is negated
  // ----------------------------------------------------------------
  back: {
    // X-axis divider crossing the back face — vertical slot (runs Y)
    x: {
      matches: (m) => m.meetsBack,
      getSlotX: (pos, d) => -(pos - d.width / 2),
      getSlotY: null,
      isHorizontal: false,
      getLength: (b) => b.h,
      getCenterOffset: (b, d) => (b.y + b.h / 2) - d.height / 2,
      getStartInset: (m, s, mt) => m.meetsBottom && s('bottom') ? mt : 0,
      getEndInset:   (m, s, mt) => m.meetsTop    && s('top')    ? mt : 0,
      getExtStart: (m, s, e) => m.meetsBottom && s('bottom') ? 0 : e.bottom,
      getExtEnd:   (m, s, e) => m.meetsTop    && s('top')    ? 0 : e.top,
    },
    // Y-axis divider crossing the back face — horizontal slot (runs X, mirrored)
    y: {
      matches: (m) => m.meetsBack,
      getSlotX: null,
      getSlotY: (pos, d) => pos - d.height / 2,
      isHorizontal: true,
      getLength: (b) => b.w,
      getCenterOffset: (b, d) => -((b.x + b.w / 2) - d.width / 2),
      getStartInset: (m, s, mt) => m.meetsLeft  && s('left')  ? mt : 0,
      getEndInset:   (m, s, mt) => m.meetsRight && s('right') ? mt : 0,
      getExtStart: (m, s, e) => m.meetsLeft  && s('left')  ? 0 : e.left,
      getExtEnd:   (m, s, e) => m.meetsRight && s('right') ? 0 : e.right,
    },
  },

  // ----------------------------------------------------------------
  // LEFT face  (meets when divider's near-X edge reaches left wall)
  // ----------------------------------------------------------------
  left: {
    // Z-axis divider crossing the left face — vertical slot (runs Y)
    z: {
      matches: (m) => m.meetsLeft,
      getSlotX: (pos, d) => pos - d.depth / 2,
      getSlotY: null,
      isHorizontal: false,
      getLength: (b) => b.h,
      getCenterOffset: (b, d) => (b.y + b.h / 2) - d.height / 2,
      getStartInset: (m, s, mt) => m.meetsBottom && s('bottom') ? mt : 0,
      getEndInset:   (m, s, mt) => m.meetsTop    && s('top')    ? mt : 0,
      getExtStart: (m, s, e) => m.meetsBottom && s('bottom') ? 0 : e.bottom,
      getExtEnd:   (m, s, e) => m.meetsTop    && s('top')    ? 0 : e.top,
    },
    // Y-axis divider crossing the left face — horizontal slot (runs Z)
    y: {
      matches: (m) => m.meetsLeft,
      getSlotX: null,
      getSlotY: (pos, d) => pos - d.height / 2,
      isHorizontal: true,
      getLength: (b) => b.d,
      getCenterOffset: (b, d) => (b.z + b.d / 2) - d.depth / 2,
      // Left face: start=back, end=front; divider edges: 'left'=back side, 'right'=front side
      getStartInset: (m, s, mt) => m.meetsBack  && s('back')  ? mt : 0,
      getEndInset:   (m, s, mt) => m.meetsFront && s('front') ? mt : 0,
      getExtStart: (m, s, e) => m.meetsBack  && s('back')  ? 0 : e.left,
      getExtEnd:   (m, s, e) => m.meetsFront && s('front') ? 0 : e.right,
    },
  },

  // ----------------------------------------------------------------
  // RIGHT face  (meets when divider's far-X edge reaches right wall)
  // Mirrored from left: slotX (Z-axis) is negated, centerOffset (Y-axis) is negated
  // ----------------------------------------------------------------
  right: {
    // Z-axis divider crossing the right face — vertical slot (runs Y)
    z: {
      matches: (m) => m.meetsRight,
      getSlotX: (pos, d) => -(pos - d.depth / 2),
      getSlotY: null,
      isHorizontal: false,
      getLength: (b) => b.h,
      getCenterOffset: (b, d) => (b.y + b.h / 2) - d.height / 2,
      getStartInset: (m, s, mt) => m.meetsBottom && s('bottom') ? mt : 0,
      getEndInset:   (m, s, mt) => m.meetsTop    && s('top')    ? mt : 0,
      getExtStart: (m, s, e) => m.meetsBottom && s('bottom') ? 0 : e.bottom,
      getExtEnd:   (m, s, e) => m.meetsTop    && s('top')    ? 0 : e.top,
    },
    // Y-axis divider crossing the right face — horizontal slot (runs Z, mirrored)
    y: {
      matches: (m) => m.meetsRight,
      getSlotX: null,
      getSlotY: (pos, d) => pos - d.height / 2,
      isHorizontal: true,
      getLength: (b) => b.d,
      getCenterOffset: (b, d) => -((b.z + b.d / 2) - d.depth / 2),
      // Right face: start=front, end=back (mirrored from left face)
      getStartInset: (m, s, mt) => m.meetsFront && s('front') ? mt : 0,
      getEndInset:   (m, s, mt) => m.meetsBack  && s('back')  ? mt : 0,
      getExtStart: (m, s, e) => m.meetsFront && s('front') ? 0 : e.right,
      getExtEnd:   (m, s, e) => m.meetsBack  && s('back')  ? 0 : e.left,
    },
  },

  // ----------------------------------------------------------------
  // TOP face  (meets when divider's far-Y edge reaches top wall)
  // Top face rotation [-π/2, 0, 0]: local Y → world -Z
  // ----------------------------------------------------------------
  top: {
    // X-axis divider crossing the top face — vertical slot (runs Z → local Y)
    x: {
      matches: (m) => m.meetsTop,
      getSlotX: (pos, d) => pos - d.width / 2,
      getSlotY: null,
      isHorizontal: false,
      getLength: (b) => b.d,
      // Negated: local Y → world -Z, so slot at world Z needs negation
      getCenterOffset: (b, d) => -((b.z + b.d / 2) - d.depth / 2),
      // Top: start=front (positive local Y → world -Z side), end=back
      getStartInset: (m, s, mt) => m.meetsFront && s('front') ? mt : 0,
      getEndInset:   (m, s, mt) => m.meetsBack  && s('back')  ? mt : 0,
      getExtStart: (m, s, e) => m.meetsFront && s('front') ? 0 : e.right,
      getExtEnd:   (m, s, e) => m.meetsBack  && s('back')  ? 0 : e.left,
    },
    // Z-axis divider crossing the top face — horizontal slot (runs X)
    z: {
      matches: (m) => m.meetsTop,
      getSlotX: null,
      // Negated: slotY = -(position - depth/2) due to top face rotation
      getSlotY: (pos, d) => -(pos - d.depth / 2),
      isHorizontal: true,
      getLength: (b) => b.w,
      getCenterOffset: (b, d) => (b.x + b.w / 2) - d.width / 2,
      getStartInset: (m, s, mt) => m.meetsLeft  && s('left')  ? mt : 0,
      getEndInset:   (m, s, mt) => m.meetsRight && s('right') ? mt : 0,
      getExtStart: (m, s, e) => m.meetsLeft  && s('left')  ? 0 : e.left,
      getExtEnd:   (m, s, e) => m.meetsRight && s('right') ? 0 : e.right,
    },
  },

  // ----------------------------------------------------------------
  // BOTTOM face  (meets when divider's near-Y edge reaches bottom wall)
  // Bottom face rotation [+π/2, 0, 0]: local Y → world +Z
  // ----------------------------------------------------------------
  bottom: {
    // X-axis divider crossing the bottom face — vertical slot (runs Z → local Y)
    x: {
      matches: (m) => m.meetsBottom,
      getSlotX: (pos, d) => pos - d.width / 2,
      getSlotY: null,
      isHorizontal: false,
      getLength: (b) => b.d,
      // Not negated: bottom face local Y → world +Z, so positive = forward
      getCenterOffset: (b, d) => (b.z + b.d / 2) - d.depth / 2,
      // Bottom: start=back (negative local Y → world -Z), end=front
      getStartInset: (m, s, mt) => m.meetsBack  && s('back')  ? mt : 0,
      getEndInset:   (m, s, mt) => m.meetsFront && s('front') ? mt : 0,
      getExtStart: (m, s, e) => m.meetsBack  && s('back')  ? 0 : e.left,
      getExtEnd:   (m, s, e) => m.meetsFront && s('front') ? 0 : e.right,
    },
    // Z-axis divider crossing the bottom face — horizontal slot (runs X)
    z: {
      matches: (m) => m.meetsBottom,
      getSlotX: null,
      // Not negated: slotY = position - depth/2 (opposite sign from top)
      getSlotY: (pos, d) => pos - d.depth / 2,
      isHorizontal: true,
      getLength: (b) => b.w,
      getCenterOffset: (b, d) => (b.x + b.w / 2) - d.width / 2,
      getStartInset: (m, s, mt) => m.meetsLeft  && s('left')  ? mt : 0,
      getEndInset:   (m, s, mt) => m.meetsRight && s('right') ? mt : 0,
      getExtStart: (m, s, e) => m.meetsLeft  && s('left')  ? 0 : e.left,
      getExtEnd:   (m, s, e) => m.meetsRight && s('right') ? 0 : e.right,
    },
  },
};
