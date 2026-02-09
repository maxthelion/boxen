# [TASK-c338e19e] Implement serializePanelOperations helper function

ROLE: implement
PRIORITY: P1
BRANCH: feature/dca27809
CREATED: 2026-02-05T15:51:37.290415
CREATED_BY: human
# BLOCKED_BY: 7fc656ad (resolved)

## Context
In `/Users/maxwilliams/dev/boxen/src/utils/urlState.ts`, create a helper function `serializePanelOperations()` that extracts panel operations from engine panels. Follow the pattern of `serializeExtensions()` (lines 246-274) which returns compact format or undefined if empty. The function should: (1) iterate through panels from `assemblySnapshot.panels`, (2) extract `props.cornerFillets`, `props.allCornerFillets`, `props.cutouts` from each panel, (3) convert to compact SerializedPanelOps format, (4) return Record<panelId, SerializedPanelOps> or undefined if no operations. Use the `r()` helper (line 166) to round numbers to 2 decimal places.

## Acceptance Criteria
- [ ] serializePanelOperations() function created following serializeExtensions() pattern
- [ ] Returns undefined when no panel operations exist (omitted from JSON)
- [ ] Converts CornerFillet[] to compact Record<cornerKey, radius>
- [ ] Converts AllCornerFillet[] to compact Record<cornerId, radius>
- [ ] Converts Cutout[] to compact SerializedCutout[]

CLAIMED_BY: impl-agent-1
CLAIMED_AT: 2026-02-05T17:42:57.159996

SUBMITTED_AT: 2026-02-05T17:46:52.792916
COMMITS_COUNT: 1
TURNS_USED: 50
