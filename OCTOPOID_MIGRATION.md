# Boxen: Octopoid v2 Migration

Upgrade from v1 file-based orchestrator to v2 API-based system with a multi-stage review pipeline. Boxen shares the existing octopoid server (`octopoid-server.maxthelion.workers.dev`) using scope isolation — no new server needed.

## Target Pipeline

```
incoming -> claimed -> provisional -> sanity_approved -> human_review -> done
              |            |               |                  |
         (implementer) (sanity-check)  (QA gatekeeper)     (human)
                       code review     Playwright           dashboard
                       + scope check   visual testing       approve/reject
                       auto-reject     auto-reject          merge PR
                       to incoming     to incoming          on approve
```

## Architecture

- **Server**: Shared `octopoid-server.maxthelion.workers.dev` (Cloudflare Workers + D1)
- **Isolation**: `scope: boxen` on all tasks/projects/drafts — octopoid and boxen data don't mix
- **Orchestrator**: Python scheduler runs locally, claims tasks via API
- **Flows**: Custom queue names (`sanity_approved`, `human_review`) registered on the server at startup, validated at runtime
- **Agents**: Python-spawned Claude Code processes, configured in `.octopoid/agents.yaml`

## Prerequisites

Both server-side prerequisites have been completed:

- **Extensible queue names** (commit `b4e1c55`) — the server accepts custom queue names and validates them against registered flows at runtime.
- **`validateQueue` cluster awareness** (completed 2026-02-20) — `validateQueue()` now filters by `(name, cluster)`, so octopoid and boxen can both register a `default` flow with different states without collision. Task create/update/claim endpoints all pass the cluster through.

Additionally, the orchestrator now includes:

- **Flow engine owns transitions** (TASK-44d77f1f) — the flow engine performs task transitions automatically after steps complete. Steps are pre-transition side effects (push branch, run tests, create PR), not responsible for moving tasks between queues. This means flow definitions no longer need a `submit_to_server` step — the engine reads the target queue from the flow YAML and calls the appropriate API endpoint.

## Steps

### 1. Update the octopoid submodule

Pull the latest octopoid code which includes flow support, scope isolation, and the blueprint agent model:

```bash
cd submodules/octopoid
git fetch origin
git checkout feature/client-server-architecture
git pull
cd ../..
```

### 2. Update config.yaml

Replace `.octopoid/config.yaml`:

```yaml
server:
  enabled: true
  url: https://octopoid-server.maxthelion.workers.dev
  cluster: boxen
  machine_id: Maxs-MacBook-Air.local

repo:
  path: /Users/maxwilliams/dev/boxen
  base_branch: main

scope: boxen

agents:
  max_concurrent: 3

hooks:
  before_submit:
    - rebase_on_main
    - run_tests
    - create_pr
  before_merge:
    - merge_pr
```

Key changes from current config:
- `cluster: boxen` (was `default`) — isolates flow registrations
- Added `scope: boxen` — isolates tasks/projects/drafts on the shared server
- `base_branch: main` stays the same

### 3. Update agents.yaml

Replace `.octopoid/agents.yaml` with the blueprint format:

```yaml
paused: false

queue_limits:
  max_claimed: 3
  max_incoming: 20
  max_provisional: 10

agents:
  implementer:
    type: implementer
    max_instances: 1
    interval_seconds: 60
    max_turns: 150
    model: sonnet

  sanity-check-gatekeeper:
    role: gatekeeper
    spawn_mode: scripts
    claim_from: provisional
    interval_seconds: 120
    max_turns: 50
    model: sonnet
    agent_dir: .octopoid/agents/sanity-check-gatekeeper
    max_instances: 1

  qa-gatekeeper:
    role: gatekeeper
    spawn_mode: scripts
    claim_from: sanity_approved
    interval_seconds: 120
    max_turns: 80
    model: sonnet
    agent_dir: .octopoid/agents/qa-gatekeeper
    max_instances: 1

  breakdown:
    type: breakdown
    max_instances: 1
    interval_seconds: 120
    max_turns: 30
    model: sonnet
    paused: true
```

### 4. Create the flow definition

Create `.octopoid/flows/default.yaml`:

```yaml
name: default
description: Implementation with sanity check, QA review, and human approval

transitions:
  "incoming -> claimed":
    agent: implementer

  "claimed -> provisional":
    runs: [push_branch, run_tests, create_pr]

  "provisional -> sanity_approved":
    conditions:
      - name: sanity_check
        type: agent
        agent: sanity-check-gatekeeper
        on_fail: incoming
    runs: [post_review_comment]

  "sanity_approved -> human_review":
    conditions:
      - name: qa_review
        type: agent
        agent: qa-gatekeeper
        on_fail: incoming
    runs: [post_review_comment]

  "human_review -> done":
    conditions:
      - name: human_approval
        type: manual
        on_fail: incoming
    runs: [post_review_comment, merge_pr]
```

The scheduler syncs this flow to the server on startup, which registers `sanity_approved` and `human_review` as valid queue names.

### 5. Create gatekeeper agent directories

**Sanity-check gatekeeper** — copy from octopoid's `.octopoid/agents/gatekeeper/` as a starting point:

```
.octopoid/agents/sanity-check-gatekeeper/
  CLAUDE.md          # Review instructions: code quality, scope check, no debug code
  scripts/
    run-tests        # Project-specific test runner
```

**QA gatekeeper** — port from `.orchestrator/prompts/gatekeeper-qa.md`:

```
.octopoid/agents/qa-gatekeeper/
  CLAUDE.md          # QA instructions: Playwright visual testing, engine validation
  scripts/
    run-tests        # Playwright test runner
```

The QA gatekeeper CLAUDE.md should instruct the agent to:
1. Find the Cloudflare Pages preview URL from the PR
2. Navigate with Playwright MCP tools
3. Take screenshots and validate visual output
4. Run programmatic checks via `window.__BOXEN_ENGINE__` / `window.__BOXEN_VALIDATORS__`
5. Write `result.json` with `decision: approve` or `decision: reject`

### 6. Retire v1 system

Once v2 is working:

1. Pause v1: set `paused: true` on all entries in `.orchestrator/agents.yaml`
2. Run both in parallel for a few tasks to verify
3. Stop the v1 scheduler (unload launchd plist)
4. Keep `.orchestrator/` for reference

## Verification Checklist

- [ ] Octopoid submodule updated to `feature/client-server-architecture`
- [ ] `config.yaml` has `cluster: boxen` and `scope: boxen`
- [ ] `agents.yaml` uses blueprint format
- [ ] Flow definition at `.octopoid/flows/default.yaml` with custom queues
- [ ] Sanity-check gatekeeper agent directory with review prompts
- [ ] QA gatekeeper agent directory with Playwright instructions
- [ ] Scheduler starts, registers flow on server, orchestrator heartbeats
- [ ] Task goes through: incoming -> claimed -> provisional -> sanity_approved -> human_review -> done
- [ ] Rejections at each gate send task back to incoming with feedback
- [ ] Human approval triggers PR merge
- [ ] v1 system paused/retired

## What changed from the previous plan

The previous migration plan assumed boxen needed its own server and that the octopoid codebase was a TypeScript monorepo. Neither is true:

- **Shared server**: Boxen uses the same `octopoid-server.maxthelion.workers.dev` with `scope: boxen` for data isolation and `cluster: boxen` for flow isolation
- **Python orchestrator**: The scheduler and agents are Python. The server is TypeScript but boxen doesn't need to touch it.
- **Extensible queues already work**: The server accepts custom queue names and validates them against registered flows at runtime. Queue validation is cluster-scoped, so boxen and octopoid flows don't collide.
- **Flow engine owns transitions**: Steps in the flow YAML are pre-transition side effects. The engine moves the task to the target queue after steps complete — no `submit_to_server` step needed.
- **No complex migration phases**: Just update config files, write the flow YAML, create agent directories, and start the scheduler.
