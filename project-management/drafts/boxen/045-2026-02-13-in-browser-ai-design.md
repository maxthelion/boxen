# In-Browser AI Design Feature

**Status:** Draft
**Created:** 2026-02-13

## Context

The `/design-box` CLI command generates assemblies from natural language via OpenAI. It works well but is developer-only (requires CLI, local API key). This feature adds an in-browser "AI Design" button so end users can describe a box and get a 3D preview — no CLI needed.

The app is already deployed to Cloudflare Pages, so we can add a Pages Function as an OpenAI API proxy.

## Architecture Overview

```
User types description → Browser POST /api/design → CF Pages Function → OpenAI → JSON recipe
                                                                                      ↓
Browser ← interprets recipe via AssemblyBuilder ← JSON recipe response
```

**Key decision: JSON recipe, not TypeScript code.** The CLI currently generates TypeScript that gets executed via `npx tsx`. In-browser, we can't safely eval TypeScript. Instead, the LLM returns a structured JSON recipe that a browser-side interpreter drives through AssemblyBuilder calls. This is safer and more portable.

## Implementation Steps

### Step 1: JSON Recipe Schema and Interpreter (`src/builder/recipe.ts`)

Define a JSON schema the LLM outputs, and an interpreter that converts it to AssemblyBuilder calls.

```typescript
interface AssemblyRecipe {
  type: 'basicBox' | 'enclosedBox';
  width: number;
  height: number;
  depth: number;
  openFaces?: string[];           // e.g. ['top', 'front']
  material?: { thickness?: number; fingerWidth?: number; fingerGap?: number };
  feet?: { height: number; width: number; inset: number };
  lid?: { face: 'positive' | 'negative'; tabDirection: 'tabs-in' | 'tabs-out' };
  axis?: 'x' | 'y' | 'z';
  subdivisions?: SubdivisionStep[];
  panels?: PanelStep[];
}

interface SubdivisionStep {
  type: 'grid' | 'subdivideEvenly';
  void: string;                   // 'root' or 'child:0', 'child:1', etc.
  axis?: 'x' | 'z';
  columns?: number;
  rows?: number;
  count?: number;
}

interface PanelStep {
  face: string;
  extensions?: Record<string, number>;  // { top: 10, bottom: 10 }
  cutouts?: CutoutShape[];
  fillets?: { corners: string[]; radius: number }[];
}
```

The interpreter function:
```typescript
function executeRecipe(recipe: AssemblyRecipe): { engine: Engine }
```

This calls `AssemblyBuilder.basicBox()`, chains `.withOpenFaces()`, `.grid()`, `.panel().withExtension()`, etc., then returns the built engine.

### Step 2: CF Pages Function (`functions/api/design.ts`)

Thin proxy that:
1. Reads `OPENAI_API_KEY` from CF environment (set via `wrangler secret put`)
2. Loads a system prompt (embedded in the function or fetched)
3. Forwards the user description to OpenAI with instructions to return a JSON recipe
4. Returns the JSON recipe to the browser

```typescript
// functions/api/design.ts
export const onRequestPost: PagesFunction<{ OPENAI_API_KEY: string }> = async (context) => {
  const { prompt } = await context.request.json();
  // ... call OpenAI, return JSON recipe ...
};
```

**System prompt adaptation:** The existing `docs/llm-assembly-prompt.md` teaches TypeScript output. We'll create a variant that teaches JSON recipe output instead. The domain knowledge (dimensions, faces, edge rules, etc.) stays the same — only the output format section changes.

**Local dev:** Add a Vite proxy to forward `/api/design` to the local function during `npm run dev`. No wrangler needed locally.

### Step 3: Store Slice (`src/store/slices/designSlice.ts`)

Minimal state for the AI design panel:

```typescript
interface DesignSlice {
  designPanelOpen: boolean;
  designPrompt: string;
  designLoading: boolean;
  designError: string | null;
  openDesignPanel: () => void;
  closeDesignPanel: () => void;
  setDesignPrompt: (prompt: string) => void;
  submitDesign: () => Promise<void>;  // calls API, interprets recipe, updates engine
}
```

`submitDesign()` flow:
1. POST prompt to `/api/design`
2. Parse JSON recipe response
3. Call `executeRecipe(recipe)` to get an engine
4. Reset the current engine, sync the new state to store (same pattern as `handleLoadProject` in App.tsx)
5. Update URL with `saveToUrl()`

### Step 4: UI Component (`src/components/DesignPromptPanel.tsx`)

A panel that appears at the bottom of the viewport when the AI Design button is active:

```
┌─────────────────────────────────────────────┐
│  [Boxen header with AI Design button]       │
├──────┬──────────────────────────────────────┤
│      │                                      │
│ side │        3D Viewport (shrinks)         │
│ bar  │                                      │
│      │                                      │
│      ├──────────────────────────────────────┤
│      │ Describe your box...   [Preview] [Done] [Cancel] │
│      └──────────────────────────────────────┘
```

- **Textarea** with placeholder "Describe your box..."
- **Preview** button: sends prompt, replaces current assembly with result. Can be pressed again to iterate.
- **Done** button: closes the panel, keeps the current assembly for manual editing
- **Cancel** button: closes the panel, reverts to the assembly that was loaded before the panel opened
- Loading spinner on the textarea/button while waiting for API response
- Error display inline if API call fails

### Step 5: Layout Changes (`src/App.tsx` + `src/App.css`)

The viewport section in App.tsx currently renders either `<Viewport3D>` or `<SketchView2D>`. When `designPanelOpen` is true, wrap the viewport in a flex column:

```tsx
<section className="viewport">
  <div className={`viewport-main ${designPanelOpen ? 'with-design-panel' : ''}`}>
    {viewMode === '3d' ? <Viewport3D /> : <SketchView2D />}
  </div>
  {designPanelOpen && <DesignPromptPanel />}
</section>
```

CSS:
```css
.viewport { display: flex; flex-direction: column; }
.viewport-main { flex: 1; min-height: 0; }
.design-prompt-panel { height: 120px; /* fixed height */ }
```

### Step 6: Header Button (`src/App.tsx`)

Add an "AI Design" button in the header menu (between Templates and Open):

```tsx
<button className="header-btn secondary" onClick={openDesignPanel}>
  <span className="header-btn-icon">✨</span>
  AI Design
</button>
```

## Files to Create

| File | Purpose |
|------|---------|
| `src/builder/recipe.ts` | JSON recipe schema + interpreter |
| `functions/api/design.ts` | CF Pages Function (OpenAI proxy) |
| `src/store/slices/designSlice.ts` | UI state for design panel |
| `src/components/DesignPromptPanel.tsx` | Prompt panel component |

## Files to Modify

| File | Change |
|------|--------|
| `src/App.tsx` | Add AI Design button, wrap viewport with design panel |
| `src/App.css` | Flex layout for viewport + design panel |
| `src/store/useBoxStore.ts` | Add designSlice |
| `vite.config.ts` | Add dev proxy for `/api/design` |
| `docs/llm-assembly-prompt.md` | Add JSON recipe output format section |

## Local Dev Strategy

Add a Vite dev server proxy so `/api/design` works locally without wrangler:

```typescript
// vite.config.ts
server: {
  proxy: {
    '/api/design': {
      target: 'https://api.openai.com/v1/chat/completions',
      changeOrigin: true,
      // Or: run wrangler pages dev alongside vite
    }
  }
}
```

Alternative: add a simple local middleware in vite.config.ts that reads `.env` and proxies to OpenAI directly. This avoids needing wrangler locally at all.

## Safety & Abuse Mitigation

### Prompt Injection

The JSON recipe approach is inherently safe against prompt injection:
- The LLM response is parsed with `JSON.parse()` — no `eval()`, no dynamic code execution
- The interpreter only recognizes a fixed set of known fields (`type`, `width`, `openFaces`, etc.)
- Unknown fields are ignored (or cause validation failure)
- The interpreter only calls AssemblyBuilder methods with typed parameters — no file access, no network calls, no DOM manipulation
- **Worst case**: attacker tricks the LLM into returning a weird box shape. That's fine.

**Validation**: Before interpreting, validate the recipe against the schema:
- Reject unknown top-level fields
- Type-check all values (numbers are numbers, strings are from allowed sets)
- Use a simple validation function, not a schema library (keep it lightweight)

### Resource Exhaustion (million dividers)

The recipe interpreter enforces hard limits before calling AssemblyBuilder:

| Parameter | Max Value | Rationale |
|-----------|-----------|-----------|
| Dimensions (w/h/d) | 2000mm | Larger is unreasonable for laser cutting |
| Grid columns/rows | 20 each (400 cells max) | Browser would struggle rendering 400+ panels |
| Total subdivisions | 50 | Prevents deeply nested or excessive dividers |
| Extensions | 200mm | Beyond this is clearly nonsensical |
| Fillet radius | 100mm | Capped by panel dimensions anyway |
| Number of cutouts per panel | 20 | Plenty for real use cases |
| Number of panel operations | 50 total | Prevents recipe bombs |

If any limit is exceeded, `executeRecipe()` throws a user-friendly error (e.g., "Grid too large — maximum 20x20 compartments").

### API Key / Cost Abuse

The CF Pages Function is a public endpoint. Without protection, someone could automate requests and burn through the OpenAI API budget.

**Mitigations (in the CF function):**
1. **Prompt length cap**: Reject requests with `prompt.length > 2000` characters
2. **Rate limiting**: Use CF's built-in rate limiting or a simple in-memory counter (10 requests per IP per minute)
3. **Response size cap**: If OpenAI returns > 50KB, truncate/reject (normal recipes are ~1KB)
4. **Low temperature**: Keep `temperature: 0.2` to reduce creative/unexpected outputs
5. **Model choice**: Use `gpt-4o-mini` for lower cost per request (still capable enough for JSON recipes)

**Future enhancements** (out of scope for v1):
- Authentication (require login before using AI Design)
- Usage quotas per user
- Cost dashboard

### Summary

The JSON recipe architecture makes this feature **safe by design**:
- No code execution in the browser
- Fixed schema with hard limits
- Rate limiting on the proxy
- The LLM can't produce anything the interpreter doesn't explicitly support

## Verification

1. **Recipe interpreter unit tests**: Create a recipe, execute it, verify engine state matches expected dimensions/faces/subdivisions
2. **Manual browser test**: Click AI Design, type "open top box 150x100x80", click Preview, verify 3D view updates
3. **Error handling**: Type garbage, verify error message appears inline
4. **Done/Cancel flow**: Preview a design, click Done (assembly stays), then open again and Cancel (assembly reverts)
5. **Deploy test**: Push to CF Pages, verify the function responds at `/api/design`
6. **Existing tests**: All 1119 tests still pass

## Out of Scope

- Conversation history / multi-turn refinement (future enhancement)
- Streaming response display
- Authentication / per-user quotas
- Mobile-specific layout
