# Local Environment Configuration

**Source:** Removed from CLAUDE.md during audit (2026-02-07). Saved here for reference.

A `.env.local` file in the project root provides per-directory customization. This file is git-ignored so each developer/directory can have unique settings.

At the start of each session, check if `.env.local` exists. If it doesn't, create it with the default template:
```bash
# Local environment configuration (git-ignored)
# This file allows per-directory customization of the dev environment

# Background color for the app - helps visually identify which directory this instance is running from
# Use any valid CSS color value (hex, rgb, hsl, named colors)
VITE_BACKGROUND_COLOR=#0f0f1a
```

## Available Variables

| Variable | Description | Default (in CSS) |
|----------|-------------|------------------|
| `VITE_BACKGROUND_COLOR` | App background color (any CSS color value) | `#0f0f1a` |

## Behavior

- If `.env.local` is missing, the app uses the CSS default (`#0f0f1a`)
- The background color helps visually identify which directory/instance the dev server was launched from
- Edit `.env.local` to set a distinctive color (e.g., `#1a0f1a` for purple tint, `#0f1a0f` for green tint)
- Restart the dev server after changing `.env.local` for changes to take effect

## Example Custom Colors

```bash
VITE_BACKGROUND_COLOR=#1a0f1a   # Purple tint
VITE_BACKGROUND_COLOR=#0f1a0f   # Green tint
VITE_BACKGROUND_COLOR=#1a1a0f   # Gold tint
VITE_BACKGROUND_COLOR=#0f1a1a   # Cyan tint
```
