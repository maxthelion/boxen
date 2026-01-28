---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
---

# Panel ID System

## Panel IDs are UUIDs

Panel IDs are generated using `crypto.randomUUID()`. They are **not** deterministic strings like `face-front` or `divider-void123-x-50`.

**Do NOT:**
- Parse panel IDs to extract information
- Construct panel IDs manually
- Use utilities from `src/utils/panelIds.ts` (deprecated)

**Instead:** Use `PanelPath.source` metadata to identify panels.

## Identifying Panels by Source

Each panel has a `source` object with semantic information:

```typescript
interface PanelSource {
  type: 'face' | 'divider';
  faceId?: FaceId;           // For face panels: 'front', 'back', etc.
  subdivisionId?: string;    // For dividers: parent void ID
  axis?: 'x' | 'y' | 'z';    // For dividers: split axis
  position?: number;         // For dividers: split position
  subAssemblyId?: string;    // For sub-assembly panels
}
```

### Examples

```typescript
// Find a specific face panel
const frontPanel = panels.find(p =>
  p.source.type === 'face' &&
  p.source.faceId === 'front' &&
  !p.source.subAssemblyId
);

// Find all divider panels
const dividers = panels.filter(p => p.source.type === 'divider');

// Find divider by parent void and axis
const xDivider = panels.find(p =>
  p.source.type === 'divider' &&
  p.source.subdivisionId === parentVoidId &&
  p.source.axis === 'x'
);
```

## Building Lookup Maps

For components that need to map semantic info to panel IDs (e.g., tree views), build a lookup map:

```typescript
function buildPanelLookup(panels: PanelPath[]) {
  const facePanels = new Map<FaceId, string>();
  const dividerPanels = new Map<string, string>();

  for (const panel of panels) {
    if (panel.source.type === 'face' && panel.source.faceId && !panel.source.subAssemblyId) {
      facePanels.set(panel.source.faceId, panel.id);
    } else if (panel.source.type === 'divider') {
      // Key: "parentVoidId-axis-position"
      const key = `${panel.source.subdivisionId}-${panel.source.axis}-${panel.source.position}`;
      dividerPanels.set(key, panel.id);
    }
  }

  return { facePanels, dividerPanels };
}
```

See `BoxTree.tsx` for a complete example.

## Why UUIDs?

During operations like subdivision, the engine clones the scene for preview. With deterministic IDs:
- Preview panels would get the same IDs as committed panels
- Selection state would become invalid when switching between preview/committed state

With UUIDs cached on VoidNode:
- Existing panels keep their IDs across clones
- Only new panels get new IDs
- Selection remains valid throughout preview/commit cycles

## ID Caching (Engine Internals)

Divider panel IDs are cached on `VoidNode._dividerPanelId`:
- When `BaseAssembly.collectDividerPanels()` creates a panel, it checks for cached ID
- If cached, uses existing ID; if not, generates new UUID and caches it
- `VoidNode.clone()` copies the cached ID to preserve identity
