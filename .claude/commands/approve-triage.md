# Approve Inbox Triage

Process an approved triage proposal from the human-inbox.

## Usage

```
/approve-triage [proposal-file]
```

If no file specified, uses the most recent triage proposal in `project-management/human-inbox/`.

## What This Does

1. Reads the triage proposal from `project-management/human-inbox/`
2. For each item in the proposal:
   - Creates the summary files in `project-management/drafts/boxen/` as specified
   - Archives original files to `project-management/processed/`
   - Updates `current-priorities.md` if applicable
3. Moves the processed proposal to `project-management/processed/`

## Instructions

Read the specified triage proposal (or find the most recent `*-inbox-triage.md` in `project-management/human-inbox/`).

For each proposed action:

### For feature/architectural/bug summaries:
- Create the markdown file in the specified `project-management/drafts/boxen/` subdirectory
- Include a proper header with source file, date, and category
- Summarize the content as described in the proposal

### For priority updates:
- Read current `.orchestrator/current-priorities.md`
- Apply the changes described in the proposal
- Update the "Last Updated" timestamp

### For all items:
- Move the original inbox file to `project-management/processed/`
- Use `mv` command via Bash

### After processing:
- Move the triage proposal itself to `project-management/processed/`
- Report what was done

## Example

```
/approve-triage project-management/human-inbox/2026-02-03-1906-inbox-triage.md
```

Creates all proposed files and archives originals.
