# Dashboard Polling Performance

**Status:** Idea
**Captured:** 2026-02-09

## Raw

> Dashboard polling is too slow / laggy. Can it be less laggy without being a resource hog?

## Problem

The dashboard (`octopoid-dash.py`) polls every 2 seconds via `load_data()` which calls `get_project_report()`. Each poll does a **full state reload** that includes multiple subprocess calls to the GitHub CLI — the dominant bottleneck.

## Current Cost Per Poll

| Operation | Calls | Type | Latency |
|-----------|-------|------|---------|
| `gh pr list` | 1 | Network (GitHub API) | 500-2000ms |
| `gh pr view` (per open PR) | N | Network (GitHub API) | 500-1500ms each |
| `launchctl list` | 1 | Subprocess | ~50ms |
| DB queries (tasks, agents) | ~10 | SQLite | ~1ms each |
| File reads (state.json, notes, task files) | ~20 | Disk | ~1ms each |
| `is_process_running` (per agent) | ~17 | `os.kill(pid, 0)` | ~0.1ms each |

**With 5 open PRs:** 1 `gh pr list` + 5 `gh pr view` = **6 GitHub API calls per poll**, easily 3-6 seconds total. The 2-second refresh interval means the dashboard is perpetually behind — each refresh takes longer than the interval itself.

## Proposed Fix: Data Collector Agent + DB-Only Dashboard

Instead of making the dashboard smarter about what to refresh, **move all expensive data collection into a background agent** that writes results to DB rows. The dashboard becomes a pure DB reader — every poll is just SQLite queries, completing in <20ms.

### Architecture

```
┌──────────────────┐       writes        ┌──────────┐
│  data-collector   │ ──────────────────▶ │   DB     │
│  agent (60-120s)  │                     │ (cached  │
│                   │                     │  tables) │
│  - gh pr list     │                     └────┬─────┘
│  - gh pr view     │                          │
│  - launchctl      │                     reads only
│  - staging URLs   │                          │
│  - proposals scan │                     ┌────▼─────┐
└──────────────────┘                     │ dashboard │
                                          │ (1-2s)   │
                                          └──────────┘
```

### What the Collector Agent Does

A lightweight agent (like `recycler`) on a 60-120s interval:

1. **PRs:** Runs `gh pr list`, stores results in a `cached_prs` DB table (or JSON column on a config row)
2. **Staging URLs:** For each PR without a cached staging_url, runs `gh pr view` to extract Cloudflare URL. Writes to `tasks.staging_url` (already exists)
3. **Scheduler status:** Runs `launchctl list`, writes result to a `system_state` row
4. **Proposals:** Scans proposal files, writes summary to DB
5. **Task titles:** Extracts titles from task files, caches in `tasks.title` column (or a dedicated field)

### What the Dashboard Does

`get_project_report()` becomes pure DB reads:

```python
def get_project_report() -> dict:
    """All data from DB — no subprocess calls, no file reads."""
    return {
        "work": db.list_tasks_by_queue(),      # Already DB
        "done_tasks": db.list_done_tasks(),     # Already DB
        "prs": db.get_cached_prs(),             # NEW: read from cache table
        "agents": db.get_agent_states(),        # state.json → DB (agents already write this)
        "health": db.get_system_health(),       # NEW: read from cache
        "proposals": db.get_cached_proposals(), # NEW: read from cache
        "messages": db.get_cached_messages(),   # NEW: read from cache
    }
```

Every field is a single SQLite query. Total poll time: ~10-20ms. Dashboard can poll every 1-2 seconds with zero lag.

### Agent Definition

```yaml
- name: data-collector
  role: collector
  interval_seconds: 60
  lightweight: true
  paused: false
```

No pre-check needed — it runs unconditionally every 60s. Lightweight flag means the scheduler doesn't count it against backpressure limits.

### DB Schema Additions

Option A: A single `cache` table:

```sql
CREATE TABLE cache (
    key TEXT PRIMARY KEY,
    value TEXT,  -- JSON
    updated_at TEXT
);
-- Keys: 'prs', 'proposals', 'messages', 'scheduler_status'
```

Option B: Dedicated columns/tables where it makes sense:
- `tasks.title` — already conceptually exists, just needs populating
- `tasks.staging_url` — already exists
- `agent_states` table — agents already write state.json; could write to DB too
- `cache` table for the rest (PRs, proposals, messages)

### What Stays in the Dashboard

Some data is already cheap and doesn't need the collector:
- **Task queues** — already DB queries via `list_tasks()`
- **Agent status** — reading state.json files is fast (~1ms each), but could move to DB too
- **Queue counts** — already DB

### Benefits

- **Dashboard is instant** — pure reads, no network calls, no subprocesses
- **Single writer** — collector agent is the only thing hitting GitHub API, no duplicate calls
- **Decoupled** — dashboard doesn't need to know how data is gathered
- **Shared cache** — status script, other tools can also read from DB instead of re-fetching
- **Stale indicator** — dashboard can check `cache.updated_at` and show "(60s ago)" next to PR data

## Quick Win (Do First)

Even before building the full collector agent, the biggest immediate improvement:

**Stop calling `gh pr view` per-PR on every poll.** Check DB for cached staging_url first:

```python
def _gather_prs():
    prs = _get_pr_list()  # 1 gh call
    for pr in prs:
        task = db.get_task_by_pr(pr["number"])
        if task and task.get("staging_url"):
            pr["staging_url"] = task["staging_url"]
        elif _is_recent(pr, hours=1):
            pr["staging_url"] = _extract_staging_url(pr["number"])
    return prs
```

This alone drops N+1 `gh` calls to 1.

## Also Consider

- **`_gather_health` duplicates `_gather_agents`** — both read state.json for all agents. Refactor to share the data.
- **`_extract_title_from_file`** reads task files from disk for every recent task of every agent. Cache titles in the DB (they never change).

## Recommended Order

1. **Skip PR comment scraping when DB has staging_url** — quick win, biggest impact, no new infrastructure
2. **Add `cache` table + collector agent** — moves all expensive ops out of dashboard
3. **Dashboard reads DB only** — remove all subprocess/file calls from reports.py
4. **Move agent state to DB** — agents write to DB instead of state.json (optional, state.json reads are already fast)

## Open Questions

- Should the dashboard show a "stale" indicator when cached data is >60s old?
- Is 60s the right collector interval, or should some data (PRs) be even less frequent?
- Should the collector be a Python agent or a simple cron-style script?
- Store cached data as JSON blobs in a `cache` table, or as structured rows?
