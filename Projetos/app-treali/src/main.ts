import './styles.css'
import { icons } from './icons'
import type {
  ClientPDV,
  DailySummary,
  Distributor,
  DistributorSession,
  FlavorId,
  OrderRecord,
  PaymentMethod,
  ProductFlavor
} from './types'
import {
  getAllClients,
  getAllOrders,
  getDailySummary,
  saveClient,
  saveOrder,
  getDistributorProductPrices, saveDistributorProductPrice, getAllProducts
} from './db'
import { eligibleProducts, buildOrderItems } from './pricing'
import {
  initSyncEngine,
  onSyncStatusChange,
  syncPendingData,
  pullRemoteCatalog,
  discardUnavailablePrice
} from './sync'
import {
  checkCurrentSession,
  executeLogout,
  loginWithPin
} from './auth'
import { broadcastSyncMessage, subscribeSyncMessages } from './channel'
import { captureCurrentPosition, tryReverseGeocode } from './gps'
import {
  buildReceiptMessage,
  formatBrazilianPhone,
  openNavigationRoute,
  openWhatsApp,
  validateBrazilianMobilePhone
} from './whatsapp'
import { calculateRepurchaseStatus } from './commercial'

const domElement = document.getElementById('app')
if (!domElement) {
  throw new Error('Elemento #app não encontrado no DOM.')
}
const appRoot: HTMLElement = domElement

type ScreenType = 'login' | 'home' | 'order' | 'receipt'

interface AppState {
  session: DistributorSession | null
  currentScreen: ScreenType
  syncStatus: 'idle' | 'syncing' | 'error' | 'synced'
  pendingSyncCount: number
  distributors: Distributor[]
  clients: ClientPDV[]
  products: ProductFlavor[]
  pendingPriceIds: Set<string>
  conflictPriceIds: Set<string>
  remoteConflictPrices: Map<string, number | null>
  unavailablePrices: Array<{ productId: string; name: string }>
  clientSearchQuery: string
  todayClientOrders: Map<string, { totalPackages: number; totalAmount: number }>
  dailySummary: DailySummary
  // Estado da Tela 2 (Pedido)
  orderDraft: {
    mode: 'existing' | 'new'
    selectedClientId: string
    newClient: {
      name: string
      contactName: string
      whatsapp: string
      city: string
      neighborhood: string
      latitude?: number
      longitude?: number
    }
    newClientWhatsappError?: string
    quantities: Record<FlavorId, number>
    paymentMethod: PaymentMethod
    nextDelivery: string
    isGpsLoading: boolean
  }
  // Estado da Tela 3 (Recibo)
  completedOrder: OrderRecord | null
  // Estado do Login do Distribuidor com PIN
  loginForm: {
    phone: string
    name: string
    pin: string
    error: string
    isLoading: boolean
    selectedDistributorId: string
    showCustomPhone: boolean
    showSmsFallback: boolean
    step: 'pin' | 'sms'
    previewCode: string
  }
}

const state: AppState = {
  session: null,
  currentScreen: 'login',
  syncStatus: 'idle',
  pendingSyncCount: 0,
  distributors: [],
  clients: [],
  products: [],
  pendingPriceIds: new Set(),
  conflictPriceIds: new Set(),
  remoteConflictPrices: new Map(),
  unavailablePrices: [],
  clientSearchQuery: '',
  todayClientOrders: new Map(),
  dailySummary: {
    totalAmount: 0,
    totalPackages: 0,
    totalOrders: 0,
    pendingSyncCount: 0
  },
  orderDraft: {
    mode: 'existing',
    selectedClientId: '',
    newClient: {
      name: '',
      contactName: '',
      whatsapp: '',
      city: 'Muriaé',
      neighborhood: '',
      latitude: undefined,
      longitude: undefined
    },
    newClientWhatsappError: '',
    quantities: {
      bacon_30g: 0,
      creme_alho_30g: 0,
      tradicional_30g: 0,
      picante_30g: 0
    },
    paymentMethod: 'PIX_A_VISTA',
    nextDelivery: 'Terça-feira',
    isGpsLoading: false
  },
  completedOrder: null,
  loginForm: {
    phone: typeof localStorage !== 'undefined' ? (localStorage.getItem('treali_last_phone') || '') : '',
    name: '',
    pin: '',
    error: '',
    isLoading: false,
    selectedDistributorId: '',
    showCustomPhone: false,
    showSmsFallback: false,
    step: 'pin',
    previewCode: ''
  }
}

// Vibração tátil sutil para a "Regra do Dedo Gordo"
function hapticFeedback(ms = 30) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(ms)
    } catch {
      // Ignora se não permitido pelo dispositivo
    }
  }
}

function showToast(message: string, iconSvg?: string) {
  const existing = document.querySelector('.toast')
  if (existing) existing.remove()

  const toast = document.createElement('div')
  toast.className = 'toast'
  toast.innerHTML = `${iconSvg || icons.check} <span>${message}</span>`
  document.body.appendChild(toast)

  setTimeout(() => {
    toast.remove()
  }, 3200)
}

async function refreshData() {
  state.clients = await getAllClients()
  const priceRows = state.session?.distributorId ? await getDistributorProductPrices(state.session.distributorId) : []
  state.pendingPriceIds = new Set(priceRows.filter((row) => row.resalePendingSync).map((row) => row.productId))
  state.conflictPriceIds = new Set(priceRows.filter((row) => row.conflict).map((row) => row.productId))
  state.remoteConflictPrices = new Map(priceRows.filter((row) => row.conflict).map((row) => [row.productId, row.serverResalePrice ?? null]))
  const cachedProducts = await getAllProducts()
  state.unavailablePrices = priceRows.filter((row) => row.syncError === 'product_unavailable' && row.resalePendingSync)
    .map((row) => ({ productId: row.productId, name: cachedProducts.find((product) => product.id === row.productId)?.name || row.productId }))
  state.products = state.session?.distributorId
    ? eligibleProducts(cachedProducts, priceRows)
    : []
  state.dailySummary = await getDailySummary()
  state.pendingSyncCount = state.dailySummary.pendingSyncCount

  // Identifica clientes que já compraram hoje e mapeia a última compra de cada um
  const allOrders = await getAllOrders()
  const today = new Date().toISOString().slice(0, 10)
  const todayOrders = allOrders.filter((o) => o.createdAt.slice(0, 10) === today)

  state.todayClientOrders = new Map<string, { totalPackages: number; totalAmount: number }>()
  for (const ord of todayOrders) {
    const current = state.todayClientOrders.get(ord.clientId) || { totalPackages: 0, totalAmount: 0 }
    current.totalPackages += ord.totalPackages
    current.totalAmount += ord.totalAmount
    state.todayClientOrders.set(ord.clientId, current)
  }

  // Mapeia data do último pedido registrado para cada cliente
  const clientLastOrderMap = new Map<string, string>()
  for (const ord of allOrders) {
    if (!clientLastOrderMap.has(ord.clientId)) {
      clientLastOrderMap.set(ord.clientId, ord.createdAt)
    }
  }

  for (const cli of state.clients) {
    const orderDate = clientLastOrderMap.get(cli.id)
    if (orderDate && (!cli.lastOrderDate || new Date(orderDate) > new Date(cli.lastOrderDate))) {
      cli.lastOrderDate = orderDate
    }
  }
}

// ==========================
// RENDERIZADOR PRINCIPAL
// ==========================
function render() {
  if (!state.session) {
    renderLoginScreen()
    return
  }

  switch (state.currentScreen) {
    case 'home':
      renderHomeScreen()
      break
    case 'order':
      renderOrderScreen()
      break
    case 'receipt':
      renderReceiptScreen()
      break
    default:
      renderHomeScreen()
  }
}

// ==========================
// HEADER COM BARRA DE STATUS
// ==========================
function createHeaderHTML(): string {
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true
  let syncBadgeClass = 'online'
  let syncBadgeText = 'Online'

  if (!isOnline) {
    syncBadgeClass = 'offline'
    syncBadgeText = `Offline (${state.pendingSyncCount})`
  } else if (state.syncStatus === 'syncing') {
    syncBadgeClass = 'syncing'
    syncBadgeText = 'Sincronizando...'
  } else if (state.pendingSyncCount > 0) {
    syncBadgeClass = 'offline'
    syncBadgeText = `${state.pendingSyncCount} pendente(s)`
  }

  return `
    <header class="app-header">
      <div class="brand-wrapper">
        <div class="brand-title">TREALI</div>
        <div class="brand-sub">MODO RUA</div>
      </div>
      <div class="header-actions">
        <div class="sync-badge ${syncBadgeClass}">
          ${syncBadgeClass === 'syncing' ? icons.refresh : icons.check}
          <span>${syncBadgeText}</span>
        </div>
        <a href="/dashboard.html" class="btn-icon-header" title="Abrir Painel da Fábrica" aria-label="Painel da Fábrica" style="text-decoration:none; display:flex; align-items:center; justify-content:center; font-size:16px;">
          🏢
        </a>
        <button id="btn-logout" class="btn-icon-header" title="Sair da Conta" aria-label="Sair">
          ${icons.logout}
        </button>
      </div>
    </header>
  `
}

function bindHeaderEvents() {
  const logoutBtn = document.getElementById('btn-logout')
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      hapticFeedback(40)
      if (confirm('Deseja sair da sua conta neste aparelho?')) {
        await executeLogout()
        state.session = null
        state.products = []
        state.currentScreen = 'login'
        render()
      }
    })
  }
}

// ==========================
// TELA DE LOGIN COM PIN DO DISTRIBUIDOR
// ==========================
function renderLoginScreen() {
  const f = state.loginForm
  appRoot.innerHTML = `
    <div class="screen-container" style="justify-content:center;max-width:440px;margin:auto;padding-top:32px">
      <h1>TREALI</h1><h2>Entrar no modo rua</h2>
      <p>Use o WhatsApp e o PIN fornecidos pela fábrica.</p>
      ${f.error ? `<p role="alert" style="color:#b91c1c">${f.error}</p>` : ''}
      <label for="login-phone">WhatsApp com DDD</label>
      <input id="login-phone" type="tel" class="input-huge" inputmode="tel" autocomplete="tel" value="${f.phone.replace(/[^0-9]/g, '')}">
      <label for="login-pin">PIN</label>
      <input id="login-pin" type="password" class="input-huge" inputmode="numeric" maxlength="12" autocomplete="current-password">
      <button id="btn-submit-pin" class="btn-huge btn-primary" ${f.isLoading ? 'disabled' : ''}>${f.isLoading ? 'Verificando...' : 'Entrar'}</button>
    </div>`
  const phoneInput = document.getElementById('login-phone') as HTMLInputElement
  const pinInput = document.getElementById('login-pin') as HTMLInputElement
  phoneInput.addEventListener('input', () => { f.phone = phoneInput.value })
  pinInput.addEventListener('input', () => { f.pin = pinInput.value })
  document.getElementById('btn-submit-pin')?.addEventListener('click', async () => {
    f.isLoading = true; f.error = ''; render()
    const result = await loginWithPin(f.phone, f.pin)
    f.isLoading = false
    if (!result.success || !result.session) { f.error = result.message || 'Não foi possível entrar.'; f.pin = ''; render(); return }
    state.session = result.session
    localStorage.setItem('treali_last_phone', result.session.phone)
    try { await pullRemoteCatalog(); await refreshData() } catch { /* cache verificado está disponível offline */ }
    state.currentScreen = 'home'
    render()
    void syncPendingData()
  })
}

// ==========================
// TELA 1: MINHA ROTA & CLIENTES (HOME)
// ==========================
function getFilteredClients(): ClientPDV[] {
  const query = state.clientSearchQuery.trim().toLowerCase()
  let list = state.clients

  if (query) {
    list = list.filter((c) => {
      return (
        c.name.toLowerCase().includes(query) ||
        (c.contactName && c.contactName.toLowerCase().includes(query)) ||
        (c.neighborhood && c.neighborhood.toLowerCase().includes(query)) ||
        (c.city && c.city.toLowerCase().includes(query))
      )
    })
  }

  // Ordenação inteligente da rota:
  // 1. Clientes em "REPOR URGENTE" (>14 dias sem comprar) no topo
  // 2. Clientes com "RECOMPRA PRÓXIMA" (7-14 dias)
  // 3. "NOVO PROSPECT" (sem pedidos anteriores)
  // 4. "ABASTECIDO" (<7 dias)
  // 5. Clientes já atendidos no dia vão para o final
  return [...list].sort((a, b) => {
    const isDoneA = !!state.todayClientOrders.get(a.id)
    const isDoneB = !!state.todayClientOrders.get(b.id)
    const repA = calculateRepurchaseStatus(a.lastOrderDate, isDoneA)
    const repB = calculateRepurchaseStatus(b.lastOrderDate, isDoneB)

    if (repA.priority !== repB.priority) {
      return repA.priority - repB.priority
    }

    // Se ambos tiverem mesma prioridade (ex: URGENTE), quem tem mais dias sem comprar vem primeiro
    if (repA.daysAgo !== null && repB.daysAgo !== null && repA.daysAgo !== repB.daysAgo) {
      return repB.daysAgo - repA.daysAgo
    }

    return a.name.localeCompare(b.name)
  })
}

function renderClientCardsHTML(clients: ClientPDV[]): string {
  if (clients.length === 0) {
    return `
      <div style="text-align:center; background:var(--bg-card); border:2px dashed var(--border-strong); border-radius:var(--radius-lg); padding:32px 16px; color:var(--text-muted); font-weight:700;">
        <div style="font-size:32px; margin-bottom:8px;">📍</div>
        Nenhum cliente encontrado na rota com este filtro.
      </div>
    `
  }

  return clients.map((cli) => {
    const todayOrder = state.todayClientOrders.get(cli.id)
    const isDone = !!todayOrder

    // Termômetro de Recompra
    const repurchase = calculateRepurchaseStatus(cli.lastOrderDate, isDone)
    const isUrgent = repurchase.status === 'URGENT' && !isDone
    const urgentCardClass = isUrgent ? 'urgent-border' : ''

    const badgeHTML = isDone
      ? `<span class="client-badge done">${icons.check} ATENDIDO (${todayOrder.totalPackages} pct)</span>`
      : `<span class="client-badge pending">${icons.route} FALTA VISITAR</span>`

    const repurchaseBadgeHTML = `
      <div class="repurchase-badge ${repurchase.badgeClass}">
        ${repurchase.status === 'URGENT' ? '🚨' : repurchase.status === 'SOON' ? '⚠️' : repurchase.status === 'STOCKED' ? '✅' : '🆕'}
        <span>${repurchase.label}</span>
      </div>
    `

    const orderBtnText = isDone
      ? `${icons.check} + Repetir / Novo Pedido`
      : `${icons.cart} + Lançar Pedido`

    const orderBtnClass = isDone ? 'btn-card-order repeat' : 'btn-card-order'

    return `
      <div class="client-card ${isDone ? 'done' : ''} ${urgentCardClass}">
        <div class="client-header" data-client-id="${cli.id}">
          <div>
            <div class="client-name">${cli.name}</div>
            <div class="client-meta">
              <span>${icons.user} ${cli.contactName || 'Responsável'}</span>
              <span>•</span>
              <span>${cli.neighborhood ? `${cli.neighborhood}, ` : ''}${cli.city}</span>
            </div>
            ${repurchaseBadgeHTML}
          </div>
          ${badgeHTML}
        </div>
        <div class="client-actions">
          <button class="btn-action-small whatsapp" data-action="whatsapp" data-phone="${cli.whatsapp}" data-name="${cli.contactName || cli.name}">
            ${icons.whatsapp} WhatsApp
          </button>
          <button class="btn-action-small route" data-action="route" data-name="${cli.name}" data-city="${cli.city}" data-addr="${cli.address || ''}" data-lat="${cli.latitude || ''}" data-lng="${cli.longitude || ''}">
            ${icons.route} Como Chegar
          </button>
        </div>
        <button class="${orderBtnClass}" data-action="create-order" data-client-id="${cli.id}">
          ${orderBtnText}
        </button>
      </div>
    `
  }).join('')
}

function bindRouteListEvents() {
  document.querySelectorAll('[data-action="create-order"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const clientId = (e.currentTarget as HTMLElement).getAttribute('data-client-id')
      if (clientId) {
        hapticFeedback(40)
        resetOrderDraft()
        state.orderDraft.mode = 'existing'
        state.orderDraft.selectedClientId = clientId
        state.currentScreen = 'order'
        render()
      }
    })
  })

  document.querySelectorAll('[data-action="whatsapp"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      hapticFeedback(30)
      const phone = (e.currentTarget as HTMLElement).getAttribute('data-phone')
      const name = (e.currentTarget as HTMLElement).getAttribute('data-name')
      if (phone) {
        openWhatsApp(phone, `Olá ${name || ''}, estou a caminho com as maioneses Treali!`)
      }
    })
  })

  document.querySelectorAll('[data-action="route"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      hapticFeedback(30)
      const el = e.currentTarget as HTMLElement
      const name = el.getAttribute('data-name') || ''
      const city = el.getAttribute('data-city') || ''
      const addr = el.getAttribute('data-addr') || ''
      const lat = el.getAttribute('data-lat') ? Number(el.getAttribute('data-lat')) : undefined
      const lng = el.getAttribute('data-lng') ? Number(el.getAttribute('data-lng')) : undefined
      openNavigationRoute(name, city, addr, lat, lng)
    })
  })
}

function unavailablePriceNoticeHTML(): string {
  if (!state.unavailablePrices.length) return ''
  return `<section role="alert" style="padding:14px;margin:12px 0;border:2px solid #b91c1c;border-radius:10px;background:#fff1f2">
    <strong>Edição de preço sem sincronização</strong><p>A fábrica desabilitou estes produtos. A edição local não será enviada:</p>
    ${state.unavailablePrices.map((item) => `<div>${item.name} <button type="button" data-discard-price="${item.productId}">Descartar edição local</button></div>`).join('')}
  </section>`
}
function bindUnavailablePriceEvents(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-discard-price]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!state.session?.distributorId) return
      await discardUnavailablePrice(button.dataset.discardPrice || '')
      await refreshData()
      render()
    })
  })
}

function renderHomeScreen() {
  const summary = state.dailySummary
  const formattedRevenue = summary.totalAmount.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  })

  const filteredClients = getFilteredClients()
  const clientsHTML = renderClientCardsHTML(filteredClients)

  const formattedPhone = state.session?.phone
    ? state.session.phone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
    : ''

  appRoot.innerHTML = `
    ${createHeaderHTML()}
    <div class="screen-container">
      ${unavailablePriceNoticeHTML()}
      <!-- IDENTIFICAÇÃO DO DISTRIBUIDOR CONECTADO -->
      <div class="distributor-bar">
        <div class="distributor-bar-left">
          <div class="distributor-bar-avatar">🛵</div>
          <div class="distributor-bar-text">
            <span class="distributor-bar-label">Distribuidor Ativo</span>
            <span class="distributor-bar-name">${state.session?.name || 'Distribuidor Treali'}</span>
          </div>
        </div>
        ${formattedPhone ? `<span class="distributor-bar-phone">${formattedPhone}</span>` : ''}
      </div>

      <!-- BOTÃO HERO GIGANTE NO TOPO -->
      <button id="btn-top-new-order" class="btn-huge btn-primary" style="height:64px; font-size:21px;">
        ${icons.cart} + NOVO PEDIDO
      </button>

      <!-- PLACAR DO DIA / FATURAMENTO IMPONENTE -->
      <div class="daily-scorecard">
        <div class="score-item">
          <span class="score-label">Faturado Hoje</span>
          <span class="score-value green">${formattedRevenue}</span>
        </div>
        <div class="score-item bordered">
          <span class="score-label">Entregues</span>
          <span class="score-value">${summary.totalPackages} <span class="score-unit">pct</span></span>
        </div>
        <div class="score-item">
          <span class="score-label">Pedidos</span>
          <span class="score-value">${summary.totalOrders}</span>
        </div>
      </div>

      <!-- Resumo de vendas; margem depende do custo individual. -->
      <div class="profit-banner-card">
        <div class="profit-header">
          <div class="profit-label">
            <span>💰</span>
            <span>Vendas do dia</span>
          </div>
        </div>
        <div class="profit-value-highlight">${formattedRevenue}</div>
      </div>

      <!-- BARRA DE BUSCA RÁPIDA -->
      <div class="search-wrapper">
        <span class="search-icon">${icons.search}</span>
        <input id="search-client" class="search-input" placeholder="Buscar cliente ou bairro na rota..." value="${state.clientSearchQuery}" />
      </div>

      <!-- LISTA DA ROTA -->
      <div class="section-title">
        <div style="display:flex; align-items:center; gap:8px;">
          <span>📍 Clientes da Minha Rota</span>
          <span class="badge-count">${state.clients.length}</span>
        </div>
        <button id="btn-add-client-quick" style="background:var(--bg-card); border:2px solid var(--border-strong); color:var(--text-body); font-size:13px; font-weight:800; padding:6px 12px; border-radius:var(--radius-sm); cursor:pointer;">
          + Novo PDV
        </button>
      </div>

      <div id="route-list-container" class="route-list">
        ${clientsHTML}
      </div>
    </div>
  `

  bindHeaderEvents()
  bindUnavailablePriceEvents()
  bindRouteListEvents()

  // Busca instantânea de clientes
  const searchInput = document.getElementById('search-client') as HTMLInputElement | null
  searchInput?.addEventListener('input', () => {
    state.clientSearchQuery = searchInput.value
    const listContainer = document.getElementById('route-list-container')
    if (listContainer) {
      listContainer.innerHTML = renderClientCardsHTML(getFilteredClients())
      bindRouteListEvents()
    }
  })

  // Botão gigante Novo Pedido
  document.getElementById('btn-top-new-order')?.addEventListener('click', () => {
    hapticFeedback(40)
    resetOrderDraft()
    state.currentScreen = 'order'
    render()
  })

  // Botão Novo PDV
  document.getElementById('btn-add-client-quick')?.addEventListener('click', () => {
    hapticFeedback(40)
    resetOrderDraft()
    state.orderDraft.mode = 'new'
    state.currentScreen = 'order'
    render()
  })
}

// ==========================
// TELA 2: REGISTRO DE PEDIDO / NOVO PDV
// ==========================
function resetOrderDraft() {
  const initialQuantities: Record<string, number> = {}
  for (const prod of state.products) {
    initialQuantities[prod.id] = 0
  }

  state.orderDraft = {
    mode: state.clients.length > 0 ? 'existing' : 'new',
    selectedClientId: state.clients.length > 0 ? state.clients[0].id : '',
    newClient: {
      name: '',
      contactName: '',
      whatsapp: '',
      city: 'Muriaé',
      neighborhood: '',
      latitude: undefined,
      longitude: undefined
    },
    newClientWhatsappError: '',
    quantities: initialQuantities,
    paymentMethod: 'PIX_A_VISTA',
    nextDelivery: 'Terça-feira',
    isGpsLoading: false
  }
}

function calculateOrderTotal(): { totalPackages: number; totalAmount: number } {
  let totalPackages = 0
  let totalAmount = 0

  for (const flavor of state.products) {
    const qty = state.orderDraft.quantities[flavor.id] || 0
    totalPackages += qty
    if (Number.isFinite(flavor.unitPrice)) totalAmount += qty * flavor.unitPrice
  }

  return { totalPackages, totalAmount }
}

function renderOrderScreen() {
  const d = state.orderDraft
  const { totalPackages, totalAmount } = calculateOrderTotal()
  const formattedTotal = totalAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const clientOptionsHTML = state.clients.map((c) => {
    const selected = c.id === d.selectedClientId ? 'selected' : ''
    return `<option value="${c.id}" ${selected}>${c.name} (${c.neighborhood || c.city})</option>`
  }).join('')

  const flavorsHTML = state.products.map((f) => {
    const qty = d.quantities[f.id] || 0
    const hasQty = qty > 0
    const hasPrice = Number.isFinite(f.unitPrice)
    const subtotal = hasPrice ? qty * f.unitPrice : 0

    return `
      <div class="flavor-row ${hasQty ? 'has-qty' : ''}">
        <div class="flavor-info">
          <div class="flavor-name">${f.name}</div>
          <div class="flavor-price">${hasPrice ? `R$ ${f.unitPrice.toFixed(2)} / pacote` : 'Defina seu preço de revenda para vender'}</div>
          <label class="flavor-price">Seu preço (R$) <input data-resale-price="${f.id}" type="number" min="0" step="0.01" value="${hasPrice ? f.unitPrice.toFixed(2) : ''}" style="width:100px" /></label>
          ${state.conflictPriceIds.has(f.id) ? `<small role="alert">Preço em conflito. No servidor: ${state.remoteConflictPrices.get(f.id)?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) ?? 'não definido'}. Confira o valor e confirme para reenviar.</small><button type="button" data-retry-price="${f.id}">Confirmar meu preço</button>` : state.pendingPriceIds.has(f.id) ? '<small>Sincronização do preço pendente</small>' : ''}
          ${hasQty ? `<div class="flavor-subtotal">${icons.check} ${qty} pct = R$ ${subtotal.toFixed(2)}</div>` : ''}
        </div>
        <div class="flavor-stepper">
          <button class="btn-step sub" data-step-sub="${f.id}" ${qty === 0 ? 'disabled' : ''} aria-label="Diminuir ${f.name}">
            ${icons.minus}
          </button>
          <span class="step-count">${qty}</span>
          <button class="btn-step add" data-step-add="${f.id}" ${hasPrice ? '' : 'disabled'} aria-label="Aumentar ${f.name}">
            ${icons.plus}
          </button>
        </div>
      </div>
    `
  }).join('')

  appRoot.innerHTML = `
    ${createHeaderHTML()}
    <div class="screen-container">
      ${unavailablePriceNoticeHTML()}
      <!-- CABEÇALHO DO FECHAMENTO COM VOLTAR -->
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <button id="btn-cancel-order" class="btn-action-small" style="background:var(--bg-card); border:2px solid var(--border-strong); color:var(--text-body); font-size:15px; width:120px;">
          ${icons.arrowLeft} Voltar
        </button>
        <span style="font-size:18px; font-weight:900; color:var(--treali-yellow-dark);">LANÇAR PEDIDO</span>
      </div>

      <!-- SELETOR CLIENTE EXISTENTE OU NOVO -->
      <div class="client-tabs-wrapper">
        <button id="tab-client-existing" class="client-tab-btn ${d.mode === 'existing' ? 'active' : ''}">
          <span>👥</span> Cliente da Rota
        </button>
        <button id="tab-client-new" class="client-tab-btn ${d.mode === 'new' ? 'active' : ''}">
          <span>➕</span> Novo PDV
        </button>
      </div>

      ${
        d.mode === 'existing'
          ? `
        <div class="input-group">
          <label class="input-label">Selecione o Estabelecimento</label>
          <select id="select-existing-client" class="input-huge" style="cursor:pointer;">
            ${clientOptionsHTML}
          </select>
        </div>
      `
          : `
        <div class="pdv-form-card">
          <div class="pdv-form-header">
            <span class="pdv-form-title">
              <span>📍</span> Cadastrar Novo PDV na Rota
            </span>
            <span class="pdv-form-badge">Modo Rua</span>
          </div>

          <div class="input-group">
            <label class="input-label">
              <span>Nome do Estabelecimento *</span>
            </label>
            <input id="input-new-name" type="text" class="input-huge" placeholder="Ex: Hamburgueria do Zé" value="${d.newClient.name}" autocomplete="organization" />
          </div>

          <div class="pdv-grid-row">
            <div class="input-group">
              <label class="input-label">
                <span>Responsável</span>
              </label>
              <input id="input-new-contact" type="text" class="input-huge" placeholder="Ex: Zé (Proprietário)" value="${d.newClient.contactName}" autocomplete="name" />
            </div>
            <div class="input-group">
              <label class="input-label">
                <span>WhatsApp *</span>
              </label>
              <input id="input-new-whatsapp" type="tel" class="input-huge ${d.newClientWhatsappError ? 'has-error' : ''}" placeholder="(32) 99999-8888" value="${formatBrazilianPhone(d.newClient.whatsapp)}" inputmode="tel" autocomplete="tel" />
              ${d.newClientWhatsappError ? `<div id="new-whatsapp-error-live" class="input-error-msg">⚠️ ${d.newClientWhatsappError}</div>` : ''}
            </div>
          </div>

          <div class="pdv-grid-row">
            <div class="input-group">
              <label class="input-label">
                <span>Bairro</span>
              </label>
              <input id="input-new-neighborhood" type="text" class="input-huge" placeholder="Ex: Centro" value="${d.newClient.neighborhood}" />
            </div>
            <div class="input-group">
              <label class="input-label">
                <span>Cidade</span>
              </label>
              <input id="input-new-city" type="text" class="input-huge" placeholder="Ex: Muriaé" value="${d.newClient.city}" />
            </div>
          </div>

          <!-- BOTÃO GPS DINÂMICO E RESPONSIVO -->
          <button id="btn-use-gps" type="button" class="btn-gps-responsive ${d.newClient.latitude ? 'gps-captured' : ''}">
            ${
              d.isGpsLoading
                ? `<span>${icons.refresh} Obtendo sinal GPS do satélite...</span>`
                : d.newClient.latitude
                ? `<span>${icons.check} Localização GPS Gravada</span><span class="gps-coords-badge">Lat: ${d.newClient.latitude.toFixed(4)} • Lng: ${d.newClient.longitude?.toFixed(4)}</span>`
                : `<span>${icons.gps} Usar Minha Localização Atual (GPS)</span><span class="gps-coords-badge">Grava coordenadas para roteirização</span>`
            }
          </button>

          <!-- BOTÃO SALVAR APENAS O PDV NA ROTA -->
          <button id="btn-save-pdv-only" type="button" class="pdv-quick-save-btn">
            💾 Salvar Apenas o PDV na Rota
          </button>
        </div>
      `
      }

      <!-- GRADE DE SABORES COM STEPPER GIGANTE -->
      <div class="section-title">
        <span>Sabores Treali (Quantidade de Pacotes)</span>
        <span class="badge-count">${totalPackages} pct</span>
      </div>

      <div class="flavors-grid">
        ${flavorsHTML}
      </div>

      <!-- FORMA DE PAGAMENTO -->
      <div class="section-title">
        <span>Forma de Pagamento</span>
      </div>

      <div class="payment-selector">
        <button class="payment-pill ${d.paymentMethod === 'PIX_A_VISTA' ? 'active' : ''}" data-pay="PIX_A_VISTA">
          ${icons.money} À Vista / Pix
        </button>
        <button class="payment-pill ${d.paymentMethod === 'FATURADO_BOLETO' ? 'active' : ''}" data-pay="FATURADO_BOLETO">
          ${icons.invoice} Faturado / Boleto
        </button>
      </div>

      <!-- PREVISÃO DE ENTREGA -->
      <div class="section-title">
        <span>Próxima Entrega</span>
      </div>

      <div class="delivery-selector">
        <button class="delivery-pill ${d.nextDelivery === 'Terça-feira' ? 'active' : ''}" data-delivery="Terça-feira">
          Terça-feira
        </button>
        <button class="delivery-pill ${d.nextDelivery === 'Quinta-feira' ? 'active' : ''}" data-delivery="Quinta-feira">
          Quinta-feira
        </button>
        <button class="delivery-pill ${d.nextDelivery === 'Amanhã' ? 'active' : ''}" data-delivery="Amanhã">
          Amanhã
        </button>
      </div>

      <!-- TOTAL E BOTÃO FINALIZAR -->
      <div class="total-bar">
        <div>
          <div class="total-bar-label">Total do Pedido</div>
          <div class="total-bar-sub">${totalPackages} pacotes selecionados</div>
        </div>
        <div class="total-bar-value">${formattedTotal}</div>
      </div>

      <button id="btn-finish-order" class="btn-huge btn-success" style="height:66px; font-size:20px;">
        ${icons.check} FINALIZAR PEDIDO (${formattedTotal})
      </button>
    </div>
  `

  bindHeaderEvents()
  bindUnavailablePriceEvents()

  document.querySelectorAll<HTMLButtonElement>('[data-retry-price]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!state.session?.distributorId) return
      const row = (await getDistributorProductPrices(state.session.distributorId)).find((item) => item.productId === button.dataset.retryPrice)
      if (!row?.conflict) return
      await saveDistributorProductPrice({ ...row, conflict: false, resalePendingSync: true,
        mutationId: crypto.randomUUID(), updatedAt: new Date().toISOString() })
      await refreshData()
      render()
      void syncPendingData()
    })
  })

  document.querySelectorAll<HTMLInputElement>('[data-resale-price]').forEach((input) => {
    input.addEventListener('change', async () => {
      const productId = input.dataset.resalePrice!
      if (!state.session?.distributorId) return
      const row = (await getDistributorProductPrices(state.session.distributorId)).find((item) => item.productId === productId)
      const resalePrice = Number(input.value)
      if (!row || input.value.trim() === '' || !Number.isFinite(resalePrice) || resalePrice <= 0 || Math.round(resalePrice * 100) !== resalePrice * 100) {
        alert('Informe um preço de revenda válido em reais e centavos.')
        return
      }
      try {
        await saveDistributorProductPrice({ ...row, resalePrice, resalePendingSync: true, conflict: false, mutationId: crypto.randomUUID(), updatedAt: new Date().toISOString() })
        await refreshData()
        showToast('Preço salvo neste aparelho; sincronização pendente.')
        render()
        void syncPendingData()
      } catch {
        alert('Não foi possível salvar o preço de revenda.')
      }
    })
  })

  // Voltar para Home
  document.getElementById('btn-cancel-order')?.addEventListener('click', () => {
    hapticFeedback(30)
    state.currentScreen = 'home'
    render()
  })

  // Alternar abas cliente
  document.getElementById('tab-client-existing')?.addEventListener('click', () => {
    hapticFeedback(25)
    d.mode = 'existing'
    render()
  })

  document.getElementById('tab-client-new')?.addEventListener('click', () => {
    hapticFeedback(25)
    d.mode = 'new'
    render()
  })

  // Seleção de cliente existente
  const selectClient = document.getElementById('select-existing-client') as HTMLSelectElement | null
  selectClient?.addEventListener('change', () => {
    d.selectedClientId = selectClient.value
  })

  // Captura dos inputs do cliente novo
  const inputName = document.getElementById('input-new-name') as HTMLInputElement | null
  const inputContact = document.getElementById('input-new-contact') as HTMLInputElement | null
  const inputWhatsapp = document.getElementById('input-new-whatsapp') as HTMLInputElement | null
  const inputNeighborhood = document.getElementById('input-new-neighborhood') as HTMLInputElement | null
  const inputCity = document.getElementById('input-new-city') as HTMLInputElement | null

  inputName?.addEventListener('input', () => { d.newClient.name = inputName.value })
  inputContact?.addEventListener('input', () => { d.newClient.contactName = inputContact.value })

  inputWhatsapp?.addEventListener('input', () => {
    const raw = inputWhatsapp.value
    const masked = formatBrazilianPhone(raw)
    inputWhatsapp.value = masked
    d.newClient.whatsapp = masked

    const digitsOnly = masked.replace(/\D/g, '')
    if (digitsOnly.length >= 10) {
      if (!validateBrazilianMobilePhone(masked)) {
        d.newClientWhatsappError = 'Informe um celular/WhatsApp válido com DDD'
        inputWhatsapp.classList.add('has-error')
        let errEl = document.getElementById('new-whatsapp-error-live')
        if (!errEl) {
          errEl = document.createElement('div')
          errEl.id = 'new-whatsapp-error-live'
          errEl.className = 'input-error-msg'
          inputWhatsapp.parentElement?.appendChild(errEl)
        }
        errEl.innerHTML = '⚠️ Informe um celular/WhatsApp válido com DDD'
      } else {
        d.newClientWhatsappError = ''
        inputWhatsapp.classList.remove('has-error')
        document.getElementById('new-whatsapp-error-live')?.remove()
      }
    } else if (d.newClientWhatsappError) {
      d.newClientWhatsappError = ''
      inputWhatsapp.classList.remove('has-error')
      document.getElementById('new-whatsapp-error-live')?.remove()
    }
  })

  inputNeighborhood?.addEventListener('input', () => { d.newClient.neighborhood = inputNeighborhood.value })
  inputCity?.addEventListener('input', () => { d.newClient.city = inputCity.value })

  // Botão GPS
  document.getElementById('btn-use-gps')?.addEventListener('click', async () => {
    d.isGpsLoading = true
    render()

    const pos = await captureCurrentPosition()
    d.isGpsLoading = false

    if (pos) {
      d.newClient.latitude = pos.latitude
      d.newClient.longitude = pos.longitude
      hapticFeedback(60)
      showToast('Coordenadas GPS capturadas com sucesso!')

      // Geocodificação reversa para autocompletar cidade/bairro
      const rev = await tryReverseGeocode(pos.latitude, pos.longitude)
      if (rev) {
        if (rev.city && !d.newClient.city) d.newClient.city = rev.city
        if (rev.neighborhood && !d.newClient.neighborhood) d.newClient.neighborhood = rev.neighborhood
      }
    } else {
      showToast('Não foi possível obter GPS. Prossiga normalmente.')
    }
    render()
  })

  // Salvar apenas o PDV na rota (sem criar pedido imediatamente)
  document.getElementById('btn-save-pdv-only')?.addEventListener('click', async () => {
    if (!d.newClient.name.trim()) {
      alert('Digite o nome do estabelecimento.')
      return
    }

    if (!validateBrazilianMobilePhone(d.newClient.whatsapp)) {
      d.newClientWhatsappError = 'Informe um celular/WhatsApp válido com DDD'
      hapticFeedback(80)
      alert('Informe um celular/WhatsApp válido com DDD')
      inputWhatsapp?.focus()
      inputWhatsapp?.classList.add('has-error')
      let errEl = document.getElementById('new-whatsapp-error-live')
      if (!errEl && inputWhatsapp) {
        errEl = document.createElement('div')
        errEl.id = 'new-whatsapp-error-live'
        errEl.className = 'input-error-msg'
        inputWhatsapp.parentElement?.appendChild(errEl)
      }
      if (errEl) errEl.innerHTML = '⚠️ Informe um celular/WhatsApp válido com DDD'
      return
    }

    const newCli: ClientPDV = {
      distributorId: state.session!.distributorId,
      id: `cli_${Date.now()}`,
      name: d.newClient.name.trim(),
      contactName: d.newClient.contactName.trim() || d.newClient.name.trim(),
      whatsapp: d.newClient.whatsapp.replace(/\D/g, ''),
      city: d.newClient.city.trim() || 'Muriaé',
      neighborhood: d.newClient.neighborhood.trim(),
      latitude: d.newClient.latitude,
      longitude: d.newClient.longitude,
      createdAt: new Date().toISOString(),
      isSynced: false
    }

    await saveClient(newCli)
    state.clients.unshift(newCli)
    hapticFeedback(60)
    showToast(`✓ PDV "${newCli.name}" cadastrado na rota!`)

    // Seleciona o cliente recém-cadastrado para se quiser lançar pedido em seguida
    d.selectedClientId = newCli.id
    d.mode = 'existing'
    d.newClient = {
      name: '',
      contactName: '',
      whatsapp: '',
      city: 'Muriaé',
      neighborhood: '',
      latitude: undefined,
      longitude: undefined
    }

    render()
  })

  // Botões de Stepper +/- para os Sabores
  document.querySelectorAll('[data-step-add]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const flavorId = (e.currentTarget as HTMLElement).getAttribute('data-step-add') as FlavorId
      if (flavorId) {
        hapticFeedback(25)
        d.quantities[flavorId] = (d.quantities[flavorId] || 0) + 1
        render()
      }
    })
  })

  document.querySelectorAll('[data-step-sub]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const flavorId = (e.currentTarget as HTMLElement).getAttribute('data-step-sub') as FlavorId
      if (flavorId) {
        hapticFeedback(25)
        if ((d.quantities[flavorId] || 0) > 0) {
          d.quantities[flavorId]--
          render()
        }
      }
    })
  })

  // Forma de Pagamento
  document.querySelectorAll('[data-pay]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const pay = (e.currentTarget as HTMLElement).getAttribute('data-pay') as PaymentMethod
      if (pay) {
        hapticFeedback(25)
        d.paymentMethod = pay
        render()
      }
    })
  })

  // Previsão de Entrega
  document.querySelectorAll('[data-delivery]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const del = (e.currentTarget as HTMLElement).getAttribute('data-delivery')
      if (del) {
        hapticFeedback(25)
        d.nextDelivery = del
        render()
      }
    })
  })

  // FINALIZAR PEDIDO
  document.getElementById('btn-finish-order')?.addEventListener('click', async () => {
    if (totalPackages === 0) {
      alert('Selecione pelo menos 1 pacote de maionese Treali.')
      return
    }

    let clientToUse: ClientPDV | undefined

    if (d.mode === 'existing') {
      clientToUse = state.clients.find((c) => c.id === d.selectedClientId)
      if (!clientToUse && state.clients.length > 0) {
        clientToUse = state.clients[0]
      }
    } else {
      // Validação de cliente novo
      if (!d.newClient.name.trim()) {
        alert('Digite o nome do estabelecimento.')
        return
      }

      if (!validateBrazilianMobilePhone(d.newClient.whatsapp)) {
        d.newClientWhatsappError = 'Informe um celular/WhatsApp válido com DDD'
        hapticFeedback(80)
        alert('Informe um celular/WhatsApp válido com DDD')
        const inputWhatsapp = document.getElementById('input-new-whatsapp') as HTMLInputElement | null
        inputWhatsapp?.focus()
        inputWhatsapp?.classList.add('has-error')
        let errEl = document.getElementById('new-whatsapp-error-live')
        if (!errEl && inputWhatsapp) {
          errEl = document.createElement('div')
          errEl.id = 'new-whatsapp-error-live'
          errEl.className = 'input-error-msg'
          inputWhatsapp.parentElement?.appendChild(errEl)
        }
        if (errEl) errEl.innerHTML = '⚠️ Informe um celular/WhatsApp válido com DDD'
        return
      }

      // Salva novo cliente no banco
      const newCli: ClientPDV = {
        distributorId: state.session!.distributorId,
        id: `cli_${Date.now()}`,
        name: d.newClient.name.trim(),
        contactName: d.newClient.contactName.trim() || d.newClient.name.trim(),
        whatsapp: d.newClient.whatsapp.replace(/\D/g, ''),
        city: d.newClient.city.trim() || 'Muriaé',
        neighborhood: d.newClient.neighborhood.trim(),
        latitude: d.newClient.latitude,
        longitude: d.newClient.longitude,
        createdAt: new Date().toISOString(),
        isSynced: false
      }

      await saveClient(newCli)
      state.clients.unshift(newCli)
      clientToUse = newCli
    }

    if (!clientToUse) {
      alert('Erro ao selecionar cliente.')
      return
    }

    // Congela preços vigentes por item no momento da finalização.
    let items
    try {
      items = buildOrderItems(state.products, d.quantities)
    } catch (error) {
      alert((error as Error).message)
      return
    }

    const orderRecord: OrderRecord = {
      distributorId: state.session!.distributorId,
      id: `ord_${crypto.randomUUID()}`,
      clientId: clientToUse.id,
      clientName: clientToUse.name,
      contactName: clientToUse.contactName,
      clientWhatsapp: clientToUse.whatsapp,
      distributorPhone: state.session?.phone || '',
      distributorName: state.session?.name || 'Distribuidor',
      items: items,
      totalPackages: totalPackages,
      totalAmount: items.reduce((sum, item) => sum + item.subtotal, 0),
      paymentMethod: d.paymentMethod,
      nextDelivery: d.nextDelivery,
      latitude: clientToUse.latitude,
      longitude: clientToUse.longitude,
      status: 'pending_sync',
      createdAt: new Date().toISOString()
    }

    // Salva localmente no IndexedDB imediatamente (Offline-first!)
    try {
      await saveOrder(orderRecord)
    } catch {
      alert('Não foi possível salvar o pedido neste aparelho. Tente novamente; nenhum comprovante foi gerado.')
      return
    }

    // Atualiza data do último pedido no cadastro do cliente para o termômetro de recompra
    clientToUse.lastOrderDate = orderRecord.createdAt
    await saveClient(clientToUse)
    hapticFeedback(100)

    // Atualiza resumos
    await refreshData()

    // Notifica instantaneamente a fábrica em tempo real (assíncrono)
    broadcastSyncMessage({ type: 'ORDER_CREATED', order: orderRecord })

    // Dispara sync em background com o servidor REST
    void syncPendingData()

    state.completedOrder = orderRecord
    state.currentScreen = 'receipt'
    render()
  })
}

// ==========================
// TELA 3: COMPROVANTE E COMPARTILHAMENTO
// ==========================
function renderReceiptScreen() {
  const o = state.completedOrder
  if (!o) {
    state.currentScreen = 'home'
    render()
    return
  }

  const formattedTotal = o.totalAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const isPix = o.paymentMethod === 'PIX_A_VISTA'
  const paymentLabel = isPix ? 'À Vista / Pix' : 'Faturado / Boleto'

  const stampClass = isPix ? 'pix' : 'boleto'
  const stampText = isPix ? '✓ PIX CONFIRMADO - À VISTA' : '📄 A FATURAR - BOLETO'

  const itemsListHTML = o.items.map((i) => {
    return `
      <div class="receipt-item-row">
        <span><strong>${i.quantity}x</strong> ${i.name}</span>
        <span>R$ ${i.subtotal.toFixed(2)}</span>
      </div>
    `
  }).join('')

  appRoot.innerHTML = `
    ${createHeaderHTML()}
    <div class="screen-container">
      <div style="text-align:center; margin-bottom:2px;">
        <h2 style="font-size:24px; font-weight:900; color:var(--treali-green-dark); letter-spacing:-0.5px;">
          Pedido Concluído com Sucesso!
        </h2>
        <p style="font-size:14px; color:var(--text-muted); font-weight:600; margin-top:2px;">
          Gravado no aparelho e pronto para envio
        </p>
      </div>

      <!-- COMPROVANTE MODERNO TIPO NOTA / TICKET -->
      <div class="receipt-card">
        <div class="receipt-header">
          <div class="receipt-stamp ${stampClass}">
            ${stampText}
          </div>
          <div class="receipt-title">TREALI ALIMENTOS</div>
          <div class="receipt-client">${o.clientName}</div>
          <div class="receipt-client-info">Resp: ${o.contactName} • Tel: ${o.clientWhatsapp}</div>
        </div>

        <div class="receipt-items">
          ${itemsListHTML}
        </div>

        <div class="receipt-total-row">
          <span>TOTAL</span>
          <span class="receipt-total-value">${formattedTotal}</span>
        </div>

        <div class="receipt-meta">
          <div>💳 Pagamento: <strong>${paymentLabel}</strong></div>
          <div>🚚 Próxima Entrega: <strong>${o.nextDelivery}</strong></div>
          <div>🕒 Data: <strong>${new Date(o.createdAt).toLocaleDateString('pt-BR')} às ${new Date(o.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</strong></div>
          <div>🛵 Distribuidor: <strong>${o.distributorName}</strong></div>
          ${o.latitude ? `<div>📍 Localização GPS: <strong>${o.latitude.toFixed(4)}, ${o.longitude?.toFixed(4)}</strong></div>` : ''}
        </div>
      </div>

      <!-- BOTÃO HERO GIGANTE DE WHATSAPP -->
      <button id="btn-send-whatsapp" class="btn-huge btn-success" style="height:66px; font-size:20px;">
        ${icons.whatsapp} ENVIAR RECIBO NO WHATSAPP
      </button>

      <!-- BOTÃO VOLTAR PARA A ROTA -->
      <button id="btn-back-route" class="btn-huge btn-secondary" style="font-size:16px;">
        ${icons.arrowLeft} Concluir e Voltar para a Rota
      </button>
    </div>
  `

  bindHeaderEvents()

  document.getElementById('btn-send-whatsapp')?.addEventListener('click', () => {
    hapticFeedback(60)
    const msg = buildReceiptMessage(o)
    openWhatsApp(o.clientWhatsapp, msg)
  })

  document.getElementById('btn-back-route')?.addEventListener('click', () => {
    hapticFeedback(40)
    state.completedOrder = null
    state.currentScreen = 'home'
    render()
  })
}

// ==========================
// REGISTRO DE SERVICE WORKER RESILIENTE
// ==========================
function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

  // Em modo de desenvolvimento (Vite dev), desregistra qualquer ServiceWorker antigo
  // para evitar interceptação de arquivos em cache e telas brancas
  if (import.meta.env.DEV) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const reg of registrations) {
        reg.unregister().catch(() => {})
      }
    }).catch(() => {})

    if (typeof caches !== 'undefined') {
      caches.keys().then((keys) => {
        for (const k of keys) {
          caches.delete(k).catch(() => {})
        }
      }).catch(() => {})
    }
    return
  }

  // Em produção (build final), registra o PWA Service Worker
  if (import.meta.env.PROD && window.location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js').catch((err) => {
        console.warn('Aviso no ServiceWorker:', err)
      })
    })
  }
}

// ==========================
// INICIALIZAÇÃO DO APP (RENDER-FIRST IMEDIATO)
// ==========================
async function initApp() {
  registerServiceWorker()

  state.currentScreen = 'login'
  render()

  // 2. Conecta listener de sincronização
  try {
    initSyncEngine()
    subscribeSyncMessages(async (msg) => {
      if (msg.type === 'CATALOG_UPDATED') {
        await refreshData()
        render()
      } else if (msg.type === 'DISTRIBUTORS_UPDATED') {
        void syncPendingData()
      } else if (msg.type === 'ORDER_SYNCED') {
        await refreshData()
      }
    })
    onSyncStatusChange((syncStatus, pendingCount) => {
      state.syncStatus = syncStatus
      state.pendingSyncCount = pendingCount
      if (syncStatus === 'idle' || syncStatus === 'synced') {
        void refreshData().then(() => { if (state.currentScreen === 'order') render() })
      }
      const badge = document.querySelector('.sync-badge')
      if (badge) {
        if (syncStatus === 'syncing') {
          badge.className = 'sync-badge syncing'
          badge.innerHTML = `${icons.refresh} <span>Sincronizando...</span>`
        } else if (pendingCount > 0) {
          badge.className = 'sync-badge offline'
          badge.innerHTML = `${icons.check} <span>${pendingCount} pendente(s)</span>`
        } else {
          badge.className = 'sync-badge online'
          badge.innerHTML = `${icons.check} <span>Online</span>`
        }
      }
    })
  } catch (err) {
    console.warn('Aviso no motor de sincronização:', err)
  }

  // O catálogo só é carregado após a sessão ser verificada.
  try {
    const verifiedSession = await checkCurrentSession()
    if (verifiedSession) {
      state.session = verifiedSession
      state.currentScreen = 'home'
      try { await pullRemoteCatalog() } catch { /* offline: usa cache do distribuidor verificado */ }
    }
  } catch (err) {
    console.warn('Aviso ao verificar sessão:', err)
  }

  // 4. Atualiza os dados da rota e placar diário
  if (state.session) {
    try {
      await refreshData()
    } catch (err) {
      console.warn('Aviso ao atualizar dados:', err)
    }
  }

  // Re-renderiza com os dados consolidados do banco
  render()

  // 5. Tenta sync suave em segundo plano
  void syncPendingData()
}

// Inicia aplicação
void initApp()
