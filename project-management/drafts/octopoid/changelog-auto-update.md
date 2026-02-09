# Auto-Updated Changelog for Octopoid

**Status:** Idea
**Captured:** 2026-02-08

## Raw

> "octopoid might need one too. In the other repo."

## Idea

Maintain a changelog in the orchestrator submodule (`orchestrator/CHANGELOG.md`) that gets appended to when orchestrator_impl tasks self-merge. Since these tasks already go through the rebase-test-merge flow automatically, adding a changelog entry is a natural extension of the self-merge step.

## Context

Orchestrator changes are harder to track than app changes. They land via self-merge into the submodule's `main` branch, then the parent repo updates its submodule ref. The only record is git log in the submodule and task files in `done/`. A changelog would help the PM understand what capabilities Octopoid has gained (or lost) over time — especially useful when debugging agent behavior or explaining the system to others.

## How It Differs from the Boxen Changelog

| | Boxen | Octopoid |
|---|---|---|
| **Location** | `project-management/changelog.md` or repo root | `orchestrator/CHANGELOG.md` (in the submodule) |
| **Audience** | App users / PM | PM / developers maintaining Octopoid |
| **Trigger** | App task accepted + PR merged | orchestrator_impl task self-merged |
| **Tone** | User-facing ("Added snap system") | Developer-facing ("Added task recycling with burnout detection") |

## Open Questions

- Should the self-merge step in `orchestrator_impl.py` write the entry, or should it be a separate post-merge hook?
- What's the entry format? Task title + date is minimal. Task title + one-sentence summary from the agent's notes would be richer.
- Should it track failed/recycled tasks too (as a "known issues" or "attempted" section)?
- How to handle entries for tasks that touch both orchestrator code and scripts in `.orchestrator/`?

## Possible Next Steps

- Add a `CHANGELOG.md` to the orchestrator submodule with a few retroactive entries (self-merge, task recycling, commit counting fix, rebaser)
- Extend `_try_merge_to_main()` in `orchestrator_impl.py` to append a changelog entry on successful merge
- Entry content: date, task ID, task title — keep it mechanical, PM can polish later
