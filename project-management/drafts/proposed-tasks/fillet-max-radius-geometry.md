# Proposed Tasks from: fillet-max-radius-geometry.md

**Source:** project-management/drafts/boxen/fillet-max-radius-geometry.md
**Processed:** 2026-02-09

## Task 1: Fix fillet max radius calculation

- **Title:** Fix incorrect max fillet radius calculation to use tangent-based formula
- **Role:** implement
- **Priority:** P2
- **Complexity:** M
- **Description:** The current `calculateMaxFilletRadius()` in `src/utils/allCorners.ts` may be using incorrect angle calculations and an arbitrary 0.8 safety factor. Replace with the proper tangent-based formula: `max_radius = min(edge_a_length, edge_b_length) / tan(θ/2)` with a 0.95 safety factor. Also account for adjacent fillets sharing an edge (reduce available edge length). Key files: `src/utils/allCorners.ts` (`calculateMaxFilletRadius`, `generateFilletArc`), `src/engine/nodes/BasePanel.ts` (`applyFilletsToOutline`).
- **Success criteria:**
  - `calculateMaxFilletRadius` uses correct tangent-based formula
  - Adjacent fillets on shared edges are accounted for
  - Integration tests verify: 90° corners (equal/unequal edges), adjacent corners, corners at extension geometry
  - No "No free length on adjacent edges" errors on corners that visually have space
