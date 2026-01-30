# Extended Female Edge Slots Rule

## Problem

When a female edge (one that receives tabs/fingers from a mating male edge) is extended outward, the slots for the male tabs should also extend into the extension area. Currently this appears to be buggy - extended female edges may be missing slots or have incorrectly positioned slots.

---

## Rule: Extended Female Edges Must Contain Slots

**When a female edge is extended, any slots that would exist for mating male tabs must extend into the extension area proportionally.**

### Definitions

- **Female edge**: An edge with slots that receives tabs from a mating panel
- **Male edge**: An edge with tabs (fingers) that insert into slots on a mating panel
- **Edge extension**: When an edge extends beyond the normal panel boundary (via feet, inset/outset tool)

### Expected Behavior

1. If edge A is female (has slots for mating panel B's tabs)
2. And edge A is extended outward by X mm
3. Then the slots on edge A should:
   - Maintain their relative positions along the edge
   - The slot pattern should extend to fill the extended region
   - Slots should align with the male tabs from panel B

### Visual

```
Normal female edge (no extension):
┌──────────────────────┐
│  ▄▄  ▄▄  ▄▄  ▄▄  ▄▄ │  <- slots for male tabs
└──────────────────────┘

Extended female edge (EXPECTED):
┌──────────────────────────────┐
│  ▄▄  ▄▄  ▄▄  ▄▄  ▄▄  ▄▄  ▄▄ │  <- slots extend into extension
└──────────────────────────────┘
        ^-- extension area --^

Extended female edge (CURRENT BUG?):
┌──────────────────────────────┐
│  ▄▄  ▄▄  ▄▄  ▄▄  ▄▄         │  <- slots stop at original boundary
└──────────────────────────────┘
        ^-- no slots here --^
```

---

## Test Cases (Expected to Fail)

These tests document the expected behavior. If the current implementation is buggy, these should fail and guide the fix.

### Test 1: Bottom edge with feet, mating with front panel

```typescript
describe('Extended Female Edge Slots', () => {
  it('should have slots extending into feet region on bottom face', () => {
    // Setup: Box with feet on bottom face
    // Bottom face is female relative to front face (receives front's tabs)
    const engine = createEngineWithAssembly(100, 80, 60, defaultMaterial);

    // Add feet to bottom face (extends bottom edge downward)
    engine.dispatch({
      type: 'SET_FEET_CONFIG',
      targetId: 'main-assembly',
      payload: { enabled: true, height: 20, width: 30, inset: 10 }
    });

    const panels = engine.generatePanelsFromNodes();
    const bottomPanel = panels.find(p => p.source.faceId === 'bottom');

    // The bottom panel's edge that mates with front should have slots
    // These slots should extend into the feet region
    const frontEdgeSlots = bottomPanel.holes.filter(h =>
      h.source?.type === 'slot' && h.source?.matingFace === 'front'
    );

    // Slots should exist in the extended (feet) region
    const slotsInExtendedRegion = frontEdgeSlots.filter(slot => {
      // Check if slot Y position is in the feet extension area
      return slot.bounds.minY < -40; // Below original panel boundary
    });

    expect(slotsInExtendedRegion.length).toBeGreaterThan(0);
  });

  it('should align extended slots with mating male tabs', () => {
    const engine = createEngineWithAssembly(100, 80, 60, defaultMaterial);

    // Extend left edge of front panel
    engine.dispatch({
      type: 'SET_EDGE_EXTENSION',
      targetId: 'front-face',
      payload: { edge: 'left', extension: 15 }
    });

    const panels = engine.generatePanelsFromNodes();
    const frontPanel = panels.find(p => p.source.faceId === 'front');
    const leftPanel = panels.find(p => p.source.faceId === 'left');

    // Front panel's left edge is female (receives left panel's tabs)
    // Get slot positions on front panel's left edge
    const frontLeftSlots = frontPanel.holes.filter(h =>
      h.source?.matingFace === 'left'
    );

    // Get tab positions on left panel's right edge (male)
    const leftPanelFingers = leftPanel.outline.fingerJoints?.right;

    // Each slot should align with a corresponding tab
    for (const slot of frontLeftSlots) {
      const matchingTab = leftPanelFingers?.find(tab =>
        Math.abs(tab.position - slot.position) < 0.01
      );
      expect(matchingTab).toBeDefined();
    }
  });

  it('should maintain slot count when edge is extended', () => {
    const engine = createEngineWithAssembly(100, 80, 60, defaultMaterial);

    // Get initial slot count
    let panels = engine.generatePanelsFromNodes();
    let bottomPanel = panels.find(p => p.source.faceId === 'bottom');
    const initialSlotCount = bottomPanel.holes.filter(h =>
      h.source?.type === 'slot'
    ).length;

    // Extend an edge
    engine.dispatch({
      type: 'SET_EDGE_EXTENSION',
      targetId: 'bottom-face',
      payload: { edge: 'front', extension: 20 }
    });

    panels = engine.generatePanelsFromNodes();
    bottomPanel = panels.find(p => p.source.faceId === 'bottom');
    const extendedSlotCount = bottomPanel.holes.filter(h =>
      h.source?.type === 'slot'
    ).length;

    // Slot count should be same or greater (more slots to fill extended area)
    expect(extendedSlotCount).toBeGreaterThanOrEqual(initialSlotCount);
  });
});
```

### Test 2: Perpendicular extension with divider slots

```typescript
describe('Extended Edge with Divider Slots', () => {
  it('should extend divider slots into extended edge region', () => {
    const engine = createEngineWithAssembly(100, 80, 60, defaultMaterial);

    // Add a divider
    engine.dispatch({
      type: 'ADD_SUBDIVISION',
      targetId: 'main-assembly',
      payload: { voidId: 'root', axis: 'x', position: 50 }
    });

    // Extend the bottom face downward (feet)
    engine.dispatch({
      type: 'SET_FEET_CONFIG',
      targetId: 'main-assembly',
      payload: { enabled: true, height: 20, width: 30, inset: 10 }
    });

    const panels = engine.generatePanelsFromNodes();
    const bottomPanel = panels.find(p => p.source.faceId === 'bottom');

    // Divider creates slots on bottom panel
    // These slots should extend into the feet region if the divider
    // also extends (or the slot should be positioned correctly)
    const dividerSlots = bottomPanel.holes.filter(h =>
      h.source?.type === 'divider-slot'
    );

    expect(dividerSlots.length).toBeGreaterThan(0);
    // Verify slot positioning relative to extension
  });
});
```

---

## Implementation Notes

### Current Slot Generation

Slots are generated in `src/utils/panelGenerator.ts` and `src/engine/nodes/FacePanelNode.ts`. The slot positions are calculated based on:
1. Finger joint pattern from assembly
2. Mating panel's tab positions
3. Material thickness

### Potential Bug Location

The bug likely exists in one of these areas:
1. Slot positions not accounting for edge extensions
2. Finger joint pattern not extending into extension region
3. Slot generation stopping at original panel boundary

### Files to Investigate

| File | Relevant Code |
|------|---------------|
| `src/utils/panelGenerator.ts` | Slot hole generation |
| `src/engine/nodes/FacePanelNode.ts` | Face panel slot calculation |
| `src/utils/fingerJoints.ts` | Finger pattern generation |

---

## Related Rules

- See `docs/corner-extension-rule-plan.md` for corner handling when edges extend equally
- See `docs/geometry rules/geometry-rules.md` for general geometry constraints
