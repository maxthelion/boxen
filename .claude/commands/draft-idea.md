# /draft-idea - Capture an Idea as a Draft

Capture a rough idea, observation, or suggestion as a draft document for later consideration.

**Argument:** A topic name and/or description of the idea (e.g. `agent progress tracking - we should log where agents spend their turns`)

## Steps

### 1. Parse the input

Extract:
- **Topic** — a short slug for the filename (e.g. `agent-progress-tracking`)
- **Idea** — the user's description, however rough

### 2. Write the draft

Create `project-management/drafts/<topic>.md` with:

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

### 3. Confirm

Tell the user the file was created and suggest committing it.
