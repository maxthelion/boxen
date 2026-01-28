---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
---

# Debugging Rules

## Never Use console.log

**Always use the tagged debug system instead of `console.log`, `console.warn`, or `console.error`.**

The debug system in `src/utils/debug.ts` provides:
- Tag-based filtering (only active tags output)
- Clipboard export via Debug button in header
- Debug statements can stay in code permanently

### Usage

```typescript
import { debug, enableDebugTag } from '../utils/debug';

// Enable the tag (usually at module level)
enableDebugTag('selection');

// Log with a tag
debug('selection', `Selected panels: ${panelIds.join(', ')}`);
debug('selection', `Assembly selected: ${assemblyId}`);
```

### Common Tags

| Tag | Purpose |
|-----|---------|
| `selection` | Panel/void/assembly selection state |
| `two-panel` | Two-panel subdivision analysis |
| `preview` | Preview system operations |
| `subdivision` | Subdivision operations |
| `push-pull` | Push-pull operations |

### Viewing Debug Output

1. Enable relevant tags in code: `enableDebugTag('selection')`
2. Perform the action you want to debug
3. Click the **Debug** button in the header (appears when content exists)
4. Debug content is copied to clipboard

### Why Not console.log?

- Console logs pollute the browser console for all users
- Cannot be easily filtered or exported
- Must be removed before committing
- Debug system allows permanent debug statements that only activate when needed
