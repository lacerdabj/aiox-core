import { defineConfig, loadEnv, type Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import login from './api/auth/login.js'
import logout from './api/auth/logout.js'
import session from './api/session.js'
import clients from './api/clients.js'

function localApi(environment: Record<string, string>): Plugin {
  return {
    name: 'treali-local-api',
    configureServer(server) {
      Object.assign(process.env, environment)
      server.middlewares.use(async (request: IncomingMessage, response: ServerResponse, next) => {
        const path = new URL(request.url ?? '/', 'http://localhost').pathname
        const handler = path === '/api/auth/login' ? login
          : path === '/api/auth/logout' ? logout
            : path === '/api/session' ? session
              : path === '/api/clients' ? clients
                : null
        if (!handler) return next()

        try {
          const chunks: Buffer[] = []
          for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
          const headers = new Headers()
          for (const [name, value] of Object.entries(request.headers)) {
            if (value) headers.set(name, Array.isArray(value) ? value.join(', ') : value)
          }
          const method = request.method ?? 'GET'
          const body = ['GET', 'HEAD'].includes(method) ? undefined : Buffer.concat(chunks)
          const apiResponse = await handler(new Request(`http://localhost${request.url ?? '/'}`, { method, headers, body }))
          response.statusCode = apiResponse.status
          apiResponse.headers.forEach((value, name) => response.setHeader(name, value))
          response.end(Buffer.from(await apiResponse.arrayBuffer()))
        } catch {
          response.statusCode = 500
          response.setHeader('content-type', 'application/json')
          response.end(JSON.stringify({ error: 'Falha ao executar a API local.' }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [localApi(environment)],
    server: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp'
      }
    },
    optimizeDeps: {
      exclude: ['@sqlite.org/sqlite-wasm']
    }
  }
})
