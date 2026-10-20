import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildReceiptMessage,
  formatBrazilianPhone,
  sanitizePhone,
  validateBrazilianMobilePhone
} from '../src/whatsapp.ts'
import type { OrderRecord } from '../src/types.ts'

test('Sanitização de telefone brasileiro', () => {
  assert.equal(sanitizePhone('32999887766'), '5532999887766')
  assert.equal(sanitizePhone('(32) 99988-7766'), '5532999887766')
  assert.equal(sanitizePhone('+55 32 99988-7766'), '5532999887766')
})

test('Validação de telefones brasileiros: celulares válidos e fixos', () => {
  // Celulares válidos (11 dígitos, DDD entre 11 e 99, nono dígito 9)
  assert.equal(validateBrazilianMobilePhone('32999998888'), true)
  assert.equal(validateBrazilianMobilePhone('(32) 99999-8888'), true)
  assert.equal(validateBrazilianMobilePhone('11987654321'), true)
  assert.equal(validateBrazilianMobilePhone('+55 (21) 98888-7777'), true)
  assert.equal(validateBrazilianMobilePhone('5532998877661'), true)

  // Fixos válidos (10 dígitos, DDD válido)
  assert.equal(validateBrazilianMobilePhone('3237211000'), true)
  assert.equal(validateBrazilianMobilePhone('(32) 3721-1000'), true)
  assert.equal(validateBrazilianMobilePhone('1133334444'), true)
})

test('Validação de telefones brasileiros: casos inválidos e bloqueios', () => {
  // Vazio ou nulo
  assert.equal(validateBrazilianMobilePhone(''), false)

  // Menos de 10 dígitos ou incompleto
  assert.equal(validateBrazilianMobilePhone('329999'), false)
  assert.equal(validateBrazilianMobilePhone('123456789'), false)

  // Mais de 11 dígitos sem DDI válido
  assert.equal(validateBrazilianMobilePhone('123456789012345'), false)

  // DDD inválido (< 11 ou > 99)
  assert.equal(validateBrazilianMobilePhone('00999998888'), false)
  assert.equal(validateBrazilianMobilePhone('05999998888'), false)
  assert.equal(validateBrazilianMobilePhone('10999998888'), false)

  // Celular de 11 dígitos com 9º dígito DIFERENTE de 9
  assert.equal(validateBrazilianMobilePhone('32888887777'), false)
  assert.equal(validateBrazilianMobilePhone('32777776666'), false)
  assert.equal(validateBrazilianMobilePhone('(11) 58888-4444'), false)

  // Sequências repetidas óbvias
  assert.equal(validateBrazilianMobilePhone('00000000000'), false)
  assert.equal(validateBrazilianMobilePhone('11111111111'), false)
  assert.equal(validateBrazilianMobilePhone('99999999999'), false)
  assert.equal(validateBrazilianMobilePhone('0000000000'), false)

  // Sequências numéricas lineares
  assert.equal(validateBrazilianMobilePhone('12345678901'), false)
  assert.equal(validateBrazilianMobilePhone('01234567890'), false)
  assert.equal(validateBrazilianMobilePhone('1234567890'), false)
})

test('Máscara automática progressiva de telefone brasileiro', () => {
  assert.equal(formatBrazilianPhone(''), '')
  assert.equal(formatBrazilianPhone('3'), '(3')
  assert.equal(formatBrazilianPhone('32'), '(32')
  assert.equal(formatBrazilianPhone('329'), '(32) 9')
  assert.equal(formatBrazilianPhone('3299'), '(32) 99')
  assert.equal(formatBrazilianPhone('3237211000'), '(32) 3721-1000') // Fixo 10 dígitos
  assert.equal(formatBrazilianPhone('32999998888'), '(32) 99999-8888') // Celular 11 dígitos
  assert.equal(formatBrazilianPhone('5532999998888'), '(32) 99999-8888') // Com DDI 55
})

test('Geração da mensagem pronta para envio no WhatsApp do cliente', () => {
  const order: OrderRecord = {
    id: 'ord_msg_test',
    clientId: 'cli_01',
    clientName: 'Hamburgueria do Zé',
    contactName: 'Zé',
    clientWhatsapp: '32998877661',
    distributorPhone: '32988112233',
    distributorName: 'Distribuidor Carlos',
    items: [
      { flavorId: 'bacon_30g', name: 'Bacon 30G', quantity: 3, unitPrice: 38, subtotal: 114 },
      { flavorId: 'creme_alho_30g', name: 'Creme de Alho 30G', quantity: 2, unitPrice: 38, subtotal: 76 }
    ],
    totalPackages: 5,
    totalAmount: 190,
    paymentMethod: 'PIX_A_VISTA',
    nextDelivery: 'Terça-feira',
    status: 'pending_sync',
    createdAt: new Date().toISOString()
  }

  const msg = buildReceiptMessage(order)

  assert.ok(msg.includes('Olá Zé, obrigado pelo pedido Treali!'))
  assert.ok(msg.includes('3 pct Bacon + 2 pct Creme de Alho'))
  assert.ok(msg.includes('190,00'))
  assert.ok(msg.includes('À Vista / Pix'))
  assert.ok(msg.includes('Próxima entrega: Terça-feira'))
})
