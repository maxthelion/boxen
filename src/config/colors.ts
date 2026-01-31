/**
 * Centralized color configuration for the application.
 * All selection, hover, and highlight colors should be defined here.
 */

export interface StateColors {
  base: string;
  hover: string;
}

export interface ColorConfig {
  // ===== Selection States =====
  selection: {
    primary: StateColors;      // Main selection color (purple)
    secondary: StateColors;    // Alternate selection (blue)
  };

  // ===== Interactive States =====
  interactive: {
    hover: StateColors;        // General hover feedback (green)
    active: StateColors;       // Active/pressed state
    disabled: StateColors;     // Disabled/locked state (gray)
  };

  // ===== Edge Status (Inset/Outset Tool) =====
  edge: {
    locked: StateColors;       // Has finger joints, non-interactive
    unlocked: StateColors;     // Open edge, can extend freely
    outwardOnly: StateColors;  // Female joint, outward extension only
    selected: StateColors;     // Currently selected edge
  };

  // ===== Corner Status (Fillet Tool) =====
  corner: {
    eligible: StateColors;     // Can be filleted
    ineligible: StateColors;   // Cannot be filleted
    selected: StateColors;     // Currently selected corner
  };

  // ===== Panel Types =====
  panel: {
    face: StateColors;         // Main box face panels
    divider: StateColors;      // Subdivision dividers
    subAssembly: StateColors;  // Drawer/tray panels
    preview: StateColors;      // New panels during preview
  };

  // ===== Tool Eligibility (panel coloring when tool active) =====
  eligibility: {
    eligible: StateColors;     // Green - panel can be operated on
    ineligible: StateColors;   // Pink - panel cannot be operated on
  };

  // ===== Void Cells =====
  void: {
    default: StateColors;
    selected: StateColors;
    wireframe: string;         // Outline color
  };

  // ===== Axes (Standard RGB convention) =====
  axis: {
    x: string;                 // Red
    y: string;                 // Green
    z: string;                 // Blue
  };

  // ===== Operation Feedback =====
  operation: {
    positive: StateColors;     // Extending/adding (blue)
    negative: StateColors;     // Retracting/removing (red)
    dragging: string;          // During drag (orange)
  };

  // ===== Bounding & Preview =====
  bounds: {
    assembly: string;          // Main assembly bounds
    previewActive: string;     // During active preview
  };

  // ===== 2D Sketch View =====
  sketch: {
    grid: {
      minor: string;
      major: string;
      axes: string;
    };
    editable: StateColors;     // Editable regions
    boundary: string;          // Conceptual panel boundary
    adjacent: StateColors;     // Adjacent panel cross-section
    extension: string;         // Extension visualization on adjacent panels
    hole: StateColors;         // Slot/hole rendering
    label: string;             // Dimension and annotation labels
  };

  // ===== Opacity Presets =====
  opacity: {
    solid: number;             // 0.9
    selected: number;          // 0.8
    hover: number;             // 0.7
    default: number;           // 0.6
    subtle: number;            // 0.4
    faint: number;             // 0.2
  };
}

// ===== Default Theme =====
export const defaultColors: ColorConfig = {
  selection: {
    primary: { base: '#9b59b6', hover: '#a855f7' },
    secondary: { base: '#4a9eff', hover: '#6ab0f9' },
  },

  interactive: {
    hover: { base: '#6ab04c', hover: '#7ec850' },
    active: { base: '#2ecc71', hover: '#3dd87f' },
    disabled: { base: '#6c757d', hover: '#868e96' },
  },

  edge: {
    locked: { base: '#6c757d', hover: '#868e96' },
    unlocked: { base: '#28a745', hover: '#51cf66' },
    outwardOnly: { base: '#fd7e14', hover: '#ff922b' },
    selected: { base: '#9b59b6', hover: '#a855f7' },
  },

  corner: {
    eligible: { base: '#00bcd4', hover: '#4dd0e1' },
    ineligible: { base: '#546e7a', hover: '#78909c' },
    selected: { base: '#00e5ff', hover: '#18ffff' },
  },

  panel: {
    face: { base: '#3498db', hover: '#5dade2' },
    divider: { base: '#f39c12', hover: '#f5b041' },
    subAssembly: { base: '#1abc9c', hover: '#48c9b0' },
    preview: { base: '#00ff00', hover: '#33ff33' },
  },

  eligibility: {
    eligible: { base: '#4ade80', hover: '#86efac' },     // Green
    ineligible: { base: '#f472b6', hover: '#f9a8d4' },   // Pink
  },

  void: {
    default: { base: '#95a5a6', hover: '#aab7b8' },
    selected: { base: '#4a90d9', hover: '#6ba3e0' },
    wireframe: '#ff00ff',
  },

  axis: {
    x: '#e74c3c',
    y: '#2ecc71',
    z: '#3498db',
  },

  operation: {
    positive: { base: '#1e5a9e', hover: '#2e7ad1' },
    negative: { base: '#b33939', hover: '#c94444' },
    dragging: '#ffaa00',
  },

  bounds: {
    assembly: '#ff0000',
    previewActive: '#ffcc00',
  },

  sketch: {
    grid: {
      minor: '#2a2a3e',
      major: '#3a3a4e',
      axes: '#4a4a6a',
    },
    editable: { base: '#2ecc71', hover: '#3dd87f' },
    boundary: '#6a6a8a',
    adjacent: { base: '#4a5568', hover: '#718096' },
    extension: '#e53e3e',
    hole: { base: '#1a1a2e', hover: '#666' },
    label: '#888',
  },

  opacity: {
    solid: 0.9,
    selected: 0.8,
    hover: 0.7,
    default: 0.6,
    subtle: 0.4,
    faint: 0.2,
  },
};

/**
 * Get colors for the current theme.
 * Future: could load from user preferences or support dark/light mode.
 */
export function getColors(): ColorConfig {
  return defaultColors;
}
