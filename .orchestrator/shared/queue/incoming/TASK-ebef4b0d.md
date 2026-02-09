# [TASK-ebef4b0d] Create /send-to-inbox general-purpose skill

ROLE: orchestrator_impl
PRIORITY: P2
BRANCH: main
CREATED: 2026-02-09T09:01:20.467667
CREATED_BY: human
CHECKS: g,k,-,t,e,s,t,i,n,g,-,o,c,t,o,p,o,i,d

## Context
## Background

Multiple agents need to send notifications to the human inbox (draft aging agent, QA agent, roadmap updater). Currently there is no standard way to do this.

## What to build

### 1. Backing script: project-management/scripts/send-to-inbox.sh

A simple script that appends a message to the human inbox file.

Interface:
  project-management/scripts/send-to-inbox.sh --title "Draft Filed: Foo" --body "message body here"

The inbox file location: check the existing /human-inbox skill in .claude/commands/human-inbox.md to find where messages are stored, and append there. If the file does not exist, create it.

Each message should be timestamped and separated by a horizontal rule.

### 2. Slash command: .claude/commands/send-to-inbox.md

A skill that wraps the script. Agents invoke it to send messages. The command should:
- Accept a title and body
- Call the backing script
- Confirm the message was sent

Keep it simple. The point is to have a stable interface so we can swap the backend later (file to Slack, email, pipe-to-phone) without changing callers.

## Files to create

| File | Purpose |
|------|---------|
| project-management/scripts/send-to-inbox.sh | Backing script |
| .claude/commands/send-to-inbox.md | Slash command for agents |


## Acceptance Criteria
- [ ] Script appends a timestamped message to the inbox file
- [ ] Script creates the inbox file if it does not exist
- [ ] Script is executable and works from the project root
- [ ] Slash command exists and documents the interface
- [ ] All existing orchestrator tests pass
