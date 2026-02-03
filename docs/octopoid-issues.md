# Octopoid Issues

Issues discovered while setting up the proposal model in Boxen.

## Issue 1: PYTHONPATH not set when spawning agents

**Severity:** Blocker

### Description

When the scheduler spawns agents, it sets the working directory to the agent's worktree but doesn't set PYTHONPATH. This causes the Python module to fail to import when run from the worktree.

### Steps to Reproduce

1. Configure agents.yaml with proposal model
2. Run `python -m orchestrator.orchestrator.scheduler --debug`
3. Agents spawn but fail immediately with module import errors

### Expected Behavior

Agents should be able to import the orchestrator package regardless of their working directory.

### Actual Behavior

Agents fail with:
```
ModuleNotFoundError: No module named 'orchestrator.orchestrator'
```

The scheduler spawns agents with:
```python
process = subprocess.Popen(
    [sys.executable, "-m", role_module],
    cwd=worktree_path,  # <-- Problem: module not available here
    env=env,
    ...
)
```

### Suggested Fix

Add PYTHONPATH to the environment when spawning agents:

```python
# In spawn_agent(), add to env dict:
import site
venv_site_packages = site.getsitepackages()[0]
env["PYTHONPATH"] = venv_site_packages
```

Or alternatively, add the parent project's orchestrator to the path:
```python
env["PYTHONPATH"] = str(find_parent_project() / "orchestrator")
```

---

## Issue 2: /create-proposal skill requires unavailable Python imports

**Severity:** Blocker

### Description

The `/create-proposal` skill instructs Claude to use Python imports from the orchestrator package:

```python
from orchestrator.orchestrator.proposal_utils import create_proposal
create_proposal(...)
```

However, Claude Code running in the worktree cannot import this package because:
1. The worktree is a git worktree, not the main repo
2. The orchestrator package isn't installed in the worktree
3. PYTHONPATH isn't set (Issue 1)

### Steps to Reproduce

1. Run a proposer agent
2. Agent invokes Claude with Skill tool allowed
3. Claude tries to use /create-proposal
4. Import fails or Claude doesn't attempt it

### Expected Behavior

The skill should work in any directory where Claude Code runs.

### Actual Behavior

Claude either:
- Doesn't attempt to use the skill (observed: 29 chars output, no proposals)
- Or would fail with ImportError if attempted

### Suggested Fixes

**Option A: Make the skill write markdown directly**

Instead of using Python imports, have the skill instruct Claude to write the proposal file directly:

```markdown
## Creating the Proposal

Write the proposal as a markdown file to `.orchestrator/shared/proposals/active/`:

1. Generate a UUID for the proposal ID (first 8 chars)
2. Create file: `PROP-{uuid8}-{slug}.md`
3. Use this template:

\`\`\`markdown
# Proposal: {Title}

**ID:** PROP-{uuid8}
**Proposer:** {agent_name from environment}
...
\`\`\`
```

**Option B: Provide a CLI command**

Add a CLI entry point that can be run via Bash:

```bash
python -m orchestrator.orchestrator.cli create-proposal \
  --title "Add retry logic" \
  --proposer architect \
  --category refactor \
  --complexity M \
  --summary "..." \
  --acceptance "Criterion 1" \
  --acceptance "Criterion 2"
```

**Option C: Fix PYTHONPATH (Issue 1) and install orchestrator in worktrees**

If Issue 1 is fixed, ensure the orchestrator package is available when running Python in the worktree context.

---

## Issue 3: Agent state shows success even when agent fails

**Severity:** Minor

### Description

When an agent process exits (even with an error), the scheduler marks it as successful because it doesn't capture the actual exit code after detaching.

### Location

`scheduler.py:check_and_update_finished_agents()`:
```python
if not is_process_running(state.pid):
    # Process has finished, update state
    # We don't know the exit code without waiting, assume success
    new_state = mark_finished(state, 0)  # <-- Always assumes success
```

### Suggested Fix

Consider using a different process management approach:
1. Don't fully detach (`start_new_session=False`)
2. Or have agents write their exit code to a file
3. Or use a process supervisor that tracks exit codes

---

## Issue 4: Wrong module path in scheduler

**Severity:** Blocker (after PYTHONPATH fix)

### Description

In `scheduler.py:347`, the role module path is wrong:

```python
role_module = f"orchestrator.orchestrator.roles.{role}"  # Wrong
```

Should be:

```python
role_module = f"orchestrator.roles.{role}"  # Correct
```

The package structure is `orchestrator/orchestrator/` but the installed package is just `orchestrator`, so the import path is `orchestrator.roles.proposer` not `orchestrator.orchestrator.roles.proposer`.

---

## Summary

| Issue | Severity | Status |
|-------|----------|--------|
| PYTHONPATH not set | Blocker | Fixed (68be67c) |
| Skill requires unavailable imports | Blocker | Fixed (68be67c) |
| Exit code not captured | Minor | Fixed (78332d8) |
| Wrong module path in scheduler | Blocker | Fixed (4954bc2) |

All issues resolved.
