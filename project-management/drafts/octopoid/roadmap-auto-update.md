# Draft: Automatic Roadmap Updates via Octopoid

**Status:** Idea
**Created:** 2026-02-08

## Problem

The Boxen roadmap (`project-management/boxen-roadmap.md`) goes stale quickly. PRs merge, features ship, new plans get drafted — but the roadmap still lists them as "in flight" or "near-term." The human PM has to manually reconcile.

## Idea

Have Octopoid update the roadmap as part of the task completion flow. When a task is accepted (via self-merge or human approval), a lightweight step checks whether the completed work touches anything in the roadmap and proposes or applies updates.

## What Could Be Updated Automatically

### High confidence (safe to auto-apply)

- **"In Flight" PR table**: When a PR merges, remove it from the table or move it to "What's Built." The PR number is already in the roadmap — just check `gh pr view <number> --json state`.
- **"In Flight" plan status**: When all tasks from a breakdown are accepted, the plan's "What Remains" entry can be updated.

### Medium confidence (propose, don't apply)

- **"What's Built" section**: When a new feature ships (e.g., "snap system"), suggest adding it. But the wording needs human judgment — you don't want agent-written feature descriptions in a human-facing document.
- **Near-Term → What's Built promotion**: When a near-term item is fully implemented, suggest moving it.

### Low confidence (flag only)

- **Priority changes**: If a new bug or tech debt surfaces, flag that the roadmap priorities might need revisiting.
- **Dependency map changes**: If a blocker is resolved, flag that downstream items are now unblocked.

## Implementation Options

### Option A: Post-accept hook in the scheduler

After `accept_completion()`, run a quick check:
1. Read the task's title and acceptance criteria
2. Grep the roadmap for related keywords
3. If matches found, append a note to the PM session's inbox: "TASK-xxx completed — roadmap may need updating: [section]"

Pros: Simple, non-destructive, PM stays in control.
Cons: Still requires human to do the actual edit.

### Option B: Dedicated roadmap-updater agent

A new lightweight role (`roadmap_updater`) that:
1. Runs after each accept cycle (or on a daily schedule)
2. Reads the roadmap, current PR state (`gh pr list`), and recently accepted tasks
3. Produces a diff of proposed roadmap changes
4. Writes the diff to the human inbox for approval (or auto-applies the high-confidence ones)

Pros: Can handle all update types, produces a clean diff.
Cons: Another agent role to maintain, needs careful prompting to avoid rewriting the whole doc.

### Option C: Roadmap refresh slash command

A `/refresh-roadmap` command that:
1. Checks all PR numbers in the roadmap against GitHub
2. Cross-references recently completed tasks with roadmap items
3. Outputs a summary of what's changed and proposes edits

Pros: Human-triggered so no risk of runaway edits.
Cons: Still manual — you have to remember to run it.

## Recommendation

Start with **Option A** (inbox notifications) for immediate value, then build toward **Option C** (slash command) as the standard workflow. Option B is premature — the roadmap doesn't change fast enough to justify a dedicated agent.

The key principle: **the roadmap is a human-curated document**. Automation should surface what's changed, not rewrite it. The PM decides how to describe features, what priorities to set, and when to promote items between tiers.

## Integration Points

| Event | Action |
|-------|--------|
| PR merged | Check if PR # appears in roadmap "In Flight" table → flag for removal |
| Task accepted | Check if task title/keywords match a roadmap section → flag for update |
| All breakdown tasks done | Flag that the parent plan's "What Remains" may be empty |
| New plan created | Flag that roadmap "In-Progress Plans" table may need a new row |

## Not in Scope

- Rewriting roadmap prose automatically
- Changing priorities without human input
- Updating the dependency map (too nuanced)
