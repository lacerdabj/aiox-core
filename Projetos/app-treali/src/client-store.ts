import type { Client } from './types'

export type NewClientInput = {
  name: string
  category: string
  address: string
  phone?: string
}

export type NewClientError = {
  field: 'name' | 'category' | 'address'
  message: string
}

export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function manualClientsKey(distributorSlug: string): string {
  return `treali:local-clients.${distributorSlug}`
}

const REQUIRED_FIELDS = [
  { field: 'name', label: 'Nome' },
  { field: 'category', label: 'Categoria' },
  { field: 'address', label: 'Endereço' }
] as const

export function validateNewClient(input: NewClientInput): NewClientError[] {
  const errors: NewClientError[] = []
  for (const check of REQUIRED_FIELDS) {
    const value = input[check.field]
    if (!value || value.trim().length === 0) {
      errors.push({ field: check.field, message: `${check.label} é obrigatório.` })
    }
  }
  return errors
}

export function createManualClient(input: NewClientInput, distributorSlug: string): Client {
  const phone = input.phone?.trim() ? input.phone.trim() : null
  return {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    category: input.category.trim(),
    phone,
    address: input.address.trim(),
    origin: 'manual',
    distributorSlug
  }
}

function isManualClientRecord(item: unknown, distributorSlug: string): item is Client {
  if (typeof item !== 'object' || item === null) return false
  const record = item as Record<string, unknown>
  return typeof record.id === 'string'
    && typeof record.name === 'string'
    && typeof record.category === 'string'
    && (typeof record.address === 'string' || record.address === null)
    && (typeof record.phone === 'string' || record.phone === null)
    && record.origin === 'manual'
    && record.distributorSlug === distributorSlug
}

export function loadManualClients(storage: KeyValueStorage, distributorSlug: string): Client[] {
  const raw = storage.getItem(manualClientsKey(distributorSlug))
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item) => isManualClientRecord(item, distributorSlug))
  } catch {
    return []
  }
}

export function saveManualClients(storage: KeyValueStorage, distributorSlug: string, clients: Client[]): void {
  storage.setItem(manualClientsKey(distributorSlug), JSON.stringify(clients))
}
