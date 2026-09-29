import './styles.css'
import { getClients, getSession, login, logout } from './api'
import { createManualClient, loadManualClients, saveManualClients, validateNewClient, type KeyValueStorage, type NewClientError } from './client-store'
import { assertAttendanceAction, createAttendanceRecord } from './domain'
import { capturePosition } from './gps'
import { AttendanceStorage } from './storage'
import { ATTENDANCE_ACTIONS, type AttendanceRecord, type Client, type SessionContext } from './types'

const root = document.querySelector<HTMLElement>('#app')
if (!root) throw new Error('Elemento principal não encontrado.')
const appRoot: HTMLElement = root

type AppState = {
  session: SessionContext | null
  clients: Client[]
  selectedClient: Client | null
  storage: AttendanceStorage | null
  storageError: string | null
  history: AttendanceRecord[]
  menuOpen: boolean
  route: 'home' | 'profile' | 'precos' | 'contrato' | 'documentos' | 'ocorrencias'
  statusFilter: 'all' | 'pending' | 'attended'
  catalog: Client[]
  newClient: { name: string; category: string; address: string; phone: string; errors: NewClientError[]; saveError: string } | null
}

const state: AppState = { session: null, clients: [], selectedClient: null, storage: null, storageError: null, history: [], menuOpen: false, route: 'home', statusFilter: 'all', catalog: [], newClient: null }

let bannerIndex = 0
let bannerTimer: number | undefined

type BannerSlide = { src: string; alt: string }

function browserStorage(): KeyValueStorage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

function refreshClients(catalog: Client[]): void {
  state.catalog = catalog
  const storage = state.session ? browserStorage() : null
  const manual = storage && state.session ? loadManualClients(storage, state.session.slug) : []
  state.clients = [...catalog, ...manual]
}

function emptyNewClient(): NonNullable<AppState['newClient']> {
  return { name: '', category: '', address: '', phone: '', errors: [], saveError: '' }
}

function bannerSlides(): BannerSlide[] {
  return [
    { src: '/banners/banner-maionese-rose.jpg', alt: 'Maionese Rosé Treali — mais sabor para seu lanche, ideal para fast food' },
    { src: '/banners/banner-maionese-tradicional.jpg', alt: 'Maionese Tradicional Treali — mais sabor para seu lanche, ideal para fast food' },
    { src: '/banners/banner-maionese-sache.jpg', alt: 'Maionese Tradicional Treali em sachê de 25ml — deixa tudo mais gostoso' },
    { src: '/banners/banner-maionese-cebola-salsa.jpg', alt: 'Maionese Cebola e Salsa Treali — mais sabor para seu lanche, ideal para fast food' }
  ]
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character)
}

function render(message = ''): void {
  stopBanner()
  if (!state.session) {
    appRoot.innerHTML = `<section class="auth-shell"><div class="auth-card"><img src="/icons/icon-192.svg" width="72" height="72" alt="Treali" /><p class="eyebrow">Treali Alimentos</p><h1>Área do distribuidor</h1><p>Entre para acessar a carteira da sua cidade.</p><form id="login-form"><label>Login<input name="login" autocomplete="username" required /></label><label>Senha<input name="password" type="password" autocomplete="current-password" required /></label><button type="submit">Entrar</button><p class="message" role="status">${escapeHtml(message)}</p></form></div></section>`
    document.querySelector<HTMLFormElement>('#login-form')?.addEventListener('submit', onLogin)
    return
  }

  const session = state.session
  const route = state.route
  const isHome = !state.selectedClient && route === 'home'
  const slides = bannerSlides()
  bannerIndex = bannerIndex % slides.length
  const content = state.selectedClient
    ? detailTemplate(state.selectedClient, message)
    : route === 'profile'
      ? profileTemplate()
      : route === 'home'
        ? `<div id="home-results" aria-live="off">${resultsTemplate(message)}</div>`
        : infoTemplate(route)
  appRoot.innerHTML = `<header class="topbar"><button class="menu-button" id="menu-toggle" type="button" aria-expanded="${state.menuOpen ? 'true' : 'false'}" aria-controls="app-menu" aria-label="Abrir menu">☰</button><a class="brand" href="#" aria-label="Voltar para clientes"><img src="/icons/icon-192.svg" width="40" height="40" alt="" />Treali</a><div><span>${escapeHtml(session.label)}</span></div></header>${isHome ? `${bannerTemplate(slides, bannerIndex)}${iconbarTemplate()}${progressTemplate()}` : ''}<div class="scrim${state.menuOpen ? ' visible' : ''}" id="scrim"></div><nav class="drawer${state.menuOpen ? ' open' : ''}" id="app-menu" aria-label="Menu do distribuidor"><span class="avatar" aria-hidden="true">${escapeHtml(avatarInitials(session.label))}</span><p class="drawer-title">${escapeHtml(session.label)}</p><small>📍 ${escapeHtml(session.cityId)}</small><button class="drawer-item" data-nav="home" type="button">Carteira de clientes</button><button class="drawer-item" data-nav="new-client" type="button">Novo Cliente</button><button class="drawer-item" data-nav="profile" type="button">Perfil</button><button class="drawer-item" data-nav="precos" type="button">Preços</button><button class="drawer-item" data-nav="contrato" type="button">Contrato</button><button class="drawer-item" data-nav="documentos" type="button">Documentos</button><div class="drawer-gap" aria-hidden="true"></div><button class="drawer-item" data-nav="ocorrencias" type="button">Ocorrências</button><button class="drawer-item" data-nav="logout" type="button">Sair</button></nav><main class="content">${content}</main>${bottomNavTemplate(isHome)}${state.newClient ? newClientModalTemplate() : ''}`
  document.querySelector<HTMLButtonElement>('#menu-toggle')?.addEventListener('click', toggleMenu)
  document.querySelector<HTMLDivElement>('#scrim')?.addEventListener('click', closeMenu)
  document.querySelectorAll<HTMLButtonElement>('[data-nav]').forEach((button) => button.addEventListener('click', () => onNavigate(button.dataset.nav ?? '')))
  document.querySelectorAll<HTMLButtonElement>('[data-bottom]').forEach((button) => button.addEventListener('click', () => onBottomNav(button.dataset.bottom ?? '')))
  document.querySelector<HTMLAnchorElement>('.brand')?.addEventListener('click', (event) => { event.preventDefault(); state.selectedClient = null; state.route = 'home'; render() })
  if (isHome) bindHomeControls()
  bindViewEvents()
  bindBanner()
  startBanner()
  document.querySelector<HTMLFormElement>('#new-client-form')?.addEventListener('submit', onSaveNewClient)
  document.querySelector<HTMLButtonElement>('#new-client-cancel')?.addEventListener('click', closeNewClient)
  document.querySelector<HTMLDivElement>('#new-client-backdrop')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeNewClient()
  })
}

function bottomNavTemplate(isHome: boolean): string {
  return `<nav class="bottomnav" aria-label="Navegação principal"><button class="bottom-item${isHome ? ' active' : ''}" data-bottom="home" type="button"${isHome ? ' aria-current="page"' : ''}><span aria-hidden="true">⌂</span><small>Início</small></button><button class="bottom-item" data-bottom="menu" type="button"><span aria-hidden="true">☰</span><small>Menu</small></button><button class="bottom-item" data-bottom="logout" type="button"><span aria-hidden="true">⏻</span><small>Sair</small></button></nav>`
}

function onBottomNav(target: string): void {
  if (target === 'logout') {
    void onLogout()
    return
  }
  if (target === 'menu') {
    state.menuOpen = true
    applyMenuState()
    return
  }
  state.selectedClient = null
  state.route = 'home'
  render()
  window.scrollTo({ top: 0 })
}

function syncOptionState(selector: string, attribute: string, value: string): void {
  document.querySelectorAll<HTMLButtonElement>(selector).forEach((button) => {
    const active = button.dataset[attribute] === value
    button.classList.toggle('active', active)
    if (active) button.setAttribute('aria-current', 'true')
    else button.removeAttribute('aria-current')
  })
}

function bindHomeControls(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-iconbar]').forEach((button) => button.addEventListener('click', () => onIconbar(button.dataset.iconbar ?? '')))
  bindShortcuts()
}

function bindShortcuts(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-status]').forEach((button) => button.addEventListener('click', () => {
    const next = button.dataset.status
    state.statusFilter = next === 'pending' || next === 'attended' ? next : 'all'
    syncOptionState('[data-status]', 'status', state.statusFilter)
    renderResults()
  }))
}

function renderResults(message = ''): void {
  const container = document.querySelector<HTMLElement>('#home-results')
  if (!container) return
  container.innerHTML = resultsTemplate(message)
  bindClientCards()
  bindShortcuts()
}

function bannerTemplate(slides: BannerSlide[], active: number): string {
  const items = slides.map((slide, index) =>
    `<div class="slide${index === active ? ' active' : ''}" role="group" aria-roledescription="slide" aria-label="${index + 1} de ${slides.length}"${index === active ? '' : ' hidden'}><img src="${slide.src}" alt="${escapeHtml(slide.alt)}" loading="${index === active ? 'eager' : 'lazy'}" /></div>`
  ).join('')
  const dots = slides.map((_, index) =>
    `<button class="dot${index === active ? ' active' : ''}" data-slide="${index}" type="button" aria-label="Ir para aviso ${index + 1}"${index === active ? ' aria-current="true"' : ''}></button>`
  ).join('')
  return `<section class="banner" id="banner" aria-roledescription="carousel" aria-label="Avisos" aria-live="off"><div class="banner-viewport">${items}</div><button class="banner-nav" data-banner="prev" type="button" aria-label="Aviso anterior">‹</button><button class="banner-nav" data-banner="next" type="button" aria-label="Próximo aviso">›</button><div class="dots">${dots}</div></section>`
}

function setBannerSlide(index: number): void {
  const banner = document.querySelector<HTMLElement>('#banner')
  if (!banner) return
  const slides = banner.querySelectorAll<HTMLElement>('.slide')
  if (slides.length === 0) return
  bannerIndex = (index + slides.length) % slides.length
  slides.forEach((slide, position) => {
    const active = position === bannerIndex
    slide.classList.toggle('active', active)
    if (active) slide.removeAttribute('hidden')
    else slide.setAttribute('hidden', '')
  })
  banner.querySelectorAll<HTMLButtonElement>('.dot').forEach((dot, position) => {
    const active = position === bannerIndex
    dot.classList.toggle('active', active)
    if (active) dot.setAttribute('aria-current', 'true')
    else dot.removeAttribute('aria-current')
  })
}

function stopBanner(): void {
  if (bannerTimer !== undefined) {
    window.clearInterval(bannerTimer)
    bannerTimer = undefined
  }
}

function startBanner(): void {
  stopBanner()
  const banner = document.querySelector<HTMLElement>('#banner')
  if (!banner) return
  const total = banner.querySelectorAll('.slide').length
  if (total < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const pause = (): void => stopBanner()
  const resume = (): void => {
    if (bannerTimer === undefined) bannerTimer = window.setInterval(() => setBannerSlide(bannerIndex + 1), 6000)
  }
  banner.addEventListener('mouseenter', pause)
  banner.addEventListener('mouseleave', resume)
  banner.addEventListener('focusin', pause)
  banner.addEventListener('focusout', resume)
  resume()
}

function bindBanner(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-banner]').forEach((button) => button.addEventListener('click', () => {
    stopBanner()
    setBannerSlide(bannerIndex + (button.dataset.banner === 'next' ? 1 : -1))
    startBanner()
  }))
  document.querySelectorAll<HTMLButtonElement>('.dot').forEach((dot) => dot.addEventListener('click', () => {
    stopBanner()
    setBannerSlide(Number(dot.dataset.slide ?? '0'))
    startBanner()
  }))
}

function toggleMenu(): void {
  state.menuOpen = !state.menuOpen
  applyMenuState()
}

function closeMenu(): void {
  if (!state.menuOpen) return
  state.menuOpen = false
  applyMenuState()
}

function applyMenuState(): void {
  document.querySelector<HTMLElement>('#app-menu')?.classList.toggle('open', state.menuOpen)
  document.querySelector<HTMLDivElement>('#scrim')?.classList.toggle('visible', state.menuOpen)
  document.querySelector<HTMLButtonElement>('#menu-toggle')?.setAttribute('aria-expanded', state.menuOpen ? 'true' : 'false')
}

function onNavigate(target: string): void {
  if (target === 'logout') {
    void onLogout()
    return
  }
  if (target === 'new-client') {
    state.selectedClient = null
    state.route = 'home'
    state.menuOpen = false
    state.newClient = emptyNewClient()
    render()
    document.querySelector<HTMLInputElement>('#new-client-name')?.focus()
    return
  }
  if (target === 'profile' || target === 'precos' || target === 'contrato' || target === 'documentos' || target === 'ocorrencias') {
    state.selectedClient = null
    state.route = target
    state.menuOpen = false
    render()
    return
  }
  state.selectedClient = null
  state.route = 'home'
  state.menuOpen = false
  render()
}

function currentAction(distributorId: string, clientId: string): AttendanceRecord | null {
  try {
    const raw = localStorage.getItem(`treali:attendance:${distributorId}:${clientId}`)
    return raw ? JSON.parse(raw) as AttendanceRecord : null
  } catch {
    return null
  }
}

function filteredClients(): Client[] {
  if (!state.session) return []
  return state.clients.filter((client) => {
    const action = currentAction(state.session?.distributorId ?? '', client.id)
    if (state.statusFilter === 'attended' && !action) return false
    if (state.statusFilter === 'pending' && action) return false
    return true
  })
}

function clientCard(client: Client): string {
  const action = state.session ? currentAction(state.session.distributorId, client.id) : null
  const badge = action ? `<em class="badge done">${escapeHtml(action.action)}</em>` : '<em class="badge todo">Sem atendimento</em>'
  const origin = client.origin === 'manual' ? '<em class="badge manual">Cadastro manual</em>' : ''
  return `<button class="client-card" data-client-id="${escapeHtml(client.id)}" type="button"><span class="client-icon" aria-hidden="true">${escapeHtml(client.name.slice(0, 1).toUpperCase())}</span><span><strong>${escapeHtml(client.name)}</strong><small>${escapeHtml(client.category)}</small><small>${escapeHtml(client.address ?? 'Endereço não informado')}</small>${badge}${origin}</span><span aria-hidden="true">›</span></button>`
}

function walletProgress(): { total: number; attended: number; buyers: number } {
  const distributorId = state.session?.distributorId ?? ''
  let attended = 0
  let buyers = 0
  for (const client of state.clients) {
    const action = currentAction(distributorId, client.id)?.action
    if (!action) continue
    attended += 1
    if (action === 'Eu já atendo' || action === 'Cliente Novo Atendido') buyers += 1
  }
  return { total: state.clients.length, attended, buyers }
}

function progressTemplate(): string {
  const { total, attended, buyers } = walletProgress()
  const totalPct = total === 0 ? 0 : Math.round((attended / total) * 100)
  const salesPct = total === 0 ? 0 : Math.round((buyers / total) * 100)
  const bar = (label: string, value: number, pct: number, detail: string) =>
    `<div class="bar-row"><div class="bar-head"><strong>${label}</strong><span>${value}/${total} · ${pct}%</span></div><div class="track" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><div class="fill" style="width:${pct}%"></div></div><small>${detail}</small></div>`
  return `<section class="progress-card" aria-label="Progresso da carteira">${bar('Total', attended, totalPct, 'clientes com atendimento registrado')}${bar('Vendas', buyers, salesPct, 'marcados como “Eu já atendo” ou “Cliente Novo Atendido”')}</section>`
}

function shortcutsTemplate(attended: number, pending: number): string {
  const item = (key: 'all' | 'pending' | 'attended', label: string, detail: string) =>
    `<button class="shortcut${state.statusFilter === key ? ' active' : ''}" data-status="${key}" type="button"${state.statusFilter === key ? ' aria-current="true"' : ''}><strong>${attended + pending === 0 && key !== 'all' ? '0' : key === 'all' ? state.clients.length : key === 'attended' ? attended : pending}</strong><span>${label}</span><small>${detail}</small></button>`
  return `<div class="shortcuts" role="group" aria-label="Atalhos da carteira">${item('all', 'Carteira', 'todos')}${item('pending', 'Sem atendimento', 'priorizar')}${item('attended', 'Atendidos', 'neste aparelho')}</div>`
}

function iconbarTemplate(): string {
  const item = (key: string, src: string, label: string) =>
    `<button class="iconbar-item" data-iconbar="${key}" type="button"><img src="${src}" alt="" width="56" height="56" loading="lazy" /><small>${label}</small></button>`
  return `<div class="iconbar" role="group" aria-label="Atalhos">${item('oferta', '/icons/icon-oferta.jpg', 'Oferta')}${item('pontos', '/icons/icon-pontos.jpg', 'Pontos')}${item('metas', '/icons/icon-metas.jpg', 'Metas')}${item('marketing', '/icons/icon-marketing.jpg', 'Marketing')}</div>`
}

function onIconbar(target: string): void {
  if (target === 'oferta' || target === 'marketing') {
    const banner = document.querySelector<HTMLElement>('#banner')
    if (banner) {
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      banner.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'nearest' })
    }
    return
  }
  if (target === 'pontos') {
    renderResults('Pontos estarão disponíveis na Área do Distribuidor — sem pontos fictícios por aqui.')
    return
  }
  if (target === 'metas') {
    renderResults('Metas estarão disponíveis na Área do Distribuidor.')
  }
}

function resultsTemplate(message: string): string {
  if (!state.session) return ''
  const results = filteredClients()
  const attended = state.clients.filter((client) => currentAction(state.session?.distributorId ?? '', client.id)).length
  const pending = state.clients.length - attended
  const cards = results.map(clientCard).join('')
  return `${shortcutsTemplate(attended, pending)}<p class="result-count" role="status">${results.length === 1 ? '1 cliente' : `${results.length} clientes`} · dados deste dispositivo</p><p class="message">${escapeHtml(message || state.storageError || '')}</p><div class="client-list">${cards || '<p>Nenhum cliente encontrado para os filtros atuais.</p>'}</div>`
}

function avatarInitials(label: string): string {
  return label.split(/\s+/).map((part) => part.slice(0, 1)).join('').slice(0, 2).toUpperCase()
}

function profileTemplate(): string {
  const session = state.session
  if (!session) return ''
  return `<section><button class="back" data-nav="home" type="button">← Voltar</button><p class="eyebrow">Perfil</p><div class="profile-card"><span class="avatar avatar-lg" aria-hidden="true">${escapeHtml(avatarInitials(session.label))}</span><h1>${escapeHtml(session.label)}</h1><p>📍 ${escapeHtml(session.cityId)}</p></div><dl><div><dt>Distribuidor</dt><dd>${escapeHtml(session.distributorId)}</dd></div><div><dt>Cidade</dt><dd>${escapeHtml(session.cityId)}</dd></div><div><dt>Código</dt><dd>${escapeHtml(session.slug)}</dd></div></dl><p class="message">Contexto resolvido pela sessão no servidor.</p></section>`
}

function infoTemplate(route: 'precos' | 'contrato' | 'documentos' | 'ocorrencias'): string {
  const copy = {
    precos: { title: 'Preços', text: 'A tabela de preços do distribuidor será publicada aqui após a definição comercial. Nenhum valor é exibido antes da aprovação.' },
    contrato: { title: 'Contrato', text: 'O contrato de distribuição ficará disponível aqui para consulta.' },
    documentos: { title: 'Documentos', text: 'Documentos operacionais — tabelas, comunicados e materiais — ficarão disponíveis aqui.' },
    ocorrencias: { title: 'Ocorrências', text: 'O canal para registrar ocorrências da operação — falta de produto, avaria, troca — ficará disponível aqui.' }
  }[route]
  return `<section><button class="back" data-nav="home" type="button">← Voltar</button><p class="eyebrow">${escapeHtml(copy.title)}</p><h1>${escapeHtml(copy.title)}</h1><p>${escapeHtml(copy.text)}</p></section>`
}

function newClientModalTemplate(): string {
  const draft = state.newClient ?? emptyNewClient()
  const errorFor = (field: 'name' | 'category' | 'address'): string =>
    draft.errors.find((error) => error.field === field)?.message ?? ''
  const field = (key: 'name' | 'category' | 'address' | 'phone', label: string, required: boolean): string => {
    const message = key === 'phone' ? '' : errorFor(key)
    return `<label>${label}${required ? ' *' : ''}<input id="new-client-${key}" name="${key}" value="${escapeHtml(draft[key])}" ${required ? 'required' : ''} autocomplete="off" ${message ? `aria-invalid="true" aria-describedby="err-new-client-${key}"` : ''} />${message ? `<p class="field-error" id="err-new-client-${key}">${escapeHtml(message)}</p>` : ''}</label>`
  }
  return `<div class="modal-backdrop" id="new-client-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="new-client-title"><h2 id="new-client-title">Cadastrar cliente</h2><p class="modal-sub">Salvo neste aparelho, visível só para o seu distribuidor.</p><form id="new-client-form" novalidate>${field('name', 'Nome', true)}${field('category', 'Categoria', true)}${field('address', 'Endereço', true)}${field('phone', 'Telefone', false)}${draft.saveError ? `<p class="field-error" role="alert">${escapeHtml(draft.saveError)}</p>` : ''}<div class="modal-actions"><button class="action" type="submit">Salvar</button><button class="text-button" id="new-client-cancel" type="button">Cancelar</button></div></form></div></div>`
}

function closeNewClient(): void {
  if (!state.newClient) return
  state.newClient = null
  render()
}

function onSaveNewClient(event: SubmitEvent): void {
  event.preventDefault()
  if (!state.session) return
  const form = event.currentTarget as HTMLFormElement
  const fields = new FormData(form)
  const draft = {
    name: String(fields.get('name') ?? ''),
    category: String(fields.get('category') ?? ''),
    address: String(fields.get('address') ?? ''),
    phone: String(fields.get('phone') ?? ''),
    errors: [] as NewClientError[],
    saveError: ''
  }
  draft.errors = validateNewClient(draft)
  if (draft.errors.length > 0) {
    state.newClient = draft
    render()
    document.querySelector<HTMLInputElement>('#new-client-name')?.focus()
    return
  }
  const storage = browserStorage()
  if (!storage) {
    state.newClient = { ...draft, saveError: 'Armazenamento local indisponível. Nada foi salvo.' }
    render()
    return
  }
  try {
    const created = createManualClient(draft, state.session.slug)
    const manual = loadManualClients(storage, state.session.slug)
    manual.push(created)
    saveManualClients(storage, state.session.slug, manual)
  } catch {
    state.newClient = { ...draft, saveError: 'Não foi possível salvar. Nada foi criado.' }
    render()
    return
  }
  state.newClient = null
  state.statusFilter = 'all'
  refreshClients(state.catalog)
  render('Cliente cadastrado neste aparelho.')
}

function detailTemplate(client: Client, message: string): string {
  const actions = ATTENDANCE_ACTIONS.map((action) => `<button class="action" data-action="${escapeHtml(action)}" type="button" ${state.storageError ? 'disabled' : ''}>${escapeHtml(action)}</button>`).join('')
  const latest = state.history[0]
  const history = state.history.length
    ? `<ol class="attendance-history">${state.history.map((record) => `<li><strong>${escapeHtml(record.action)}</strong><small>${escapeHtml(new Date(record.capturedAt).toLocaleString('pt-BR'))}</small></li>`).join('')}</ol>`
    : '<p>Nenhum atendimento registrado neste dispositivo.</p>'
  return `<section><button class="back" id="back" type="button">← Clientes</button><p class="eyebrow">Atendimento</p><h1>${escapeHtml(client.name)}</h1><p>${escapeHtml(client.category)}</p><dl><div><dt>Endereço</dt><dd>${escapeHtml(client.address ?? 'Não informado')}</dd></div><div><dt>Telefone</dt><dd>${escapeHtml(client.phone ?? 'Não informado')}</dd></div></dl><div class="actions"><h2>Registrar resultado</h2><p>${state.storageError ? escapeHtml(state.storageError) : 'O GPS será solicitado antes do registro.'}</p>${actions}</div><section class="history"><h2>Histórico neste dispositivo</h2>${latest ? `<p>Último: <strong>${escapeHtml(latest.action)}</strong></p>` : ''}${history}</section><p class="message" role="status">${escapeHtml(message)}</p></section>`
}

function bindClientCards(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-client-id]').forEach((button) => button.addEventListener('click', () => {
    state.selectedClient = state.clients.find((client) => client.id === button.dataset.clientId) ?? null
    void loadHistory()
  }))
}

function bindViewEvents(): void {
  bindClientCards()
  document.querySelector<HTMLButtonElement>('#back')?.addEventListener('click', () => { state.selectedClient = null; render() })
  document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => button.addEventListener('click', () => void onAttendance(button.dataset.action ?? '')))
}

async function onLogin(event: SubmitEvent): Promise<void> {
  event.preventDefault()
  const form = event.currentTarget as HTMLFormElement
  const fields = new FormData(form)
  try {
    const response = await login(String(fields.get('login') ?? ''), String(fields.get('password') ?? ''))
    state.session = response.session
    state.route = 'home'
    state.statusFilter = 'all'
    state.menuOpen = false
    const catalog = await getClients()
    refreshClients(catalog.clients)
    state.storage = new AttendanceStorage()
    try {
      await state.storage.initialize()
    } catch (error) {
      state.storage = null
      state.storageError = error instanceof Error ? `${error.message} O registro de atendimento está bloqueado.` : 'SQLite local indisponível. O registro de atendimento está bloqueado.'
    }
    render()
  } catch (error) {
    render(error instanceof Error ? error.message : 'Não foi possível entrar.')
  }
}

async function onLogout(): Promise<void> {
  await logout().catch(() => undefined)
  state.session = null
  state.clients = []
  state.catalog = []
  state.newClient = null
  state.selectedClient = null
  state.storage = null
  state.storageError = null
  state.history = []
  state.menuOpen = false
  state.route = 'home'
  state.statusFilter = 'all'
  render()
}

async function onAttendance(actionValue: string): Promise<void> {
  if (!state.session || !state.selectedClient || !state.storage) return
  try {
    assertAttendanceAction(actionValue)
    render('Capturando localização…')
    const position = await capturePosition()
    const record = createAttendanceRecord({
      distributorId: state.session.distributorId,
      clientId: state.selectedClient.id,
      action: actionValue,
      ...position
    })
    const result = await state.storage.save(record)
    await loadHistory(result.warning ?? 'Atendimento registrado no dispositivo.')
  } catch (error) {
    render(error instanceof Error ? error.message : 'Não foi possível registrar o atendimento.')
  }
}

async function bootstrap(): Promise<void> {
  if ('serviceWorker' in navigator) {
    if (import.meta.env.PROD) {
      void navigator.serviceWorker.register('/service-worker.js')
    } else {
      void navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
    }
  }
  try {
    const response = await getSession()
    state.session = response.session
    state.clients = (await getClients()).clients
    refreshClients(state.clients)
    state.storage = new AttendanceStorage()
    try {
      await state.storage.initialize()
    } catch (error) {
      state.storage = null
      state.storageError = error instanceof Error ? `${error.message} O registro de atendimento está bloqueado.` : 'SQLite local indisponível. O registro de atendimento está bloqueado.'
    }
  } catch {
    state.session = null
  }
  render()
}

async function loadHistory(message = ''): Promise<void> {
  if (!state.session || !state.selectedClient || !state.storage) {
    state.history = []
    render(message)
    return
  }
  try {
    state.history = await state.storage.history(state.session.distributorId, state.selectedClient.id)
    render(message)
  } catch (error) {
    state.history = []
    render(error instanceof Error ? error.message : 'Não foi possível carregar o histórico.')
  }
}

void bootstrap()

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return
  if (state.newClient) closeNewClient()
  else closeMenu()
})
