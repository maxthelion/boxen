# Refactor generateDividerSlotHoles: extract Table-Driven face-axis slot mapping (CCN 144 → ~8)

**Status:** Idea
**Author:** architecture-analyst
**Captured:** 2026-02-23

## Issue

`generateDividerSlotHoles` in `src/utils/panelGenerator.ts` (lines 1385–1827) is the most complex
single function in the codebase — **CCN=144, 322 NLOC, 443 physical lines**. It computes the slot
holes that appear on each face panel wherever a divider passes through.

The root problem: a massive `switch (faceId)` with 6 cases (front/back/left/right/top/bottom), each
containing nested `if (axis === 'x') … else if (axis === 'y') … else if (axis === 'z')` blocks.
Every branch sets the same 8 slot-geometry variables in slightly different ways (mirrored
coordinates, swapped start/end insets, different length axes). The result is ~400 lines of
nearly-identical-but-subtly-different coordinate arithmetic — impossible to audit or modify
safely without reading all 6×3 = 18 sub-cases.

This is **untestable at the unit level**: to test any single face, you must set up the full
function call. A defect in the `right` + `y` case has no test surface without running the
whole panel pipeline.

## Current Code

The core of the problem (lines 1445–1614):

```typescript
switch (faceId) {
  case 'front':
    if (meetsFront) {
      if (axis === 'x') {
        slotX = position - width / 2;
        slotLength = bounds.h;
        isHorizontal = false;
        slotCenterOffset = (bounds.y + bounds.h / 2) - height / 2;
        startInset = meetsBottom && isFaceSolid('bottom') ? materialThickness : 0;
        endInset   = meetsTop    && isFaceSolid('top')    ? materialThickness : 0;
        extensionStart = getExtForEdge('bottom', meetsBottom && isFaceSolid('bottom'));
        extensionEnd   = getExtForEdge('top',    meetsTop    && isFaceSolid('top'));
      } else if (axis === 'y') {
        // ... same 8 assignments, different numbers
      }
    }
    break;
  case 'back':
    // ... mirrored version of 'front', 50+ lines
    break;
  case 'left':  /* ... */ break;
  case 'right': /* ... */ break;
  case 'top':   /* ... */ break;
  case 'bottom':/* ... */ break;
}
```

Each branch is ~50–70 lines. Errors in coordinate mirroring (e.g. the negation for `back` and
`right`) are invisible unless you compare all 6 cases side-by-side.

## Proposed Refactoring

**Pattern: Table-Driven slot resolver** — replace the switch with a lookup table mapping
`(faceId, axis)` → a pure `FaceAxisSlotMapping` object that encodes the coordinate
transformation for that combination.

```typescript
// New type: everything needed to compute slot geometry for one (face, axis) pair
interface FaceAxisSlotMapping {
  /** Whether this divider touches the given face boundary */
  matches: (meets: MeetsBoundary) => boolean;
  /** Slot position along the face's horizontal axis (null if slot is vertical) */
  getSlotX: ((position: number, dims: BoxDims) => number) | null;
  /** Slot position along the face's vertical axis (null if slot is horizontal) */
  getSlotY: ((position: number, dims: BoxDims) => number) | null;
  getLength: (bounds: VoidBounds) => number;
  isHorizontal: boolean;
  getCenterOffset: (bounds: VoidBounds, dims: BoxDims) => number;
  getStartInset: (meets: MeetsBoundary, solid: SolidFaceCheck) => number;
  getEndInset:   (meets: MeetsBoundary, solid: SolidFaceCheck) => number;
  getExtStart:   (meets: MeetsBoundary, solid: SolidFaceCheck, ext: EdgeExtensions) => number;
  getExtEnd:     (meets: MeetsBoundary, solid: SolidFaceCheck, ext: EdgeExtensions) => number;
}

// Lookup table — each entry is compact and independently verifiable
const FACE_AXIS_SLOT_MAPPINGS: Partial<Record<FaceId, Partial<Record<Axis, FaceAxisSlotMapping>>>> = {
  front: {
    x: {
      matches: (m) => m.meetsFront,
      getSlotX: (pos, d) => pos - d.width / 2,
      getSlotY: null,
      isHorizontal: false,
      getLength: (b) => b.h,
      getCenterOffset: (b, d) => (b.y + b.h / 2) - d.height / 2,
      getStartInset:  (m, s) => m.meetsBottom && s('bottom') ? s.mt : 0,
      getEndInset:    (m, s) => m.meetsTop    && s('top')    ? s.mt : 0,
      getExtStart: (m, s, e) => m.meetsBottom && s('bottom') ? 0 : e.bottom,
      getExtEnd:   (m, s, e) => m.meetsTop    && s('top')    ? 0 : e.top,
    },
    y: { /* compact 10-line object */ },
  },
  back: {
    x: { matches: (m) => m.meetsBack, getSlotX: (pos, d) => -(pos - d.width / 2), ... },
    // The negation is now explicit and isolated to this one entry
  },
  // left, right, top, bottom follow the same compact pattern
};

// Refactored main loop — CCN drops to ~2
for (const sub of subdivisions) {
  const mapping = FACE_AXIS_SLOT_MAPPINGS[faceId]?.[sub.axis];
  if (!mapping || !mapping.matches(meets)) continue;

  const slotX = mapping.getSlotX?.(sub.position, dims) ?? null;
  const slotY = mapping.getSlotY?.(sub.position, dims) ?? null;
  // ... 5 more lines to invoke the remaining mapping functions
  generateAndPushSlotHoles(slotX, slotY, ...); // extracted helper
}
```

The 18 sub-cases become 18 small, independently-testable objects. Each object can be unit-tested
by constructing it directly and calling its functions — no full panel setup required.

## Why This Matters

1. **Testability**: Each `FaceAxisSlotMapping` object is a pure-function bundle. You can write
   `expect(FACE_AXIS_SLOT_MAPPINGS.back.x.getSlotX(50, {width:100})).toBe(-0)` without
   setting up an Engine or VoidTree.

2. **Auditability**: The 6 mirroring patterns (e.g. `back` negates X, `right` negates Z) are
   currently buried in 400 lines of switch. In the table, they're visible as a one-line
   negation in the `getSlotX` field — impossible to miss during review.

3. **Extensibility**: Adding a new face orientation (e.g. for angled assemblies) means adding
   one new table entry rather than one new switch case with 70 nested lines.

4. **Reduced risk of regression**: The current function is a change-hazard. Any fix to one face
   must be manually verified not to affect the other 5. With isolated mapping objects, a change
   to `front.x` cannot affect `back.y`.

## Metrics

- **File:** `src/utils/panelGenerator.ts`
- **Function:** `generateDividerSlotHoles` (lines 1385–1827)
- **Current CCN:** 144 (highest in codebase by a large margin)
- **Current NLOC:** 322 (443 physical lines)
- **Estimated CCN after:** ~8 in the main function; each mapping object ~1–2
- **Related high-CCN candidate:** `generateDividerToSlotHoles` (lines 2244–2462, CCN=68) follows
  the same switch-on-axis pattern and could be refactored with the same approach in a follow-up.
