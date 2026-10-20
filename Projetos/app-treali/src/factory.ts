import type { OrderRecord } from './types.ts'

export interface FactoryFlavorRanking {
  flavorId: string
  name: string
  totalPackages: number
  totalRevenue: number
}

export interface DistributorActivity {
  phone: string
  name: string
  ordersCount: number
  totalPackages: number
  totalRevenue: number
  lastActiveAt: string
  status: 'ativo_na_rua' | 'parado'
}

export interface FactoryDashboardData {
  date: string
  totalRevenue: number
  totalPackages: number
  totalOrders: number
  activeDistributorsCount: number
  flavorRanking: FactoryFlavorRanking[]
  distributorActivity: DistributorActivity[]
  recentOrders: Array<{
    id: string
    clientName: string
    distributorName: string
    totalPackages: number
    totalAmount: number
    time: string
    paymentMethod: string
    location?: { latitude?: number; longitude?: number }
  }>
}

// Armazenamento em memória para dados de telemetria recebidos
const receivedOrders: OrderRecord[] = []

export function recordOrderFromStreet(order: OrderRecord): { success: boolean; id: string } {
  // Evita duplicatas se o sync reenviar
  const existingIndex = receivedOrders.findIndex((o) => o.id === order.id)
  if (existingIndex >= 0) {
    receivedOrders[existingIndex] = order
  } else {
    receivedOrders.unshift(order)
  }
  return { success: true, id: order.id }
}

export function getAllReceivedOrders(): OrderRecord[] {
  return [...receivedOrders]
}

export function computeFactoryDashboard(todayDateStr?: string): FactoryDashboardData {
  const targetDate = todayDateStr || new Date().toISOString().slice(0, 10)
  const todayOrders = receivedOrders.filter((o) => o.createdAt.slice(0, 10) === targetDate)

  let totalRevenue = 0
  let totalPackages = 0

  const flavorMap: Record<string, { name: string; packages: number; revenue: number }> = {
    bacon_30g: { name: 'Bacon 30G', packages: 0, revenue: 0 },
    creme_alho_30g: { name: 'Creme de Alho 30G', packages: 0, revenue: 0 },
    tradicional_30g: { name: 'Tradicional 30G', packages: 0, revenue: 0 },
    picante_30g: { name: 'Picante 30G', packages: 0, revenue: 0 }
  }

  const distributorMap: Record<string, DistributorActivity> = {}

  for (const order of todayOrders) {
    totalRevenue += order.totalAmount
    totalPackages += order.totalPackages

    // Agrupa sabores
    for (const item of order.items) {
      if (flavorMap[item.flavorId]) {
        flavorMap[item.flavorId].packages += item.quantity
        flavorMap[item.flavorId].revenue += item.subtotal
      }
    }

    // Agrupa distribuidores
    const dKey = order.distributorPhone || 'desconhecido'
    if (!distributorMap[dKey]) {
      distributorMap[dKey] = {
        phone: order.distributorPhone,
        name: order.distributorName,
        ordersCount: 0,
        totalPackages: 0,
        totalRevenue: 0,
        lastActiveAt: order.createdAt,
        status: 'ativo_na_rua'
      }
    }

    const dist = distributorMap[dKey]
    dist.ordersCount += 1
    dist.totalPackages += order.totalPackages
    dist.totalRevenue += order.totalAmount
    if (new Date(order.createdAt) > new Date(dist.lastActiveAt)) {
      dist.lastActiveAt = order.createdAt
    }
  }

  // Ordena ranking de sabores
  const flavorRanking: FactoryFlavorRanking[] = Object.entries(flavorMap)
    .map(([id, data]) => ({
      flavorId: id,
      name: data.name,
      totalPackages: data.packages,
      totalRevenue: data.revenue
    }))
    .sort((a, b) => b.totalPackages - a.totalPackages)

  // Lista de distribuidores ativos
  const distributorActivity: DistributorActivity[] = Object.values(distributorMap).sort(
    (a, b) => b.totalRevenue - a.totalRevenue
  )

  const recentOrders = todayOrders.slice(0, 10).map((o) => ({
    id: o.id,
    clientName: o.clientName,
    distributorName: o.distributorName,
    totalPackages: o.totalPackages,
    totalAmount: o.totalAmount,
    time: new Date(o.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    paymentMethod: o.paymentMethod === 'PIX_A_VISTA' ? 'Pix / À Vista' : 'Boleto / Faturado',
    location: o.latitude ? { latitude: o.latitude, longitude: o.longitude } : undefined
  }))

  return {
    date: targetDate,
    totalRevenue,
    totalPackages,
    totalOrders: todayOrders.length,
    activeDistributorsCount: distributorActivity.length,
    flavorRanking,
    distributorActivity,
    recentOrders
  }
}
