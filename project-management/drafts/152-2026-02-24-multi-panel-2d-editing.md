# Multi-Panel 2D Editing — Selection, Compatibility Rules, Toolbar Button

**Status:** Idea
**Captured:** 2026-02-24

## Raw

> Multiple panels can be selected for editing in 2D. There should be a button in the toolbar on 3D view for editing faces. Selecting faces and pressing it launches 2D view with multiple faces selected on the sidebar (see draft 144). A rule should apply that panels need to have the same dimensions to be edited together. They also need to be of compatible types. All faces around the assembly's axis can be edited together, as can top and bottom. If top and bottom have different gendered edges then they will be incompatible for custom edge paths. Panels from different assemblies can be edited together if they are of the same dimensions.

## Idea

Add a "Edit in 2D" toolbar button to the 3D view. The user selects multiple panels in 3D, presses the button, and the 2D editor opens with all selected panels listed in the sidebar (see draft #144 for sidebar design). Edits made in 2D apply to all selected panels simultaneously.

### Compatibility Rules

Panels must pass compatibility checks to be edited together:

1. **Same dimensions** — panels must have identical width × height to share a 2D canvas
2. **Compatible types** — determines which panels can be grouped:
   - **Axis-ring faces** (front, back, left, right) — all compatible with each other (same height, width = depth or width depending on face, but normalised to the panel's local coordinate system)
   - **Cap faces** (top, bottom) — compatible with each other
   - Axis-ring and cap faces are NOT compatible (different dimensions)
3. **Edge gender compatibility** — if top and bottom have different gendered edges (e.g. one has male tabs where the other has female slots), they are incompatible for custom edge path operations (the edge paths would need to be different)
4. **Cross-assembly** — panels from different assemblies CAN be edited together if they share the same dimensions

### Toolbar UX

- Select panels in 3D (click, shift-click)
- "Edit in 2D" button appears in toolbar when ≥1 panel selected
- If incompatible panels are selected, button shows a tooltip explaining why
- Launching 2D view populates the sidebar (draft #144) with all selected panels

## Context

Currently the 2D editor works on a single panel at a time. Batch editing would be a major workflow improvement — e.g. drawing the same cutout on all four walls of a box, or adding matching edge paths to front and back panels. Related to draft #144 (2D editor sidebar design) which defines the panel list UI.

## Open Questions

- How are dimensions compared? Exact match, or within tolerance?
- When editing multiple panels, does the 2D canvas show one panel with an indicator that edits apply to N panels, or does it show all panels stacked/tabbed?
- For edge gender incompatibility: should the UI still allow selection but disable edge path tools, or prevent selection entirely?
- What about divider panels — can they be batch-edited with face panels if dimensions match?
- How does undo work across multi-panel edits? One undo reverses the change on all panels?

## Possible Next Steps

- Design the selection → validation → launch flow (could be a state machine)
- Define the compatibility checker as a pure function (testable)
- Extend the 2D editor to accept a list of panel IDs instead of a single one
- Integrate with draft #144 sidebar design
