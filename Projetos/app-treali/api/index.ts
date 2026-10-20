import type { IncomingMessage, ServerResponse } from 'node:http'
import { createTrealiApi } from '../server/api.ts'

let apiInstance: ReturnType<typeof createTrealiApi> | null = null

function getApi() {
  if (!apiInstance) {
    apiInstance = createTrealiApi({
      seedDefaultData: true
    })
  }
  return apiInstance
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const api = getApi()

    if (req.url) {
      const parsed = new URL(req.url, 'http://localhost')
      const queryPath = parsed.searchParams.get('path') || (req as unknown as { query?: { path?: string } }).query?.path
      if (queryPath) {
        req.url = '/api/' + queryPath.replace(/^\/+/, '')
      } else if (!parsed.pathname.startsWith('/api/')) {
        const queryAll = (req as unknown as { query?: { all?: string | string[] } }).query?.all
        if (Array.isArray(queryAll)) {
          req.url = '/api/' + queryAll.join('/') + (parsed.search || '')
        } else if (typeof queryAll === 'string') {
          req.url = '/api/' + queryAll + (parsed.search || '')
        } else {
          req.url = '/api' + (parsed.pathname.startsWith('/') ? parsed.pathname : '/' + parsed.pathname) + (parsed.search || '')
        }
      }
    }

    const handled = await api.handle(req, res)
    if (!handled && !res.writableEnded) {
      res.statusCode = 404
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ error: 'Endpoint não encontrado', url: req.url }))
    }
  } catch (err: any) {
    if (!res.writableEnded) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({
        error: err?.message || 'Erro desconhecido',
        stack: err?.stack,
        nodeVersion: process.version,
        url: req.url,
        env: {
          VERCEL: process.env.VERCEL,
          NODE_ENV: process.env.NODE_ENV
        }
      }, null, 2))
    }
  }
}
