import type { OrderRecord, ProductFlavor, Distributor } from './types'

export type SyncMessage =
  | { type: 'ORDER_CREATED'; order: OrderRecord }
  | { type: 'ORDER_SYNCED'; orderId: string; syncedAt: string }
  | { type: 'CATALOG_UPDATED'; products: ProductFlavor[] }
  | { type: 'DISTRIBUTORS_UPDATED'; distributors: Distributor[] }
  | { type: 'REQUEST_DATA_REFRESH' }

type MessageHandler = (msg: SyncMessage) => void

const CHANNEL_NAME = 'treali_sync_mesh_v1'
const handlers: Set<MessageHandler> = new Set()
let channelInstance: BroadcastChannel | null = null

function getChannel(): BroadcastChannel | null {
  if (channelInstance) return channelInstance
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      channelInstance = new BroadcastChannel(CHANNEL_NAME)
      channelInstance.onmessage = (event: MessageEvent<SyncMessage>) => {
        if (event.data && typeof event.data === 'object' && 'type' in event.data) {
          notifyHandlers(event.data)
        }
      }
    } catch (e) {
      console.warn('Aviso: BroadcastChannel indisponível:', e)
      channelInstance = null
    }
  }
  return channelInstance
}

function notifyHandlers(msg: SyncMessage): void {
  for (const handler of handlers) {
    try {
      handler(msg)
    } catch (err) {
      console.warn('Erro ao processar mensagem do canal:', err)
    }
  }
}

// Fallback via StorageEvent para navegadores sem BroadcastChannel ou contextos isolados
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === 'treali_broadcast_fallback' && event.newValue) {
      try {
        const payload = JSON.parse(event.newValue) as { timestamp: number; message: SyncMessage }
        if (payload?.message) {
          notifyHandlers(payload.message)
        }
      } catch {
        // noop
      }
    }
  })
}

export function subscribeSyncMessages(handler: MessageHandler): () => void {
  handlers.add(handler)
  // Garante que o canal está ouvindo
  getChannel()
  return () => {
    handlers.delete(handler)
  }
}

export function broadcastSyncMessage(msg: SyncMessage): void {
  // 1. Envia via BroadcastChannel nativo
  const ch = getChannel()
  if (ch) {
    try {
      ch.postMessage(msg)
    } catch (e) {
      console.warn('Erro ao postar mensagem no BroadcastChannel:', e)
    }
  }

  // 2. Dispara fallback via localStorage para garantir sincronia entre abas
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(
        'treali_broadcast_fallback',
        JSON.stringify({ timestamp: Date.now(), message: msg })
      )
    } catch {
      // ignora quota ou restrições
    }
  }

  // 3. Notifica ouvintes na mesma janela/aba
  notifyHandlers(msg)
}

export function closeChannel(): void {
  if (channelInstance) {
    try {
      channelInstance.close()
    } catch {
      // noop
    }
    channelInstance = null
  }
  handlers.clear()
}
