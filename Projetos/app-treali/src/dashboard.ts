import './dashboard.css'
import { validMoney } from './db'
import type { ProductFlavor, Distributor, OrderRecord } from './types'
type AdminProduct = Omit<ProductFlavor, 'unitPrice'>
import { computeFactoryDashboard, recordOrderFromStreet } from './factory'
import { broadcastSyncMessage, subscribeSyncMessages } from './channel'

const domElement = document.getElementById('factory-app')
if (!domElement) throw new Error('Elemento #factory-app não encontrado.')
const root: HTMLElement = domElement

let isModalOpen = false
let isDraggingProduct = false
let currentEditingProduct: AdminProduct | null = null
let currentEditingDistributor: Distributor | null = null
let catalog: { products: AdminProduct[]; distributors: Distributor[]; prices: import('./types').DistributorProductPrice[] } = { products: [], distributors: [], prices: [] }
let adminLoggedIn = false
async function api(path: string, method = 'GET', body?: unknown): Promise<any> {
  const response = await fetch(path, { method, credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined })
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Acesso da fábrica não autorizado.' : `Falha ao salvar (${response.status}).`)
  return response.json()
}
function showLogin(message = '') {
  adminLoggedIn = false
  root.innerHTML = `<main class="panel-card" style="max-width:420px;margin:10vh auto;padding:24px">
    <h1>Treali Fábrica</h1><p>Entre com seu login e senha de administrador.</p>
    <form id="admin-login-form">
      <div class="form-group"><label class="form-label" for="admin-username">Login</label><input class="form-input" id="admin-username" autocomplete="username" value="Admin" required></div>
      <div class="form-group"><label class="form-label" for="admin-password">Senha</label><input class="form-input" id="admin-password" type="password" autocomplete="current-password" required></div>
      <p id="admin-login-error" role="alert"></p>
      <button class="btn-dash btn-dash-primary" id="admin-login" type="submit">Entrar</button>
    </form>
  </main>`
  const errorElement = document.getElementById('admin-login-error')!
  errorElement.textContent = message
  document.getElementById('admin-login-form')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    const button = document.getElementById('admin-login') as HTMLButtonElement
    button.disabled = true
    const username = (document.getElementById('admin-username') as HTMLInputElement).value.trim()
    const password = (document.getElementById('admin-password') as HTMLInputElement).value
    try { await api('/api/auth/admin-login', 'POST', { username, password }); adminLoggedIn = true; await renderDashboard() }
    catch { errorElement.textContent = 'Não foi possível entrar. Confira o login, a senha e a conexão com o servidor.' }
    finally { button.disabled = false }
  })
}


function showDashboardToast(msg: string) {
  const existing = document.querySelector('.dash-toast')
  if (existing) existing.remove()

  const toast = document.createElement('div')
  toast.className = 'dash-toast'
  toast.innerHTML = `<span>✨</span> <span>${msg}</span>`
  document.body.appendChild(toast)

  setTimeout(() => {
    toast.remove()
  }, 3500)
}

async function syncRemoteAndLocalOrders() {
  const result = await api('/api/orders')
  const orders = Array.isArray(result) ? result : result.orders
  for (const order of orders as OrderRecord[]) recordOrderFromStreet(order)
}

function openProductModal(productToEdit?: AdminProduct) {
  isModalOpen = true
  currentEditingProduct = productToEdit || null

  const isEditing = Boolean(productToEdit)
  const title = isEditing ? '✏️ Editar Produto' : '📦 Cadastrar Novo Sabor'
  const nameVal = productToEdit?.name || ''
  const shortLabelVal = productToEdit?.shortLabel || ''
  const isActiveVal = productToEdit ? productToEdit.isActive !== false : true

  // Remove modal anterior se houver
  const oldModal = document.getElementById('treali-modal-backdrop')
  if (oldModal) oldModal.remove()

  const modalBackdrop = document.createElement('div')
  modalBackdrop.id = 'treali-modal-backdrop'
  modalBackdrop.className = 'modal-backdrop'

  modalBackdrop.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <h3 class="modal-title">${title}</h3>
        <button id="modal-btn-close" class="btn-close-modal" aria-label="Fechar">&times;</button>
      </div>
      <form id="product-form" class="modal-body">
        <div class="form-group">
          <label class="form-label" for="prod-name">Nome Completo do Produto *</label>
          <input
            id="prod-name"
            class="form-input"
            type="text"
            required
            placeholder="Ex: Queijo Coalho 30G"
            value="${nameVal}"
          />
        </div>

        <div class="form-group">
          <label class="form-label" for="prod-short">Rótulo Curto (Botão no App do Motoboy) *</label>
          <input
            id="prod-short"
            class="form-input"
            type="text"
            required
            placeholder="Ex: Queijo Coalho"
            value="${shortLabelVal}"
          />
        </div>

        <label class="form-checkbox-row">
          <input id="prod-active" type="checkbox" ${isActiveVal ? 'checked' : ''} />
          <span style="font-size:14px; font-weight:700; color:#0F172A;">Disponível para venda imediata na rua</span>
        </label>
      </form>
      <div class="modal-footer">
        <button id="modal-btn-cancel" type="button" class="btn-dash">Cancelar</button>
        <button id="modal-btn-save" type="button" class="btn-dash btn-dash-primary">💾 Salvar Produto</button>
      </div>
    </div>
  `

  document.body.appendChild(modalBackdrop)

  const closeModal = () => {
    isModalOpen = false
    modalBackdrop.remove()
  }

  document.getElementById('modal-btn-close')?.addEventListener('click', closeModal)
  document.getElementById('modal-btn-cancel')?.addEventListener('click', closeModal)

  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) closeModal()
  })

  document.getElementById('modal-btn-save')?.addEventListener('click', async () => {
    const nameInput = document.getElementById('prod-name') as HTMLInputElement | null
    const shortInput = document.getElementById('prod-short') as HTMLInputElement | null
    const activeInput = document.getElementById('prod-active') as HTMLInputElement | null

    const name = nameInput?.value.trim() || ''
    const shortLabel = shortInput?.value.trim() || ''
    const isActive = activeInput?.checked ?? true

    if (!name || !shortLabel) {
      alert('Por favor, preencha todos os campos com valores válidos.')
      return
    }

    const id = currentEditingProduct
      ? currentEditingProduct.id
      : `prod_${shortLabel.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now().toString(36)}`

    const productToSave: AdminProduct = {
      id,
      name,
      shortLabel,
      isActive
    }

    try { await api('/api/admin/products', 'POST', { product: productToSave }) }
    catch (error) { alert((error as Error).message); return }

    // Notifica instantaneamente todos os apps conectados
    try {
      broadcastSyncMessage({ type: 'CATALOG_UPDATED', products: [] })
    } catch {
      // noop
    }

    closeModal()
    await renderDashboard()
  })
}

async function openDistributorModal(distToEdit?: Distributor) {
  isModalOpen = true
  currentEditingDistributor = distToEdit || null

  const isEditing = Boolean(distToEdit)
  const title = isEditing ? `✏️ Editar Distribuidor: ${distToEdit?.name}` : '🛵 Cadastrar Novo Distribuidor'
  const nameVal = distToEdit?.name || ''
  const phoneVal = distToEdit?.phone || ''
  const cityVal = distToEdit?.city || 'Muriaé'
  const vehicleVal = distToEdit?.vehicle || 'Moto Honda Fan 160'
  const plateVal = distToEdit?.vehiclePlate || ''
  const accessCodeVal = ''
  const isActiveVal = distToEdit ? distToEdit.isActive !== false : true
  const masterProducts = catalog.products
  const existingPrices = distToEdit ? catalog.prices.filter((row) => row.distributorId === distToEdit.id) : []
  const priceRows = masterProducts.map((product) => {
    const row = existingPrices.find((item) => item.productId === product.id)
    return `<tr><td>${product.name}</td><td><input data-enable="${product.id}" type="checkbox" ${row?.enabled ? 'checked' : ''}></td><td><input data-purchase="${product.id}" type="number" min="0" step="0.01" value="${row?.purchasePrice ?? ''}" placeholder="Preço da fábrica" style="width:115px"></td></tr>`
  }).join('')

  // Remove modal anterior se houver
  const oldModal = document.getElementById('treali-modal-backdrop')
  if (oldModal) oldModal.remove()

  const modalBackdrop = document.createElement('div')
  modalBackdrop.id = 'treali-modal-backdrop'
  modalBackdrop.className = 'modal-backdrop'

  modalBackdrop.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <h3 class="modal-title">${title}</h3>
        <button id="dist-modal-btn-close" class="btn-close-modal" aria-label="Fechar">&times;</button>
      </div>
      <form id="distributor-form" class="modal-body">
        <div class="form-group">
          <label class="form-label" for="dist-name">Nome Completo do Distribuidor *</label>
          <input
            id="dist-name"
            class="form-input"
            type="text"
            required
            placeholder="Ex: Carlos Eduardo"
            value="${nameVal}"
          />
        </div>

        <div class="form-group">
          <label class="form-label" for="dist-phone">WhatsApp com DDD (Somente Números) *</label>
          <input
            id="dist-phone"
            class="form-input"
            type="tel"
            required
            placeholder="Ex: 32988887777"
            value="${phoneVal}"
          />
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div class="form-group">
            <label class="form-label" for="dist-city">Cidade / Região Base *</label>
            <input
              id="dist-city"
              class="form-input"
              type="text"
              required
              placeholder="Ex: Muriaé"
              value="${cityVal}"
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="dist-code">${isEditing ? 'Novo PIN (opcional)' : 'PIN de acesso (4 a 12 dígitos) *'}</label>
            <input
              id="dist-code"
              class="form-input"
              type="text"
              ${isEditing ? '' : 'required'}
              maxlength="12"
              placeholder="4 a 12 dígitos"
              value="${accessCodeVal}"
              style="letter-spacing: 3px; font-weight:800;"
            />
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div class="form-group">
            <label class="form-label" for="dist-vehicle">Veículo de Transporte *</label>
            <input
              id="dist-vehicle"
              class="form-input"
              type="text"
              required
              placeholder="Ex: Moto Honda Fan 160"
              value="${vehicleVal}"
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="dist-plate">Placa (Opcional)</label>
            <input
              id="dist-plate"
              class="form-input"
              type="text"
              placeholder="Ex: RTR-1A23"
              value="${plateVal}"
            />
          </div>
        </div>

        <label class="form-checkbox-row">
          <input id="dist-active" type="checkbox" ${isActiveVal ? 'checked' : ''} />
          <span style="font-size:14px; font-weight:700; color:#0F172A;">Distribuidor Ativo e autorizado a operar na rua</span>
        </label>
        <div class="form-group"><strong>Tabela da fábrica por produto</strong><p>Habilite o produto e informe o preço de compra deste distribuidor.</p><div style="overflow:auto;max-height:240px"><table><thead><tr><th>Produto</th><th>Habilitado</th><th>Compra (R$)</th></tr></thead><tbody>${priceRows}</tbody></table></div></div>
      </form>
      <div class="modal-footer">
        <button id="dist-modal-btn-cancel" type="button" class="btn-dash">Cancelar</button>
        <button id="dist-modal-btn-save" type="button" class="btn-dash btn-dash-primary">💾 Salvar Distribuidor</button>
      </div>
    </div>
  `

  document.body.appendChild(modalBackdrop)

  const closeModal = () => {
    isModalOpen = false
    modalBackdrop.remove()
  }

  document.getElementById('dist-modal-btn-close')?.addEventListener('click', closeModal)
  document.getElementById('dist-modal-btn-cancel')?.addEventListener('click', closeModal)

  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) closeModal()
  })

  document.getElementById('dist-modal-btn-save')?.addEventListener('click', async () => {
    const nameInput = document.getElementById('dist-name') as HTMLInputElement | null
    const phoneInput = document.getElementById('dist-phone') as HTMLInputElement | null
    const cityInput = document.getElementById('dist-city') as HTMLInputElement | null
    const codeInput = document.getElementById('dist-code') as HTMLInputElement | null
    const vehicleInput = document.getElementById('dist-vehicle') as HTMLInputElement | null
    const plateInput = document.getElementById('dist-plate') as HTMLInputElement | null
    const activeInput = document.getElementById('dist-active') as HTMLInputElement | null

    const name = nameInput?.value.trim() || ''
    const phone = (phoneInput?.value || '').replace(/\D/g, '')
    const city = cityInput?.value.trim() || 'Muriaé'
    const accessCode = codeInput?.value.trim() || ''
    const vehicle = vehicleInput?.value.trim() || 'Moto'
    const vehiclePlate = plateInput?.value.trim()
    const isActive = activeInput?.checked ?? true

    if (!name || phone.length < 10) {
      alert('Por favor, informe o Nome Completo e um número de WhatsApp válido com DDD.')
      return
    }

    if ((!currentEditingDistributor || accessCode) && !/^\d{4,12}$/.test(accessCode)) {
      alert('O PIN de acesso deve ter de 4 a 12 dígitos numéricos.')
      return
    }

    const id = currentEditingDistributor
      ? currentEditingDistributor.id
      : `dist_${phone}`

    const distToSave: Distributor = {
      id,
      name,
      phone,
      city,
      vehicle,
      vehiclePlate: vehiclePlate || undefined,
      isActive,
      createdAt: currentEditingDistributor?.createdAt || new Date().toISOString()
    }

    let priceUpdates
    try { priceUpdates = masterProducts.map((product) => {
      const enabled = (document.querySelector(`[data-enable="${product.id}"]`) as HTMLInputElement).checked
      const raw = (document.querySelector(`[data-purchase="${product.id}"]`) as HTMLInputElement).value.trim()
      const purchasePrice = raw === '' ? null : Number(raw)
      if ((enabled && purchasePrice === null) || (purchasePrice !== null && !validMoney(purchasePrice))) {
        throw new Error(`Informe um preço de compra válido para ${product.name}.`)
      }
      const prior = existingPrices.find((item) => item.productId === product.id)
      return { distributorId: id, productId: product.id, enabled, purchasePrice,
        resalePrice: prior?.resalePrice ?? null, resalePendingSync: prior?.resalePendingSync ?? false, revision: prior?.revision,
        updatedAt: new Date().toISOString() }
    }) } catch (error) {
      alert((error as Error).message)
      return
    }

    try {
      await api('/api/admin/distributors', 'POST', { distributor: distToSave, pin: accessCode || undefined })
      const changedRows = priceUpdates.filter((row) => {
        const prior = existingPrices.find((item) => item.productId === row.productId)
        return !prior ? row.enabled || row.purchasePrice !== null : prior.enabled !== row.enabled || prior.purchasePrice !== row.purchasePrice
      })
      if (changedRows.length) await api('/api/admin/prices', 'POST', { rows: changedRows.map(({ distributorId, productId, enabled, purchasePrice, revision }) => ({ distributorId, productId, enabled, purchasePrice, expectedRevision: revision ?? 0 })) })
    } catch (error) { alert((error as Error).message); await renderDashboard(); return }
    broadcastSyncMessage({ type: 'DISTRIBUTORS_UPDATED', distributors: catalog.distributors })
    closeModal()
    await renderDashboard()
  })
}

async function renderDashboard() {
  if (!adminLoggedIn) {
    try { const session = await api('/api/session'); if (session.role !== 'admin') throw new Error('Acesso da fábrica não autorizado.'); adminLoggedIn = true }
    catch { showLogin(); return }
  }
  try {
    catalog = await api('/api/admin/catalog')
    await syncRemoteAndLocalOrders()
  } catch (error) { showLogin((error as Error).message); return }
  const data = computeFactoryDashboard()
  const allProducts = catalog.products
  const allDistributors = catalog.distributors
  const allPrices = catalog.prices
  const commercialRowsHTML = allDistributors.flatMap((distributor) => allProducts.map((product) => {
    const row = allPrices.find((item) => item.distributorId === distributor.id && item.productId === product.id)
    const status = row?.enabled && product.isActive !== false && distributor.isActive !== false ? 'Habilitado' : 'Desabilitado'
    const purchase = row?.purchasePrice === null || row?.purchasePrice === undefined
      ? 'Não definido' : row.purchasePrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    return `<tr><td>${distributor.name}</td><td>${product.name}</td><td>${status}</td><td>${purchase}</td></tr>`
  })).join('')

  const formattedRevenue = data.totalRevenue.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  })

  // Calcula % de giro para cada sabor
  const maxPackages = Math.max(...data.flavorRanking.map((f) => f.totalPackages), 1)

  const flavorRowsHTML = data.flavorRanking.map((f) => {
    const pct = Math.round((f.totalPackages / (data.totalPackages || 1)) * 100)
    const barWidth = Math.round((f.totalPackages / maxPackages) * 100)
    const revFormatted = f.totalRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

    return `
      <div class="flavor-item">
        <div class="flavor-meta">
          <span>${f.name}</span>
          <span style="color:#0F172A;">${f.totalPackages} pct (${pct}%) • <small style="color:#15803D; font-weight:800;">${revFormatted}</small></span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width: ${barWidth}%;"></div>
        </div>
      </div>
    `
  }).join('')

  const distributorRowsHTML = data.distributorActivity.length > 0
    ? data.distributorActivity.map((d) => {
        const dRev = d.totalRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        const timeFormatted = new Date(d.lastActiveAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

        return `
          <tr>
            <td>
              <strong>${d.name || 'Distribuidor'}</strong>
              <div style="font-size:12px; color:#64748B;">${d.phone || 'Sem telefone'}</div>
            </td>
            <td>
              <span class="status-badge active">
                <span class="pulse-dot"></span>
                Ativo na Rua
              </span>
            </td>
            <td>${timeFormatted}</td>
            <td><strong>${d.totalPackages}</strong> pct</td>
            <td style="color:#15803D; font-weight:800;">${dRev}</td>
          </tr>
        `
      }).join('')
    : `<tr><td colspan="5" style="text-align:center; color:#94A3B8; padding:24px;">Nenhum distribuidor ativo no momento.</td></tr>`

  const ordersRowsHTML = data.recentOrders.length > 0
    ? data.recentOrders.map((o) => {
        const valFormatted = o.totalAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        const mapsLink = o.location?.latitude
          ? `<a class="gps-link" href="https://www.google.com/maps?q=${o.location.latitude},${o.location.longitude}" target="_blank">📍 Ver GPS</a>`
          : `<span style="color:#94A3B8;">—</span>`

        return `
          <tr>
            <td><strong>${o.time}</strong></td>
            <td><strong>${o.clientName}</strong></td>
            <td>${o.distributorName}</td>
            <td>${o.totalPackages} pct</td>
            <td>${o.paymentMethod}</td>
            <td style="color:#15803D; font-weight:800;">${valFormatted}</td>
            <td>${mapsLink}</td>
          </tr>
        `
      }).join('')
    : `<tr><td colspan="7" style="text-align:center; color:#94A3B8; padding:24px;">Nenhum pedido recebido hoje ainda.</td></tr>`

  // Linhas do Catálogo de Produtos
  const productRowsHTML = allProducts.map((p, idx) => {
    const isActive = p.isActive !== false

    return `
      <tr class="draggable-row" draggable="true" data-product-id="${p.id}">
        <td class="drag-handle-cell">
          <div class="drag-handle-wrap" title="Arraste para definir a ordem de exibição no app dos distribuidores">
            <span class="drag-icon">⠿</span>
            <span class="drag-order-badge">#${idx + 1}</span>
          </div>
        </td>
        <td>
          <strong>${p.name}</strong>
        </td>
        <td>
          <span style="background:#F1F5F9; padding:4px 8px; border-radius:6px; font-weight:700; font-size:12px; color:#334155;">
            ${p.shortLabel}
          </span>
        </td>
        <td>
          <strong style="color:#15803D; font-size:15px;">Preço por distribuidor</strong>
        </td>
        <td>
          <span class="status-badge ${isActive ? 'active' : 'inactive'}">
            ${isActive ? '🟢 Ativo' : '🔴 Inativo'}
          </span>
        </td>
        <td>
          <div class="action-btns">
            <button class="btn-action btn-action-edit" data-edit-id="${p.id}">
              ✏️ Editar
            </button>
            <button class="btn-action btn-action-toggle ${isActive ? '' : 'activate'}" data-toggle-id="${p.id}">
              ${isActive ? '🚫 Desativar' : '✅ Ativar'}
            </button>
          </div>
        </td>
      </tr>
    `
  }).join('')

  // Linhas da Equipe de Distribuidores
  const distributorTableRowsHTML = allDistributors.map((d) => {
    const isActive = d.isActive !== false
    const formattedPhone = d.phone.length === 11
      ? d.phone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
      : d.phone.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
    const plateBadge = d.vehiclePlate
      ? `<span style="font-size:11px; background:#F1F5F9; color:#475569; padding:2px 6px; border-radius:4px; font-weight:800; border:1px solid #CBD5E1;">${d.vehiclePlate}</span>`
      : ''

    return `
      <tr>
        <td>
          <div style="font-weight:800; font-size:15px; color:#0F172A;">${d.name}</div>
          <div style="font-size:12px; color:#64748B;">ID: ${d.id}</div>
        </td>
        <td>
          <a class="gps-link" href="https://wa.me/55${d.phone}" target="_blank" title="Abrir conversa no WhatsApp">
            💬 ${formattedPhone}
          </a>
        </td>
        <td>
          <span style="font-weight:700; color:#334155;">📍 ${d.city}</span>
        </td>
        <td>
          <div style="display:flex; align-items:center; gap:6px;">
            <span>🛵 ${d.vehicle}</span>
            ${plateBadge}
          </div>
        </td>
        <td>
          <span style="font-family:monospace; font-weight:900; font-size:14px; background:#FEF3C7; color:#B45309; padding:3px 8px; border-radius:6px; letter-spacing:2px; border:1px solid #FCD34D;">
            ••••
          </span>
        </td>
        <td>
          <span class="status-badge ${isActive ? 'active' : 'inactive'}">
            ${isActive ? '🟢 Ativo' : '🔴 Inativo'}
          </span>
        </td>
        <td>
          <div class="action-btns">
            <button class="btn-action btn-action-edit" data-edit-dist-id="${d.id}">
              ✏️ Editar
            </button>
            <button class="btn-action btn-action-toggle ${isActive ? '' : 'activate'}" data-toggle-dist-id="${d.id}">
              ${isActive ? '🚫 Desativar' : '✅ Ativar'}
            </button>
          </div>
        </td>
      </tr>
    `
  }).join('')

  root.innerHTML = `
    <div class="dashboard-container">
      <!-- HEADER -->
      <header class="factory-header">
        <div class="brand-wrapper">
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <h1 class="header-title">Treali Alimentos</h1>
              <span class="brand-badge">Torre de Controle da Fábrica</span>
            </div>
            <p class="header-subtitle">Monitoramento em tempo real de vendas de rua, giro de sabores e distribuidores</p>
          </div>
        </div>

        <div class="header-actions">
          <span style="font-size:13px; color:#64748B; font-weight:600;">
            Atualização ao vivo a cada 10s
          </span>
          <button id="btn-refresh" class="btn-dash">
            🔄 Atualizar Agora
          </button>
          <a href="/" class="btn-dash btn-dash-primary">
            🛵 Abrir App do Motoboy
          </a>
        </div>
      </header>

      <!-- KPIS -->
      <section class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-label">Faturamento Hoje</span>
            <span class="kpi-icon">💰</span>
          </div>
          <div class="kpi-value green">${formattedRevenue}</div>
          <div class="kpi-footer">Total liquidado ou a faturar no dia</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-label">Volume de Pacotes</span>
            <span class="kpi-icon">📦</span>
          </div>
          <div class="kpi-value">${data.totalPackages} <span style="font-size:16px; font-weight:normal; color:#64748B;">pct</span></div>
          <div class="kpi-footer">Maioneses 30G entregues</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-label">Pedidos Fechados</span>
            <span class="kpi-icon">📋</span>
          </div>
          <div class="kpi-value">${data.totalOrders}</div>
          <div class="kpi-footer">PDVs atendidos no dia</div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-label">Distribuidores na Rua</span>
            <span class="kpi-icon">🛵</span>
          </div>
          <div class="kpi-value" style="color:#2563EB;">${data.activeDistributorsCount}</div>
          <div class="kpi-footer">Vendendo ativamente na cidade</div>
        </div>
      </section>

      <!-- CATÁLOGO DE PRODUTOS & PREÇOS (GESTÃO DA FÁBRICA) -->
      <div class="panel-card">
        <div class="panel-title">
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <span>📦 Catálogo mestre de produtos</span>
            <span class="drag-hint-badge">
              ⠿ Arraste as linhas para ordenar a exibição no app dos distribuidores
            </span>
          </div>
          <button id="btn-novo-produto" class="btn-dash btn-dash-primary" style="padding:8px 16px; font-size:13px;">
            + Cadastrar Novo Sabor
          </button>
        </div>
        <div style="overflow-x:auto;">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width:80px; text-align:center;">Ordem</th>
                <th>Produto</th>
                <th>Rótulo Curto (App)</th>
                <th>Preço de referência legado</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody id="products-sortable-tbody">
              ${productRowsHTML}
            </tbody>
          </table>
        </div>
      </div>

      <!-- GESTÃO DA EQUIPE DE DISTRIBUIDORES -->
      <div class="panel-card">
        <div class="panel-title">Tabela de compra por distribuidor e produto</div>
        <p>Edite o distribuidor para habilitar produtos e definir seu preço de compra.</p>
        <div style="overflow-x:auto"><table class="data-table"><thead><tr><th>Distribuidor</th><th>Produto</th><th>Estado</th><th>Compra da fábrica</th></tr></thead><tbody>${commercialRowsHTML}</tbody></table></div>
      </div>

      <!-- GESTÃO DA EQUIPE DE DISTRIBUIDORES -->
      <div class="panel-card">
        <div class="panel-title">
          <div style="display:flex; align-items:center; gap:8px;">
            <span>🛵 Equipe de Distribuidores na Rua</span>
            <span style="font-size:13px; color:#64748B; font-weight:normal;">(Cadastro da equipe, veículos, PIN de acesso e autorização)</span>
          </div>
          <button id="btn-novo-distribuidor" class="btn-dash btn-dash-primary" style="padding:8px 16px; font-size:13px;">
            + Cadastrar Novo Distribuidor
          </button>
        </div>
        <div style="overflow-x:auto;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Distribuidor</th>
                <th>WhatsApp</th>
                <th>Região / Cidade</th>
                <th>Veículo</th>
                <th>PIN de Acesso</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${distributorTableRowsHTML}
            </tbody>
          </table>
        </div>
      </div>

      <!-- GRID PRINCIPAL -->
      <div class="main-grid">
        <!-- TERMÔMETRO DE GIRO DE SABORES -->
        <div class="panel-card">
          <div class="panel-title">
            <span>🔥 Giro dos Sabores (Hoje)</span>
            <span style="font-size:13px; color:#64748B; font-weight:normal;">Ordenado por mais vendido</span>
          </div>
          <div class="flavor-progress-list">
            ${flavorRowsHTML}
          </div>
        </div>

        <!-- DISTRIBUIDORES ATIVOS -->
        <div class="panel-card">
          <div class="panel-title">
            <span>👥 Distribuidores em Campo</span>
            <span style="font-size:13px; color:#64748B; font-weight:normal;">Atividade recente</span>
          </div>
          <div style="overflow-x:auto;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Distribuidor</th>
                  <th>Status</th>
                  <th>Último Pedido</th>
                  <th>Volume</th>
                  <th>Faturamento</th>
                </tr>
              </thead>
              <tbody>
                ${distributorRowsHTML}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- FEED DE ÚLTIMOS PEDIDOS -->
      <div class="panel-card">
        <div class="panel-title">
          <span>📡 Feed de Pedidos em Tempo Real</span>
          <span style="font-size:13px; color:#64748B; font-weight:normal;">Últimos registros vindos da rua</span>
        </div>
        <div style="overflow-x:auto;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Horário</th>
                <th>Estabelecimento (PDV)</th>
                <th>Distribuidor</th>
                <th>Volume</th>
                <th>Pagamento</th>
                <th>Valor Total</th>
                <th>Localização GPS</th>
              </tr>
            </thead>
            <tbody>
              ${ordersRowsHTML}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `

  // Event Listeners
  document.getElementById('btn-refresh')?.addEventListener('click', () => {
    void renderDashboard()
  })

  document.getElementById('btn-novo-produto')?.addEventListener('click', () => {
    openProductModal()
  })

  document.querySelectorAll<HTMLButtonElement>('[data-edit-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const prodId = btn.getAttribute('data-edit-id')
      const targetProd = allProducts.find((p) => p.id === prodId)
      if (targetProd) {
        openProductModal(targetProd)
      }
    })
  })

  document.querySelectorAll<HTMLButtonElement>('[data-toggle-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const prodId = btn.getAttribute('data-toggle-id')
      const targetProd = allProducts.find((p) => p.id === prodId)
      if (targetProd) {
        const updated = {
          ...targetProd,
          isActive: targetProd.isActive === false
        }
        try { await api('/api/admin/products', 'POST', { product: updated }) }
        catch (error) { alert((error as Error).message); return }
        broadcastSyncMessage({ type: 'CATALOG_UPDATED', products: [] })
        await renderDashboard()
      }
    })
  })

  // Distribuidores: Novo, Edição e Desativação/Ativação
  document.getElementById('btn-novo-distribuidor')?.addEventListener('click', () => {
    openDistributorModal()
  })

  document.querySelectorAll<HTMLButtonElement>('[data-edit-dist-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const distId = btn.getAttribute('data-edit-dist-id')
      const targetDist = allDistributors.find((d) => d.id === distId)
      if (targetDist) {
        openDistributorModal(targetDist)
      }
    })
  })

  document.querySelectorAll<HTMLButtonElement>('[data-toggle-dist-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const distId = btn.getAttribute('data-toggle-dist-id')
      const targetDist = allDistributors.find((d) => d.id === distId)
      if (targetDist) {
        const updated = {
          ...targetDist,
          isActive: targetDist.isActive === false
        }
        try { await api('/api/admin/distributors', 'POST', { distributor: updated }) }
        catch (error) { alert((error as Error).message); return }
        broadcastSyncMessage({ type: 'DISTRIBUTORS_UPDATED', distributors: catalog.distributors })
        await renderDashboard()
      }
    })
  })

  // Conecta o Drag & Drop de ordenação de produtos
  bindProductDragAndDrop()
}

function bindProductDragAndDrop() {
  const tbody = document.getElementById('products-sortable-tbody')
  if (!tbody) return

  let draggedRow: HTMLTableRowElement | null = null
  const rows = Array.from(tbody.querySelectorAll<HTMLTableRowElement>('.draggable-row'))

  rows.forEach((row) => {
    row.addEventListener('dragstart', (e) => {
      isDraggingProduct = true
      draggedRow = row
      row.classList.add('dragging')
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', row.getAttribute('data-product-id') || '')
      }
    })

    row.addEventListener('dragover', (e) => {
      e.preventDefault()
      if (!draggedRow || draggedRow === row) return

      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move'
      }

      const rect = row.getBoundingClientRect()
      const middleY = rect.top + rect.height / 2

      row.classList.remove('drag-over-top', 'drag-over-bottom')
      if (e.clientY < middleY) {
        row.classList.add('drag-over-top')
      } else {
        row.classList.add('drag-over-bottom')
      }
    })

    row.addEventListener('dragleave', () => {
      row.classList.remove('drag-over-top', 'drag-over-bottom')
    })

    row.addEventListener('drop', async (e) => {
      e.preventDefault()
      row.classList.remove('drag-over-top', 'drag-over-bottom')
      if (!draggedRow || draggedRow === row) return

      const rect = row.getBoundingClientRect()
      const middleY = rect.top + rect.height / 2
      const placeBefore = e.clientY < middleY

      if (placeBefore) {
        tbody.insertBefore(draggedRow, row)
      } else {
        tbody.insertBefore(draggedRow, row.nextSibling)
      }

      // Atualiza badges visuais com a nova numeração (#1, #2...)
      const currentRows = Array.from(tbody.querySelectorAll<HTMLTableRowElement>('.draggable-row'))
      currentRows.forEach((r, idx) => {
        const badge = r.querySelector('.drag-order-badge')
        if (badge) badge.textContent = `#${idx + 1}`
      })

      const newOrderedIds = currentRows
        .map((r) => r.getAttribute('data-product-id'))
        .filter((id): id is string => Boolean(id))

      // Persiste a nova ordem no banco e propaga para o app dos distribuidores
      try {
        for (const [sortOrder, id] of newOrderedIds.entries()) {
          const product = catalog.products.find((item) => item.id === id)
          if (product) await api('/api/admin/products', 'POST', { product: { ...product, sortOrder } })
        }
        showDashboardToast('Ordem dos produtos atualizada.')
      } catch (error) { alert((error as Error).message) }
      await renderDashboard()
    })

    row.addEventListener('dragend', () => {
      row.classList.remove('dragging')
      rows.forEach((r) => r.classList.remove('drag-over-top', 'drag-over-bottom'))
      draggedRow = null
      setTimeout(() => {
        isDraggingProduct = false
      }, 300)
    })
  })
}

// Ouve eventos do app do motoboy em tempo real via BroadcastChannel
subscribeSyncMessages(async (msg) => {
  if (msg.type === 'ORDER_CREATED') {
    recordOrderFromStreet(msg.order)
    if (adminLoggedIn && !isModalOpen && !isDraggingProduct) {
      await renderDashboard()
    }
  } else if (msg.type === 'ORDER_SYNCED') {
    if (adminLoggedIn && !isModalOpen && !isDraggingProduct) {
      await renderDashboard()
    }
  }
})

// Inicia
void renderDashboard()

// Auto-refresh assíncrono suave a cada 5 segundos (apenas se modal não estiver aberto e não estiver arrastando)
setInterval(() => {
  if (adminLoggedIn && !isModalOpen && !isDraggingProduct) {
    void renderDashboard()
  }
}, 5000)

