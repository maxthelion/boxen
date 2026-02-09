# Proposed Tasks from: user-experience-plan.md

**Source:** project-management/drafts/boxen/user-experience-plan.md
**Processed:** 2026-02-09

## Task 1: Implement collapsible sidebar sections

- **Title:** Add collapsible sections to sidebar with reorganized layout
- **Role:** implement
- **Priority:** P2
- **Complexity:** M
- **Description:** Reorganize the sidebar into collapsible sections: Orientation (axis selection, moved to top), Dimensions, Joint Features, Feet (conditional on axis=y), Advanced. Create a CollapsibleSection component. Move axis selection to prominent top position with friendly names ("Top Down", "Side to Side", "Front to Back"). Files: Sidebar.tsx, new CollapsibleSection component.
- **Success criteria:**
  - Sidebar organized into collapsible sections
  - Axis selection prominent at top with friendly labels
  - Feet section only visible when axis = 'y'
  - Sections expand/collapse on header click
  - Sensible defaults: Orientation and Dimensions expanded, others collapsed

## Task 2: Add floating panel toggle buttons in 3D view

- **Title:** Add in-viewport face toggle buttons at panel centers
- **Role:** implement
- **Priority:** P3
- **Complexity:** M
- **Description:** Place floating toggle buttons at the center of each face panel in the 3D view. Clicking toggles between open/closed. Provides immediate visual feedback without needing the sidebar. Files: Box3D.tsx (or new PanelToggleOverlay component).
- **Success criteria:**
  - Toggle buttons visible at face centers in 3D view
  - Click toggles panel open/closed state
  - Visual indicator shows current state (open vs closed)
  - Buttons don't obscure important geometry
