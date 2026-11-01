import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Serves /api/extract during `npm run dev` using the same handler Vercel runs in
 * production, so the upload flow behaves identically locally. FIREWORKS_API_KEY is
 * read into the server process only; without the VITE_ prefix it never reaches the
 * browser bundle.
 */
function localApi(mode: string): Plugin {
  return {
    name: 'ledgerdesk-local-api',
    configureServer(server) {
      const env = loadEnv(mode, process.cwd(), '')
      if (env.FIREWORKS_API_KEY) process.env.FIREWORKS_API_KEY = env.FIREWORKS_API_KEY
      server.middlewares.use('/api/extract', async (req, res) => {
        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(chunk as Buffer)
        const raw = Buffer.concat(chunks).toString('utf8')
        const { default: handler } = await server.ssrLoadModule('/api/extract.ts')
        const shim = Object.assign(req, { body: raw })
        const reply = {
          status(code: number) {
            res.statusCode = code
            return reply
          },
          setHeader(name: string, value: string) {
            res.setHeader(name, value)
            return reply
          },
          json(payload: unknown) {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(payload))
          },
        }
        await handler(shim, reply)
      })
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), localApi(mode)],
  build: {
    chunkSizeWarningLimit: 1500,
  },
}))
