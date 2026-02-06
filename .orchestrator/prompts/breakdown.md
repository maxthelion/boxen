### Sizing
- Tasks should be completable in <30 Claude turns
- If unsure, err toward smaller tasks
- One clear objective per task

### Ordering
1. Testing strategy task FIRST
2. Schema/type changes early
3. Core logic before UI wiring
4. Integration tests last

### Task Context Should Include
- Specific file paths to modify
- Line numbers or function names when known
- Patterns to follow (reference exploration findings)
- Test file locations for test tasks

### Mandatory Verification

**Every implementation task MUST include a `verification` field** that describes a concrete test exercising the user's actual code path. This is the single most important field in the task.

Rules for verification:
1. **Name the entry-point function** the user triggers (e.g., `getShareableUrl()`, `loadFromUrl()`, `applyOperation()`)
2. **The test must call that function**, not a helper beneath it
3. **The test must NOT manually construct intermediate state** — it must let the production code produce the state
4. **The test must assert a user-visible outcome** (geometry changed, URL contains data, panel has holes)

**Good verification:**
> "Test calls `getShareableUrl()` after applying a cutout via engine.dispatch(), then calls `loadFromUrl()` with the result, and asserts the restored engine has a cutout on the same panel."

**Bad verification:**
> "Test calls `serializePanelOperations()` and checks the result contains cutout data."
> (This tests a helper, not the user's code path. The helper can work perfectly while the user-facing function never calls it.)

**Why this matters:** We had a case where agents built all the infrastructure (serialize/deserialize helpers, engine restore functions, stable panel keys, 44 passing tests) but never modified the two function bodies that actually run when the user clicks Share. All tests passed. The bug was not fixed. The tests tested helpers instead of the user's code path. See `project-management/postmortems/2026-02-06-share-link-panel-ops.md`.

### Acceptance Criteria vs Verification

- **Acceptance criteria** describe what must be true when the task is done (types defined, function handles edge case, etc.)
- **Verification** describes a specific test that proves the user's problem is solved — it's the "how do we know this actually works" check

Both are required. Acceptance criteria alone can be satisfied by building infrastructure that's never connected. Verification forces the agent to wire everything end-to-end.
