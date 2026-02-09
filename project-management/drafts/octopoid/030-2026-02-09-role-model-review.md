# Review the Octopoid Role Model

**Status:** Idea
**Captured:** 2026-02-09

## Raw

> "review the underlying model of what roles mean in octopoid and whether they are working in the way they should"

## Idea

Audit the role system in Octopoid — what each role means, what base class it uses, how the scheduler treats it, and whether the current assignments make sense. Some agents are shoehorned into roles that don't quite fit (e.g., `draft-processor` as `proposer` when it's really running a workflow action, not proposing work).

## Context

When discussing the draft-processor agent, its role is `proposer` — a role designed for agents that analyze the codebase and create proposals for the curator. But draft-processor runs `/process-draft` in automated mode, which is a workflow action (archive drafts, surface open questions, write proposed tasks). The `proposer` label is misleading and the base class behaviors may not match what the agent actually needs.

This is likely true for other agents too. The role model was designed early and the system has evolved — roles may need updating to match how agents are actually used.

## Investigation Findings (2026-02-09)

### draft-processor: No Git Lifecycle

The draft-processor agent has `role: proposer` but its prompt (`.orchestrator/prompts/draft-processor.md`) tells it to move files (`mv` from drafts to archive), create new files, and run shell scripts — all without any git instructions. No branch creation, no commit, no push.

When it runs, the scheduler creates a worktree (via `ensure_worktree()`), but:
- The worktree is detached HEAD from main
- The agent makes file changes directly in the worktree
- Those changes are never committed or pushed — they just sit there

This is a **concrete bug**, not just a role mismatch. The agent would do real work that silently disappears.

### proposer Role Has No Git Handling

The `ProposerRole` class (`orchestrator/orchestrator/roles/proposer.py`) inherits from `SpecialistRole` → `BaseRole`. It:
- Gets a worktree from the scheduler
- Invokes Claude with a prompt and `cwd=self.worktree`
- Returns the result

But unlike `orchestrator_impl`, the proposer role has **no post-run git lifecycle** — no branch creation, no commit counting, no merge flow. Any file changes an agent makes in its worktree are orphaned.

### Comparison: How Other Roles Handle Git

| Role | Branch | Commit | Push | Merge |
|------|--------|--------|------|-------|
| `implementer` | `agent/<task-id>-*` | Yes (via Claude) | Yes → PR | Via PR review |
| `orchestrator_impl` | `orch/<task-id>` + `tooling/<task-id>` | Yes | Yes → self-merge | FF after pytest |
| `proposer` | None | None | None | None |

### Implications for draft-processor

The draft-processor needs git lifecycle support. Two options:

1. **Add git instructions to the prompt** — tell it to create a `tooling/<run-id>` branch, commit, push, and self-merge (matching the pattern from draft 027). Simple, prompt-only fix.
2. **Create a `workflow` role** — a new role class that handles branch creation, commit, push, and self-merge for agents that do file operations but don't claim tasks. More principled but more work.

Option 1 is a quick fix for draft-processor specifically. Option 2 is the right answer if more workflow agents are coming.

## Open Questions

- What roles currently exist and what do their base classes provide?
- Which agents are using roles that don't match their actual behavior?
- Should there be new roles (e.g., `workflow` for agents that run automated processes)?
- How do roles affect scheduling, task claiming, and turn budgets?
- Are the proposer/curator roles still relevant or has the system moved past them?
- **Should proposer role gain a git lifecycle, or should workflow agents use a new role?**

## Possible Next Steps

- Inventory all roles, their base classes, and which agents use them
- Map each agent's actual behavior against its role's intended behavior
- Propose role changes or new roles where there's a mismatch
- Consider whether roles should be simplified (fewer, broader) or refined (more, specific)
- **Fix draft-processor immediately** (prompt-level git instructions) — see TASK below
