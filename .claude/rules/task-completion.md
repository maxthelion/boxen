# Task Completion Workflow

When finishing a task, follow this cleanup process:

## 1. Identify Related Documents

Check for documents that were used during the task:
- Plans in `docs/` or `.claude/plans/`
- Drafts in `project-management/drafts/`

## 2. Review and Extract Outstanding Work

Before marking complete, read through each document and look for:
- Unfinished items or TODOs
- "Future work" or "Next steps" sections
- Recommendations that weren't implemented
- Open questions that weren't resolved

## 3. Capture Outstanding Work

For each outstanding item found:
1. Create a new draft in `project-management/drafts/`
2. Use descriptive filename: `<topic>-<brief-description>.md`
3. Include context about where it came from
4. Register on the server via `sdk.drafts.create()`

## 4. Update Status on Server

Update the draft status on the octopoid server. **Do not move files on disk** — the server status is the source of truth. Files stay in `project-management/drafts/`.

```python
from orchestrator.queue_utils import get_sdk
sdk = get_sdk()
sdk._request("PATCH", f"/api/v1/drafts/{draft_id}", json={"status": "complete"})
```

## 5. Suggest to User

When a task completes, proactively suggest:
> "Task complete. I noticed [X outstanding items] - want me to capture those as separate drafts?"

This ensures nothing falls through the cracks when closing out work.
