# Octopoid (Orchestrator) Debugging

The project uses **Octopoid**, an automated orchestrator that manages background agents. Full docs: `docs/orchestrator-usage.md`. Submodule: `orchestrator/` (branch `main`, venv at `orchestrator/venv/`).

## First Point of Entry

When investigating agent issues, task failures, queue problems, or anything Octopoid-related, **always start with the status script**:

```bash
.orchestrator/venv/bin/python .orchestrator/scripts/status.py
```

Or use the slash command: `/orchestrator-status`

This gives a single-page overview of: scheduler health, queue state, agent status, worktree branches/commits/diffs, agent notes, breakdowns, projects, open PRs, and messages.

**Do not** manually inspect individual agent directories, worktrees, state files, or queue folders. The status script aggregates all of this. If it doesn't show what you need, add a section to the script rather than doing ad-hoc investigation.

## When to Use

- User asks about agent progress or why something isn't running
- A task seems stuck or hasn't been picked up
- Debugging why an agent produced the wrong result
- Before unpausing agents or making queue changes
- After enqueuing work, to verify it appeared

## Orchestrator Specialist Tasks

Tasks with `role=orchestrator_impl` follow a different model to regular app tasks:

- **BRANCH must be `main`.** The scheduler creates a normal Boxen worktree; the agent works inside the `orchestrator/` submodule within it.
- **No PRs in the main repo.** The agent creates feature branches and commits there. This keeps work isolated until approved.
- **Approval uses a separate script:** `.orchestrator/scripts/approve_orchestrator_task.py <task-id>` (auto-detects agent branch, cherry-picks to main, pushes submodule, updates ref on main, accepts in DB). The script handles both submodule and main repo commits.
- **Set `role='orchestrator_impl'` at creation time.** Do not create with `role='implement'` then update — regular agents can claim it in the gap.

### Branch Naming

Orchestrator_impl agents use two branch namespaces depending on where they commit:

- **Submodule work** (Python code in `orchestrator/`): `orch/<task-id>` branch in the submodule
- **Main repo work** (commands, scripts, prompts): `tooling/<task-id>` branch in the main repo

Both merge via rebase onto main + ff-only. A single task can produce commits in both locations.

### Self-Merge via Origin

Self-merge for main repo commits pushes to origin and ff-merges there — it never touches the human's working tree. The human runs `git pull` when ready. This avoids conflicts with uncommitted local work.

For submodule commits, self-merge operates within the agent's worktree (separate git repo, no conflict risk) then pushes to origin.

## Reviewing Orchestrator Task Commits

**WARNING: This is a known pain point.** Orchestrator_impl agents work inside a git submodule (`orchestrator/`) within their worktree. Commits can end up in multiple places with **separate git object stores**:

1. The agent's worktree submodule: `.orchestrator/agents/<agent>/worktree/orchestrator/` (on branch `orch/<task-id>`)
2. The main checkout's submodule: `orchestrator/`
3. The remote: `origin/main`

These locations have **separate git object stores**. A commit visible in one is invisible from the other via `git cat-file` or `git log`. "I can't find the commit" ≠ "the commit doesn't exist."

**Before concluding a commit is fabricated:**
1. Check all three locations above
2. Check the reflog in each
3. Remember the agent may have committed but not pushed

**Use the review script** (when available):
```bash
.orchestrator/venv/bin/python orchestrator/scripts/review-orchestrator-task <task-id>
```

**Use the approve script** for approval (handles fetching from the right place):
```bash
.orchestrator/venv/bin/python .orchestrator/scripts/approve_orchestrator_task.py <task-id>
```

## Creating Tasks

**Never create task files manually.** Always use `/enqueue` or the `create_task()` function from `orchestrator.queue_utils`. Manually writing a `.md` file into the queue directory creates a file that exists on disk but is not registered in the DB — the scheduler cannot see it, and it will sit in `incoming/` forever.

If you find an orphan file (the status script flags these), register it in the DB or recreate it via `/enqueue`.

## Other Useful Scripts

Scripts in `orchestrator/scripts/` (run with `.orchestrator/venv/bin/python`):

| Script | Purpose |
|--------|---------|
| `list-tasks [queue]` | List tasks in a queue (incoming, claimed, done, etc.) |
| `view-task <id>` | Show full task details |
| `project-status [id]` | Show project with task breakdown |
| `list-breakdowns` | Show pending breakdowns awaiting review |
| `view-breakdown <id>` | Show breakdown details |

Scripts in `.orchestrator/scripts/`:

| Script | Purpose |
|--------|---------|
| `status.py` | Comprehensive one-shot status report |
| `accept_all.py` | Accept all provisional tasks |
| `list_gatekeepers.py` | Show gatekeeper config, agents, checks, and key files |
| `approve_orchestrator_task.py` | Approve orchestrator_impl tasks (cherry-pick + push) |

## Reviewing Agent Output

A permanent review worktree exists at `.orchestrator/agents/review-worktree/`. Use it to check out agent branches and run tests **without touching the main working tree**.

```bash
# Switch to an agent branch
cd .orchestrator/agents/review-worktree
git checkout origin/agent/<branch-name>

# Run tests
npx vitest run <test-path>

# Run full suite
npx vitest run

# When done, leave it — no cleanup needed
```

**Always use this worktree** instead of `git checkout FETCH_HEAD -- <files>` or stash/restore gymnastics in the main repo. It has its own `node_modules` so tests run independently.

If the worktree is missing (e.g., after a fresh clone), recreate it:

```bash
git worktree add --detach .orchestrator/agents/review-worktree HEAD
cd .orchestrator/agents/review-worktree && npm install
```

## Extending the Status Script

If you find yourself doing manual investigation that the status script doesn't cover, **add it to the script** at `.orchestrator/scripts/status.py` so the next person benefits. Examples of things worth adding:

- New queue types or agent roles
- Deeper task content inspection
- Cross-referencing worktree state with task assignments
- Checking for common failure patterns
