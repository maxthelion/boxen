import { BoxConfig, Face, Void, AssemblyConfig, defaultAssemblyConfig, EdgeExtensions, SubAssembly, FaceOffsets, defaultFaceOffsets } from '../types';
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';

// Compact serialization format for URL storage
interface SerializedState {
  v: number;  // Version for future compatibility
  c: {        // Config
    w: number;  // width
    h: number;  // height
    d: number;  // depth
    mt: number; // materialThickness
    fw: number; // fingerWidth
    fg: number; // fingerGap
    a?: SerializedAssembly;  // assembly (optional, defaults used if missing)
  };
  f: number;  // Faces bitmap (6 bits, one per face)
  r: SerializedVoid;  // Root void
  e?: Record<string, [number, number, number, number]>;  // Edge extensions by panel ID [top, bottom, left, right]
}

interface SerializedAssembly {
  ax: 'x' | 'y' | 'z';  // assemblyAxis
  lp?: [string, number];  // lid positive [tabDirection, inset] if not default
  ln?: [string, number];  // lid negative [tabDirection, inset] if not default
}

interface SerializedSubAssembly {
  id: string;
  cl: number;             // clearance
  fo?: [number, number, number, number, number, number];  // faceOffsets [front, back, left, right, top, bottom] if non-zero
  f: number;              // faces bitmap
  rv: SerializedVoid;     // rootVoid
  mt: number;             // materialThickness
  a?: SerializedAssembly; // assembly config
}

interface SerializedGridSubdivision {
  ax: ('x' | 'y' | 'z')[];  // axes
  pos: Partial<Record<'x' | 'y' | 'z', number[]>>;  // positions per axis
}

interface SerializedVoid {
  id: string;
  b: [number, number, number, number, number, number];  // bounds [x, y, z, w, h, d]
  ch?: SerializedVoid[];  // children
  sa?: 'x' | 'y' | 'z';   // splitAxis
  sp?: number;            // splitPosition
  sub?: SerializedSubAssembly;  // subAssembly
  gs?: SerializedGridSubdivision;  // gridSubdivision
}

// Face order for bitmap encoding
const FACE_ORDER = ['front', 'back', 'left', 'right', 'top', 'bottom'] as const;

// Round number to 2 decimal places to save space
const r = (n: number): number => Math.round(n * 100) / 100;

// Serialize faces to a bitmap (1 = solid, 0 = open)
const serializeFaces = (faces: Face[]): number => {
  let bitmap = 0;
  for (let i = 0; i < FACE_ORDER.length; i++) {
    const face = faces.find(f => f.id === FACE_ORDER[i]);
    if (face?.solid) {
      bitmap |= (1 << i);
    }
  }
  return bitmap;
};

// Deserialize faces from bitmap
const deserializeFaces = (bitmap: number): Face[] => {
  return FACE_ORDER.map((id, i) => ({
    id,
    solid: (bitmap & (1 << i)) !== 0,
  }));
};

// Serialize face offsets (only if non-zero)
const serializeFaceOffsets = (fo: FaceOffsets): [number, number, number, number, number, number] | undefined => {
  if (fo.front === 0 && fo.back === 0 && fo.left === 0 && fo.right === 0 && fo.top === 0 && fo.bottom === 0) {
    return undefined;
  }
  return [r(fo.front), r(fo.back), r(fo.left), r(fo.right), r(fo.top), r(fo.bottom)];
};

// Deserialize face offsets
const deserializeFaceOffsets = (sfo?: [number, number, number, number, number, number]): FaceOffsets => {
  if (!sfo) return { ...defaultFaceOffsets };
  return {
    front: sfo[0],
    back: sfo[1],
    left: sfo[2],
    right: sfo[3],
    top: sfo[4],
    bottom: sfo[5],
  };
};

// Serialize sub-assembly
const serializeSubAssembly = (sub: SubAssembly): SerializedSubAssembly => {
  return {
    id: sub.id,
    cl: r(sub.clearance),
    fo: serializeFaceOffsets(sub.faceOffsets),
    f: serializeFaces(sub.faces),
    rv: serializeVoid(sub.rootVoid),
    mt: r(sub.materialThickness),
    a: serializeAssembly(sub.assembly),
  };
};

// Deserialize sub-assembly
const deserializeSubAssembly = (ssub: SerializedSubAssembly): SubAssembly => {
  return {
    id: ssub.id,
    clearance: ssub.cl,
    faceOffsets: deserializeFaceOffsets(ssub.fo),
    faces: deserializeFaces(ssub.f),
    rootVoid: deserializeVoid(ssub.rv),
    materialThickness: ssub.mt,
    assembly: deserializeAssembly(ssub.a),
  };
};

// Serialize grid subdivision
const serializeGridSubdivision = (gs: { axes: ('x' | 'y' | 'z')[]; positions: Partial<Record<'x' | 'y' | 'z', number[]>> }): SerializedGridSubdivision => {
  // Round all position values
  const roundedPositions: Partial<Record<'x' | 'y' | 'z', number[]>> = {};
  for (const [axis, positions] of Object.entries(gs.positions)) {
    if (positions) {
      roundedPositions[axis as 'x' | 'y' | 'z'] = positions.map(r);
    }
  }
  return {
    ax: gs.axes,
    pos: roundedPositions,
  };
};

// Deserialize grid subdivision
const deserializeGridSubdivision = (sgs: SerializedGridSubdivision): { axes: ('x' | 'y' | 'z')[]; positions: Partial<Record<'x' | 'y' | 'z', number[]>> } => {
  return {
    axes: sgs.ax,
    positions: sgs.pos,
  };
};

// Serialize void tree
const serializeVoid = (v: Void): SerializedVoid => {
  const result: SerializedVoid = {
    id: v.id,
    b: [r(v.bounds.x), r(v.bounds.y), r(v.bounds.z), r(v.bounds.w), r(v.bounds.h), r(v.bounds.d)],
  };

  if (v.children && v.children.length > 0) {
    result.ch = v.children.map(serializeVoid);
  }
  if (v.splitAxis) {
    result.sa = v.splitAxis;
  }
  if (v.splitPosition !== undefined) {
    result.sp = r(v.splitPosition);
  }
  if (v.subAssembly) {
    result.sub = serializeSubAssembly(v.subAssembly);
  }
  if (v.gridSubdivision) {
    result.gs = serializeGridSubdivision(v.gridSubdivision);
  }

  return result;
};

// Deserialize void tree
const deserializeVoid = (sv: SerializedVoid): Void => {
  const result: Void = {
    id: sv.id,
    bounds: {
      x: sv.b[0],
      y: sv.b[1],
      z: sv.b[2],
      w: sv.b[3],
      h: sv.b[4],
      d: sv.b[5],
    },
    children: sv.ch ? sv.ch.map(deserializeVoid) : [],
    splitAxis: sv.sa,
    splitPosition: sv.sp,
  };

  if (sv.sub) {
    result.subAssembly = deserializeSubAssembly(sv.sub);
  }

  if (sv.gs) {
    result.gridSubdivision = deserializeGridSubdivision(sv.gs);
  }

  return result;
};

// Serialize assembly config (only non-default values)
const serializeAssembly = (a: AssemblyConfig): SerializedAssembly | undefined => {
  const isDefault =
    a.assemblyAxis === 'y' &&
    a.lids.positive.tabDirection === 'tabs-out' &&
    a.lids.positive.inset === 0 &&
    a.lids.negative.tabDirection === 'tabs-out' &&
    a.lids.negative.inset === 0;

  if (isDefault) return undefined;

  const result: SerializedAssembly = { ax: a.assemblyAxis };

  if (a.lids.positive.tabDirection !== 'tabs-out' || a.lids.positive.inset !== 0) {
    result.lp = [a.lids.positive.tabDirection, a.lids.positive.inset];
  }
  if (a.lids.negative.tabDirection !== 'tabs-out' || a.lids.negative.inset !== 0) {
    result.ln = [a.lids.negative.tabDirection, a.lids.negative.inset];
  }

  return result;
};

// Deserialize assembly config
const deserializeAssembly = (sa?: SerializedAssembly): AssemblyConfig => {
  if (!sa) return { ...defaultAssemblyConfig };

  return {
    assemblyAxis: sa.ax,
    lids: {
      positive: {
        enabled: true,
        tabDirection: (sa.lp?.[0] as 'tabs-out' | 'tabs-in') ?? 'tabs-out',
        inset: sa.lp?.[1] ?? 0,
      },
      negative: {
        enabled: true,
        tabDirection: (sa.ln?.[0] as 'tabs-out' | 'tabs-in') ?? 'tabs-out',
        inset: sa.ln?.[1] ?? 0,
      },
    },
  };
};

// Serialize edge extensions (only non-zero)
const serializeExtensions = (
  extensions: Record<string, EdgeExtensions>
): Record<string, [number, number, number, number]> | undefined => {
  const result: Record<string, [number, number, number, number]> = {};
  let hasAny = false;

  for (const [panelId, ext] of Object.entries(extensions)) {
    if (ext.top !== 0 || ext.bottom !== 0 || ext.left !== 0 || ext.right !== 0) {
      result[panelId] = [ext.top, ext.bottom, ext.left, ext.right];
      hasAny = true;
    }
  }

  return hasAny ? result : undefined;
};

// Deserialize edge extensions
const deserializeExtensions = (
  se?: Record<string, [number, number, number, number]>
): Record<string, EdgeExtensions> => {
  if (!se) return {};

  const result: Record<string, EdgeExtensions> = {};
  for (const [panelId, [top, bottom, left, right]] of Object.entries(se)) {
    result[panelId] = { top, bottom, left, right };
  }
  return result;
};

// Main serialization function
export interface ProjectState {
  config: BoxConfig;
  faces: Face[];
  rootVoid: Void;
  edgeExtensions: Record<string, EdgeExtensions>;
}

export const serializeProject = (state: ProjectState): string => {
  const serialized: SerializedState = {
    v: 1,
    c: {
      w: r(state.config.width),
      h: r(state.config.height),
      d: r(state.config.depth),
      mt: r(state.config.materialThickness),
      fw: r(state.config.fingerWidth),
      fg: r(state.config.fingerGap),
      a: serializeAssembly(state.config.assembly),
    },
    f: serializeFaces(state.faces),
    r: serializeVoid(state.rootVoid),
    e: serializeExtensions(state.edgeExtensions),
  };

  // Convert to JSON and compress with lz-string
  const json = JSON.stringify(serialized);
  const compressed = compressToEncodedURIComponent(json);
  return compressed;
};

// Try to deserialize with lz-string first, fall back to old base64 format
export const deserializeProject = (encoded: string): ProjectState | null => {
  try {
    // Try lz-string decompression first
    let json = decompressFromEncodedURIComponent(encoded);

    // Fall back to old base64 format if lz-string fails
    if (!json) {
      json = decodeURIComponent(atob(encoded));
    }

    const serialized: SerializedState = JSON.parse(json);

    // Version check for future compatibility
    if (serialized.v !== 1) {
      console.warn('Unknown project version:', serialized.v);
    }

    const config: BoxConfig = {
      width: serialized.c.w,
      height: serialized.c.h,
      depth: serialized.c.d,
      materialThickness: serialized.c.mt,
      fingerWidth: serialized.c.fw,
      fingerGap: serialized.c.fg,
      assembly: deserializeAssembly(serialized.c.a),
    };

    return {
      config,
      faces: deserializeFaces(serialized.f),
      rootVoid: deserializeVoid(serialized.r),
      edgeExtensions: deserializeExtensions(serialized.e),
    };
  } catch (e) {
    console.error('Failed to deserialize project:', e);
    return null;
  }
};

// URL helpers - using query parameter for better sharing compatibility
const URL_PARAM = 'p';

export const saveToUrl = (state: ProjectState): void => {
  const encoded = serializeProject(state);
  const url = new URL(window.location.href);
  url.searchParams.set(URL_PARAM, encoded);
  url.hash = ''; // Clear any old hash
  window.history.replaceState(null, '', url.toString());
};

export const loadFromUrl = (): ProjectState | null => {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get(URL_PARAM);

  // Also check hash for backwards compatibility with old URLs
  if (!encoded) {
    const hash = window.location.hash.slice(1);
    if (hash) return deserializeProject(hash);
    return null;
  }

  return deserializeProject(encoded);
};

export const clearUrlState = (): void => {
  const url = new URL(window.location.href);
  url.searchParams.delete(URL_PARAM);
  url.hash = '';
  window.history.replaceState(null, '', url.toString());
};

export const getShareableUrl = (state: ProjectState): string => {
  const encoded = serializeProject(state);
  const url = new URL(window.location.href);
  url.searchParams.set(URL_PARAM, encoded);
  url.hash = '';
  return url.toString();
};
