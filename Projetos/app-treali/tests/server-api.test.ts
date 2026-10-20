import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer, request } from 'node:http'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTrealiApi } from '../server/api.ts'

test('Admin de teste exige ativação explícita e acesso local', async () => {
  const previous = process.env.TREALI_ADMIN_PASSWORD
  delete process.env.TREALI_ADMIN_PASSWORD
  try {
    assert.throws(() => createTrealiApi(), /12 caracteres/)
    assert.throws(() => createTrealiApi({ adminPassword: '123456' }), /12 caracteres/)
    assert.throws(() => createTrealiApi({ localTestAdmin: true, adminPassword: '123456' }), /12 caracteres/)
    const dbPath = join(mkdtempSync(join(tmpdir(), 'treali-admin-')), 'treali.sqlite')
    const api = createTrealiApi({ dbPath, localTestAdmin: true })
    const server = createServer((req, res) => { void api.handle(req, res) })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
    try {
      for (const [username, password, status] of [['Outro', '123456', 401], ['Admin', 'errada', 401], ['Admin', '123456', 200]] as const) {
        const response = await fetch(base + '/api/auth/admin-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) })
        assert.equal(response.status, status)
        if (status === 200) {
          const cookie = response.headers.get('set-cookie')!
          assert.match(cookie, /HttpOnly/)
          const session = await fetch(base + '/api/session', { headers: { Cookie: cookie.split(';')[0] } })
          assert.deepEqual(await session.json(), { role: 'admin' })
        }
        await response.text()
      }
      const remoteStatus = await new Promise<number | undefined>((resolve, reject) => {
        const req = request(base + '/api/auth/admin-login', { method: 'POST', headers: { Host: 'treali.example', 'Content-Type': 'application/json' } }, res => {
          res.resume()
          res.on('end', () => resolve(res.statusCode))
        })
        req.on('error', reject)
        req.end(JSON.stringify({ username: 'Admin', password: '123456' }))
      })
      assert.equal(remoteStatus, 403)
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()))
      api.close()
    }
  } finally {
    if (previous === undefined) delete process.env.TREALI_ADMIN_PASSWORD
    else process.env.TREALI_ADMIN_PASSWORD = previous
  }
})

test('SQLite API isolates distributors, persists prices, rejects invalid money and conflicts', async () => {
  const dbPath = join(mkdtempSync(join(tmpdir(), 'treali-api-')), 'treali.sqlite')
  let api = createTrealiApi({ dbPath, adminPassword: 'test-admin-password' })
  let server = createServer((req, res) => { void api.handle(req, res) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  let base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  async function call(path: string, method = 'GET', payload?: unknown, cookie?: string) {
    const response = await fetch(base + path, { method, headers: { ...(payload ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: payload ? JSON.stringify(payload) : undefined })
    return { status: response.status, data: await response.json() as unknown, cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  try {
    assert.equal((await call('/api/admin/catalog')).status, 401)
    const login = await call('/api/auth/admin-login', 'POST', { username: 'Admin', password: 'test-admin-password' })
    assert.equal(login.status, 200)
    const admin = login.cookie!
    assert.match(admin, /treali_session=/)
    assert.equal((await call('/api/admin/products', 'POST', { product: { id: 'p', name: 'Produto', shortLabel: 'P' } }, admin)).status, 200)
    for (const [id, phone] of [['a', '32911112222'], ['b', '32933334444']]) {
      assert.equal((await call('/api/admin/distributors', 'POST', { distributor: { id, name: id, phone, city: 'Muriaé', isActive: true }, pin: '2468' }, admin)).status, 200)
    }
    assert.equal((await call('/api/admin/prices', 'POST', { rows: [
      { distributorId: 'a', productId: 'p', enabled: true, purchasePrice: 28.50 },
      { distributorId: 'b', productId: 'p', enabled: true, purchasePrice: 31.25 }
    ] }, admin)).status, 200)
    const a = (await call('/api/auth/distributor-login', 'POST', { phone: '32911112222', pin: '2468' })).cookie!
    const b = (await call('/api/auth/distributor-login', 'POST', { phone: '32933334444', pin: '2468' })).cookie!
    assert.equal((await call('/api/admin/catalog', 'GET', undefined, a)).status, 403)
    assert.equal((await call('/api/street/catalog', 'GET', undefined, admin)).status, 403)
    const street = await call('/api/street/catalog', 'GET', undefined, a)
    assert.equal(street.status, 200)
    assert.equal(JSON.stringify(street.data).includes('purchasePrice'), false)
    assert.equal(JSON.stringify(street.data).includes('28.5'), false)
    assert.equal(JSON.stringify(street.data).includes('pin'), false)
    const aPrice = await call('/api/street/prices', 'PATCH', { productId: 'p', resalePrice: 39.9, expectedRevision: 1, mutationId: 'm-a' }, a)
    assert.equal(aPrice.status, 200)
    assert.equal((aPrice.data as Record<string, unknown>).revision, 2)
    assert.equal((await call('/api/street/prices', 'PATCH', { productId: 'p', resalePrice: -1, expectedRevision: 2, mutationId: 'bad' }, a)).status, 400)
    const conflict = await call('/api/street/prices', 'PATCH', { productId: 'p', resalePrice: 40, expectedRevision: 1, mutationId: 'm-stale' }, a)
    assert.equal(conflict.status, 409)
    assert.equal((conflict.data as Record<string, unknown>).revision, 2)
    assert.equal((conflict.data as Record<string, unknown>).resalePrice, 39.9)
    assert.equal((((await call('/api/street/catalog', 'GET', undefined, b)).data as Record<string, unknown>).products as Array<Record<string, unknown>>)[0].resalePrice, null)
    assert.equal((await call('/api/street/prices', 'PATCH', { productId: 'p', resalePrice: 42, expectedRevision: 1, mutationId: 'm-b' }, b)).status, 200)
    const order = { id: 'order-a', items: [{ flavorId: 'p', name: 'Produto', quantity: 2, unitPrice: 39.9, subtotal: 79.8 }], totalPackages: 2, totalAmount: 79.8, createdAt: new Date().toISOString() }
    assert.equal((await call('/api/orders', 'POST', order, a)).status, 200)
    assert.equal((await call('/api/orders', 'POST', order, a)).status, 200)
    assert.equal((await call('/api/orders', 'POST', { ...order, id: 'wrong', totalAmount: 1 }, a)).status, 400)
    assert.equal(((await call('/api/orders', 'GET', undefined, b)).data as unknown[]).length, 0)
    assert.equal(((await call('/api/orders', 'GET', undefined, a)).data as unknown[]).length, 1)
    assert.equal(((await call('/api/orders', 'GET', undefined, admin)).data as unknown[]).length, 1)
    await new Promise<void>(resolve => server.close(() => resolve()))
    api.close()
    api = createTrealiApi({ dbPath, adminPassword: 'test-admin-password' })
    server = createServer((req, res) => { void api.handle(req, res) })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
    const reopened = await call('/api/street/catalog', 'GET', undefined, a)
    assert.equal(((reopened.data as Record<string, unknown>).products as Array<Record<string, unknown>>)[0].resalePrice, 39.9)
    assert.equal(((await call('/api/orders', 'GET', undefined, a)).data as unknown[]).length, 1)
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    api.close()
  }
})
