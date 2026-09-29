import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import type { AttendanceRecord } from './types'

let database: any | undefined

function ensureDatabase(): any {
  if (!database) throw new Error('SQLite local ainda não foi inicializado.')
  return database
}

async function initialize(): Promise<void> {
  const sqlite3: any = await sqlite3InitModule()
  const OpfsDb = sqlite3?.oo1?.OpfsDb
  if (typeof OpfsDb !== 'function') throw new Error('SQLite/OPFS não é compatível com este navegador.')
  try {
    database = new OpfsDb('/treali-attendances.sqlite3')
  } catch {
    throw new Error('SQLite/OPFS não é compatível com este navegador.')
  }
  database.exec(`CREATE TABLE IF NOT EXISTS attendance (
    id TEXT PRIMARY KEY,
    distributor_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    action TEXT NOT NULL,
    captured_at TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy REAL
  )`)
}

function save(record: AttendanceRecord): void {
  ensureDatabase().exec({
    sql: 'INSERT INTO attendance (id, distributor_id, client_id, action, captured_at, latitude, longitude, accuracy) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    bind: [record.id, record.distributorId, record.clientId, record.action, record.capturedAt, record.latitude, record.longitude, record.accuracy]
  })
}

function history(distributorId: string, clientId: string): AttendanceRecord[] {
  const records: AttendanceRecord[] = []
  ensureDatabase().exec({
    sql: 'SELECT id, distributor_id, client_id, action, captured_at, latitude, longitude, accuracy FROM attendance WHERE distributor_id = ? AND client_id = ? ORDER BY captured_at DESC',
    bind: [distributorId, clientId],
    rowMode: 'object',
    callback: (row: Record<string, string | number | null>) => records.push({
      id: String(row.id),
      distributorId: String(row.distributor_id),
      clientId: String(row.client_id),
      action: String(row.action) as AttendanceRecord['action'],
      capturedAt: String(row.captured_at),
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      accuracy: row.accuracy === null ? null : Number(row.accuracy),
    }),
  })
  return records
}

self.onmessage = async (event: MessageEvent<{ id: string; command: 'initialize' | 'save' | 'history'; record?: AttendanceRecord; distributorId?: string; clientId?: string }>) => {
  try {
    if (event.data.command === 'initialize') await initialize()
    if (event.data.command === 'save' && event.data.record) save(event.data.record)
    const records = event.data.command === 'history' && event.data.distributorId && event.data.clientId
      ? history(event.data.distributorId, event.data.clientId)
      : undefined
    self.postMessage({ id: event.data.id, ok: true, records })
  } catch (error) {
    self.postMessage({ id: event.data.id, ok: false, error: error instanceof Error ? error.message : 'Falha no SQLite local.' })
  }
}
