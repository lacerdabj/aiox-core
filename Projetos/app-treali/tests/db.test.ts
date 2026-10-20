import test from 'node:test'
import assert from 'node:assert/strict'
import {
  saveOrder,
  getAllOrders,
  getPendingOrders,
  markOrderSynced,
  saveClient,
  getAllClients,
  getDailySummary,
  saveDistributorSession,
  getDistributorSession,
  clearDistributorSession
} from '../src/db.ts'
import type { OrderRecord, ClientPDV, DistributorSession } from '../src/types.ts'

test('Gerenciamento de sessão permanente', async () => {
  await clearDistributorSession()
  let session = await getDistributorSession()
  assert.equal(session, null)

  const newSession: DistributorSession = {
    distributorId: 'dist_test_session',
    phone: '32999998888',
    name: 'Carlos Distribuidor',
    token: 'auth_tok_123',
    loggedInAt: new Date().toISOString()
  }

  await saveDistributorSession(newSession)
  session = await getDistributorSession()
  assert.ok(session)
  assert.equal(session?.phone, '32999998888')
  assert.equal(session?.name, 'Carlos Distribuidor')

  await clearDistributorSession()
  session = await getDistributorSession()
  assert.equal(session, null)
})

test('Salvar cliente e listar', async () => {
  await saveDistributorSession({ distributorId: 'dist_test_session', phone: '32999998888', name: 'Carlos', token: '', loggedInAt: new Date().toISOString() })
  const cli: ClientPDV = {
    distributorId: 'dist_test_session',
    id: 'cli_test_1',
    name: 'Burger Teste',
    contactName: 'Carlos',
    whatsapp: '32999991111',
    city: 'Muriaé',
    neighborhood: 'Centro',
    createdAt: new Date().toISOString(),
    isSynced: false
  }

  await saveClient(cli)
  const clients = await getAllClients()
  assert.ok(clients.some((c) => c.id === 'cli_test_1'))
})

test('Fluxo de pedido offline e cálculo de resumo diário', async () => {
  const now = new Date().toISOString()
  const order: OrderRecord = {
    distributorId: 'dist_test_session',
    id: 'ord_test_1',
    clientId: 'cli_test_1',
    clientName: 'Burger Teste',
    contactName: 'Carlos',
    clientWhatsapp: '32999991111',
    distributorPhone: '32999998888',
    distributorName: 'Carlos Distribuidor',
    items: [
      { flavorId: 'bacon_30g', name: 'Bacon 30G', quantity: 3, unitPrice: 38, subtotal: 114 },
      { flavorId: 'creme_alho_30g', name: 'Creme de Alho 30G', quantity: 2, unitPrice: 38, subtotal: 76 }
    ],
    totalPackages: 5,
    totalAmount: 190,
    paymentMethod: 'PIX_A_VISTA',
    nextDelivery: 'Terça-feira',
    status: 'pending_sync',
    createdAt: now
  }

  await saveOrder(order)
  const allOrders = await getAllOrders()
  assert.equal(allOrders.length >= 1, true)
  const pending = await getPendingOrders()
  assert.ok(pending.some((o) => o.id === 'ord_test_1'))

  const summary = await getDailySummary()
  assert.equal(summary.totalAmount >= 190, true)
  assert.equal(summary.totalPackages >= 5, true)
  assert.equal(summary.pendingSyncCount >= 1, true)

  // Sincronizar pedido
  await markOrderSynced('ord_test_1', new Date().toISOString())
  const pendingAfter = await getPendingOrders()
  assert.equal(pendingAfter.some((o) => o.id === 'ord_test_1'), false)
})

test('falha do IndexedDB impede confirmação de pedido', async () => {
  const existing = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB')
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: { open: () => { throw new Error('armazenamento indisponível') } }
  })
  try {
    const order: OrderRecord = {
      distributorId: 'dist_test_session',
      id: 'ord_failed_storage', clientId: 'c', clientName: 'Cliente', contactName: 'Contato',
      clientWhatsapp: '32999999999', distributorPhone: '32988888888', distributorName: 'Distribuidor',
      items: [{ flavorId: 'p', name: 'Produto', quantity: 1, unitPrice: 40, subtotal: 40 }],
      totalPackages: 1, totalAmount: 40, paymentMethod: 'PIX_A_VISTA', nextDelivery: 'Terça-feira',
      status: 'pending_sync', createdAt: new Date().toISOString()
    }
    await assert.rejects(saveOrder(order), /armazenamento indisponível/)
  } finally {
    if (existing) Object.defineProperty(globalThis, 'indexedDB', existing)
    else delete (globalThis as { indexedDB?: IDBFactory }).indexedDB
  }
})

test('pedido offline de A não entra na fila de B no mesmo navegador', async () => {
  await saveDistributorSession({ distributorId: 'dist_a_isolation', phone: '32999990001', name: 'A', token: '', loggedInAt: new Date().toISOString() })
  const order: OrderRecord = {
    distributorId: 'dist_a_isolation', id: 'ord_a_offline', clientId: 'client_a', clientName: 'Lanchonete A',
    contactName: 'Cliente', clientWhatsapp: '32999990002', distributorPhone: '32999990001', distributorName: 'A',
    items: [{ flavorId: 'bacon', name: 'Bacon', quantity: 1, unitPrice: 40, subtotal: 40 }],
    totalPackages: 1, totalAmount: 40, paymentMethod: 'PIX_A_VISTA', nextDelivery: 'Hoje',
    status: 'pending_sync', createdAt: new Date().toISOString()
  }
  await saveOrder(order)
  assert.equal((await getPendingOrders()).length, 1)
  await saveDistributorSession({ distributorId: 'dist_b_isolation', phone: '32999990003', name: 'B', token: '', loggedInAt: new Date().toISOString() })
  assert.equal((await getPendingOrders()).length, 0)
  await assert.rejects(saveOrder(order), /vínculo/)
})

test('confirmação de pedido aguarda commit e rejeita aborto da transação', async () => {
  const existing = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB')
  let putCalled = false
  const fakeDb = {
    close() {},
    transaction() {
      const tx: { oncomplete?: () => void; onerror?: () => void; onabort?: () => void; error: Error | null; objectStore: () => { get: () => { result: OrderRecord; onsuccess?: () => void }; put: () => void } } = {
        error: new Error('commit falhou'),
        objectStore: () => ({
          get: () => {
            const req: { result: OrderRecord; onsuccess?: () => void } = {
              result: {
                distributorId: 'dist_b_isolation', id: 'ord_abort', clientId: 'c', clientName: 'C', contactName: 'C',
                clientWhatsapp: '32999990002', distributorPhone: '32999990003', distributorName: 'B', items: [],
                totalPackages: 0, totalAmount: 0, paymentMethod: 'PIX_A_VISTA', nextDelivery: 'Hoje',
                status: 'pending_sync', createdAt: new Date().toISOString()
              }
            }
            queueMicrotask(() => req.onsuccess?.())
            return req
          },
          put: () => { putCalled = true; queueMicrotask(() => tx.onabort?.()) }
        })
      }
      return tx
    }
  }
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: {
    open: () => {
      const req: { result: typeof fakeDb; onsuccess?: () => void } = { result: fakeDb }
      queueMicrotask(() => req.onsuccess?.())
      return req
    }
  } })
  try {
    await assert.rejects(markOrderSynced('ord_abort', new Date().toISOString()), /commit falhou/)
    assert.equal(putCalled, true)
  } finally {
    if (existing) Object.defineProperty(globalThis, 'indexedDB', existing)
    else delete (globalThis as { indexedDB?: IDBFactory }).indexedDB
  }
})
