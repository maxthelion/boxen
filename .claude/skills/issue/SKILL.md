---
name: issue
description: Create, list, or update tracked issues in docs/issues/. Use when reporting bugs, viewing known issues, or updating issue status.
argument-hint: "[create|list|close] [description]"
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
2. **Create the issue file** at `docs/issues/NNN-short-description.md` using this template:

```markdown
# Issue NNN: Title

**Date Reported:** YYYY-MM-DD
**Status:** Open
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

4. **Commit on main** - Issues should be committed on `main`, not feature branches:
   - If on a feature branch, ask user if they want to stash changes and commit to main
   - Or just create the files without committing

### `/issue close NNN`
Update issue NNN's status to "Closed" in both the issue file and index.

### `/issue update NNN <status>`
Update issue NNN's status (Open, In Progress, Closed).

## Important Notes

- Issue numbers are zero-padded to 3 digits (001, 002, etc.)
- Short descriptions in filenames use kebab-case
- Always update both the issue file AND the index
- Issues should be committed on `main` branch when possible
