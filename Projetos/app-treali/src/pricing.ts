import type { DistributorProductPrice, OrderItem, ProductFlavor } from './types'
import { validMoney } from './db'

export function eligibleProducts(products: ProductFlavor[], rows: DistributorProductPrice[]): ProductFlavor[] {
  const byProduct = new Map(rows.map((row) => [row.productId, row]))
  return products.filter((product) => {
    const row = byProduct.get(product.id)
    return product.isActive !== false && row?.enabled === true && (row.source === 'street' || validMoney(row.purchasePrice))
  }).map((product) => {
    const row = byProduct.get(product.id)!
    return { ...product, unitPrice: validMoney(row.resalePrice) ? row.resalePrice : NaN }
  })
}

export function buildOrderItems(products: ProductFlavor[], quantities: Record<string, number>): OrderItem[] {
  return products.flatMap((product) => {
    const quantity = quantities[product.id] || 0
    if (!quantity) return []
    if (!Number.isInteger(quantity) || quantity < 0 || !validMoney(product.unitPrice)) {
      throw new Error(`Informe um preço de revenda válido para ${product.name}.`)
    }
    const subtotal = Math.round(quantity * product.unitPrice * 100) / 100
    return [{ flavorId: product.id, name: product.name, quantity, unitPrice: product.unitPrice, subtotal }]
  })
}
