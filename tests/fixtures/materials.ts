/**
 * Material Configuration Fixtures
 *
 * Common material configurations for tests.
 */

import type { MaterialConfig } from '../../src/engine/types';

/**
 * Default 3mm plywood material
 */
export const defaultMaterial: MaterialConfig = {
  thickness: 3,
  fingerWidth: 10,
  fingerGap: 1.5,
};

/**
 * Thinner 1.5mm material (acrylic, thin plywood)
 */
export const thinMaterial: MaterialConfig = {
  thickness: 1.5,
  fingerWidth: 6,
  fingerGap: 1,
};

/**
 * 6mm thick material for larger boxes
 */
export const thickMaterial: MaterialConfig = {
  thickness: 6,
  fingerWidth: 12,
  fingerGap: 2,
};

/**
 * Small finger width for fine detail work
 */
export const fineMaterial: MaterialConfig = {
  thickness: 3,
  fingerWidth: 6,
  fingerGap: 1.5,
};
