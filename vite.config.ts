import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Minimal system prompt for the dev proxy (matches the CF function's prompt) */
const DEV_SYSTEM_PROMPT = `You are a laser-cut box design assistant. Return ONLY a valid JSON object (no markdown, no explanation) conforming to this schema:
{ "type": "basicBox"|"enclosedBox", "width": number, "height": number, "depth": number, "openFaces"?: string[], "material"?: { "thickness"?: number, "fingerWidth"?: number, "fingerGap"?: number }, "feet"?: { "height": number, "width": number, "inset": number }, "lid"?: { "face": "positive"|"negative", "tabDirection": "tabs-in"|"tabs-out" }, "axis"?: "x"|"y"|"z", "subdivisions"?: [{ "type": "grid"|"subdivideEvenly", "void": "root", "columns"?: number, "rows"?: number, "axis"?: "x"|"z", "count"?: number }], "panels"?: [{ "face": string, "extensions"?: Record<string,number>, "cutouts"?: [{ "shape": "rect"|"circle"|"polygon", ... }], "fillets"?: [{ "corners": string[], "radius": number }] }] }
basicBox has top open by default. Dimensions are width×height×depth in mm. The "void" field in subdivisions must be "root" for the first subdivision (the main interior). After a subdivision creates child voids, use "child:0", "child:1", etc. to target them. Only open or female edges can be extended. Wall priority: front(1)<back(2)<left(3)<right(4)<top(5)<bottom(6), lower=male=tabs-out=NOT extensible.`

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'ai-design-proxy',
      apply: 'serve',
      configureServer(server) {
        const apiKey = loadEnv('development', (globalThis as any).process?.cwd?.() ?? '.', '').OPENAI_API_KEY
        server.middlewares.use('/api/design', (req: any, res: any) => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.end(JSON.stringify({ error: 'Method not allowed' }))
            return
          }
          if (!apiKey) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: 'OPENAI_API_KEY not set in .env' }))
            return
          }

          let body = ''
          req.on('data', (chunk: any) => { body += chunk })
          req.on('end', async () => {
            let prompt: string
            try {
              const parsed = JSON.parse(body)
              prompt = parsed.prompt
              if (!prompt || typeof prompt !== 'string') {
                res.statusCode = 400
                res.end(JSON.stringify({ error: 'Missing "prompt" field' }))
                return
              }
            } catch {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Invalid JSON' }))
              return
            }

            try {
              const aiRes = await (globalThis as any).fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${apiKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  model: 'gpt-4o-mini',
                  temperature: 0.2,
                  messages: [
                    { role: 'system', content: DEV_SYSTEM_PROMPT },
                    { role: 'user', content: prompt },
                  ],
                }),
              })

              if (!aiRes.ok) {
                res.statusCode = 502
                res.end(JSON.stringify({ error: `OpenAI error: ${aiRes.status}` }))
                return
              }

              const data = await aiRes.json()
              let content = data.choices?.[0]?.message?.content ?? ''

              // Strip markdown fences
              content = content.trim()
              if (content.startsWith('```')) {
                content = content.slice(content.indexOf('\n') + 1)
              }
              if (content.endsWith('```')) {
                content = content.slice(0, content.lastIndexOf('```'))
              }
              content = content.trim()

              let recipe: unknown
              try {
                recipe = JSON.parse(content)
              } catch {
                res.statusCode = 502
                res.end(JSON.stringify({ error: 'AI returned invalid JSON' }))
                return
              }

              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ recipe }))
            } catch {
              res.statusCode = 502
              res.end(JSON.stringify({ error: 'Failed to reach OpenAI' }))
            }
          })
        })
      },
    },
  ],
  build: {
    // Generate sourcemaps for debugging
    sourcemap: true,
    // Optimize for production
    minify: 'esbuild',
    // Split chunks for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          'three': ['three'],
          'react-three': ['@react-three/fiber', '@react-three/drei'],
        },
      },
    },
  },
})
