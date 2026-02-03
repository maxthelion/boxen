# View Outbox

Show pending items in the outbox that need user attention.

## Usage

```
/outbox [item]
```

- No argument: List all outbox items with summaries
- With argument: Show full content of specified item

## Instructions

### List mode (no argument)

1. List files in `outbox/` (excluding .gitkeep)
2. For each file, show:
   - Filename
   - Type (triage proposal, question, etc.)
   - Brief summary (first few lines or item count)
3. Suggest next actions (e.g., `/approve-triage` for triage proposals)

### View mode (with argument)

1. Read and display the full content of the specified file
2. If it's a triage proposal, summarize the proposed actions
3. Suggest available commands

## Item Types

- `*-inbox-triage.md` - Triage proposals from inbox-poller (approve with `/approve-triage`)
- `*-question.md` - Questions from agents needing user input
- Other files - Agent messages or requests

## Example Output

```
## Outbox (2 items)

1. **2026-02-03-1906-inbox-triage.md** (Triage Proposal)
   3 inbox items → 7 feature summaries proposed
   → Use `/approve-triage` to process

2. **2026-02-03-1845-question.md** (Question)
   From: backlog-groomer
   Re: Clarification on feature scope
```
