# Dashboard Task Detail View

**Status:** Idea
**Captured:** 2026-02-09

## Raw

> "let's make a task view for the octopoid dashboard. This should show the various logs for a task, and the number of turns used etc. Using arrow keys on work board highlights tasks (text yellow). Pressing enter opens task view. esc closes"

## Idea

Add a task detail view to the Octopoid dashboard. On the Work Board tab, arrow keys highlight individual task cards (text turns yellow). Pressing Enter opens a full detail view for that task showing logs, turns used, commits, and other task metadata. Esc closes the detail view and returns to the board.

## Context

The dashboard currently shows task cards on the Work Board but they're display-only — no way to drill into a specific task's history, logs, or progress. The Agents tab has a master-detail pattern already (agent list + detail pane), but the Work tab doesn't have equivalent depth for individual tasks.

## Open Questions

- Should the detail view replace the board (full screen) or overlay it (popup/modal)?
- Which logs to show — agent work log, git log, task file history, all of these?
- Should the detail view allow actions (approve, reject, reassign) or is it read-only?
- How to source the log data — parse agent log files, use DB history, or both?

## Possible Next Steps

- Sketch the detail view layout (ASCII mockup like the existing dashboard draft)
- Implement arrow key navigation on the Work Board with yellow highlight
- Add Enter/Esc key handling to open/close the detail pane
- Wire up data sources: DB task record, agent logs, git commit history
