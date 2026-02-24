# UI Geometry Validator — Show Warnings When Operations Violate Constraints

**Status:** Idea
**Captured:** 2026-02-24

## Raw

> Include geometry validator in UI. Show error messages or warnings when objects created would violate geometric constraints.

## Idea

Surface the geometry validation system (`ComprehensiveValidator`, `PathChecker`, `EdgeExtensionChecker`) in the user-facing UI so that when a user performs an operation that produces invalid geometry, they see a clear warning or error explaining what went wrong.

Currently, geometry validation only runs in tests. The user can create invalid states (overlapping panels, degenerate paths, finger joints that don't align) without any feedback until they try to export or notice visual artifacts.

## What Exists

- `src/engine/validators/ComprehensiveValidator.ts` — validates geometry rules (void bounds, panel sizes, finger joints, slots)
- `src/engine/validators/PathChecker.ts` — path validity (axis-aligned, no duplicates, minimum points)
- `src/engine/validators/EdgeExtensionChecker.ts` — edge extension rules (eligibility, width, corners)
- `src/utils/pathValidation.ts` — detects unrenderable geometry (winding, self-intersection)
- `src/engine/geometryChecker.ts` — core geometry validation
- `project-management/drafts/047-consolidate-error-warning-display.md` — related draft about consolidating error/warning display patterns

## Possible Approaches

### A. Post-operation validation
After every `engine.dispatch()`, run a lightweight subset of validators and show warnings in a toast or status bar. Could be expensive — would need to profile.

### B. Preview-time validation
During preview (before commit), validate the proposed state and show warnings inline near the affected geometry. "This extension would overlap with the adjacent panel."

### C. Export-time validation
Only validate at SVG export time. Show a pre-export report: "2 warnings found" with details. Cheapest option but latest feedback.

### D. Background validation
Run validators on a debounced timer (e.g. 500ms after last change). Show a persistent indicator: green checkmark or orange warning icon in the header.

## Open Questions

- Which validators are cheap enough to run on every operation vs. only on export?
- What's the right UI for warnings — inline near geometry, toast, status bar, panel?
- Should warnings be blocking (prevent export) or advisory (show but allow)?
- How does this interact with the existing error/warning display (draft 111)?
- Should the 2D editor show constraint violations while drawing (e.g. "path crosses existing cutout")?

## Possible Next Steps

- Profile `ComprehensiveValidator.validate()` on a complex assembly to gauge cost
- Design warning UI (could be a simple status indicator to start)
- Implement approach D (background validation with indicator) as MVP
- Expand to preview-time validation for operations that commonly produce invalid geometry
