import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { createTrealiApi } from './api.ts'

const root = resolve(import.meta.dirname, '../dist')
const api = createTrealiApi()
const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' }

const server = createServer(async (req, res) => {
  if (await api.handle(req, res)) return
  try {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname)
    const path = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`)
    if (path !== root && !path.startsWith(root + sep)) throw new Error('Invalid path')
    if (!(await stat(path)).isFile()) throw new Error('Not a file')
    const extension = path.slice(path.lastIndexOf('.'))
    const content = await readFile(path)
    res.writeHead(200, { 'Content-Type': mime[extension] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' })
    res.end(req.method === 'HEAD' ? undefined : content)
  } catch {
    res.writeHead(404)
    res.end('Não encontrado')
  }
})

const port = Number(process.env.PORT ?? 4173)
server.listen(port, process.env.TREALI_HOST ?? '127.0.0.1', () => console.log(`Treali em http://localhost:${port}`))
process.on('SIGTERM', () => { server.close(); api.close() })
