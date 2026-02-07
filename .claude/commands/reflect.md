# /reflect - Reflect on What Just Happened

Look at the recent conversation and assess whether the last task or situation was more complicated than it needed to be.

## Steps

### 1. Summarize what happened

Describe in 2-3 sentences what was attempted and what actually occurred. Be specific about detours, errors, and manual steps that shouldn't have been necessary.

### 2. Rate the friction

Pick one:
- **Clean** — went as expected, no wasted effort
- **Bumpy** — got there but hit avoidable snags
- **Messy** — significant wasted effort, wrong turns, or confusion
- **Disaster** — major time sink, things broke, or we're worse off than before

### 3. Identify root causes

For each snag or wrong turn, identify why it happened. Common patterns:
- **Missing automation** — a manual multi-step process that should be a script
- **Wrong assumptions** — assumed X worked a certain way, it didn't
- **Missing guard rails** — no validation caught the mistake early
- **Unclear ownership** — wasn't clear which tool/script/flow handles this case
- **Stale docs** — instructions didn't match reality
- **Wrong branch/directory/context** — operated in the wrong place

### 4. Propose prevention

For each root cause, suggest ONE concrete fix. Prefer:
- A script over a documented procedure
- A check/validation over "remember to do X"
- Updating an existing tool over creating a new one
- A rule in `.claude/rules/` over a note in a doc

Format as a checklist:
```
- [ ] <concrete action> — prevents <root cause>
```

### 5. If "Messy" or "Disaster": propose a postmortem

If the friction rating is Messy or Disaster, suggest running `/postmortem` to do a deeper analysis. Briefly state what the postmortem should cover.

### 6. Consider related skills

If the prevention items could be addressed by existing skills, mention them:
- `/enqueue` — create a task for an agent to build the missing script/automation
- `/postmortem` — deeper analysis if the friction was Messy or Disaster
- `/whats-next` — check if the mess left dangling work items
- `/orchestrator-status` — check if agents or tasks are in a bad state after the mess

### 7. Ask what to action

Present the prevention checklist and ask which items the user wants to do now vs later vs skip.
