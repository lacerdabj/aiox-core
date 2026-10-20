import { clearDistributorSession, getDistributorSession, saveDistributorSession } from './db'
import type { DistributorSession } from './types'

export interface AuthState {
  session: DistributorSession | null
  isLoading: boolean
}

interface ServerSession {
  role: 'admin' | 'distributor'
  distributor?: { id: string; name: string; phone: string }
}

function verifiedDistributor(value: ServerSession): DistributorSession | null {
  if (value.role !== 'distributor' || !value.distributor?.id || !value.distributor.phone) return null
  return {
    distributorId: value.distributor.id,
    phone: value.distributor.phone,
    name: value.distributor.name,
    token: '',
    loggedInAt: new Date().toISOString()
  }
}

export async function loginWithPin(phone: string, pin: string): Promise<{
  success: boolean
  session?: DistributorSession
  message?: string
}> {
  const cleanPhone = phone.replace(/\D/g, '')
  if (cleanPhone.length < 10 || !/^\d{4,12}$/.test(pin)) {
    return { success: false, message: 'Informe WhatsApp com DDD e PIN de 4 a 12 dígitos.' }
  }
  try {
    const response = await fetch('/api/auth/distributor-login', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: cleanPhone, pin })
    })
    if (!response.ok) return { success: false, message: 'WhatsApp ou PIN inválido. Consulte a fábrica.' }
    const identityResponse = await fetch('/api/session', { credentials: 'same-origin' })
    if (!identityResponse.ok) throw new Error('Sessão indisponível')
    const session = verifiedDistributor(await identityResponse.json() as ServerSession)
    if (!session) return { success: false, message: 'O servidor não confirmou a identidade do distribuidor.' }
    await saveDistributorSession(session)
    return { success: true, session }
  } catch {
    return { success: false, message: 'Sem conexão com a fábrica. Use uma sessão verificada anteriormente para trabalhar offline.' }
  }
}

export async function checkCurrentSession(): Promise<DistributorSession | null> {
  const cached = await getDistributorSession()
  try {
    const response = await fetch('/api/session', { credentials: 'same-origin' })
    if (response.status === 401 || response.status === 403) {
      await clearDistributorSession()
      return null
    }
    if (!response.ok) throw new Error('Sessão indisponível')
    const session = verifiedDistributor(await response.json() as ServerSession)
    if (!session) {
      await clearDistributorSession()
      return null
    }
    await saveDistributorSession(session)
    return session
  } catch {
    // O cache offline só foi criado após confirmação anterior do servidor.
    return cached?.distributorId ? cached : null
  }
}

export async function executeLogout(): Promise<void> {
  try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }) } finally {
    await clearDistributorSession()
  }
}
