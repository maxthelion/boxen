# Dashboard: Completed Work Tab

**Status:** Idea
**Captured:** 2026-02-09

## Raw

> "a new view in the octopoid dash that lists recently completed work"
> "existing dashboard has no done column any more. New tab."

## Idea

Add a new tab to the Octopoid dashboard that shows recently completed work. The current Work Board no longer has a DONE column, so there's no visibility into what's been finished. A dedicated tab gives space to show richer detail per task — when it was completed, how many turns it took, who worked on it, whether it was self-merged or human-approved.

## Context

The dashboard was redesigned around four tabs (Work, PRs, Inbox, Agents) but dropped the DONE column from the Work Board to make room. Completed work is only visible via the status script or DB queries. A dedicated tab would make it easy to see what's been accomplished recently and spot patterns (e.g., tasks that took too many turns, frequent recycling).

## Open Questions

- How far back to show — last 24 hours, last 7 days, configurable?
- Should it include failed/recycled tasks or only successful completions?
- Sort order — most recent first, or grouped by project?
- What metadata per entry — turns, commits, time elapsed, merge method (self-merge vs human)?

## Possible Next Steps

- Add a fifth tab key binding (e.g., `D` for Done or `H` for History)
- Query `task_history` table for recent completions
- Show a scrollable list with key stats per task
