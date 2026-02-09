# Auto-Updated Changelog for Boxen

**Status:** Idea
**Captured:** 2026-02-08

## Raw

> "changelog for boxen that is updated by the orchestrator when application work is done"

## Idea

Maintain a user-facing changelog for the Boxen app that Octopoid automatically appends to when application tasks are completed. When an agent's PR merges or a task is accepted, the orchestrator writes a changelog entry describing what changed. This keeps a running record of what's shipped without the human PM having to write each entry manually.

## Context

The project has a roadmap (`project-management/boxen-roadmap.md`) that tracks what's planned and in flight, but no record of what actually shipped and when. Features land via agent PRs, get merged, and the only trace is git history and closed task files in `done/`. A changelog would give a quick "what's new" view and could also feed into the roadmap update process (the companion draft `roadmap-auto-update.md`).

## Open Questions

- What format? Keep it simple (date + one-liner) or structured (semver-style, categories like "Added/Fixed/Changed")?
- Where does it live? `CHANGELOG.md` at repo root? `project-management/changelog.md`? A section in the roadmap?
- Should it be user-facing (written for end users of the app) or developer-facing (written for contributors)?
- How does the agent produce a good one-liner? From the task title? From the PR description? From the commit messages?
- Should it distinguish between app changes and orchestrator changes, or only track app changes?
- What about quality — should the PM review entries before they're committed, or is auto-commit acceptable for a changelog?

## Possible Next Steps

- Decide on format and audience (user-facing vs developer-facing)
- Add a post-accept hook in the scheduler that appends a changelog entry when an app task (not orchestrator_impl) is accepted
- Use the task title + PR number as the entry content, with the date
- Optionally: have the implementing agent write a changelog entry as part of its acceptance criteria, so the wording is task-aware rather than generic
