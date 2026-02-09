# Auto-Merge Model for Orchestrator Tasks

**Status:** Draft
**Created:** 2026-02-08

## Problem

Reviewing orchestrator_impl tasks is painfully expensive. Each task requires:
- Finding commits in the agent's worktree submodule (separate git object store)
- Cherry-picking to main (approval script breaks when agent has moved on)
- Running tests, pushing submodule, updating ref in boxen, pushing boxen

With 7 tasks piled up, this is hours of git plumbing for changes we generally trust.

## Solution

Trust orchestrator agents by default. Auto-merge their work into the submodule's local `main` after tests pass. Review the accumulated diff when ready to push to origin.

```
Agent submits → gk-testing-octopoid runs pytest →
  pass  → auto-merge to local main (no push)
  fail  → reject back to agent
  conflict → escalate to human inbox
```

Human reviews and pushes when ready via `/push-orchestrator`.

## Design

### Auto-merge flow

When an orchestrator_impl task passes gatekeeper review:

1. Cherry-pick the agent's `orch/<task-id>` commits onto local `main` in the submodule
2. Run pytest to verify the merge is clean
3. If clean: accept in DB, task is done
4. If conflict or test failure: escalate to human inbox
5. Do NOT push to origin — changes accumulate locally

New agent work is based on local `main` (which includes unpushed changes), so subsequent tasks build on previous ones naturally.

### Manual push

A `/push-orchestrator` skill handles publishing:

```bash
# Show what's unpushed
cd orchestrator && git log origin/main..main --oneline

# Push submodule
git push origin main

# Update submodule ref in boxen
cd .. && git add orchestrator && git commit -m "chore: update orchestrator submodule" && git push
```

Human runs this when they're ready. No auto-push.

### Escalation system

When something can't be resolved automatically, it goes to the **human inbox** — a queue of items requiring human attention, surfaced via `/human-inbox` and `/whats-next`.

Escalation triggers (across all orchestrator features):

| Trigger | Source | What lands in inbox |
|---------|--------|-------------------|
| Merge conflict during auto-merge | Auto-merge | Task ID, conflicting files, both sides of conflict |
| Gatekeeper rejects 3x | Gatekeeper | Task ID, all three rejection reasons, agent notes |
| Non-trivial rebase conflict | Rebaser | Task ID, conflicting files, rebase state |
| Agent burned out (after re-breakdown) | Recycler | Task ID, original intent, what was attempted |
| Tests fail after clean merge | Auto-merge | Task ID, test output, diff |

Inbox items have:
- **Source** — which system created this
- **Task ID** — the task that triggered it
- **Context** — enough info to act without re-investigating
- **Suggested actions** — e.g. "resolve conflict manually", "give better guidance", "close task"

Implementation: a DB table or queue directory (`.orchestrator/shared/queue/escalated/`). Each item is a markdown file with structured metadata, same pattern as tasks.

### What changes from current model

| Aspect | Before | After |
|--------|--------|-------|
| Approval | Manual per-task cherry-pick | Auto-merge on gatekeeper pass |
| Push timing | Each approval pushes immediately | Manual `/push-orchestrator` when ready |
| Review granularity | Per-task before merge | Accumulated diff before push |
| Conflict handling | Human does the cherry-pick | Auto-merge attempts, escalates on conflict |
| Trust model | Verify then merge | Merge then verify (with test gating) |

## Dependencies

1. **Gatekeeper system must work** — `gk-testing-octopoid` needs to run pytest and pass/reject. This is task 2270301c (currently burned out, needs re-scoping).
2. **Escalation inbox** — new concept, needs DB/queue support.
3. **Approve script update** — current `approve_orchestrator_task.py` needs to support auto-merge mode (no push, no human confirmation).

## Migration

1. **Enable gatekeeper** — get `gk-testing-octopoid` working (re-scope 2270301c)
2. **Build escalation inbox** — DB table + `/human-inbox` integration
3. **Update approval script** — add `--auto` flag that skips push and human confirmation
4. **Wire scheduler** — on gatekeeper pass, auto-run approval with `--auto`
5. **Create `/push-orchestrator`** — manual push skill
6. **Update rules** — orch-impl tasks no longer need `/approve-task`, update CLAUDE.local.md and orchestration rules
7. **Process the current backlog** — manually approve or auto-merge the 6 remaining provisional orch tasks

## Open Questions

- Should we keep the `orch/<task-id>` feature branches after merge, or delete them?
- What's the inbox retention policy? Auto-clear after resolution?
