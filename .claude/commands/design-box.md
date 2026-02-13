Generate a Boxen assembly from a natural language description and output a share link URL.

**User request:** $ARGUMENTS

## Instructions

1. Read the AssemblyBuilder reference at `docs/llm-assembly-prompt.md`.
2. Based on the user's description, write a TypeScript script that uses the `AssemblyBuilder` API to construct the described assembly.
3. Save the script to a temporary file (e.g., `/tmp/boxen-design.ts`).
4. Run it:

```bash
npx tsx --import ./scripts/register-lz-compat.mjs scripts/build-assembly.ts /tmp/boxen-design.ts
```

5. If the script errors, fix the issue and retry.
6. Output the share link URL to the user.

## Script Template

The generated script MUST follow this structure:

```typescript
import { AssemblyBuilder } from '../src/builder';
import { rect, circle, polygon, lShape } from '../src/builder';
import { output } from '../scripts/build-assembly-helpers';

const builder = AssemblyBuilder.basicBox(width, height, depth);
// ... configuration ...
const { engine } = builder.build();
output(engine);
```

## Quick API Reference

**Entry points:**
- `AssemblyBuilder.basicBox(w, h, d)` — open-top box
- `AssemblyBuilder.enclosedBox(w, h, d)` — all faces solid

**Configuration (chainable):**
- `.withOpenFaces(['top', 'front'])` — set open faces
- `.withMaterial({ thickness: 6 })` — material config
- `.withFeet({ enabled: true, height: 15, width: 20, inset: 5 })` — feet
- `.withAxis('z')` — assembly axis

**Subdivisions:**
- `.subdivideEvenly('root', 'x', 3)` — 3 compartments along X
- `.grid('root', 3, 2)` — 3x2 grid (columns x rows)
- `.childVoid(0)` — access child void from last subdivision

**Panel operations:**
- `.panel('front').withExtension('top', 10).and()` — edge extension
- `.panel('front').withCutout(circle(50, 70, 10)).and()` — cutout
- `.panel('front').withFillet(['bottom:left', 'bottom:right'], 8).and()` — fillets

**Shapes:** `rect(x, y, w, h)`, `circle(cx, cy, r)`, `polygon([x,y], ...)`, `lShape(x, y, w, h, nw, nh)`

**Panel dimensions by face:**

| Face | Width = | Height = |
|------|---------|----------|
| front/back | box width | box height |
| left/right | box depth | box height |
| top/bottom | box width | box depth |

**Constraints:**
- Only open/female edges can be extended (not male edges)
- `basicBox` has top open by default — those adjacent edges become extensible
- Cutout coordinates are in panel-local space (origin bottom-left)
- Fillets: `'bottom:left'`, `'bottom:right'`, `'left:top'`, `'right:top'`
