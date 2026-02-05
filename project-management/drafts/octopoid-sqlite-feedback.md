# Octopoid SQLite Migration Feedback

**Date:** 2026-02-05
**Consumer:** Boxen project
**Branch tested:** `sqlite-model`

## Summary

Successfully migrated from file-based to SQLite state management. The migration was smooth overall.

## Migration Steps Taken

1. Checkout `sqlite-model` branch in orchestrator submodule
2. Added to `agents.yaml`:
   ```yaml
   database:
     enabled: true
     path: state.db
   ```
3. Ran `python -m orchestrator.orchestrator.migrate init`
4. Ran `python -m orchestrator.orchestrator.migrate import --verbose`

**Result:** 43 tasks imported (1 incoming, 39 done, 3 failed)

## Issues Found

### 1. Inconsistent Key Names in API

**Problem:** `db.list_tasks()` returns tasks with `id` key, but other places might expect `task_id`.

```python
# db.list_tasks() returns:
{'id': 'TASK-fix-dashboard-titles', ...}

# Expected consistency with task_id used in create_task(), get_task(), etc.
```

**Impact:** Minor - just need to know to use `id` not `task_id`

**Suggestion:** Standardize on one key name throughout the API, or document the difference.

### 2. migrate.py Can't Run Directly

**Problem:** Running `python orchestrator/orchestrator/migrate.py` fails with relative import error.

```
ImportError: attempted relative import with no known parent package
```

**Workaround:** Must run as module: `python -m orchestrator.orchestrator.migrate`

**Suggestion:** Add `if __name__ == '__main__'` block that handles this, or document the correct invocation.

### 3. Missing pyyaml Not Clear

**Problem:** When `pyyaml` isn't installed, error appears deep in config.py import chain.

**Suggestion:** Add clear error message at top of migrate.py:
```python
try:
    import yaml
except ImportError:
    print("Error: pyyaml required. Run: pip install pyyaml")
    sys.exit(1)
```

## What Works Well

1. **Migration is non-destructive** - Original files kept, DB is additional layer
2. **Status command** - Clear view of file vs DB state
3. **Import is idempotent** - Can re-run safely (skips existing)
4. **Fallback mode** - System can work without DB if config disabled
5. **Schema versioning** - Good for future migrations

## Questions for Octopoid Developers

### Q1: How Do Agents Report Metrics?

The task schema has `commits_count` and `turns_used` fields. How do agents populate these?

Looking at `implementer.py`, I see:
```python
self.task_info["commits_count"] = get_commit_count(...)
```

But where does this get written back to the DB?

### Q2: Validation Workflow

The commit mentions a validation workflow:
```
incoming → claimed → provisional → done
                          ↓
                     rejected → incoming (retry)
```

How do we enable this? Is it automatic with DB mode, or requires validator agent?

### Q3: Planning/Micro-task Escalation

The commit mentions `escalate_to_planning()` for tasks that fail repeatedly. How does this work?
- What triggers escalation?
- What format are micro-tasks in?
- Is there a planning agent role?

## Testing Recommendations

Per our migration checklist, still need to verify:

- [ ] Create test task → gets claimed correctly
- [ ] Complete task with commit → accepted (if validation enabled)
- [ ] Complete task without commit → rejected (if validation enabled)
- [ ] BLOCKED_BY dependencies work (blocked task auto-promotes)
- [ ] SKIP_PR tasks merge directly
- [ ] Custom agents (inbox-poller, plan-reader) still work

## Flexibility Assessment

**Is it flexible enough for our needs?**

Mostly yes. The key customizations we use:

| Feature | Supported? | Notes |
|---------|------------|-------|
| Custom proposer roles | ✅ | Our inbox-poller, plan-reader work |
| Custom directories | ✅ | Still reads project-management/* |
| Proposal model | ✅ | We use v2 proposal flow |
| Custom prompts | ✅ | .orchestrator/prompts/ still works |
| Task dependencies | ✅ | BLOCKED_BY imported to DB |

**Potential gaps:**
- No way to add custom columns to tasks table (but `has_plan`/`plan_id` cover our needs)
- No events/webhooks for task state changes (would be nice for notifications)

## Scheduler Test

Ran scheduler with `--debug`:
```
[2026-02-05T13:04:10] Scheduler starting
Agent inbox-poller pre-check: no work available
[2026-02-05T13:04:10] Starting agent impl-agent-1 (role: implementer)
Agent impl-agent-1 started with PID 48749
[2026-02-05T13:04:10] Starting agent impl-agent-2 (role: implementer)
[2026-02-05T13:04:12] Scheduler tick complete
```

**Result:** Scheduler works correctly with DB mode enabled.

## Recommendation

**Proceed with SQLite mode.** The migration is smooth, and having proper ACID transactions will help with the race conditions we've seen with file-based locking.

Remaining verification:
- [ ] Watch a full task lifecycle (claim → complete → done)
- [ ] Verify blocked task promotion when blocker completes
- [ ] Keep file-based queue as backup for first week
