import {
  getPendingOrders, markOrderSynced, saveProduct,
  saveDistributorProductPrice, getDistributorProductPrices, getDistributorSession,
  saveOrder, getAllOrders, clearDistributorSession
} from './db'
import type { OrderRecord, ProductFlavor, DistributorProductPrice } from './types'
import { broadcastSyncMessage, subscribeSyncMessages } from './channel'

export type SyncStatusListener = (status: 'idle' | 'syncing' | 'error' | 'synced', pendingCount: number) => void
const listeners = new Set<SyncStatusListener>()
let isSyncing = false
export function onSyncStatusChange(listener: SyncStatusListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
function notify(status: 'idle' | 'syncing' | 'error' | 'synced', count: number) {
  for (const listener of listeners) listener(status, count)
}
function sameOrigin(path: string, init?: RequestInit) {
  return fetch(path, { credentials: 'same-origin', ...init })
}
async function requireMatchingSession(distributorId: string): Promise<void> {
  const response = await sameOrigin('/api/session')
  if (response.status === 401 || response.status === 403) {
    await clearDistributorSession()
    throw new Error('Sessão da fábrica encerrada')
  }
  if (!response.ok) throw new Error('Sessão da fábrica indisponível')
  const session = await response.json() as { role: string; distributor?: { id: string } }
  if (session.role !== 'distributor' || session.distributor?.id !== distributorId) {
    await clearDistributorSession()
    throw new Error('A sessão mudou. Entre novamente.')
  }
}

interface StreetProduct { id: string; name: string; shortLabel: string; sortOrder: number; resalePrice: number | null; revision: number }
export async function pullRemoteCatalog(): Promise<ProductFlavor[]> {
  const session = await getDistributorSession()
  if (!session?.distributorId) return []
  await requireMatchingSession(session.distributorId)
  const response = await sameOrigin('/api/street/catalog')
  if (!response.ok) throw new Error('Catálogo indisponível')
  const body = await response.json() as { products: StreetProduct[] }
  if (!Array.isArray(body.products)) throw new Error('Catálogo inválido')
  const prior = await getDistributorProductPrices(session.distributorId)
  const products: ProductFlavor[] = []
  for (const item of body.products) {
    const local = prior.find((row) => row.productId === item.id)
    const keepPending = local?.resalePendingSync === true
    const row: DistributorProductPrice = {
      distributorId: session.distributorId, productId: item.id, enabled: true,
      purchasePrice: null, source: 'street', revision: keepPending ? local.revision : item.revision,
      resalePrice: keepPending ? local.resalePrice : item.resalePrice,
      resalePendingSync: keepPending, mutationId: keepPending ? local.mutationId : undefined,
      conflict: keepPending && (local.conflict === true || local.revision !== item.revision),
      syncError: keepPending ? local.syncError : undefined, serverResalePrice: item.resalePrice,
      updatedAt: new Date().toISOString()
    }
    await saveDistributorProductPrice(row)
    const product: ProductFlavor = { id: item.id, name: item.name, shortLabel: item.shortLabel,
      unitPrice: NaN, isActive: true, sortOrder: item.sortOrder }
    await saveProduct(product)
    products.push(product)
  }
  const incoming = new Set(body.products.map((item) => item.id))
  for (const row of prior) {
    if (!incoming.has(row.productId) && row.enabled) await saveDistributorProductPrice({ ...row, enabled: false,
      syncError: row.resalePendingSync ? 'product_unavailable' : undefined, mutationId: undefined })
  }
  return products
}

export async function pullRemoteOrders(): Promise<OrderRecord[]> {
  const session = await getDistributorSession()
  if (!session?.distributorId) return []
  await requireMatchingSession(session.distributorId)
  const response = await sameOrigin('/api/orders')
  if (!response.ok) throw new Error('Pedidos indisponíveis')
  const body = await response.json() as OrderRecord[] | { orders: OrderRecord[] }
  const orders = Array.isArray(body) ? body : body.orders
  const localIds = new Set((await getAllOrders()).map((o) => o.id))
  for (const order of orders) {
    if (!localIds.has(order.id)) await saveOrder({ ...order, distributorId: session.distributorId, status: 'synced' })
  }
  return orders
}

export async function discardUnavailablePrice(productId: string): Promise<void> {
  const session = await getDistributorSession()
  if (!session?.distributorId) throw new Error('Entre novamente para gerenciar a tabela.')
  const row = (await getDistributorProductPrices(session.distributorId)).find((item) => item.productId === productId)
  if (!row || row.syncError !== 'product_unavailable' || !row.resalePendingSync) throw new Error('Não há edição indisponível para descartar.')
  await saveDistributorProductPrice({ ...row, resalePrice: row.serverResalePrice ?? null,
    resalePendingSync: false, syncError: undefined, conflict: false, mutationId: undefined, updatedAt: new Date().toISOString() })
}

export async function syncPendingData(): Promise<{ syncedOrders: number; failedOrders: number }> {
  if (isSyncing) return { syncedOrders: 0, failedOrders: 0 }
  const session = await getDistributorSession()
  if (!session?.distributorId) return { syncedOrders: 0, failedOrders: 0 }
  isSyncing = true
  let syncedOrders = 0
  let failedOrders = 0
  let failed = false
  try {
    await requireMatchingSession(session.distributorId)
    const pendingPrices = (await getDistributorProductPrices(session.distributorId)).filter((row) => row.resalePendingSync && row.enabled && !row.conflict && !row.syncError && row.mutationId)
    const pendingOrders = await getPendingOrders()
    notify('syncing', pendingPrices.length + pendingOrders.length)
    for (const row of pendingPrices) {
      try {
        const response = await sameOrigin('/api/street/prices', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: row.productId, resalePrice: row.resalePrice,
            expectedRevision: row.revision, mutationId: row.mutationId })
        })
        if (response.status === 409) {
          const conflict = await response.json() as { revision: number; resalePrice: number | null }
          const current = (await getDistributorProductPrices(session.distributorId)).find((item) => item.productId === row.productId)
          if (current && current.mutationId === row.mutationId) await saveDistributorProductPrice({ ...current, revision: conflict.revision,
            serverResalePrice: conflict.resalePrice, conflict: true, mutationId: undefined })
          failed = true
        } else if (response.status === 404) {
          const current = (await getDistributorProductPrices(session.distributorId)).find((item) => item.productId === row.productId)
          if (current && current.mutationId === row.mutationId) await saveDistributorProductPrice({ ...current, enabled: false,
            syncError: 'product_unavailable', mutationId: undefined })
          failed = true
        } else if (response.ok) {
          const result = await response.json() as { revision: number }
          const current = (await getDistributorProductPrices(session.distributorId)).find((item) => item.productId === row.productId)
          if (current && current.mutationId === row.mutationId) {
            await saveDistributorProductPrice({ ...current, revision: result.revision, serverResalePrice: current.resalePrice, resalePendingSync: false, conflict: false, syncError: undefined, mutationId: undefined })
          }
        } else failed = true
      } catch { failed = true }
    }
    for (const order of pendingOrders) {
      try {
        const response = await sameOrigin('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(order) })
        if (!response.ok) { failedOrders++; failed = true; continue }
        const syncedAt = new Date().toISOString()
        await markOrderSynced(order.id, syncedAt)
        syncedOrders++
        broadcastSyncMessage({ type: 'ORDER_SYNCED', orderId: order.id, syncedAt })
      } catch { failedOrders++; failed = true }
    }
    try { await pullRemoteCatalog(); await pullRemoteOrders() } catch { failed = true }
    const count = (await getPendingOrders()).length + (await getDistributorProductPrices(session.distributorId)).filter((row) => row.resalePendingSync).length
    const unavailable = (await getDistributorProductPrices(session.distributorId)).some((row) => row.syncError === 'product_unavailable' && row.resalePendingSync)
    notify(failed || unavailable ? 'error' : count ? 'idle' : 'synced', count)
    return { syncedOrders, failedOrders }
  } catch {
    const count = (await getPendingOrders()).length + (await getDistributorProductPrices(session.distributorId)).filter((row) => row.resalePendingSync).length
    notify('error', count)
    return { syncedOrders, failedOrders: Math.max(failedOrders, 1) }
  } finally { isSyncing = false }
}

export function initSyncEngine(): void {
  if (typeof window === 'undefined') return
  window.addEventListener('online', () => { void syncPendingData() })
  subscribeSyncMessages((msg) => {
    if (msg.type === 'REQUEST_DATA_REFRESH' || msg.type === 'CATALOG_UPDATED') void syncPendingData()
  })
  setInterval(() => { if (navigator.onLine) void syncPendingData() }, 10000)
}

