# ADR-006 — Estrategia de tests (Jest + Playwright)

> **Status:** Active
> **Date:** 2026-04-25 (durante F0.4 del refactor)
> **Original:** DECISIONS.md §38 (parcial — la sección original no detallaba la estrategia; esta ADR la formaliza)
> **Domain:** foundation, quality

---

## Contexto

El proyecto se desarrolla mayoritariamente con asistencia de IA (Claude). El operador del proyecto no programa, por lo que **no puede revisar código línea a línea**. Su control de calidad depende de:

1. Salidas observables (UI, emails, datos en DB).
2. Validación automática (typecheck, lint, build).
3. Tests que verifiquen que los flujos críticos siguen funcionando tras cualquier cambio.

Sin estrategia de tests definida, cada feature nueva acumula riesgo silencioso. Con la elección equivocada, los tests se vuelven flaky o lentos y se desactivan.

---

## Opciones consideradas

### Para tests E2E

1. **Cypress.**
   - Pros: ecosistema grande, recording UI.
   - Contras: históricamente flaky en SPAs con WebSockets. Solo Chromium nativo. Adopción más lenta de Next 16 + React 19.

2. **(Elegida)** **Playwright.**
   - Pros: auto-wait integrado (menos flakes), multi-navegador (Chromium/Firefox/WebKit), tracing nativo, soporte oficial para Next.js, manejo nativo de WebSockets.
   - Contras: si el equipo viene de Cypress, requiere reaprender API.

3. **Tests E2E custom con puppeteer.**
   - Descartado: Playwright reemplazó a Puppeteer como estándar.

### Para tests unitarios

1. **Vitest.**
   - Pros: rápido, ESM-first.
   - Contras: NestJS por convención usa Jest; cambiar requiere reconfigurar la integración con `@nestjs/testing`.

2. **(Elegida)** **Jest** (ya viene con NestJS).
   - Pros: convención de NestJS, plugins maduros, soporta ts-jest.
   - Contras: más lento que Vitest en proyectos grandes.

### Para DB en tests E2E

1. **Mocks** del cliente Prisma.
   - Pros: rápido, sin infraestructura.
   - Contras: no captura bugs reales de SQL, transacciones, migraciones, FKs.

2. **(Elegida)** **Postgres real efímero** como service container en CI.
   - Pros: captura bugs reales (queries Prisma, transacciones, migraciones, FKs). 10s de startup es coste aceptable.
   - Contras: tests serializados en CI (workers: 1) por DB compartida.

---

## Decisión

Estrategia en 3 capas:

### Capa 1 — Validación estática (continua)
- **TypeScript estricto** (`tsc --noEmit`) en cada commit (Husky pre-push) y CI.
- **ESLint + Prettier** en cada commit (Husky pre-commit) con `lint-staged`.
- **Build** (`nest build`, `next build`) en CI bloqueante.

### Capa 2 — Tests unitarios (per módulo, cuando se justifique)
- Framework: **Jest** con `@nestjs/testing`.
- Foco: lógica pura (cálculos de IVA, prorrateo, validaciones de invariantes), funciones que merecen test sin necesidad de DB.
- **Estado actual:** sin tests unitarios escritos. Empezar por `BillingCalculatorService` (lógica pura, alto valor) cuando se priorice.

### Capa 3 — Tests E2E (flujos críticos)
- Framework: **Playwright** con browser: Chromium (Firefox + WebKit cuando suite estable).
- Stack en CI: Postgres + Redis + MailPit como service containers efímeros.
- Modo: `next start` (build previo); evita problemas de memoria con `next dev` en runners de CI.
- Localización: `tests/e2e/` en root del repo.
- Helpers reutilizables: `fixtures/auth.ts`, `fixtures/db.ts` (con `pg` directo, no Prisma client), `fixtures/mailpit.ts` (lectura de emails).
- Cobertura mínima: los **3 flujos críticos** que NUNCA pueden romperse silenciosamente:
  - Auth completo (registro → email verify → login).
  - Checkout admin (lista facturas + checkout multi-step).
  - Soporte (bandeja de tickets + panel de chats + nuevo ticket).

### Regla de oro

> **Cada cambio que introduzca una feature crítica nueva añade su test E2E ANTES del merge.** No hay merge de feature crítica sin test que la cubra.

---

## Consecuencias

- ✅ **Ganamos:**
  - Yasmin tiene control de calidad sin leer código: tests E2E le dicen si algo se rompió.
  - Bugs en queries Prisma se atrapan antes de producción (Postgres real).
  - Multi-navegador disponible cuando se active.
  - Tracing de Playwright permite debug post-mortem en CI.
- ⚠️ **Aceptamos:**
  - Tests E2E son lentos (~1-2 min en CI). Pero cubren los flujos que más importan.
  - Workers: 1 en CI por DB compartida. Si crece la suite, considerar schemas separados o paralelización con DBs distintas.
  - Mantener tests al día requiere disciplina al cambiar UI: si renombras un texto, romper test → corregir test.
- 🚪 **Cierra:**
  - **Mocks de DB en E2E** — descartado por filosofía. Los tests E2E prueban el sistema real.

---

## Cuándo revisar

- Si la suite E2E supera ~30 tests y tarda >10 min: paralelizar con schemas separados o test parallelization de Playwright.
- Si Vitest madura su integración con NestJS y aporta velocidad significativa: evaluar migración para tests unitarios.

---

## Referencias

- **Módulos afectados:** todos.
- **Reglas relacionadas:** ninguna directa, pero conecta con la **Definition of Done** (cada sprint cierra con tests E2E del flujo nuevo añadidos).
- **ADRs relacionados:** ADR-002 (stack backend), ADR-005 (stack frontend), ADR-007 (observabilidad).
- **Documentos:** [`docs/90-meta/e2e-tests.md`](../90-meta/e2e-tests.md), [`docs/90-meta/definition-of-done.md`](../90-meta/definition-of-done.md).
- **CI workflow:** [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).
