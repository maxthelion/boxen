# Boxen: SQLite Migration Checklist

Notes for testing octopoid SQLite changes with our specific setup.

## Our Custom Agents

| Agent | Focus | Check |
|-------|-------|-------|
| inbox-poller | inbox_triage | Still reads `project-management/agent-inbox/` |
| plan-reader | project_plans | Still reads `docs/*.md` |
| backlog-groomer | backlog_grooming | Processes docs into proposals |

## Our Custom Directories

- `project-management/agent-inbox/` - inbox-poller reads from here
- `project-management/human-inbox/` - proposals for human review
- `.orchestrator/shared/proposals/` - proposal flow

## Pre-Migration

- [ ] Note current queue state
- [ ] Backup `.orchestrator/`
- [ ] Pause all agents

## Post-Migration Checks

- [ ] `octopoid migrate init` completes
- [ ] Tasks imported correctly (count matches)
- [ ] BLOCKED_BY dependencies imported
- [ ] Create test task → gets claimed
- [ ] Complete test task with commit → accepted
- [ ] Complete test task without commit → rejected
- [ ] Blocked task auto-promotes when blocker completes
- [ ] inbox-poller still works
- [ ] SKIP_PR tasks merge directly

## Rollback

```bash
git checkout HEAD -- .orchestrator/
# or
git stash && git checkout <previous-submodule-commit> -- orchestrator/
```
