# Proposed Tasks from: freeform-polygon-tool-plan.md

**Source:** project-management/drafts/boxen/freeform-polygon-tool-plan.md
**Processed:** 2026-02-09

## Task 1: Simplify freeform polygon tool flow

- **Title:** Show boolean palette immediately during polygon drawing with live preview
- **Role:** implement
- **Priority:** P3
- **Complexity:** M
- **Description:** Currently the freeform polygon tool has two sequential palettes: one during drawing (point count + close path) and one after closing (boolean mode + apply). Merge these into a single palette shown from the start with cut/extend toggle, live preview of the boolean result as the shape is drawn, ghost line from last point to cursor, and implicit close (clicking near first point or clicking Apply). Single file change: `src/components/SketchView2D.tsx`.
- **Success criteria:**
  - Boolean palette (Cut notch / Extend toggle) appears immediately when polygon drawing starts
  - Live preview shows cut/extend result as points are added
  - Ghost line follows cursor from last placed point
  - Apply button closes polygon and applies operation in one step
  - Escape cancels at any point
