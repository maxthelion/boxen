# Dashboard v2.0 Requirements

**Date:** 2026-02-11
**Purpose:** Requirements for updating octopoid-dash.py to work with v2.0 API
**Status:** Gap identified - dashboard exists but not API-integrated

---

## Executive Summary

The Octopoid dashboard (`octopoid-dash.py`, 68KB Python/curses TUI) exists in v2.0 but has **not been updated to use the API**. It still uses v1.x's direct file/DB access via `orchestrator.queue_utils`, which won't work with v2.0's client-server architecture.

**Solution:** Update dashboard to use v2.0 Python SDK (`octopoid_sdk`), which already exists and provides API access.

**Keep in Python:** No need to rewrite in TypeScript - Python/curses dashboard is fine.

---

## Current Implementation

### Dashboard Structure

**File:** `octopoid-dash.py` (68KB, executable)

**Features:**
- Curses-based TUI (terminal UI)
- 5 tabs: Work, PRs, Inbox, Agents, Done
- Real-time polling (default 2 seconds)
- Color coding (priority, status, blocked)
- Progress bars for turn usage
- Demo mode (`--demo` flag)
- Keybindings (W/P/I/A/D for tabs, arrows/hjkl for navigation)

**Current usage:**
```bash
python octopoid-dash.py              # Normal mode
python octopoid-dash.py --demo       # Demo with sample data
python octopoid-dash.py --refresh 5  # Custom refresh interval
```

### Data Loading (Current - v1.x approach)

**Main entry point:**
```python
def load_report(demo_mode: bool) -> dict[str, Any]:
    if demo_mode:
        return _generate_demo_report()

    from orchestrator.reports import get_project_report
    return get_project_report()
```

**Reports module (`orchestrator/reports.py`):**
```python
def get_project_report() -> dict[str, Any]:
    return {
        "work": _gather_work(),
        "done_tasks": _gather_done_tasks(),
        "prs": _gather_prs(),
        "proposals": _gather_proposals(),
        "messages": _gather_messages(),
        "agents": _gather_agents(),
        "health": _gather_health(),
    }

def _gather_work():
    from .queue_utils import list_tasks  # ❌ Direct file/DB access

    incoming = list_tasks("incoming")
    claimed = list_tasks("claimed")
    provisional = list_tasks("provisional")
    # ...
```

**Problem:** `queue_utils.list_tasks()` reads from local files/DB, not API.

---

## Python SDK (Already Exists!)

v2.0 includes a Python SDK at `packages/python-sdk/octopoid_sdk/`

**API:**
```python
from octopoid_sdk import OctopoidSDK

sdk = OctopoidSDK(
    server_url='https://octopoid-server.username.workers.dev',
    api_key='your-api-key'
)

# List tasks
tasks = sdk.tasks.list(queue='incoming')

# Get task
task = sdk.tasks.get('task-id')

# List agents (if available)
agents = sdk.agents.list()
```

**Package info:**
- Location: `packages/python-sdk/`
- Package name: `octopoid_sdk`
- Version: 2.0.0
- Install: `pip install octopoid-sdk` (or local: `pip install -e packages/python-sdk/`)

---

## Required Changes

### 1. Update `orchestrator/reports.py`

**Current (v1.x):**
```python
def _gather_work():
    from .queue_utils import list_tasks

    incoming = [_format_task(t) for t in list_tasks("incoming")]
    claimed = [_format_task(t) for t in list_tasks("claimed")]
    # ...
```

**New (v2.0):**
```python
def _gather_work(sdk: OctopoidSDK):
    # Fetch from API
    incoming = [_format_task(t) for t in sdk.tasks.list(queue='incoming')]
    claimed = [_format_task(t) for t in sdk.tasks.list(queue='claimed')]
    provisional = [_format_task(t) for t in sdk.tasks.list(queue='provisional')]
    done = sdk.tasks.list(queue='done')

    # Split provisional into checking/in_review based on check_results
    checking = []
    in_review = []
    for t in provisional:
        checks = t.get('checks', [])
        if not checks:
            in_review.append(_format_task(t))
        else:
            check_results = t.get('check_results', {})
            all_passed = all(
                check_results.get(c, {}).get('status') == 'pass'
                for c in checks
            )
            if all_passed:
                in_review.append(_format_task(t))
            else:
                checking.append(_format_task(t))

    # Filter done_today (last 24 hours)
    cutoff = datetime.now() - timedelta(hours=24)
    done_today = [
        _format_task(t) for t in done
        if _is_recent(t, cutoff)
    ]

    return {
        "incoming": incoming,
        "in_progress": claimed,
        "checking": checking,
        "in_review": in_review,
        "done_today": done_today,
    }
```

**Change all `_gather_*` functions to accept and use SDK client.**

### 2. Update `octopoid-dash.py`

**Add configuration arguments:**
```python
parser = argparse.ArgumentParser()
parser.add_argument('--demo', action='store_true', help='Run in demo mode')
parser.add_argument('--refresh', type=int, default=2, help='Refresh interval (seconds)')
parser.add_argument('--server-url', help='Octopoid server URL (for remote mode)')
parser.add_argument('--api-key', help='API key (for remote mode)')
parser.add_argument('--local', action='store_true', help='Use local mode (direct DB access)')
```

**Initialize SDK client:**
```python
def load_report(demo_mode: bool, sdk: Optional[OctopoidSDK] = None) -> dict[str, Any]:
    if demo_mode:
        return _generate_demo_report()

    if sdk:
        # Remote mode - use API
        from orchestrator.reports import get_project_report
        return get_project_report(sdk)
    else:
        # Local mode - use old approach (backwards compat)
        from orchestrator.reports import get_project_report
        return get_project_report()
```

**In main():**
```python
def main(stdscr, args):
    # Initialize SDK if remote mode
    sdk = None
    if args.server_url:
        from octopoid_sdk import OctopoidSDK
        sdk = OctopoidSDK(
            server_url=args.server_url,
            api_key=args.api_key
        )

    dashboard = Dashboard(stdscr, refresh_interval=args.refresh, demo_mode=args.demo, sdk=sdk)
    dashboard.run()
```

### 3. Configuration File Support

**Allow loading config from file:**

`~/.octopoid/config.yaml`:
```yaml
server:
  url: https://octopoid-server.username.workers.dev
  api_key: your-api-key-here

# Or for local mode:
# mode: local
```

**Dashboard loads config:**
```python
def load_config() -> dict:
    config_path = Path.home() / '.octopoid' / 'config.yaml'
    if config_path.exists():
        import yaml
        with open(config_path) as f:
            return yaml.safe_load(f)
    return {}
```

**Merge with CLI args (CLI takes precedence):**
```python
config = load_config()
server_url = args.server_url or config.get('server', {}).get('url')
api_key = args.api_key or config.get('server', {}).get('api_key')
```

---

## Backwards Compatibility

### Local Mode (v1.x compatibility)

For users who want to use v2.0 in local-only mode (no server):

```bash
python octopoid-dash.py --local
```

In local mode:
- Dashboard reads from local SQLite DB (via `queue_utils`)
- No API calls
- Works like v1.x

### Remote Mode (v2.0 client-server)

```bash
python octopoid-dash.py --server-url https://octopoid.example.com --api-key abc123
```

Or with config file:
```bash
python octopoid-dash.py  # Reads from ~/.octopoid/config.yaml
```

In remote mode:
- Dashboard fetches from API (via Python SDK)
- Works with Cloudflare Workers server
- Can monitor remote orchestrators

### Hybrid Mode

Dashboard could support **both** local and remote orchestrators:

```bash
python octopoid-dash.py --local --remote https://octopoid.example.com
```

Shows:
- Local orchestrator tasks in one section
- Remote orchestrator tasks in another section
- Useful for managing multiple machines

---

## Missing SDK Endpoints

The dashboard needs these API endpoints (check if SDK provides them):

### Tasks API (Exists)
- [x] `sdk.tasks.list(queue='incoming')`
- [x] `sdk.tasks.get(id)`
- [ ] `sdk.tasks.list(queue='done', limit=100)` with filtering by date?

### Agents API (Unknown)
- [ ] `sdk.agents.list()` - List all agents with state
- [ ] `sdk.agents.get(name)` - Get agent details
- [ ] Agent state: running, paused, last_run, current_task

### PRs API (Unknown)
- Current: Dashboard uses `gh CLI` subprocess calls
- Options:
  1. Keep `gh CLI` approach (works, but slow)
  2. Add `sdk.prs.list()` that server fetches via GitHub API
  3. Dashboard calls GitHub API directly (needs token)

### Proposals/Drafts API (Unknown)
- Current: Dashboard reads from `project-management/drafts/` files
- For remote mode: Need `sdk.drafts.list()`
- Or: Drafts stay local-only (not synced to server)

### Health/Status API (Unknown)
- [ ] `sdk.status.health()` - Scheduler state, agent counts, queue depth
- [ ] System paused state

---

## Implementation Plan

### Phase 1: Add SDK Support (Backwards Compatible)

1. **Update `orchestrator/reports.py`:**
   - Add optional `sdk` parameter to all `_gather_*` functions
   - If `sdk` provided: use API calls
   - If `sdk` is None: use old `queue_utils` approach (backwards compat)

2. **Update `octopoid-dash.py`:**
   - Add `--server-url` and `--api-key` arguments
   - Initialize SDK if remote mode
   - Pass SDK to `load_report()`

3. **Test both modes:**
   - Local mode: `python octopoid-dash.py --local` (v1.x compat)
   - Remote mode: `python octopoid-dash.py --server-url ...` (v2.0)

### Phase 2: Fill SDK Gaps

4. **Check Python SDK completeness:**
   - Does `sdk.agents.list()` exist?
   - Does `sdk.status.health()` exist?
   - Does `sdk.drafts.list()` exist?

5. **If missing, add to SDK:**
   - Implement missing methods in `packages/python-sdk/octopoid_sdk/client.py`
   - Add corresponding server endpoints in `packages/server/`

6. **Update `reports.py` to use new SDK methods:**
   - Replace `gh CLI` calls with `sdk.prs.list()` (if available)
   - Replace file reads with `sdk.drafts.list()` (if available)

### Phase 3: Configuration File

7. **Add config file support:**
   - Read from `~/.octopoid/config.yaml`
   - Merge with CLI args (CLI wins)
   - Document config format

8. **Update `octopoid init`:**
   - Create `~/.octopoid/config.yaml` with server URL
   - Prompt for API key during init

### Phase 4: Polish

9. **Error handling:**
   - Graceful fallback if API unreachable
   - Show error state in dashboard (not crash)
   - Retry logic with backoff

10. **Performance:**
    - Cache API responses (avoid fetching every 2 seconds)
    - Incremental updates (only fetch changed tasks)
    - Use server-sent events or WebSocket for live updates?

11. **Documentation:**
    - Update dashboard README
    - Document remote vs local mode
    - Document config file format

---

## Testing Strategy

### Unit Tests

**Test `reports.py` with SDK:**
```python
def test_gather_work_with_sdk():
    mock_sdk = MagicMock()
    mock_sdk.tasks.list.return_value = [
        {'id': 'task1', 'queue': 'incoming', ...},
        {'id': 'task2', 'queue': 'incoming', ...},
    ]

    result = _gather_work(sdk=mock_sdk)

    assert len(result['incoming']) == 2
    mock_sdk.tasks.list.assert_called_with(queue='incoming')
```

### Integration Tests

**Test dashboard with real v2.0 server:**
1. Start v2.0 server locally (or use dev instance)
2. Create test tasks via API
3. Launch dashboard with `--server-url http://localhost:8787`
4. Verify tasks appear in dashboard
5. Verify all tabs render correctly

### Manual Testing

**Checklist:**
- [ ] Local mode works (backwards compat with v1.x)
- [ ] Remote mode works (connects to v2.0 server)
- [ ] Demo mode still works
- [ ] All 5 tabs render
- [ ] Navigation works (arrows, hjkl, tab switching)
- [ ] Refresh updates data from API
- [ ] Error states handled gracefully (server down, auth failure)
- [ ] Config file loaded correctly
- [ ] CLI args override config file

---

## Open Questions for Octopoid Team

1. **Does Python SDK have all needed endpoints?**
   - `sdk.agents.list()` - List agents with state?
   - `sdk.status.health()` - System health/queue depth?
   - `sdk.drafts.list()` - List drafts (or keep local-only)?

2. **How should dashboard authenticate?**
   - API key in config file?
   - OAuth token?
   - Machine-specific credentials?

3. **Should dashboard support multiple orchestrators?**
   - Show tasks from local + remote in same view?
   - Or separate dashboards per orchestrator?

4. **How to handle PRs?**
   - Keep using `gh CLI` (local subprocess)?
   - Add `sdk.prs.list()` (server fetches from GitHub)?
   - Dashboard calls GitHub API directly?

5. **Should drafts sync to server?**
   - Or remain local-only?
   - If synced: How to handle conflicts (local draft vs server draft)?

6. **Live updates?**
   - Current: Poll every 2 seconds
   - Better: Server-sent events or WebSocket?
   - Or: Keep polling with longer interval + cache?

---

## Success Criteria

Dashboard v2.0 is complete when:

- [x] Dashboard exists (already true)
- [ ] Can run in local mode (v1.x backwards compat)
- [ ] Can run in remote mode (v2.0 API)
- [ ] All tabs render correctly in both modes
- [ ] Config file support (load server URL from `~/.octopoid/config.yaml`)
- [ ] Error handling (graceful when API unreachable)
- [ ] Tests pass (unit + integration)
- [ ] Documentation updated
- [ ] No performance regression (refresh time < 500ms for typical workload)

---

## Dependencies

**Requires:**
1. Python SDK (`octopoid_sdk`) with complete API coverage
2. Server endpoints for all dashboard data (tasks, agents, PRs, health)
3. Authentication mechanism (API key or OAuth)

**Blockers:**
- If SDK is incomplete, dashboard can't work in remote mode
- If server doesn't have agent/health endpoints, those tabs won't work

**Workarounds (if SDK incomplete):**
- Dashboard falls back to local mode
- Missing tabs show "Not available in remote mode" message
- Hybrid mode: Some data from API, some from local files

---

## Timeline Estimate

**If SDK is complete:** 1-2 days
- Phase 1: Add SDK support (4-6 hours)
- Phase 2: Fill gaps (0 hours if SDK complete)
- Phase 3: Config file (2 hours)
- Phase 4: Polish + testing (4-6 hours)

**If SDK needs work:** 1 week
- Phase 1: Add SDK support (4-6 hours)
- Phase 2: Fill SDK gaps (2-3 days)
- Phase 3: Config file (2 hours)
- Phase 4: Polish + testing (1 day)

---

## Migration Impact

**For v1.x users:**
- Dashboard continues to work in local mode (`--local` flag)
- No breaking changes if they don't use remote mode

**For v2.0 users:**
- Dashboard works out of the box after setting server URL in config
- Can monitor remote orchestrators from any machine
- Faster refresh (API calls faster than subprocess + file I/O)

**For migration branch:**
- Test dashboard in both modes before finalizing migration
- Add dashboard check to `verify-basics.sh` script:
  ```bash
  check "Dashboard runs in demo mode" "timeout 5 python octopoid-dash.py --demo"
  ```

---

## Related Documents

- `octopoid-project-management-requirements.md` - Overall v2.0 requirements
- `slash-command-inventory.md` - Command surface area
- `dashboard-polling-performance.md` - Performance optimization notes (v1.x)
- `PLAYBOOK.md` - Migration playbook (add dashboard verification step)

---

**Document Status:** Draft - awaiting feedback from Octopoid team on SDK completeness
**Next Action:** Check Python SDK for missing endpoints, create GitHub issues if needed
