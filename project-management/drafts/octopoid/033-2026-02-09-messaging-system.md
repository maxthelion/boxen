# Messaging System

**Status:** Idea
**Captured:** 2026-02-09

## What Messages Are

Messages are the human-in-the-loop mechanism. They summarize actions that can be taken on other entities (tasks, drafts, projects) and let the human respond minimally to keep things moving.

Messages follow the same file+DB pattern as everything else:

| Entity | Content | Status |
|---|---|---|
| Message | `project-management/human-inbox/<id>.md` | `messages` table |

File stays in one place. DB tracks lifecycle (pending, responded, resolved, dismissed).

## Why This Matters

Current bottleneck: agent produces output -> human has to context-switch to act on it manually -> things pile up. The human-inbox is notification-only — informational dead ends.

With actionable messages, the human's job reduces to answering questions and saying yes/no. The system handles execution.

This also solves several dead ends in the current system:
- **Proposed-tasks** go nowhere — instead, draft-processor sends a message with an `enqueue` action
- **Agent recommendations** pile up — instead, agents send messages with proposed actions
- **Stale drafts** sit — instead, draft-processor sends a message asking what to do

## Message Structure

A message contains one or more **actions**. Each action references an entity and proposes something to do with it.

### Schema

```sql
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    from_agent TEXT NOT NULL,       -- which agent created this
    status TEXT DEFAULT 'pending',  -- pending | responded | resolved | dismissed
    file_path TEXT,                 -- markdown file with full content
    created_at TEXT,
    resolved_at TEXT
);

CREATE TABLE message_actions (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES messages(id),
    action_type TEXT NOT NULL,      -- enqueue | approve | reject | clarify | update | dismiss
    target_type TEXT,               -- task | draft | project | NULL
    target_id TEXT,                 -- entity ID if applicable
    summary TEXT NOT NULL,          -- one-line description of what's proposed
    status TEXT DEFAULT 'awaiting', -- awaiting | accepted | rejected | skipped
    response TEXT,                  -- human's response text
    responded_at TEXT,
    FOREIGN KEY (message_id) REFERENCES messages(id)
);
```

### File Format

```markdown
# Draft Aging: 13 drafts processed

**From:** draft-processor
**Created:** 2026-02-09

## Summary

Processed 13 drafts older than 3 days. 4 have open questions, 2 look ready to enqueue.

## Actions

### ACTION-1: Enqueue visibility system fix
**Type:** enqueue
**Target:** draft — drafts/boxen/visibility-system.md
**Proposed:** Create task "Fix visibility system UUID migration" (P1, implement)
**Response:** _awaiting_

### ACTION-2: Clarify event sourcing checkpoint frequency
**Type:** clarify
**Target:** draft — drafts/boxen/event-sourcing-proposal.md
**Question:** What checkpoint frequency? (proposed: every 10 commands)
**Response:** _awaiting_

### ACTION-3: Archive stale color system draft
**Type:** dismiss
**Target:** draft — drafts/boxen/color-system-plan.md
**Reason:** Superseded by theme system implementation
**Response:** _awaiting_
```

## How the Human Responds

Two modes, depending on context:

### Via phone (pipe-it-to-my-screen)

Agent sends message summary via pipe CLI. Human responds with short text. Responder agent parses response and matches to actions.

### Via Claude Code session

`/inbox` shows pending messages. Human responds inline:
- `approve 1` or `yes 1` — accept action 1
- `skip 2` — dismiss action 2
- `1: every 10 commands is fine` — respond to action 1 with text

### Via file edit (async, from phone or editor)

Human edits the `**Response:**` field directly in the markdown file. Responder agent detects the change.

## Responder Agent

A lightweight periodic agent that:

1. Queries `message_actions WHERE status = 'awaiting'`
2. Checks if the corresponding file has been edited (response field changed)
3. For each responded action, executes it:
   - **enqueue** -> `create_task()` with the proposed details
   - **approve** -> run approval flow on target entity
   - **reject** -> reject target entity with response as reason
   - **clarify** -> update target document with the answer
   - **update** -> apply the described change to target entity
   - **dismiss** -> mark as resolved, no further action
4. Updates `message_actions.status` and `messages.status`

## Action Types

| Type | What it does | Human response |
|---|---|---|
| `enqueue` | Create a task from a proposal | "yes" / "no" / "yes but P2 not P1" |
| `approve` | Approve a task, draft, or PR | "yes" / "not yet, needs X" |
| `reject` | Reject with feedback | "yes" / "no, it's fine" |
| `clarify` | Answer an open question | Free text answer |
| `update` | Modify an entity | "yes" / "no" / alternative |
| `dismiss` | Archive or close something | "yes" / "keep it" |

## Who Sends Messages

Any agent can send a message. Common senders:

- **draft-processor** — "these drafts are old, what should we do?"
- **proposer agents** — "I found this issue, should we fix it?"
- **gatekeeper agents** — "QA failed, here's what I found" (ESCALATE cases)
- **scheduler** — "these tasks are blocked/stuck, need human input"
- **breakdown agent** — "this task is too vague, need clarification"

## Relationship to Other Entities

Messages don't replace entities — they reference them. A message says "here's a draft, should we enqueue it?" The draft stays a draft. If the human says yes, the responder creates a task and links it.

```
Message ──references──> Draft, Task, Project
         proposes action on ^
Human responds
         ↓
Responder executes action on entity
```

## Open Questions

- Should messages have priority? (P0 message = needs response today)
- Expiry — do unresponded messages auto-dismiss after N days?
- Batching — should the draft-processor send one message with 13 actions, or 13 messages with 1 action each? (Probably batched — less noise)
- Should the responder be its own agent role, or a mode of the inbox-poller?
