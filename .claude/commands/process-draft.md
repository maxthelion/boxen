# /process-draft - Process a Draft Into Action

When a draft has been enacted (tasks created, changes made, or decision taken), process it for archival.

**Argument:** Filename or topic (e.g. `dashboard-redesign` or `gatekeeper-review-system-plan.md`)

## Steps

### 1. Find and read the draft

Look in `project-management/drafts/` for the matching file. Read it fully.

### 2. Check for outstanding work

Scan for:
- Unchecked items or TODOs
- "Future work" or "Next steps" sections
- Open questions that weren't resolved
- Alternatives that were deferred, not rejected

If any exist, list them and ask whether to:
- Create new drafts for them
- Enqueue them as tasks (via `/enqueue`)
- Ignore them

### 3. Extract rules and patterns

Look for content that encodes lasting decisions or constraints — things future development should follow. Common types:

- **Architectural rules** — "X should always go through Y", "never do Z directly"
- **Testing patterns** — "test this kind of feature by doing X"
- **Process rules** — "when approving orchestrator tasks, do X first"
- **Naming conventions** — "branches for X should be named Y"
- **Dependency constraints** — "A must happen before B"

For each rule found, propose adding it to the appropriate place:
- `.claude/rules/` — for rules agents should follow
- `CLAUDE.md` — for project-wide architectural constraints
- `CLAUDE.local.md` — for interactive session workflow
- `docs/` — for reference documentation

Present the extracted rules and ask which to add.

### 4. Archive the draft

Move the file:
```bash
mv project-management/drafts/<file> project-management/archive/<file>
```

### 5. Suggest a commit

Propose committing the archive move and any new rules extracted, e.g.:
```
chore: archive <draft-name>, extract <rule-topic> rules
```
