# Per-Agent Configuration Files

**Date:** 2026-02-11
**Type:** Feature Request for v2.0
**Priority:** Nice-to-have (not essential)
**Status:** Proposal - not implemented in v2.0

---

## Summary

Split the monolithic `agents.yaml` into separate per-agent configuration files. This separates static configuration (name, role, model) from dynamic state (paused, current task), makes it easier to add/remove agents, and follows the broader "file for content, DB for status" pattern.

---

## Current State (v2.0)

**Single file:** `.octopoid/agents.yaml`

```yaml
agents:
  - name: implementer-1
    role: implement
    model: sonnet
    max_concurrent: 1
    enabled: true

  - name: breakdown-1
    role: breakdown
    model: sonnet
    max_concurrent: 1
    enabled: true

  - name: gatekeeper-1
    role: review
    model: opus
    max_concurrent: 1
    enabled: true

  # ... more agents
```

**Problems:**
- All agents in one file (v1.x Boxen has 17 agents, 147 lines)
- Mixes static config (name, role, model) with dynamic state (enabled/paused)
- Adding/removing agents requires editing monolithic file
- Harder to version control (one line change affects entire file)
- Can't easily enable/disable agents without editing YAML

---

## Proposed State

### Directory Structure

```
.octopoid/agents/
├── implementer-1.yaml
├── implementer-2.yaml
├── breakdown-1.yaml
├── gatekeeper-1.yaml
├── orchestrator-impl-1.yaml
└── recycler-1.yaml
```

### Per-Agent File Format

**`.octopoid/agents/implementer-1.yaml`:**
```yaml
# Static configuration (versioned in git)
name: implementer-1
role: implement
model: sonnet
max_concurrent: 1
max_turns: 100

# Optional: pre-check command (only claim if work exists)
pre_check: "ls -A .octopoid/tasks/incoming/ | head -1"

# Optional: focus area
focus: null

# Optional: custom prompt overrides
prompt_overrides:
  system_message: "You are an expert implementer..."
```

### Dynamic State (Database)

Create `agent_state` table for runtime state:

```sql
CREATE TABLE agent_state (
    name TEXT PRIMARY KEY,
    enabled BOOLEAN DEFAULT true,     -- paused/unpaused
    interval_seconds INTEGER,         -- wake interval (or use default)
    current_task_id TEXT,             -- task currently working on
    last_run_at TIMESTAMP,            -- last time agent woke up
    last_finished_at TIMESTAMP,       -- last time agent completed work
    turns_used_today INTEGER,         -- rate limiting
    updated_at TIMESTAMP
);
```

**Separation of concerns:**
- **File** = What the agent is (name, role, capabilities)
- **Database** = Where the agent is in its lifecycle (running, paused, last run)

---

## Benefits

### 1. Easier Agent Management

**Add new agent:**
```bash
# Current (v2.0): Edit agents.yaml, find right spot, indent correctly
vi .octopoid/agents.yaml

# Proposed: Copy template, edit one file
cp .octopoid/agents/implementer-1.yaml .octopoid/agents/implementer-3.yaml
vi .octopoid/agents/implementer-3.yaml
```

**Remove agent:**
```bash
# Current: Edit agents.yaml, delete lines, risk breaking YAML
# Proposed: Delete file
rm .octopoid/agents/old-agent.yaml
```

### 2. Better Version Control

**Git diff for changes:**
```diff
# Current: One line in monolithic file
diff --git a/agents.yaml b/agents.yaml
@@ agents:
-  - name: implementer-1
-    model: sonnet
+  - name: implementer-1
+    model: opus

# Proposed: Entire file diff shows full context
diff --git a/agents/implementer-1.yaml b/agents/implementer-1.yaml
@@ name: implementer-1
-model: sonnet
+model: opus
```

### 3. Cleaner Enable/Disable

**Toggle agent:**
```bash
# Current: Edit YAML, change enabled: true → false
# Proposed: Database command
octopoid agent pause implementer-1
octopoid agent resume implementer-1

# Or rename file to disable
mv agents/implementer-1.yaml agents/implementer-1.yaml.disabled
```

### 4. Agent Templates

**Easier to provide templates:**
```
templates/agents/
├── implementer.yaml
├── breakdown.yaml
├── gatekeeper.yaml
└── custom.yaml
```

**User workflow:**
```bash
# Copy template
cp templates/agents/implementer.yaml .octopoid/agents/my-impl-1.yaml

# Edit name and model
sed -i 's/name: implementer/name: my-impl-1/' .octopoid/agents/my-impl-1.yaml
```

### 5. Follows Entity Storage Pattern

**Consistent across all entities:**

| Entity | Content File | Status Location |
|--------|--------------|-----------------|
| Task | `.octopoid/tasks/<id>.md` | `tasks` table |
| Draft | `project-management/drafts/<slug>.md` | `drafts` table |
| Project | `project-management/projects/<slug>.md` | `projects` table |
| Agent | `.octopoid/agents/<name>.yaml` | `agent_state` table |

Files don't move, DB tracks lifecycle.

---

## Implementation

### Phase 1: Backwards Compatible Loading

**Support both formats during transition:**

```typescript
export function getAgentsConfig(): AgentConfigItem[] {
  const octopoidDir = findOctopoidDir()

  // Try new format first (directory of files)
  const agentsDir = join(octopoidDir, 'agents')
  if (existsSync(agentsDir) && lstatSync(agentsDir).isDirectory()) {
    return loadAgentsFromDirectory(agentsDir)
  }

  // Fall back to old format (single file)
  const agentsFile = join(octopoidDir, 'agents.yaml')
  if (existsSync(agentsFile)) {
    return loadAgentsFromFile(agentsFile)
  }

  return []
}

function loadAgentsFromDirectory(dir: string): AgentConfigItem[] {
  const agents: AgentConfigItem[] = []

  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.yaml') || file.endsWith('.disabled')) {
      continue
    }

    const path = join(dir, file)
    const content = readFileSync(path, 'utf-8')
    const agent = YAML.parse(content) as AgentConfigItem
    agents.push(agent)
  }

  return agents
}
```

### Phase 2: Migration Command

**Convert existing setup:**
```bash
octopoid migrate agents
```

**What it does:**
1. Read current `agents.yaml`
2. Create `.octopoid/agents/` directory
3. Write one file per agent
4. Create `agent_state` table
5. Populate `agent_state` from current agent config
6. Rename `agents.yaml` to `agents.yaml.backup`

### Phase 3: Dynamic State Management

**Move runtime state to DB:**

```typescript
// Before starting agent
await db.updateAgentState(agentName, {
  current_task_id: taskId,
  last_run_at: new Date().toISOString()
})

// After agent finishes
await db.updateAgentState(agentName, {
  current_task_id: null,
  last_finished_at: new Date().toISOString()
})

// Pause agent (no file edit needed)
await db.updateAgentState(agentName, {
  enabled: false
})
```

**Benefits:**
- No file writes during runtime
- Atomic state updates
- History tracking possible (agent state over time)

### Phase 4: CLI Commands

```bash
# List agents
octopoid agents list

# Show agent status
octopoid agents status implementer-1

# Pause/resume
octopoid agents pause implementer-1
octopoid agents resume implementer-1

# Add new agent (from template)
octopoid agents add --name my-impl-2 --role implement --model sonnet

# Remove agent
octopoid agents remove old-agent-1
```

---

## Migration Impact

### For Users

**v1.x users with single `agents.yaml`:**
- Run `octopoid migrate agents` during v2.0 upgrade
- Files created automatically
- Old `agents.yaml` kept as backup
- Can continue editing files if preferred

**New v2.0 users:**
- `octopoid init` creates `.octopoid/agents/` directory with templates
- CLI commands for management
- Don't need to touch YAML directly

### For Dashboard

**No change needed** - dashboard reads agent config via SDK/API, doesn't care about file structure.

### For Scripts

**Scripts that parse `agents.yaml`:**
- Update to read from directory OR
- Use SDK/API to get agent list
- Example: `status.py` script

---

## Open Questions

1. **Should agent state be in DB or still in files?**
   - **Proposal:** DB (enabled, current_task, last_run)
   - **Alternative:** Keep in files, just split them up
   - **Tradeoff:** DB = cleaner but adds complexity, Files = simpler but more writes

2. **How to handle agent discovery?**
   - **Proposal:** Scan `.octopoid/agents/*.yaml` (skip `*.disabled`)
   - **Alternative:** Maintain `agents/index.yaml` with list
   - **Tradeoff:** Scan = simple, Index = faster but can get stale

3. **Naming convention?**
   - **Proposal:** `<role>-<number>.yaml` (e.g., `implementer-1.yaml`)
   - **Alternative:** Free-form (user chooses)
   - **Tradeoff:** Convention = consistent, free-form = flexible

4. **Should `octopoid init` create directory or file?**
   - **Proposal:** Create `agents/` directory with 3 templates
   - **Alternative:** Create single `agents.yaml` (current behavior)
   - **Tradeoff:** Directory = new architecture, File = backwards compat

5. **How to pause/resume agents?**
   - **Proposal:** `octopoid agent pause <name>` (updates DB)
   - **Alternative:** Rename file to `.disabled` extension
   - **Alternative:** Edit file, change `enabled: false`
   - **Tradeoff:** DB = clean, file rename = simple, file edit = explicit

---

## Recommendation

**Implement in phases:**

1. **v2.0**: Keep single `agents.yaml` (current state) but add DB table for dynamic state
2. **v2.1**: Add support for directory format (backwards compatible)
3. **v2.2**: Make directory format default, provide migration command
4. **v3.0**: Deprecate single-file format

**Rationale:**
- Not critical for v2.0 launch
- Can be added later without breaking changes
- Gives time to validate DB state management
- Users can try new format opt-in before it becomes default

**Priority:** Low (nice-to-have improvement, not blocker)

---

## Related

- **Entity Storage Model:** `project-management/drafts/octopoid/031-2026-02-09-entity-storage-model.md`
- **v2.0 Requirements:** `project-management/drafts/octopoid/octopoid-project-management-requirements.md`
- **v1.x Reference:** `.orchestrator/agents.yaml` (17 agents, 147 lines)

---

## Examples

### Current (v1.x/v2.0)

**All in one file:**
```yaml
# .octopoid/agents.yaml (147 lines for 17 agents)
agents:
  - name: inbox-poller
    role: proposer
    focus: inbox_triage
    interval_seconds: 10
    pre_check: ls -A project-management/agent-inbox/ | grep -v .gitkeep | head -1
    pre_check_trigger: non_empty

  - name: impl-agent-1
    role: implementer
    interval_seconds: 30
    pre_check: ls -A .orchestrator/shared/queue/incoming/ | head -1
    pre_check_trigger: non_empty
    paused: false

  # ... 15 more agents
```

### Proposed

**One file per agent:**

`.octopoid/agents/inbox-poller.yaml`:
```yaml
name: inbox-poller
role: proposer
focus: inbox_triage
interval_seconds: 10
pre_check: ls -A project-management/agent-inbox/ | grep -v .gitkeep | head -1
pre_check_trigger: non_empty
```

`.octopoid/agents/impl-agent-1.yaml`:
```yaml
name: impl-agent-1
role: implementer
interval_seconds: 30
pre_check: ls -A .octopoid/tasks/incoming/ | head -1
pre_check_trigger: non_empty
```

**Database state:**
```sql
-- agent_state table
name             | enabled | current_task_id | last_run_at         | last_finished_at
-----------------|---------|-----------------|---------------------|------------------
inbox-poller     | true    | NULL            | 2026-02-11 10:30:00 | 2026-02-11 10:29:55
impl-agent-1     | true    | TASK-abc123     | 2026-02-11 10:25:00 | NULL
breakdown-agent  | false   | NULL            | 2026-02-10 15:00:00 | 2026-02-10 14:58:30
```

---

**Document Status:** Feedback for Octopoid team
**Next Action:** Add to v2.0 roadmap as post-launch enhancement
