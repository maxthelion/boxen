Generate a Boxen assembly from a natural language description and output a share link URL.

**User request:** $ARGUMENTS

## Instructions

Run the design-box script with the user's description:

```bash
npx tsx --import ./scripts/register-lz-compat.mjs scripts/design-box.ts "$ARGUMENTS"
```

Show the resulting URL to the user. If it fails, show the error and try running with `--debug` to see the generated code:

```bash
npx tsx --import ./scripts/register-lz-compat.mjs scripts/design-box.ts --debug "$ARGUMENTS"
```

If the generated code has a bug, fix it manually in `scripts/.generated/design-box-output.ts` and re-run that file directly:

```bash
npx tsx --import ./scripts/register-lz-compat.mjs scripts/.generated/design-box-output.ts
```
