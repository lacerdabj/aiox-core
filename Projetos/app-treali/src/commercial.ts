export const PROFIT_PER_PACKAGE = 9.5
export const DEFAULT_DAILY_PROFIT_GOAL = 150.0

export interface ProfitGoalCalculation {
  profit: number
  goal: number
  packagesSold: number
  remainingPackages: number
  isGoalReached: boolean
  progressPercent: number
}

/**
 * Calcula a margem bruta de lucro do revendedor por pacote e a meta diária
 * Regra: cada pacote vendido gera R$ 9,50 de margem bruta (preço R$ 38,00 - custo R$ 28,50)
 */
export function calculateResellerProfit(
  totalPackagesToday: number,
  goal: number = DEFAULT_DAILY_PROFIT_GOAL
): ProfitGoalCalculation {
  const packagesSold = Math.max(0, totalPackagesToday)
  const profit = packagesSold * PROFIT_PER_PACKAGE
  const isGoalReached = profit >= goal
  const remainingValue = Math.max(0, goal - profit)
  const remainingPackages = isGoalReached ? 0 : Math.ceil(remainingValue / PROFIT_PER_PACKAGE)
  const progressPercent = goal > 0 ? Math.min(100, Math.round((profit / goal) * 100)) : 100

  return {
    profit,
    goal,
    packagesSold,
    remainingPackages,
    isGoalReached,
    progressPercent
  }
}

export type RepurchaseStatus = 'URGENT' | 'SOON' | 'STOCKED' | 'PROSPECT'

export interface RepurchaseInfo {
  status: RepurchaseStatus
  daysAgo: number | null
  label: string
  badgeClass: string
  priority: number // 1: URGENT (> 14 dias), 2: SOON (7-14 dias), 3: PROSPECT (sem compras), 4: STOCKED (< 7 dias), 5: ATTENDED_TODAY
}

/**
 * Calcula o termômetro de recompra do cliente baseado nos dias decorridos desde a última compra
 * - Mais de 14 dias: REPOR URGENTE (vermelho, prioridade 1 na rota)
 * - Entre 7 e 14 dias: RECOMPRA PRÓXIMA (amarelo, prioridade 2 na rota)
 * - Menos de 7 dias: ABASTECIDO (verde, prioridade 4 na rota)
 * - Sem compras registradas: NOVO PROSPECT (neutro, prioridade 3 na rota)
 * - Atendido hoje: prioridade 5 (vai para o final da rota)
 */
export function calculateRepurchaseStatus(
  lastOrderDate?: string,
  attendedToday: boolean = false,
  referenceDate: Date = new Date()
): RepurchaseInfo {
  if (attendedToday) {
    return {
      status: 'STOCKED',
      daysAgo: 0,
      label: 'ATENDIDO HOJE',
      badgeClass: 'repurchase-stocked',
      priority: 5
    }
  }

  if (!lastOrderDate) {
    return {
      status: 'PROSPECT',
      daysAgo: null,
      label: 'NOVO PROSPECT',
      badgeClass: 'repurchase-prospect',
      priority: 3
    }
  }

  const lastTime = new Date(lastOrderDate).getTime()
  if (isNaN(lastTime)) {
    return {
      status: 'PROSPECT',
      daysAgo: null,
      label: 'NOVO PROSPECT',
      badgeClass: 'repurchase-prospect',
      priority: 3
    }
  }

  const diffMs = referenceDate.getTime() - lastTime
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))

  if (diffDays > 14) {
    return {
      status: 'URGENT',
      daysAgo: diffDays,
      label: `REPOR URGENTE: há ${diffDays} dias`,
      badgeClass: 'repurchase-urgent',
      priority: 1
    }
  }

  if (diffDays >= 7) {
    return {
      status: 'SOON',
      daysAgo: diffDays,
      label: `RECOMPRA PRÓXIMA: há ${diffDays} dias`,
      badgeClass: 'repurchase-soon',
      priority: 2
    }
  }

  return {
    status: 'STOCKED',
    daysAgo: diffDays,
    label: `ABASTECIDO: há ${diffDays} dias`,
    badgeClass: 'repurchase-stocked',
    priority: 4
  }
}
