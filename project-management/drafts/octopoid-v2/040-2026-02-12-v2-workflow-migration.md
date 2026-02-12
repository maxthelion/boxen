# V2 Workflow Migration - Adapting Our Tuned Process

**Status:** Idea
**Captured:** 2026-02-12

## Raw

> We have a highly tuned process in the old local octopoid. Some bits are now unnecessary - eg we dont need orch-impl agents to work on our local instance of octopoid any more. We just need impl agents for product work, and impl agents for infra work (testing, refactoring etc). The flow for product agents needs to match where we got to before - dev, rebase, request approval, QA, PR, human review, approve and merge. Infra can skip QA and PR and human approval. Drafts need to be covered - their status needs to be in the server. Likewise for projects. Our custom agents like inbox poller, proposers, draft processors etc need to be re-examined. We must work out if they can be added to octopoid default agents and processes, or if they remain as part of our domain.

## Context

We just completed the v2.0 migration:
- Server deployed to Cloudflare Workers
- Client configured in remote mode
- Basic task system working

But v1.x had a highly refined workflow with:
- Multiple agent roles (orchestrator_impl, implement, breakdown, review, QA)
- Custom approval flows (product vs infra)
- Draft and project management integrated into the task system
- Custom agents (inbox-poller, proposers, draft-processors)

Now we need to map this refined workflow onto v2.0's architecture.

## Agent Role Simplification

**V1.x had:**
- `orchestrator_impl` - for working on the local Octopoid submodule
- `implement` - for product (Boxen) work
- `breakdown` - for task decomposition
- `review` - gatekeepers for code review
- `qa` - visual/functional testing

**V2.0 needs:**
- **Remove** `orchestrator_impl` - no longer maintaining local Octopoid fork
- **Keep** `implement` but split into two lanes:
  - **Product agents** - Boxen features and fixes
  - **Infra agents** - Testing, refactoring, tooling
- **Keep** `breakdown` - still need task decomposition
- **Keep** `review` - gatekeepers still valuable
- **Re-evaluate** `qa` - is this built into v2.0 or still custom?

## Workflow Lanes

### Product Agent Flow (Full Process)

```
incoming → claimed (implement) → dev work → rebase → submit_completion
  → provisional → QA check → create PR → human review → approve/merge → done
```

**Steps:**
1. Agent claims task, creates feature branch
2. Implements changes, commits to branch
3. Rebases onto main (automatic rebaser or manual)
4. Submits completion (`submit_completion()`)
5. Moves to provisional queue
6. QA agent runs visual/functional tests
7. If QA passes: creates PR
8. Human reviews PR
9. Human approves: merges to main, marks task done

**Why full process:** Product changes affect user-facing behavior. Need thorough validation.

### Infra Agent Flow (Streamlined)

```
incoming → claimed (implement) → dev work → rebase → auto-approve → done
```

**Steps:**
1. Agent claims task, creates feature branch
2. Implements changes (tests, refactoring, tooling)
3. Rebases onto main
4. **Auto-approves if:**
   - All tests pass
   - Changes are in whitelisted paths (`.claude/`, `project-management/scripts/`, test files)
   - No merge conflicts
5. Merges to main, marks task done

**Why streamlined:** Infra changes are low-risk, well-tested, and don't affect end users.

## Entity Migration

### Drafts

**V1.x:**
- Markdown files in `project-management/drafts/`
- Status tracked in `.orchestrator/state.db` (local)
- `register_existing_drafts.py` syncs files → DB

**V2.0 needs:**
- Markdown files stay in `project-management/drafts/` (committed to git)
- Status tracked in **server database** (Cloudflare D1)
- Draft status changes (idea → proposal → archived) replicate to server
- API endpoints: `GET /drafts`, `POST /drafts`, `PATCH /drafts/:id`

**Questions:**
- Does v2.0 have draft entity support built-in?
- Or do we extend the server with custom draft tables/endpoints?

### Projects

**V1.x:**
- Multi-task initiatives tracked in `.orchestrator/state.db`
- Breakdown tree (parent task → child tasks)
- Project status dashboard

**V2.0 needs:**
- Project entity in server database
- Task hierarchy (parent/child) preserved
- Project dashboard (server-side rendering or API + client)

**Questions:**
- Does v2.0 support task hierarchies natively?
- Or do we model projects as a custom entity?

## Custom Agent Re-evaluation

We built several custom agents in v1.x. Need to decide: absorb into Octopoid core or keep domain-specific?

### inbox-poller
**What it does:** Checks user's "inbox" (external system or file) for tasks, creates Octopoid tasks automatically.

**Options:**
- **Core agent:** If other Octopoid users would benefit (e.g., poll GitHub issues, Jira tickets, email)
- **Domain-specific:** If inbox format is unique to our workflow

**Decision:** TBD

### proposers
**What it does:** Monitors drafts with status=idea, promotes promising ideas to status=proposal with more detail.

**Options:**
- **Core agent:** Draft lifecycle (idea → proposal → task) could be a built-in Octopoid feature
- **Domain-specific:** If our draft format/criteria are unique

**Decision:** TBD

### draft-processors
**What it does:** Takes drafts with status=proposal, converts to actionable tasks (enqueues).

**Options:**
- **Core agent:** Draft-to-task conversion could be a core workflow
- **Domain-specific:** If our task creation logic is highly customized

**Decision:** TBD

### Other Custom Agents
- **Explorer auditors** - detect failed explorer tasks that didn't find what they claimed to find
- **Queue management agent** - rebalances queues, detects stuck tasks
- **Recommendation consolidator** - merges overlapping recommendations

**For each:** Decide core vs domain-specific.

## Open Questions

1. **Agent lane detection:** How do we mark a task as "product" vs "infra" so the right flow applies?
   - Tag in task metadata? (`category: product` vs `category: infra`)
   - Path-based heuristic? (changes in `src/` = product, changes in `.claude/` = infra)
   - Explicit queue? (`incoming-product/`, `incoming-infra/`)

2. **Auto-approve safety:** What guardrails prevent infra agents from auto-merging risky changes?
   - Whitelist of safe paths?
   - Require test coverage threshold?
   - Flag for manual review if diff is >X lines?

3. **Draft/project schema:** If we extend v2.0 server with drafts/projects, what's the schema?
   - Do we submit a PR to maxthelion/octopoid-server?
   - Or fork and maintain custom server?

4. **Migration path:** Do we port v1.x custom agents to v2.0 agent format, or rewrite?
   - V1.x agents: Python scripts running in scheduler loop
   - V2.0 agents: ??? (need to read v2.0 agent API docs)

5. **Backward compatibility:** Can we run v1.x and v2.0 side-by-side during transition?
   - Two separate schedulers (one for each)?
   - Or all-in migration (risky)?

## Possible Next Steps

### Phase 1: Core Workflow (Product + Infra Lanes)

1. Configure v2.0 agents:
   ```yaml
   # .octopoid/agents.yaml
   agents:
     - name: product-impl-1
       role: implement
       tags: [product]
       model: sonnet

     - name: infra-impl-1
       role: implement
       tags: [infra]
       model: sonnet

     - name: breakdown-1
       role: breakdown
       model: sonnet

     - name: gatekeeper-1
       role: review
       model: opus
   ```

2. Implement lane routing logic (task metadata → agent selection)

3. Implement auto-approve for infra lane (test pass + path whitelist → merge)

4. Test with sample tasks:
   - Product: "Add chamfer operation to Boxen UI"
   - Infra: "Refactor fingerJoints.ts for readability"

### Phase 2: Entity Migration (Drafts + Projects)

1. Design draft schema for server database:
   ```sql
   CREATE TABLE drafts (
     id TEXT PRIMARY KEY,
     title TEXT NOT NULL,
     status TEXT NOT NULL, -- 'idea', 'proposal', 'archived'
     author TEXT,
     file_path TEXT,
     domain TEXT, -- 'boxen', 'octopoid'
     created_at INTEGER,
     updated_at INTEGER
   );
   ```

2. Add draft API endpoints to server:
   - `GET /drafts` - list all drafts
   - `POST /drafts` - create draft
   - `PATCH /drafts/:id` - update status

3. Update local `/draft-idea` command to sync to server

4. Design project schema (similar process)

### Phase 3: Custom Agent Evaluation

1. List all v1.x custom agents with their purpose
2. For each agent:
   - Read v2.0 agent API docs
   - Decide: core contribution or domain-specific
   - If core: draft proposal for maxthelion/octopoid
   - If domain: port to v2.0 agent format

3. Prioritize by value (which agents save the most time/friction?)

### Phase 4: Migration

1. Run v1.x and v2.0 in parallel for 1 week
2. Route new tasks to v2.0, let v1.x finish its queue
3. Snapshot v1.x final state for archive
4. Decommission v1.x scheduler
5. Archive `.orchestrator-v1/` directory

## Success Criteria

If this works:
- Product tasks go through full QA + PR + review flow
- Infra tasks auto-merge when tests pass
- Drafts and projects tracked in server database (accessible from any machine)
- Custom agents either upstreamed to Octopoid or running as domain-specific v2.0 agents
- No loss of workflow sophistication from v1.x → v2.0 migration

## Risks

1. **V2.0 missing features:** Drafts/projects might not be in v2.0 core → need custom extension
2. **Agent API differences:** V1.x agent code might not port cleanly to v2.0
3. **Auto-approve bugs:** Infra agent could auto-merge breaking changes if whitelist is wrong
4. **Migration complexity:** Running two systems in parallel is operationally complex

**Mitigation:** Start with Phase 1 (core workflow) before tackling entities or custom agents.
