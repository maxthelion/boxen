# Assembly Builder Reference

This document teaches you how to use the Boxen `AssemblyBuilder` fluent API to generate laser-cut box assemblies from natural language descriptions.

## Conceptual Model

### Assembly

An assembly is a box with 6 faces (front, back, left, right, top, bottom) and configurable dimensions (width × height × depth in mm). Each face can be **solid** (has a panel) or **open** (no panel).

### Assembly Axis

The assembly axis (`'x'`, `'y'`, or `'z'`, default `'y'`) determines which pair of faces are the "lids" (the panels that sit inside the side walls). By default the Y axis means top/bottom are lids. Changing to `'z'` makes front/back the lids, etc.

### Voids

The interior of a box is a "void" — the empty space inside. Voids can be **subdivided** with divider panels to create compartments. Subdivision creates child voids. Child voids can be further subdivided.

### Panels

Panels are the physical laser-cut pieces. They have:
- An **outline** (the cut path, including finger joint patterns)
- **Holes** (slots for mating finger joints, cutouts)
- A 3D **transform** (position and rotation in the assembly)

### Finger Joints

Adjacent panels connect via finger joints. The system automatically determines:
- **Male** (tabs out) vs **female** (slots) based on wall priority
- Wall priority: front(1) < back(2) < left(3) < right(4) < top(5) < bottom(6)
- Lower priority = male = occupies corners

### Edge Operations

Panel edges can be modified:
- **Extensions**: Extend an edge outward (for feet, handles, lips)
- **Cutouts**: Cut holes in a panel (for finger pulls, ventilation)
- **Fillets**: Round the corners of a panel

Only **open** or **female** edges can be extended (not male edges that have tabs).

### Material

All panels share the same material config:
- `thickness`: Material thickness in mm (default 3)
- `fingerWidth`: Width of finger joint tabs in mm (default 10)
- `fingerGap`: Gap multiplier for corner gaps (default 1.5)

## API Reference

### Entry Points

```typescript
import { AssemblyBuilder } from '../src/builder';
import { rect, circle, polygon, lShape } from '../src/builder';

// Open-top box (top face removed) — most common
AssemblyBuilder.basicBox(width, height, depth)

// Fully enclosed box (all 6 faces solid)
AssemblyBuilder.enclosedBox(width, height, depth)

// With custom material
AssemblyBuilder.basicBox(width, height, depth, {
  thickness: 6,
  fingerWidth: 12,
  fingerGap: 1.5,
})
```

### Configuration Methods

All return `this` for chaining.

```typescript
.withOpenFaces(['top', 'front'])     // Set which faces are open
.withDimensions({ width: 200 })      // Partial dimension update
.withMaterial({ thickness: 6 })      // Partial material update
.withAxis('z')                       // Set assembly axis
.withFeet({ enabled: true, height: 15, width: 20, inset: 0 })
.withLid('positive', { tabDirection: 'tabs-in', inset: 0 })
```

### Subdivision Methods

```typescript
// Evenly split a void into N compartments along an axis
.subdivideEvenly('root', 'x', 3)   // 3 compartments along X (2 dividers)

// Grid subdivision (multi-axis, creates crossing dividers)
.grid('root', 2, 3)                // 2 columns (X) × 3 rows (Z)

// Single subdivision at a specific position
.subdivide('root', 'x', 50)        // One divider at X=50

// Access child voids from the most recent subdivision
.childVoid(0)                       // First child void ID
.childVoid(1)                       // Second child void ID
```

**Void selectors:** The first argument is either `'root'` (the main interior) or a function `(builder) => voidId` that returns a void ID. Use `builder.childVoid(index)` to target child voids from a previous subdivision.

**Subdividing child voids:**
```typescript
const builder = AssemblyBuilder.basicBox(200, 100, 150)
  .subdivideEvenly('root', 'x', 2);  // Split into left/right

const leftVoid = builder.childVoid(0);
builder.subdivideEvenly((b) => leftVoid, 'z', 3);  // Split left half into 3 rows
```

### Panel Operations

Select a panel, apply operations, then return to the builder with `.and()`.

```typescript
.panel('front')                      // Select front panel
  .withExtension('bottom', 15)       // Extend bottom edge by 15mm (feet)
  .withExtensions(['left', 'right'], 20) // Extend both sides by 20mm
  .withCutout(rect(40, 30, 20, 15))  // Cut a rectangular hole
  .withCutout(circle(50, 40, 8))     // Cut a circular hole
  .withFillet(['bottom:left', 'bottom:right'], 5) // Round bottom corners
  .and()                             // Return to builder
```

**Edge IDs:** `'top'`, `'bottom'`, `'left'`, `'right'`

**Corner keys:** `'bottom:left'`, `'bottom:right'`, `'left:top'`, `'right:top'`

**Important — extension eligibility and lid tab direction:**

Extensions only work on **open** or **female** edges. Male edges (edges with finger joint tabs) cannot be extended.

**Lid panels (top/bottom on Y axis) default to `tabs-out` (male), which means their edges CANNOT be extended.** To make a lid panel's edges extensible, you must change its tab direction to `tabs-in` (female) first:

```typescript
// Bottom panel defaults to tabs-out (male) — extensions will silently fail
AssemblyBuilder.basicBox(60, 100, 60)
  .panel('bottom').withExtension('left', 10).and()  // ❌ Silently skipped — bottom edges are male

// Fix: set bottom lid to tabs-in BEFORE applying extensions
AssemblyBuilder.basicBox(60, 100, 60)
  .withLid('negative', { tabDirection: 'tabs-in' })  // bottom becomes female
  .panel('bottom').withExtension('left', 10).and()    // ✅ Works — bottom edges are now female
```

**Lid sides by axis:**
- Y axis (default): `'positive'` = top, `'negative'` = bottom
- Z axis: `'positive'` = front, `'negative'` = back
- X axis: `'positive'` = right, `'negative'` = left

**Side walls (front, back, left, right on Y axis) are NOT lids** — their edge gender is determined by wall priority and can't be changed with `withLid`. Side wall edges adjacent to an open face are always extensible.

### Shape Helpers

For cutouts, create shapes positioned relative to the panel's 2D coordinate system (origin at bottom-left, X goes right, Y goes up):

```typescript
rect(x, y, width, height)           // Rectangle
circle(cx, cy, radius, segments?)   // Circle (default 16 segments)
polygon([x1,y1], [x2,y2], ...)      // Arbitrary polygon from [x,y] pairs
lShape(x, y, w, h, notchW, notchH)  // L-shape (rect with top-right notch)
```

Panel dimensions for positioning cutouts:
- Width is along the panel's horizontal axis
- Height is along the panel's vertical axis
- For face panels, check which assembly dimension maps to which panel axis based on the face

### Build

```typescript
const { engine, panels } = builder.build();
```

Returns the configured `Engine` instance and all generated `PanelPath` objects.

## Dimension Mapping

Understanding which assembly dimension maps to which panel dimension:

| Face | Panel Width | Panel Height |
|------|------------|--------------|
| front/back | assembly width | assembly height |
| left/right | assembly depth | assembly height |
| top/bottom | assembly width | assembly depth |

Cutout coordinates are in the panel's local 2D space. For example, to place a cutout centered on the front panel of a 200×100×80 box:
- Panel is 200 wide × 100 tall
- Center is at (100, 50)

## Edge Gender and Extensibility Rules

Understanding edge gender is critical — it determines which edges can be extended, filleted, or left straight.

### Wall Priority

Each face has a priority. When two faces meet at an edge, the lower-priority face is **male** (tabs out) and the higher-priority face is **female** (receives slots).

| Face | Priority | Role at edges |
|------|----------|---------------|
| front | 1 | Male to all adjacent faces |
| back | 2 | Male to left, right, top, bottom; female to front |
| left | 3 | Male to top, bottom; female to front, back |
| right | 4 | Male to top, bottom; female to front, back |
| top | 5 (lid) | Female to all side walls |
| bottom | 6 (lid) | Female to all side walls |

### Edge Gender by Face (Y axis, default)

For each face, every edge is either **male**, **female**, or **open** (adjacent face removed):

| Face | Top Edge | Bottom Edge | Left Edge | Right Edge |
|------|----------|-------------|-----------|------------|
| front | male (or open if top removed) | male (or open if bottom removed) | male | male |
| back | male (or open if top removed) | male (or open if bottom removed) | male | male |
| left | male (or open if top removed) | male (or open if bottom removed) | female (meets front) | female (meets back) |
| right | male (or open if top removed) | male (or open if bottom removed) | female (meets front) | female (meets back) |
| top (lid) | female | female | female | female |
| bottom (lid) | female | female | female | female |

**BUT: Lid tab direction overrides this.** Top and bottom are lids. With the default `tabDirection: 'tabs-out'`, their edges become **male** instead of female. See the override table below.

### Lid Tab Direction Override

Lids (top/bottom on Y axis) have a configurable `tabDirection`:
- `'tabs-out'` (DEFAULT) → lid edges are **male** → NOT extensible
- `'tabs-in'` → lid edges are **female** → extensible

| Lid | Default tabDirection | Default edge gender | Extensible? |
|-----|---------------------|-------------------|-------------|
| top | tabs-out | male | NO |
| bottom | tabs-out | male | NO |
| top (with tabs-in) | tabs-in | female | YES |
| bottom (with tabs-in) | tabs-in | female | YES |

### Extension Eligibility Summary

An edge can be extended ONLY if it is **open** or **female**:

| Edge state | Can extend? | How to achieve |
|-----------|-------------|----------------|
| Open (adjacent face removed) | YES | `.withOpenFaces(['top'])` makes top-adjacent edges open |
| Female | YES | Side wall edges meeting lower-priority walls, or lid with `tabs-in` |
| Male (tabs-out) | NO | Default for front/back edges and lids with `tabs-out` |

### Practical Recipes

**Extend a side wall's top edge (e.g., lip/rim):**
```typescript
.withOpenFaces(['top'])  // Makes top-adjacent edges open
.panel('front').withExtension('top', 10).and()  // ✅ Works — top edge is now open
```

**Extend the bottom panel (e.g., base plate wider than box):**
```typescript
.withLid('negative', { tabDirection: 'tabs-in' })  // REQUIRED — makes bottom female
.panel('bottom').withExtension('left', 10).and()    // ✅ Works
```

**Extend an enclosed box's top panel:**
```typescript
.withLid('positive', { tabDirection: 'tabs-in' })  // REQUIRED — makes top female
.panel('top').withExtension('left', 10).and()       // ✅ Works
```

**Extend front panel's left/right edges:**
Front is priority 1 (lowest), so its left and right edges are **male** where they meet left/right panels. These CANNOT be extended. To get a wider front panel, you would need to remove the adjacent face:
```typescript
.withOpenFaces(['top', 'left'])  // Left edge of front is now open
.panel('front').withExtension('left', 10).and()  // ✅ Works — left edge is open
```

### Fillet Eligibility

A corner can be filleted ONLY if **both** edges meeting at that corner are open or female. If either edge is male, the corner cannot be filleted.

| Corner | Edges involved | Filleable on basicBox (top open)? |
|--------|---------------|----------------------------------|
| front `bottom:left` | bottom (male) + left (male) | NO — both male |
| front `bottom:right` | bottom (male) + right (male) | NO — both male |
| front `left:top` | left (male) + top (open) | NO — left is male |
| front `right:top` | right (male) + top (open) | NO — right is male |
| left `bottom:left` | bottom (male) + left (female) | NO — bottom is male |
| left `left:top` | left (female) + top (open) | YES — both non-male |

**To fillet the bottom panel's corners**, the bottom must have female edges:
```typescript
.withLid('negative', { tabDirection: 'tabs-in' })
.panel('bottom')
  .withFillet(['bottom:left', 'bottom:right', 'top:left', 'top:right'], 5)
  .and()
```

**To fillet a side wall's corners**, the adjacent edges must be open:
```typescript
.withOpenFaces(['top', 'bottom', 'left', 'right'])  // All adjacent edges become open
.panel('front')
  .withFillet(['bottom:left', 'bottom:right', 'left:top', 'right:top'], 8)
  .and()
```

## General Geometry Constraints

1. **All paths are axis-aligned** — horizontal and vertical segments only, no diagonals
2. **No overlapping material** — panels must not occupy the same physical space
3. **Cutouts must be inside the panel** — the hole path must be strictly within the outline
4. **Material thickness** affects joint geometry — typical values are 3mm (craft plywood) or 6mm (structural plywood)
5. **Corner ownership** — when two adjacent panels both extend the same edge, the female panel yields by one material thickness to avoid overlap

## Examples

### 1. Simple Open-Top Box

> "a simple open-top box, 150×100×80"

```typescript
import { AssemblyBuilder } from '../src/builder';
import { output } from '../scripts/build-assembly-helpers';

const { engine } = AssemblyBuilder.basicBox(150, 100, 80).build();
output(engine);
```

### 2. Enclosed Box with Thick Material

> "an enclosed box, 200×150×100, 6mm plywood"

```typescript
import { AssemblyBuilder } from '../src/builder';
import { output } from '../scripts/build-assembly-helpers';

const { engine } = AssemblyBuilder.enclosedBox(200, 150, 100, {
  thickness: 6,
  fingerWidth: 15,
  fingerGap: 1.5,
}).build();
output(engine);
```

### 3. Organizer with Grid Compartments

> "organizer with 3×2 grid, 200×50×150"

```typescript
import { AssemblyBuilder } from '../src/builder';
import { output } from '../scripts/build-assembly-helpers';

const { engine } = AssemblyBuilder.basicBox(200, 50, 150)
  .grid('root', 3, 2)   // 3 columns (X) × 2 rows (Z)
  .build();
output(engine);
```

### 4. Box with Feet

> "box with feet, 150×100×80"

```typescript
import { AssemblyBuilder } from '../src/builder';
import { output } from '../scripts/build-assembly-helpers';

const { engine } = AssemblyBuilder.basicBox(150, 100, 80)
  .withFeet({ enabled: true, height: 15, width: 20, inset: 5 })
  .build();
output(engine);
```

### 5. Box with Finger-Pull Cutout

> "box with finger-pull cutout on front, 100×80×60"

The front panel of a 100×80×60 box is 100 wide × 80 tall. A finger-pull cutout is a semicircular or rectangular notch near the top edge, centered horizontally.

```typescript
import { AssemblyBuilder } from '../src/builder';
import { circle } from '../src/builder';
import { output } from '../scripts/build-assembly-helpers';

const { engine } = AssemblyBuilder.basicBox(100, 80, 60)
  .panel('front')
    .withCutout(circle(50, 70, 10))  // Circle near top center
    .and()
  .build();
output(engine);
```

### 6. Compartmentalized Box with Uneven Splits

> "box 300×100×200, split into 2 along width, left half split into 3 rows"

```typescript
import { AssemblyBuilder } from '../src/builder';
import { output } from '../scripts/build-assembly-helpers';

const builder = AssemblyBuilder.basicBox(300, 100, 200)
  .subdivideEvenly('root', 'x', 2);  // Split into left/right

const leftVoid = builder.childVoid(0);
builder.subdivideEvenly(() => leftVoid, 'z', 3);  // Left half → 3 rows

const { engine } = builder.build();
output(engine);
```

### 7. Box with Edge Extensions (Handles/Lips)

> "enclosed box with lip extensions on top, 200×100×150"

The top panel of a 200×100×150 box is 200 wide × 150 deep. To add a lip, extend the edges of panels adjacent to the open top.

```typescript
import { AssemblyBuilder } from '../src/builder';
import { output } from '../scripts/build-assembly-helpers';

const { engine } = AssemblyBuilder.enclosedBox(200, 100, 150)
  .withOpenFaces(['top'])
  .panel('front')
    .withExtension('top', 10)  // 10mm lip above front panel
    .and()
  .panel('back')
    .withExtension('top', 10)
    .and()
  .panel('left')
    .withExtension('top', 10)
    .and()
  .panel('right')
    .withExtension('top', 10)
    .and()
  .build();
output(engine);
```

### 8. Rounded-Corner Tray

> "shallow tray with rounded corners, 250×40×180"

```typescript
import { AssemblyBuilder } from '../src/builder';
import { output } from '../scripts/build-assembly-helpers';

const { engine } = AssemblyBuilder.basicBox(250, 40, 180)
  .panel('front')
    .withFillet(['bottom:left', 'bottom:right'], 8)
    .and()
  .panel('back')
    .withFillet(['bottom:left', 'bottom:right'], 8)
    .and()
  .panel('left')
    .withFillet(['bottom:left', 'bottom:right'], 8)
    .and()
  .panel('right')
    .withFillet(['bottom:left', 'bottom:right'], 8)
    .and()
  .build();
output(engine);
```

## Common Patterns

### Feet
Use `.withFeet()` for built-in foot extensions on the bottom-adjacent panels:
```typescript
.withFeet({ enabled: true, height: 15, width: 20, inset: 5 })
```

### Finger Pull
A cutout near the top of the front panel:
```typescript
.panel('front')
  .withCutout(circle(panelWidth/2, panelHeight - 10, 10))
  .and()
```

### Lip/Rim
Open the top face, then extend the top edges of all 4 walls:
```typescript
.withOpenFaces(['top'])
.panel('front').withExtension('top', 10).and()
.panel('back').withExtension('top', 10).and()
.panel('left').withExtension('top', 10).and()
.panel('right').withExtension('top', 10).and()
```

### Grid Organizer
```typescript
.grid('root', columns, rows)
```

### Sequential Subdivisions (Nested Compartments)
```typescript
const builder = AssemblyBuilder.basicBox(w, h, d)
  .subdivideEvenly('root', 'x', 2);
const left = builder.childVoid(0);
const right = builder.childVoid(1);
builder.subdivideEvenly(() => left, 'z', 3);
builder.subdivideEvenly(() => right, 'z', 2);
```

## Script Template

Every generated script must follow this exact structure:

```typescript
import { AssemblyBuilder } from '../src/builder';
import { rect, circle, polygon, lShape } from '../src/builder';
import { output } from '../scripts/build-assembly-helpers';

// Build the assembly
const builder = AssemblyBuilder.basicBox(width, height, depth);
// ... configuration, subdivisions, panel operations ...

const { engine } = builder.build();
output(engine);
```

The `output()` function serializes the engine state and prints the share link URL to stdout.
