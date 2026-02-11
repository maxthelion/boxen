# Octopoid Slash Command Inventory

**Date:** 2026-02-11
**Purpose:** Inventory all orchestrator-related slash commands and propose v2.0 namespacing
**Context:** Planning migration from v1.x to v2.0

---

## Current v1.x Commands

### Task Management (13 commands)

| v1.x Command | Purpose | v2.0 Proposed Name |
|--------------|---------|-------------------|
| `/enqueue` | Create task interactively | `octo:create-task` or `octo:enqueue` |
| `/create-task` | Create task programmatically | `octo:create-task` (primary) |
| `/approve-task` | Approve and merge task | `octo:approve` |
| `/reject-task` | Reject task with feedback | `octo:reject` |
| `/reset-task` | Reset task to incoming | `octo:reset-task` |
| `/hold-task` | Park task in escalated queue | `octo:hold` |
| `/retry-failed` | Retry failed tasks | `octo:retry-failed` |
| `/decompose-task` | Break down complex task | `octo:breakdown` |
| `/queue-status` | Show queue state | `octo:queue` |
| `/check-orchestrator-task` | Review orchestrator task | `octo:review-orch-task` (or remove if obsolete) |
| `/audit-completions` | Detect failed explorer tasks | `octo:audit` |
| `/qa-check` | Run visual QA on task | `octo:qa` |
| `/record-check` | Record gatekeeper check result | `octo:record-check` |

### Agent Management (6 commands)

| v1.x Command | Purpose | v2.0 Proposed Name |
|--------------|---------|-------------------|
| `/agent-status` | Show agent states | `octo:agents` |
| `/add-agent` | Add new agent | `octo:add-agent` |
| `/pause-agent` | Pause/resume agent | `octo:pause-agent` |
| `/kill-agent` | Kill and clean up agent | `octo:kill-agent` |
| `/kill-all-agents` | Kill all agents | `octo:kill-all` |
| `/pause-system` | Pause/resume entire system | `octo:pause` |

### Configuration (2 commands)

| v1.x Command | Purpose | v2.0 Proposed Name |
|--------------|---------|-------------------|
| `/tune-intervals` | Adjust agent wake intervals | `octo:tune-intervals` |
| `/tune-backpressure` | Adjust queue limits | `octo:tune-limits` |

### Status & Reporting (3 commands)

| v1.x Command | Purpose | v2.0 Proposed Name |
|--------------|---------|-------------------|
| `/orchestrator-status` | Comprehensive status | `octo:status` |
| `/today` | Show today's activity | `octo:today` |
| `/whats-next` | Surface actionable items | `octo:next` |

### Project Management (4 commands)

| v1.x Command | Purpose | v2.0 Proposed Name |
|--------------|---------|-------------------|
| `/drafts-list` | List all drafts | `octo:drafts` |
| `/draft-idea` | Capture new draft | `octo:draft` |
| `/process-draft` | Process draft into action | `octo:process-draft` |
| `/send-to-inbox` | Send item to inbox | `octo:inbox-send` (or remove - inboxes deferred) |
| `/human-inbox` | View human inbox | `octo:inbox` (or remove - inboxes deferred) |

### Workflow Tools (2 commands)

| v1.x Command | Purpose | v2.0 Proposed Name |
|--------------|---------|-------------------|
| `/postmortem` | Create process failure analysis | `octo:postmortem` |
| `/reflect` | Reflect on what just happened | `octo:reflect` |

### Boxen-Specific (2 commands - NOT octopoid)

| Command | Purpose | Notes |
|---------|---------|-------|
| `/parse-share-link` | Parse Boxen share link | Keep as-is (Boxen app feature) |
| `/generate-share-link` | Generate Boxen share link | Keep as-is (Boxen app feature) |
| `/preview-pr` | Preview PR in browser | Keep as-is (Boxen app feature) |

---

## Total Count

- **Octopoid commands:** 32 total
- **Boxen app commands:** 3 total
- **Grand total:** 35 slash commands

---

## Namespacing Strategy

### Option 1: `octo:` Prefix (Recommended)

**Pros:**
- Clear separation (octo vs app commands)
- Prevents naming conflicts
- Easy to discover (`/octo:<tab>` for autocomplete)
- Consistent with Docker-style namespacing

**Cons:**
- More typing (8 extra characters per command)
- Migration effort (update all command references)

**Example:**
```
/octo:create-task "Fix bug"
/octo:queue
/octo:status
/octo:approve abc123
```

### Option 2: No Prefix, Rename for Clarity

**Pros:**
- Less typing
- Simpler command names

**Cons:**
- Potential naming conflicts (e.g., `/status` could mean app or orchestrator)
- Harder to discover octopoid-specific commands

**Example:**
```
/task-create "Fix bug"
/task-queue
/octo-status  # Still need prefix for some
/task-approve abc123
```

### Option 3: Hybrid (Short Aliases + Full Names)

**Pros:**
- Best of both worlds (short for common, namespaced for disambiguation)
- Power users can use aliases, newcomers use full names

**Cons:**
- More complex (two ways to do everything)
- Documentation burden

**Example:**
```
# Short aliases
/eq "Fix bug"        # alias for /octo:enqueue
/q                   # alias for /octo:queue
/st                  # alias for /octo:status

# Full names
/octo:enqueue "Fix bug"
/octo:queue
/octo:status
```

---

## Recommendation

**Use Option 1: `octo:` prefix for all Octopoid commands**

### Rationale

1. **Clarity:** Immediately obvious which commands are orchestrator-related
2. **Future-proof:** If Boxen adds more automation (e.g., `test:`, `deploy:`), namespacing is established
3. **Discoverability:** Type `/octo:` and see all orchestrator commands
4. **Clean migration:** Search-replace `/enqueue` → `/octo:enqueue` across docs

### Proposed Namespace Convention

```
octo:create-task     # Task creation (primary)
octo:enqueue         # Task creation (interactive) - alias for create-task?
octo:queue           # Queue status
octo:status          # Full orchestrator status
octo:agents          # Agent status
octo:approve         # Approve task
octo:reject          # Reject task
octo:breakdown       # Break down task
octo:drafts          # List drafts
octo:draft           # Create draft
octo:pause           # Pause system
octo:pause-agent     # Pause specific agent
octo:today           # Today's activity
octo:next            # What to do next
octo:postmortem      # Create postmortem
octo:reflect         # Reflect on session
```

---

## Command Grouping for Documentation

### Core Workflow (most used)
```
octo:create-task     # Create new task
octo:queue           # Check queue status
octo:status          # Full system status
octo:approve         # Approve task
octo:reject          # Reject task
```

### Task Operations
```
octo:create-task     # Create task
octo:approve         # Approve and merge
octo:reject          # Reject with feedback
octo:reset-task      # Reset to incoming
octo:hold            # Park in escalated
octo:retry-failed    # Retry failed tasks
octo:breakdown       # Decompose complex task
octo:qa              # Run visual QA
```

### Status & Monitoring
```
octo:status          # Comprehensive status
octo:queue           # Queue state
octo:agents          # Agent states
octo:today           # Today's activity
octo:next            # Actionable items
octo:audit           # Audit completions
```

### Agent Control
```
octo:agents          # Show all agents
octo:add-agent       # Add new agent
octo:pause-agent     # Pause specific agent
octo:pause           # Pause entire system
octo:kill-agent      # Kill specific agent
octo:kill-all        # Kill all agents
```

### Configuration
```
octo:tune-intervals  # Adjust wake intervals
octo:tune-limits     # Adjust queue limits
```

### Project Management
```
octo:drafts          # List all drafts
octo:draft           # Capture new idea
octo:process-draft   # Process draft to tasks
octo:postmortem      # Process failure analysis
octo:reflect         # Reflect on session
```

---

## Migration Checklist

### Documentation Updates
- [ ] Update CLAUDE.local.md command list
- [ ] Update orchestration.md rules
- [ ] Update octopoid-user-guide.md
- [ ] Update all skill definitions
- [ ] Update all project drafts mentioning commands

### Code Changes
- [ ] Rename all skill files (e.g., `enqueue.md` → `octo-create-task.md`)
- [ ] Update skill implementations to use v2.0 API
- [ ] Add command aliases (e.g., `octo:enqueue` → `octo:create-task`)
- [ ] Update autocomplete/discovery

### Testing
- [ ] Test each command with v2.0 backend
- [ ] Verify autocomplete works
- [ ] Check that old command names are deprecated gracefully
- [ ] Validate error messages are clear

---

## Commands to Remove/Deprecate

### Likely Obsolete in v2.0

| v1.x Command | Reason | v2.0 Replacement |
|--------------|--------|------------------|
| `/check-orchestrator-task` | Specific to v1.x submodule commits | Remove (or fold into octo:approve) |
| `/send-to-inbox` | Inboxes deferred | Remove for now |
| `/human-inbox` | Inboxes deferred | Remove for now |
| `/kill-agent` | If v2.0 agents are ephemeral | Maybe remove |
| `/kill-all-agents` | If v2.0 agents are ephemeral | Maybe remove |
| `/audit-completions` | Specific to v1.x explorer agent bugs | Remove if not needed |

### Maybe Consolidate

| Consolidate | Into | Reason |
|-------------|------|--------|
| `/enqueue` + `/create-task` | `octo:create-task` | Same function, one interactive |
| `/orchestrator-status` + `/agent-status` | `octo:status` | One comprehensive view |
| `/pause-agent` + `/pause-system` | `octo:pause [agent]` | Optional arg for specificity |

---

## API Design Implications

If using `octo:` prefix, the v2.0 SDK should mirror this:

### TypeScript SDK
```typescript
import { Octopoid } from '@octopoid/client'

const octo = new Octopoid({ serverUrl: '...' })

// Task operations
await octo.tasks.create({ title: '...', role: 'implement' })
await octo.tasks.approve(taskId)
await octo.tasks.reject(taskId, feedback)

// Queue operations
await octo.queue.list({ queue: 'provisional' })
await octo.queue.status()

// Agent operations
await octo.agents.list()
await octo.agents.pause(agentName)

// Status
await octo.status.comprehensive()
await octo.status.today()
```

### CLI
```bash
octopoid task create "Fix bug" --role implement
octopoid task approve abc123
octopoid queue list --queue provisional
octopoid status
octopoid agents list
```

The slash commands should map cleanly to SDK/CLI:
```
/octo:create-task  →  octo.tasks.create()  →  octopoid task create
/octo:queue        →  octo.queue.status()  →  octopoid queue status
/octo:status       →  octo.status.full()   →  octopoid status
```

---

## Next Steps

1. **Get v2.0 SDK/CLI design** from Octopoid team
2. **Map v1.x commands** to v2.0 API endpoints
3. **Prototype one command** end-to-end (e.g., octo:create-task)
4. **Test with real workflow** (create → claim → approve cycle)
5. **Migrate remaining commands** once pattern is proven

---

## Appendix: Current Command Usage Frequency

Based on v1.x session logs (rough estimate):

### Daily Use
- `/orchestrator-status` (multiple times per day)
- `/enqueue` (2-5 times per day)
- `/approve-task` (1-3 times per day)
- `/reject-task` (1-2 times per day)

### Weekly Use
- `/queue-status`
- `/agent-status`
- `/retry-failed`
- `/drafts-list`

### Monthly Use
- `/decompose-task`
- `/pause-agent`
- `/tune-intervals`
- `/postmortem`

### Rare Use
- `/add-agent`
- `/kill-agent`
- `/reset-task`
- `/audit-completions`

**Priority for v2.0 migration:** Focus on daily-use commands first.
