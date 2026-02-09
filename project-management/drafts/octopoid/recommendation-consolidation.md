# Recommendation Consolidation

**Source:** Extracted from `project-breakdown-system.md` (2026-02-05)
**Status:** Not implemented

## Problem

Multiple overlapping directories for agent recommendations:

```
.orchestrator/shared/proposals/
├── active/
├── promoted/
├── deferred/
└── rejected/

project-management/
├── classified/
├── agent-recommendations/
└── ...
```

Proposer agents (backlog-groomer, architect, test-checker, plan-reader) each write to different places. No unified view, no scoring, no backpressure.

## Proposed: Single Recommendation Pool

Consolidate to one DB-backed location with files for visibility:

```
project-management/recommendations/
├── test-quality/      # From test-checker agent
├── architecture/      # From architect agent
├── backlog/           # From backlog-groomer
└── inbox/             # From inbox-poller
```

### Schema

```sql
CREATE TABLE recommendations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT,
    source_agent TEXT,
    category TEXT,               -- test-quality, architecture, etc.
    tags TEXT,                   -- JSON array for cross-cutting concerns
    status TEXT DEFAULT 'open',  -- open | feedback | accepted | rejected | deferred
    created_at TEXT,
    accepted_at TEXT,
    project_id TEXT              -- links to project if accepted
);
```

### Backpressure

Agents query DB before creating new recommendations:

```python
my_open_count = count_recommendations(source_agent=self.name, status='open')
if my_open_count >= config.max_open_per_agent:
    return  # Don't flood — wait for some to be processed
```

This creates natural flow control:
- Agents don't flood with recommendations nobody's processing
- Agents that produce valuable work get "pulled" more
- Human can see which agents are contributing useful ideas

### Lifecycle

```
Agent creates recommendation → open
Human/curator reviews → accepted | rejected | deferred
Accepted → breakdown queue → tasks
```

### Migration

1. Move existing proposals → `recommendations/`
2. Add DB records for each
3. Retire `.orchestrator/shared/proposals/` directories
4. Update proposer agents to write to new location

## Open Questions

- Predefined tag taxonomy or freeform?
- How long before resurfacing deferred items?
- How does human give feedback before accepting? (Depends on messaging system)
