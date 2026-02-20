# Fix 2D Snapping: Guideline vs Axis Constraint Conflict

**Status:** Idea
**Captured:** 2026-02-20
**Source:** PR #48 / TASK-a6f7f4cf (2D View Snapping System)

## Raw

> 48 had lots of issues but was heading in the right direction. These included: the snapping to guidelines was conflicting with snapping to x, y or diagonal when shift was held down. I think there are 2 separate coordinate systems at work or something.

## Idea

The 2D snapping system implemented in PR #48 has a fundamental conflict between two snapping modes:

1. **Guideline snapping** — snaps cursor/points to nearby guidelines (horizontal/vertical reference lines)
2. **Axis-constrained snapping** — when shift is held, constrains movement to the X axis, Y axis, or 45-degree diagonal from the starting point

These two systems fight each other, possibly because they operate in different coordinate spaces or apply their constraints at different stages of the input pipeline. The result is that holding shift near a guideline produces unpredictable snapping behavior.

## Context

PR #48 implemented a 2D snapping system for the SketchView2D panel editor. The implementation was heading in the right direction but had usability issues that prevented approval. The PR is still open.

## Open Questions

- Are the two snapping systems using different coordinate spaces (e.g., screen vs SVG vs panel-local)?
- At what point in the input pipeline does each snapping system apply its transform?
- Should axis constraints take priority over guidelines, or should they compose (e.g., snap to the nearest guideline that's on the constrained axis)?
- How do other 2D editors (Figma, Illustrator, CAD tools) handle this interaction?

## Possible Next Steps

- Read the PR #48 diff to understand the current snapping architecture
- Map out the coordinate transforms from mouse event → snapped point
- Identify where the two systems diverge (likely one snaps in screen space, the other in model space)
- Design a unified snapping pipeline with clear priority: raw input → axis constraint → guideline snap (or vice versa)
- Write failing tests that reproduce the conflict before fixing
