import type { AttendanceRecord } from './types'

type Reply = { id: string; ok: boolean; error?: string; records?: AttendanceRecord[] }

export class AttendanceStorage {
  private readonly worker = new Worker(new URL('./sqlite-worker.ts', import.meta.url), { type: 'module' })
  private readonly waiting = new Map<string, { resolve: (records: AttendanceRecord[]) => void; reject: (error: Error) => void }>()
  private ready = false

  constructor() {
    this.worker.onmessage = (event: MessageEvent<Reply>) => {
      const pending = this.waiting.get(event.data.id)
      if (!pending) return
      this.waiting.delete(event.data.id)
      if (event.data.ok) pending.resolve(event.data.records ?? [])
      else pending.reject(new Error(event.data.error ?? 'Falha no SQLite local.'))
    }
  }

  async initialize(): Promise<void> {
    await this.request('initialize')
    this.ready = true
  }

  async save(record: AttendanceRecord): Promise<{ mirrorSaved: boolean; warning?: string }> {
    if (!this.ready) throw new Error('SQLite local indisponível. O atendimento não foi registrado.')
    await this.request('save', { record })
    try {
      localStorage.setItem(`treali:attendance:${record.distributorId}:${record.clientId}`, JSON.stringify(record))
      return { mirrorSaved: true }
    } catch {
      return { mirrorSaved: false, warning: 'Atendimento salvo no SQLite local, mas o espelho de suporte falhou.' }
    }
  }

  async history(distributorId: string, clientId: string): Promise<AttendanceRecord[]> {
    if (!this.ready) throw new Error('Persistência SQLite/OPFS indisponível. O histórico não pode ser consultado.')
    return this.request('history', { distributorId, clientId })
  }

  private request(command: 'initialize' | 'save' | 'history', payload: { record?: AttendanceRecord; distributorId?: string; clientId?: string } = {}): Promise<AttendanceRecord[]> {
    const id = crypto.randomUUID()
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject })
      this.worker.postMessage({ id, command, ...payload })
    })
  }
}
