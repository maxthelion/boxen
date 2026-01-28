---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
---

# Panel ID Rules

## Always Use Centralized ID Utilities

Panel IDs must be created and parsed using the utilities in `src/utils/panelIds.ts`. **Never concatenate ID strings manually.**

### Creating IDs

```typescript
import { createFacePanelId, createDividerPanelId } from '../utils/panelIds';

// Face panels
const faceId = createFacePanelId('front');              // 'face-front'
const subFaceId = createFacePanelId('front', 'sub123'); // 'sub123-face-front'

// Divider panels
const dividerId = createDividerPanelId('void123', 'x', 50); // 'divider-void123-x-50'
```

### Parsing IDs

```typescript
import {
  parseFacePanelId,
  parseDividerPanelId,
  getVoidIdFromDividerPanelId,
  getPanelType
} from '../utils/panelIds';

// Extract components from panel IDs
const faceInfo = parseFacePanelId('face-front');     // { faceId: 'front' }
const dividerInfo = parseDividerPanelId('divider-abc-x-50'); // { voidId: 'abc', axis: 'x', position: 50 }

// Get void ID from any divider format
const voidId = getVoidIdFromDividerPanelId('divider-abc-x-50'); // 'abc'

// Detect panel type
const type = getPanelType('divider-abc-x-50'); // 'divider'
```

### Getting All Divider IDs from Void Tree

```typescript
import { getAllDividerPanelIds, getDividerPanelIdByVoidId } from '../utils/panelIds';

// Get all divider panel IDs in a void tree
const allDividerIds = getAllDividerPanelIds(rootVoid);

// Get divider ID for a specific void
const dividerId = getDividerPanelIdByVoidId(rootVoid, 'targetVoidId');
```

## ID Formats (Reference)

| Panel Type | Format | Example |
|------------|--------|---------|
| Face (main) | `face-{faceId}` | `face-front` |
| Face (sub-assembly) | `{subAsmId}-face-{faceId}` | `sub123-face-front` |
| Divider | `divider-{voidId}-{axis}-{position}` | `divider-abc123-x-50` |
| Divider slot | `divider-slot-{id}-{index}` | `divider-slot-abc-0` |

## Why This Matters

Inconsistent ID formats cause selection bugs where:
- 3D view shows item as selected (using engine's ID format)
- Tree view shows item as unselected (using different format)
- Operations fail to find panels (ID mismatch)
