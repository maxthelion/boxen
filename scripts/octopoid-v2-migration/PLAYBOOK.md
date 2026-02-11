# Octopoid v2.0 Migration Playbook

**Date:** 2026-02-11
**Purpose:** Step-by-step guide for migrating from Octopoid v1.x to v2.0
**Estimated Time:** 2-4 hours (plus testing time)

---

## Prerequisites

Before starting:

- [ ] Read `project-management/drafts/octopoid/octopoid-project-management-requirements.md`
- [ ] Read `project-management/drafts/octopoid/slash-command-inventory.md`
- [ ] Commit all current work (`git status` should be clean)
- [ ] v1.x orchestrator is paused (`.orchestrator/agents.yaml` has `paused: true`)
- [ ] Have Claude API key ready (if testing with real agents)
- [ ] Install `yq` for YAML comparisons: `brew install yq` (optional)
- [ ] Install `tree` for directory visualization: `brew install tree` (optional)

---

## Phase 1: Backup & Install (30 minutes)

### Step 1.1: Create Migration Branch

```bash
git checkout -b octopoid-v2-migration
```

**Verify:**
```bash
git branch --show-current
# Should output: octopoid-v2-migration
```

### Step 1.2: Run Migration Script

```bash
./scripts/octopoid-v2-migration/migrate.sh
```

**What this does:**
1. Moves `project-management/` → `pm2/` (backup)
2. Moves `.orchestrator/` → `.orchestrator-v1/` (backup)
3. Installs `@octopoid/client` via npm
4. Runs `octopoid init` to generate v2.0 structure
5. Creates `CLAUDE.local.md` symlink
6. Commits changes to git

**Expected output:**
```
🚀 Starting Octopoid v2.0 migration
📦 Backing up v1.x state...
📥 Installing Octopoid v2.0...
🏗️  Initializing v2.0 structure...
🔗 Creating CLAUDE.local.md symlink...
✅ Migration complete!
```

**If migration fails:** Run `./scripts/octopoid-v2-migration/rollback.sh`

### Step 1.3: Verify Basic Installation

```bash
./scripts/octopoid-v2-migration/verify-basics.sh
```

**Expected output:**
```
✅ octopoid command exists
✅ Can run octopoid --version
✅ .octopoid directory created
✅ agents.yaml exists
✅ Can create task
✅ Can list queue
✅ Can check status

Results: 7 passed, 0 failed
🎉 All basic checks passed!
```

**If checks fail:**
- Check npm install logs for errors
- Verify `node_modules/@octopoid` exists
- Try running `npx octopoid --version` manually
- Check Octopoid team's installation docs

---

## Phase 2: Compare Structures (30 minutes)

### Step 2.1: Compare Directories

```bash
./scripts/octopoid-v2-migration/compare-structures.sh
```

**What to look for:**

**v1.x had (should be in `pm2/`):**
```
pm2/
├── drafts/
│   ├── boxen/
│   └── octopoid/
├── projects/
├── human-inbox/
├── agent-inbox/
├── postmortems/
└── octopoid-user-guide.md
```

**v2.0 created (check `project-management/`):**
```
project-management/
└── claude-interactive-role.md  # Created by octopoid init
```

**Questions to answer:**

1. **Did `octopoid init` create project-management directories?**
   - [ ] `drafts/` exists?
   - [ ] `projects/` exists?
   - [ ] `breakdowns/` exists?

   **If NO:** We'll need to create them manually or propose to Octopoid team

2. **What's in `.octopoid/`?**
   - [ ] `agents.yaml` (agent configuration)
   - [ ] `tasks/` directory (for task-specific worktrees)
   - [ ] `logs/` directory (for logs)
   - [ ] `runtime/` directory (for state)

3. **How does agents.yaml differ from v1.x?**
   - Run: `diff .orchestrator-v1/agents.yaml .octopoid/agents.yaml`
   - Note format changes (fields renamed, new fields, removed fields)

### Step 2.2: Document Findings

Create `project-management/drafts/octopoid/v2-migration-findings.md`:

```markdown
# v2.0 Migration Findings

## Directory Comparison

**Created by octopoid init:**
- [ ] List what was created

**Missing from v1.x:**
- [ ] List what's missing

**Format differences:**
- [ ] agents.yaml changes
- [ ] Task file format changes
- [ ] Other config changes

## Agent Roles

**v1.x roles:**
- implementer, breakdown, gatekeeper, orchestrator_impl, recycler, etc.

**v2.0 roles:**
- [ ] List roles found in .octopoid/agents.yaml

**Missing roles:**
- [ ] List v1.x roles not in v2.0
```

---

## Phase 3: Test Task Lifecycle (1 hour)

### Step 3.1: Start v2.0 Server (if needed)

**If v2.0 uses client-server architecture:**

```bash
# Check Octopoid docs for server start command
# Might be: npx octopoid server start
# Or: octopoid start (if combined)
```

**If v2.0 is local-only:**
Skip this step.

### Step 3.2: Create Test Task

```bash
npx octopoid task create "Test task - verify v2.0 works" --role implement
```

**Expected:** Task ID returned (e.g., `TASK-abc123` or just `abc123`)

**Save task ID for later steps:**
```bash
export TEST_TASK_ID="<task-id>"
```

### Step 3.3: Verify Task in Queue

```bash
npx octopoid queue list --queue incoming
```

**Expected:** Should show the test task

### Step 3.4: Check Worktree Model

**After agent claims task** (either manually or via scheduler), verify:

```bash
# Task-specific worktree should exist (CORRECT)
ls -la .octopoid/tasks/$TEST_TASK_ID/worktree/

# Agent-specific worktree should NOT exist (v1.x mistake)
ls -la .octopoid/agents/impl-agent-1/worktree/  # Should fail
```

**If agent worktree exists:** ⚠️ v2.0 has the same bug as v1.x - report to Octopoid team

### Step 3.5: Manual Task Lifecycle

Since we don't know v2.0 API yet, manually test with dummy agents:

**Claim task:**
```bash
npx octopoid task claim $TEST_TASK_ID --agent dummy-impl-1
```

**Run dummy implementer:**
```bash
./scripts/octopoid-v2-migration/dummy-implementer.sh $TEST_TASK_ID
```

**Check task moved to provisional:**
```bash
npx octopoid queue list --queue provisional
```

**Run dummy gatekeeper:**
```bash
./scripts/octopoid-v2-migration/dummy-gatekeeper.sh $TEST_TASK_ID
```

**Check task completed:**
```bash
npx octopoid task get $TEST_TASK_ID
```

**Expected:** Status should be `done` or equivalent

### Step 3.6: Verify Critical Features

**Turn counting:**
```bash
npx octopoid task get $TEST_TASK_ID --json | jq '.turns_used'
```
**Expected:** Number (even if 0 for dummy agent)

**Commit counting:**
```bash
npx octopoid task get $TEST_TASK_ID --json | jq '.commits_count'
```
**Expected:** Number (should be 1 from dummy implementer)

**Logging:**
```bash
# Per-task log should exist
ls -la .octopoid/logs/tasks/$TEST_TASK_ID.log

# Per-agent log should exist
ls -la .octopoid/logs/agents/dummy-impl-1.log
```

**Expected:** Both files exist and are separate

---

## Phase 4: Feature Gap Analysis (1-2 hours)

### Step 4.1: Test Each Critical Feature

Use the checklist from `octopoid-project-management-requirements.md`:

**Must-Have Features:**

- [ ] **Task API** - Create, claim, update, complete tasks
  - Test: `npx octopoid task create ...`
  - Test: `npx octopoid task claim ...`
  - Test: `npx octopoid task complete ...`

- [ ] **Lease-based claiming** - Auto-expire, prevent zombie claims
  - Test: Claim task, wait for lease expiry, verify task released
  - Check: Lease timeout configurable?

- [ ] **Task-specific worktrees** - `.octopoid/tasks/<id>/worktree/`
  - Test: Verify path after claim (Step 3.4)

- [ ] **Turn counting** - Track turns_used per task
  - Test: Verified in Step 3.6

- [ ] **Logging separation** - Per-task AND per-agent logs
  - Test: Verified in Step 3.6

- [ ] **Dependencies** - blocked_by field, auto-unblock
  - Test: `npx octopoid task create "Task B" --blocked-by $TEST_TASK_ID`
  - Complete Task A, verify Task B unblocked

- [ ] **Gatekeeper role** - Code review before merge
  - Test: Check if gatekeeper agent exists in agents.yaml
  - Test: Submit task to provisional, see if gatekeeper runs

**Should-Have Features:**

- [ ] **Breakdowns** - Decompose burned-out tasks
  - Test: Check if breakdown role exists
  - Test: Create task, mark as needing breakdown
  - Test: Run `dummy-breakdown.sh`

- [ ] **Needs continuation** - Resume partial work
  - Test: Create task with uncommitted changes, verify saved
  - Test: Next agent resumes from same worktree

- [ ] **Agent notes** - Execution notes in task records
  - Test: Check task record for notes field
  - Test: Agents write notes during execution?

- [ ] **Projects** - Multi-task grouping
  - Test: `npx octopoid project create "Test project"`
  - Test: Create task with `--project <id>`

- [ ] **Drafts** - Idea → task promotion workflow
  - Test: Check if `project-management/drafts/` exists
  - Test: `npx octopoid draft create "Test idea"`

### Step 4.2: Document Gaps

In `v2-migration-findings.md`, add:

```markdown
## Feature Gaps

### Missing in v2.0
- [ ] Feature 1 (expected, not found)
- [ ] Feature 2 (expected, not found)

### Different in v2.0
- [ ] Feature 3 (works differently than v1.x)
- [ ] Feature 4 (API changed)

### Works as Expected
- [x] Feature 5
- [x] Feature 6
```

---

## Phase 5: Decision Point (15 minutes)

Based on findings, decide:

### Option A: Proceed with v2.0

**If:**
- Core features work (task lifecycle, worktrees, turn counting)
- Missing features can be worked around
- Octopoid team can add missing features soon

**Next steps:**
1. Port Boxen-specific tooling (status script, slash commands)
2. Create custom agents for missing roles (breakdown, recycler)
3. Migrate v1.x tasks to v2.0
4. Run production tasks through v2.0
5. Monitor for issues

### Option B: Stay on v1.x

**If:**
- Critical features missing (e.g., no turn counting, wrong worktree model)
- Too many gaps to work around
- v2.0 not stable enough yet

**Next steps:**
1. Document all gaps in GitHub issues for Octopoid team
2. Roll back migration
3. Stay on v1.x until v2.0 matures
4. Re-evaluate in 1-2 months

### Option C: Hybrid Approach

**If:**
- Some features work well (e.g., task API)
- Some features missing but not critical

**Next steps:**
1. Use v2.0 for new features only
2. Keep v1.x running for existing workflows
3. Gradually migrate as v2.0 improves

---

## Phase 6: Rollback (if needed)

### If Proceeding with v2.0

Commit findings:
```bash
git add project-management/drafts/octopoid/v2-migration-findings.md
git commit -m "docs: v2.0 migration findings and feature gaps"
```

### If Rolling Back

```bash
./scripts/octopoid-v2-migration/rollback.sh
```

This will:
1. Reset last 2 commits (v2.0 init + backup)
2. Clean untracked files (node_modules, .octopoid)
3. Restore v1.x state

**Verify rollback:**
```bash
git log --oneline -5  # Should NOT show v2.0 commits
ls -la .orchestrator/  # Should exist (v1.x)
ls -la .octopoid/  # Should NOT exist
```

---

## Phase 7: Post-Migration (ongoing)

### If Migration Succeeded

1. **Update documentation:**
   - [ ] Update `CLAUDE.local.md` with new command names
   - [ ] Update `.claude/rules/orchestration.md` with v2.0 paths
   - [ ] Update `octopoid-user-guide.md` with v2.0 workflows

2. **Port slash commands:**
   - [ ] Start with daily-use commands (create, queue, status, approve)
   - [ ] Test each command with v2.0 backend
   - [ ] Update skill definitions

3. **Create missing features:**
   - [ ] Breakdown agent (if missing)
   - [ ] Recycler agent (if missing)
   - [ ] Status script (port from v1.x)

4. **Monitor production usage:**
   - [ ] Create real tasks
   - [ ] Watch for errors
   - [ ] Report bugs to Octopoid team

5. **Provide feedback to Octopoid team:**
   - [ ] Share `octopoid-project-management-requirements.md`
   - [ ] Share `v2-migration-findings.md`
   - [ ] Create GitHub issues for missing features

### If Migration Failed

1. **Document why:**
   - [ ] List critical blockers
   - [ ] Estimate timeline for Octopoid team to address

2. **Provide feedback:**
   - [ ] Share findings with Octopoid team
   - [ ] Propose solutions or workarounds

3. **Plan re-evaluation:**
   - [ ] Set date to re-test v2.0 (e.g., 1 month)
   - [ ] Track progress on blocker issues

---

## Troubleshooting

### Installation Issues

**Problem:** `npm install @octopoid/client` fails

**Solutions:**
- Check npm registry: `npm config get registry`
- Check if package exists: `npm view @octopoid/client`
- Try with --verbose: `npm install @octopoid/client --verbose`
- Check Octopoid team docs for install instructions

### Init Issues

**Problem:** `octopoid init` fails

**Solutions:**
- Run with debug: `DEBUG=* npx octopoid init`
- Check logs: `cat .octopoid/logs/*.log`
- Verify permissions: `ls -la .octopoid/`

### Task Creation Issues

**Problem:** Can't create tasks

**Solutions:**
- Check if server running (if client-server mode)
- Check API endpoint: `npx octopoid config get server.url`
- Try with --dry-run flag
- Check network connectivity (if remote server)

### Agent Issues

**Problem:** Agents don't claim tasks

**Solutions:**
- Check scheduler running: `ps aux | grep octopoid`
- Check agent config: `cat .octopoid/agents.yaml`
- Check agent logs: `cat .octopoid/logs/agents/*.log`
- Verify pre-check conditions pass

### Worktree Issues

**Problem:** Wrong worktree location (agent-specific not task-specific)

**Solutions:**
- This is a bug - report to Octopoid team
- Document in findings
- May need to stay on v1.x until fixed

---

## Success Criteria

Migration is successful when:

- [x] Can create tasks via API
- [x] Can list tasks in queues
- [x] Agents claim tasks (lease-based)
- [x] Worktrees are task-specific (`.octopoid/tasks/<id>/`)
- [x] Turn counting works
- [x] Logging separation works (per-task + per-agent)
- [x] Can complete full lifecycle (create → claim → work → submit → review → done)
- [x] Critical features from v1.x exist or have workarounds
- [x] Can run production tasks without errors

---

## Next Steps After This Playbook

1. **Write v2-migration-report.md** summarizing results
2. **Share with Octopoid team** (requirements + findings + report)
3. **Decide:** Proceed, rollback, or hybrid
4. **If proceeding:** Start porting tooling (Phase 7)
5. **If rolling back:** Create timeline for re-evaluation

---

## Appendix: Quick Reference

### Key Files

- `pm2/` - Backup of v1.x project-management/
- `.orchestrator-v1/` - Backup of v1.x runtime
- `.octopoid/` - v2.0 runtime
- `project-management/drafts/octopoid/v2-migration-findings.md` - Document gaps here

### Key Commands

```bash
# Migrate
./scripts/octopoid-v2-migration/migrate.sh

# Verify
./scripts/octopoid-v2-migration/verify-basics.sh

# Compare
./scripts/octopoid-v2-migration/compare-structures.sh

# Rollback
./scripts/octopoid-v2-migration/rollback.sh

# Test dummy agents
./scripts/octopoid-v2-migration/dummy-implementer.sh <task-id>
./scripts/octopoid-v2-migration/dummy-gatekeeper.sh <task-id>
./scripts/octopoid-v2-migration/dummy-breakdown.sh <task-id>
```

### v2.0 Commands (update after learning actual API)

```bash
# Create task
npx octopoid task create "Title" --role implement

# List queue
npx octopoid queue list --queue incoming

# Claim task
npx octopoid task claim <id> --agent <name>

# Get task
npx octopoid task get <id>

# Status
npx octopoid status
```
