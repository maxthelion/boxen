# Agent Turn Budgeting

## Problem

Agents are allocated a fixed number of turns per role (implementer=100, orchestrator_impl=200, etc.) and we have no visibility into actual consumption. The `turns_used` field is hardcoded to the max allocation, so we can't tell whether a task that produced 1 commit needed 15 turns or 95. We're flying blind on resource usage.

This creates two problems:
1. **Waste** — agents may continue working after they're effectively done (polishing, over-testing, adding unrequested improvements)
2. **Poor allocation** — a 1-line fix gets the same budget as a 1000-line feature

## Idea 1: Turn Counting via Hooks

Use a `PostToolUse` hook to count tool invocations per task. On each firing, append a byte to a counter file:

```
.orchestrator/agents/<name>/tool_counter
```

At task completion, the role reads `wc -c < tool_counter` instead of hardcoding the max. Reset the file when a new task starts.

This gives us real usage data. Not exact "turns" (one turn can have multiple tool calls) but a consistent, comparable activity metric.

**Cost:** Near zero. One `echo -n .` per tool call.

## Idea 2: Periodic "Are You Done?" Check

At regular intervals during execution, inject a prompt asking the agent whether it's finished or genuinely needs more turns.

**Mechanism:** A `PostToolUse` hook reads the counter file. Every N tool calls (where N = allocation / 5, so ~20 for a 100-turn agent), it injects a question via the hook's stdout:

> "Checkpoint: you've used ~40 of your 100 allocated tool calls. Are you confident you need the remaining budget to complete this task, or have you already achieved the acceptance criteria? If you're done, commit your work and wrap up."

This is a nudge, not a hard stop. It asks the agent to self-assess at 20%, 40%, 60%, 80%, and 100% of its budget. Agents that are done should recognise they're done and stop. Agents that are genuinely still working will continue.

**Key design choice:** The check should reference the task's acceptance criteria, so the agent evaluates against the actual goal rather than inventing more work.

**Risk:** Could be disruptive if the agent is mid-thought. Keep the injection lightweight — a single sentence, not a multi-paragraph prompt. The agent can ignore it if it's in the middle of something.

## Idea 3: Turn Estimation and Convergence

Estimate how many turns a task will need before execution, then compare with actual consumption to improve future estimates.

### Estimation signals

- **Task complexity heuristics**: number of acceptance criteria, number of files likely touched, whether it's a new feature vs bugfix vs rename
- **Historical data**: average turns consumed by similar tasks (same role, similar size)
- **Breakdown metadata**: if a task came from a breakdown, the breakdown agent could estimate turns as part of the decomposition

### Convergence loop

1. At task creation, assign an `estimated_turns` field (could be manual, could be auto-estimated)
2. At completion, record `actual_turns` (from the counter)
3. Periodically review the ratio `actual / estimated` across completed tasks
4. Adjust the estimation model — or at minimum, adjust the per-role defaults

### What this enables

- **Right-sized allocations**: Instead of giving every implementer task 100 turns, give a rename task 20 and a snapping system 120
- **Early warning**: If a task blows past its estimate, that's a signal it may be stuck or scope-creeping
- **Cost awareness**: Turns are directly proportional to API spend. Knowing the actual cost per task type helps prioritise what to automate vs do manually

## Implementation Path

**Phase 1 — Instrument (low effort, high signal)**
- Add PostToolUse hook for counting
- Fix role code to read actual count instead of hardcoding
- Collect data for a week

**Phase 2 — Nudge (medium effort)**
- Add periodic "are you done?" injection at budget checkpoints
- Monitor whether agents respond to nudges by wrapping up earlier
- Tune the interval (every 20% might be too frequent or too rare)

**Phase 3 — Estimate (higher effort, needs data from Phase 1)**
- Add `estimated_turns` field to task schema
- Build simple estimation (start with role-based median from historical data)
- Use estimate as the `max_turns` allocation instead of a fixed number
- Review estimation accuracy, iterate

## Open Questions

- Should the "are you done?" check be a hook injection or a separate lightweight agent that monitors the counter file?
- Is tool calls the right unit, or should we try to count actual API turns? (Tool calls are easier and arguably more meaningful)
- How aggressive should the nudge be? "Are you done?" vs "You should wrap up now" vs hard-stopping the agent
- Should estimates come from the breakdown agent, the human, or an automated model?
