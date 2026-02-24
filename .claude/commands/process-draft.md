# /process-draft - Process a Draft Into Action

Review a draft's status and determine next steps. Archive only if fully complete.

**Argument:** Filename or topic (e.g. `dashboard-redesign` or `gatekeeper-review-system-plan.md`)

## Steps

### 1. Find and read the draft

Look in `project-management/drafts/` for the matching file. Drafts use numbered filenames like `32-2026-02-17-scoped-local-server-for-testing.md`. Match by number, topic slug, or title. Read it fully.

### 2. Check for outstanding work

Scan for:
- Unchecked items or TODOs
- "Future work" or "Next steps" sections
- Open questions that weren't resolved
- Alternatives that were deferred, not rejected

**If running in human-guided mode:** list them and ask whether to:
- Create new drafts for them
- Enqueue them as tasks (via `/enqueue`)
- Ignore them

**If running in automated mode (e.g. draft aging agent):** do NOT enqueue tasks or start work directly. Instead:

1. **Check for unresolved open questions first.** If the draft has an "Open Questions" section with unanswered questions, do NOT propose tasks. Instead, surface the questions in the inbox message for the human to answer. The draft gets archived either way (it's been filed), but no work should be proposed until the questions are resolved.

2. **Only if no blocking open questions exist**, write proposed tasks to `project-management/drafts/proposed-tasks/` as markdown files, one per task. Use the format:
   ```markdown
   # Proposed Task: <title>

   **Source draft:** <draft filename>
   **Proposed role:** <implement | orchestrator_impl | review>
   **Proposed priority:** <P0-P2>

   ## Context
   <Why this task exists — reference the source draft>

   ## Acceptance Criteria
   - [ ] <criteria>
   ```
3. If multiple related tasks form a coherent project, also write a proposed project file linking them.
4. Send a summary to the human inbox listing what was found, any open questions that need answers, and any proposed tasks.
5. **Do not call `create_task()` or `/enqueue`.** A human (or the PM session) decides what to enqueue.

### 3. Extract rules, patterns, and architecture

Look for content that encodes lasting decisions, constraints, or system design — things future development should follow. Three categories:

#### Rules and patterns
- **Architectural rules** — "X should always go through Y", "never do Z directly"
- **Testing patterns** — "test this kind of feature by doing X"
- **Process rules** — "when approving orchestrator tasks, do X first"
- **Naming conventions** — "branches for X should be named Y"
- **Dependency constraints** — "A must happen before B"

#### Architecture documentation
Look for content that describes **how a subsystem works** — not just rules to follow, but explanations that agents need to understand to work effectively. Signs of architecture content:
- Describes a data flow or control flow (e.g. "the scheduler reads the flow, finds the transition, runs the steps")
- Explains the interaction between multiple components
- Documents a design decision and its rationale (e.g. "agents are pure functions because...")
- Describes a protocol or contract between parts of the system

If the draft contains architecture-level content, check whether an existing doc in `docs/` already covers it. If so, update that doc. If not, create a new one and reference it from `CLAUDE.md` so agents read it.

**If running in human-guided mode:** present the extracted rules and architecture points, and ask which to add to:
- `.claude/rules/` — for rules agents should follow
- `CLAUDE.md` — for project-wide architectural constraints
- `CLAUDE.local.md` — for interactive session workflow
- `docs/` — for architecture documentation and reference (add a `CLAUDE.md` reference so agents find it)

**If running in automated mode:** include proposed rules and architecture docs in the inbox message. Do not modify rule files or docs directly — flag them for human review.

### 4. Decide on status and update server

Determine the appropriate status:
- `complete` — all work done, decisions implemented
- `superseded` — replaced by a newer draft or plan
- `active` — work in progress (task enqueued)
- `partial` — some work done, more to do
- `idea` — not yet acted on (default)

Update the status on the server:

```python
from orchestrator.queue_utils import get_sdk
sdk = get_sdk()
sdk._request("PATCH", f"/api/v1/drafts/{draft_id}", json={"status": new_status})
```

**Do NOT move files on disk.** The server status is the source of truth. All draft files stay in `project-management/drafts/` regardless of status.
