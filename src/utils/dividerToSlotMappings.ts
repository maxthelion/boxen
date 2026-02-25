// Table-driven slot mappings for generateDividerToSlotHoles.
//
// Each (parentAxis, childAxis) pair encodes the coordinate transformation needed to
// compute slot geometry on a divider panel where a child divider connects to it.
// The 3×2 combinations that were previously a nested switch/if become 6 compact,
// independently-testable objects in a flat lookup table.
//
// Exported for direct unit testing — callers should use DIVIDER_AXIS_MAPPINGS.

import { BoxDims, SolidCheck } from './dividerSlotMappings';

// ------------------------------------------------------------------
// Supporting types
// ------------------------------------------------------------------

/** Subset of void bounds used for slot geometry calculations. */
export interface VoidBounds {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
}

// Re-export shared types so callers only need one import
export type { BoxDims, SolidCheck };

// ------------------------------------------------------------------
// Mapping interface
// ------------------------------------------------------------------

/**
 * Everything needed to compute slot geometry for one (parentAxis, childAxis) pair.
 * All functions are pure — they receive the per-iteration values as arguments.
 */
export interface DividerAxisSlotMapping {
  /** Key in child.bounds for the low edge along the parent axis (for min/max edge check) */
  childLowKey: 'x' | 'y' | 'z';

  /** Key in child.bounds for the size along the parent axis (for min/max edge check) */
  childSizeKey: 'w' | 'h' | 'd';

  /** True when child.position falls within parent's perpendicular range */
  inParentBounds: (childPos: number, parentBounds: VoidBounds) => boolean;

  /** Slot position in panel-local 2D coords (offset from panel centre) */
  getSlotPosition: (childPos: number, parentBounds: VoidBounds) => number;

  /** Length of the slot */
  getSlotLength: (childBounds: VoidBounds) => number;

  /** Inset at the start (low) end due to an adjacent solid outer face */
  getInsetStart: (
    childBounds: VoidBounds,
    isSolid: SolidCheck,
    mt: number,
    dims: BoxDims,
    tolerance: number
  ) => number;

  /** Inset at the end (high) end due to an adjacent solid outer face */
  getInsetEnd: (
    childBounds: VoidBounds,
    isSolid: SolidCheck,
    mt: number,
    dims: BoxDims,
    tolerance: number
  ) => number;

  /** Whether the slot runs horizontally across the panel */
  isHorizontal: boolean;
}

// ------------------------------------------------------------------
// Lookup table: (parentAxis, childAxis) → DividerAxisSlotMapping
// ------------------------------------------------------------------

export const DIVIDER_AXIS_MAPPINGS: Partial<
  Record<'x' | 'y' | 'z', Partial<Record<'x' | 'y' | 'z', DividerAxisSlotMapping>>>
> = {
  // ----------------------------------------------------------------
  // Y-axis parent (horizontal shelf at Y = position)
  // Panel local space: width = bounds.w (X-span), height = bounds.d (Z-span)
  // ----------------------------------------------------------------
  y: {
    // X-axis child connecting to Y-axis parent — vertical slot (runs along Z / panel Y)
    x: {
      childLowKey: 'y',
      childSizeKey: 'h',
      inParentBounds: (childPos, pb) => pb.x <= childPos && childPos <= pb.x + pb.w,
      getSlotPosition: (childPos, pb) => childPos - (pb.x + pb.w / 2),
      getSlotLength: (cb) => cb.d,
      getInsetStart: (cb, s, mt, _d, tol) =>
        s('back') && cb.z <= tol ? mt : 0,
      getInsetEnd: (cb, s, mt, d, tol) =>
        s('front') && cb.z + cb.d >= d.depth - tol ? mt : 0,
      isHorizontal: false,
    },

    // Z-axis child connecting to Y-axis parent — horizontal slot (runs along X / panel X)
    z: {
      childLowKey: 'y',
      childSizeKey: 'h',
      inParentBounds: (childPos, pb) => pb.z <= childPos && childPos <= pb.z + pb.d,
      getSlotPosition: (childPos, pb) => childPos - (pb.z + pb.d / 2),
      getSlotLength: (cb) => cb.w,
      getInsetStart: (cb, s, mt, _d, tol) =>
        s('left') && cb.x <= tol ? mt : 0,
      getInsetEnd: (cb, s, mt, d, tol) =>
        s('right') && cb.x + cb.w >= d.width - tol ? mt : 0,
      isHorizontal: true,
    },
  },

  // ----------------------------------------------------------------
  // X-axis parent (vertical partition at X = position, spans Y-Z plane)
  // Panel local space: width = bounds.d (Z-span), height = bounds.h (Y-span)
  // ----------------------------------------------------------------
  x: {
    // Y-axis child connecting to X-axis parent — horizontal slot (runs along Z / panel X)
    y: {
      childLowKey: 'x',
      childSizeKey: 'w',
      inParentBounds: (childPos, pb) => pb.y <= childPos && childPos <= pb.y + pb.h,
      getSlotPosition: (childPos, pb) => childPos - (pb.y + pb.h / 2),
      getSlotLength: (cb) => cb.d,
      getInsetStart: (cb, s, mt, _d, tol) =>
        s('back') && cb.z <= tol ? mt : 0,
      getInsetEnd: (cb, s, mt, d, tol) =>
        s('front') && cb.z + cb.d >= d.depth - tol ? mt : 0,
      isHorizontal: true,
    },

    // Z-axis child connecting to X-axis parent — vertical slot (runs along Y / panel Y)
    z: {
      childLowKey: 'x',
      childSizeKey: 'w',
      inParentBounds: (childPos, pb) => pb.z <= childPos && childPos <= pb.z + pb.d,
      getSlotPosition: (childPos, pb) => childPos - (pb.z + pb.d / 2),
      getSlotLength: (cb) => cb.h,
      getInsetStart: (cb, s, mt, _d, tol) =>
        s('bottom') && cb.y <= tol ? mt : 0,
      getInsetEnd: (cb, s, mt, d, tol) =>
        s('top') && cb.y + cb.h >= d.height - tol ? mt : 0,
      isHorizontal: false,
    },
  },

  // ----------------------------------------------------------------
  // Z-axis parent (partition at Z = position, spans X-Y plane)
  // Panel local space: width = bounds.w (X-span), height = bounds.h (Y-span)
  // ----------------------------------------------------------------
  z: {
    // X-axis child connecting to Z-axis parent — vertical slot (runs along Y / panel Y)
    x: {
      childLowKey: 'z',
      childSizeKey: 'd',
      inParentBounds: (childPos, pb) => pb.x <= childPos && childPos <= pb.x + pb.w,
      getSlotPosition: (childPos, pb) => childPos - (pb.x + pb.w / 2),
      getSlotLength: (cb) => cb.h,
      getInsetStart: (cb, s, mt, _d, tol) =>
        s('bottom') && cb.y <= tol ? mt : 0,
      getInsetEnd: (cb, s, mt, d, tol) =>
        s('top') && cb.y + cb.h >= d.height - tol ? mt : 0,
      isHorizontal: false,
    },

    // Y-axis child connecting to Z-axis parent — horizontal slot (runs along X / panel X)
    y: {
      childLowKey: 'z',
      childSizeKey: 'd',
      inParentBounds: (childPos, pb) => pb.y <= childPos && childPos <= pb.y + pb.h,
      getSlotPosition: (childPos, pb) => childPos - (pb.y + pb.h / 2),
      getSlotLength: (cb) => cb.w,
      getInsetStart: (cb, s, mt, _d, tol) =>
        s('left') && cb.x <= tol ? mt : 0,
      getInsetEnd: (cb, s, mt, d, tol) =>
        s('right') && cb.x + cb.w >= d.width - tol ? mt : 0,
      isHorizontal: true,
    },
  },
};
