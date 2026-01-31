/**
 * Engine Creation Fixtures
 *
 * Factory functions for creating test engines with common configurations.
 */

import { Engine, createEngineWithAssembly } from '../../src/engine/Engine';
import type { MaterialConfig, Axis } from '../../src/engine/types';
import { defaultMaterial } from './materials';

export { defaultMaterial, thinMaterial, thickMaterial, fineMaterial } from './materials';

/**
 * Create a basic box engine with default dimensions (100x80x60mm)
 */
export function createBasicBox(material: MaterialConfig = defaultMaterial): Engine {
  return createEngineWithAssembly(100, 80, 60, material);
}

/**
 * Create a box engine with custom dimensions
 */
export function createBox(
  width: number,
  height: number,
  depth: number,
  material: MaterialConfig = defaultMaterial
): Engine {
  return createEngineWithAssembly(width, height, depth, material);
}

/**
 * Create a box with a single subdivision on the specified axis
 */
export function createSubdividedBox(
  axis: Axis,
  position: number,
  material: MaterialConfig = defaultMaterial
): Engine {
  const engine = createBasicBox(material);
  engine.dispatch({
    type: 'ADD_SUBDIVISION',
    targetId: 'main-assembly',
    payload: { voidId: 'root', axis, position },
  });
  return engine;
}

/**
 * Create a box with a 2x2 grid subdivision (X and Z axes)
 */
export function createGridBox(
  xCompartments: number = 2,
  zCompartments: number = 2,
  material: MaterialConfig = defaultMaterial
): Engine {
  const engine = createBasicBox(material);
  engine.dispatch({
    type: 'ADD_MULTI_AXIS_SUBDIVISION',
    targetId: 'main-assembly',
    payload: {
      voidId: 'root',
      axes: [
        { axis: 'x', compartments: xCompartments },
        { axis: 'z', compartments: zCompartments },
      ],
    },
  });
  return engine;
}

/**
 * Create a cube (equal dimensions)
 */
export function createCube(
  size: number = 100,
  material: MaterialConfig = defaultMaterial
): Engine {
  return createEngineWithAssembly(size, size, size, material);
}

/**
 * Create a tall box (height > width, depth)
 */
export function createTallBox(material: MaterialConfig = defaultMaterial): Engine {
  return createEngineWithAssembly(50, 150, 50, material);
}

/**
 * Create a wide box (width > height, depth)
 */
export function createWideBox(material: MaterialConfig = defaultMaterial): Engine {
  return createEngineWithAssembly(150, 50, 50, material);
}

/**
 * Create a deep box (depth > width, height)
 */
export function createDeepBox(material: MaterialConfig = defaultMaterial): Engine {
  return createEngineWithAssembly(50, 50, 150, material);
}
