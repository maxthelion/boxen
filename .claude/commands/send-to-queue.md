# /send-to-queue - Send Work to Agents

Send the current discussion to the breakdown queue for async processing by agents.

## Usage

```
/send-to-queue [title]
```

## Behavior

1. Summarize the current discussion context
2. Ask: "Is this a project (multi-task feature) or single task?"
3. If project: create project + breakdown task
4. If task: create single task (in breakdown queue if large)
5. Confirm creation and provide project/task ID

## Implementation

When this command is invoked:

1. **Summarize the discussion** - extract the key requirements, decisions made, and context
2. **Determine scope** - ask user if this is a project or single task
3. **Create the work item**:

For a **project**:
```python
from orchestrator.orchestrator.queue_utils import send_to_breakdown

result = send_to_breakdown(
    title="<title from discussion>",
    description="<summary of requirements>",
    context="<relevant context and decisions>",
    created_by="human",
    as_project=True
)
# Returns project_id and breakdown_task path
```

For a **single task**:
```python
from orchestrator.orchestrator.queue_utils import create_task

task_path = create_task(
    title="<title>",
    role="implement",  # or appropriate role
    context="<description>",
    acceptance_criteria=["<criteria from discussion>"],
    priority="P1",
    created_by="human",
    queue="incoming"  # or "breakdown" if needs decomposition
)
```

4. **Confirm to user**:
   - "Created project PROJ-xxx with breakdown task"
   - "Breakdown agent will decompose into implementation tasks"
   - "Check status with /project-status PROJ-xxx"

## Example

```
User: Let's add fillet support for all panel corners, not just the 4 main ones
Claude: [discusses approach, requirements]
User: /send-to-queue "Fillet all corners"

Claude: I'll create this as a project since it involves multiple coordinated tasks.

Created:
- Project: PROJ-abc123 "Fillet all corners"
- Branch: feature/abc123
- Breakdown task queued

The breakdown agent will decompose this into implementation tasks.
You can check status with: /project-status PROJ-abc123

You can now work on other things - agents will handle the implementation.
```

## Notes

- This command is the main way to hand off work to async agents
- User doesn't need to wait at the prompt while work is done
- Can check progress later with /project-status or /queue-status
