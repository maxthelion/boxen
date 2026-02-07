Surface actionable items for idle moments. Answers "what should we do next?"

Run:

```bash
.orchestrator/venv/bin/python .orchestrator/scripts/whats_next.py
```

This is different from `/orchestrator-status` (raw system state). It focuses on **actions you can take right now**, organized by priority:

1. **Open PRs** — ready to review or merge
2. **Struggling agents** — running long with no commits
3. **Provisional tasks** — completed work awaiting approval
4. **Breakdowns** — pending review before subtasks are enqueued
5. **Human inbox** — proposals and decisions from agents
6. **Failed/escalated tasks** — need investigation or retry
7. **Agent recommendations** — architecture, testing, refactoring suggestions
8. **Queue capacity** — whether agents have enough work
9. **Awaiting clarification** — items blocked on your input
10. **Unenacted drafts** — plans that could become tasks

After running, summarize the top 3 most important items and suggest a concrete next step.
