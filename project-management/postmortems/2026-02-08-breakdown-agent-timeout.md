# Postmortem: Breakdown Agent Systematically Timing Out

**Date:** 2026-02-08
**Severity:** Recycling pipeline broken — burned-out tasks cannot be re-decomposed

## Summary

The breakdown agent has never successfully completed an automated breakdown. All 3 attempts by the automated agent timed out after exactly 3600 seconds (the hard-coded timeout). The exploration phase (Phase 1) completes fine and produces excellent findings. The decomposition phase (Phase 2) hangs indefinitely because the prompt is enormous (~15,000 chars of escaped text) and passed to `claude -p` as a single command-line argument. The recycling pipeline is effectively broken: burned-out tasks get sent to breakdown, the breakdown agent claims them, spins for an hour, and fails.

## Timeline

1. **Feb 5 15:10** — First breakdown task (ccf756f0) fails: "Could not parse subtask JSON from Claude output" (different failure mode — early version)
2. **Feb 5 15:40–22:18** — Three breakdowns succeed (a49f5ecd, 0d105d6d, c09d488e), but these were run manually or with earlier/simpler task content
3. **Feb 7 08:09** — Task 608ed3fd (re-breakdown of 32edc31a) claimed by breakdown-agent. **Exploration phase times out** after 3600s. Task later manually accepted.
4. **Feb 8 10:37** — Task 3481addb (re-breakdown of 2270301c) claimed by breakdown-agent. Exploration succeeds. **Decomposition phase times out** after 3600s. Task moves to failed.
5. **Feb 8 11:24** — Task 626b51f7 (re-breakdown of 654bef4b) created by recycler. Blocked waiting for 3481addb to finish.
6. **Feb 8 11:44** — 626b51f7 claimed by breakdown-agent. Exploration succeeds with detailed findings. **Decomposition phase times out** after 3600s. Task moves to failed.
7. **Feb 8 12:50** — Agent state shows 29 failures, 0 successes, 31 total runs. Agent enters idle(no_breakdown_tasks).

The agent state's 29/31 failure count is inflated — most "failures" are "no breakdown tasks available" runs (exit 1), not actual breakdown attempts. The real breakdown attempt count is 3, with 3 failures.

## Root Cause

### Immediate: `fail_task()` appends the full error to the task file, and the error contains the full prompt

The primary amplification loop:

1. Breakdown agent runs Phase 2 (decomposition) with a prompt containing `task_content`
2. The decomposition times out after 3600s
3. `fail_task()` appends the **entire error message** to the task file (`queue_utils.py` line 817-819)
4. The error message is the `subprocess.TimeoutExpired` string, which includes the **full command** — `['claude', '-p', '<entire decomposition prompt>', '--max-turns', '10']`
5. The decomposition prompt already contains `task_content`, so the task file now contains itself

**Measured sizes:**

| Step | File | Size |
|------|------|------|
| Original task (2270301c) | Human-written task | 2,422 chars |
| Re-breakdown task (3481addb) | Created by recycler, nesting 2270301c | ~3,400 chars (before failure) |
| After fail_task appends error | Same file, error section = 81% of file | **18,077 chars** |

The error section alone is **14,710 chars** — it contains the entire decomposition prompt (which contains the task content, exploration findings, and breakdown rules). The original 2,422-char task balloons to 18,077 chars after a single failure.

If this task were recycled again (prevented by depth cap), the next re-breakdown would embed an 18K-char file, producing a decomposition prompt exceeding 30,000 chars.

### Structural: Three independent amplification mechanisms compound

**Mechanism 1: Task file metadata growth.** Every time a task is claimed or submitted, `queue_utils` appends `CLAIMED_BY`, `CLAIMED_AT`, `SUBMITTED_AT`, `COMMITS_COUNT`, `TURNS_USED` to the file. The original task (2270301c) gained 137 chars of metadata from the orch-impl agent.

**Mechanism 2: Re-breakdown nesting.** `recycle_to_breakdown()` reads the ENTIRE task file (including appended metadata) and wraps it in a code block inside a new breakdown task. The re-breakdown task inherits all prior metadata.

**Mechanism 3: `fail_task()` error embedding.** When the breakdown agent times out, `fail_task()` appends the `subprocess.TimeoutExpired` string — which includes the full CLI command, which includes the full `-p` prompt. This is the biggest amplifier: a 3,400-char re-breakdown file becomes 18,077 chars.

The decomposition prompt then embeds this inflated `task_content` AGAIN (line 171: `{task_content}`), plus exploration findings, plus breakdown rules. The resulting prompt for `claude -p` reaches **~15,000+ chars of escaped text**, which causes the CLI to hang.

**The content appears multiple times:**
- Original task ID (2270301c) appears **10 times** in the failed re-breakdown file
- The task content is duplicated: once in the re-breakdown context, once in the error section's decomposition prompt

### Misleading: Agent failure count suggests broader problem

The agent state shows `total_failures: 29, total_successes: 0` which looks catastrophic. But most of those "failures" are just the agent starting up, finding no breakdown tasks to claim, and exiting with code 1. The actual breakdown attempt count is 3. All 3 timed out. The misleading counter obscured how recently the problem started (only since automated re-breakdowns began on Feb 7).

## What the fix requires

### Primary fix: Stop `fail_task()` from embedding the full error command

`fail_task()` (`queue_utils.py` line 817-819) currently appends the raw error string to the task file:
```python
f.write(f"\n## Error\n```\n{error}\n```\n")
```

When the error is a `subprocess.TimeoutExpired`, the string representation includes the full command — which includes the full `-p` prompt. This is the main amplification vector.

**Fix:** Truncate the error message before appending. The command contents are not useful for debugging (the prompt is already logged elsewhere). Cap at ~500 chars or strip the `-p` argument from the command representation.

### Secondary fix: Strip metadata from re-breakdown task content

`recycle_to_breakdown()` reads `task_path.read_text()` and wraps the entire file in a code block. This includes `CLAIMED_BY`, `SUBMITTED_AT`, `COMMITS_COUNT`, etc. — metadata that's irrelevant for re-breakdown. Strip everything after the acceptance criteria section before embedding.

### Tertiary fix: Pipe prompt via stdin instead of `-p` argument

`invoke_claude()` in `base.py` passes prompts as `['claude', '-p', prompt]`. For large prompts, this should use `Popen.communicate(input=prompt)` with stdin instead. This avoids potential CLI/shell issues with very large command-line arguments.

## Lessons

### 1. Error messages are data too — they grow and propagate

`fail_task()` treating the error string as opaque text and appending it to the task file is a classic unbounded-growth bug. The error happens to contain the full command, which contains the full prompt, which contains the task content. The task file becomes a recursive data structure that grows on each failure.

This is the same pattern as log files that include the full request body — harmless for small requests, catastrophic for large ones.

### 2. Task file content is load-bearing in multiple places

The task markdown file serves multiple purposes:
- Human-readable description (original content)
- Machine-readable metadata (CLAIMED_BY, TURNS_USED, etc.)
- Error log (fail_task appends errors)
- Source material for re-breakdown (recycle_to_breakdown reads the whole file)
- Debugging record (the full command in the error section)

Because all of these are mashed into one file, growth in any dimension affects all downstream consumers. The breakdown agent doesn't need the error log or the claim metadata, but it gets them anyway.

### 3. Exit code 1 for "no work" inflates failure counters

The agent exiting with code 1 when no tasks are available is counted as a "failure" in the agent state. This makes it impossible to distinguish "never had work to do" from "tried and failed". The recycler and pre-check roles handle this correctly by returning 0 when there's no work.

### 4. The recycling pipeline was untested end-to-end

We tested recycling (burned-out task detection, re-breakdown task creation) and we tested breakdown (exploration, decomposition, subtask creation). But we never tested the combination: a real re-breakdown task going through the automated breakdown agent. The first real test was production, and it failed.

## Remediation

### 1. Truncate error in `fail_task()` (highest priority)

Cap the error string at ~500 chars before appending to the task file. The full command/prompt is not useful in the task file — it's already in the agent's stderr log.

```python
# queue_utils.py, fail_task()
error_summary = error[:500] + ("..." if len(error) > 500 else "")
f.write(f"\n## Error\n```\n{error_summary}\n```\n")
```

### 2. Strip metadata before re-breakdown embedding

In `recycle_to_breakdown()`, strip claim/submission metadata and error sections before embedding the original task content. Only the human-written content (title, context, acceptance criteria) is needed for re-decomposition.

### 3. Pipe prompt via stdin in `invoke_claude()`

Change `base.py` to use `Popen.communicate(input=prompt)` instead of `['claude', '-p', prompt]` for prompts above a size threshold (e.g., 5,000 chars). This avoids CLI argument handling issues.

### 4. Fix "no work" exit code

Return 0 (not 1) when the breakdown agent finds no tasks to claim. This matches the recycler/pre-check pattern and keeps failure counters meaningful.

### 5. Add prompt size guardrails

Log the prompt size before each `invoke_claude()` call. Warn when the decomposition prompt exceeds 8,000 chars. Consider truncating exploration findings to a summary if they exceed a threshold.
