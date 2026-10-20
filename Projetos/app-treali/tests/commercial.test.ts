import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateResellerProfit,
  calculateRepurchaseStatus,
  PROFIT_PER_PACKAGE,
  DEFAULT_DAILY_PROFIT_GOAL
} from '../src/commercial.ts'

test('Cálculo de lucro do revendedor: margem de R$ 9,50 por pacote e progresso da meta diária', () => {
  assert.equal(PROFIT_PER_PACKAGE, 9.5)
  assert.equal(DEFAULT_DAILY_PROFIT_GOAL, 150.0)

  // 1. Início do dia (0 pacotes vendidos)
  const zero = calculateResellerProfit(0)
  assert.equal(zero.profit, 0)
  assert.equal(zero.packagesSold, 0)
  assert.equal(zero.isGoalReached, false)
  assert.equal(zero.remainingPackages, 16) // ceil(150 / 9.5) = 16
  assert.equal(zero.progressPercent, 0)

  // 2. Metade da meta (10 pacotes vendidos = R$ 95,00)
  const dez = calculateResellerProfit(10)
  assert.equal(dez.profit, 95.0)
  assert.equal(dez.packagesSold, 10)
  assert.equal(dez.isGoalReached, false)
  assert.equal(dez.remainingPackages, 6) // ceil((150 - 95) / 9.5) = 6
  assert.equal(dez.progressPercent, 63) // round((95 / 150) * 100) = 63%

  // 3. Meta batida (16 pacotes vendidos = R$ 152,00)
  const dezesseis = calculateResellerProfit(16)
  assert.equal(dezesseis.profit, 152.0)
  assert.equal(dezesseis.packagesSold, 16)
  assert.equal(dezesseis.isGoalReached, true)
  assert.equal(dezesseis.remainingPackages, 0)
  assert.equal(dezesseis.progressPercent, 100)

  // 4. Dia excepcional de vendas (25 pacotes vendidos = R$ 237,50)
  const vinteCinco = calculateResellerProfit(25)
  assert.equal(vinteCinco.profit, 237.5)
  assert.equal(vinteCinco.isGoalReached, true)
  assert.equal(vinteCinco.remainingPackages, 0)
  assert.equal(vinteCinco.progressPercent, 100)

  // 5. Suporte a meta personalizada
  const metaAlta = calculateResellerProfit(10, 300.0)
  assert.equal(metaAlta.goal, 300.0)
  assert.equal(metaAlta.isGoalReached, false)
  assert.equal(metaAlta.remainingPackages, 22) // ceil((300 - 95) / 9.5) = 22
  assert.equal(metaAlta.progressPercent, 32)
})

test('Termômetro de recompra: cálculo dos intervalos de dias e prioridades da rota', () => {
  const refDate = new Date('2026-10-17T12:00:00.000Z')

  // 1. Mais de 14 dias sem comprar -> REPOR URGENTE (tag vermelha, prioridade 1 no topo da rota)
  const data18Dias = new Date('2026-09-29T12:00:00.000Z').toISOString() // 18 dias atrás
  const statusUrgente = calculateRepurchaseStatus(data18Dias, false, refDate)
  assert.equal(statusUrgente.status, 'URGENT')
  assert.equal(statusUrgente.daysAgo, 18)
  assert.equal(statusUrgente.badgeClass, 'repurchase-urgent')
  assert.equal(statusUrgente.priority, 1)
  assert.equal(statusUrgente.label, 'REPOR URGENTE: há 18 dias')

  // Exatamente 15 dias sem comprar
  const data15Dias = new Date('2026-10-02T12:00:00.000Z').toISOString() // 15 dias atrás
  const status15 = calculateRepurchaseStatus(data15Dias, false, refDate)
  assert.equal(status15.status, 'URGENT')
  assert.equal(status15.priority, 1)

  // 2. Entre 7 e 14 dias sem comprar -> RECOMPRA PRÓXIMA (tag amarela, prioridade 2)
  const data9Dias = new Date('2026-10-08T12:00:00.000Z').toISOString() // 9 dias atrás
  const statusProxima = calculateRepurchaseStatus(data9Dias, false, refDate)
  assert.equal(statusProxima.status, 'SOON')
  assert.equal(statusProxima.daysAgo, 9)
  assert.equal(statusProxima.badgeClass, 'repurchase-soon')
  assert.equal(statusProxima.priority, 2)
  assert.equal(statusProxima.label, 'RECOMPRA PRÓXIMA: há 9 dias')

  // Limite de 7 dias
  const data7Dias = new Date('2026-10-10T12:00:00.000Z').toISOString() // 7 dias atrás
  const status7 = calculateRepurchaseStatus(data7Dias, false, refDate)
  assert.equal(status7.status, 'SOON')
  assert.equal(status7.priority, 2)

  // Limite de 14 dias
  const data14Dias = new Date('2026-10-03T12:00:00.000Z').toISOString() // 14 dias atrás
  const status14 = calculateRepurchaseStatus(data14Dias, false, refDate)
  assert.equal(status14.status, 'SOON')
  assert.equal(status14.priority, 2)

  // 3. Menos de 7 dias sem comprar -> ABASTECIDO (tag verde, prioridade 4)
  const data3Dias = new Date('2026-10-14T12:00:00.000Z').toISOString() // 3 dias atrás
  const statusAbastecido = calculateRepurchaseStatus(data3Dias, false, refDate)
  assert.equal(statusAbastecido.status, 'STOCKED')
  assert.equal(statusAbastecido.daysAgo, 3)
  assert.equal(statusAbastecido.badgeClass, 'repurchase-stocked')
  assert.equal(statusAbastecido.priority, 4)
  assert.equal(statusAbastecido.label, 'ABASTECIDO: há 3 dias')

  // Comprou ontem (1 dia)
  const data1Dia = new Date('2026-10-16T12:00:00.000Z').toISOString()
  const status1 = calculateRepurchaseStatus(data1Dia, false, refDate)
  assert.equal(status1.status, 'STOCKED')
  assert.equal(status1.daysAgo, 1)
  assert.equal(status1.priority, 4)

  // 4. Sem compras registradas -> NOVO PROSPECT (tag neutra, prioridade 3)
  const statusProspectSemData = calculateRepurchaseStatus(undefined, false, refDate)
  assert.equal(statusProspectSemData.status, 'PROSPECT')
  assert.equal(statusProspectSemData.daysAgo, null)
  assert.equal(statusProspectSemData.badgeClass, 'repurchase-prospect')
  assert.equal(statusProspectSemData.priority, 3)
  assert.equal(statusProspectSemData.label, 'NOVO PROSPECT')

  const statusProspectDataInvalida = calculateRepurchaseStatus('invalid-date', false, refDate)
  assert.equal(statusProspectDataInvalida.status, 'PROSPECT')
  assert.equal(statusProspectDataInvalida.priority, 3)

  // 5. Atendido hoje -> Prioridade 5 (vai para o final da rota)
  const statusAtendidoHoje = calculateRepurchaseStatus(data18Dias, true, refDate)
  assert.equal(statusAtendidoHoje.status, 'STOCKED')
  assert.equal(statusAtendidoHoje.priority, 5)
  assert.equal(statusAtendidoHoje.label, 'ATENDIDO HOJE')
})
