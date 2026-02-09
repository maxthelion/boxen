# Draft Task: Operations Testing Strategy Exploration

**Status:** Draft (awaiting approval)
**Category:** Architectural / Testing
**Priority:** P2
**Exploration Status:** Complete

## Background

Handwritten notes (IMG_8255-8257) proposed a comprehensive testing strategy for operations with a 4-step testing model. The fillet bugs discovered reveal gaps between our current testing approach and real-world failure modes.

---

## Exploration Results

### Task 1: How Do Other Operations Handle Preview?

**Analyzed:** push-pull, subdivide, inset operations

**Common Pattern Discovered:**

All three operations follow an identical preview architecture:

```
User adjusts params in Palette
    ↓
updateOperationParams({ ... })
    ↓
operation.createPreviewAction(params, context)
    ↓
engine.discardPreview() + engine.startPreview()  (fresh clone)
    ↓
engine.dispatch(action, { preview: true })
    ↓
Modifies engine._previewScene only
    ↓
notifyEngineStateChanged()
    ↓
useEnginePanels() re-renders with preview geometry
```

**Key Architectural Patterns:**

| Pattern | Purpose |
|---------|---------|
| **Two-Scene Architecture** | `_scene` (committed) and `_previewScene` (preview) are independent |
| **Fresh Clone Per Update** | Each param change discards old preview, creates new clone |
| **Registry-Based Actions** | `createPreviewAction()` in registry converts params → engine action |
| **Delta Model** | Inset uses `base + offset` for intuitive sliders |
| **Reactive Snapshots** | `useSyncExternalStore` triggers re-render on `notifyEngineStateChanged()` |

**Implications for Testing:**

1. Preview correctness depends on `createPreviewAction()` returning correct action
2. Engine dispatch must properly route to preview scene
3. Panel generation must read from active scene (preview when active)
4. The fillet bug was a wiring failure at step 2 (action not implemented) and step 3 (data not transferred to panels)

---

### Task 2: Minimum Set of Permutations ("Tree of Outcomes")

**7 Orthogonal Dimensions Define Panel State:**

| Dimension | States | Why It Matters |
|-----------|--------|----------------|
| **Adjacent Open Faces** | 0, 1, 2-adj, 2-opp, 3, 4 | Edge extension eligibility, corner eligibility |
| **Extensions** | 0-4 edges (16 patterns) | Creates new corners, affects safe space |
| **Edge Customizations** | None, 1+, 2+ custom paths | Uses safe space, affects fillet forbidden areas |
| **Cutouts** | 0, 1, 2+ holes | Creates corners in allCornerEligibility |
| **Panel Type** | Face, divider, sub-assembly | Different constraint rules |
| **Finger Joints** | 0, 1, 2+ mating edges | Affects corner eligibility |
| **Cross-Lap Config** | None, 1, 2+ intersections | Divider-specific complexity |

**Theoretical Matrix:** 12 × 16 × 7 = 1,344 combinations

**Minimum Viable Test Set (20 Key Tests):**

| # | Scenario | Tests |
|---|----------|-------|
| 1 | Enclosed box, no mods | Baseline - all edges locked |
| 2 | Basic box, no mods | 1 open edge |
| 3 | Basic box + top extended | 1 extension on open edge |
| 4 | Basic box + top+right extended | 2 adjacent extensions |
| 5 | Basic box + all 4 edges extended | Maximum extension state |
| 6 | Basic box + center cutout | Rectangle hole |
| 7 | Basic box + edge-proximal cutout | Near forbidden area |
| 8 | Enclosed box, fillet test | Expect 0 eligible corners |
| 9 | Basic box, fillet test | Expect 2 eligible corners |
| 10 | Basic box + extended, fillet test | Different eligibility |
| 11 | Basic box + custom wavy edge | Safe space interaction |
| 12 | Subdivided (1 divider) | Cross-lap slots |
| 13 | Subdivided (2×2 grid) | 4 cross-lap intersections |
| 14 | 2 adjacent open faces | TL corner exposed |
| 15 | 2 opposite open faces | L-R open |
| 16 | Sub-assembly panel | Nested container face |
| 17 | Panel + custom edge + cutout | Interaction test |
| 18 | Panel with 3 extensions | Asymmetric T+L+R |
| 19 | Divider in Y-axis | Different orientation |
| 20 | Isolated panel | All 4 edges open |

**Fillet-Specific Eligibility Matrix:**

| Configuration | Expected Eligible Corners |
|---------------|---------------------------|
| Fully mating, no extensions | 0 |
| 1 open edge, no extensions | 0 |
| 1 open edge, extended | 2 |
| 2 adjacent open, no ext | 1 |
| 2 adjacent open, extended | 2+ |
| 2 opposite open, no ext | 0 |
| 3+ open edges | Corners on open edges |
| All 4 open, all extended | 4 |

---

### Task 3: UI Selection Testing Approach

**Can we test 3D selection flow directly?**

**No.** The codebase runs vitest in Node environment (not jsdom/browser). There are no component tests, no React Testing Library, no THREE.js testing utilities.

**Recommended Approach: Store-Level Testing**

```typescript
it('should select panel on click', () => {
  const store = useBoxStore.getState();
  store.selectPanel('panel-uuid', false);
  expect(useBoxStore.getState().selectedPanelIds.has('panel-uuid')).toBe(true);
});

it('should add to selection on shift-click', () => {
  store.selectPanel('panel-1', false);  // First click
  store.selectPanel('panel-2', true);   // Shift-click
  expect(useBoxStore.getState().selectedPanelIds.size).toBe(2);
});
```

**Testing Strategy by Goal:**

| Goal | Approach |
|------|----------|
| Test panel clicks update store | Store unit test |
| Test selection enables operations | Integration test |
| Test 3D click event handling | E2E (Playwright) - NOT IMPLEMENTED |
| Test geometry after selection + operation | Integration geometry test |

**Key Insight:** Test selection at the **store level**, then test what happens when selections drive operations in **integration tests**. The 3D click event is a React Three Fiber implementation detail.

---

## Questions Answered

### Q: "Is there some difference in how preview is fed to the view in 2D vs 3D?"

**Answer:** No - both views use identical data paths through `useEnginePanels()`. The fillet bugs were caused by broken wiring in the engine layer, not view differences.

### Q: Lazy vs Eager Execution for TestFixture?

**Recommendation:** Eager execution with lazy chaining (the current approach).

### Q: Snapshot Testing?

**Recommendation:** Use for regression detection, not as primary tests. Explicit assertions with comments are better.

---

## Gap Analysis: Current vs Needed

### What We Test Well

- Operation lifecycle (start, update, cancel, apply)
- State transitions
- Preview creation/cleanup
- Multi-operation interference

### What We Don't Test Well

1. **UI-to-Engine integration**: We test preview exists, not that UI receives it
2. **Selection flow**: We don't test clicking triggers selection
3. **Operation chaining**: Testing on already-modified panels
4. **Preview validity**: We test preview exists, not geometry correctness

---

## Recommended Implementation

### Phase 1: Permutation Builders

Create `src/test/fixtures/permutations.ts`:

```typescript
export const PanelPermutations = {
  // Edge exposure
  enclosed: () => TestFixture.enclosedBox(100, 80, 60),
  oneOpen: () => TestFixture.basicBox(100, 80, 60),
  twoAdjacentOpen: () => TestFixture.basicBox(100, 80, 60)
    .withOpenFaces(['top', 'left']),
  allOpen: () => TestFixture.basicBox(100, 80, 60)
    .withOpenFaces(['top', 'bottom', 'left', 'right']),

  // Extensions
  withTopExtension: (base: TestFixtureBuilder) =>
    base.panel('front').withExtension('top', 20),
  withAllExtensions: (base: TestFixtureBuilder) =>
    base.panel('front')
      .withExtension('top', 20)
      .withExtension('bottom', 20)
      .withExtension('left', 20)
      .withExtension('right', 20),

  // Cutouts
  withCenterCutout: (base: TestFixtureBuilder) =>
    base.panel('front').withCutout(rect(20, 20, 0, 0)),
};
```

### Phase 2: Operation-Specific Tests

For each operation, test against key permutations:

```typescript
describe('Fillet on permutations', () => {
  it.each([
    ['enclosed box', PanelPermutations.enclosed(), 0],
    ['one open edge', PanelPermutations.oneOpen(), 0],
    ['two adjacent open', PanelPermutations.twoAdjacentOpen(), 1],
    ['all open', PanelPermutations.allOpen(), 4],
  ])('%s has %d eligible corners', (name, fixture, expected) => {
    const { panel } = fixture.panel('front').build();
    const eligible = panel.allCornerEligibility?.filter(c => c.eligible) ?? [];
    expect(eligible.length).toBe(expected);
  });
});
```

### Phase 3: Preview Correctness Tests

```typescript
it('fillet preview shows correct radius', () => {
  const { panel, engine } = TestFixture
    .basicBox(100, 80, 60)
    .withOpenFaces(['top', 'bottom', 'left', 'right'])
    .panel('front')
    .build();

  const corner = panel.allCornerEligibility?.find(c => c.eligible);
  const originalPoints = panel.outline.points.length;

  engine.startPreview();
  engine.dispatch({
    type: 'SET_ALL_CORNER_FILLET',
    targetId: 'main-assembly',
    payload: { panelId: panel.id, cornerId: corner!.id, radius: 10 },
  });

  const previewPanels = engine.generatePanelsFromNodes().panels;
  const previewPanel = previewPanels.find(p => p.id === panel.id);

  // Arc replaces corner point with multiple points
  expect(previewPanel!.outline.points.length).toBeGreaterThan(originalPoints);
});
```

---

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `src/test/fixtures/permutations.ts` | Panel state builders |
| `src/test/fixtures/operations/*.test.ts` | Per-operation integration tests |
| `docs/testing-strategy.md` | Document the approach |

---

## Success Criteria

- [ ] Every operation has integration tests verifying geometry changes
- [ ] Key permutations (extensions, cutouts, subdivisions) have test coverage
- [ ] Preview tests verify geometry is correct, not just "exists"
- [ ] No more "action handler missing" bugs

---

## Next Steps

1. Review this proposal and provide feedback
2. Create the permutation builders
3. Write fillet permutation tests as template
4. Extend to other operations
