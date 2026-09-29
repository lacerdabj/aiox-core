import type { Client, SessionContext } from './types'

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', ...init })
  const payload = await response.json().catch(() => ({ error: 'Resposta inválida do servidor.' })) as T & { error?: string }
  if (!response.ok) throw new ApiError(payload.error ?? 'Falha ao comunicar com o servidor.', response.status)
  return payload
}

export function login(loginValue: string, password: string): Promise<{ session: SessionContext }> {
  return request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ login: loginValue, password })
  })
}

export function logout(): Promise<void> {
  return request('/api/auth/logout', { method: 'POST' })
}

export function getSession(): Promise<{ session: SessionContext }> {
  return request('/api/session')
}

export function getClients(): Promise<{ clients: Client[] }> {
  return request('/api/clients')
}
