# STORY-ORION-TR.1: Foundation — Tech Preset GSAP + Three.js + Motion

## Metadata

| Campo | Valor |
|-------|-------|
| Story ID | ORION-TR.1 |
| Epic | ORION-TECH-RESOURCES |
| Status | **Draft** |
| Priority | P1 |
| Type | Framework (tech preset) |
| Agent | @sm (create) → @dev (implement) → @qa (validate) → @devops (push) |

## Objetivo

Registrar no núcleo **Orion** o tech preset `gsap-three-motion` — a combinação oficial de GSAP v3, Three.js e Motion.dev — com boilerplates mínimos fieis às docs oficiais, acionáveis via CLI (Constitution I — CLI First).

## Acceptance Criteria

### 1. Tech Preset Publicado

- [ ] `preset.id` é `gsap-three-motion` no arquivo `.aiox-core/data/tech-presets/gsap-three-motion.md`
- [ ] Metadata YAML inclui: `technologies`, `docs` (GSAP/Three/Motion), `suitable_for`, `not_suitable_for`
- [ ] Documentação referencia as 3 URLs oficiais como fonte de verdade (No Invention)
- [ ] Preset segue o formato do template `_template.md` e da convenção dos presets existentes (`nextjs-react.md`)

### 2. Boilerplates Mínimos Válidos

- [ ] Exemplo GSAP com `gsap.to`/`gsap.timeline` e plugin `ScrollTrigger` registrado
- [ ] Exemplo Three.js com `Scene`, `PerspectiveCamera`, `WebGLRenderer`, `Mesh` e loop `requestAnimationFrame`
- [ ] Exemplo Motion.dev com `motion` (React) e/ou `animate` (vanilla)
- [ ] Todo snippet usa apenas APIs confirmadas nas docs oficiais — **nenhuma API inventada**
- [ ] Comandos de instalação corretos (`npm install gsap`, `npm install three`, `npm install motion`)

### 3. Integration Patterns Documentados

- [ ] Pattern 1: GSAP + Three.js scroll-driven (ScrollTrigger controlando cena)
- [ ] Pattern 2: Motion + React layout animations
- [ ] Pattern 3: Hybrid GSAP + Motion timeline
- [ ] Pattern 4: Three.js + React via `@react-three/fiber` (opcional, notado como wrapper)
- [ ] Cada pattern tem Execution Score e Anti-Bug Score

### 4. Performance & Anti-Bugs

- [ ] Seção "Do's" lista: lazy-load Three.js, `setPixelRatio` limit, `will-change`, `prefers-reduced-motion`, dispose/cleanup
- [ ] Seção "Don'ts" lista: evitar animar `width/height/top/left`, evitar import inteiro de GSAP, evitar `requestAnimationFrame` manual
- [ ] Tabela "Common Errors and Solutions" cobre: context lost, memory leak, ScrollTrigger não disparando, reduced-motion
- [ ] Checklist de cleanup (`kill()` timelines, `dispose()` renderer) presente

### 5. Testability

- [ ] Template de teste para timeline lifecycle (criação + kill) incluído
- [ ] Estratégia de teste distingue "Always Test" / "Consider Testing" / "Never Test"
- [ ] Recomendações para teste visual (Playwright screenshot) e não testar internals WebGL/GSAP

### 6. Qualidade (Quality First)

- [ ] Arquivo markdown válido (sem quebras de heading, tabelas bem formadas)
- [ ] Nenhum link quebrado (todas as URLs oficiais verificáveis)
- [ ] `npm run lint` / `typecheck` / `test` — se aplicável ao repo, sem regressões (preset é markdown, não código)
- [ ] CodeRabbit sem issues CRITICAL

## File List

| Arquivo | Ação |
|---------|------|
| `.aiox-core/data/tech-presets/gsap-three-motion.md` | CREATE |
| `.aiox-core/install-manifest.yaml` | UPDATE (+hash/size) |
| `packages/installer/src/wizard/questions.js` | UPDATE (+preset choice) |
| `.aiox-core/cli/commands/preset/index.js` | CREATE |
| `.aiox-core/cli/index.js` | UPDATE (+preset command) |
| `bin/aiox.js` | UPDATE (+preset case + help) |
| `.claude/skills/orion-motion/SKILL.md` | CREATE (auto-detecção motion/3D) |
| `docs/framework/epics/orion-tech-resources/EPIC-ORION-TECH-RESOURCES.md` | CREATE |
| `docs/framework/epics/orion-tech-resources/STORY-ORION-TR.1-FOUNDATION-TECH-PRESET.md` | CREATE |

## Notas de Implementação

- **Constitutional Gate (No Invention):** cada boilerplate deve refletir APIs reais de `gsap.com/docs/v3/`, `threejs.org/docs/` e `motion.dev/docs`. Se houver dúvida sobre uma API, referenciar a doc oficial em vez de adivinhar.
- **CLI First:** o preset é o artefato base; a exposição via CLI (`aiox preset show ...`) é um follow-up em story separada.
- **L4 vs L3:** este preset é L3 (framework data) — mutável como "exception", mas não deve alterar core L1.

## Status de Progresso

- [x] Tech preset criado (`.aiox-core/data/tech-presets/gsap-three-motion.md`)
- [x] Epic ORION-TECH-RESOURCES criada
- [x] Story base criada
- [x] Registro no install-manifest (hash + size)
- [x] Registro no wizard do installer (questions.js)
- [x] Comando CLI `aiox preset list|show` (CLI First — Constitution I)
- [x] Skill `orion-motion` — auto-detecção de motion/3D (`.claude/skills/orion-motion/`)
- [ ] Validação @po (10-point)
- [ ] QA gate
- [ ] Done

---

_Orion Tech Resources Story — Synkra AIOX Framework_
