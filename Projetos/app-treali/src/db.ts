import type { ClientPDV, DailySummary, Distributor, DistributorSession, DistributorProductPrice, OrderRecord, ProductFlavor } from './types'
import { DEFAULT_PRODUCTS } from './types'
import { broadcastSyncMessage } from './channel.ts'

const DB_NAME = 'treali_rua_pwa_db'
let cacheScope = typeof localStorage !== 'undefined' ? localStorage.getItem('treali_cache_scope') : null
const DB_VERSION = 4
const priceMemory = new Map<string, DistributorProductPrice>()
const priceKey = (distributorId: string, productId: string) => `${distributorId}:${productId}`

export function validMoney(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && Math.round(value * 100) === value * 100
}

export async function saveDistributorProductPrice(row: DistributorProductPrice): Promise<void> {
  if (!row.distributorId || !row.productId ||
    (row.purchasePrice !== null && !validMoney(row.purchasePrice)) ||
    (row.resalePrice !== null && !validMoney(row.resalePrice)) ||
    (row.enabled && row.purchasePrice === null && row.source !== 'street')) {
    throw new Error('Preço ou vínculo comercial inválido.')
  }
  if (typeof indexedDB === 'undefined') {
    priceMemory.set(priceKey(row.distributorId, row.productId), row)
    return
  }
  const db = await openTrealiDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('distributorPrices', 'readwrite')
    tx.objectStore('distributorPrices').put({ ...row, key: priceKey(row.distributorId, row.productId) })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
  priceMemory.set(priceKey(row.distributorId, row.productId), row)
}

export async function getDistributorProductPrices(distributorId?: string): Promise<DistributorProductPrice[]> {
  if (typeof indexedDB === 'undefined') {
    return [...priceMemory.values()].filter((row) => !distributorId || row.distributorId === distributorId)
  }
  const db = await openTrealiDB()
  const rows = await new Promise<DistributorProductPrice[]>((resolve, reject) => {
    const tx = db.transaction('distributorPrices', 'readonly')
    const req = tx.objectStore('distributorPrices').getAll()
    req.onsuccess = () => resolve(req.result as DistributorProductPrice[])
    req.onerror = () => reject(req.error)
  })
  return rows.filter((row) => !distributorId || row.distributorId === distributorId)
}

let dbInstance: IDBDatabase | null = null

export async function openTrealiDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance

  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB não suportado neste ambiente.')
  }

  return new Promise((resolve, reject) => {
    let isSettled = false

    // Timeout de segurança: se o IndexedDB estiver bloqueado por outra aba, não trava a tela
    const timer = setTimeout(() => {
      if (!isSettled) {
        isSettled = true
        console.warn('Timeout ao abrir IndexedDB. Ativando fallback em memória.')
        reject(new Error('IndexedDB timeout'))
      }
    }, 1200)

    try {
      const request = indexedDB.open(`${DB_NAME}_${cacheScope || 'unverified'}`, DB_VERSION)

      request.onblocked = () => {
        console.warn('IndexedDB bloqueado por conexão anterior. Fechando conexão aberta.')
        if (dbInstance) {
          try {
            dbInstance.close()
          } catch {
            // noop
          }
          dbInstance = null
        }
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        if (!db.objectStoreNames.contains('orders')) {
          const orderStore = db.createObjectStore('orders', { keyPath: 'id' })
          orderStore.createIndex('status', 'status', { unique: false })
          orderStore.createIndex('createdAt', 'createdAt', { unique: false })
        }

        if (!db.objectStoreNames.contains('clients')) {
          const clientStore = db.createObjectStore('clients', { keyPath: 'id' })
          clientStore.createIndex('name', 'name', { unique: false })
          clientStore.createIndex('whatsapp', 'whatsapp', { unique: false })
        }

        if (!db.objectStoreNames.contains('session')) {
          db.createObjectStore('session', { keyPath: 'key' })
        }

        if (!db.objectStoreNames.contains('products')) {
          db.createObjectStore('products', { keyPath: 'id' })
        }

        if (!db.objectStoreNames.contains('distributors')) {
          const distStore = db.createObjectStore('distributors', { keyPath: 'id' })
          distStore.createIndex('phone', 'phone', { unique: true })
          distStore.createIndex('name', 'name', { unique: false })
        }
        if (!db.objectStoreNames.contains('distributorPrices')) {
          db.createObjectStore('distributorPrices', { keyPath: 'key' })
        }
      }

      request.onsuccess = () => {
        if (isSettled) return
        isSettled = true
        clearTimeout(timer)
        dbInstance = request.result

        dbInstance.onversionchange = () => {
          try {
            dbInstance?.close()
          } catch {
            // noop
          }
          dbInstance = null
        }

        resolve(dbInstance)
      }

      request.onerror = () => {
        if (isSettled) return
        isSettled = true
        clearTimeout(timer)
        console.warn('Erro ao abrir IndexedDB:', request.error)
        reject(request.error)
      }
    } catch (err) {
      if (!isSettled) {
        isSettled = true
        clearTimeout(timer)
        reject(err)
      }
    }
  })
}

// In-memory fallback para testes sem IndexedDB
class MemoryStore {
  orders: Map<string, OrderRecord> = new Map()
  clients: Map<string, ClientPDV> = new Map()
  products: Map<string, ProductFlavor> = new Map()
  distributors: Map<string, Distributor> = new Map()
  session: DistributorSession | null = null
}

const memoryFallback = new MemoryStore()

function isIndexedDBAvailable(): boolean {
  return typeof indexedDB !== 'undefined'
}

export async function saveOrder(order: OrderRecord): Promise<void> {
  if (!cacheScope || order.distributorId !== cacheScope) throw new Error('Pedido sem vínculo com o distribuidor verificado.')
  if (!isIndexedDBAvailable()) {
    memoryFallback.orders.set(order.id, order)
    return
  }

  const db = await openTrealiDB()
  await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('orders', 'readwrite')
      const store = tx.objectStore('orders')
      store.put(order)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
  })
  memoryFallback.orders.set(order.id, order)
}

export async function getAllOrders(): Promise<OrderRecord[]> {
  if (!isIndexedDBAvailable()) {
    return Array.from(memoryFallback.orders.values()).filter((order) => order.distributorId === cacheScope).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  }

  try {
    const db = await openTrealiDB()
    const fromIdb = await new Promise<OrderRecord[]>((resolve, reject) => {
      const tx = db.transaction('orders', 'readonly')
      const store = tx.objectStore('orders')
      const req = store.getAll()
      req.onsuccess = () => {
        const orders = req.result as OrderRecord[]
        orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        resolve(orders)
      }
      req.onerror = () => reject(req.error)
    })
    return fromIdb.filter((order) => order.distributorId === cacheScope)
  } catch (err) {
    console.warn('Aviso: usando fallback em memória para pedidos:', err)
    return Array.from(memoryFallback.orders.values()).filter((order) => order.distributorId === cacheScope).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  }
}

export async function getPendingOrders(): Promise<OrderRecord[]> {
  const all = await getAllOrders()
  return all.filter((o) => o.status === 'pending_sync')
}

export async function markOrderSynced(orderId: string, syncedAt: string): Promise<void> {
  if (!isIndexedDBAvailable()) {
    const order = memoryFallback.orders.get(orderId)
    if (!order || order.distributorId !== cacheScope) throw new Error('Pedido não encontrado para este distribuidor.')
    memoryFallback.orders.set(orderId, { ...order, status: 'synced', syncedAt })
    return
  }

  const db = await openTrealiDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('orders', 'readwrite')
    const store = tx.objectStore('orders')
    const getReq = store.get(orderId)
    let failure: Error | null = null
    getReq.onsuccess = () => {
      const order = getReq.result as OrderRecord | undefined
      if (!order || order.distributorId !== cacheScope) {
        failure = new Error('Pedido não encontrado para este distribuidor.')
        tx.abort()
        return
      }
      store.put({ ...order, status: 'synced', syncedAt })
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Falha ao gravar confirmação do pedido.'))
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('Gravação da confirmação abortada.'))
  })
}

export async function saveClient(client: ClientPDV): Promise<void> {
  if (!cacheScope || client.distributorId !== cacheScope) throw new Error('Cliente sem vínculo com o distribuidor verificado.')
  memoryFallback.clients.set(client.id, client)

  if (!isIndexedDBAvailable()) {
    return
  }

  try {
    const db = await openTrealiDB()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('clients', 'readwrite')
      const store = tx.objectStore('clients')
      const req = store.put(client)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn('Aviso: usando fallback em memória para salvar cliente:', err)
  }
}

export async function getAllClients(): Promise<ClientPDV[]> {
  if (!isIndexedDBAvailable()) {
    return Array.from(memoryFallback.clients.values()).filter((client) => client.distributorId === cacheScope)
  }

  try {
    const db = await openTrealiDB()
    const fromIdb = await new Promise<ClientPDV[]>((resolve, reject) => {
      const tx = db.transaction('clients', 'readonly')
      const store = tx.objectStore('clients')
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result as ClientPDV[])
      req.onerror = () => reject(req.error)
    })
    return fromIdb.filter((client) => client.distributorId === cacheScope)
  } catch (err) {
    console.warn('Aviso: usando fallback em memória para clientes:', err)
    return Array.from(memoryFallback.clients.values()).filter((client) => client.distributorId === cacheScope)
  }
}

export async function getDailySummary(): Promise<DailySummary> {
  const orders = await getAllOrders()
  const today = new Date().toISOString().slice(0, 10)

  const todayOrders = orders.filter((o) => o.createdAt.slice(0, 10) === today)

  const totalAmount = todayOrders.reduce((acc, curr) => acc + curr.totalAmount, 0)
  const totalPackages = todayOrders.reduce((acc, curr) => acc + curr.totalPackages, 0)
  const pendingSyncCount = orders.filter((o) => o.status === 'pending_sync').length

  return {
    totalAmount,
    totalPackages,
    totalOrders: todayOrders.length,
    pendingSyncCount
  }
}

// Gerenciamento de Sessão permanente
export async function saveDistributorSession(session: DistributorSession): Promise<void> {
  if (!session.distributorId) throw new Error('Sessão sem identidade verificada.')
  if (cacheScope !== session.distributorId) {
    dbInstance?.close()
    dbInstance = null
    cacheScope = session.distributorId
    priceMemory.clear()
    memoryFallback.orders.clear()
    memoryFallback.clients.clear()
    memoryFallback.products.clear()
    memoryFallback.distributors.clear()
    if (typeof localStorage !== 'undefined') localStorage.setItem('treali_cache_scope', cacheScope)
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('treali_session', JSON.stringify(session))
  }
  if (!isIndexedDBAvailable()) {
    memoryFallback.session = session
    return
  }

  try {
    const db = await openTrealiDB()
    const tx = db.transaction('session', 'readwrite')
    tx.objectStore('session').put({ key: 'current', ...session })
  } catch {
    // se falhar idb, localStorage garante
  }
}

export async function getDistributorSession(): Promise<DistributorSession | null> {
  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem('treali_session')
    if (raw) {
      try {
        const session = JSON.parse(raw) as DistributorSession
        return session.distributorId ? session : null
      } catch {
        // ignora
      }
    }
    return null
  }

  if (!isIndexedDBAvailable()) return memoryFallback.session
  if (!cacheScope) return null

  try {
    const db = await openTrealiDB()
    return new Promise((resolve) => {
      const tx = db.transaction('session', 'readonly')
      const req = tx.objectStore('session').get('current')
      req.onsuccess = () => {
        if (req.result) {
          const { key: _key, ...session } = req.result
          resolve(session as DistributorSession)
        } else {
          resolve(null)
        }
      }
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

export async function clearDistributorSession(): Promise<void> {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('treali_session')
  }
  memoryFallback.session = null
  if (isIndexedDBAvailable()) {
    try {
      const db = await openTrealiDB()
      const tx = db.transaction('session', 'readwrite')
      tx.objectStore('session').delete('current')
    } catch {
      // noop
    }
  }
}

// ==========================
// GESTÃO DE PRODUTOS & SABORES
// ==========================
export async function saveProduct(product: ProductFlavor): Promise<void> {
  const existing = memoryFallback.products.get(product.id)
  let sortOrder = product.sortOrder
  if (sortOrder === undefined) {
    sortOrder = existing?.sortOrder ?? (await getAllProducts()).length
  }

  const toSave: ProductFlavor = {
    ...product,
    isActive: product.isActive !== false,
    sortOrder,
    updatedAt: new Date().toISOString()
  }

  memoryFallback.products.set(toSave.id, toSave)

  if (!isIndexedDBAvailable()) {
    return
  }

  try {
    const db = await openTrealiDB()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('products', 'readwrite')
      const store = tx.objectStore('products')
      const req = store.put(toSave)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn('Aviso: usando fallback em memória para salvar produto:', err)
  }
}

export async function getAllProducts(): Promise<ProductFlavor[]> {
  let list: ProductFlavor[] = []

  if (!isIndexedDBAvailable()) {
    list = Array.from(memoryFallback.products.values())
  } else {
    try {
      const db = await openTrealiDB()
      list = await new Promise<ProductFlavor[]>((resolve, reject) => {
        const tx = db.transaction('products', 'readonly')
        const store = tx.objectStore('products')
        const req = store.getAll()
        req.onsuccess = () => resolve(req.result as ProductFlavor[])
        req.onerror = () => reject(req.error)
      })
    } catch (err) {
      console.warn('Aviso: usando fallback em memória para produtos:', err)
      list = Array.from(memoryFallback.products.values())
    }
  }

  return list.sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999))
}

export async function getActiveProducts(): Promise<ProductFlavor[]> {
  const all = await getAllProducts()
  return all.filter((p) => p.isActive !== false)
}

export async function reorderProducts(orderedIds: string[]): Promise<ProductFlavor[]> {
  const current = await getAllProducts()
  const map = new Map<string, ProductFlavor>(current.map((p) => [p.id, p]))
  const updatedList: ProductFlavor[] = []

  // 1. Atualiza produtos na nova ordem
  orderedIds.forEach((id, index) => {
    const item = map.get(id)
    if (item) {
      item.sortOrder = index
      item.updatedAt = new Date().toISOString()
      updatedList.push(item)
      map.delete(id)
    }
  })

  // 2. Anexa produtos remanescentes se houver
  let nextOrder = orderedIds.length
  for (const remaining of map.values()) {
    remaining.sortOrder = nextOrder++
    updatedList.push(remaining)
  }

  // Atualiza memória
  for (const p of updatedList) {
    memoryFallback.products.set(p.id, p)
  }

  // Atualiza IndexedDB
  if (isIndexedDBAvailable()) {
    try {
      const db = await openTrealiDB()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('products', 'readwrite')
        const store = tx.objectStore('products')
        for (const p of updatedList) {
          store.put(p)
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    } catch (err) {
      console.warn('Aviso: fallback ao salvar reordenação em IndexedDB:', err)
    }
  }

  // Sincroniza com a API REST da fábrica
  try {
    if (typeof fetch !== 'undefined') {
      fetch('/api/products/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds })
      }).catch(() => {})
    }
  } catch {
    // offline
  }

  // Dispara mesh de sincronização para todas as abas
  try {
    broadcastSyncMessage({ type: 'CATALOG_UPDATED', products: updatedList })
  } catch {
    // noop
  }

  return updatedList
}

export async function deleteProduct(productId: string): Promise<void> {
  memoryFallback.products.delete(productId)

  if (!isIndexedDBAvailable()) {
    return
  }

  try {
    const db = await openTrealiDB()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('products', 'readwrite')
      const store = tx.objectStore('products')
      const req = store.delete(productId)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn('Aviso: usando fallback em memória para excluir produto:', err)
  }
}

export async function ensureSeedProducts(): Promise<void> {
  const existing = await getAllProducts()
  if (existing.length === 0) {
    for (let i = 0; i < DEFAULT_PRODUCTS.length; i++) {
      await saveProduct({
        ...DEFAULT_PRODUCTS[i],
        sortOrder: i
      })
    }
  }
}

// ==========================
// GESTÃO DE DISTRIBUIDORES
// ==========================
export async function saveDistributor(distributor: Distributor): Promise<void> {
  const cleanPhone = distributor.phone.replace(/\D/g, '')
  const toSave: Distributor = {
    ...distributor,
    phone: cleanPhone,
    isActive: distributor.isActive !== false,
    updatedAt: new Date().toISOString()
  }

  // Sincroniza imediatamente o nome na sessão ativa do localStorage se for o mesmo distribuidor
  try {
    if (typeof localStorage !== 'undefined') {
      const rawSession = localStorage.getItem('treali_session')
      if (rawSession) {
        const session = JSON.parse(rawSession) as DistributorSession
        if (session && session.phone === cleanPhone && session.name !== toSave.name) {
          session.name = toSave.name
          localStorage.setItem('treali_session', JSON.stringify(session))
          if (memoryFallback.session && memoryFallback.session.phone === cleanPhone) {
            memoryFallback.session.name = toSave.name
          }
        }
      }
    }
  } catch {
    // noop
  }

  if (!isIndexedDBAvailable()) {
    memoryFallback.distributors.set(toSave.id, toSave)
    return
  }

  const db = await openTrealiDB()
    // Atualiza tabela de distribuidores
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('distributors', 'readwrite')
      const store = tx.objectStore('distributors')
      const req = store.put(toSave)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })

    // Se houver sessão gravada no IndexedDB para este distribuidor, atualiza o nome nela também
    try {
      const txSession = db.transaction('session', 'readwrite')
      const sessionStore = txSession.objectStore('session')
      const getReq = sessionStore.get('current')
      getReq.onsuccess = () => {
        if (getReq.result && getReq.result.phone === cleanPhone && getReq.result.name !== toSave.name) {
          sessionStore.put({ ...getReq.result, name: toSave.name })
        }
      }
    } catch {
      // noop
    }
  memoryFallback.distributors.set(toSave.id, toSave)
}

export async function getAllDistributors(): Promise<Distributor[]> {
  if (!isIndexedDBAvailable()) {
    return Array.from(memoryFallback.distributors.values())
  }

  try {
    const db = await openTrealiDB()
    const fromIdb = await new Promise<Distributor[]>((resolve, reject) => {
      const tx = db.transaction('distributors', 'readonly')
      const store = tx.objectStore('distributors')
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result as Distributor[])
      req.onerror = () => reject(req.error)
    })
    return fromIdb
  } catch (err) {
    console.warn('Aviso: usando fallback em memória para distribuidores:', err)
    return Array.from(memoryFallback.distributors.values())
  }
}

export async function getDistributorByPhone(phone: string): Promise<Distributor | null> {
  const clean = phone.replace(/\D/g, '')
  const all = await getAllDistributors()
  return all.find((d) => d.phone === clean) || null
}

export async function deleteDistributor(distributorId: string): Promise<void> {
  memoryFallback.distributors.delete(distributorId)

  if (!isIndexedDBAvailable()) {
    return
  }

  try {
    const db = await openTrealiDB()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('distributors', 'readwrite')
      const store = tx.objectStore('distributors')
      const req = store.delete(distributorId)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn('Aviso: usando fallback em memória para excluir distribuidor:', err)
  }
}

