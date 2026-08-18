---
name: orion-motion
description: |
  Orion Motion & 3D skill — automatic trigger when creating pages with animation, WebGL, 3D scenes, scroll effects, parallax, or motion.
  Loads gsap-three-motion tech preset with patterns, boilerplates, and performance rules.
  This skill should be used when a page, component, or feature involves GSAP, Three.js, motion, animation timelines, scroll-driven, 3D, WebGL, or interactive visual experiences.
---

# Orion — Motion & 3D Skill

Automatic context injection for animation/3D development. Loads the gsap-three-motion tech preset and applies correct patterns from first interaction.

## Activation Triggers

Activate this skill when ANY of these keywords are present in the request (case-insensitive):

- **Animation:** animation, animated, animate, timeline, gsap, tween, motion, transition, parallax, scroll-driven, scroll-trigger, morphing, easing
- **3D:** three, threejs, three.js, threejs, webgl, 3d, scene, camera, renderer, geometry, mesh, gltf, glb
- **Scroll effects:** scroll animation, scroll parallax, scroll reveal, sticky section, horizontal scroll
- **Motion:** motion.dev, framer-motion, motion react, micro-interaction, layout animation
- **Interactive:** interactive visual, interactive landing, product showcase 3d, portfolio 3d

**Do NOT activate** when:
- Only CSS transitions/animations are requested (keep it simple)
- Charts/data-viz using D3/Chart.js without 3D
- SVG animation only (no GSAP/Three needed)

---

## Auto-Load Protocol

When this skill activates, IMMEDIATELY:

### 1. Read the tech preset (reference)

```
Read .aiox-core/data/tech-presets/gsap-three-motion.md
```

This file contains the complete patterns, boilerplates, performance rules and test strategy.

### 2. Detect technology scope

Determine which technologies are relevant from the user's request:

| User mentions | Activate |
|---------------|----------|
| GSAP, timeline, ScrollTrigger, parallax, animation timeline | **GSAP** |
| Three.js, 3D, WebGL, scene, renderer, mesh, GLTF | **Three.js** |
| Motion, motion.react, layout animation, micro-interaction | **Motion** |
| Multiple of the above | **Hybrid** (use integration patterns) |

### 3. Inject the correct patterns

Based on detection, present ONLY the relevant section:

- GSAP → `gsap.to`, `ScrollTrigger`, `gsap.timeline`
- Three.js → `Scene`, `PerspectiveCamera`, `WebGLRenderer`
- Motion → `motion` component, `animate()`, `AnimatePresence`
- Hybrid → Integration Patterns 1-4 from preset

### 4. Offer boilerplate

Before writing any code, offer the matching boilerplate:

```
📦 Boilerplate detected — starting from [pattern name]:

[inline the boilerplate from the preset]

Confirm and I'll implement this, or tell me what to adjust.
```

---

## Performance Rules (Auto-Enforced)

When creating motion/3D code, enforce these rules WITHOUT being asked:

### MUST (Constitution V — Quality First)

- [ ] `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))` — limit pixel ratio
- [ ] Cleanup on unmount: `tl.kill()` for GSAP timelines, `renderer.dispose()` for Three.js
- [ ] Respect `prefers-reduced-motion` — conditional animation
- [ ] Use `transform` only (never animate `width`/`height`/`top`/`left`)
- [ ] Lazy-load Three.js scenes (`React.lazy` / dynamic import)

### MUST NOT (No Invention — Constitution IV)

- [ ] Never invent APIs — reference only confirmed docs (gsap.com/docs/v3/, threejs.org/docs/, motion.dev/docs)
- [ ] Never assume plugin availability — verify in GSAP plugin list
- [ ] Never hardcode camera positions without explaining the reasoning

---

## Response Template

When this skill is active, use this structure for the first response:

```markdown
## 🎬 Orion Motion — Detected: [technologies]

### Technology Scope
- [x] GSAP v3 — [reason]
- [x] Three.js — [reason]
- [ ] Motion.dev — [reason]

### Recommended Pattern
**Pattern [N]: [name]** — [one-line description]

> Execution Score: X/10 | Anti-Bug Score: X/10

### Boilerplate

\`\`\`[language]
[boilerplate from preset]
\`\`\`

### Next Steps
1. Confirm or adjust the pattern
2. I'll implement using the boilerplate + project structure from the preset
3. Performance checklist will be applied automatically

Reference: `.aiox-core/data/tech-presets/gsap-three-motion.md`
```

---

## Integration with AIOX Agents

| Agent | When this skill is active |
|-------|---------------------------|
| **@architect** | Uses preset for architecture decisions; recommends correct integration pattern |
| **@dev** | Follows boilerplate + coding standards from preset; enforces performance rules |
| **@qa** | Validates against preset test strategy; checks cleanup, reduced-motion, pixel ratio |

---

## Constraints

- This skill does NOT implement code — it only loads context and provides guidance
- This skill does NOT create files — redirects to @dev for implementation
- This skill does NOT modify existing code — only recommends patterns
- All code examples come from the tech preset, never invented
- If preset is missing or corrupted, report: "Tech preset not found. Run `aiox preset show gsap-three-motion` or reinstall AIOX."

---

## Source of Truth

Tech preset: `.aiox-core/data/tech-presets/gsap-three-motion.md`
Docs: https://gsap.com/docs/v3/ | https://threejs.org/docs/ | https://motion.dev/docs
Epic: `docs/framework/epics/orion-tech-resources/`
