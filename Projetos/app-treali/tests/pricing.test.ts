import test from 'node:test'
import assert from 'node:assert/strict'
import { buildOrderItems, eligibleProducts } from '../src/pricing.ts'
import { getDistributorProductPrices, saveDistributorProductPrice } from '../src/db.ts'
import type { DistributorProductPrice, ProductFlavor } from '../src/types.ts'

const product: ProductFlavor = { id: 'p1', name: 'Maionese', shortLabel: 'Maio', unitPrice: 38, isActive: true }
const row = (distributorId: string, purchasePrice: number | null, resalePrice: number | null, enabled = true): DistributorProductPrice => ({
  distributorId, productId: product.id, purchasePrice, resalePrice, enabled, resalePendingSync: false, updatedAt: '2026-10-20'
})

test('individual price rows isolate distributors and ignore master price', async () => {
  await saveDistributorProductPrice(row('a', 25, 39))
  await saveDistributorProductPrice(row('b', 30, 45))
  const a = eligibleProducts([product], await getDistributorProductPrices('a'))
  const b = eligibleProducts([product], await getDistributorProductPrices('b'))
  assert.equal(a[0].unitPrice, 39)
  assert.equal(b[0].unitPrice, 45)
  assert.equal(product.unitPrice, 38)
  await saveDistributorProductPrice(row('a', 27, 39))
  assert.equal((await getDistributorProductPrices('b'))[0].purchasePrice, 30)
})

test('disabled and unpriced products cannot enter an order', async () => {
  assert.deepEqual(eligibleProducts([product], [row('a', 25, 39, false)]), [])
  assert.deepEqual(eligibleProducts([product], [row('a', null, 39)]), [])
  const available = eligibleProducts([product], [row('a', 25, null)])
  assert.equal(available.length, 1)
  assert.throws(() => buildOrderItems(available, { p1: 1 }), /preço de revenda/)
  await assert.rejects(saveDistributorProductPrice(row('a', -1, 39)))
  await assert.rejects(saveDistributorProductPrice(row('a', 25, Number.POSITIVE_INFINITY)))
})

test('finalized item snapshots keep historic resale price', () => {
  const original = eligibleProducts([product], [row('a', 25, 39)])
  const items = buildOrderItems(original, { p1: 3 })
  const changed = eligibleProducts([product], [row('a', 25, 47)])
  assert.equal(items[0].subtotal, 117)
  assert.equal(buildOrderItems(changed, { p1: 3 })[0].subtotal, 141)
  assert.equal(items[0].unitPrice, 39)
})
