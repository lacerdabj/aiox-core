export type SessionContext = {
  distributorId: string
  cityId: string
  slug: string
  label: string
}

export type Client = {
  id: string;
  name: string;
  category: string;
  phone: string | null;
  address: string | null;
  origin?: 'catalog' | 'manual';
  distributorSlug?: string;
}

export const ATTENDANCE_ACTIONS = [
  'Eu já atendo',
  'Cliente Novo Atendido',
  'Não é do Segmento',
  'Não Existe'
] as const

export type AttendanceAction = (typeof ATTENDANCE_ACTIONS)[number]

export type AttendanceRecord = {
  id: string
  distributorId: string
  clientId: string
  action: AttendanceAction
  capturedAt: string
  latitude: number
  longitude: number
  accuracy: number | null
}
