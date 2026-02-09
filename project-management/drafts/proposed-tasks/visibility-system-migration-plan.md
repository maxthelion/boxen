# Proposed Tasks from: visibility-system-migration-plan.md

**Source:** project-management/drafts/boxen/visibility-system-migration-plan.md
**Processed:** 2026-02-09

## Task 1: Fix show/hide/isolate buttons not appearing

- **Title:** Fix visibility system to use UUIDs instead of semantic panel IDs
- **Role:** implement
- **Priority:** P1
- **Complexity:** M
- **Description:** The visibility and selection systems use different ID formats, causing show/hide/isolate buttons to never appear. Selection uses engine UUIDs but visibility checks for semantic IDs like "face-front" which never match. Phase 1: Fix Box3D.tsx to look up panel source info from engine panels instead of parsing semantic IDs (lines 49-57, 221). Phase 2: Fix visibilitySlice.ts to use visibility keys instead of MAIN_FACE_PANEL_IDS. Phase 3: Update types.ts constants. Phase 4: Remove semantic ID fallback code from BoxTree.tsx, Viewport3D.tsx, selection.ts.
- **Success criteria:**
  - Select face panel → Hide/Show/Isolate buttons appear
  - Hide button hides the panel
  - Show button brings it back
  - Isolate shows only selected panel
  - Works for main assembly faces, sub-assembly faces, and divider panels
  - No semantic ID fallback code remains
