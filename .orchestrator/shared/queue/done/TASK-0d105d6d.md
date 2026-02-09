# [TASK-0d105d6d] Break down: Fix share link serialization

ROLE: breakdown
PRIORITY: P1
BRANCH: feature/dca27809
CREATED: 2026-02-05T15:47:09.047244
CREATED_BY: human
PROJECT: PROJ-dca27809

## Context
Share links don't preserve all operations (cutouts, fillets)

# Share Link Serialization Bug

**Date:** 2026-02-05
**Status:** Draft

## Problem

When clicking the share button and visiting the generated link, not all operations are applied to the assembly. The shared state is missing:
- Panel alterations via cutouts
- Filleting (corner fillets)
- Potentially other panel-level modifications

## Expected Behavior

A share link should fully reconstruct the exact state of the assembly, including all:
- Dimensions and material settings
- Face open/closed states
- Subdivisions and dividers
- Sub-assemblies (drawers, trays)
- **Panel modifications** (cutouts, edge extensions, notches)
- **Corner fillets** (both old 4-corner and new all-corners system)
- Any other user-applied operations

## Root Cause Hypothesis

The serialization likely captures assembly-level state but misses panel-level state that's stored separately:

1. **Cutouts/Edge Operations**: Stored in `BaseAssembly._panelOperations` map
2. **All-Corner Fillets**: Stored in `BaseAssembly._panelAllCornerFillets` map
3. **Old Corner Fillets**: Stored in `BasePanel._cornerFillets` map

These maps may not be included in the serialization format used for share links.

## Entry Points for Investigation

| File | Purpose |
|------|---------|
| `src/utils/shareLink.ts` (or similar) | Share link generation/parsing |
| `src/engine/Engine.ts` | `serialize()` / `deserialize()` methods |
| `src/engine/nodes/BaseAssembly.ts` | Assembly state that needs serialization |
| `src/engine/nodes/BasePanel.ts` | Panel state that needs serialization |
| URL hash or query param handling | How state is encoded in URL |

### Key Questions

1. Where is the share link generated? What serialization format is used?
2. Does `Engine.serialize()` include `_panelOperations` and `_panelAllCornerFillets`?
3. Does `Engine.deserialize()` restore these maps?
4. Is there a snapshot type that's missing these fields?

## Testing Approach

### Round-Trip Serialization Test

**Critical validation pattern**: Operations should survive serialization round-trip.

```typescript
describe('Share link serialization', () => {
  it('preserves cutout operations', () => {
    const engine = createEngineWithAssembly(100, 80, 60, defaultMaterial);

    // Apply a cutout
    engine.dispatch({
      type: 'APPLY_PANEL_OPERATION',
      targetId: 'main-assembly',
      payload: { panelId, operation: cutoutOperation }
    });

    const panelBefore = engine.getPanels().find(p => p.id === panelId);
    const holesBefore = panelBefore.holes.length;

    // Serialize -> Deserialize
    const serialized = engine.serialize();
    const newEngine = Engine.deserialize(serialized);

    const panelAfter = newEngine.getPanels().find(p => p.id === panelId);
    expect(panelAfter.holes.length).toBe(holesBefore);
  });

  it('preserves corner fillets', () => {
    const engine = createEngineWithAssembly(100, 80, 60, defaultMaterial);

    // Apply fillet
    engine.dispatch({
      type: 'SET_ALL_CORNER_FILLET',
      targetId: 'main-assembly',
      payload: { panelId, cornerId: 'outline:0', radius: 5 }
    });

    const outlineBefore = engine.getPanels().find(p => p.id === panelId).outline;

    // Serialize -> Deserialize
    const serialized = engine.serialize();
    const newEngine = Engine.deserialize(serialized);

    const outlineAfter = newEngine.getPanels().find(p => p.id === panelId).outline;

    // Fillet adds arc points, so point count should match
    expect(outlineAfter.points.length).toBe(outlineBefore.points.length);
  });

  it('preserves edge extensions', () => {
    // Similar pattern for edge extensions
  });

  it('full state equality after round-trip', () => {
    const engine = createEngineWithAssembly(100, 80, 60, defaultMaterial);

    // Apply multiple operations
    applyVariousOperations(engine);

    // Get full snapshot before
    const snapshotBefore = engine.getSnapshot();
    const panelsBefore = engine.generatePanelsFromNodes();

    // Round-trip
    const serialized = engine.serialize();
    const newEngine = Engine.deserialize(serialized);

    // Get full snapshot after
    const snapshotAfter = newEngine.getSnapshot();
    const panelsAfter = newEngine.generatePanelsFromNodes();

    // Deep equality check
    expect(snapshotAfter).toEqual(snapshotBefore);
    expect(panelsAfter.length).toBe(panelsBefore.length);

    // Per-panel geometry check
    for (let i = 0; i < panelsBefore.length; i++) {
      expect(panelsAfter[i].outline.points.length)
        .toBe(panelsBefore[i].outline.points.length);
      expect(panelsAfter[i].holes.length)
        .toBe(panelsBefore[i].holes.length);
    }
  });
});
```

### Share Link End-to-End Test

```typescript
describe('Share link E2E', () => {
  it('generates link that restores full state', () => {
    // Setup state with operations
    const engine = getEngine();
    // ... apply operations

    // Generate share link
    const shareUrl = generateShareLink(engine);

    // Parse link and restore
    const params = parseShareLink(shareUrl);
    const restoredEngine = createEngineFromShareParams(params);

    // Verify state matches
    // ...
  });
});
```

## Recommended Fix Approach

1. **Audit serialization format**: List all state that should be persisted
2. **Add missing fields**: Ensure `_panelOperations`, `_panelAllCornerFillets` are serialized
3. **Add round-trip tests**: Prevent regression
4. **Consider versioning**: Share links should include format version for backward compatibility

## State Checklist for Serialization

- [ ] Assembly dimensions (width, height, depth)
- [ ] Material thickness
- [ ] Face open/closed states
- [ ] Subdivisions (void tree)
- [ ] Sub-assemblies
- [ ] Panel operations (cutouts, extensions)
- [ ] All-corner fillets map
- [ ] Old 4-corner fillets (if still used)
- [ ] Any other panel-level state

## Notes

- Share links may use URL hash or query params - check size limits
- Consider compression for complex states (LZ-string or similar)
- May need migration path if old share links exist


## Acceptance Criteria
- [ ] Decompose into right-sized tasks
- [ ] Create testing strategy task first
- [ ] Map dependencies between tasks
- [ ] Each task completable in <30 turns

CLAIMED_BY: unknown
CLAIMED_AT: 2026-02-05T15:48:00.390052

COMPLETED_AT: 2026-02-05T15:50:45.817784

## Result
Breakdown ready for review: breakdown-20260205-155045.md
Review with: /approve-breakdown breakdown-20260205-155045
