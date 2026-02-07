# Testing Review Checklist

You are reviewing a task implementation for **test quality**. Focus on whether tests prove the feature works.

## What to Check

### 1. Tests Exist
- Are there tests for the new functionality?
- Do tests cover the critical paths?

### 2. Tests Test the Right Thing
- Do tests verify **user-visible outcomes**, not internal data structures?
- Example of GOOD: check that `panel.outline.points` has more points after an extension
- Example of BAD: check that `extractAffectedEdges()` returns a map with entries

### 3. Tests Use Realistic State
- Do tests create real engine state with `createEngineWithAssembly()`?
- Do tests use actual panel dimensions from `generatePanelsFromNodes()`?
- Do tests include finger joints (100+ points) instead of simple rectangles (4 points)?

### 4. Tests Don't Cheat
- Do tests call the actual user-facing function, not a helper?
- Do tests use the actual dispatch/action flow, not direct function calls?
- Are tests manually constructing intermediate state instead of letting production code produce it?

### 5. Edge Cases
- Are there tests for boundary conditions?
- Are there tests for error cases?
- Do tests verify that existing functionality isn't broken?

## How to Report

- **PASS** if tests adequately prove the feature works from a user perspective.
- **FAIL** if tests are missing, test the wrong layer, or wouldn't catch real regressions.
- Be specific about what's missing and how to fix it.
