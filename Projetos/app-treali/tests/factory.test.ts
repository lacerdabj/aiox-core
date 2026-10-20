import test from 'node:test'
import assert from 'node:assert/strict'
import { computeFactoryDashboard, recordOrderFromStreet } from '../src/factory.ts'
import type { OrderRecord } from '../src/types.ts'

test('Alimentação em tempo real e telemetria do dashboard da fábrica', () => {
  const today = new Date().toISOString()

  const order1: OrderRecord = {
    id: 'ord_fac_1',
    clientId: 'cli_01',
    clientName: 'Hamburgueria do Zé',
    contactName: 'Zé',
    clientWhatsapp: '32998877661',
    distributorPhone: '32988112233',
    distributorName: 'Distribuidor Carlos',
    items: [
      { flavorId: 'bacon_30g', name: 'Bacon 30G', quantity: 5, unitPrice: 38, subtotal: 190 },
      { flavorId: 'creme_alho_30g', name: 'Creme de Alho 30G', quantity: 3, unitPrice: 38, subtotal: 114 }
    ],
    totalPackages: 8,
    totalAmount: 304,
    paymentMethod: 'PIX_A_VISTA',
    nextDelivery: 'Terça-feira',
    latitude: -21.1352,
    longitude: -42.3685,
    status: 'synced',
    createdAt: today
  }

  const order2: OrderRecord = {
    id: 'ord_fac_2',
    clientId: 'cli_02',
    clientName: 'Lanchonete Ponto Nobre',
    contactName: 'Cláudio',
    clientWhatsapp: '32999112233',
    distributorPhone: '32977445566',
    distributorName: 'Distribuidor Renato',
    items: [
      { flavorId: 'bacon_30g', name: 'Bacon 30G', quantity: 10, unitPrice: 38, subtotal: 380 }
    ],
    totalPackages: 10,
    totalAmount: 380,
    paymentMethod: 'FATURADO_BOLETO',
    nextDelivery: 'Quinta-feira',
    latitude: -21.1401,
    longitude: -42.3712,
    status: 'synced',
    createdAt: today
  }

  recordOrderFromStreet(order1)
  recordOrderFromStreet(order2)

  const dashboard = computeFactoryDashboard()

  // Verificações
  assert.equal(dashboard.totalRevenue, 684) // 304 + 380
  assert.equal(dashboard.totalPackages, 18) // 8 + 10
  assert.equal(dashboard.totalOrders, 2)
  assert.equal(dashboard.activeDistributorsCount, 2)

  // O sabor Bacon deve ser o 1º no ranking com 15 pacotes
  assert.equal(dashboard.flavorRanking[0].flavorId, 'bacon_30g')
  assert.equal(dashboard.flavorRanking[0].totalPackages, 15)

  // Distribuidores na rua rastreados
  assert.equal(dashboard.distributorActivity.length, 2)
  assert.equal(dashboard.distributorActivity[0].name, 'Distribuidor Renato')
  assert.equal(dashboard.distributorActivity[0].totalRevenue, 380)
})
