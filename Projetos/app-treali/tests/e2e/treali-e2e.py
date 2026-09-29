"""E2E QA — Treali PWA (Stories 10 e 13).

Uso:
  1. Suba o dev server:  npm run dev
  2. Garanta o Chromium:  python3 -m playwright install chromium
  3. Rode:                npm run test:e2e

Variáveis opcionais: TREALI_E2E_BASE (padrão http://localhost:5173).
Requer as contas piloto no .env.local (ver README).
"""
import os
import sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get('TREALI_E2E_BASE', 'http://localhost:5173')
MURIAE = ('muriae@treali.local', 'treali-muriae-2026')
BARBACENA = ('barbacena@treali.local', 'treali-barbacena-2026')
CLIENT = ('Bar E2E QA', 'Bar', 'Rua E2E, 42')

results = []


def check(name, ok, detail=''):
    results.append((name, bool(ok), str(detail)))
    print(('PASS' if ok else 'FAIL'), '-', name, detail)


def login(page, email, password):
    page.goto(BASE)
    page.locator('#login-form input[name="login"]').fill(email)
    page.locator('#login-form input[name="password"]').fill(password)
    page.locator('#login-form button[type="submit"]').click()
    page.locator('#banner').wait_for(timeout=15000)


def logout(page):
    page.locator('[data-bottom="logout"]').click()
    page.locator('#login-form').wait_for(timeout=10000)


with sync_playwright() as p:
    browser = p.chromium.launch()

    # ---------- Contexto Muriaé (GPS permitido) ----------
    ctx = browser.new_context(
        permissions=['geolocation'],
        geolocation={'latitude': -21.13, 'longitude': -42.37},
    )
    page = ctx.new_page()
    try:
        login(page, *MURIAE)
        check('S13-01 login abre a home', True)
    except Exception as e:
        check('S13-01 login abre a home', False, repr(e)[:200])
        sys.exit(1)

    try:
        slides = page.locator('#banner .slide')
        check('S13-03 banner tem 4 pecas', slides.count() == 4, f'count={slides.count()}')
        check('S13-03 so 1 slide visivel', page.locator('#banner .slide.active').count() == 1)
        page.locator('[data-banner="next"]').click()
        page.locator('#banner .slide.active[aria-label="2 de 4"]').wait_for(timeout=5000)
        check('S13-03 seta avanca slide', True)
    except Exception as e:
        check('S13-03 banner slider', False, repr(e)[:200])

    try:
        check('S13-04 iconbar 4 icones', page.locator('.iconbar-item').count() == 4)
        page.locator('[data-iconbar="pontos"]').click()
        page.locator('#home-results').get_by_text('sem pontos fictícios').wait_for(timeout=5000)
        check('S13-04 Pontos sem numero ficticio', True)
    except Exception as e:
        check('S13-04 iconbar', False, repr(e)[:200])

    try:
        check('S13-05 barras Total/Vendas', page.locator('.progress-card [role="progressbar"]').count() == 2)
    except Exception as e:
        check('S13-05 barras de progresso', False, repr(e)[:200])

    try:
        page.locator('#menu-toggle').click()
        page.locator('#app-menu.open').wait_for(timeout=5000)
        items = page.locator('.drawer-item').all_text_contents()
        need = ['Carteira de clientes', 'Novo Cliente', 'Perfil', 'Preços', 'Contrato', 'Documentos', 'Ocorrências', 'Sair']
        check('S13-02 drawer com todos os links', all(n in items for n in need), '|'.join(items))
        page.keyboard.press('Escape')
        check('S13-02 Escape fecha drawer', page.locator('#app-menu.open').count() == 0)
    except Exception as e:
        check('S13-02 drawer', False, repr(e)[:200])

    try:
        page.locator('#menu-toggle').click()
        page.locator('[data-nav="profile"]').click()
        page.get_by_text('Contexto resolvido pela sessão').wait_for(timeout=5000)
        check('S13-08 rota Perfil com contexto da sessao', True)
        page.locator('.content [data-nav="home"]').click()
        page.locator('#banner').wait_for(timeout=5000)
    except Exception as e:
        check('S13-08 rota Perfil', False, repr(e)[:200])

    # ---------- Novo Cliente (Story 10) ----------
    try:
        page.locator('#menu-toggle').click()
        page.locator('[data-nav="new-client"]').click()
        page.locator('#new-client-form').wait_for(timeout=5000)
        check('S10-AC1 menu abre o formulario', True)
        page.locator('#new-client-form button[type="submit"]').click()
        errs = page.locator('.field-error')
        check('S10-AC3 bloqueia envio vazio', errs.count() >= 3 and page.locator('#new-client-form').count() == 1,
              f'errors={errs.count()}')
        page.locator('#new-client-name').fill(CLIENT[0])
        page.locator('#new-client-category').fill(CLIENT[1])
        page.locator('#new-client-address').fill(CLIENT[2])
        page.locator('#new-client-form button[type="submit"]').click()
        page.get_by_text('Cliente cadastrado neste aparelho.').wait_for(timeout=5000)
        card = page.locator('.client-card', has_text=CLIENT[0])
        check('S10-AC5 cliente aparece na lista', card.count() == 1)
        check('S10-AC4 badge Cadastro manual', 'Cadastro manual' in (card.first.text_content() or ''))
    except Exception as e:
        check('S10 cadastro', False, repr(e)[:200])

    try:
        page.reload()
        page.locator('.client-card', has_text=CLIENT[0]).first.wait_for(timeout=15000)
        check('S10-AC6 persiste apos recarga', True)
    except Exception as e:
        check('S10-AC6 persiste apos recarga', False, repr(e)[:200])

    try:
        page.locator('.client-card', has_text=CLIENT[0]).first.click()
        page.locator('.actions [data-action]').first.wait_for(timeout=5000)
        n_actions = page.locator('.actions [data-action]').count()
        check('S10-AC9 detalhe com 4 acoes', n_actions == 4, f'count={n_actions}')
    except Exception as e:
        check('S10-AC9 detalhe do manual', False, repr(e)[:200])

    sqlite_ok = 'indisponível' not in (page.locator('.actions p').first.text_content() or '')
    try:
        if not sqlite_ok:
            raise RuntimeError('SQLite/OPFS bloqueado neste navegador headless')
        page.locator('[data-action="Eu já atendo"]').click()
        page.get_by_text('Atendimento registrado no dispositivo.', exact=True).wait_for(timeout=25000)
        page.locator('.attendance-history li').first.wait_for(timeout=10000)
        check('S10-AC9/GPS registra com GPS permitido', page.locator('.attendance-history li').count() >= 1)
    except Exception as e:
        check('S10-AC9/GPS registra com GPS permitido', False, repr(e)[:200])

    try:
        page.locator('#menu-toggle').click()
        page.locator('[data-nav="precos"]').click()
        page.get_by_text('será publicada aqui').wait_for(timeout=5000)
        check('S13-09 rota Precos honesta', True)
        page.locator('.content [data-nav="home"]').click()
        page.locator('#menu-toggle').click()
        page.locator('[data-nav="ocorrencias"]').click()
        page.get_by_text('ficará disponível aqui').wait_for(timeout=5000)
        check('S13-09 rota Ocorrencias honesta', True)
        page.locator('.content [data-nav="home"]').click()
        page.locator('#banner').wait_for(timeout=5000)
    except Exception as e:
        check('S13-09 rotas informativas', False, repr(e)[:200])

    try:
        page.locator('[data-status="attended"]').click()
        page.locator('#home-results').get_by_text('dados deste dispositivo').first.wait_for(timeout=5000)
        count_text = page.locator('.result-count').first.text_content() or ''
        page.locator('[data-status="all"]').click()
        check('S13-06 filtros Carteira/Atendidos', 'cliente' in count_text, count_text[:80])
    except Exception as e:
        check('S13-06 filtros', False, repr(e)[:200])

    try:
        page.locator('.client-card').first.click()
        page.locator('.actions').wait_for(timeout=5000)
        page.locator('[data-bottom="home"]').click()
        page.locator('#banner').wait_for(timeout=5000)
        check('S13-07 bottom Início volta à home', True)
        page.evaluate('window.scrollTo(0, 2000)')
        page.wait_for_timeout(500)
        sticky = page.evaluate("""() => {
            const h = document.querySelector('.topbar');
            const cs = getComputedStyle(h);
            const r = h.getBoundingClientRect();
            return cs.position + '|' + Math.round(r.top);
        }""")
        check('S13-01 header acompanha a rolagem', sticky == 'sticky|0', sticky)
        page.evaluate('window.scrollTo(0, 0)')
    except Exception as e:
        check('S13-07/01 bottom+sticky', False, repr(e)[:200])

    try:
        logout(page)
        check('logout volta ao login', True)
    except Exception as e:
        check('logout volta ao login', False, repr(e)[:200])
    ctx.close()

    # ---------- GPS negado ----------
    ctx2 = browser.new_context()  # sem permissao de geolocalizacao
    denied = ctx2.new_page()
    try:
        login(denied, *MURIAE)
        denied.locator('.client-card').first.click()
        denied.locator('.actions [data-action]').first.wait_for(timeout=5000)
        denied.locator('[data-action="Eu já atendo"]').click()
        denied.get_by_text('Autorize o GPS').wait_for(timeout=25000)
        check('GPS negado bloqueia sem registro', denied.locator('.attendance-history li').count() == 0)
    except Exception as e:
        check('GPS negado bloqueia sem registro', False, repr(e)[:200])
    ctx2.close()

    # ---------- Isolamento Barbacena ----------
    ctx3 = browser.new_context()
    bpage = ctx3.new_page()
    try:
        login(bpage, *BARBACENA)
        names = bpage.locator('.client-card').all_text_contents()
        check('S10-AC7 isolamento entre distribuidores',
              not any(CLIENT[0] in n for n in names) and len(names) >= 1,
              f'cards={len(names)}')
    except Exception as e:
        check('S10-AC7 isolamento entre distribuidores', False, repr(e)[:200])
    ctx3.close()
    browser.close()

fails = [r for r in results if not r[1]]
print(f'\nTOTAL {len(results)} | PASS {len(results) - len(fails)} | FAIL {len(fails)}')
sys.exit(1 if fails else 0)
