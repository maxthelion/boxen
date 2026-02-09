# Proposal: Stable Identity for Scene Objects

## Problem Statement

The engine uses three separate systems to identify panels, and none of them work reliably for serialization:

1. **UUIDs** (`panel.id`) — Random IDs assigned at creation. Stable during a session and across scene clones (for preview), but change on every engine restart. Used by the runtime for selection, rendering, and operation dispatch. Used by edge extension serialization (broken — UUIDs don't survive engine restart).

2. **Stable keys** (`getPanelStableKey()`) — Derives strings like `face:front` or `divider:root:x:50` from snapshot metadata. Invented specifically for share link serialization. Only used in `urlState.ts`. Fragile: pattern-matches on snapshot shape and silently falls back to UUID for unrecognized panel types.

3. **PanelSource** — Metadata on `PanelPath` recording what created the panel (`faceId`, `subdivisionId`, `axis`, `position`). Used by components to find panels semantically. Overlaps with stable keys but in a different shape and doesn't scope by sub-assembly.

### Consequences

- **Edge extensions use UUID keys** — silently lost when loading a share link (new engine = new UUIDs)
- **Custom edge paths not serialized** — `serializePanelOperations` wasn't updated when edge paths were added
- **Sub-assembly panels collide** — a drawer's `face:front` and the box's `face:front` produce the same PanelSource/stable key
- **No enforcement** — adding a new panel property to `BasePanelSnapshot.props` doesn't cause any failure in serialization. Gaps are only found through manual testing.

### Beyond panels

The identity problem extends to sub-panel entities. Operations target not just panels but edges and points within panels:

| Entity | How it's addressed | Stable across restart? | Stable across param change? |
|--------|-------------------|----------------------|---------------------------|
| Panel | UUID / PanelSource / stable key | UUID: no. Source/key: yes (if scoped) | Yes |
| Edge | `EdgePosition` (`'top'`, `'bottom'`, `'left'`, `'right'`) | Yes | Yes |
| Structural corner | `CornerKey` (`'left:top'`, `'bottom:right'`) | Yes | Yes |
| Computed point | `AllCornerId` (`'outline:5'`, `'hole:cutout-1:3'`) | Yes (same params) | **No** |

Edges and structural corners are fine — they have stable, semantic names that don't depend on computation.

Computed point indices (used by all-corner fillets) are fragile. `outline:5` means "the 5th point in the computed outline," which depends on finger joint generation, edge extensions, etc. If any parameter changes, indices shift and the fillet targets the wrong vertex. This is a known limitation that exists even within a session — it's just not exposed because parameters don't change after fillets are applied.

## Proposed Solution

Consolidate `PanelSource` as the single canonical identity for panels in serialization, properly scoped by assembly. Delete `getPanelStableKey()`. Migrate edge extensions to use the same system as panel operations. Accept computed point indices as inherently fragile.

### Tier 1: Panel identity (fix now)

`PanelSource` already contains the right information. The problem is that it's not used for serialization and doesn't scope by sub-assembly. Fix:

**Add assembly scoping to PanelSource.** A panel's full identity is its source + which assembly it belongs to:

```
Main assembly, face panel:     main:face:front
Main assembly, divider:        main:divider:root:x:50
Sub-assembly in void X, face:  sub:voidX:face:front
Sub-assembly divider:          sub:voidX:divider:root:z:30
```

**Use this everywhere.** Replace:
- `getPanelStableKey()` → derive key from PanelSource directly
- `edgeExtensions[panel.id]` (UUID) → `edgeExtensions[panelKey]`
- `panelOperations[stableKey]` → `panelOperations[panelKey]`

One function, one key format, used by all serialization paths.

**Enforce completeness.** Add a test that enumerates all non-default fields in `BasePanelSnapshot.props` and asserts each one has a serialization path. When a new operation is added to the engine, this test fails until the serialization is updated.

### Tier 2: Edge and corner identity (already solved)

Edges use `EdgePosition` — stable, semantic, no changes needed.

Structural corners use `CornerKey` (`'left:top'`) — stable, semantic, no changes needed.

These are always relative to a panel, so the full address is `panelKey + edgeOrCorner`:

```
Edge extension:    main:face:front → top → 15mm
Corner fillet:     main:face:front → left:top → radius 5
Edge path:         main:face:front → top → { points: [...] }
```

### Tier 3: Computed point identity (hard, defer)

All-corner fillets target computed points like `outline:5`. These indices depend on:
- Finger joint count and positions (from dimensions, material thickness, finger width)
- Edge extensions (shift where edges start/end)
- Other edge paths (change the outline shape)

This means the same fillet applied before and after an edge extension could target different geometric vertices. The index is a coordinate in computed space, not a stable identifier.

**Options for future improvement:**
- **Anchor to nearest structural feature.** Instead of `outline:5`, store "the corner between the 3rd finger tab and the top edge." This survives parameter changes as long as the topological structure is similar.
- **Use parametric coordinates.** Store the fillet's position as a fraction of the edge length plus an edge identifier, rather than a point index.
- **Accept fragility.** Point-level fillets are cosmetic. If parameters change significantly enough to shift point indices, the user is already reviewing geometry. Re-applying fillets is acceptable.

For now, accept that computed point references (`AllCornerId`) are fragile and document this limitation. The serialization should preserve them accurately for same-parameter roundtrips, which is the share link use case.

## Implementation Plan

### Phase 1: Unify panel keys (immediate)

1. Create `getPanelCanonicalKey(panel, assemblyPath?)` that produces scoped keys from PanelSource
2. Replace `getPanelStableKey()` calls with the new function
3. Replace UUID-keyed edge extension serialization with canonical keys
4. Add `customEdgePaths` to `serializePanelOperations` / `deserializePanelOperations`
5. Wire `getShareableUrl()` and `loadFromUrl()` to include all panel operations
6. Add completeness test for `BasePanelSnapshot.props` serialization coverage

### Phase 2: Sub-assembly scoping (when needed)

7. Extend canonical key to include assembly path for sub-assembly panels
8. Test roundtrip with sub-assemblies that have panel operations

### Phase 3: Point stability (future)

9. Research anchor-based point addressing for all-corner fillets
10. Prototype and evaluate whether it's worth the complexity vs. accepting fragility

## What this does NOT do

- Does not change the runtime UUID system — UUIDs remain for selection, rendering, and session-local identity
- Does not introduce event sourcing or operation replay — serialization stays snapshot-based
- Does not solve the computed-point fragility — that's documented as a known limitation
- Does not change the share link format for existing features that already work (subdivisions, face config)
