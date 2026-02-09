# Agent Messaging System

**Source:** Extracted from `project-breakdown-system.md` (2026-02-05)
**Status:** Not implemented

## Problem

Current communication channels are ad-hoc:
- `project-management/agent-inbox/` — dump files, agent triages
- `project-management/human-inbox/` — agent outputs, human reviews
- `.orchestrator/shared/notes/` — per-task agent notes, no threading

No addressing, threading, or reply routing. A human can't reply to a specific agent about a specific task. An agent can't ask a question and get a routed response.

## Use Cases

1. Human reviews proposal → sends feedback to the proposer
2. Breakdown agent needs clarification → asks human → reply routes back
3. Human adds context to a task before agent picks it up
4. Agent reports blocker → human responds → agent continues

## Proposed Design

SQLite-backed messaging with file mirrors for visibility.

### Schema

```sql
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    from_addr TEXT NOT NULL,      -- 'human' or agent name
    to_addr TEXT NOT NULL,        -- 'human' or agent name
    re TEXT,                      -- reference: TASK-xxx, PROP-xxx, PROJ-xxx
    subject TEXT,
    body TEXT NOT NULL,
    message_type TEXT DEFAULT 'info',  -- info | question | feedback | blocker
    created_at TEXT,
    read_at TEXT,                 -- NULL if unread
    parent_id TEXT                -- for threading
);
```

### Agent Integration

Agents check for messages at start of run:

```python
messages = get_messages(to=agent_name, unread=True)
for msg in messages:
    if msg.re and msg.re.startswith('TASK-'):
        attach_context_to_task(msg.re, msg.body)
    elif msg.message_type == 'feedback':
        process_feedback(msg)
```

### Slash Commands

| Command | Purpose |
|---------|---------|
| `/send` | Send message to agent or in response to task |
| `/messages` | Show unread messages for human |
| `/thread <id>` | Show message thread |

### Routing Rules

- Message to "human" → human-inbox (file created for visibility)
- Message to specific agent → DB only, agent checks on wake
- Message with `--re TASK-xxx` → attached as context to task
- Message with `--re PROP-xxx` → attached to proposal for curator

## Open Questions

- Should agents pause and wait for a reply, or continue with other work?
- Message retention policy — archive after task/project completion?
- Could a local MTA (sendmail/postfix) be simpler? Probably overkill but standard protocols are nice.
