# Share Link Panel Operations Fix

**Date:** 2026-02-06
**Status:** Ready to implement
**Related:** `share-link-serialization-bug.md` (original bug report)

## Problem

When clicking Share and visiting the generated link, panel operations (cutouts, fillets, all-corner fillets) are missing. Only dimensions, faces, subdivisions, and edge extensions survive.

## Root Cause (confirmed)

The infrastructure is 90% wired up. Two call sites in `src/store/slices/urlSlice.ts` just never use it:

**Bug 1 — Not captured**: `saveToUrl()` (line 94) and `getShareableUrl()` (line 124) build `ProjectState` without the `panelOperations` field. The `serializePanelOperations()` function exists in `urlState.ts` and works correctly, but is never called from here.

**Bug 2 — Not replayed**: `loadFromUrl()` (line 39) calls `syncStoreToEngine(config, faces, rootVoid)` without passing `panelOperations`. The `syncStoreToEngine` function already accepts a `panelOperations` parameter (5th arg) and has working `applyPanelOperations()` code — it's just never invoked.

### What exists and works

| Component | File | Status |
|-----------|------|--------|
| `serializePanelOperations(assemblySnapshot)` | `src/utils/urlState.ts:382` | Exists, reads cutouts/fillets from snapshot |
| `deserializePanelOperations(serialized)` | `src/utils/urlState.ts:495` | Exists, returns `DeserializedPanelOps` |
| `ProjectState.panelOperations?` field | `src/utils/urlState.ts:540` | Exists in type |
| `serializeProject()` handles `po` field | `src/utils/urlState.ts:604` | Exists, serializes if present |
| `deserializeProject()` restores `po` field | `src/utils/urlState.ts:641` | Exists, deserializes if present |
| `syncStoreToEngine(..., panelOperations)` | `src/engine/engineInstance.ts:146` | Exists, 5th parameter |
| `applyPanelOperations(engine, ops)` | `src/engine/engineInstance.ts:256` | Exists, applies cutouts/fillets to engine |

### What's missing

| Step | What's needed |
|------|---------------|
| Serialize: build `panelOperations` from engine | Call `serializePanelOperations()` in `saveToUrl()` and `getShareableUrl()` |
| Load: pass `panelOperations` to engine | Pass `loaded.panelOperations` as 5th arg to `syncStoreToEngine()` |

## Fix (single file: `src/store/slices/urlSlice.ts`)

### Fix 1: Add panelOperations to serialization

In `saveToUrl()` and `getShareableUrl()`, after existing engine code:

```typescript
// Get assembly snapshot to serialize panel operations
const sceneSnapshot = engine.getSnapshot();
const assemblySnapshot = sceneSnapshot.children[0] as AssemblySnapshot;
const serializedPanelOps = assemblySnapshot ? serializePanelOperations(assemblySnapshot) : undefined;
const panelOperations = serializedPanelOps ? deserializePanelOperations(serializedPanelOps) : undefined;
```

Add `panelOperations` to the `ProjectState` literal.

Add `serializePanelOperations` and `deserializePanelOperations` to the import from `../../utils/urlState`.

### Fix 2: Pass panelOperations on load

Change line 51:
```typescript
// Before:
syncStoreToEngine(loaded.config, loaded.faces, loaded.rootVoid);

// After:
syncStoreToEngine(loaded.config, loaded.faces, loaded.rootVoid, undefined, loaded.panelOperations);
```

## Verification

### 1. Existing serialization tests
```bash
npm run test:run -- src/utils/urlState.test.ts
```

### 2. Script round-trip with panel operations
Generate a link with cutouts via the generate script, then parse to confirm panel operations appear.

### 3. Playwright visual test
- Generate a complex URL (box + extension + cutout + fillet) using TestFixture
- Navigate to URL in Playwright
- Screenshot and visually confirm all features render
