Generate a Boxen share link with pre-applied state.

If the user provides a preset name, run:

```bash
npx tsx --import ./scripts/register-lz-compat.mjs scripts/generate-share-link.ts $ARGUMENTS
```

Available presets: `basic`, `subdivided-x`, `subdivided-z`, `grid-2x2`, `grid-3x3`

If the user describes a box configuration in natural language, translate it into a JSON spec and run:

```bash
npx tsx --import ./scripts/register-lz-compat.mjs scripts/generate-share-link.ts --json '<json>'
```

## JSON Spec Format

```json
{
  "width": 100, "height": 80, "depth": 60,
  "materialThickness": 3, "fingerWidth": 10, "fingerGap": 1.5,
  "faces": { "top": false },
  "actions": [
    { "type": "ADD_SUBDIVISIONS", "targetId": "main-assembly",
      "payload": { "voidId": "root", "axis": "x", "positions": [50] } }
  ]
}
```

## Common Action Types

| Action | Payload |
|--------|---------|
| `ADD_SUBDIVISIONS` | `{ voidId, axis, positions: number[] }` |
| `ADD_GRID_SUBDIVISION` | `{ voidId, axes: [{ axis, positions: number[] }] }` |
| `SET_FACE_SOLID` | `{ faceId, solid: boolean }` |
| `SET_DIMENSIONS` | `{ width?, height?, depth? }` |
| `SET_EDGE_EXTENSION` | `{ panelId, edge, value }` |
| `SET_CORNER_FILLET` | `{ panelId, corner, radius }` |

All actions require `targetId: "main-assembly"`.

## Options

- `--base-url URL` — Override base URL (default: `http://localhost:5173`, or `BOXEN_URL` env var)
