---
name: issue
description: Create, list, or update tracked issues in docs/issues/. Use when reporting bugs, viewing known issues, or updating issue status.
argument-hint: "[create|list|close|link] [description|NNN]"
disable-model-invocation: true
---

# Issue Tracking Skill

Manage tracked issues in `docs/issues/`.

## Commands

Based on `$ARGUMENTS`:

### `/issue list` or `/issue`
Show all tracked issues from `docs/issues/index.md`.

### `/issue create <description>`
Create a new issue:

1. **Determine the next issue number** by reading `docs/issues/index.md`
2. **Check for current project** by reading `.claude/current-project` (if exists)
3. **Create the issue file** at `docs/issues/NNN-short-description.md` using this template:

```markdown
# Issue NNN: Title

**Date Reported:** YYYY-MM-DD
**Status:** Open
**Project:** (current project or "None")
**Phase:** (current active phase or "N/A")
**Branch:** (current branch)
**Commit:** (current commit hash)

## Description
[What the issue is]

### Steps to Reproduce
1. [Step 1]
2. [Step 2]

### Expected Behavior
[What should happen]

### Actual Behavior
[What actually happens]

## Technical Analysis
[Root cause explanation if known]

## Recommended Fixes
[Options for fixing, labeled Option A, B, C, etc.]

## Affected Code
[List of relevant files]

## Detection
[How the issue is detected - validators, tests, etc.]
```

3. **Update the index** at `docs/issues/index.md`:
```markdown
| [NNN](NNN-short-description.md) | Title | Open | YYYY-MM-DD |
```

4. **If a current project is set**, add the issue to the project's active phase:
   - Read `docs/projects/<project>/project.md`
   - Find the active phase
   - Add `- Issue NNN: <title>` to that phase's Issues section

5. **Commit on main** - Issues should be committed on `main`, not feature branches:
   - If on a feature branch, ask user if they want to stash changes and commit to main
   - Or just create the files without committing

### `/issue close NNN`
Update issue NNN's status to "Closed" in both the issue file and index.

### `/issue update NNN <status>`
Update issue NNN's status (Open, In Progress, Closed).

### `/issue link NNN <project> [phase]`
Link an existing issue to a project and phase:
1. Verify the issue exists at `docs/issues/NNN-*.md`
2. Verify the project exists at `docs/projects/<project>/project.md`
3. Update the issue file's **Project** and **Phase** fields
4. Add the issue to the project's phase issue list
5. If no phase specified, use the currently active phase

### `/issue unlink NNN`
Remove project/phase association from an issue:
1. Set **Project** to "None" and **Phase** to "N/A" in the issue file
2. Remove the issue from the project's phase issue list

## Important Notes

- Issue numbers are zero-padded to 3 digits (001, 002, etc.)
- Short descriptions in filenames use kebab-case
- Always update both the issue file AND the index
- Issues should be committed on `main` branch when possible
- When a current project is set (via `/project set`), new issues automatically link to it
