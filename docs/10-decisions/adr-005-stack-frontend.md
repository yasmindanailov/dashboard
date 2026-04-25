# ADR-005 — Stack tecnológico frontend

> **Status:** Active
> **Date:** 2026-04 (origen) · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §2 + §39 (parcial)
> **Domain:** foundation, ui

---

## Contexto

El frontend del dashboard tiene cargas muy distintas:

- **Páginas data-density** estilo Stripe Dashboard (listados de facturas, clientes, conversaciones).
- **WebSocket realtime** en el panel de soporte.
- **Formularios complejos** de checkout multi-step y configuración de producto.
- **Auth flow** con 2FA, verificación de email, reset.
- **Modo cliente vs modo agente vs modo admin** sobre la misma codebase con role-aware sidebar y data isolation.
- **Embeddable widgets** (ChatWidget) que también deben funcionar en la landing sin tokens del dashboard.

La elección debe permitir SSR/SSG para SEO (cuando se integre con landing), tipado end-to-end con backend, y que un equipo pequeño + IA sostenga la app.

---

## Opciones consideradas

1. **React + Vite SPA** sin SSR.
   - Pros: simple, rápido en dev.
   - Contras: SEO limitado. La integración con landing requeriría duplicar pieces.

2. **Remix**.
   - Pros: SSR + data loaders. Patrón nested routes.
   - Contras: ecosistema más pequeño que Next. Menor adopción de IA copilots con Remix vs Next.

3. **(Elegida)** **Next.js 16 (App Router) + React 19 + TypeScript estricto + CSS Modules + Tailwind 4 (tokens) + DM Sans.**
   - Pros: SSR/SSG/ISR cuando se necesite. App Router con Server Components. Ecosystem maduro. Compatible con Vercel y self-hosted. IA copilots conocen Next muy bien.
   - Contras: capa significativa de abstracción. Breaking changes entre versiones (Next 15 → 16) requieren atención.

---

## Decisión

Stack frontend de Aelium Dashboard:

| Capa | Elección | Razón |
|------|----------|-------|
| Framework | **Next.js 16** (App Router) | SSR/SSG, Server Components, file-based routing |
| UI | **React 19** | Concurrent features, Server Components |
| Lenguaje | **TypeScript** estricto | Tipado end-to-end con backend |
| Estilos | **CSS Modules** + **Tailwind 4** vía tokens.css | Cero hex hardcoded (D1, D6); tokens centrales (`--space-*`, `--brand`); CSS Modules para scoping |
| Tipografía | **DM Sans** 400/500/600 | Marca Aelium |
| Animation | **Framer Motion** | Micro-interactions auth + transiciones |
| Realtime | **Socket.io-client** | Match con backend (ADR-002) |
| Iconos | **Lucide React** SVG | Sin emojis (D1) |
| Testing E2E | **Playwright** | Mejor para Next 16 + WebSockets (ADR-006) |
| Observabilidad | **@sentry/nextjs** | Match con backend Sentry |

### Decisiones derivadas

- **`tokens.css`** como única fuente de variables visuales. Cambiar look = editar este archivo (R16).
- **`components/ui/`** como librería interna obligatoria para toda UI nueva (R16). No se crean componentes ad hoc en páginas.
- **Layouts canónicos** para páginas: 6 tipos definidos (Overview, List, Detail, Form, Workspace, Settings) — D10.
- **No emojis** (D1). StatusDot + iconos SVG.
- **Excepción documentada:** `ChatWidget/` usa CSS Modules con tokens locales `--cw-*` que cascadean del dashboard pero funcionan sin él. Permite embebido en landing.

---

## Consecuencias

- ✅ **Ganamos:**
  - SSR habilitado para futuras páginas públicas (landing integration, ADR-058).
  - Server Components reducen JS al cliente.
  - TypeScript end-to-end con backend permite compartir tipos cuando interesa.
  - Tokens CSS centralizan rebrand: cambiar marca = editar tokens.css.
- ⚠️ **Aceptamos:**
  - Next.js 16 es bleeding edge. Breaking changes entre versiones requieren tiempo de adaptación.
  - Los tests E2E corren con Next en modo `start` (build previo) — `next dev` causó out-of-memory en CI por workspace lookup confusion. Documentado en [`docs/90-meta/e2e-tests.md`](../90-meta/e2e-tests.md).
  - SSR + tokens CSS implica que el primer paint puede mostrar valores default antes de hidratarse. Aceptable para dashboard interno.
- 🚪 **Cierra:**
  - **No SPA pura sin SSR.** Si se vuelve necesario más adelante, requiere ADR nuevo.
  - **No Tailwind clases inline en JSX como sistema principal.** Tailwind 4 vive bajo CSS Modules + `@theme` para tokens, no como utility-first.

---

## Cuándo revisar

- Si Next.js 17 introduce breaking changes que rompen App Router como lo conocemos hoy.
- Si la separación dashboard ↔ landing se vuelve insostenible y se decide unificar (ahora son dos proyectos separados).
- Si el rendimiento de SSR en producción se vuelve cuello de botella (más probable en endpoints cliente con muchos servicios renderizados).

---

## Referencias

- **Módulos afectados:** todos los del frontend.
- **Reglas relacionadas:** R5 (no lógica en frontend), R14 (errores visibles), R16 (Design System), D1 (sin emojis), D6 (spacing 4px), D10 (layouts canónicos).
- **ADRs relacionados:** ADR-002 (stack backend), ADR-006 (tests), ADR-007 (observabilidad), ADR-058 (integración landing), ADR-059 (auth layout).
- **Glosario:** [Design System](../00-foundations/glossary.md), [Tokens](../00-foundations/glossary.md), [StatusDot](../00-foundations/glossary.md).
- **Versiones exactas:** `frontend/package.json`.
