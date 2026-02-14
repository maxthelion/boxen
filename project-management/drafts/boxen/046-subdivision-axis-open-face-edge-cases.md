# Subdivision Axis Validation — Open Face Edge Cases

**Source:** In-browser AI Design feature (2026-02-13)

## Current Rule

A subdivision axis is blocked if neither face on that axis is open. This works for the common case (1 open face), but has edge cases with multiple open faces.

## Edge Cases to Consider

### 2 open faces on the same axis (e.g. top + bottom open)
- Y-axis subdivisions now allowed (both top and bottom are open)
- This is correct — horizontal shelves are accessible from both sides

### 2 open faces on different axes (e.g. top + front open)
- Y blocked? No — top is open. Z blocked? No — front is open. X blocked? Yes — neither left nor right is open.
- Only X-axis is blocked. Current logic handles this correctly.

### 3+ open faces
- Most axes become unblocked. Current logic handles this — each axis is checked independently.
- With 3 faces open on different axes, all subdivisions are valid.

### 4+ open faces
- Structurally questionable — a box with 4 open faces is basically two panels. But the rule still holds.
- Might want a separate warning: "This box has very few solid faces — consider whether it will hold together."

### All faces closed (enclosedBox with no openFaces)
- All 3 axes are blocked — no subdivisions possible, which is correct (sealed box).
- Error message could be friendlier: "All faces are closed — open at least one face to add compartments."

### Grid subdivisions
- Grids always use X + Z. If both X and Z are blocked (e.g. only top open, which leaves X and Z valid), grids work fine.
- But if front is the only open face, Z is blocked — grid (which needs Z) would fail. The grid operation currently doesn't check this.
- Need to extend the blocked-axis check to grid subdivisions (both columns axis and rows axis).

## Recommendation

- Current simple rule covers 90%+ of cases well
- Grid axis validation is the main gap — should be addressed
- The "all faces closed" case should get a better error message
- Multi-open-face cases work correctly with current logic
