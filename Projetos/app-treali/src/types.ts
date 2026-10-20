export type FlavorId = string

export interface ProductFlavor {
  id: string
  name: string
  shortLabel: string
  unitPrice: number
  isActive?: boolean
  sortOrder?: number
  updatedAt?: string
}

/** One commercial row belongs to one distributor and one master product. */
export interface DistributorProductPrice {
  distributorId: string
  productId: string
  enabled: boolean
  purchasePrice: number | null
  resalePrice: number | null
  resalePendingSync: boolean
  revision?: number
  mutationId?: string
  conflict?: boolean
  syncError?: 'product_unavailable'
  serverResalePrice?: number | null
  source?: 'street'
  updatedAt: string
}

export const DEFAULT_PRODUCTS: ProductFlavor[] = [
  { id: 'bacon_30g', name: 'Bacon 30G', shortLabel: 'Bacon', unitPrice: 38.0, isActive: true, sortOrder: 0 },
  { id: 'creme_alho_30g', name: 'Creme de Alho 30G', shortLabel: 'Creme de Alho', unitPrice: 38.0, isActive: true, sortOrder: 1 },
  { id: 'tradicional_30g', name: 'Tradicional 30G', shortLabel: 'Tradicional', unitPrice: 38.0, isActive: true, sortOrder: 2 },
  { id: 'picante_30g', name: 'Picante 30G', shortLabel: 'Picante', unitPrice: 38.0, isActive: true, sortOrder: 3 }
]

export const CATALOG_FLAVORS = DEFAULT_PRODUCTS

export type PaymentMethod = 'PIX_A_VISTA' | 'FATURADO_BOLETO'

export interface ClientPDV {
  distributorId?: string
  id: string
  name: string
  contactName: string
  whatsapp: string
  city: string
  neighborhood: string
  address?: string
  latitude?: number
  longitude?: number
  lastOrderDate?: string
  createdAt: string
  isSynced: boolean
}

export interface OrderItem {
  flavorId: FlavorId
  name: string
  quantity: number
  unitPrice: number
  subtotal: number
}

export interface OrderRecord {
  distributorId?: string
  id: string
  clientId: string
  clientName: string
  contactName: string
  clientWhatsapp: string
  distributorPhone: string
  distributorName: string
  items: OrderItem[]
  totalPackages: number
  totalAmount: number
  paymentMethod: PaymentMethod
  nextDelivery: string
  latitude?: number
  longitude?: number
  status: 'pending_sync' | 'synced'
  createdAt: string
  syncedAt?: string
}

export interface DistributorSession {
  distributorId?: string
  phone: string
  name: string
  token: string
  loggedInAt: string
}

export interface Distributor {
  id: string
  name: string
  phone: string
  city: string
  vehicle: string
  vehiclePlate?: string
  accessCode?: string
  isActive: boolean
  createdAt: string
  updatedAt?: string
}

export interface DailySummary {
  totalAmount: number
  totalPackages: number
  totalOrders: number
  pendingSyncCount: number
}
