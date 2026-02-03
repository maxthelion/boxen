# Orchestrator Improvements Plan

## Problem Statement

1. **Duplicate Work**: Already-implemented features being proposed and accepted
2. **Unclear Priorities**: No clear product priorities guiding decisions
3. **Docs Not Actionable**: User generates plans/issues/notes in docs/ but they don't become work items

## Agent Polling Model

Two types of agents based on whether work can be cheaply detected:

### Fast Poll + Cheap Pre-Check
Poll very frequently (seconds), but first do a trivial check for work. If nothing to do, bail immediately. Cheap to run often.

| Agent | Pre-Check | Interval |
|-------|-----------|----------|
| Inbox Poller | `ls inbox/` empty? | 10 seconds |
| PM/Curator | New proposals in active/? | 30 seconds |
| Implementer | Tasks in incoming/? | 30 seconds |

### Slow Poll, No Pre-Check
Work is inherently expensive (reads lots of files, analyzes). Longer intervals.

| Agent | Why Expensive | Interval |
|-------|---------------|----------|
| Backlog Groomer | Reads all docs, plans, issues | Daily |
| Architect Proposer | Explores codebase structure | Daily |
| Test Checker | Analyzes test files | Daily |

**Octopoid consideration:** Could this be a generic feature? Agents declare a `pre_check` command. Scheduler runs pre-check first, only spawns agent if it returns "work available".

---

## Workflow Model

```
┌─────────────────────────────────────────────────────────────────────────┐
│  USER DROPS STUFF                                                        │
│  Raw notes, images, ideas → inbox/ (at project root)                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  INBOX POLLER (frequent, every 10 seconds)                              │
│  - Classifies items: architectural? feature? bug?                       │
│  - Routes to classified/ buckets                                        │
│  - Questions → outbox/ → relayed to user                                │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          ▼                         ▼                         ▼
    classified/              classified/               classified/
    architectural/           features/                 bugs/
          │                         │                         │
          └─────────────────────────┼─────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  BACKLOG GROOMER (daily)                                                 │
│  - Reads classified/, docs/issues/, docs/plans/                         │
│  - References current-priorities.md                                     │
│  - Breaks down into parallel-safe, dependency-mapped proposals          │
│  - Questions → outbox/                                                  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  PM / CURATOR (frequent, every 10-30 min)                                │
│  - References current-priorities.md to balance work                     │
│  - Selects from proposals (groomer + other proposers)                   │
│  - Considers dependency graph for parallel execution                    │
│  - Queues work for implementers                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  IMPLEMENTERS                                                            │
│  - Execute selected tasks                                               │
│  - Can reject tasks with reason (octopoid feature)                      │
└─────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────────────┐
                    │  OUTBOX → INTERACTIVE AGENT │
                    │  Questions relayed to user  │
                    │  Answers flow back          │
                    └─────────────────────────────┘
```

## Solution Split

### Boxen-Specific (Conventions & Config)

1. **Current Priorities Document** - `.orchestrator/current-priorities.md`
2. **Set Priorities Skill** - `/set-priorities` for updating priorities via natural language
3. **Inbox/Outbox System** - Place for raw ideas, classification, and questions
4. **Inbox Poller** - Frequent agent that classifies and routes (including priority changes)
5. **Backlog Groomer** - Domain-specific scheduled agent for decomposition
6. **Existence Check Convention** - Prompt instructions for agents

### Octopoid Features (Code)

1. **Task Rejection System** - Implementers can formally reject impossible tasks
2. **Pre-Check Polling** - Agents declare a cheap pre-check; scheduler only spawns if work available

---

## Part 1: Boxen Conventions

### 1.1 Current Priorities Document

Location: `.orchestrator/current-priorities.md`

**How priorities get updated:**
1. **Directly** - User runs `/set-priorities` skill with natural language
2. **Via inbox** - User drops a note about priorities, inbox poller routes it

**Skill:** `/set-priorities`

```
/set-priorities focus on bug fixing for the next week
/set-priorities make refactoring a top priority
/set-priorities theme: stability and polish
/set-priorities prioritize: 1) subdivisions 2) issue #003
```

The skill parses the priority statement and updates current-priorities.md with:
- New primary focus areas
- Adjusted work category weights
- Updated "Not Now" section
- Guidance for groomer and PM agents

```markdown
# Current Priorities

**Last Updated:** 2025-02-03
**Focus Period:** Core Functionality & Stability

## Primary Focus
1. Complete 2D panel editing tools
2. Fix tracked issues in docs/issues/
3. Improve first-run experience

## Work Categories (in priority order)
1. **Bugs/Issues** - Tracked issues take precedence
2. **In-Progress Plans** - Complete what's started
3. **Architectural Improvements** - Only if they unblock primary focus
4. **New Features** - Only if aligned with primary focus

## Not Now
- New operation types (wait for core stability)
- Performance optimization (premature)
- Additional export formats

## Groomer Guidance
- Prioritize items from docs/issues/ index
- Break down in-progress plans into single-task proposals
- Flag items that need user clarification

## PM Guidance
- Prefer completing in-progress work over starting new
- Balance: 60% features, 30% bugs, 10% architectural
- Don't queue more than 3 tasks at a time
```

### 1.2 Inbox/Outbox System

**Inbox** - Where you drop raw input (notes, images, ideas, screenshots)

**Outbox** - Where agents put questions for you

**Classified buckets** - Sorted items ready for groomer

```
# At project root (easy access)
inbox/              # YOU DROP STUFF HERE
├── (raw files, notes, images)

classified/         # POLLER SORTS INTO HERE
├── priorities/     # Priority changes (SPECIAL: triggers update)
├── architectural/  # Patterns, rules, refactoring ideas
├── features/       # Product improvements, new functionality
├── bugs/           # Bug reports, issues
└── other/          # Uncategorized

outbox/             # AGENTS PUT QUESTIONS HERE
├── (questions for you)

processed/          # Archive of handled items
```

### 1.2.1 Inbox Poller Agent

**Purpose:** Fast, frequent classification and routing of inbox items.

Runs frequently (every 10-30 minutes) and is lightweight.

Add to `.orchestrator/agents.yaml`:
```yaml
- name: inbox-poller
  role: proposer
  focus: inbox_triage
  interval_seconds: 600  # Every 10 minutes
```

Create `.orchestrator/prompts/inbox-poller.md`:

```markdown
# Inbox Poller - Boxen

You quickly classify and route items from the inbox.

## Your Job
1. Check `.orchestrator/shared/inbox/` for new items
2. For each item, determine what kind of input it is
3. Move it to the appropriate classified/ bucket
4. If you have questions, put them in outbox/

## Classification Rules

### Priorities (SPECIAL HANDLING)
- Focus/priority statements
- "Focus on X", "Prioritize Y", "Theme: Z"
- "For the next week...", "Until release..."
- Deprioritization: "Not now", "Defer X"

**When detected:** Don't just file it - UPDATE `current-priorities.md` directly, then move to processed/.

### Architectural
- Patterns, conventions, rules
- Refactoring ideas
- Code organization
- "How should X work" discussions

### Features
- New functionality requests
- Product improvements
- UI/UX changes
- "Add X" or "Users should be able to..."

### Bugs
- Something broken
- Unexpected behavior
- Error reports
- "X doesn't work" or "X should do Y but does Z"

### Other
- Unclear items
- Meta/process stuff
- Things that don't fit

## When Uncertain
If you can't classify confidently:
1. Put item in `other/`
2. Create a question in `outbox/` asking for clarification

## Question Format (for outbox/)
```markdown
# Question: [Brief title]

**Source:** inbox/[filename]
**Created:** [timestamp]

## Context
[What you're looking at]

## Question
[What you need to know to classify/route this]

## Options (if applicable)
- A: This seems like [category] because...
- B: This could be [category] because...
```

## What You Do NOT Do
- Deep analysis (that's groomer's job)
- Create proposals
- Implement anything
- Make prioritization decisions
```

### 1.2.2 Outbox & Interactive Agent

The **outbox** collects questions from all agents that need human input.

An **interactive agent** (or the user's Claude session) should:
1. Poll `.orchestrator/shared/outbox/`
2. Relay questions to the product designer
3. Write answers back (or move answered items to processed/)

This could be:
- A dedicated agent that pings you
- Your interactive Claude session checking outbox at start
- Integration with "pipe to phone" for notifications

```markdown
## Outbox Convention

Files in outbox/ are questions awaiting human response.

Format:
- `YYYY-MM-DD-HH-MM-[short-title].md`
- Contains: context, question, options if applicable

When answered:
- Add `## Answer` section with response
- Move to `processed/` or delete
```

### 1.3 Backlog Groomer Role

**Purpose:** Process user's docs into actionable, concurrent work items.

**Key responsibility:** Break work into maximally parallel pieces without creating conflicts.

Add to `.orchestrator/agents.yaml`:
```yaml
- name: backlog-groomer
  role: proposer
  focus: backlog_grooming
  interval_seconds: 86400  # Daily
```

Create `.orchestrator/prompts/backlog-groomer.md`:

```markdown
# Backlog Groomer - Boxen

You process the user's documentation into actionable work items, optimizing for concurrent execution.

## Your Inputs
1. `docs/plan_index.md` - All plans and their status
2. `docs/issues/index.md` - Tracked issues
3. `.orchestrator/shared/inbox/` - Raw ideas and notes
4. `.orchestrator/current-priorities.md` - What's important now

## Your Outputs
- Proposals in `.orchestrator/shared/proposals/active/`
- Questions in `.orchestrator/messages/` for user clarification

## Core Principle: Maximize Concurrency Without Mess

When breaking down work, think about:
- **What can run in parallel?** - Independent pieces that don't touch the same files/systems
- **What must be sequential?** - Dependencies that require ordering
- **What would conflict?** - Changes that would create merge conflicts or architectural inconsistency

### Dependency Patterns to Identify

1. **Data dependencies** - Task B needs output from Task A
2. **File dependencies** - Both tasks modify the same file (can't parallelize)
3. **Architectural dependencies** - Task B assumes patterns established by Task A
4. **Test dependencies** - Feature needs test infrastructure first

### Good Decomposition Example

Large task: "Add panel splitting operation"

Bad breakdown (sequential, messy):
- [ ] Implement panel splitting (touches everything)

Good breakdown (parallel where possible):
- [ ] Add split types to engine/types.ts (no deps)
- [ ] Add SPLIT_PANEL action to engine (depends on types)
- [ ] Add split operation to registry (depends on action)
- [ ] Add SplitPalette component (depends on registry)
- [ ] Add integration tests (depends on all above)

Mark dependencies explicitly:
```
SPLIT_PANEL action
  depends_on: [split types]
  enables: [split operation registry, split palette]
```

## Process

### 1. Check Current Priorities
Read `current-priorities.md` to understand what matters now.

### 2. Scan for High-Priority Items
Look for:
- Open issues in docs/issues/ (high priority)
- In-progress plans that need next steps
- Items in inbox/ that align with priorities

### 3. For Each Item
a. **Check if already done** - Search codebase, check completed plans
b. **Assess scope** - Is it a single task or needs breakdown?
c. **If too large** - Decompose into parallel-safe pieces
d. **Identify dependencies** - What blocks what?
e. **If unclear** - Create question for user
f. **If actionable** - Create proposal with clear acceptance criteria

### 4. Existence Check (Required)
Before creating any proposal:
- Search codebase for existing implementation
- Check plan_index.md for completed related work
- Document your search in the proposal

### 5. Dependency Mapping
For each set of related proposals:
- Create a simple dependency graph
- Mark which can run in parallel
- Mark which must be sequential
- Flag potential conflicts

## What You Do NOT Do
- Prioritize between items (PM's job)
- Explore codebase for new work (other proposers' job)
- Implement anything
- Make architectural decisions (but DO identify architectural dependencies)

## Proposal Format
Include:
- Clear title
- Source (which doc/issue this came from)
- Existence check results
- Acceptance criteria
- Estimated complexity (S/M/L)
- **Dependencies** (blocks/blocked_by)
- **Parallelizable with** (other proposals that can run concurrently)
```

### 1.4 Updated Curator Prompt

Update `.orchestrator/prompts/curator.md` to reference priorities:

```markdown
## Decision Process

1. **Read current-priorities.md** before evaluating proposals
2. **Balance work types** per the guidance (e.g., 60/30/10 split)
3. **Prefer completing over starting** - in-progress work first
4. **Check existence** - reject proposals for implemented features
5. **Limit queue depth** - don't overwhelm implementers
```

---

## Part 2: Octopoid Features

### 2.1 Pre-Check Polling

**Problem:** Some agents need to respond quickly to new work (inbox items, new proposals), but spawning a full agent is expensive. Currently, you either poll frequently (wasteful) or poll slowly (unresponsive).

**Solution:** Agents can declare a `pre_check` - a cheap command that determines if there's work. Scheduler runs pre-check first, only spawns the full agent if work is available.

**Config in agents.yaml:**
```yaml
- name: inbox-poller
  role: proposer
  focus: inbox_triage
  interval_seconds: 10        # Poll frequently
  pre_check: "ls .orchestrator/shared/inbox/ | head -1"  # Cheap check
  pre_check_trigger: "non_empty"  # Spawn if output is non-empty

- name: backlog-groomer
  role: proposer
  focus: backlog_grooming
  interval_seconds: 86400     # Daily, no pre-check (always expensive)
```

**Scheduler logic:**
```python
def should_spawn_agent(agent_config):
    pre_check = agent_config.get('pre_check')
    if not pre_check:
        return True  # No pre-check, always spawn when due

    result = run_command(pre_check)
    trigger = agent_config.get('pre_check_trigger', 'non_empty')

    if trigger == 'non_empty':
        return bool(result.stdout.strip())
    elif trigger == 'exit_zero':
        return result.returncode == 0
    # etc.
```

**Benefits:**
- Inbox poller can check every 10 seconds without waste
- PM can respond to new proposals in under a minute
- Expensive agents still run on schedule

---

### 2.2 Task Rejection

**Problem:** Implementers discover tasks are impossible but can't formally reject them.

### Feature

Add `rejected/` state to task queue with documented reasoning.

**Directory:**
```
.orchestrator/shared/queue/rejected/
```

**Rejection reasons:**
- `already_implemented` - Functionality exists
- `blocked` - Dependencies not met
- `invalid_task` - Task doesn't make sense
- `duplicate` - Same as another task
- `out_of_scope` - Not appropriate for agent

**Code changes:**
1. `queue_utils.py` - Add `reject_task(task_id, reason, details)`
2. `roles/implementer.py` - Capability to reject
3. `init.py` - Create `rejected/` directory
4. Curator notified of rejections

---

## Implementation Plan

### Phase 1: Boxen Directory Structure & Priorities
- [ ] Create `.orchestrator/shared/inbox/`
- [ ] Create `.orchestrator/shared/classified/{priorities,architectural,features,bugs,other}/`
- [ ] Create `.orchestrator/shared/outbox/`
- [ ] Create `.orchestrator/shared/processed/`
- [ ] Create `.orchestrator/current-priorities.md` with actual priorities
- [ ] Create `/set-priorities` skill (`.claude/commands/set-priorities.md`)

### Phase 2: Boxen Agent Prompts
- [ ] Create inbox-poller prompt (`.orchestrator/prompts/inbox-poller.md`)
- [ ] Create backlog-groomer prompt (`.orchestrator/prompts/backlog-groomer.md`)
- [ ] Update curator prompt to reference priorities
- [ ] Add inbox-poller to agents.yaml (frequent, every 10 min)
- [ ] Add backlog-groomer to agents.yaml (daily)

### Phase 3: Outbox Integration
- [ ] Define outbox question format
- [ ] Decide: dedicated agent, interactive session check, or pipe-to-phone?
- [ ] Implement answer-back mechanism

### Phase 4: Octopoid Features
**Pre-Check Polling:**
- [ ] Add `pre_check` and `pre_check_trigger` config fields
- [ ] Update scheduler to run pre-check before spawning
- [ ] Support triggers: `non_empty`, `exit_zero`
- [ ] Document in octopoid README

**Task Rejection:**
- [ ] Add `rejected/` directory support
- [ ] Implement `reject_task()` function
- [ ] Add rejection capability to implementer
- [ ] Document in octopoid README

### Phase 5: Enable & Test
- [ ] Start with inbox-poller (paused, manual test)
- [ ] Verify classification works
- [ ] Enable groomer, verify proposals
- [ ] Test full flow: inbox → classified → proposal → task → implemented

---

## Open Questions

1. **Outbox relay mechanism** - Dedicated agent? Check at session start? Pipe to phone?
2. **Image handling** - Can inbox-poller read images (handwritten notes, screenshots)?
3. **Queue depth limit** - How many tasks should PM queue at once?
4. **Groomer frequency** - Daily, or more often if classified/ has items?
