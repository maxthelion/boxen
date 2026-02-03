# /set-priorities - Update Current Priorities

Update the project's current priorities based on your direction.

## Usage

```
/set-priorities [your priority statement]
```

## Examples

```
/set-priorities focus on bug fixing for the next week
/set-priorities make refactoring the engine a top priority
/set-priorities prioritize the 2D editing tools, deprioritize new features
/set-priorities theme: stability and polish
/set-priorities I want to focus on: 1) completing subdivisions 2) fixing issue #003
```

## What This Does

1. Reads your priority statement
2. Updates `.orchestrator/current-priorities.md` with:
   - New primary focus areas
   - Adjusted work category weights
   - Updated "Not Now" section
   - Guidance for groomer and PM agents
3. Timestamps the change

## Priority Types You Can Set

### By Category
- **Bugs/Issues** - "focus on bug fixing", "clear the issue backlog"
- **Refactoring** - "make refactoring a priority", "clean up the codebase"
- **Features** - "prioritize new features", "focus on user-facing work"
- **Stability** - "focus on stability", "no new features until stable"

### By Theme
- "theme: polish" - UX improvements, edge cases, error messages
- "theme: performance" - Optimization, speed improvements
- "theme: testing" - Test coverage, reliability
- "theme: documentation" - Docs, comments, examples

### By Specific Items
- "prioritize the fillet tool"
- "focus on completing plan X"
- "issue #003 is urgent"

### By Time Frame
- "for the next week..."
- "until the release..."
- "short term focus on..."

## Instructions for Claude

When the user invokes this skill:

1. **Read the current priorities file**
   ```
   .orchestrator/current-priorities.md
   ```

2. **Parse the user's priority statement** to understand:
   - What categories/themes/items to prioritize
   - What to deprioritize (move to "Not Now")
   - Any time frame mentioned
   - Specific guidance for agents

3. **Update the priorities file** with:
   - Updated "Last Updated" timestamp
   - New "Focus Period" description if time frame given
   - Reordered/rewritten "Primary Focus" section
   - Adjusted "Work Categories" ordering
   - Updated "Not Now" section
   - Updated guidance for Groomer and PM

4. **Show the user** the key changes made

5. **Remind the user** that:
   - Inbox poller will route items based on new priorities
   - Groomer will focus on high-priority items
   - PM will balance work according to new guidance

## Example Output

```
Updated .orchestrator/current-priorities.md:

Primary Focus (changed):
1. Bug fixing - clear docs/issues/ backlog
2. Stability - no new operations until core is solid
3. Complete in-progress plans

Moved to "Not Now":
- New feature development
- Performance optimization

Groomer will prioritize issues from docs/issues/
PM will weight bugs at 60%, stability at 30%, features at 10%
```
