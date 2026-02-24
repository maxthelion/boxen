# Corner Ownership Rule in 2D Edge Path Extensions

**Status:** Idea
**Captured:** 2026-02-24

## Raw

> That rule also needs to apply when panel edges are extended in the 2D viewer. Make a note of that as a separate draft that needs discussing.

## Idea

The corner ownership rule ("when two adjacent panels both extend, female yields by MT") currently only applies (or fails to apply — see draft #150) in the 3D offset operation. The same rule must also be enforced when edges are extended via the 2D sketch editor's edge path drawing tool.

In the 2D editor, a user draws a path along a panel edge to extend it. If an adjacent panel already has an extension, the new extension should automatically yield at the corner (or the existing one should be updated to yield). This is a cross-panel constraint — the 2D editor is editing one panel but the constraint depends on the state of a neighbouring panel.

## Context

Related to draft #150 (edge extension corner overlap in 3D). That draft covers the base geometry rule not being enforced. This draft raises the additional question of how to enforce it in the 2D editing context, which is a different code path.

## Open Questions

- When does the yield get applied? At draw time (prevent the user from drawing into the corner)? Or at commit time (trim the path automatically)?
- Should the 2D editor show a visual indicator that the corner is claimed by the adjacent panel?
- What happens if the user draws an extension in 2D and the adjacent panel doesn't have an extension yet, but later gets one? Does the first extension retroactively get trimmed?
- Is this the same engine-level validation (just enforced at a different entry point), or does it need separate 2D-specific logic?
