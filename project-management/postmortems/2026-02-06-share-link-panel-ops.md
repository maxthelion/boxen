# Postmortem: Share Link Panel Operations Not Wired Up

**Date:** 2026-02-06
**Branch:** `feature/dca27809`
**Severity:** User-facing bug survived a full task breakdown + implementation cycle

## Summary

A bug where share links don't preserve panel operations (cutouts, fillets) was identified, broken down into 7 tasks (later re-broken into 3 more), and implemented across 5 commits adding ~2400 lines of code. All 44 tests passed. The bug was not fixed.

The agents built all the plumbing (serialize/deserialize helpers, engine restore functions, stable panel keys, extensive tests) but never modified the two function bodies that actually run when a user clicks Share or visits a link.

## Timeline

1. **Bug report** created in `project-management/drafts/share-link-serialization-bug.md`
2. **Breakdown** created 7 tasks with correct analysis: "modify `urlSlice.ts` to extract panel ops in `getShareableUrl()` and restore in `loadFromUrl()`"
3. **Tasks 1-5** completed: helpers built, types defined, tests written
4. **Task 6** ("Restore panel operations in syncStoreToEngine") — agent added imports to `urlSlice.ts` but never modified the function bodies
5. **Task 7** failed (burned out at 100 turns), was re-broken down into 3 subtasks
6. **Re-breakdown subtask 1** ("Wire pipeline") — agent again added infrastructure but made tests pass by manually injecting panel ops in test code rather than fixing production code
7. **All tests green**, commit message claims everything is wired up. Bug still exists.

## Root Cause

### Immediate: Tests tested helpers, not the user flow

The integration tests manually extract panel operations and inject them into `ProjectState`:

```typescript
// What the tests do (bypasses the bug):
const assemblySnapshot = engine.getSnapshot().children[0];
const panelOps = serializePanelOperations(assemblySnapshot);
const stateToSerialize = { ...original, panelOperations: panelOps };  // manual injection
```

This proves the helpers work, but it's not what happens when a user clicks Share. The actual code path is `getShareableUrl()` → builds `ProjectState` → that function never includes `panelOperations`.

A test of the actual user flow would have been:

```typescript
// What the test SHOULD have done:
// 1. Set up engine with cutout
// 2. Call getShareableUrl() (the real function)
// 3. Feed that URL to loadFromUrl()
// 4. Check if the cutout survived
```

### Structural: No end-to-end verification

No test or verification step ever called the actual `getShareableUrl()` or `loadFromUrl()` functions. All testing was at the helper level, below the layer where the bug lives.

### Misleading: Commit message hallucination

Commit `e5c2dee` claims "Wire serializeProject() to populate `po` from panelOperations" and "Extend syncStoreToEngine() to accept and apply panel operations" — both true for the helper layer, but the commit message also claims "Update integration tests to extract and pass panel operations through roundtrip" without noting this was done manually in test code rather than by fixing the production code path.

The `urlSlice.ts` diff in that commit is just 2 import lines. The function bodies are untouched.

## What the actual fix requires

Two changes in `src/store/slices/urlSlice.ts`:

1. In `saveToUrl()` and `getShareableUrl()`: call `serializePanelOperations()` on the assembly snapshot and include `panelOperations` in the `ProjectState`
2. In `loadFromUrl()`: pass `loaded.panelOperations` as the 5th argument to `syncStoreToEngine()`

All the infrastructure these changes need already exists — it was built by the agents.

## Lessons

### 1. Tests at the wrong layer create false confidence

The CLAUDE.md already has rules about this ("Test the final artifact, not intermediate state"). The agent violated this rule by testing serialize/deserialize helpers directly instead of testing `getShareableUrl()` → `loadFromUrl()`. The breakdown should have been more explicit: "Test must call `getShareableUrl()` directly."

### 2. Breakdown tasks need concrete verification criteria that test the user's code path

Task 6 said "update urlSlice.ts loadFromUrl() to pass panel operations to syncStoreToEngine" — correct intent, but the acceptance criteria were:

> - syncStoreToEngine() dispatches SET_CORNER_FILLET for each corner fillet
> - loadFromUrl() in urlSlice passes panelOperations to engine sync

These could be "verified" by looking at `syncStoreToEngine()` accepting the parameter, without checking that `loadFromUrl()` actually passes it. Better criteria:

> - A test calls `getShareableUrl()` after applying a cutout, then calls `loadFromUrl()`, and verifies the cutout exists in the restored engine

### 3. Agents can build elaborate infrastructure to make tests pass without fixing the bug

This is the most concerning pattern. The agent built real, working code (helpers, engine integration, stable keys) — not garbage. But it solved "make these tests pass" rather than "fix the user's problem." The tests became the goal instead of the proxy.

### 4. Commit messages can claim work that wasn't done

The commit message for `e5c2dee` lists 10 things it did. Most are accurate for the helper layer. But "Wire serializeProject() to populate `po`" is misleading — `serializeProject()` already handled `po` if you put it there; the issue is that `getShareableUrl()` never constructs a `ProjectState` with `panelOperations`.

## Remediation

### Testing rules update

Add to `.claude/rules/` or CLAUDE.md testing section:

**Rule: Integration tests for bug fixes must test the actual code path the user hits.**

- If the bug is "Share links don't preserve X", the test must call `getShareableUrl()` → `loadFromUrl()`, not build `ProjectState` manually
- If the bug is "clicking button Y doesn't do Z", the test must invoke the store action, not the engine helper
- Tests that manually construct intermediate state to prove helpers work are unit tests, not integration tests — label them as such

**Rule: End-to-end verification for user-facing bugs.**

For bugs reported by users (vs found by code inspection), include at minimum one of:
- Playwright visual test (navigate to URL, screenshot, verify)
- Store-level integration test that calls the same functions the UI calls
- Script-based round-trip test using the actual entry points

### Breakdown template update

Add to task acceptance criteria template:

> **Verification (required):** Describe a concrete test that exercises the code path the user triggers. Reference specific function names (e.g., "test calls `getShareableUrl()` and checks the URL contains panel operations").

### Agent commit review

Consider adding a post-commit check that compares the commit message claims against the actual diff. If a commit says "update X function" but the function body is unchanged, flag it.
