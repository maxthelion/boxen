Show a summary of today's activity across the project.

Run:

```bash
.orchestrator/venv/bin/python .orchestrator/scripts/today.py
```

Display the output to the user. Reorder the sections for the user, putting the most actionable items first:

1. **Uncommitted drafts** — list with actual titles (read the first `# heading` from each file), not just filenames. These are decisions waiting to be made.
2. **Tasks in progress** — what's happening right now
3. **Tasks completed today** — celebrate progress
4. **New tasks created** — what's queued up
5. **Git activity** — summarise briefly (X commits on main, Y in orchestrator submodule), don't list every commit
6. **Agent activity** — brief summary
