import test from 'node:test'
import assert from 'node:assert/strict'
import { pullRemoteCatalog, syncPendingData, discardUnavailablePrice } from '../src/sync.ts'
import { getDistributorProductPrices, saveDistributorProductPrice, saveDistributorSession } from '../src/db.ts'

test('catálogo escopado mantém edição pendente e conflito não sobrescreve revenda local', async () => {
  const original = globalThis.fetch
  await saveDistributorSession({ distributorId: 'dist_sync_a', phone: '32999990000', name: 'A', token: '', loggedInAt: new Date().toISOString() })
  let patchCount = 0
  let remoteRevision = 2
  globalThis.fetch = async (input, init) => {
    const path = String(input)
    if (path === '/api/session') return new Response(JSON.stringify({ role: 'distributor', distributor: { id: 'dist_sync_a' } }), { status: 200 })
    if (path === '/api/street/catalog') return new Response(JSON.stringify({ products: [{ id: 'bacon', name: 'Bacon', shortLabel: 'Bacon', sortOrder: 0, resalePrice: remoteRevision === 3 ? 42 : 40, revision: remoteRevision }] }), { status: 200 })
    if (path === '/api/street/prices' && init?.method === 'PATCH') { patchCount++; remoteRevision = 3; return new Response(JSON.stringify({ error: 'conflict', revision: 3, resalePrice: 42 }), { status: 409 }) }
    if (path === '/api/orders') return new Response(JSON.stringify([]), { status: 200 })
    return new Response('', { status: 404 })
  }
  try {
    await pullRemoteCatalog()
    let row = (await getDistributorProductPrices('dist_sync_a')).find((value) => value.productId === 'bacon')!
    assert.equal(row.purchasePrice, null)
    await saveDistributorProductPrice({ ...row, resalePrice: 45, resalePendingSync: true, mutationId: 'mutation-1' })
    await syncPendingData()
    row = (await getDistributorProductPrices('dist_sync_a')).find((value) => value.productId === 'bacon')!
    assert.equal(row.resalePrice, 45)
    assert.equal(row.conflict, true)
    assert.equal(row.serverResalePrice, 42)
    assert.equal(row.revision, 3)
    assert.equal(row.mutationId, undefined)
    await syncPendingData()
    assert.equal(patchCount, 1)
  } finally { globalThis.fetch = original }
})

test('sessão trocada bloqueia envio de edição pendente do distribuidor anterior', async () => {
  const original = globalThis.fetch
  await saveDistributorSession({ distributorId: 'dist_sync_old', phone: '32999990001', name: 'Old', token: '', loggedInAt: new Date().toISOString() })
  await saveDistributorProductPrice({ distributorId: 'dist_sync_old', productId: 'bacon', enabled: true, purchasePrice: null,
    source: 'street', resalePrice: 40, revision: 1, resalePendingSync: true, mutationId: 'm-old', updatedAt: new Date().toISOString() })
  let mutations = 0
  globalThis.fetch = async (input) => {
    if (String(input) === '/api/session') return new Response(JSON.stringify({ role: 'distributor', distributor: { id: 'dist_sync_new' } }), { status: 200 })
    mutations++
    return new Response('', { status: 500 })
  }
  try {
    await syncPendingData()
    assert.equal(mutations, 0)
  } finally { globalThis.fetch = original }
})


test('produto desabilitado mantém pendência visível e permite descarte sem repetir PATCH 404', async () => {
  const original = globalThis.fetch
  await saveDistributorSession({ distributorId: 'dist_unavailable', phone: '32999990005', name: 'C', token: '', loggedInAt: new Date().toISOString() })
  let visible = true
  let patchCount = 0
  globalThis.fetch = async (input, init) => {
    const path = String(input)
    if (path === '/api/session') return new Response(JSON.stringify({ role: 'distributor', distributor: { id: 'dist_unavailable' } }), { status: 200 })
    if (path === '/api/street/catalog') return new Response(JSON.stringify({ products: visible ? [
      { id: 'bacon', name: 'Bacon', shortLabel: 'Bacon', sortOrder: 0, resalePrice: 40, revision: 1 }
    ] : [] }), { status: 200 })
    if (path === '/api/street/prices' && init?.method === 'PATCH') { patchCount++; visible = false; return new Response('{}', { status: 404 }) }
    if (path === '/api/orders') return new Response('[]', { status: 200 })
    return new Response('', { status: 404 })
  }
  try {
    await pullRemoteCatalog()
    const row = (await getDistributorProductPrices('dist_unavailable')).find((item) => item.productId === 'bacon')!
    await saveDistributorProductPrice({ ...row, resalePrice: 45, resalePendingSync: true, mutationId: 'offline-price' })
    await syncPendingData()
    let pending = (await getDistributorProductPrices('dist_unavailable')).find((item) => item.productId === 'bacon')!
    assert.equal(pending.enabled, false)
    assert.equal(pending.syncError, 'product_unavailable')
    assert.equal(pending.resalePrice, 45)
    await syncPendingData()
    assert.equal(patchCount, 1)
    await discardUnavailablePrice('bacon')
    pending = (await getDistributorProductPrices('dist_unavailable')).find((item) => item.productId === 'bacon')!
    assert.equal(pending.resalePendingSync, false)
    assert.equal(pending.resalePrice, 40)
  } finally { globalThis.fetch = original }
})
