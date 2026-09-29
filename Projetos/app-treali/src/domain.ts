import type { AttendanceAction, AttendanceRecord, Client } from './types'

export function clientIdentity(cityId: string, client: Omit<Client, 'id'>): string {
  const normalized = [client.name, client.address ?? '', client.phone ?? '']
    .join('|')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${cityId}:${normalized}`
}

export function createAttendanceRecord(input: Omit<AttendanceRecord, 'id' | 'capturedAt'>): AttendanceRecord {
  return {
    ...input,
    id: crypto.randomUUID(),
    capturedAt: new Date().toISOString()
  }
}

export function assertAttendanceAction(action: string): asserts action is AttendanceAction {
  const actions: AttendanceAction[] = ['Eu já atendo', 'Cliente Novo Atendido', 'Não é do Segmento', 'Não Existe']
  if (!actions.includes(action as AttendanceAction)) {
    throw new Error('Ação de atendimento inválida.')
  }
}

export function isClientVisibleToSession(session: Pick<{ cityId: string }, 'cityId'>, client: Pick<{ cityId: string }, 'cityId'>): boolean {
  return session.cityId === client.cityId
}
