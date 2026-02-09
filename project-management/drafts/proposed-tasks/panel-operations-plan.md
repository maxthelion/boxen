# Proposed Tasks from: panel-operations-plan.md

**Source:** project-management/drafts/boxen/panel-operations-plan.md
**Processed:** 2026-02-09

## Task 1: Add assembly/panel splitting operation

- **Title:** Implement assembly splitting along a configurable plane
- **Role:** implement
- **Priority:** P3
- **Complexity:** L
- **Description:** Allow splitting an assembly along a plane perpendicular to a chosen axis. Creates two child assemblies with adjusted dimensions, new face panels at the split plane, and connection options (none, finger-joint, alignment-pins, overlap). Includes split plane visualization with drag handle and snapping. This is the main remaining pending feature from the panel operations plan.
- **Success criteria:**
  - Split operation creates two child assemblies from original
  - Each child has correct dimensions and face panels
  - Connection types work (none, finger-joint at minimum)
  - Split plane preview with drag handle in 3D view
  - SVG export produces separate paths for split panels

## Task 2: Add 3D edge and corner selection

- **Title:** Enable edge and corner selection directly in 3D view
- **Role:** implement
- **Priority:** P2
- **Complexity:** M
- **Description:** Add 'edge' and 'corner' selection filter modes to the viewport toolbar. Edge selection uses raycasting + distance-to-edge calculation. Corner selection uses distance-to-corner. Hit threshold scales with camera distance. Edges integrate with inset tool, corners with chamfer tool. Files: ViewportToolbar.tsx, PanelPathRenderer.tsx, Box3D.tsx, useBoxStore.ts.
- **Success criteria:**
  - Edge/corner filter buttons in viewport toolbar
  - Edges highlight on hover and select on click
  - Corners highlight on hover and select on click
  - Selected edges work with inset tool palette
  - Selected corners work with chamfer tool palette
  - Hit detection scales with camera distance
