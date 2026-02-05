# Improve Implementer Agent Instructions

CREATED: 2026-02-04T12:05:00Z
PRIORITY: P2
COMPLEXITY: M
ROLE: implement

## Summary

Improve the implementer agent instructions so agents create self-documenting plans that help with task resumption and progress tracking.

## Problem

Currently when an agent is interrupted or needs to resume work:
- They only see "there are uncommitted changes, figure out what to do"
- No structured record of what was planned vs completed
- Progress percentage in status.json is vague (no clear milestones)
- New agent picking up work has to reverse-engineer intent from code changes

## Requirements

### 1. Plan Creation Phase

Agents should create a plan document at the start of each task:

```markdown
# Plan: [TASK-ID]

## Approach
[High-level strategy]

## Steps
- [ ] Step 1: Description
- [ ] Step 2: Description
- [ ] Step 3: Description

## Files to Modify
- path/to/file.ts - reason

## Progress Log
- [timestamp] Started task
- [timestamp] Completed step 1
```

Location: `.orchestrator/agents/{agent-name}/plan.md` (in worktree)

### 2. Progress Updates

As agents complete steps:
- Check off completed steps in the plan
- Add entries to Progress Log
- Update status.json progress_percent based on steps completed

### 3. Resumption Instructions

When resuming, agents should:
1. Read existing plan.md first
2. Review Progress Log to understand what was done
3. Check off any additional completed steps
4. Continue from next unchecked step

### 4. Update Both Locations

**Octopoid submodule** (the template):
- `orchestrator/templates/agent_instructions.md.tmpl` - base template
- `orchestrator/orchestrator/roles/implementer.py` - role-specific logic

**Local overrides** (if any):
- `.orchestrator/prompts/implementer.md`
- Any custom instruction files

## Acceptance Criteria

- [ ] Implementer agents create plan.md at task start
- [ ] Plan includes checkable steps and progress log
- [ ] status.json progress reflects plan completion percentage
- [ ] Resumed agents read and continue from existing plan
- [ ] Template updated in octopoid submodule
- [ ] Local instructions updated if needed

CLAIMED_BY: impl-agent-2
CLAIMED_AT: 2026-02-04T12:02:14.598041

NEEDS_CONTINUATION_AT: 2026-02-04T12:06:06.040194
CONTINUATION_REASON: uncommitted_changes
WIP_BRANCH: agent/TASK-improve-implementer-instructions-20260204-120214
LAST_AGENT: impl-agent-2

RESUMED_AT: 2026-02-04T12:06:10.344452
RESUMED_BY: impl-agent-2

COMPLETED_AT: 2026-02-04T12:10:59.446321

## Result
PR created: https://github.com/maxthelion/boxen/pull/13
