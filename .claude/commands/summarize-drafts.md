Summarize all drafts in `project-management/drafts/`.

Scan both subdirectories:
- `project-management/drafts/boxen/` — app feature drafts
- `project-management/drafts/octopoid/` — orchestrator/project management drafts

For each `.md` file:

1. Read the full file
2. Determine:
   - **Topic** — 1-sentence summary of what the draft is about
   - **Status** — Is this enacted (implemented), partially enacted, still a plan, or stale?
   - **Likely action** — One of: `archive` (fully enacted), `process` (enacted but may have outstanding items to extract), `enqueue` (good plan, ready to implement), `revise` (stale or needs updating), `discuss` (needs human decision)

Cross-reference with:
- Implemented features in the codebase (check if the described changes exist)
- The orchestrator architecture doc (`orchestrator/docs/architecture.md`)
- Existing rules in `.claude/rules/`

Output two tables, one per subdirectory:

## Boxen Drafts

| Draft | Topic | Status | Likely Action |
|-------|-------|--------|---------------|
| `filename.md` | Brief topic | enacted/partial/plan/stale | archive/process/enqueue/revise/discuss |

## Octopoid Drafts

| Draft | Topic | Status | Likely Action |
|-------|-------|--------|---------------|
| `filename.md` | Brief topic | enacted/partial/plan/stale | archive/process/enqueue/revise/discuss |

Sort by likely action priority: `process` first, then `archive`, `enqueue`, `revise`, `discuss`.
