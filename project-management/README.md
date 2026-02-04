# Project Management

This directory manages the flow of ideas, feedback, and feature requests from raw input to actionable tasks.

## Directory Structure

```
project-management/
├── inbox/              # Raw input (photos, notes, voice memos)
├── outbox/             # Items to send to human (proposals, questions)
├── processed/          # Archived input after triage
├── classified/         # Organized by category
│   ├── features/       # Feature requests
│   ├── bugs/           # Bug reports
│   ├── architectural/  # Architecture decisions
│   ├── priorities/     # Priority discussions
│   └── other/          # Everything else
├── awaiting-clarification/  # Items needing human input
├── human-inbox/        # Proposals/questions for human review
└── agent-inbox/        # Messages from orchestrator agents
```

## Workflow

### 1. Input → Inbox
Drop raw items into `inbox/`:
- Photos of handwritten notes
- Voice memo transcripts
- Quick ideas

### 2. Triage (inbox-poller agent)
The `inbox-poller` agent processes inbox items:
- Summarizes content
- Extracts individual items
- Moves to `classified/` by category
- Archives original to `processed/`

### 3. Clarification
Items needing more detail go to `awaiting-clarification/` with:
- Summary of what's known
- Specific questions to answer
- Checkbox options for quick decisions

### 4. Human Review
Agents put proposals in `human-inbox/` when they need approval:
- Refactoring proposals
- Architecture decisions
- Questions that need human judgment

Use `/approve-triage` to review and act on these.

### 5. Task Creation
Once clarified, items become tasks in `.orchestrator/shared/queue/incoming/`.

## Key Files

| Directory | Purpose |
|-----------|---------|
| `inbox/` | Drop zone for raw input |
| `outbox/` | Notifications to send to human |
| `awaiting-clarification/` | Features needing more detail before implementation |
| `human-inbox/` | Agent proposals awaiting human review |
| `agent-inbox/` | Messages/warnings from agents |

## Related Commands

- `/approve-triage` - Review and approve triaged items
- `/enqueue` - Create a task directly
- `/queue-status` - See current task queue
