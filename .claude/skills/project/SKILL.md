---
name: project
description: Manage projects and phases. Projects group related plans from docs/plan_index.md and track progress through phases.
argument-hint: "[list|current|new|status|phases|set] [name]"
disable-model-invocation: true
---

# Project Management Skill

Manage projects that group related plans from `docs/plan_index.md`.

## Concepts

- **Project**: A collection of related plans working toward a larger goal
- **Phase**: A stage of the project (Planning, Implementation, Polish)
- **Plan**: A technical document tracked in `docs/plan_index.md`

Projects live in `docs/projects/<name>.md` and reference plans from the plan index.

## Commands

Based on `$ARGUMENTS`:

### `/project` or `/project list`
Show all projects from `docs/projects/index.md`.

### `/project current`
Show the current active project by reading `.claude/current-project`.
If no current project is set, suggest using `/project set <name>`.

### `/project set <name>`
Set the current active project:
1. Verify the project exists in `docs/projects/<name>.md`
2. Write the project name to `.claude/current-project`
3. Confirm the change

### `/project new <name>`
Create a new project:

1. **Create project file** at `docs/projects/<name>.md` using this template:

```markdown
# Project: <Name>

**Created:** YYYY-MM-DD
**Status:** Planning

## Overview
[Brief description of the project goals]

## Phases

### Phase 1: Planning
**Status:** Active

Goals:
- [ ] Define requirements
- [ ] Identify affected areas
- [ ] Create technical plans

Plans:
- (none yet - use `/project add-plan <plan-name>` to link plans)

Issues:
- (none yet)

### Phase 2: Implementation
**Status:** Pending

Goals:
- [ ] Implement core functionality
- [ ] Write tests
- [ ] Update documentation

Plans:
- (plans will move here when implementation begins)

Issues:
- (none yet)

### Phase 3: Polish
**Status:** Pending

Goals:
- [ ] Bug fixes
- [ ] Performance optimization
- [ ] User feedback integration

Plans:
- (completed plans archive here)

Issues:
- (none yet)

## Notes
[Any additional notes or context]
```

2. **Update the index** at `docs/projects/index.md`:
```markdown
| [<name>](<name>.md) | <Title> | Planning | YYYY-MM-DD |
```

3. **Set as current project** by writing to `.claude/current-project`

### `/project status [name]`
Show detailed status of a project:
1. If no name provided, use current project from `.claude/current-project`
2. Read `docs/projects/<name>.md`
3. Summarize: active phase, linked plans and their statuses (from plan_index.md), open issues

### `/project phases [name]`
List all phases of a project with their status and linked plans.

### `/project add-plan <plan-name> [project-name]`
Link an existing plan to the current phase:
1. Verify the plan exists in `docs/plan_index.md`
2. Add the plan reference to the active phase's "Plans:" section
3. Format: `- [plan-name.md](../plan-name.md) - status`

### `/project add-issue <issue-number> [project-name]`
Link an existing issue to the current phase:
1. Verify the issue exists in `docs/issues/`
2. Add the issue reference to the active phase's "Issues:" section
3. Format: `- Issue NNN: <title>`

### `/project update-phase <phase-number> <status> [name]`
Update a phase's status (Pending, Active, Complete):
1. Edit `docs/projects/<name>.md` to update the phase status
2. If setting to "Active", set previous active phase to "Complete"
3. When completing a phase, suggest moving plans to next phase

## Directory Structure

```
docs/
├── plan_index.md              # Master list of all plans (existing)
├── completed_projects/        # Archive of completed projects (existing)
├── projects/
│   ├── index.md               # List of active projects
│   └── <project-name>.md      # Individual project files
├── issues/
│   └── ...                    # Issue tracking (existing)
└── *.md                       # Individual plan documents (existing)
```

## Integration with Existing Systems

### Plan Index (`docs/plan_index.md`)
- Plans are the source of truth for technical specifications
- Project phases reference plans by linking to them
- Plan status (draft/in-progress/complete) reflects implementation progress

### Completed Projects (`docs/completed_projects/`)
- When a project is complete, move its file to `docs/completed_projects/`
- Update `docs/projects/index.md` to mark as Complete

### Issues (`docs/issues/`)
- Issues can be linked to project phases
- When creating issues with a current project set, they auto-link to the active phase

## Status Values

**Project Status:**
- `Planning` - Defining scope and creating plans
- `Active` - Implementation in progress
- `Paused` - Temporarily on hold
- `Complete` - Project finished (move to completed_projects/)

**Phase Status:**
- `Pending` - Not yet started
- `Active` - Currently in progress
- `Complete` - Phase finished

## Important Notes

- Project names use kebab-case (e.g., `edge-extensions`)
- Only one project can be "current" at a time
- Projects group plans - they don't replace the plan index
- Phase transitions should prompt reviewing linked plan statuses
