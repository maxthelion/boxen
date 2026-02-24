# Consolidate Error/Warning Display Patterns

**Source:** AI Design error display work (2026-02-13)

## Problem

There are 4 different patterns for showing errors and warnings to users, with no shared component or consistent styling:

### 1. IneligibilityTooltip (viewport top-right overlay)
- **Location:** `src/components/IneligibilityTooltip.tsx`
- **Used by:** Viewport3D (hover-based warnings for ineligible operations)
- **Style:** Red-tinted overlay, positioned absolutely top-right, fades in, pointer-events: none
- **Lifecycle:** Visible only while hovering an ineligible item

### 2. Design Error Overlay (viewport top-right overlay)
- **Location:** Inline JSX in `src/components/Viewport3D.tsx`
- **Used by:** AI Design errors
- **Style:** Same visual as IneligibilityTooltip but with text wrapping, persists until next action
- **Lifecycle:** Visible while `designError` is set

### 3. Palette Hint (inline text in palettes)
- **Location:** `src/components/MovePalette.tsx` line 392
- **Used by:** Move operation errors
- **Style:** Uses `palette-hint` class (grey text, part of the palette layout)
- **Lifecycle:** Shown while the error condition exists

### 4. Palette Warning (inline styled div in palettes)
- **Location:** `src/components/SubdividePalette.tsx` line 720
- **Used by:** Subdivision modification warnings
- **Style:** Inline styles — orange background, orange border, orange text with warning emoji
- **Lifecycle:** Shown when modification warning is active

## Recommendation

Create a shared `ViewportMessage` component that handles all in-viewport messages:

```tsx
interface ViewportMessageProps {
  message: string | null;
  type: 'error' | 'warning' | 'info';
  persistent?: boolean;  // true = stays until cleared, false = hover-only
}
```

And a `PaletteMessage` for palette-embedded messages:

```tsx
interface PaletteMessageProps {
  message: string;
  type: 'error' | 'warning' | 'info';
}
```

Both would share color tokens:
- **error:** red tint (current IneligibilityTooltip style)
- **warning:** orange tint (current SubdividePalette style)
- **info:** blue tint (new)

## Scope

Small refactor — extract shared styles, create 1-2 components, update 4 call sites. Could be done in a single task.
