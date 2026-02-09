# [TASK-f737dc48] Fix z-fighting on bounding box and edge selection strips

ROLE: implement
PRIORITY: P2
COMPLEXITY: S
MAX_TURNS: 100
BRANCH: main
CREATED: 2026-02-06T17:11:11.149780
CREATED_BY: human

## Context
Fix two z-fighting/rendering glitch issues in the 3D view.

See project-management/awaiting-clarification/qol-rendering-glitches.md for full context.

## Issue 1: Bounding box z-fighting

The assembly bounding box (red when idle, yellow during preview) sits exactly on the panel surfaces, causing z-fighting flicker. The bounding box lines need to be offset slightly outward or use depth bias so they render cleanly on top of panels.

Relevant code: The bounding box is likely rendered in src/components/Box3D.tsx or a related 3D component. Look for where the assembly bounds are drawn as a wireframe.

## Issue 2: Edge selection strip z-fighting

Floating strips that indicate an edge can be selected in the 3D view also z-fight with the panel surfaces they sit on. These need similar treatment — slight offset or polygon offset.

Relevant code: Edge selection indicators are rendered in PanelEdgeRenderer.tsx or PanelPathRenderer.tsx.

## Approach

Use whatever technique works best — options include:
- Small positional offset (nudge outward along normal)
- THREE.js polygonOffset / polygonOffsetFactor on materials
- depthTest/depthWrite adjustments
- renderOrder management

The two issues may need different solutions.


## Acceptance Criteria
- [ ] Bounding box renders cleanly without z-fighting flicker
- [ ] Edge selection strips render cleanly without z-fighting
- [ ] Fix works at all camera angles and zoom levels
- [ ] No visual regressions in panel rendering

CLAIMED_BY: impl-agent-1
CLAIMED_AT: 2026-02-06T17:11:18.868497

SUBMITTED_AT: 2026-02-06T17:14:37.888040
COMMITS_COUNT: 1
TURNS_USED: 100

ACCEPTED_AT: 2026-02-08T07:23:27.478035
ACCEPTED_BY: human

ACCEPTED_AT: 2026-02-08T07:37:08.432298
