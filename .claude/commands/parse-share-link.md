Parse a Boxen share link and display its contents.

Run the parse script with the user's input:

```bash
npx tsx --import ./scripts/register-lz-compat.mjs scripts/parse-share-link.ts "$ARGUMENTS"
```

Display the formatted output to the user. If debugging specific fields, use `--raw` for full JSON:

```bash
npx tsx --import ./scripts/register-lz-compat.mjs scripts/parse-share-link.ts --raw "$ARGUMENTS"
```

The input can be a full URL (e.g. `http://localhost:5173/?p=...`), a partial URL with `?p=`, or just the compressed string.
