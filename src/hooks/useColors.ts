import { useMemo } from 'react';
import { defaultColors, ColorConfig } from '../config/colors';

/**
 * Hook for accessing the color configuration.
 * Future: could support theme switching, user preferences, or dark/light mode.
 */
export function useColors(): ColorConfig {
  // For now, always return default colors
  // In the future, this could read from a theme context or user preferences
  return useMemo(() => defaultColors, []);
}

/**
 * Get color configuration outside of React components.
 * Use useColors() hook inside React components instead.
 */
export { getColors } from '../config/colors';
