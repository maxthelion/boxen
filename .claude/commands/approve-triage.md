# Approve Inbox Triage

Process an approved triage proposal from the outbox.

## Usage

```
/approve-triage [proposal-file]
```

If no file specified, uses the most recent triage proposal in `outbox/`.

## What This Does

1. Reads the triage proposal from `outbox/`
2. For each item in the proposal:
   - Creates the summary files in `classified/` as specified
   - Archives original files to `processed/`
   - Updates `current-priorities.md` if applicable
3. Moves the processed proposal to `processed/`

## Instructions

Read the specified triage proposal (or find the most recent `*-inbox-triage.md` in `outbox/`).

For each proposed action:

### For feature/architectural/bug summaries:
- Create the markdown file in the specified `classified/` subdirectory
- Include a proper header with source file, date, and category
- Summarize the content as described in the proposal

### For priority updates:
- Read current `.orchestrator/current-priorities.md`
- Apply the changes described in the proposal
- Update the "Last Updated" timestamp

### For all items:
- Move the original inbox file to `processed/`
- Use `mv` command via Bash

### After processing:
- Move the triage proposal itself to `processed/`
- Report what was done

## Example

```
/approve-triage outbox/2026-02-03-1906-inbox-triage.md
```

Creates all proposed files and archives originals.
