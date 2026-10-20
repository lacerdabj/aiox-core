import type { Plugin } from 'vite'
import { createTrealiApi } from '../server/api.ts'

export function trealiApiPlugin(): Plugin {
  return {
    name: 'treali-api-plugin',
    configureServer(server) {
      const api = createTrealiApi({ localTestAdmin: true })
      server.middlewares.use((req, res, next) => {
        void api.handle(req, res).then(handled => { if (!handled) next() }).catch(next)
      })
      server.httpServer?.on('close', api.close)
    }
  }
}
