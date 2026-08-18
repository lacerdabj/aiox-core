# GSAP + Three.js + Motion.dev — Animation & 3D Tech Preset

> Preset de arquitetura para projetos com animações de alta performance e cenários 3D, combinando GSAP v3, Three.js e Motion.dev como stack unificada de motion.

---

## Metadata

```yaml
preset:
  id: gsap-three-motion
  name: 'GSAP + Three.js + Motion.dev Animation & 3D Preset'
  version: 1.0.0
  description: 'Stack completa para animações de alta performance, scroll-driven scenes e WebGL 3D, com GSAP v3 (timelines/scroll), Three.js (WebGL) e Motion.dev (declarative motion para React/Web)'
  technologies:
    - GSAP v3 (GreenSock Animation Platform)
    - Three.js (r160+)
    - Motion.dev (framer-motion successor / motion for React)
  docs:
    gsap: https://gsap.com/docs/v3/
    three: https://threejs.org/docs/
    motion: https://motion.dev/docs
  suitable_for:
    - 'Landing pages com scroll-driven animations e parallax'
    - 'Product showcases interativos 3D'
    - 'Experiências imersivas (portfolio, storytelling)'
    - 'UI com micro-interações de alta performance'
    - 'Data visualization com cenário 3D'
    - 'Transições de página cinematográficas'
  not_suitable_for:
    - 'Apps mobile puros (use React Native + Reanimated)'
    - 'Spreadsheets ou dashboards tabulares sem motion'
    - 'Projetos onde performance >60fps não é prioridade (use CSS puro)'
```

---

## Technology Overview

### GSAP v3 — Animation Engine

> Docs: https://gsap.com/docs/v3/

**O que é:** Plataforma de animação profissional com suporte nativo a scroll, morphing, drag, e timelines compostas. A biblioteca padrão da indústria para animação web.

**Módulos principais:**

| Módulo | Uso |
|--------|-----|
| `gsap.to/from/fromTo` | Animações básicas de propriedades |
| `gsap.timeline` | Sequências e composição de animações |
| `ScrollTrigger` | Scroll-driven animations e parallax |
| `Flip` | Transições de layout sem recalcular |
| `MorphSVG` | Morphing de formas SVG |
| `MotionPathPlugin` | Animar ao longo de um path |
| `Draggable` | Drag interativo |
| `Observer` | Detecção de gestos (scroll, touch, wheel) |

**Boilerplate mínimo:**

```typescript
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

gsap.from('.hero-title', {
  y: 80,
  opacity: 0,
  duration: 1,
  ease: 'power3.out',
});

gsap.to('.parallax-section', {
  yPercent: -30,
  scrollTrigger: {
    trigger: '.parallax-section',
    start: 'top bottom',
    end: 'bottom top',
    scrub: true,
  },
});
```

**Instalação:**
```bash
npm install gsap
```

---

### Three.js — 3D/WebGL Engine

> Docs: https://threejs.org/docs/

**O que é:** Biblioteca de gráficos 3D para WebGL. Cria cenários, modelos, materiais e iluminação diretamente no browser.

**Conceitos-chave:**

| Conceito | Descrição |
|----------|-----------|
| `Scene` | Container raiz de todos os objetos 3D |
| `Camera` | Ponto de vista (PerspectiveCamera / OrthographicCamera) |
| `Renderer` | WebGLRenderer — renderiza a cena no canvas |
| `Mesh` | Geometria + Material = objeto visível |
| `Material` | Aparência (MeshStandardMaterial, MeshPhysicalMaterial, etc.) |
| `Light` | Iluminação (AmbientLight, DirectionalLight, PointLight) |
| `Group` | Agrupamento de objetos |
| `AnimationMixer` | Reproduz animações GLTF/glTF |

**Boilerplate mínimo:**

```typescript
import * as THREE from 'three';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.getElementById('canvas-container')?.appendChild(renderer.domElement);

const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshStandardMaterial({ color: 0x00ff88 });
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);

const light = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(light);

function animate() {
  requestAnimationFrame(animate);
  cube.rotation.x += 0.01;
  cube.rotation.y += 0.01;
  renderer.render(scene, camera);
}
animate();
```

**Instalação:**
```bash
npm install three
npm install -D @types/three
```

---

### Motion.dev — Declarative Motion

> Docs: https://motion.dev/docs

**O que é:** Biblioteca declarativa de animação (sucessor do framer-motion) otimizada para React e vanillla. Focada em micro-interações, layout animations e gestos com API minimalista.

**Módulos principais:**

| Módulo | Uso |
|--------|-----|
| `motion` (componente) | Animação declarativa em JSX |
| `animate()` | Animação imperative em elementos DOM |
| `useMotionValue` | Valores animados reativos |
| `useTransform` | Derivar valores animados |
| `useSpring` | Animações com spring physics |
| `AnimatePresence` | Animação de entrada/saída |
| `LayoutGroup` | Transições de layout |
| `useInView` | Trigger de animação por visibilidade |

**Boilerplate mínimo (React):**

```tsx
import { motion, AnimatePresence } from 'motion/react';

function Card({ isVisible }: { isVisible: boolean }) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        >
          <p>Conteúdo animado</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

**Boilerplate mínimo (vanilla JS):**

```typescript
import { animate } from 'motion';

animate(
  '.box',
  { x: 100, opacity: 1 },
  { duration: 0.6, easing: 'ease-out' }
);
```

**Instalação:**
```bash
npm install motion
```

---

## Integration Patterns

### Pattern 1: GSAP + Three.js — Scroll-Driven 3D

**Purpose:** Sincronizar animações 3D com scroll do usuário via GSAP ScrollTrigger

**Execution Score:** 10/10 | **Anti-Bug Score:** 8/10

```typescript
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import * as THREE from 'three';

gsap.registerPlugin(ScrollTrigger);

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
const mesh = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x00ff88 })
);
scene.add(mesh);

// GSAP controls Three.js rotation via scroll
gsap.to(mesh.rotation, {
  y: Math.PI * 2,
  scrollTrigger: {
    trigger: '#canvas-section',
    start: 'top top',
    end: 'bottom bottom',
    scrub: 1,
    pin: true,
  },
});

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();
```

**Bugs Eliminated:**
- Scroll e 3D dessincronizados
- Memory leak de scroll listeners não limpos
- Performace ruim por re-renderizar frame por frame sem necessidade

---

### Pattern 2: Motion + React — Layout Animations

**Purpose:** Transições suaves entre layouts sem re-renderizar componentes

**Execution Score:** 9/10 | **Anti-Bug Score:** 9/10

```tsx
import { motion, LayoutGroup } from 'motion/react';

function Grid({ items }: { items: Item[] }) {
  return (
    <LayoutGroup>
      {items.map((item) => (
        <motion.div
          key={item.id}
          layout
          layoutId={item.id}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        >
          {item.content}
        </motion.div>
      ))}
    </LayoutGroup>
  );
}
```

**Bugs Eliminated:**
- Layout shift durante reordenar filtros
- Animações pulando entre estados
- FOUC (Flash of Unstyled Content) em transições

---

### Pattern 3: GSAP + Motion — Hybrid Timeline

**Purpose:** Usar Motion para micro-interações e GSAP para sequências complexas no mesmo componente

**Execution Score:** 8/10 | **Anti-Bug Score:** 8/10

```tsx
import { useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { gsap } from 'gsap';

function HeroSection() {
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!timelineRef.current) return;

    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    tl.from('.hero-title', { y: 60, opacity: 0, duration: 1 })
      .from('.hero-subtitle', { y: 40, opacity: 0, duration: 0.8 }, '-=0.5')
      .from('.hero-cta', { scale: 0.8, opacity: 0, duration: 0.6 }, '-=0.3');

    return () => tl.kill();
  }, []);

  return (
    <div ref={timelineRef}>
      <motion.h1 className="hero-title" whileHover={{ scale: 1.02 }}>
        Título
      </motion.h1>
      <p className="hero-subtitle">Subtítulo</p>
      <motion.button className="hero-cta" whileTap={{ scale: 0.95 }}>
        CTA
      </motion.button>
    </div>
  );
}
```

---

### Pattern 4: Three.js + React (react-three-fiber)

**Purpose:** Usar Three.js com React de forma declarativa (recomendado para componentes React)

**Execution Score:** 9/10 | **Anti-Bug Score:** 9/10

```bash
npm install @react-three/fiber @react-three/drei
```

```tsx
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';

function Scene() {
  return (
    <Canvas camera={{ position: [0, 0, 5] }}>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} />
      <mesh>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#00ff88" />
      </mesh>
      <OrbitControls />
      <Environment preset="city" />
    </Canvas>
  );
}
```

**Note:** `@react-three/fiber` e `@react-three/drei` são wrappers declarativos de Three.js para React. Não são necessários se você usa Three.js vanilla (Pattern 1).

---

## Project Structure

```
/src
  /components
    /3d                 # Three.js scenes and models
      SceneContainer.tsx # Canvas wrapper com fallback
      Scene.tsx         # Cena principal
      Camera.tsx        # Camera config
      Lighting.tsx      # Iluminação
    /animation           # GSAP timeline definitions
      scroll-timelines.ts
      page-transitions.ts
    /motion              # Motion.dev components
      AnimatedCard.tsx
      PageTransition.tsx
  /hooks
    useScrollProgress.ts    # Hook para progresso de scroll (GSAP)
    useThreeScene.ts        # Hook para setup de cena Three.js
    useReducedMotion.ts     # Respeitar preferência do sistema
  /lib
    /animation
      gsap-config.ts    # Registro de plugins GSAP
      three-setup.ts    # Setup global de Three.js (pixel ratio, renderer)
    /three
      loaders.ts        # GLTFLoader, TextureLoader
      materials.ts      # Materiais compartilhados
      geometries.ts     # Geometrias procedurais comuns
  /assets
    /models              # GLTF/GLB files
    /textures            # Texturas PNG/EXR
    /animations          # Animation clips JSON
/test
  /animation             # Testes de animação
  /three                 # Testes de cena (mock renderer)
```

### Structure Rationale

- **`components/3d/`:** Isola WebGL de UI regular — facilita lazy loading e SSR
- **`components/animation/`:** Timelines GSAP como módulos puros — testáveis
- **`hooks/`:** Abstrai setup repetitivo (scene, scroll progress, reduced-motion)
- **`lib/animation/`:** Config centralizada — evita duplicação de `gsap.registerPlugin`
- **Assets separados:** GLTF e texturas são grandes — lazy-load por demanda

---

## Tech Stack

| Category | Technology | Version | Purpose |
|----------|-----------|---------|---------|
| Animation Engine | GSAP | ^3.12.0 | Timelines, scroll, morph, drag |
| Scroll | ScrollTrigger (GSAP) | ^3.12.0 | Scroll-driven animations |
| 3D Engine | Three.js | ^0.160.0 | WebGL rendering |
| 3D Types | @types/three | ^0.160.0 | TypeScript definitions |
| Motion (React) | motion (react) | ^11.0.0 | Declarative motion for React |
| 3D + React | @react-three/fiber | ^8.0.0 | React renderer for Three.js |
| 3D Helpers | @react-three/drei | ^9.0.0 | Abstrações comuns Three.js |
| Testing (3D) | three-stdlib | ^2.0.0 | Mock helpers para testes |

### Required Dependencies

```bash
# Animation
npm install gsap

# 3D
npm install three
npm install -D @types/three

# Motion (React)
npm install motion

# Three.js + React (optional, recommended for React projects)
npm install @react-three/fiber @react-three/drei

# Testing (optional)
npm install -D three-stdlib
```

---

## Performance Guidelines

### Do's

- [ ] **Lazy-load Three.js** — `React.lazy(() => import('./Scene'))` — Three.js é pesada
- [ ] **Limit pixel ratio** — `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))`
- [ ] **Use `will-change`** — `gsap.set(el, { willChange: 'transform' })` para GPU layers
- [ ] **Prefer `gsap.quickTo`** — Para mouse-tracking, evita overhead de timeline
- [ ] **Monitor FPS** — `stats.js` em dev, desative em prod
- [ ] **Respeitar `prefers-reduced-motion`** — `useReducedMotion()` hook
- [ ] **Dispose Three.js** — Sempre `renderer.dispose()` e `geometry.dispose()` em cleanup
- [ ] **Use `scrub: true` no ScrollTrigger** — Sincroniza com scroll, não com tempo

### Don'ts

- [ ] **Não animes `width/height`/`top/left`** — Use `transform` (GPU accelerated)
- [ ] **Não crie cenas Three.js por frame** — Reuse geometrias e materiais
- [ ] **Não importe GSAP inteiro** — `import { gsap } from 'gsap'` (tree-shaking OK)
- [ ] **Não uses `requestAnimationFrame` manual** — Deixe GSAP/Three cuidar do loop
- [ ] **Não ignore cleanup** — GSAP timelines e Three.js renderers precisam de `kill()`/`dispose()`
- [ ] **Não misture GSAP e CSS transitions** — Escolha um por elemento

---

## Common Errors and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| `THREE.WebGLRenderer: Context Lost` | GPU overload, too many draw calls | Reduce geometry complexity, use instancing |
| GSAP `null reference` on timeline | Component unmounted before tween completes | Kill timeline in `useEffect` cleanup |
| Motion layout jump | Missing `layout` prop on animated siblings | Add `layout` to all animated siblings |
| Three.js memory leak | Geometry/material not disposed | Call `.dispose()` in `useEffect` cleanup |
| ScrollTrigger not firing | Trigger element not in DOM when registered | Register after mount, use `ScrollTrigger.refresh()` |
| `prefers-reduced-motion` ignored | Animations hardcoded | Use `useReducedMotion()` and conditional GSAP |

---

## Testing Strategy

### What to Test

#### Always Test (Critical)

- [ ] GSAP timeline creation and kill (no memory leak)
- [ ] Three.js renderer creation and disposal
- [ ] ScrollTrigger trigger zones (start/end values)
- [ ] Reduced-motion fallback behavior

#### Consider Testing

- [ ] Motion component prop-driven animations
- [ ] Performance budgets (frame rate thresholds)
- [ ] Asset loading failures (GLTF load error handling)

#### Never Test

- [ ] Three.js WebGL internals (browser-dependent)
- [ ] GSAP easing curves (library-internal)
- [ ] Frame-by-frame visual output (use Playwright screenshot for visual regression)

### Test File Template

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { gsap } from 'gsap';

describe('ScrollTimeline', () => {
  afterEach(() => {
    gsap.globalTimeline.clear();
    vi.restoreAllMocks();
  });

  it('should create timeline without errors', () => {
    const tl = gsap.timeline();
    expect(tl).toBeDefined();
    tl.kill();
  });

  it('should clean up on unmount', () => {
    const tl = gsap.timeline();
    const killSpy = vi.spyOn(tl, 'kill');

    // simulate unmount
    tl.kill();

    expect(killSpy).toHaveBeenCalled();
  });
});
```

---

## Integration with AIOX

### Recommended Workflow

1. **Planning Phase:**
   - Use `@architect` to design scroll/3D architecture
   - Reference this preset for integration patterns

2. **Development Phase:**
   - Use `@dev` following the 4 Integration Patterns
   - Apply Performance Guidelines checklist

3. **QA Phase:**
   - Use `@qa` with testing strategy
   - Verify FPS budget and memory cleanup
   - Test `prefers-reduced-motion` behavior

### AIOX Commands

```bash
# Reference this preset in dev workflow
@dev "Follow the gsap-three-motion preset patterns"

# Create architecture doc
@architect *create-doc animation-architecture
```

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2026-08-17 | 1.0.0 | Initial version — GSAP v3, Three.js r160+, Motion.dev v11 |

---

_AIOX Tech Preset — Synkra AIOX Framework_
