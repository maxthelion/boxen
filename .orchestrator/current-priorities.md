# Current Priorities

**Last Updated:** 2026-02-03
**Focus Period:** 2D Editor Enhancements + Quality of Life

## Primary Focus

Enhance the 2D panel editing experience with better tooling, snapping, and workflow improvements. Also address quality of life issues from user notes.

## Priority Features

### Ready to Implement

| # | Feature | Spec |
|---|---------|------|
| 1 | **Batch Fillet All Corners** | `project-management/drafts/boxen/batch-fillet-corners.md` |

### Awaiting Clarification - 2D Editor Features

| # | Feature | Questions At |
|---|---------|--------------|
| 2 | 2D View Legend & Polish | `project-management/drafts/boxen/2d-view-legend-polish.md` |
| 3 | 2D View Snapping | `project-management/drafts/boxen/2d-view-snapping.md` |
| 4 | Edge Mirroring | `project-management/drafts/boxen/edge-mirroring.md` |
| 5 | Cutout Preview Movement | `project-management/drafts/boxen/cutout-preview-movement.md` |
| 6 | Feature Copy/Paste | `project-management/drafts/boxen/feature-copy-paste.md` |
| 7 | Clip Mask System | `project-management/drafts/boxen/clip-mask-system.md` |

### Awaiting Clarification - Quality of Life

| # | Feature | Questions At |
|---|---------|--------------|
| 8 | Rendering Glitches (z-fighting) | `project-management/drafts/boxen/qol-rendering-glitches.md` |
| 9 | Voids Rendering Strangely | `project-management/drafts/boxen/qol-voids-rendering.md` |
| 10 | Toggle Face Buttons Not Showing | `project-management/drafts/boxen/qol-toggle-face-buttons.md` |
| 11 | Axis Indicator Style | `project-management/drafts/boxen/qol-axis-indicator.md` |
| 12 | Feet as Panel Operations | `project-management/drafts/boxen/qol-feet-as-operations.md` |
| 13 | Lid Tab Direction | `project-management/drafts/boxen/qol-lid-tab-direction.md` |
| 14 | Edge Selection in 3D | `project-management/drafts/boxen/qol-edge-selection-3d.md` |
| 15 | Move Tool on Edges | `project-management/drafts/boxen/qol-move-tool-edges.md` |
| 16 | Inset Tool Rename | `project-management/drafts/boxen/qol-inset-tool-rename.md` |
| 17 | Push-Pull Tool Awkward | `project-management/drafts/boxen/qol-push-pull-awkward.md` |

**Note:** Batch Fillet extends the existing fillet system to handle ANY corner (cutouts, custom paths, outer corners) - unified approach.

## Work Order

1. **Answer clarifying questions** - Review `drafts/boxen/` files and answer the questions
2. **Implement clarified features** - As questions are answered, move to implementation

## Feature Summaries

Detailed summaries of each feature from user notes:
- `project-management/classified/features/2026-02-03-2d-view-improvements.md`
- `project-management/classified/features/2026-02-03-shape-drawing-and-clipboard.md`

## Not Now

- New operation types
- Performance optimization
- Additional export formats
- Sub-assembly advanced features

## Groomer Guidance

- **Batch Fillet** is ready - can create implementation tasks
- Continue clarifying remaining features in `drafts/boxen/`
- Once a feature is clarified, create implementation tasks

## PM Guidance

- Focus on getting clarification for blocked features
- Don't start implementation until questions are answered
- Route clarification requests to outbox for user review
