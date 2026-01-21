import { BoxConfig, Face, Void, AssemblyConfig, defaultAssemblyConfig, EdgeExtensions, defaultEdgeExtensions } from '../types';

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

interface SerializedVoid {
  id: string;
  b: [number, number, number, number, number, number];  // bounds [x, y, z, w, h, d]
  ch?: SerializedVoid[];  // children
  sa?: 'x' | 'y' | 'z';   // splitAxis
  sp?: number;            // splitPosition
}

// Face order for bitmap encoding
const FACE_ORDER = ['front', 'back', 'left', 'right', 'top', 'bottom'] as const;

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

// Serialize void tree
const serializeVoid = (v: Void): SerializedVoid => {
  const result: SerializedVoid = {
    id: v.id,
    b: [v.bounds.x, v.bounds.y, v.bounds.z, v.bounds.w, v.bounds.h, v.bounds.d],
  };

  if (v.children && v.children.length > 0) {
    result.ch = v.children.map(serializeVoid);
  }
  if (v.splitAxis) {
    result.sa = v.splitAxis;
  }
  if (v.splitPosition !== undefined) {
    result.sp = v.splitPosition;
  }

  return result;
};

// Deserialize void tree
const deserializeVoid = (sv: SerializedVoid): Void => {
  return {
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
      w: state.config.width,
      h: state.config.height,
      d: state.config.depth,
      mt: state.config.materialThickness,
      fw: state.config.fingerWidth,
      fg: state.config.fingerGap,
      a: serializeAssembly(state.config.assembly),
    },
    f: serializeFaces(state.faces),
    r: serializeVoid(state.rootVoid),
    e: serializeExtensions(state.edgeExtensions),
  };

  // Convert to JSON and base64 encode
  const json = JSON.stringify(serialized);
  const encoded = btoa(encodeURIComponent(json));
  return encoded;
};

export const deserializeProject = (encoded: string): ProjectState | null => {
  try {
    const json = decodeURIComponent(atob(encoded));
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

// URL helpers
export const saveToUrl = (state: ProjectState): void => {
  const encoded = serializeProject(state);
  const url = new URL(window.location.href);
  url.hash = encoded;
  window.history.replaceState(null, '', url.toString());
};

export const loadFromUrl = (): ProjectState | null => {
  const hash = window.location.hash.slice(1); // Remove leading #
  if (!hash) return null;
  return deserializeProject(hash);
};

export const clearUrlState = (): void => {
  const url = new URL(window.location.href);
  url.hash = '';
  window.history.replaceState(null, '', url.toString());
};

export const getShareableUrl = (state: ProjectState): string => {
  const encoded = serializeProject(state);
  const url = new URL(window.location.href);
  url.hash = encoded;
  return url.toString();
};
