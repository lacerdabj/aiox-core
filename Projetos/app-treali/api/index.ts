import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { IncomingMessage, ServerResponse } from 'node:http'

type Role = 'admin' | 'distributor'
type Session = { role: Role; distributorId: string | null }
type Row = Record<string, unknown>

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
  res.end(JSON.stringify(body))
}
const error = (status: number, message: string) => Object.assign(new Error(message), { status })
const money = (value: unknown, nullable = false): number | null => {
  if (nullable && value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || Math.round(value * 100) !== value * 100) throw error(400, 'Preço monetário inválido')
  return Math.round(value * 100)
}
const plainMoney = (cents: unknown): number | null => cents === null || cents === undefined ? null : Number(cents) / 100
const string = (value: unknown, label: string) => {
  if (typeof value !== 'string' || !value.trim() || value.length > 256) throw error(400, `${label} inválido`)
  return value.trim()
}
const hashSecret = (secret: string) => {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(secret, salt, 32).toString('hex')}`
}
const verifySecret = (secret: string, stored: string) => {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash || !/^[a-f0-9]{64}$/.test(hash)) return false
  return timingSafeEqual(scryptSync(secret, salt, 32), Buffer.from(hash, 'hex'))
}
const digest = (token: string) => createHash('sha256').update(token).digest('hex')

function isLocalOrPrivateAddress(ip: string | undefined): boolean {
  if (!ip) return false
  const clean = ip.replace(/^::ffff:/, '')
  if (clean === '127.0.0.1' || clean === '::1' || clean === 'localhost') return true
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(clean)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(clean)) return true
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(clean)) return true
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(clean)) return true
  if (/^fe80:/i.test(clean) || /^f[cd][0-9a-f]{2}:/i.test(clean)) return true
  return false
}

function isLocalOrPrivateHost(host: string | undefined): boolean {
  if (!host) return false
  const hostname = host.replace(/:\d+$/, '').toLowerCase().replace(/^\[|\]$/g, '')
  if (hostname === 'localhost' || hostname.endsWith('.local')) return true
  return isLocalOrPrivateAddress(hostname)
}

async function body(req: IncomingMessage): Promise<Row> {
  let chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const part = Buffer.from(chunk)
    size += part.length
    if (size > 128 * 1024) throw error(413, 'Corpo muito grande')
    chunks.push(part)
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
    return parsed as Row
  } catch { throw error(400, 'JSON inválido') }
}

export function createTrealiApi(options: { dbPath?: string; adminPassword?: string; localTestAdmin?: boolean; seedDefaultData?: boolean } = {}) {
  const isVercel = Boolean(process.env.VERCEL)
  const defaultDbPath = isVercel ? '/tmp/treali.sqlite' : resolve(process.cwd(), '.treali-data/treali.sqlite')
  const dbPath = options.dbPath ?? defaultDbPath
  const configuredPassword = options.adminPassword ?? process.env.TREALI_ADMIN_PASSWORD
  const localTestAdmin = options.localTestAdmin === true && configuredPassword === undefined
  const adminPassword = localTestAdmin ? '123456' : (configuredPassword ?? (isVercel ? '123456' : undefined))
  if (!adminPassword || (!localTestAdmin && !isVercel && adminPassword.length < 12)) throw new Error('Defina TREALI_ADMIN_PASSWORD com pelo menos 12 caracteres antes de iniciar o servidor')
  mkdirSync(dirname(dbPath), { recursive: true })
  if (existsSync(resolve(dirname(dbPath), 'db.json')) && !existsSync(dbPath)) {
    console.warn('Treali: db.json legado preservado. SQLite novo não importa PINs ou identidades automaticamente; veja server/README.md.')
  }
  const db = new DatabaseSync(dbPath)
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS distributors (id TEXT PRIMARY KEY, phone TEXT NOT NULL UNIQUE, data TEXT NOT NULL, pin_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS prices (distributor_id TEXT NOT NULL REFERENCES distributors(id), product_id TEXT NOT NULL REFERENCES products(id), enabled INTEGER NOT NULL, purchase_cents INTEGER, resale_cents INTEGER, revision INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(distributor_id, product_id));
    CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, distributor_id TEXT NOT NULL REFERENCES distributors(id), data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, role TEXT NOT NULL, distributor_id TEXT, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS mutations (distributor_id TEXT NOT NULL, mutation_id TEXT NOT NULL, product_id TEXT NOT NULL, revision INTEGER NOT NULL, PRIMARY KEY(distributor_id, mutation_id));`)
  const getClientIp = (req: IncomingMessage) => {
    const forwarded = req.headers['x-forwarded-for']
    if (typeof forwarded === 'string') return forwarded.split(',')[0].trim()
    return req.socket?.remoteAddress ?? 'unknown'
  }
  const adminHash = hashSecret(adminPassword)
  const failures = new Map<string, { count: number; until: number }>()
  const limitLogin = (key: string, valid: boolean) => {
    const now = Date.now()
    const prior = failures.get(key)
    if (prior && prior.until > now && prior.count >= 5) throw error(429, 'Muitas tentativas; tente novamente em 15 minutos')
    if (valid) { failures.delete(key); return }
    failures.set(key, { count: (prior && prior.until > now ? prior.count : 0) + 1, until: now + 15 * 60000 })
    throw error(401, 'Credenciais inválidas')
  }
  const get = (sql: string, ...params: (string | number | null)[]) => db.prepare(sql).get(...params) as Row | undefined
  const all = (sql: string, ...params: (string | number | null)[]) => db.prepare(sql).all(...params) as Row[]
  const run = (sql: string, ...params: (string | number | null)[]) => db.prepare(sql).run(...params)
  const tx = <T>(work: () => T): T => {
    db.exec('BEGIN IMMEDIATE')
    try { const result = work(); db.exec('COMMIT'); return result }
    catch (err) { db.exec('ROLLBACK'); throw err }
  }

  const seedIfEmpty = () => {
    const count = get('SELECT COUNT(*) as count FROM products')
    if (count && Number(count.count) > 0) return

    const defaultProducts = [
      { id: 'bacon_30g', name: 'Bacon 30G', shortLabel: 'Bacon', sortOrder: 0, isActive: true, updatedAt: new Date().toISOString() },
      { id: 'creme_alho_30g', name: 'Creme de Alho 30G', shortLabel: 'Creme de Alho', sortOrder: 1, isActive: true, updatedAt: new Date().toISOString() },
      { id: 'tradicional_30g', name: 'Tradicional 30G', shortLabel: 'Tradicional', sortOrder: 2, isActive: true, updatedAt: new Date().toISOString() },
      { id: 'picante_30g', name: 'Picante 30G', shortLabel: 'Picante', sortOrder: 3, isActive: true, updatedAt: new Date().toISOString() }
    ]

    for (const p of defaultProducts) {
      run('INSERT INTO products (id, data) VALUES (?, ?)', p.id, JSON.stringify(p))
    }

    const defaultDistributors = [
      { id: 'dist_carlos', name: 'Distribuidor Carlos', phone: '32988112233', city: 'Muriaé', vehicle: 'Moto Honda CG 160', vehiclePlate: 'ABC-1234', isActive: true, pin: '1234', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'dist_renato', name: 'Distribuidor Renato', phone: '32977445566', city: 'Muriaé', vehicle: 'Moto Yamaha Fazer', vehiclePlate: 'DEF-5678', isActive: true, pin: '1234', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'dist_marcos', name: 'Distribuidor Marcos', phone: '32999887766', city: 'Muriaé', vehicle: 'Fiorino 1.4', vehiclePlate: 'GHI-9012', isActive: true, pin: '1234', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    ]

    for (const d of defaultDistributors) {
      const { pin, ...distData } = d
      run('INSERT INTO distributors (id, phone, data, pin_hash) VALUES (?, ?, ?, ?)', d.id, d.phone, JSON.stringify(distData), hashSecret(pin))
      for (const p of defaultProducts) {
        run('INSERT INTO prices (distributor_id, product_id, enabled, purchase_cents, resale_cents, revision) VALUES (?, ?, 1, 2850, 3800, 1)', d.id, p.id)
      }
    }
  }

  if (options.seedDefaultData || isVercel) {
    seedIfEmpty()
  }

  const session = (req: IncomingMessage): Session | null => {
    const token = /(?:^|;\s*)treali_session=([^;]+)/.exec(req.headers.cookie ?? '')?.[1]
    if (!token) return null
    const row = get('SELECT role, distributor_id FROM sessions WHERE token_hash=? AND expires_at>?', digest(token), Date.now())
    return row ? { role: row.role as Role, distributorId: row.distributor_id as string | null } : null
  }
  const requireRole = (req: IncomingMessage, role: Role) => {
    const current = session(req)
    if (!current) throw error(401, 'Sessão necessária')
    if (current.role !== role) throw error(403, 'Acesso negado')
    return current
  }
  const setSession = (res: ServerResponse, role: Role, distributorId: string | null) => {
    const token = randomBytes(32).toString('hex')
    run('INSERT INTO sessions VALUES (?,?,?,?)', digest(token), role, distributorId, Date.now() + 30 * 86400000)
    const isSecure = process.env.TREALI_SECURE_COOKIE === '1' || isVercel
    res.setHeader('Set-Cookie', `treali_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${isSecure ? '; Secure' : ''}`)
  }
  const prices = () => all('SELECT distributor_id,product_id,enabled,purchase_cents,resale_cents,revision FROM prices').map(row => ({ distributorId: row.distributor_id, productId: row.product_id, enabled: !!row.enabled, purchasePrice: plainMoney(row.purchase_cents), resalePrice: plainMoney(row.resale_cents), revision: row.revision }))
  const products = () => all('SELECT data FROM products').map(row => JSON.parse(row.data as string) as Row).sort((a, b) => Number(a.sortOrder ?? 9999) - Number(b.sortOrder ?? 9999))
  const distributors = () => all('SELECT data FROM distributors').map(row => JSON.parse(row.data as string) as Row)

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname
    if (!path.startsWith('/api/')) return false
    try {
      if (localTestAdmin) {
        const address = getClientIp(req)
        const host = req.headers.host ?? ''
        if (!isLocalOrPrivateAddress(address) || !isLocalOrPrivateHost(host)) {
          throw error(403, 'Acesso de teste permitido somente em ambiente local ou rede privada')
        }
      }
      if (!['GET', 'POST', 'PATCH'].includes(req.method ?? '')) throw error(405, 'Método não permitido')
      if (req.method !== 'GET') {
        const origin = req.headers.origin
        const forwardedHost = req.headers['x-forwarded-host']
        const host = typeof forwardedHost === 'string' ? forwardedHost : req.headers.host
        if (origin) {
          try {
            const originHost = new URL(origin).host
            const isAllowed = (host && originHost === host) ||
                              (req.headers.host && originHost === req.headers.host) ||
                              originHost.endsWith('.vercel.app') ||
                              isLocalOrPrivateHost(originHost)
            if (!isAllowed) throw error(403, 'Origem não permitida')
          } catch (e: any) {
            if (e.status === 403) throw e
            throw error(403, 'Origem inválida')
          }
        }
      }
      if (path === '/api/auth/admin-login' && req.method === 'POST') {
        const input = await body(req)
        limitLogin(`admin:${getClientIp(req)}`, input.username === 'Admin' && typeof input.password === 'string' && verifySecret(input.password, adminHash))
        setSession(res, 'admin', null)
        json(res, 200, { role: 'admin' }); return true
      }
      if (path === '/api/auth/distributor-login' && req.method === 'POST') {
        const input = await body(req)
        const phone = string(input.phone, 'Telefone').replace(/\D/g, '')
        const row = get('SELECT id,data,pin_hash FROM distributors WHERE phone=?', phone)
        limitLogin(`dist:${getClientIp(req)}:${phone}`, !!row && typeof input.pin === 'string' && verifySecret(input.pin, row.pin_hash as string) && !!(JSON.parse(row.data as string) as Row).isActive)
        if (!row) throw error(401, 'Credenciais inválidas')
        setSession(res, 'distributor', row.id as string)
        json(res, 200, { role: 'distributor', distributorId: row.id }); return true
      }
      if (path === '/api/auth/logout' && req.method === 'POST') {
        const token = /(?:^|;\s*)treali_session=([^;]+)/.exec(req.headers.cookie ?? '')?.[1]
        if (token) run('DELETE FROM sessions WHERE token_hash=?', digest(token))
        res.setHeader('Set-Cookie', 'treali_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0')
        json(res, 200, { success: true }); return true
      }
      if (path === '/api/session' && req.method === 'GET') {
        const current = session(req)
        if (!current) throw error(401, 'Sessão necessária')
        if (current.role === 'distributor') {
          const row = get('SELECT data FROM distributors WHERE id=?', current.distributorId)
          if (!row || (JSON.parse(row.data as string) as Row).isActive === false) throw error(401, 'Sessão inválida')
          json(res, 200, { role: current.role, distributor: JSON.parse(row.data as string) }); return true
        }
        json(res, 200, { role: current.role }); return true
      }
      if (path === '/api/admin/catalog' && req.method === 'GET') {
        requireRole(req, 'admin')
        json(res, 200, { products: products(), distributors: distributors(), prices: prices() }); return true
      }
      if (path === '/api/admin/products' && req.method === 'POST') {
        requireRole(req, 'admin')
        const input = await body(req)
        const value = input.product as Row | undefined
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw error(400, 'Produto inválido')
        const id = string(value.id, 'ID')
        const product = { id, name: string(value.name, 'Nome'), shortLabel: string(value.shortLabel, 'Rótulo'), isActive: value.isActive !== false, sortOrder: Number.isSafeInteger(value.sortOrder) ? value.sortOrder : products().length, updatedAt: new Date().toISOString() }
        run('INSERT INTO products(id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data', id, JSON.stringify(product))
        json(res, 200, { product }); return true
      }
      if (path === '/api/admin/distributors' && req.method === 'POST') {
        requireRole(req, 'admin')
        const input = await body(req)
        const value = input.distributor as Row | undefined
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw error(400, 'Distribuidor inválido')
        const id = string(value.id, 'ID')
        const existing = get('SELECT pin_hash FROM distributors WHERE id=?', id)
        const pin = input.pin
        if (!existing && (typeof pin !== 'string' || !/^\d{4,12}$/.test(pin))) throw error(400, 'PIN de 4 a 12 dígitos obrigatório')
        if (pin !== undefined && (typeof pin !== 'string' || !/^\d{4,12}$/.test(pin))) throw error(400, 'PIN inválido')
        const distributor = { id, name: string(value.name, 'Nome'), phone: string(value.phone, 'Telefone').replace(/\D/g, ''), city: string(value.city, 'Cidade'), vehicle: typeof value.vehicle === 'string' ? value.vehicle : '', vehiclePlate: typeof value.vehiclePlate === 'string' ? value.vehiclePlate : '', isActive: value.isActive !== false, createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(), updatedAt: new Date().toISOString() }
        if (distributor.phone.length < 10 || distributor.phone.length > 13) throw error(400, 'Telefone inválido')
        try { run('INSERT INTO distributors(id,phone,data,pin_hash) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET phone=excluded.phone,data=excluded.data,pin_hash=excluded.pin_hash', id, distributor.phone, JSON.stringify(distributor), pin ? hashSecret(pin as string) : existing!.pin_hash as string) }
        catch (err) { if (String(err).includes('UNIQUE')) throw error(409, 'Telefone já cadastrado'); throw err }
        json(res, 200, { distributor }); return true
      }
      if (path === '/api/admin/prices' && req.method === 'POST') {
        requireRole(req, 'admin')
        const input = await body(req)
        if (!Array.isArray(input.rows) || input.rows.length > 500) throw error(400, 'Linhas inválidas')
        const rows = input.rows as unknown[]
        const changed = tx(() => rows.map((candidate: unknown) => {
          if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw error(400, 'Linha inválida')
          const row = candidate as Row
          const distributorId = string(row.distributorId, 'Distribuidor')
          const productId = string(row.productId, 'Produto')
          if (!get('SELECT id FROM distributors WHERE id=?', distributorId) || !get('SELECT id FROM products WHERE id=?', productId)) throw error(400, 'Distribuidor ou produto inexistente')
          if (typeof row.enabled !== 'boolean') throw error(400, 'Estado inválido')
          const purchaseCents = money(row.purchasePrice, true)
          if (row.enabled && purchaseCents === null) throw error(400, 'Preço de compra obrigatório')
          const old = get('SELECT resale_cents,revision FROM prices WHERE distributor_id=? AND product_id=?', distributorId, productId)
          if (row.expectedRevision !== undefined && row.expectedRevision !== (old?.revision ?? 0)) throw error(409, 'Revisão desatualizada')
          const revision = Number(old?.revision ?? 0) + 1
          run('INSERT INTO prices VALUES (?,?,?,?,?,?) ON CONFLICT(distributor_id,product_id) DO UPDATE SET enabled=excluded.enabled,purchase_cents=excluded.purchase_cents,revision=excluded.revision', distributorId, productId, row.enabled ? 1 : 0, purchaseCents, old?.resale_cents as number | null ?? null, revision)
          return { distributorId, productId, enabled: row.enabled, purchasePrice: plainMoney(purchaseCents), resalePrice: plainMoney(old?.resale_cents), revision }
        }))
        json(res, 200, { rows: changed }); return true
      }
      if (path === '/api/street/catalog' && req.method === 'GET') {
        const current = requireRole(req, 'distributor')
        const rows = all(`SELECT p.data, r.resale_cents,r.revision FROM prices r JOIN products p ON p.id=r.product_id WHERE r.distributor_id=? AND r.enabled=1 AND r.purchase_cents>0`, current.distributorId)
        const visible = rows.map(row => ({ ...JSON.parse(row.data as string), resalePrice: plainMoney(row.resale_cents), revision: row.revision })).filter(row => row.isActive !== false).map(({ id, name, shortLabel, sortOrder, resalePrice, revision }) => ({ id, name, shortLabel, sortOrder, resalePrice, revision }))
        json(res, 200, { products: visible }); return true
      }
      if (path === '/api/street/prices' && req.method === 'PATCH') {
        const current = requireRole(req, 'distributor')
        const input = await body(req)
        const productId = string(input.productId, 'Produto')
        const mutationId = string(input.mutationId, 'Mutação')
        const cents = money(input.resalePrice)
        if (!Number.isSafeInteger(input.expectedRevision)) throw error(400, 'Revisão obrigatória')
        const changed = tx(() => {
          const previous = get('SELECT product_id,revision FROM mutations WHERE distributor_id=? AND mutation_id=?', current.distributorId, mutationId)
          if (previous) {
            if (previous.product_id !== productId) throw error(409, 'Mutação reutilizada')
            const latest = get('SELECT resale_cents,revision FROM prices WHERE distributor_id=? AND product_id=?', current.distributorId, productId)
            if (latest?.revision !== previous.revision) throw Object.assign(error(409, 'Mutação superada'), { revision: latest?.revision, resalePrice: plainMoney(latest?.resale_cents) })
            return { productId, resalePrice: plainMoney(latest?.resale_cents), revision: previous.revision }
          }
          const row = get('SELECT revision FROM prices WHERE distributor_id=? AND product_id=? AND enabled=1 AND purchase_cents>0', current.distributorId, productId)
          const product = get('SELECT data FROM products WHERE id=?', productId)
          if (!row || !product || (JSON.parse(product.data as string) as Row).isActive === false) throw error(404, 'Produto indisponível')
          if (row.revision !== input.expectedRevision) {
            const currentPrice = get('SELECT resale_cents FROM prices WHERE distributor_id=? AND product_id=?', current.distributorId, productId)
            throw Object.assign(error(409, 'Revisão desatualizada'), { revision: row.revision, resalePrice: plainMoney(currentPrice?.resale_cents) })
          }
          const revision = Number(row.revision) + 1
          run('UPDATE prices SET resale_cents=?,revision=? WHERE distributor_id=? AND product_id=?', cents, revision, current.distributorId, productId)
          run('INSERT INTO mutations VALUES (?,?,?,?)', current.distributorId, mutationId, productId, revision)
          return { productId, resalePrice: plainMoney(cents), revision }
        })
        json(res, 200, changed); return true
      }
      if (path === '/api/orders' && req.method === 'GET') {
        const current = session(req)
        if (!current) throw error(401, 'Sessão necessária')
        const rows = current.role === 'admin' ? all('SELECT data FROM orders ORDER BY rowid DESC') : all('SELECT data FROM orders WHERE distributor_id=? ORDER BY rowid DESC', current.distributorId)
        json(res, 200, rows.map(row => JSON.parse(row.data as string))); return true
      }
      if (path === '/api/orders' && req.method === 'POST') {
        const current = requireRole(req, 'distributor')
        const input = await body(req)
        const order = (input.order && typeof input.order === 'object' ? input.order : input) as Row
        const id = string(order.id, 'Pedido')
        if (!Array.isArray(order.items) || !order.items.length || order.items.length > 100) throw error(400, 'Itens inválidos')
        const distributor = get('SELECT data FROM distributors WHERE id=?', current.distributorId)
        if (!distributor || (JSON.parse(distributor.data as string) as Row).isActive === false) throw error(403, 'Distribuidor inativo')
        const source = JSON.parse(distributor.data as string) as Row
        const accepted = tx(() => {
          const existing = get('SELECT data FROM orders WHERE id=?', id)
          if (existing) {
            const stored = JSON.parse(existing.data as string) as Row
            if (stored.distributorId !== current.distributorId) throw error(409, 'Pedido já existente')
            return stored
          }
          let totalCents = 0, totalPackages = 0
          const items = (order.items as unknown[]).map((itemValue: unknown) => {
            if (!itemValue || typeof itemValue !== 'object' || Array.isArray(itemValue)) throw error(400, 'Item inválido')
            const item = itemValue as Row
            const productId = string(item.flavorId ?? item.productId, 'Produto')
            if (!get('SELECT product_id FROM prices WHERE distributor_id=? AND product_id=?', current.distributorId, productId)) throw error(403, 'Produto não pertence ao distribuidor')
            const quantity = item.quantity
            if (!Number.isSafeInteger(quantity) || (quantity as number) <= 0 || (quantity as number) > 100000) throw error(400, 'Quantidade inválida')
            const unitCents = money(item.unitPrice)
            if (money(item.subtotal) !== unitCents! * (quantity as number)) throw error(400, 'Subtotal inválido')
            totalCents += unitCents! * (quantity as number)
            totalPackages += quantity as number
            return { flavorId: productId, name: string(item.name, 'Nome do produto'), quantity, unitPrice: plainMoney(unitCents), subtotal: plainMoney(unitCents! * (quantity as number)) }
          })
          if (money(order.totalAmount) !== totalCents || order.totalPackages !== totalPackages) throw error(400, 'Total do pedido inválido')
          const stored = { ...order, id, items, distributorId: current.distributorId, distributorPhone: source.phone, distributorName: source.name, totalPackages, totalAmount: plainMoney(totalCents), status: 'synced', syncedAt: new Date().toISOString() }
          run('INSERT INTO orders VALUES (?,?,?)', id, current.distributorId, JSON.stringify(stored))
          return stored
        })
        json(res, 200, { success: true, order: accepted }); return true
      }
      throw error(404, 'Endpoint não encontrado')
    } catch (err) {
      const status = typeof err === 'object' && err && 'status' in err ? Number(err.status) : 500
      const extra = status === 409 && typeof err === 'object' && err && 'revision' in err ? { revision: err.revision, resalePrice: 'resalePrice' in err ? err.resalePrice : null } : {}
      json(res, status, { error: status === 500 ? 'Erro interno do servidor' : String((err as Error).message), ...extra })
      if (status === 500) console.error(err)
      return true
    }
  }
  return { handle, close: () => db.close() }
}

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
        req.url = '/api' + (parsed.pathname.startsWith('/') ? parsed.pathname : '/' + parsed.pathname) + (parsed.search || '')
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
