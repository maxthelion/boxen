---
**Processed:** 2026-02-09
**Mode:** human-guided
**Actions taken:**
- Enqueued TASK-f6f1f6e0: Create /send-to-inbox general-purpose skill
- Enqueued TASK-1e65a189: Implement draft aging agent (role + prompt), blocked by f6f1f6e0
- Updated /process-draft with automated mode (open questions block task creation)
- Added duplicate detection to /draft-idea
**Outstanding items:** none
---

# Draft Aging Agent

**Status:** Idea (decisions made, ready to build)
**Captured:** 2026-02-09

## Raw

> "set up an agent that is spawned if there are drafts more than 3 days old. Runs the /process-draft skill on them and sends a message to human inbox. Sending a message there should be a skill with a script. We may want to change the behaviour in future"

## Idea

A scheduled agent that monitors the drafts directories for stale drafts (older than 3 days from creation). When it finds them, it runs `/process-draft` in automated mode on each one — extracting rules, identifying outstanding work, adding a processing summary — then auto-archives the draft and sends a notification to the human inbox.

The inbox message is the key artifact. It must contain everything the human needs to either accept the filing or reverse it.

The human inbox notification should be implemented as a general-purpose `/send-to-inbox` skill backed by a script, so the delivery mechanism can be swapped out later (e.g. from file-based inbox to Slack, email, or pipe-to-phone). Other agents will use this too (QA agent, roadmap updater, etc.).

## Context

Drafts accumulate and go stale. The current flow is human-triggered (`/process-draft`), which means drafts sit until someone remembers to process them. This agent would enforce a "drafts don't linger" policy — either they get acted on or they get archived with a summary of why they were parked.

This is designed for ideas captured in the moment — quick notes that need filing, not long-lived design documents.

Pairs with the recently added processing summary in `/process-draft` (mode: `automated` vs `human-guided`).

## Decisions

| Question | Decision |
|----------|----------|
| Auto-archive or wait? | **Auto-archive.** The inbox message includes steps to reverse (move back to drafts). |
| Threshold? | **3 days from creation date** (from `Captured:` header or filename date). |
| All at once or one per run? | **All stale drafts in one run.** They're small, processing is lightweight. |
| In-progress drafts? | **Skip** anything with `Status: In Progress`. Only process `Idea` or no-status drafts. |
| `/send-to-inbox` scope? | **General-purpose skill.** Any agent can send messages to the human inbox. |
| Inbox message format? | **File-based is fine** for now. The skill wrapper means we can swap the backend later. |

## Key Insight: Open Questions Block Task Creation

If a draft has unresolved open questions, the agent should **not** propose tasks. Instead:

1. Surface the open questions in the inbox message for the human to answer
2. The draft still gets archived (it's been filed), but the inbox message makes clear that decisions are needed before work can start
3. Only drafts with a clear path forward (no blocking open questions) get proposed tasks written to `project-management/drafts/proposed-tasks/`

This prevents the system from queuing up work that's half-baked.

## Inbox Message Format

Each processed draft produces an inbox entry like:

```
## Draft Filed: <title>
**Source:** <filename> → archived to <archive path>
**Age:** <N> days

### Summary
<1-2 sentence description of the idea>

### Open Questions (need your input)
- <question 1>
- <question 2>

### Proposed Tasks (if no blocking questions)
- <task title> (role: implement, P2)
- <task title> (role: orchestrator_impl, P2)

### Proposed Rules
- <rule summary> → <destination file>

### To Reverse
To move this draft back to active:
`mv project-management/archive/<subdir>/<file> project-management/drafts/<subdir>/<file>`
```

## Possible Next Steps

1. Create `/send-to-inbox` skill backed by a script — simple interface: title + body. File-based for now.
2. Add `draft_processor` agent role to `agents.yaml` with a daily schedule.
3. Write the agent prompt: list drafts, check creation dates, run `/process-draft` in automated mode on stale ones, send inbox summary.
4. Update `/process-draft` automated mode: when open questions exist, include them in output but do NOT write proposed tasks.
