# Current Priorities

**Last Updated:** 2026-02-03
**Focus Period:** 2D Editor Enhancements

## Primary Focus

Enhance the 2D panel editing experience with better tooling, snapping, and workflow improvements.

## Priority Features

### Ready to Implement

| # | Feature | Spec |
|---|---------|------|
| 1 | **Batch Fillet All Corners** | `project-management/awaiting-clarification/batch-fillet-corners.md` |

### Awaiting Clarification

| # | Feature | Questions At |
|---|---------|--------------|
| 2 | 2D View Legend & Polish | `project-management/awaiting-clarification/2d-view-legend-polish.md` |
| 3 | 2D View Snapping | `project-management/awaiting-clarification/2d-view-snapping.md` |
| 4 | Edge Mirroring | `project-management/awaiting-clarification/edge-mirroring.md` |
| 5 | Cutout Preview Movement | `project-management/awaiting-clarification/cutout-preview-movement.md` |
| 6 | Feature Copy/Paste | `project-management/awaiting-clarification/feature-copy-paste.md` |
| 7 | Clip Mask System | `project-management/awaiting-clarification/clip-mask-system.md` |

**Note:** Batch Fillet extends the existing fillet system to handle ANY corner (cutouts, custom paths, outer corners) - unified approach.

## Work Order

1. **Answer clarifying questions** - Review `awaiting-clarification/` files and answer the questions
2. **Implement clarified features** - As questions are answered, move to implementation

## Feature Summaries

Detailed summaries of each feature from user notes:
- `project-management/classified/features/2026-02-03-2d-view-improvements.md`
- `project-management/classified/features/2026-02-03-shape-drawing-and-clipboard.md`

## Background: Quality of Life Items

These were previously the focus. Defer until 2D editor features are complete:

### Rendering
- Rendering glitches - edges too close (z-fighting)
- Voids rendering strangely

### UI/UX
- Toggle face buttons not showing
- Axis indicator improvements
- Edge selection in 3D view
- Push-pull tool awkwardness

## Not Now

- New operation types
- Performance optimization
- Additional export formats
- Sub-assembly advanced features

## Groomer Guidance

- **Batch Fillet** is ready - can create implementation tasks
- Continue clarifying remaining 6 features in `awaiting-clarification/`
- Once a feature is clarified, create implementation tasks

## PM Guidance

- Focus on getting clarification for blocked features
- Don't start implementation until questions are answered
- Route clarification requests to outbox for user review
