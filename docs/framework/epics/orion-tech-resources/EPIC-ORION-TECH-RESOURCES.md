# Epic ORION-TECH-RESOURCES: Animation & 3D Stack Integration

## Metadata

| Campo | Valor |
|-------|-------|
| Epic ID | ORION-TECH-RESOURCES |
| Status | **DRAFT** — acceptance criteria em validação |
| Priority | P1 |
| Branch base | `main` |
| Working branch | `feat/orion-tech-resources-epic` |
| **Canonical path (public OSS)** | `docs/framework/epics/orion-tech-resources/` |
| Target package | `@aiox-squads/core` (open source) |
| Tech preset | `.aiox-core/data/tech-presets/gsap-three-motion.md` |

## Objetivo

Registrar no núcleo **Orion** o suporte oficial às três stacks de animação/3D mais usadas no ecossistema web moderno, disponibilizando **tech preset**, **boilerplates CLI-first** e **story base** para que qualquer projeto consuma esses recursos sem re-descobrir arquitetura.

**Promessa MVP (headline):** instalar o preset `gsap-three-motion` → receber snippets/boilerplates válidos via CLI → implementar animações 3D e scroll-driven com padrões consistentes, testáveis e performáticos.

## Tecnologias Registradas

| Stack | Versão | Docs Oficiais | Papel |
|-------|--------|---------------|-------|
| **GSAP v3** | ^3.12 | https://gsap.com/docs/v3/ | Animation engine (timelines, scroll, morph, drag) |
| **Three.js** | r160+ | https://threejs.org/docs/ | WebGL/3D rendering |
| **Motion.dev** | v11 | https://motion.dev/docs | Declarative motion (React/Web) |

## Princípios (Constitution)

| Artigo | Aplicação |
|--------|-----------|
| **I — CLI First** | Todo recurso DEVE ser acionável via CLI (preset, snippet generator). Nenhuma UI é requisito. |
| **III — Story-Driven** | Integração rastreada via story com acceptance criteria. |
| **IV — No Invention** | Boilerplates DEVM reference apenas APIs confirmadas nas docs oficiais (links acima). |
| **V — Quality First** | Lint/typecheck/test/build devem passar; testabilidade dos patterns obrigatória. |

## Escopo (MVP)

### Wave 0 — Foundation

- [x] Tech preset `gsap-three-motion` em `.aiox-core/data/tech-presets/`
- [x] Story base de integração com acceptance criteria (checkboxes)
- [x] Registro no install-manifest (`install-manifest.yaml` + hash/size)
- [x] Registro no wizard do installer (lista de presets)
- [x] Comando CLI `aiox preset list|show` (`.aiox-core/cli/commands/preset/`)
- [x] Skill `orion-motion` (auto-detecção de motion/3D ao criar páginas)

### Wave 1 — Boilerplates (só se o repo tiver estrutura de templates)

- [ ] Snippet `gsap-timeline` (scroll + parallax)
- [ ] Snippet `three-scene` (cena mínima WebGL)
- [ ] Snippet `motion-react-card` (animação declarativa)
- [ ] Snippet `hybrid-gsap-motion` (timeline composta)

### Wave 2 — Testing & Validation

- [ ] Testes unitários de patterns (timeline lifecycle, cleanup)
- [ ] Checklist `prefers-reduced-motion`
- [ ] Performance budget (FPS) documentado

## Fora de Escopo (Non-Goals)

- ❌ UI/componentes prontos para instalar (isso é L4 project, não framework)
- ❌ Wrapper completo de Three.js para React (`react-three-fiber` mencionado como nota, não como dependência obrigatória)
- ❌ Substituir nenhum framework de animação existente — adicionar, não trocar
- ❌ Qualquer recurso que dependa de versões não estáveis

## Revisões

| Date | Method | Verdict |
|------|--------|---------|
| — | Pendente | — |

## Contexto

| Item | Detalhe |
|------|---------|
| Solicitante | Orion (session) — "quero ter todos esses recursos em nosso cor Orion" |
| Data | 2026-08-17 |
| Referência de docs | GSAP v3, Three.js r160+, Motion.dev v11 |
| Tech preset criado | `.aiox-core/data/tech-presets/gsap-three-motion.md` |

## Próximos Passos

1. **@po** validar story base (10-point checklist)
2. **@sm** detalhar stories de boilerplates (Wave 1)
3. **@dev** implementar snippets/templates
4. **@qa** validar testes e performance
5. **@devops** push e release

---

_Orion Tech Resources Epic — Synkra AIOX Framework_
