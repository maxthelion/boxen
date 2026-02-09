# Postmortem: Schema Migrations Never Ran in Production

**Date:** 2026-02-09
**Affected:** All orchestrator_impl tasks
**Severity:** Complete system failure - all orchestrator tasks blocked for hours

## Summary

The orchestrator database schema was updated to add `submitted_at` and `completed_at` columns, but the migration code (`migrate_schema()`) was never called in production. All orchestrator tasks failed with "no such column: submitted_at" starting around 15:00. The system was completely blocked - 5 tasks failed, including the one meant to fix auto-migration (TASK-45d05555). Manual intervention required to run migrations and retry all failed tasks.

**Wasted effort:** ~6 hours of orchestrator downtime, 5 failed task attempts (0 commits, 0/200 turns each).

## Timeline

1. **Unknown date** - Code added `submitted_at` and `completed_at` columns to schema
2. **Unknown date** - `migrate_schema()` function created with v9→v10 migration to add these columns
3. **Unknown date** - Tests added that call `migrate_schema()` directly
4. **Production deployment** - New code deployed, assumed migrations would run automatically
5. **~15:00 Feb 9** - First orchestrator task (TASK-8e85c0bf) claims, fails with "no such column: submitted_at"
6. **15:01-15:55** - Four more tasks fail with same error: 45d05555, fad87bf8, 001cdbe2, 3252c671
7. **15:55-16:30** - Tasks marked failed, but DB stuck (file-vs-DB sync bug compounded the issue)
8. **16:30** - Human investigation begins, discovers migrations never ran
9. **16:40** - Manual `migrate_schema()` execution fixes DB
10. **16:45** - All failed tasks retried

## Root Cause

### Immediate: `migrate_schema()` exists but is never called

**The function exists:**
```python
# orchestrator/orchestrator/db.py:204
def migrate_schema() -> bool:
    """Migrate database schema to current version."""
    # ... migration logic ...
```

**But nothing calls it in production:**
- Scheduler: no call to `migrate_schema()`
- Agents: no call to `migrate_schema()`
- `get_connection()`: no call to `migrate_schema()`
- `init_schema()`: only creates tables, doesn't add columns to existing tables

**Only tests call it:**
```python
# orchestrator/tests/test_db.py:1092
result = migrate_schema()
assert result is True
```

This created false confidence: tests pass (because they run migrations), production fails (because it doesn't).

### Structural: No entry point runs migrations on startup

The orchestrator has no initialization routine that runs before accepting work. The scheduler and agents start immediately and begin using the DB. There's no "boot sequence" that would:

1. Check schema version
2. Run pending migrations
3. Verify DB is ready
4. Then start accepting work

**Comparison to typical applications:**
- Web apps: migration runs in deployment script before app starts
- Django: `python manage.py migrate` before `runserver`
- Rails: `rake db:migrate` before app boot

**Orchestrator:** Agents spawn, access DB, assume it's ready. No migration step.

### Misleading: Tests passing created false confidence

The test suite has extensive migration tests:
- `test_db.py` has 4 tests calling `migrate_schema()`
- `test_review_system.py` has migration tests
- All pass ✅

But these tests create fresh temp DBs, run migrations explicitly, and verify they work. They never test the production deployment path:

**What tests verify:**
- Migration code is correct
- Columns are added properly
- Schema version is tracked

**What tests don't verify:**
- Migrations run automatically in production
- Scheduler/agents can access migrated DB
- Production DB stays in sync with code

### Compounding: File-vs-DB sync bug hid the issue

When tasks failed, they should have moved to `failed/` queue and been visible. But the file-vs-DB sync bug (TASK-3252c671) meant:
- Files moved to `failed/`
- DB queue column stayed `claimed`
- Dashboard showed tasks "in progress" for hours

This delayed discovery. Without the sync bug, the failures would have been immediately visible in the dashboard/status script.

## What the Actual Fix Requires

### Immediate (done manually)
- ✅ Run `migrate_schema()` once to bring production DB to v10
- ✅ Retry all failed tasks

### Short-term (TASK-45d05555 will implement)
- Auto-migration on first DB access (in `get_connection()` or `init_schema()`)
- Schema version check before any DB operation
- Migration runs automatically, not manually

### Medium-term (prevent recurrence)
- Add integration test: "scheduler can start with old DB schema and auto-migrates"
- Add deployment check: verify schema version matches code before accepting work
- Add monitoring: alert if schema version < expected

## Lessons

### 1. Tests That Don't Test the Deployment Path Are Incomplete

**Before:**
```python
# test_db.py
def test_migration_adds_columns():
    # Create fresh DB
    conn = sqlite3.connect(":memory:")
    # Explicitly run migration
    migrate_schema()
    # Verify columns exist
    assert "submitted_at" in columns
```

This tests the migration code, not the deployment.

**After (needed):**
```python
# test_integration.py
def test_scheduler_auto_migrates_old_db():
    # Create DB with OLD schema (v8)
    conn = create_v8_schema()
    conn.close()

    # Start scheduler (should auto-migrate)
    scheduler = Scheduler()
    scheduler.start()

    # Verify DB is now v10
    assert get_schema_version() == 10
    assert "submitted_at" in get_columns("tasks")
```

This tests that the production entry point (scheduler) can handle old schemas.

### 2. False Confidence from Green Tests

All 758 tests passed, including migration tests. This created confidence that migrations worked. But the tests only proved the migration code was correct, not that it ran in production.

**Pattern:** Unit tests of infrastructure (migrations, deployment, initialization) can all pass while the integration (does it actually run?) fails.

**Solution:** Integration tests must exercise the full production path, not just the isolated components.

### 3. Missing Initialization Sequence

The orchestrator lacks a boot sequence. Agents and scheduler start immediately and assume the DB is ready. This works until it doesn't (schema changes, corrupt DB, missing tables).

**Robust pattern:**
```python
# scheduler.py main()
def main():
    # 1. Initialize
    init_database()  # Creates tables, runs migrations, verifies schema

    # 2. Verify
    if not database_ready():
        raise RuntimeError("DB not ready")

    # 3. Start work
    run_scheduler_loop()
```

**Current pattern:**
```python
# scheduler.py (simplified)
def main():
    # Start work immediately
    run_scheduler_loop()  # Assumes DB is ready
```

### 4. Schema Drift Compounds Other Bugs

The file-vs-DB sync bug (tasks show as "in progress" when failed) made this issue harder to diagnose. The schema failure caused task failures, but the sync bug hid them from the dashboard.

**Lesson:** Infrastructure bugs (DB schema, file sync) are force multipliers for other bugs. Fix infrastructure first.

## Remediation

### 1. Add Auto-Migration to `get_connection()`

**File:** `orchestrator/orchestrator/db.py`

```python
@contextmanager
def get_connection() -> Generator[sqlite3.Connection, None, None]:
    """Get a database connection with proper settings."""
    db_path = get_database_path()

    # BEFORE connecting, ensure schema is current
    _ensure_schema_current(db_path)

    conn = sqlite3.connect(db_path, timeout=30.0)
    # ... rest of function
```

```python
def _ensure_schema_current(db_path: Path) -> None:
    """Ensure DB schema is at current version, run migrations if needed.

    This runs ONCE per process (cached check). Subsequent calls are no-ops.
    """
    global _schema_checked
    if _schema_checked:
        return

    # Quick check: does schema_info table exist?
    conn = sqlite3.connect(db_path)
    try:
        version = conn.execute(
            "SELECT value FROM schema_info WHERE key = 'schema_version'"
        ).fetchone()

        if version and int(version[0]) >= SCHEMA_VERSION:
            _schema_checked = True
            return

        # Schema is old or missing, run migrations
        migrate_schema()
        _schema_checked = True
    finally:
        conn.close()
```

**TASK-45d05555 implements this.**

### 2. Add Integration Test for Auto-Migration

**File:** `orchestrator/tests/test_scheduler_integration.py` (new)

```python
def test_scheduler_starts_with_old_schema():
    """Verify scheduler can start with v8 DB and auto-migrates to v10."""
    # Create old DB (v8 - before submitted_at column)
    old_db = create_test_db_v8()

    # Mock ORCHESTRATOR_DIR to use test DB
    with patch_orchestrator_dir(old_db.parent):
        # Start scheduler (should auto-migrate)
        scheduler = Scheduler()

        # Verify schema upgraded
        assert get_schema_version() == SCHEMA_VERSION

        # Verify new columns exist
        with get_connection() as conn:
            columns = get_column_names(conn, "tasks")
            assert "submitted_at" in columns
            assert "completed_at" in columns
```

**Add to TASK-45d05555 acceptance criteria.**

### 3. Add Deployment Verification Script

**File:** `orchestrator/scripts/verify_db.py` (new)

```bash
#!/usr/bin/env python3
"""Verify orchestrator DB is ready for use.

Run this after deployment before starting scheduler/agents.
Exits with code 1 if DB is not ready.
"""
import sys
sys.path.insert(0, "orchestrator")
from orchestrator.db import get_schema_version, SCHEMA_VERSION

version = get_schema_version()
if version < SCHEMA_VERSION:
    print(f"ERROR: DB schema v{version}, code expects v{SCHEMA_VERSION}")
    print("Run: orchestrator/venv/bin/python -c 'from orchestrator.db import migrate_schema; migrate_schema()'")
    sys.exit(1)

print(f"OK: DB schema v{version}")
sys.exit(0)
```

**Usage in deployment:** Run `verify_db.py` before starting scheduler.

### 4. Update Testing Rules

**File:** `.claude/rules/testing.md`

Add section:

```markdown
## Infrastructure Testing

Tests for infrastructure (DB migrations, initialization, deployment) must exercise the production code path, not just the isolated component.

**Bad:**
```python
def test_migration_works():
    migrate_schema()  # Directly calls migration
    assert columns_added
```

**Good:**
```python
def test_production_entry_point_migrates():
    # Start scheduler with old DB
    scheduler.start()
    # Verify it auto-migrated
    assert get_schema_version() == CURRENT
```

The first tests migration code. The second tests that production actually runs migrations.
```

**Add to TASK-45d05555 or create separate documentation task.**

## Actionable Next Steps

- [x] Manual migration run (completed)
- [x] Retry failed tasks (completed)
- [ ] TASK-45d05555: Implement auto-migration in `get_connection()`
- [ ] Add integration test for scheduler auto-migration
- [ ] Add deployment verification script
- [ ] Update testing rules with infrastructure testing pattern
- [ ] Consider: add monitoring/alerting for schema version mismatch

## Prevention Checklist

Future DB schema changes must include:

- [ ] Migration code in `migrate_schema()`
- [ ] Unit test of migration (verify columns added)
- [ ] Integration test (verify production entry point runs migration)
- [ ] Deployment verification (script checks schema version)
- [ ] Rollback plan (what if migration fails mid-deployment?)
