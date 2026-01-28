---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
---

# Code Reuse Rules

## Before Implementing New Functionality

**Always search for existing similar functionality before writing new code.**

1. **Search the codebase** for similar patterns, helper methods, or utilities that already exist
2. **Check related files** - if implementing something for `DividerPanelNode`, check how `FacePanelNode` does it
3. **Look for shared base classes** - functionality may already exist in `BasePanel`, `BaseAssembly`, etc.
4. **Check utility modules** - `src/utils/` contains shared helpers that may already solve the problem

## After Writing an Implementation

Before considering the work complete:

1. **Compare with similar code** - does your implementation follow the same patterns?
2. **Consider extracting shared logic** - if you duplicated code, can it be moved to a shared location?
3. **Verify consistency** - does your approach match how similar features work elsewhere?

## Common Patterns to Reuse

| Feature | Look Here First |
|---------|-----------------|
| Panel holes/slots | `FacePanelNode.computeHoles()` |
| Finger joint generation | `BasePanel.computeOutline()` |
| Edge configurations | `BasePanel.computeEdgeConfigs()` |
| Void traversal | `VoidNode` static methods |
| Panel dimensions | `BasePanel.computeDimensions()` |
| World transforms | `BasePanel.computeTransform()` |

## Why This Matters

- Reduces bugs by using tested code
- Maintains consistency across the codebase
- Makes the code easier to understand and maintain
- Avoids subtle differences in behavior between similar features
