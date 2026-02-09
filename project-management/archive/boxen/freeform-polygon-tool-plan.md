# Freeform Polygon Tool Flow Simplification

## Problem

The freeform polygon tool currently has **two sequential palettes**:

1. **First palette** (during drawing): Shows point count and "Close Path" button
2. **Second palette** (after closing): Shows "Cut notch" / "Extend" toggle and "Apply" button

The first palette is unnecessary - the second palette (boolean mode selection) can be shown from the start.

---

## Goal

Make freeform polygon drawing more direct and provide better visual feedback:
- Show boolean palette **immediately** when drawing starts
- **Live preview** the cut/addition as the shape is being drawn
- Show **ghost line** from last point to cursor
- **Implicit close**: clicking near first point OR clicking "Apply" closes and applies

---

## Proposed Changes

### 1. Show Boolean Palette from Start

When user starts a freeform polygon (clicks in open/safe space):
- Immediately show the boolean palette with "Cut notch" / "Extend" toggle
- Default to "Cut notch" (subtractive mode)
- Keep "Apply" and "Cancel" buttons

### 2. Live Preview of Boolean Operation

As the user draws points:
- Compute the polygon formed by current points (auto-closed to first point)
- Apply boolean operation (union or difference) to panel outline
- Show the result as a preview in the 2D view
- Update preview in real-time as points are added or mode is toggled

### 3. Ghost Line to Cursor

During drawing (applies to both freeform polygons and edge paths):
- Show a dashed/semi-transparent line from last point to cursor position
- When Shift is held, snap line to 45°/90° angles
- Helps user see what the next segment will look like

### 4. Implicit Close

The polygon closes automatically when:
- User clicks near the first point (existing behavior), OR
- User clicks "Apply" (closes polygon and applies operation)

No explicit "Close Path" step needed.

### 5. Edge Path: Keep Palette, Add Ghost Line

Edge path tool keeps its current palette behavior, but also gets the ghost line preview:
- Show dashed line from last point to cursor position
- Line follows the edge's perpendicular offset coordinate system

---

## Implementation Details

### State Changes

```typescript
// Current: pendingPolygon is set AFTER closing
const [pendingPolygon, setPendingPolygon] = useState<{
  points: PathPoint[];
  mode: 'additive' | 'subtractive';
} | null>(null);

// New: Track mode during drawing (part of draft state or separate)
const [polygonMode, setPolygonMode] = useState<'additive' | 'subtractive'>('subtractive');
```

### Palette Logic

```typescript
// OLD: Show during active draft
{activeTool === 'path' && isPathDraftActive && ...}  // First palette
{pendingPolygon && ...}  // Second palette

// NEW: For freeform polygon, show mode palette during draft
{activeTool === 'path' && isPolygonDraft && (
  <FloatingPalette title="Polygon">
    <PaletteToggleGroup
      options={[
        { value: 'subtractive', label: 'Cut notch' },
        { value: 'additive', label: 'Extend' },
      ]}
      value={polygonMode}
      onChange={setPolygonMode}
    />
    <div>Points: {draftPoints.length}</div>
    <PaletteButtonRow>
      <PaletteButton variant="primary" onClick={handleApply} disabled={draftPoints.length < 3}>
        Apply
      </PaletteButton>
      <PaletteButton onClick={handleCancel}>Cancel</PaletteButton>
    </PaletteButtonRow>
  </FloatingPalette>
)}

// Edge path keeps existing palette
{activeTool === 'path' && isEdgePathDraft && (
  // ... existing edge path palette
)}
```

### Live Preview Rendering

In the SVG rendering section, when `isPolygonDraft`:

```tsx
{/* Live preview of boolean result */}
{isPolygonDraft && draftPoints.length >= 3 && (
  <path
    d={computePreviewPath(draftPoints, panel, polygonMode)}
    fill={polygonMode === 'subtractive' ? 'rgba(255,0,0,0.2)' : 'rgba(0,255,0,0.2)'}
    stroke={polygonMode === 'subtractive' ? 'red' : 'green'}
    strokeWidth={1}
  />
)}

{/* Ghost line from last point to cursor (both polygon and edge path) */}
{isPathDraftActive && draftPoints.length > 0 && cursorPosition && (
  <line
    x1={draftPoints[draftPoints.length - 1].x}
    y1={draftPoints[draftPoints.length - 1].y}
    x2={cursorPosition.x}
    y2={cursorPosition.y}
    stroke="rgba(255,255,255,0.5)"
    strokeWidth={1}
    strokeDasharray="4,4"
  />
)}
```

### Apply Handler

```typescript
const handleApply = useCallback(() => {
  if (draftPoints.length < 3) return;

  // Use draftPoints directly (already closed conceptually)
  const points = [...draftPoints];

  // Apply the operation (same logic as current pendingPolygon apply)
  const halfW = panel.width / 2;
  const halfH = panel.height / 2;
  const panelOutline = createRectPolygon(-halfW, -halfH, halfW, halfH);
  const classification = classifyPolygon(points, panelOutline, 1.0);

  // ... dispatch appropriate engine action based on classification and mode

  cancelDraft();
  setActiveTool('select');
}, [draftPoints, panel, polygonMode, cancelDraft, setActiveTool]);
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/SketchView2D.tsx` | Update palette rendering, add live preview, add ghost line, update apply logic |

---

## Verification

1. **New freeform polygon flow**:
   - Select path tool
   - Click in open/safe space → palette appears immediately with mode toggle
   - Add points → live preview shows cut/extend result
   - Ghost line follows cursor
   - Toggle mode → preview updates
   - Click near start OR click Apply → operation is applied

2. **Edge path with ghost line**:
   - Click on edge → existing palette appears
   - Add points → ghost line follows cursor
   - Click Apply or merge back to edge → path commits

3. **Escape cancels** at any point

4. **Shift constrains angles** as before

---

## Processing Summary (automated)

**Processed:** 2026-02-09
**Agent:** draft-processor
**Age at processing:** 5 days

**Actions taken:**
- Archived to project-management/archive/boxen/
- Proposed 1 task (see proposed-tasks/freeform-polygon-tool-plan.md)
