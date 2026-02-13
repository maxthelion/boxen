/**
 * CF Pages Function — OpenAI API proxy for AI Design.
 *
 * Accepts POST { prompt: string }, calls OpenAI with a system prompt
 * that teaches JSON recipe output, and returns { recipe } or { error }.
 */

interface Env {
  OPENAI_API_KEY: string;
}

// Minimal CF Pages Function type (avoids @cloudflare/workers-types dependency)
type PagesFunction<E = unknown> = (context: {
  request: Request;
  env: E;
}) => Promise<Response> | Response;

// Simple in-memory rate limit (per-isolate, resets on cold start)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

// ---------------------------------------------------------------------------
// System Prompt (JSON Recipe variant)
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a laser-cut box design assistant. Given a natural language description, return a JSON recipe that describes the box assembly.

## Output Format

Return ONLY a valid JSON object. No markdown fences, no explanation. The JSON must conform to this schema:

\`\`\`
{
  "type": "basicBox" | "enclosedBox",
  "width": number,       // mm
  "height": number,      // mm
  "depth": number,       // mm
  "openFaces": string[], // optional: ["top", "front", etc.]
  "material": {          // optional
    "thickness": number,
    "fingerWidth": number,
    "fingerGap": number
  },
  "feet": {              // optional
    "height": number,
    "width": number,
    "inset": number
  },
  "lid": {               // optional
    "face": "positive" | "negative",
    "tabDirection": "tabs-in" | "tabs-out"
  },
  "axis": "x" | "y" | "z",  // optional, default "y"
  "subdivisions": [      // optional
    {
      "type": "grid",
      "void": "root",    // or "child:0", "child:1", etc.
      "columns": number,
      "rows": number
    },
    {
      "type": "subdivideEvenly",
      "void": "root",
      "axis": "x" | "z",
      "count": number
    }
  ],
  "panels": [            // optional — panel operations
    {
      "face": "front" | "back" | "left" | "right" | "top" | "bottom",
      "extensions": { "top": 10, "bottom": 5 },  // edge name → mm
      "cutouts": [
        { "shape": "rect", "x": 10, "y": 10, "width": 20, "height": 15 },
        { "shape": "circle", "cx": 50, "cy": 40, "radius": 8 },
        { "shape": "polygon", "points": [[0,0], [10,0], [10,10]] }
      ],
      "fillets": [
        { "corners": ["bottom:left", "bottom:right"], "radius": 5 }
      ]
    }
  ]
}
\`\`\`

## Key Rules

1. **basicBox** has top face open by default. Use "enclosedBox" for all-solid.
2. **Dimensions** are width × height × depth in mm. If user says "150x100x80", that's width=150, height=100, depth=80.
3. **openFaces**: Valid values: "top", "bottom", "left", "right", "front", "back".
4. **Subdivisions**: "grid" creates a grid (columns along X, rows along Z). "subdivideEvenly" splits along one axis.
5. **Void references**: "root" is the main interior. After a subdivision, child voids are "child:0", "child:1", etc.
6. **Extensions**: Only open or female edges can be extended. For basicBox (top open), the top edge of side walls is open and extensible.
7. **Material**: Default thickness=3, fingerWidth=10, fingerGap=1.5. Only specify if user mentions material.
8. **Feet**: For feet/legs on the bottom.
9. **Corner keys** for fillets: "bottom:left", "bottom:right", "left:top", "right:top".

## Edge Gender (Extension Eligibility)

Wall priority: front(1) < back(2) < left(3) < right(4) < top(5) < bottom(6).
- Lower priority = male (tabs out). Male edges CANNOT be extended.
- Higher priority = female (slots). Female edges CAN be extended.
- Open edges (adjacent face removed) CAN be extended.
- Lid panels (top/bottom) default to tabs-out (male). Set lid tabDirection to "tabs-in" to make extensible.

Example: To extend bottom panel edges, add: "lid": { "face": "negative", "tabDirection": "tabs-in" }

## Dimension Mapping for Cutouts

| Face | Panel Width | Panel Height |
|------|------------|--------------|
| front/back | assembly width | assembly height |
| left/right | assembly depth | assembly height |
| top/bottom | assembly width | assembly depth |

Cutout coordinates are in the panel's local 2D space (origin at bottom-left).

## Common Patterns

- **Open-top box**: type "basicBox" (top is already open)
- **Lip/rim**: openFaces ["top"], then extend top edge of front/back/left/right by 10mm
- **Grid organizer**: subdivisions with type "grid"
- **Finger pull**: cutout circle near top center of front panel
- **Feet**: use the "feet" field
- **Rounded corners**: fillets on panel corners (both edges at corner must be open or female)

## Defaults

If the user doesn't specify:
- Material: 3mm thickness, 10mm finger width
- Type: basicBox (open top)
- No subdivisions, no extensions, no cutouts
- Reasonable dimensions if unspecified (e.g., 150x100x80 for a "box")

## When You Can't Help

Boxen makes rectangular laser-cut boxes. It CANNOT make:
- Curved or organic shapes (spheres, cylinders, animal shapes)
- Non-box furniture (chairs, tables)
- Mechanisms (hinges, sliding lids, clasps)
- Non-woodworking items

If the request is impossible or not a box, return ONLY a JSON object with an "error" field containing a specific, helpful message. Example:
{ "error": "Boxen designs rectangular laser-cut boxes — I can't make an elephant shape, but I could make an animal-themed storage box with compartments. Try describing a box!" }

If the request is vague but could be a box, make your best interpretation. Only return an error if the core request fundamentally cannot be a laser-cut box.

## Extension Edge Names

Extensions use the EDGE of the panel, not dimensions. Valid edge names are ONLY: "top", "bottom", "left", "right". Do NOT use "height" or "width" as edge names.

## Minimum Dimensions

Each dimension must be at least 3× the material thickness (default 3mm, so minimum ~10mm). Smaller boxes can't physically have finger joints.
`;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // Rate limit
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  if (isRateLimited(ip)) {
    return Response.json(
      { error: 'Rate limited. Please wait a minute before trying again.' },
      { status: 429 }
    );
  }

  // Validate API key exists
  if (!env.OPENAI_API_KEY) {
    return Response.json(
      { error: 'Server configuration error: API key not set.' },
      { status: 500 }
    );
  }

  // Parse request
  let prompt: string;
  try {
    const body = (await request.json()) as { prompt?: string };
    if (!body.prompt || typeof body.prompt !== 'string') {
      return Response.json({ error: 'Missing "prompt" field.' }, { status: 400 });
    }
    prompt = body.prompt.trim();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  // Prompt length cap
  if (prompt.length > 2000) {
    return Response.json(
      { error: 'Prompt too long. Maximum 2000 characters.' },
      { status: 400 }
    );
  }

  // Call OpenAI
  let responseText: string;
  try {
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('OpenAI API error:', aiResponse.status, errText);
      return Response.json(
        { error: 'AI service error. Please try again.' },
        { status: 502 }
      );
    }

    const data = (await aiResponse.json()) as {
      choices: { message: { content: string } }[];
    };
    responseText = data.choices[0]?.message?.content ?? '';
  } catch (err) {
    console.error('OpenAI fetch error:', err);
    return Response.json(
      { error: 'Failed to reach AI service.' },
      { status: 502 }
    );
  }

  // Response size cap (50KB)
  if (responseText.length > 50_000) {
    return Response.json(
      { error: 'AI response too large. Please simplify your description.' },
      { status: 502 }
    );
  }

  // Parse JSON from response (strip markdown fences if present)
  let cleaned = responseText.trim();
  if (cleaned.startsWith('```')) {
    const firstNewline = cleaned.indexOf('\n');
    cleaned = cleaned.slice(firstNewline + 1);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, cleaned.lastIndexOf('```'));
  }
  cleaned = cleaned.trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return Response.json(
      { error: 'AI returned invalid JSON. Please try rephrasing.' },
      { status: 502 }
    );
  }

  // If the LLM returned an error instead of a recipe, pass it through
  if (parsed.error && typeof parsed.error === 'string' && !parsed.type) {
    return Response.json({ error: parsed.error });
  }

  return Response.json({ recipe: parsed });
};
