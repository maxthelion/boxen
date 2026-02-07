# Panel ID System

Panels have a **two-tier identification system**:

| Context | ID Type | Example | Survives restart |
|---------|---------|---------|-----------------|
| Runtime (engine, store, selection) | UUID | `f7a3-42bc-...` | No |
| Serialization (share links, URL state) | Canonical key from `PanelSource` | `face:front`, `divider:void-1:x:50` | Yes |

## Runtime: UUIDs

At runtime, panels are identified by UUIDs. These are ephemeral -- regenerated each time the engine loads.

### Why UUIDs?

During operations like subdivision, the engine clones the scene for preview. With deterministic IDs (e.g., `divider-void123-x-50`), cloned panels would collide with originals, breaking selection. UUIDs ensure each panel instance has a unique identity.

## Serialization: Canonical Keys

Share links and URL state use **canonical keys** derived from `PanelSource` metadata. These are deterministic and survive engine restarts.

- Face panels: `face:front`, `sub:assembly-1:face:left`
- Divider panels: `divider:void-1:x:50`

The bridge between the two systems is in `src/utils/urlState.ts`:
- `getPanelCanonicalKey(panel)` -- UUID → canonical key (when saving)
- `getPanelCanonicalKeyFromPath(panel)` -- PanelPath → canonical key
- Deserialization matches canonical keys back to panels by source metadata

## ID Stability Across Clones

Divider panel IDs are cached on VoidNode (`_dividerPanelId`). When the scene is cloned:
- Existing panels keep their cached UUIDs
- Only NEW panels (from the current operation) get new UUIDs
- This preserves selection state during preview/commit cycles

## Identifying Panels

Don't parse panel IDs - use `PanelPath.source` metadata instead:

```typescript
// PanelPath.source contains semantic info about the panel
interface PanelSource {
  type: 'face' | 'divider';
  faceId?: FaceId;           // For face panels
  subdivisionId?: string;    // Parent void ID (for dividers)
  axis?: 'x' | 'y' | 'z';    // Split axis (for dividers)
  position?: number;         // Split position (for dividers)
  subAssemblyId?: string;    // For sub-assembly panels
}

// Example: Find a divider panel by its source info
const dividerPanel = panels.find(p =>
  p.source.type === 'divider' &&
  p.source.subdivisionId === parentVoidId &&
  p.source.axis === 'x'
);

// Example: Find face panels for the main assembly
const mainFacePanels = panels.filter(p =>
  p.source.type === 'face' && !p.source.subAssemblyId
);
```

## Building Lookup Maps

For components that need to map semantic info to panel IDs, build a lookup map from engine panels (see `BoxTree.tsx` for example):

```typescript
function buildPanelLookup(panels: PanelPath[]) {
  const dividerPanels = new Map<string, string>();
  for (const panel of panels) {
    if (panel.source.type === 'divider') {
      // Key: "parentVoidId-axis-position"
      const key = `${panel.source.subdivisionId}-${panel.source.axis}-${panel.source.position}`;
      dividerPanels.set(key, panel.id);
    }
  }
  return { dividerPanels };
}
```

## Deprecated

The utilities in `src/utils/panelIds.ts` construct deterministic IDs and are incompatible with the UUID system. Do not use them for new code.
