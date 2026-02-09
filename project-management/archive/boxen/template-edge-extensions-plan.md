# Plan: Edge Extensions in Templates

## Summary

Add support for edge extension (inset/outset) operations in project templates. The test case is a **Pencil Holder** template with a base that has all female edges extended outward for better stability.

---

## Current State

Templates currently support these action types:
- `SET_FACE_SOLID` - toggle faces open/closed
- `ADD_SUBDIVISIONS` - add dividers on a single axis
- `ADD_GRID_SUBDIVISION` - add grid dividers on multiple axes

The engine already supports edge extension actions:
- `SET_EDGE_EXTENSION` - set extension on a single edge
- `SET_EDGE_EXTENSIONS_BATCH` - set extensions on multiple edges at once

---

## Goal

Enable templates to specify edge extensions so designs can include:
- Outset bases for stability (pencil holder, desk organizer)
- Inset lids for flush closures
- Extended feet on wall panels

---

## Implementation

### 1. Add Edge Extension Actions to Templates

Templates can already use any `EngineAction['type']`. The `SET_EDGE_EXTENSION` action works as-is:

```typescript
{
  type: 'SET_EDGE_EXTENSION',
  targetId: '$assembly',
  payload: {
    panelId: '$bottom',  // Reference to bottom face panel
    edge: 'front',       // Which edge to extend
    value: 10            // Extension amount (positive = outset)
  },
}
```

### 2. Panel ID References

Templates use `$` prefixed references that get resolved at instantiation:
- `$assembly` → main assembly ID
- `$rootVoid` → root void ID

Need to add face panel references:
- `$front`, `$back`, `$left`, `$right`, `$top`, `$bottom` → face panel IDs

**File to modify:** `src/templates/templateEngine.ts`

### 3. Batch Extension for Multiple Edges

For the pencil holder base, we want to extend all 4 edges of the bottom panel. Use `SET_EDGE_EXTENSIONS_BATCH`:

```typescript
{
  type: 'SET_EDGE_EXTENSIONS_BATCH',
  targetId: '$assembly',
  payload: {
    extensions: [
      { panelId: '$bottom', edge: 'front', value: 10 },
      { panelId: '$bottom', edge: 'back', value: 10 },
      { panelId: '$bottom', edge: 'left', value: 10 },
      { panelId: '$bottom', edge: 'right', value: 10 },
    ]
  },
}
```

---

## Test Case: Pencil Holder Template

### Design

- **Shape:** Tall, narrow box (good for holding pencils/pens)
- **Open top:** For easy access
- **Extended base:** All 4 edges of bottom panel outset for stability
- **Rationale:** A pencil holder with an extended base won't tip over easily

### Template Definition

```typescript
const pencilHolder: ProjectTemplate = {
  id: 'pencil-holder',
  name: 'Pencil Holder',
  description: 'Tall holder with extended base for stability',
  category: 'organization',
  initialAssembly: {
    width: 80,
    height: 120,
    depth: 80,
    materialThickness: 3,
    fingerWidth: 10,
    fingerGap: 1.5,
  },
  actionSequence: [
    // Remove top face for pencil access
    {
      type: 'SET_FACE_SOLID',
      targetId: '$assembly',
      payload: { faceId: 'top', solid: false },
    },
    // Extend all bottom edges outward for stability
    {
      type: 'SET_EDGE_EXTENSIONS_BATCH',
      targetId: '$assembly',
      payload: {
        extensions: [
          { panelId: '$bottom', edge: 'front', value: 15 },
          { panelId: '$bottom', edge: 'back', value: 15 },
          { panelId: '$bottom', edge: 'left', value: 15 },
          { panelId: '$bottom', edge: 'right', value: 15 },
        ]
      },
    },
  ],
};
```

### Visual

```
Top view (without top face):

Normal base:          Extended base:
┌────────┐           ┌──────────────┐
│        │           │  ┌────────┐  │
│        │    →      │  │        │  │
│        │           │  │        │  │
│        │           │  └────────┘  │
└────────┘           └──────────────┘
                     ^-- 15mm outset on all sides
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/templates/templateEngine.ts` | Add face panel ID resolution (`$front`, `$bottom`, etc.) |
| `src/templates/builtinTemplates.ts` | Add `pencilHolder` template |
| `src/templates/types.ts` | Document new `$panelId` references (optional, for clarity) |

---

## Edge Extension Config (Future Enhancement)

For parameterizable edge extensions (like subdivisions), we could add:

```typescript
interface TemplateAction {
  // ... existing fields ...

  /**
   * For edge extension actions: marks this as generating a variable.
   */
  edgeExtensionConfig?: {
    variableName: string;      // e.g., "Base Extension"
    defaultValue: number;      // e.g., 15
    min: number;               // e.g., 0
    max: number;               // e.g., 50
  };
}
```

This would allow users to adjust the base extension amount when configuring the template. **Not required for initial implementation.**

---

## Verification

1. **Create template:** Add pencil holder to `builtinTemplates.ts`
2. **Test template engine:** Verify `$bottom` resolves to correct panel ID
3. **Visual test:** Load template in UI, verify base extends on all sides
4. **Export test:** Export SVG, verify bottom panel has correct extended outline
5. **Geometry validation:** Run `validateGeometry()` on instantiated template

---

## Notes

- The bottom panel is "male" on its edges (tabs out to wall panels)
- Wall panel bottom edges are "female" (receive tabs from bottom)
- Extended male edges (bottom panel) should work correctly
- Extended female edges (wall panels, if we did feet) would need the `extension-slot` holes (see `docs/extended-female-edge-slots-rule.md`)

---

## Processing Summary (automated)

**Processed:** 2026-02-09
**Agent:** draft-processor
**Age at processing:** 10 days

**Actions taken:**
- Archived to project-management/archive/boxen/
- Proposed 1 task (see proposed-tasks/template-edge-extensions-plan.md)
