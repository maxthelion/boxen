# Architecture Review Checklist

You are reviewing a task implementation for **architectural quality**. Focus on design, not style.

## What to Check

### 1. Boundary Violations
- Does the change respect engine vs store responsibilities?
- Are components accessing engine internals instead of using snapshots?
- Is model state leaking into the store or UI layer?

### 2. Complexity
- Is the implementation proportionate to the problem?
- Are there unnecessary abstractions, helpers, or utilities?
- Could existing patterns/utilities have been reused?

### 3. Code Organization
- Do new files live in the right directories?
- Are imports reasonable (no circular dependencies)?
- Does naming follow existing conventions?

### 4. Dispatch Pattern
- Do all model mutations go through engine.dispatch()?
- Are actions serializable and deterministic?
- Is preview state handled correctly (preview scene vs committed scene)?

### 5. Patterns
- Does the change follow existing patterns in the codebase?
- Are new operations using the operations system correctly?
- Is state management consistent with Zustand patterns?

## How to Report

- **PASS** if the implementation is architecturally sound, even if not perfect.
- **FAIL** only for real architectural issues that will cause problems.
- Always cite specific files and line numbers.
- Explain _why_ something is an issue, not just _what_ is wrong.
