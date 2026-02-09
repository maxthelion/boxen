# Task Completion Workflow

When finishing a task, follow this cleanup process:

## 1. Identify Related Documents

Check for documents that were used during the task:
- Plans in `docs/` or `.claude/plans/`
- Drafts in `project-management/drafts/boxen/` or `project-management/drafts/octopoid/`
- Task files in `.orchestrator/shared/queue/`

## 2. Review and Extract Outstanding Work

Before archiving, read through each document and look for:
- Unfinished items or TODOs
- "Future work" or "Next steps" sections
- Recommendations that weren't implemented
- Open questions that weren't resolved

## 3. Capture Outstanding Work

For each outstanding item found:
1. Create a new draft in `project-management/drafts/boxen/` or `project-management/drafts/octopoid/` (whichever is appropriate)
2. Use descriptive filename: `<topic>-<brief-description>.md`
3. Include context about where it came from

Example:
```markdown
# Outstanding: Shared Operations Infrastructure

**Source:** fillet-all-corners-fix.md (completed 2026-02-05)

## Description
The 2D and 3D views could share more operation infrastructure...

## Recommendation
[Copy relevant content from original document]
```

## 4. Move Completed Documents

Move completed documents to their respective `done/` folders:
- `project-management/archive/boxen/` or `project-management/archive/octopoid/`
- `docs/done/` (if applicable)

## 5. Suggest to User

When a task completes, proactively suggest:
> "Task complete. Should I move [document] to done? I noticed [X outstanding items] - want me to capture those as separate drafts?"

This ensures nothing falls through the cracks when closing out work.
