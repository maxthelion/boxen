# /postmortem - Create Process Failure Postmortem

Create a postmortem document for a process failure — when tasks, agents, or communication produced the wrong outcome.

## When to Use

- Agent work completed but the bug wasn't actually fixed
- Task breakdown decomposed work in a way that lost the original intent
- Tests passed but the feature is broken (wrong testing layer)
- Commit messages claim work that wasn't done
- Multiple rounds of work on the same problem without progress
- Miscommunication between human intent and agent execution

## Process

### 1. Investigate the Failure

Before writing, gather evidence:

- Read the original task/bug report that started the work
- Read the breakdown (if one exists) in `.orchestrator/shared/breakdowns/`
- Check the branch git log for what was actually committed
- Diff key files to see what changed vs what should have changed
- Read any tests that were written — do they test the right thing?
- Check commit messages against actual diffs for accuracy

### 2. Write the Postmortem

Create a file in `project-management/postmortems/` with format `YYYY-MM-DD-short-description.md`:

```markdown
# Postmortem: [Title]

**Date:** YYYY-MM-DD
**Branch:** `branch-name`
**Severity:** [User-facing bug survived | Feature not implemented | Wrong implementation | etc.]

## Summary

[2-3 sentences: What was supposed to happen, what actually happened, scale of wasted effort]

## Timeline

[Numbered list of events from bug report through to discovery of failure]

## Root Cause

### Immediate: [What directly caused the failure]
[Details with code examples]

### Structural: [What systemic issue allowed this]
[Details about process gaps]

### Misleading: [What created false confidence]
[Details about signals that looked good but weren't]

## What the actual fix requires

[Concrete description of what needs to change]

## Lessons

### 1. [Lesson title]
[Explanation with before/after examples]

### 2. [Lesson title]
[Explanation]

## Remediation

### [Rule/template/process change 1]
[Specific, actionable change with example]

### [Rule/template/process change 2]
[Specific, actionable change with example]
```

### 3. Propose Remediation

After writing, ask the user which remediation steps to implement:
- Testing rule updates (`.claude/rules/testing.md`)
- Breakdown template updates (`.orchestrator/prompts/breakdown.md`)
- New rules files (`.claude/rules/`)
- Enqueue fix tasks

## Reference

See existing postmortem: `project-management/postmortems/2026-02-06-share-link-panel-ops.md`
