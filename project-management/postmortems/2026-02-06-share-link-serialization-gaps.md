# Postmortem: Share Link Serialization — Systemic Gaps

**Date:** 2026-02-06
**Branch:** `feature/dca27809`
**Severity:** Multiple silent data loss bugs in share link pipeline
**Related:** [2026-02-06-share-link-panel-ops.md](2026-02-06-share-link-panel-ops.md)

## Summary

After the previous postmortem's fix was applied (wiring `serializePanelOperations` into `urlSlice.ts`), manual testing revealed the share link pipeline has deeper systemic problems:

1. **Custom edge paths are not serialized at all** — `serializePanelOperations` handles fillets and cutouts but ignores `customEdgePaths`, which is a first-class panel operation stored in `BasePanel._customEdgePaths`
2. **Edge extensions use UUID keys** — will silently fail on load because the engine creates new UUIDs when reconstructing from a share link
3. **The "end-to-end" tests aren't end-to-end** — even the improved `urlSlicePanelOps.test.ts` only tests cutouts and fillets, not edge paths or edge extensions
4. **All failures are silent** — no errors, no warnings, data just doesn't appear

## What We Found

### Gap 1: Custom Edge Paths Missing from Serialization

`BasePanel.serializeBase()` (line 2064) includes `customEdgePaths` in the snapshot props. But `serializePanelOperations()` in `urlState.ts` only checks for:
- `cornerFillets` → serialized as `cf`
- `allCornerFillets` → serialized as `acf`
- `cutouts` → serialized as `co`

`customEdgePaths` is simply not handled. It was likely omitted because the original task description only mentioned "fillets, cutouts" and the agent implemented exactly what was asked.

**Impact:** Any edge path modifications (drawn in 2D sketch view) are silently lost when sharing.

### Gap 2: Edge Extension ID Mismatch

In `urlSlice.ts` `getShareableUrl()`:
```typescript
edgeExtensions[panel.id] = panel.edgeExtensions;  // UUID key
```

In `loadFromUrl()`:
```typescript
edgeExtensionsMap[panel.id] ?? defaultEdgeExtensions  // different UUID after engine restart
```

When a share link is loaded, the engine creates a fresh scene with new panel UUIDs. The old UUIDs in `edgeExtensionsMap` never match the new UUIDs, so all edge extensions silently revert to `{top: 0, bottom: 0, left: 0, right: 0}`.

Panel operations avoid this bug by using `getPanelStableKey()` (e.g., `face:front`) instead of UUIDs. Edge extensions predate the stable key system and were never migrated.

**Impact:** All edge extensions (inset/outset) are silently lost when sharing.

### Gap 3: Tests Don't Cover All Operation Types

The test files (`urlState.test.ts`, `urlSlicePanelOps.test.ts`) have 49 tests. None test:
- Custom edge path roundtrip
- Edge extension roundtrip through the *actual* `getShareableUrl()` → `loadFromUrl()` path (the `urlState.test.ts` tests for edge extensions build `ProjectState` manually, using the same UUID throughout — they never test cross-engine-restart ID mapping)

The tests create a false sense of completeness by thoroughly testing what they cover while silently omitting entire operation types.

### Gap 4: Silent Failures

Every gap above fails silently:
- No console warnings when operations are dropped
- No validation that the serialized state matches the engine state
- No assertion that `panelOperations` is non-empty when operations exist
- The `serializePanelOperations` function returns `undefined` for panels that have edge paths — this looks identical to "panel has no operations"

## Root Causes

### 1. Task scope described by operation type, not by exhaustive enumeration

The original task said "wire panel operations (fillets, cutouts) into serialization." This parenthetical list became the implementation scope. `customEdgePaths` is also a panel operation but wasn't listed, so it was ignored.

**Fix:** Task descriptions for serialization work should reference the type definition, not a summary: "serialize all fields in `BasePanelSnapshot.props`" rather than "serialize fillets and cutouts."

### 2. No schema validation between engine and serialization

There's no compile-time or runtime check that all fields in `BasePanelSnapshot.props` have corresponding serialization logic. Adding a new operation type to the engine doesn't cause any test failure in the serialization layer.

**Fix:** Add a schema completeness test: enumerate all non-default fields in `BasePanelSnapshot.props` and assert each one has a serialization path.

### 3. Edge extensions predated the stable key system

Edge extensions were implemented before `getPanelStableKey()` existed. When the stable key system was added for panel operations, edge extensions weren't retrofitted. The existing edge extension tests pass because they never cross an engine restart boundary.

**Fix:** Migrate edge extension serialization to use stable keys, same as panel operations. Or better: fold edge extensions into the `panelOperations` structure so there's one consistent serialization path.

### 4. No roundtrip smoke test with all features

There's no single test that creates a project with *every* type of modification (subdivision, edge extension, fillet, cutout, edge path), serializes it, loads it, and verifies *everything* survived. Such a test would have caught all three data loss bugs.

**Fix:** Add a "kitchen sink" roundtrip test that applies one of every operation type and asserts all survive.

## Remediation

### Immediate fixes needed

- [ ] Add `customEdgePaths` to `serializePanelOperations` / `deserializePanelOperations` / `reserializePanelOps` / `applyPanelOperations` (partially done in review worktree)
- [ ] Fix edge extension serialization to use stable keys instead of UUIDs
- [ ] Add custom edge path dispatch in `applyPanelOperations` (partially done in review worktree)

### Testing improvements

- [ ] Add "kitchen sink" roundtrip test with every operation type
- [ ] Add schema completeness test for `BasePanelSnapshot.props` serialization coverage
- [ ] Edge extension roundtrip test that crosses engine restart boundary (not just serialize/deserialize)

### Process improvements

- [ ] Task descriptions for serialization should reference type definitions exhaustively
- [ ] Add `serializePanelOperations` to the "add new operation" checklist in CLAUDE.md
- [ ] Consider runtime validation: after serialization, deserialize and compare operation counts against engine state

### Architectural consideration

Edge extensions and panel operations are serialized via two completely different code paths with different key strategies. Consider unifying them under one `panelOperations` structure to eliminate the inconsistency.
