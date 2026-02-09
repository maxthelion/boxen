# /draft-idea - Capture an Idea as a Draft

Capture a rough idea, observation, or suggestion as a draft document for later consideration.

**Argument:** A topic name and/or description of the idea (e.g. `agent progress tracking - we should log where agents spend their turns`)

## Steps

### 1. Parse the input

Extract:
- **Topic** — a short slug for the filename (e.g. `agent-progress-tracking`)
- **Idea** — the user's description, however rough

### 2. Check for duplicates

Before creating anything, scan existing drafts in both `project-management/drafts/boxen/` and `project-management/drafts/octopoid/` for ideas that overlap with this one. Read filenames and titles — if something looks similar, read the draft to confirm.

If a duplicate or near-duplicate exists:
- Tell the user which draft already covers this idea
- Ask whether to: update the existing draft with the new details, or create a new one anyway
- Do **not** increment the counter or create a file until the user confirms

### 3. Classify the idea

Determine whether the idea is about:
- **Boxen** (the app) — features, geometry, UI, 2D/3D editing, SVG export, share links, testing the app
- **Octopoid** (the orchestrator) — agents, task queue, scheduling, gatekeepers, breakdowns, dashboard, project management tooling

### 4. Generate the filename

Run the helper script to get the next filename:

```bash
project-management/scripts/next-draft.sh <boxen|octopoid> <topic-slug>
```

This reads and increments the shared counter at `project-management/drafts/.counter`, and outputs the full path like `project-management/drafts/boxen/025-2026-02-08-agent-progress-tracking.md`.

### 5. Write the draft

Create the file at the path returned by the script.

Content:

```markdown
# <Title>

**Status:** Idea
**Captured:** <date>

## Raw

> <The user's exact words, quoted verbatim>

## Idea

<User's description, cleaned up slightly but preserving their intent>

## Context

<Why this came up — reference the conversation or situation if obvious>

## Open Questions

- <Questions that would need answering before this becomes actionable>

## Possible Next Steps

- <What acting on this might look like — tasks, investigations, design docs>
```

Keep it concise. The point is to park the idea, not design the solution.

### 6. Confirm

Tell the user the file was created and suggest committing it.
