import type { OrderRecord } from './types'

const INVALID_SEQUENCES = new Set([
  '00000000000',
  '11111111111',
  '22222222222',
  '33333333333',
  '44444444444',
  '55555555555',
  '66666666666',
  '77777777777',
  '88888888888',
  '99999999999',
  '0000000000',
  '1111111111',
  '2222222222',
  '3333333333',
  '4444444444',
  '5555555555',
  '6666666666',
  '7777777777',
  '8888888888',
  '9999999999',
  '12345678901',
  '01234567890',
  '1234567890'
])

export function validateBrazilianMobilePhone(phone: string): boolean {
  if (!phone) return false
  let digits = phone.replace(/\D/g, '')

  // Se veio com DDI 55 e tem 12 ou 13 dígitos, remove o DDI para validar o número nacional
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    digits = digits.slice(2)
  }

  // Deve conter exatamente 10 ou 11 dígitos numéricos
  if (digits.length !== 10 && digits.length !== 11) {
    return false
  }

  // Bloqueia repetições e sequências óbvias
  if (INVALID_SEQUENCES.has(digits)) {
    return false
  }
  if (new Set(digits).size === 1) {
    return false
  }

  // Validação do DDD (entre 11 e 99)
  const ddd = Number(digits.slice(0, 2))
  if (isNaN(ddd) || ddd < 11 || ddd > 99) {
    return false
  }

  // Para celulares atuais (11 dígitos): o nono dígito DEVE ser 9
  if (digits.length === 11) {
    const ninthDigit = digits[2]
    if (ninthDigit !== '9') {
      return false
    }
  }

  return true
}

export function formatBrazilianPhone(phone: string): string {
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2)
  }
  digits = digits.slice(0, 11)

  if (digits.length === 0) return ''
  if (digits.length <= 2) return `(${digits}`
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`
}

export function sanitizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length >= 12) {
    return digits
  }
  return `55${digits}`
}

export function buildReceiptMessage(order: OrderRecord): string {
  const flavorSummaries = order.items
    .filter((item) => item.quantity > 0)
    .map((item) => `${item.quantity} pct ${item.name.replace(' 30G', '')}`)
    .join(' + ')

  const paymentLabel = order.paymentMethod === 'PIX_A_VISTA' ? 'À Vista / Pix' : 'Faturado / Boleto'

  const formattedTotal = order.totalAmount.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  })

  const clientGreetingName = order.contactName.trim() || order.clientName.trim() || 'Cliente'

  return `Olá ${clientGreetingName}, obrigado pelo pedido Treali! Foram ${flavorSummaries}. Total: ${formattedTotal} (${paymentLabel}). Próxima entrega: ${order.nextDelivery}.\n\nTreali Alimentos - O Sabor que Vende!`
}

export function openWhatsApp(phone: string, message: string): void {
  const clean = sanitizePhone(phone)
  const encoded = encodeURIComponent(message)
  const url = `https://wa.me/${clean}?text=${encoded}`
  if (typeof window !== 'undefined') {
    window.open(url, '_blank')
  }
}

export function openNavigationRoute(clientName: string, city: string, address?: string, lat?: number, lng?: number): void {
  if (typeof window === 'undefined') return

  if (lat && lng) {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
    window.open(url, '_blank')
    return
  }

  const query = encodeURIComponent(`${clientName}, ${address || ''}, ${city}`)
  const url = `https://www.google.com/maps/search/?api=1&query=${query}`
  window.open(url, '_blank')
}
